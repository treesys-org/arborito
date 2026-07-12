/**
 * Core relay / pool / network primitives.
 *
 * Per-relay circuit breaker, query concurrency gate, the `_publish` /
 * `_query` / `_get` wrappers that every other mixin funnels through. The
 * constructor in `./index.js` is responsible for initialising the fields
 * these methods rely on (`this._pool`, `this._relayHealth`, `this._queryGate`,
 * `this._publishChain`, `this.peers`).
 */

import { hasGdprNetworkConsent } from '../../../privacy-gdpr/api/network-consent.js';
import { DEFAULT_NOSTR_RELAYS, normalizeNostrRelayUrls } from '../nostr-relays-runtime.js';
import { QUERY_MS, isNostrNetworkAvailable } from './_shared.js';

/** Per-relay publish budget (ms). Avoid waiting for every relay when one accepts. */
const RELAY_PUBLISH_TIMEOUT_MS = 10_000;
/** Best-effort mirror to other relays after a critical account event landed somewhere. */
const RELAY_MIRROR_TIMEOUT_MS = 6_000;

/**
 * Query each relay in parallel; return as soon as any relay yields an event
 * (newest `created_at` wins if several answer). Caps total wait at `ms` so one
 * dead relay cannot block the whole pool (SimplePool waits for every peer).
 * @param {import('./index.js').NostrClient} pool
 * @param {string[]} relays
 * @param {import('nostr-tools').Filter} filter
 * @param {number} ms
 * @returns {Promise<import('nostr-tools').Event|null>}
 */
function relayGetRace(pool, relays, filter, ms) {
    return new Promise((resolve) => {
        let best = null;
        let settled = 0;
        const n = relays.length;
        if (!n) {
            resolve(null);
            return;
        }
        const finish = (value) => {
            clearTimeout(deadline);
            resolve(value);
        };
        const deadline = setTimeout(() => finish(best), ms);
        const consider = (ev) => {
            if (ev && (!best || ev.created_at > best.created_at)) best = ev;
        };
        const step = () => {
            settled++;
            if (best) {
                finish(best);
                return;
            }
            if (settled >= n) finish(null);
        };
        for (const relay of relays) {
            pool
                .get([relay], filter, { maxWait: ms })
                .then((ev) => {
                    consider(ev);
                    step();
                })
                .catch(() => step());
        }
    });
}

/**
 * Query each relay in parallel and merge unique events by id until every peer
 * has settled or the budget expires — faster than waiting for the slowest relay
 * in a single multi-relay subscribe.
 * @param {import('./index.js').NostrClient} pool
 * @param {string[]} relays
 * @param {import('nostr-tools').Filter} filter
 * @param {number} ms
 * @returns {Promise<import('nostr-tools').Event[]>}
 */
function relayQueryMerge(pool, relays, filter, ms) {
    return new Promise((resolve) => {
        /** @type {Map<string, import('nostr-tools').Event>} */
        const byId = new Map();
        let settled = 0;
        const n = relays.length;
        if (!n) {
            resolve([]);
            return;
        }
        const finish = () => {
            clearTimeout(deadline);
            resolve(Array.from(byId.values()));
        };
        const deadline = setTimeout(finish, ms);
        const ingest = (evs) => {
            for (const ev of evs || []) {
                if (ev?.id) byId.set(ev.id, ev);
            }
        };
        const step = () => {
            settled++;
            if (settled >= n) finish();
        };
        for (const relay of relays) {
            pool
                .querySync([relay], filter, { maxWait: ms })
                .then((evs) => {
                    ingest(evs);
                    step();
                })
                .catch(() => step());
        }
    });
}

