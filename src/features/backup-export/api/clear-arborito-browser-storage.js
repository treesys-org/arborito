import { MEDIA_CONSENT_STORAGE_KEY_V2, MEDIA_SESSION_KEY_V2, clearMemoryMediaConsentOrigins } from '../../privacy-gdpr/api/third-party-media.js';
import { revokeSageAiConsents } from '../../learning/api/sage-ai-consent.js';
import { closeSearchIndexDb } from '../../search/api/search-index-store.js';
import { closeLessonContentCacheDb } from '../../learning/api/lesson-content-cache.js';
import {
    disableArboritoStorageWrites,
    waitForArboritoStorageWritesIdle,
} from '../../../shared/lib/arborito-storage-gate.js';

const INLINE_GAME_WARNING_HIDE_KEY = 'arborito-inline-game-warning-hide';

/** IndexedDB databases written by Arborito (branches, trees, search, caches, media). */
const ARBORITO_INDEXED_DB_NAMES = [
    'arborito_catalog_v2',
    'arborito_catalog_v1',
    'arboritoSearchIndex',
    'arborito_tree_cache_v1',
    'arboritoLessonCache',
    'arborito_lesson_media_v1',
];

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

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

async function listArboritoIndexedDbNames() {
    const names = new Set(ARBORITO_INDEXED_DB_NAMES);
    try {
        if (typeof indexedDB.databases === 'function') {
            const listed = await indexedDB.databases();
            for (const info of listed || []) {
                const n = info?.name;
                if (typeof n === 'string' && n.toLowerCase().startsWith('arborito')) {
                    names.add(n);
                }
            }
        }
    } catch (e) {
        console.warn('[Arborito] indexedDB.databases', e);
    }
    return [...names];
}

async function databaseExists(name) {
    try {
        if (typeof indexedDB.databases === 'function') {
            const listed = await indexedDB.databases();
            return (listed || []).some((info) => info?.name === name);
        }
    } catch {
        /* fall through — assume may still exist */
    }
    return null;
}

/**
 * Delete one IndexedDB. Resolves true only when delete succeeded (or DB already gone).
 * Does not treat a blocked timeout as success — that was recreating saved lessons after wipe.
 */
function deleteIndexedDbOnce(name, timeoutMs) {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (ok) => {
            if (settled) return;
            settled = true;
            resolve(ok);
        };
        const timer = setTimeout(() => {
            console.warn('[Arborito] deleteDatabase timed out', name);
            finish(false);
        }, timeoutMs);
        try {
            const req = indexedDB.deleteDatabase(name);
            req.onsuccess = () => {
                clearTimeout(timer);
                finish(true);
            };
            req.onerror = () => {
                console.warn('[Arborito] deleteDatabase failed', name, req.error);
                clearTimeout(timer);
                finish(false);
            };
            req.onblocked = () => {
                console.warn(
                    '[Arborito] deleteDatabase blocked (waiting for connections to close)',
                    name
                );
            };
        } catch (e) {
            console.warn('[Arborito] deleteDatabase', name, e);
            clearTimeout(timer);
            finish(false);
        }
    });
}

async function deleteIndexedDb(name, { timeoutMs = 12000, retries = 4 } = {}) {
    for (let attempt = 0; attempt < retries; attempt++) {
        const existsBefore = await databaseExists(name);
        if (existsBefore === false) return true;

        const ok = await deleteIndexedDbOnce(name, timeoutMs);
        if (ok) {
            const still = await databaseExists(name);
            if (still === false || still === null) return true;
        }
        await sleep(150 * (attempt + 1));
    }
    const still = await databaseExists(name);
    if (still === false) return true;
    console.warn('[Arborito] deleteDatabase gave up; DB may remain', name);
    return false;
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
    await waitForArboritoStorageWritesIdle(8000);
    /* Extra beat so just-closed connections release before deleteDatabase. */
    await sleep(50);
    const names = await listArboritoIndexedDbNames();
    await Promise.all(names.map((name) => deleteIndexedDb(name, { timeoutMs: 8000, retries: 3 })));
}

async function clearArboritoCacheStorage() {
    try {
        if (typeof caches === 'undefined' || !caches?.keys) return;
        const keys = await caches.keys();
        await Promise.all(
            keys
                .filter((k) => typeof k === 'string' && k.toLowerCase().includes('arborito'))
                .map((k) => caches.delete(k).catch(() => false))
        );
    } catch (e) {
        console.warn('[Arborito] clearArboritoCacheStorage', e);
    }
}

async function clearElectronLocalCaches() {
    try {
        const clear = window.arboritoElectron?.userData?.clearLocalCaches;
        if (typeof clear !== 'function') return;
        await clear();
    } catch (e) {
        console.warn('[Arborito] clearElectronLocalCaches', e);
    }
}

/**
 * Remove every localStorage / sessionStorage key whose name starts with "arborito"
 * (progress, settings, Nostr keys, media consent, UI prefs, etc.) and delete all
 * Arborito IndexedDB databases (branches, composed trees, search index, caches, media).
 * Also clears Cache Storage keys that mention arborito and Electron frozen-trees /
 * offline-games folders when the desktop bridge is present.
 */
export async function clearAllArboritoBrowserStorage() {
    if (typeof window === 'undefined') return;
    disableArboritoStorageWrites();
    await waitForArboritoStorageWritesIdle(8000);
    clearArboritoWebStorage();
    await clearArboritoIndexedDatabases();
    await clearArboritoCacheStorage();
    await clearElectronLocalCaches();
    /* Second pass — catch any write that slipped through before the gate. */
    clearArboritoWebStorage();
    if (typeof indexedDB !== 'undefined') {
        await closeOpenIndexedDbConnections();
        const names = await listArboritoIndexedDbNames();
        await Promise.all(names.map((name) => deleteIndexedDb(name, { timeoutMs: 5000, retries: 2 })));
    }
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
