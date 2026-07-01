import { getArboritoStore } from '../../../core/store-singleton.js';
import { hasGdprNetworkConsent } from '../../../features/privacy-gdpr/api/network-consent.js';
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
 * Lazy-load AI logic when GDPR network consent is granted (Sage / expert API).
 * @param {ReturnType<typeof getArboritoStore>} [storeRef]
 */
export async function ensureConnectedAI(storeRef = defaultStore()) {
    if (!hasGdprNetworkConsent()) return null;
    return storeRef.ensureAILogic?.() ?? null;
}

/** Yield to paint, then run work after Nostr init. */
export async function runConnectedNetworkLoad(work, storeRef = defaultStore(), { timeoutMs = 0 } = {}) {
    await ensureConnectedNostr(storeRef, { timeoutMs });
    await yieldToPaint();
    return work();
}

/** Biblioteca network loads (Nostr init + paint before merge/plant/directory). */
export async function runBibliotecaNetworkLoad(work, { timeoutMs = 0 } = {}) {
    return runConnectedNetworkLoad(work, defaultStore(), { timeoutMs });
}