export const coreMixin = {
    _acquireQuerySlot() {
        const gate = this._queryGate;
        if (gate.active < gate.max) {
            gate.active++;
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            gate.waiters.push(() => {
                gate.active++;
                resolve();
            });
        });
    },

    _releaseQuerySlot() {
        const gate = this._queryGate;
        gate.active = Math.max(0, gate.active - 1);
        const next = gate.waiters.shift();
        if (next) next();
    },

    /**
     * Per-relay circuit breaker.
     *
     * SimplePool's `ensureRelay` re-creates a fresh `new WebSocket(url)` on every
     * subscribe/publish for any URL that previously failed. When a relay is
     * unreachable from the current browser (e.g. Firefox ETP / DNS-over-HTTPS
     * blocking specific hosts), this means hundreds of new connection attempts
     * per session, each one logs "can't establish a connection" to the browser
     * console and burns CPU/network. Here we wrap `ensureRelay` so a URL that
     * has just failed is skipped (rejected synchronously) for an exponentially
     * growing window: 15s → 60s → 5min → 10min. (Capped at 10min so a
     * temporarily-down relay is re-tried within a bounded window, see the
     * background prober below.)
     * On any successful connect the health is reset.
     *
     * Background prober (`_startRelayHealing`):
     * Every 3 minutes the prober picks one relay whose cooldown has already
     * expired or is just about to, and calls the *original* `ensureRelay` to
     * see whether it's back online. If it is, the health entry is cleared and
     * the next publish/query reaches that relay too. This is the "every so
     * often try sending equally to the other relays in an intelligent way that
     * doesn't hurt performance" the user asked for: if a relay went down and
     * came back, we notice within a few minutes instead of waiting for an
     * outbound event to walk into a stale 10-min cooldown, so a relay
     * outage no longer means "nothing reaches that host until the user
     * happens to publish after the cooldown expires".
     */
    _installRelayCircuitBreaker() {
        /** @type {Map<string, { fails: number, until: number }>} */
        this._relayHealth = new Map();
        const COOLDOWN_LADDER_MS = [8_000, 30_000, 120_000, 300_000];
        const origEnsure = this._pool.ensureRelay.bind(this._pool);
        this._origEnsureRelay = origEnsure;

        this._pool.ensureRelay = async (url, params) => {
            const now = Date.now();
            const h = this._relayHealth.get(url);
            if (h && h.until > now) {
                /* Short-circuit: skip the new WebSocket. Throwing here is the
                   same shape SimplePool sees from a real network failure, so
                   querySync / publish just record "this relay didn't
                   respond" and move on with the others. */
                const remaining = Math.ceil((h.until - now) / 1000);
                throw new Error(`relay ${url} cooling down (${remaining}s)`);
            }
            try {
                const relay = await origEnsure(url, params);
                this._relayHealth.delete(url);
                return relay;
            } catch (e) {
                const prev = this._relayHealth.get(url) || { fails: 0, until: 0 };
                const fails = prev.fails + 1;
                const idx = Math.min(fails - 1, COOLDOWN_LADDER_MS.length - 1);
                const delay = COOLDOWN_LADDER_MS[idx];
                this._relayHealth.set(url, { fails, until: Date.now() + delay });
                if (fails === 1 || fails % 5 === 0) {
                    console.warn(
                        `[arborito] relay ${url} unreachable (${fails}x); pausing for ${Math.round(delay / 1000)}s`
                    );
                }
                throw e;
            }
        };

        this._startRelayHealing();
    },

    /**
     * Lightweight background prober: every 3 minutes, pick one relay whose
     * cooldown has expired (or is the closest to expiring) and probe it with
     * the *raw* ensureRelay (bypassing the circuit-breaker short-circuit).
     * If it answers we delete the health entry so the next publish/query
     * reaches it. If it doesn't, we just bump its cooldown one notch like a
     * normal failed call, the user-facing path is untouched and never waits
     * on the prober.
     */
    _startRelayHealing() {
        if (this._relayHealProbe) return;
        if (typeof setInterval !== 'function') return;
        const PROBE_EVERY_MS = 180_000;
        /** Round-robin cursor so consecutive probes hit different hosts. */
        this._healCursor = 0;
        this._relayHealProbe = setInterval(() => {
            try {
                this._probeOneRelayInBackground();
            } catch {
                /* never let the prober crash the timer */
            }
        }, PROBE_EVERY_MS);
        if (typeof this._relayHealProbe.unref === 'function') {
            try { this._relayHealProbe.unref(); } catch { /* browser env */ }
        }
    },

    async _probeOneRelayInBackground() {
        if (!hasGdprNetworkConsent()) return;
        const relays = this._relays();
        if (!relays.length) return;
        const now = Date.now();
        /* Prefer relays that are already past their cooldown (so a probe is
         * effectively free) and have non-zero fails. Fall back to the next
         * relay in round-robin order for a periodic "are you still alive?"
         * touch even on healthy ones, but only if it has been silent for a
         * while (i.e. has a stale health entry from earlier this session). */
        const candidates = relays
            .map((url) => ({ url, h: this._relayHealth.get(url) }))
            .filter(({ h }) => h && h.fails > 0 && h.until <= now);
        let target;
        if (candidates.length) {
            target = candidates[this._healCursor % candidates.length].url;
            this._healCursor++;
        } else {
            return; /* nothing to heal */
        }
        try {
            await this._origEnsureRelay(target);
            this._relayHealth.delete(target);
            console.info(`[arborito] relay ${target} is back online`);
        } catch {
            /* still down, let the next user-initiated call (or a later
             * probe) handle the cooldown bump; we don't double-penalise. */
        }
    },

    /**
     * If every effective relay is currently paused (e.g. a brief network
     * outage marked them all unhealthy at once), unpause them so the next
     * attempt has at least a chance instead of returning instantly with
     * "cooling down". Called from `_get` / `_query` / `_publish` when the
     * caller is about to spend its retry budget anyway.
     * @returns {boolean} whether any health entry was cleared
     */
    _unpauseAllRelaysIfAllCoolingDown() {
        const relays = this._relays();
        if (!relays.length) return false;
        const now = Date.now();
        const paused = relays.filter((url) => {
            const h = this._relayHealth.get(url);
            return h && h.until > now;
        });
        const allPaused = paused.length === relays.length;
        const mostlyPaused = paused.length >= Math.ceil(relays.length * 0.5);
        if (!allPaused && !mostlyPaused) return false;
        for (const url of relays) this._relayHealth.delete(url);
        console.warn('[arborito] relays were cooling down, unpausing for a fresh attempt');
        return true;
    },

    setPeers(peers) {
        this.peers = normalizeNostrRelayUrls(peers);
    },

    /** Effective URLs to publish / query (empty until user configures relays). */
    getPublishRelayUrls() {
        return [...this._relays()];
    },

    hasConfiguredRelays() {
        return this._relays().length > 0;
    },

    _relays() {
        return normalizeNostrRelayUrls(this.peers.length ? this.peers : DEFAULT_NOSTR_RELAYS);
    },

    /**
     * GDPR defense-in-depth: every outbound relay call passes through `_publish`,
     * `_query` or `_get`. We refuse to open the WebSocket if the user has not
     * accepted the privacy policy. The boot pipeline in `store.js` already
     * defers `sourceManager.init()` behind the same gate, so the only way to
     * reach this branch is a code path that forgot to check consent itself,
     * which would be a bug worth surfacing instead of silently leaking the
     * user's IP to a relay. The error code is stable so callers can pattern-
     * match (e.g. show a "please accept the privacy policy" toast).
     */
    _assertNetworkConsent(op) {
        if (hasGdprNetworkConsent()) return;
        const err = new Error('gdpr_consent_required');
        err.code = 'gdpr_consent_required';
        err.op = op;
        throw err;
    },

    /**
     * @param {import('core.js').Event} ev
     */
    async _publish(ev) {
        await this._publishToRelays(ev, this._relays());
    },

    /**
     * Publish to several relays in parallel; succeed when any relay accepts
     * within RELAY_PUBLISH_TIMEOUT_MS (do not wait for every slow/failed peer).
     * @param {import('core.js').Event} ev
     * @param {string[]} relays
     */
    async _publishEventAnyRelay(ev, relays) {
        const targets = Array.isArray(relays) && relays.length ? relays : this._relays();
        if (!targets.length) {
            const err = new Error('nostr_relays_required');
            err.code = 'nostr_relays_required';
            throw err;
        }
        const pin = this._bundlePublishRelay;
        const ordered =
            pin && targets.includes(pin)
                ? [pin, ...targets.filter((r) => r !== pin)]
                : targets;
        const publishOne = async (relay) => {
            const attempt = this._pool.publish([relay], ev)[0];
            await Promise.race([
                attempt,
                new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('publish timed out')), RELAY_PUBLISH_TIMEOUT_MS);
                })
            ]);
            return relay;
        };
        if (pin && ordered.includes(pin)) {
            try {
                const relay = await publishOne(pin);
                this._bundlePublishRelay = relay;
                return relay;
            } catch {
                /* pinned relay failed — try the rest */
            }
        }
        const attempts = ordered.map((relay) =>
            publishOne(relay).catch((e) => {
                throw new Error(`${relay}: ${(e && e.message) || e}`);
            })
        );
        try {
            const relay = await Promise.any(attempts);
            this._bundlePublishRelay = relay;
            return relay;
        } catch (err) {
            const reasons = (err.errors || [err]).map((e) => String((e && e.message) || e));
            throw new Error(reasons.length ? reasons.join('; ') : 'publish failed on all relays');
        }
    },

    /**
     * Publish one event to an explicit relay list, serialized through the
     * publish chain and with the circuit-breaker "all relays cooling down"
     * escape hatch. Used by `_publish` (default relays) and by the replicated
     * progress writer (caller-supplied peers) so every publish path shares the
     * same consent gate + resilience behaviour instead of calling the raw pool.
     * @param {import('core.js').Event} ev
     * @param {string[]} relays
     */
    async _publishToRelays(ev, relays) {
        this._assertNetworkConsent('publish');
        const targets = Array.isArray(relays) && relays.length ? relays : this._relays();
        if (!targets.length) {
            const err = new Error('nostr_relays_required');
            err.code = 'nostr_relays_required';
            throw err;
        }
        const tryOnce = async () => {
            await this._publishEventAnyRelay(ev, targets);
        };
        const chain = this._publishChain.queue.then(async () => {
            try {
                await tryOnce();
            } catch (e) {
                /* If everything failed because the circuit breaker was
                 * paused, give the network one fresh attempt before
                 * surfacing the error to the user. */
                if (this._unpauseAllRelaysIfAllCoolingDown()) {
                    await tryOnce();
                } else {
                    throw e;
                }
            }
        });
        this._publishChain.queue = chain.catch(() => {});
        await chain;
    },

    /**
     * Fire-and-forget: copy a replaceable account event to every configured relay
     * so sign-in still works if the first accepting relay goes offline later.
     * @param {import('core.js').Event} ev
     */
    _mirrorAccountEvent(ev) {
        this._assertNetworkConsent('publish');
        const relays = this._relays();
        if (!relays.length) return;
        void Promise.allSettled(
            relays.map((relay) =>
                Promise.race([
                    this._publishEventAnyRelay(ev, [relay]),
                    new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('mirror timed out')), RELAY_MIRROR_TIMEOUT_MS);
                    })
                ])
            )
        );
    },

    /**
     * Publish many events with limited parallelism (bundle chunks).
     * Bypasses the global `_publishChain` so large trees do not upload one chunk per minute.
     * @param {import('core.js').Event[]} events
     * @param {number} [concurrency=5]
     */
    async _publishBurst(events, concurrency = 5) {
        this._assertNetworkConsent('publish');
        const list = Array.isArray(events) ? events.filter(Boolean) : [];
        if (!list.length) return;
        const limit = Math.max(1, Math.min(8, Number(concurrency) || 5));
        let idx = 0;
        const tryOnce = async (ev) => {
            await this._publishEventAnyRelay(ev, this._relays());
        };
        const worker = async () => {
            while (idx < list.length) {
                const i = idx++;
                try {
                    await tryOnce(list[i]);
                } catch (e) {
                    if (this._unpauseAllRelaysIfAllCoolingDown()) {
                        await tryOnce(list[i]);
                    } else {
                        throw e;
                    }
                }
            }
        };
        await Promise.all(Array.from({ length: Math.min(limit, list.length) }, () => worker()));
    },

    _relaysFastFirst() {
        const relays = this._relays();
        const now = Date.now();
        let ordered = relays.filter((url) => {
            const h = this._relayHealth.get(url);
            return !h || h.until <= now;
        });
        if (!ordered.length) ordered = relays;
        const pin = this._bundlePublishRelay;
        if (pin && ordered.includes(pin)) {
            return [pin, ...ordered.filter((r) => r !== pin)];
        }
        return ordered;
    },

    async _getFast(filter, ms = QUERY_MS) {
        this._assertNetworkConsent('get');
        const ordered = this._relaysFastFirst();
        if (!ordered.length) return null;
        await this._acquireQuerySlot();
        try {
            let out = await relayGetRace(this._pool, ordered, filter, ms);
            if (!out && this._unpauseAllRelaysIfAllCoolingDown()) {
                out = await relayGetRace(this._pool, this._relays(), filter, ms);
            }
            return out;
        } finally {
            this._releaseQuerySlot();
        }
    },

    async _queryFast(filter, ms = QUERY_MS) {
        this._assertNetworkConsent('query');
        const ordered = this._relaysFastFirst();
        if (!ordered.length) return [];
        await this._acquireQuerySlot();
        try {
            let out = await relayQueryMerge(this._pool, ordered, filter, ms);
            if ((!out || out.length === 0) && this._unpauseAllRelaysIfAllCoolingDown()) {
                out = await relayQueryMerge(this._pool, this._relays(), filter, ms);
            }
            return out || [];
        } finally {
            this._releaseQuerySlot();
        }
    },

    async _query(filter, ms = QUERY_MS) {
        return this._queryFast(filter, ms);
    },

    async _get(filter, ms = QUERY_MS) {
        return this._getFast(filter, ms);
    }
};

/**
 * The `available` getter is intentionally not part of the mixin object: a
 * literal `get foo()` survives `Object.assign` only as the *resolved value*
 * (not as a getter descriptor). We attach it directly to the prototype in
 * `./index.js`.
 */
export function defineCoreAccessors(Cls) {
    Object.defineProperty(Cls.prototype, 'available', {
        configurable: true,
        get() {
            return isNostrNetworkAvailable() && this.peers.length > 0;
        }
    });
}
