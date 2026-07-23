import { getArboritoStore } from '../../../core/store-singleton.js';
import { hasGdprNetworkConsent } from '../../../features/privacy-gdpr/api/network-consent.js';
import { isNostrNetworkAvailable } from '../../../features/nostr/api/nostr-network-env.js';
import { KIND_TREE_DIRECTORY } from '../../../features/nostr/api/nostr-spec.js';
import { yieldToPaint } from '../yield-to-paint.js';

const defaultStore = () => getArboritoStore();

/**
 * Initialise Nostr when GDPR network consent is granted.
 * @param {ReturnType<typeof getArboritoStore>} [storeRef]
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<import('../../../features/nostr/api/client/index.js').NostrUniverseService|null>}
 */
export async function ensureConnectedNostr(storeRef = defaultStore(), { timeoutMs = 0 } = {}) {
    if (!hasGdprNetworkConsent()) return null;
    const init = storeRef.ensureNostrReady?.();
    if (!init) return null;
    if (timeoutMs > 0) {
        try {
            return await Promise.race([
                init,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('nostr-init-timeout')), timeoutMs)
                ),
            ]);
        } catch (e) {
            console.warn('[Arborito] nostr not ready', e);
            return null;
        }
    }
    return init;
}

/**
 * Open WebSockets to configured relays. `ensureNostrReady` only loads the client;
 * without this, the first Forest/install query pays the full connect cost.
 * Safe to call repeatedly (ensureRelay is idempotent once connected).
 *
 * @param {ReturnType<typeof getArboritoStore>} [storeRef]
 * @param {{ timeoutMs?: number, perRelayMs?: number, probe?: boolean }} [opts]
 */
export async function warmNostrRelayConnections(
    storeRef = defaultStore(),
    { timeoutMs = 12000, perRelayMs = 4500, probe = true } = {}
) {
    const nostr = await ensureConnectedNostr(storeRef, { timeoutMs });
    if (!nostr) return null;
    const urls =
        typeof nostr.getPublishRelayUrls === 'function'
            ? nostr.getPublishRelayUrls()
            : Array.isArray(nostr.peers)
              ? nostr.peers
              : [];
    const pool = nostr._pool;
    if (!urls.length || !pool || typeof pool.ensureRelay !== 'function') return nostr;

    await Promise.allSettled(
        urls.map(
            (url) =>
                Promise.race([
                    pool.ensureRelay(url),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('relay-warm-timeout')), perRelayMs)
                    ),
                ]).catch(() => null)
        )
    );

    /* Optional cheap REQ so the first real directory/bundle query is not also the first handshake.
     * Skip when callers will REQ immediately (directory fetch) to avoid doubling latency. */
    if (probe) {
        try {
            if (typeof nostr._getFast === 'function') {
                await nostr._getFast({ kinds: [KIND_TREE_DIRECTORY], limit: 1 }, 2000);
            }
        } catch {
            /* ignore — warm is best-effort */
        }
    }
    return nostr;
}

/**
 * Initialise Nostr when consent + WebSocket are available; returns the service or null.
 * Prefer this over reading `store.nostr` directly, the getter is null until init completes.
 * @param {ReturnType<typeof getArboritoStore>} [storeRef]
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<import('../../../features/nostr/api/client/index.js').NostrUniverseService|null>}
 */
export async function getConnectedNostr(storeRef = defaultStore(), { timeoutMs = 0 } = {}) {
    if (!hasGdprNetworkConsent() || !isNostrNetworkAvailable()) return null;
    return ensureConnectedNostr(storeRef, { timeoutMs });
}

/**
 * Same as {@link getConnectedNostr} but throws user-facing errors when unavailable.
 * @param {ReturnType<typeof getArboritoStore>} [storeRef]
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<import('../../../features/nostr/api/client/index.js').NostrUniverseService>}
 */
export async function requireConnectedNostr(storeRef = defaultStore(), { timeoutMs = 0 } = {}) {
    const ui = storeRef?.ui || {};
    if (!hasGdprNetworkConsent()) {
        throw new Error(
            ui.nostrGdprConsentRequired ||
                'Accept the privacy notice to load courses from the network.'
        );
    }
    if (!isNostrNetworkAvailable()) {
        throw new Error(
            ui.nostrNotLoadedHint ||
                'Nostr client is not loaded. Check network and CSP.'
        );
    }
    const net = await ensureConnectedNostr(storeRef, { timeoutMs });
    if (!net) {
        throw new Error(
            ui.nostrNotReadyError ||
                ui.nostrNotLoadedHint ||
                'Could not connect to the network. Try again in a moment.'
        );
    }
    if (typeof net.hasConfiguredRelays === 'function' && !net.hasConfiguredRelays()) {
        const err = new Error(
            ui.nostrRelaysRequired ||
                'Configure at least one relay in Profile or accept the network during onboarding to use online features.'
        );
        err.code = 'nostr_relays_required';
        throw err;
    }
    return net;
}

/**
 * Lazy-load AI logic when GDPR network consent is granted (Sage / expert API).
 * @param {ReturnType<typeof getArboritoStore>} [storeRef]
 */
export async function ensureConnectedAI(storeRef = defaultStore()) {
    if (!hasGdprNetworkConsent()) return null;
    return storeRef.ensureAILogic?.() ?? null;
}

/** Yield to paint, then run work after Nostr relays are warmed. */
export async function runConnectedNetworkLoad(work, storeRef = defaultStore(), { timeoutMs = 0 } = {}) {
    const ms = timeoutMs || 12000;
    await warmNostrRelayConnections(storeRef, {
        timeoutMs: ms,
        perRelayMs: Math.min(4500, Math.max(1500, Math.floor(ms * 0.6))),
        probe: false,
    });
    await yieldToPaint();
    return work();
}

/** Biblioteca network loads (Nostr warm + paint before merge/plant/directory). */
export async function runBibliotecaNetworkLoad(work, { timeoutMs = 0 } = {}) {
    return runConnectedNetworkLoad(work, defaultStore(), { timeoutMs });
}
