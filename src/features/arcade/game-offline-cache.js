/**
 * IndexedDB cache for offline game cartridges (HTML + module scripts + assets).
 */
import { downloadGameBundle } from './game-bundle.js';

const DB_NAME = 'arborito_offline_games_v1';
const STORE = 'bundles';

function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'gameId' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function idbRequest(req) {
    return new Promise((resolve, reject) => {
        if (!req) {
            reject(new Error('Invalid IndexedDB request'));
            return;
        }
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/** @param {string} gameId @param {{ entryUrl: string, files: Record<string, string>, updatedAt: number }} bundle */
async function saveOfflineGameBundle(gameId, bundle) {
    if (!gameId || !bundle?.entryUrl) return false;
    const db = await openDb();
    try {
        const tx = db.transaction(STORE, 'readwrite');
        await idbRequest(tx.objectStore(STORE).put({ gameId, ...bundle }));
        return true;
    } finally {
        db.close();
    }
}

/** @param {string} gameId */
export async function getOfflineGameBundle(gameId) {
    if (!gameId) return null;
    const db = await openDb();
    try {
        const tx = db.transaction(STORE, 'readonly');
        const row = await idbRequest(tx.objectStore(STORE).get(gameId));
        return row || null;
    } finally {
        db.close();
    }
}

/** @param {string} gameId */
export async function hasOfflineGameBundle(gameId) {
    if (!gameId) return false;
    const db = await openDb();
    try {
        const tx = db.transaction(STORE, 'readonly');
        const key = await idbRequest(tx.objectStore(STORE).getKey(gameId));
        return key != null;
    } finally {
        db.close();
    }
}

/** @param {string} gameId */
export async function removeOfflineGameBundle(gameId) {
    if (!gameId) return false;
    const db = await openDb();
    try {
        const tx = db.transaction(STORE, 'readwrite');
        await idbRequest(tx.objectStore(STORE).delete(gameId));
        return true;
    } finally {
        db.close();
    }
}

/** @param {string} gameId @param {string} entryUrl */
export async function downloadAndCacheGame(gameId, entryUrl) {
    const baseUrl = String(entryUrl || '').split('?')[0];
    if (!gameId || !baseUrl) throw new Error('Missing game id or URL');
    const bundle = await downloadGameBundle(baseUrl);
    const saved = await saveOfflineGameBundle(gameId, bundle);
    if (!saved) throw new Error('Could not save offline copy');
    return bundle;
}
