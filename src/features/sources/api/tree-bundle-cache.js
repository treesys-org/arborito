/**
 * IndexedDB cache of loaded remote tree JSON — instant reopen / boot while relays catch up.
 * Separate DB so catalog migrations stay isolated.
 */
const DB_NAME = 'arborito_tree_cache_v1';
const STORE = 'bundles';

/** Fresh enough to skip a network round-trip when forceRefresh is true. */
export const TREE_BUNDLE_CACHE_FRESH_MS = 60 * 60 * 1000;

/** Max age before entries are purged on read (stale still used as offline fallback). */
const TREE_BUNDLE_CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'sourceId' });
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

/**
 * @param {string} sourceId
 * @returns {Promise<{ sourceId: string, treeJson: object, url?: string, origin?: string, savedAt: number }|null>}
 */
export async function getTreeBundleCache(sourceId) {
    const sid = String(sourceId || '').trim();
    if (!sid || typeof indexedDB === 'undefined') return null;
    try {
        const db = await openDb();
        try {
            const row = await idbRequest(db.transaction(STORE, 'readonly').objectStore(STORE).get(sid));
            if (!row?.treeJson || typeof row.treeJson !== 'object') return null;
            const age = Date.now() - (Number(row.savedAt) || 0);
            if (age > TREE_BUNDLE_CACHE_MAX_AGE_MS) {
                void removeTreeBundleCache(sid);
                return null;
            }
            return row;
        } finally {
            db.close();
        }
    } catch (e) {
        console.warn('[Arborito] tree bundle cache read failed', e);
        return null;
    }
}

/**
 * @param {string} sourceId
 * @param {{ treeJson: object, url?: string, origin?: string }} payload
 */
export async function putTreeBundleCache(sourceId, payload) {
    const sid = String(sourceId || '').trim();
    if (!sid || !payload?.treeJson || typeof indexedDB === 'undefined') return false;
    try {
        const db = await openDb();
        try {
            await idbRequest(
                db.transaction(STORE, 'readwrite').objectStore(STORE).put({
                    sourceId: sid,
                    treeJson: payload.treeJson,
                    url: payload.url != null ? String(payload.url) : '',
                    origin: payload.origin != null ? String(payload.origin) : '',
                    savedAt: Date.now(),
                })
            );
            return true;
        } finally {
            db.close();
        }
    } catch (e) {
        console.warn('[Arborito] tree bundle cache write failed', e);
        return false;
    }
}

/** @param {string} sourceId */
export async function removeTreeBundleCache(sourceId) {
    const sid = String(sourceId || '').trim();
    if (!sid || typeof indexedDB === 'undefined') return false;
    try {
        const db = await openDb();
        try {
            await idbRequest(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(sid));
            return true;
        } finally {
            db.close();
        }
    } catch {
        return false;
    }
}
