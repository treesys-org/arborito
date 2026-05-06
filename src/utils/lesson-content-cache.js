/**
 * Optional IndexedDB cache for lesson bodies loaded over HTTP (`content/…`).
 * Nostr and local garden do not use this path (content already in memory).
 */

const DB_NAME = 'arboritoLessonCache';
const DB_VERSION = 1;
const STORE = 'lessons';

/** Max entries per source (tree); LRU eviction by `storedAt`. */
const MAX_PER_SOURCE = 180;

/** @type {Promise<IDBDatabase> | null} */
let _dbPromise = null;

function openDb() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = (ev) => {
            const db = ev.target.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'key' });
            }
        };
    });
    return _dbPromise;
}

/**
 * @param {string} sourceId
 * @param {string} nodeId
 * @param {string} contentUrlHash — e.g. store’s `computeHash(fullUrl)`
 */
export async function getCachedLessonText(sourceId, nodeId, contentUrlHash) {
    if (typeof indexedDB === 'undefined') return null;
    const key = `${String(sourceId)}|${String(nodeId)}|${String(contentUrlHash)}`;
    try {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly');
            const r = tx.objectStore(STORE).get(key);
            r.onerror = () => reject(r.error);
            r.onsuccess = () => {
                const row = r.result;
                resolve(row && typeof row.text === 'string' ? row.text : null);
            };
        });
    } catch {
        return null;
    }
}

async function evictExcessForSource(db, sourceId) {
    const prefix = `${String(sourceId)}|`;
    const low = prefix;
    const high = `${String(sourceId)}|\uffff`;
    const rows = await new Promise((resolve, reject) => {
        const out = [];
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).openCursor(IDBKeyRange.bound(low, high));
        req.onerror = () => reject(req.error);
        req.onsuccess = (ev) => {
            const cur = ev.target.result;
            if (cur) {
                out.push(cur.value);
                cur.continue();
            } else resolve(out);
        };
    });
    if (rows.length <= MAX_PER_SOURCE) return;
    rows.sort((a, b) => (a.storedAt || 0) - (b.storedAt || 0));
    const toDrop = rows.length - MAX_PER_SOURCE;
    await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const st = tx.objectStore(STORE);
        for (let i = 0; i < toDrop; i++) st.delete(rows[i].key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * @param {string} sourceId
 * @param {string} nodeId
 * @param {string} contentUrlHash
 * @param {string} text — markdown / lesson body
 */
export async function putCachedLessonText(sourceId, nodeId, contentUrlHash, text) {
    if (typeof indexedDB === 'undefined') return;
    if (text == null || typeof text !== 'string') return;
    const key = `${String(sourceId)}|${String(nodeId)}|${String(contentUrlHash)}`;
    try {
        const db = await openDb();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            const st = tx.objectStore(STORE);
            const rec = {
                key,
                sourceId: String(sourceId),
                nodeId: String(nodeId),
                contentUrlHash: String(contentUrlHash),
                text,
                storedAt: Date.now()
            };
            st.put(rec);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        await evictExcessForSource(db, sourceId);
    } catch {
        /* ignore quota / private mode */
    }
}

/**
 * Deletes all entries for one source (e.g. when removing a local garden).
 * @param {string} sourceId
 */
export async function clearLessonCacheForSource(sourceId) {
    if (typeof indexedDB === 'undefined') return;
    const low = `${String(sourceId)}|`;
    const high = `${String(sourceId)}|\uffff`;
    try {
        const db = await openDb();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            const st = tx.objectStore(STORE);
            const req = st.openCursor(IDBKeyRange.bound(low, high));
            req.onerror = () => reject(req.error);
            req.onsuccess = (ev) => {
                const cur = ev.target.result;
                if (cur) {
                    cur.delete();
                    cur.continue();
                }
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch {
        /* ignore */
    }
}
