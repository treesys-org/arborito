/**
 * Compatibility shim: the implementation now lives in `./nostr/` as a set of
 * mixin modules merged into the `NostrUniverseService` class prototype.
 * Existing call sites that `import { … } from './nostr-universe.js'`
 * keep working unchanged.
 */

export { NostrUniverseService, createNostrPair, isNostrNetworkAvailable } from './client/index.js';
