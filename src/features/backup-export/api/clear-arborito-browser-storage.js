import { MEDIA_CONSENT_STORAGE_KEY_V2, MEDIA_SESSION_KEY_V2, clearMemoryMediaConsentOrigins } from '../../privacy-gdpr/api/third-party-media.js';
import { revokeSageAiConsents } from '../../learning/api/sage-ai-consent.js';
import { closeSearchIndexDb } from '../../search/api/search-index-store.js';
import { closeLessonContentCacheDb } from '../../learning/api/lesson-content-cache.js';

const INLINE_GAME_WARNING_HIDE_KEY = 'arborito-inline-game-warning-hide';

/** IndexedDB databases written by Arborito (branches, trees, search, caches). */
const ARBORITO_INDEXED_DB_NAMES = [
    'arborito_catalog_v2',
    'arborito_catalog_v1',
    'arboritoSearchIndex',
    'arborito_tree_cache_v1',
    'arboritoLessonCache',
];

function clearArboritoWebStorage() {
    for (const storage of [window.localStorage, window.sessionStorage]) {
        try {
            const keys = [];
            for (let i = 0; i < storage.length; i++) {
                const k = storage.key(i);
                if (k != null && k.startsWith('arborito')) keys.push(k);
            }
            for (const k of keys) storage.removeItem(k);
        } catch (e) {
            console.warn('clearArboritoWebStorage', e);
        }
    }
}

function deleteIndexedDb(name, timeoutMs = 5000) {
    return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            resolve();
        };
        const timer = setTimeout(finish, timeoutMs);
        try {
            const req = indexedDB.deleteDatabase(name);
            req.onsuccess = () => {
                clearTimeout(timer);
                finish();
            };
            req.onerror = () => {
                console.warn('[Arborito] deleteDatabase failed', name, req.error);
                clearTimeout(timer);
                finish();
            };
            req.onblocked = () => {
                console.warn('[Arborito] deleteDatabase blocked (waiting for connections to close)', name);
            };
        } catch (e) {
            console.warn('[Arborito] deleteDatabase', name, e);
            clearTimeout(timer);
            finish();
        }
    });
}

async function closeOpenIndexedDbConnections() {
    try {
        await Promise.all([closeSearchIndexDb(), closeLessonContentCacheDb()]);
    } catch (e) {
        console.warn('[Arborito] closeOpenIndexedDbConnections', e);
    }
}

async function clearArboritoIndexedDatabases() {
    if (typeof indexedDB === 'undefined') return;
    await closeOpenIndexedDbConnections();
    await Promise.all(ARBORITO_INDEXED_DB_NAMES.map((name) => deleteIndexedDb(name)));
}

/**
 * Remove every localStorage / sessionStorage key whose name starts with "arborito"
 * (progress, settings, Nostr keys, media consent, UI prefs, etc.) and delete all
 * Arborito IndexedDB databases (branches, composed trees, search index, caches).
 */
export async function clearAllArboritoBrowserStorage() {
    if (typeof window === 'undefined') return;
    clearArboritoWebStorage();
    await clearArboritoIndexedDatabases();
}

/** Withdraw optional consents only; does not delete progress or tree list. */
export function clearOptionalConsentKeys() {
    if (typeof window === 'undefined') return;
    try {
        localStorage.removeItem(MEDIA_CONSENT_STORAGE_KEY_V2);
        sessionStorage.removeItem(MEDIA_SESSION_KEY_V2);
        clearMemoryMediaConsentOrigins();
        revokeSageAiConsents();
        localStorage.removeItem('arborito_sage_whisper_download_consent');
        localStorage.removeItem('arborito_sage_piper_download_consent');
        localStorage.removeItem(INLINE_GAME_WARNING_HIDE_KEY);
    } catch (e) {
        console.warn('clearOptionalConsentKeys', e);
    }
}
