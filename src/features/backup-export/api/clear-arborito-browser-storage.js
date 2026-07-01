import { MEDIA_CONSENT_STORAGE_KEY_V2, MEDIA_SESSION_KEY_V2 } from '../../privacy-gdpr/api/third-party-media.js';
import { revokeSageAiConsents } from '../../learning/api/sage-ai-consent.js';

const INLINE_GAME_WARNING_HIDE_KEY = 'arborito-inline-game-warning-hide';

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
        localStorage.removeItem(MEDIA_CONSENT_STORAGE_KEY_V2);
        sessionStorage.removeItem(MEDIA_SESSION_KEY_V2);
        revokeSageAiConsents();
        localStorage.removeItem('arborito_sage_whisper_download_consent');
        localStorage.removeItem('arborito_sage_piper_download_consent');
        localStorage.removeItem(INLINE_GAME_WARNING_HIDE_KEY);
    } catch (e) {
        console.warn('clearOptionalConsentKeys', e);
    }
}
