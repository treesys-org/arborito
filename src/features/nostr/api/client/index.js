/**
 * Nostr-backed “universe” service facade.
 *
 * The implementation is split across sibling mixin modules, one per
 * responsibility area, and merged into a single `NostrUniverseService`
 * class prototype with `Object.assign`. Each mixin is a plain object whose
 * methods read/write `this` exactly the way the original class methods did,
 * so behaviour is identical to the pre-split file. Private state used
 * across mixins (the relay pool, the publish-chain queue, the query
 * concurrency gate, the per-pub forum editor cache) is initialised in the
 * constructor here so the order of mixin application doesn't matter.
 */

import { SimplePool } from '../../../../../vendor/nostr-tools/lib/esm/index.js';
import { DEFAULT_NOSTR_RELAYS, normalizeNostrRelayUrls } from '../nostr-relays-runtime.js';
import { coreMixin, defineCoreAccessors } from './core.js';
import { cryptoMixin } from './crypto.js';
import { directoryMixin } from './directory.js';
import { metricsMixin } from './metrics.js';
import { governanceMixin } from './governance.js';
import { accountsMixin } from './accounts.js';
import { bundlesMixin } from './bundles.js';
import { forumMixin } from './forum.js';
import { deletionMixin } from './deletion.js';
import { progressPresenceMixin } from './progress-presence.js';
import { applyPrototypeMethods } from '../../../../core/apply-prototype-methods.js';

export class NostrUniverseService {
    constructor({ peers = DEFAULT_NOSTR_RELAYS } = {}) {
        this.peers = normalizeNostrRelayUrls(peers);
        this._pool = new SimplePool();
        this._installRelayCircuitBreaker();
        /** @type {{ queue: Promise<void> }} */
        this._publishChain = { queue: Promise.resolve() };
        /** Relay that accepted the current bundle publish; pins subsequent chunk puts. */
        this._bundlePublishRelay = null;
        /** @type {{ key: string, stamp: string, bundle: object } | null} */
        this._bundleLoadCache = null;
        this._forumEditorsCache = null;
        /* Global concurrency gate for read REQs. Without this, opening a single
         * modal can fan out 6–10 parallel `_query` / `_get` calls; each one
         * opens a REQ on every relay. With 5 relays that's 30–50 simultaneous
         * REQs which routinely trips relay-side limits ("too many concurrent
         * REQs"). On NOTICE-rejected REQs nostr-tools doesn't close the sub
         * until eoseTimeout elapses, so the in-flight count keeps climbing
         * until the relay refuses new ones. Limiting how many of OUR REQs
         * can be in flight at once stops the snowball without a perceptible
         * latency hit (typical query is 0.5–2 s). */
        this._queryGate = { active: 0, max: 3, waiters: [] };
    }
}

applyPrototypeMethods(
    NostrUniverseService.prototype,
    coreMixin,
    cryptoMixin,
    directoryMixin,
    metricsMixin,
    governanceMixin,
    accountsMixin,
    bundlesMixin,
    forumMixin,
    deletionMixin,
    progressPresenceMixin
);

/* `available` is a getter so it can't ride along inside a plain mixin
 * object literal, `Object.assign` would have evaluated it to a scalar.
 * Attach the descriptor explicitly here. */
defineCoreAccessors(NostrUniverseService);

export { createNostrPair, isNostrNetworkAvailable } from './_shared.js';
