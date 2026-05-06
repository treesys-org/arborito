import {
    MEDIA_CONSENT_STORAGE_KEY_V1,
    MEDIA_CONSENT_STORAGE_KEY_V2,
    MEDIA_SESSION_KEY_V1,
    MEDIA_SESSION_KEY_V2
} from './third-party-media.js';

const INLINE_GAME_WARNING_HIDE_KEY = 'arborito-inline-game-warning-hide';
const AI_CONSENT_KEY = 'arborito-ai-consent';

/**
 * Remove every localStorage / sessionStorage key whose name starts with "arborito"
 * (covers progress, sources, Nostr keys, media consent, UI prefs, etc.).
 */
export function clearAllArboritoBrowserStorage() {
    if (typeof window === 'undefined') return;
    for (const storage of [window.localStorage, window.sessionStorage]) {
        try {
            const keys = [];
            for (let i = 0; i < storage.length; i++) {
                const k = storage.key(i);
                if (k != null && k.startsWith('arborito')) keys.push(k);
            }
            for (const k of keys) storage.removeItem(k);
        } catch (e) {
            console.warn('clearAllArboritoBrowserStorage', e);
        }
    }
}

/** Withdraw optional consents only; does not delete progress or tree list. */
export function clearOptionalConsentKeys() {
    if (typeof window === 'undefined') return;
    try {
        localStorage.removeItem(MEDIA_CONSENT_STORAGE_KEY_V1);
        localStorage.removeItem(MEDIA_CONSENT_STORAGE_KEY_V2);
        sessionStorage.removeItem(MEDIA_SESSION_KEY_V1);
        sessionStorage.removeItem(MEDIA_SESSION_KEY_V2);
        localStorage.removeItem(AI_CONSENT_KEY);
        localStorage.removeItem(INLINE_GAME_WARNING_HIDE_KEY);
    } catch (e) {
        console.warn('clearOptionalConsentKeys', e);
    }
}

/**
 * wllama (Sage) stores downloaded weights in the Cache API under this origin.
 * localStorage/sessionStorage wipe does not touch that; call this on full device erase.
 */
export async function clearWllamaCaches() {
    if (typeof caches === 'undefined' || typeof caches.keys !== 'function') return;
    try {
        const names = await caches.keys();
        for (const name of names) {
            const lower = String(name).toLowerCase();
            if (lower === 'wllama-cache' || lower.startsWith('wllama')) {
                await caches.delete(name);
            }
        }
    } catch (e) {
        console.warn('clearWllamaCaches', e);
    }
}
