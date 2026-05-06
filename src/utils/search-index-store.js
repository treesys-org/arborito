/**
 * IndexedDB persistence for the local search index (parity with `data/search/` shards).
 */

import { SEARCH_INDEX_FORMAT_VERSION } from './search-index-core.js';

const DB_NAME = 'arboritoSearchIndex';
const DB_VERSION = 1;
const STORE_SHARDS = 'shards';
const STORE_META = 'meta';

/** @type {IDBDatabase | null} */
let _dbPromise = null;

function openDb() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = (ev) => {
            const db = ev.target.result;
            if (!db.objectStoreNames.contains(STORE_SHARDS)) {
                db.createObjectStore(STORE_SHARDS, { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains(STORE_META)) {
                db.createObjectStore(STORE_META, { keyPath: 'treeKey' });
            }
        };
    });
    return _dbPromise;
}

function shardRecordKey(treeKey, lang, prefix) {
    return `${treeKey}|${String(lang).toUpperCase()}|${prefix}`;
}

/**
 * @param {string} treeKey
 * @param {string} lang
 * @param {string} prefix — 2 chars
 * @param {object[]} entries
 */
export async function putShard(treeKey, lang, prefix, entries) {
    const db = await openDb();
    const key = shardRecordKey(treeKey, lang, prefix);
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_SHARDS, 'readwrite');
        const store = tx.objectStore(STORE_SHARDS);
        const rec = { key, treeKey, lang: String(lang).toUpperCase(), prefix, entries };
        const r = store.put(rec);
        r.onerror = () => reject(r.error);
        r.onsuccess = () => resolve();
    });
}

/**
 * @param {string} treeKey
 * @param {string} lang
 * @param {string} prefix
 * @returns {Promise<object[]|null>}
 */
export async function getShard(treeKey, lang, prefix) {
    const db = await openDb();
    const key = shardRecordKey(treeKey, lang, prefix);
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_SHARDS, 'readonly');
        const r = tx.objectStore(STORE_SHARDS).get(key);
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
            const row = r.result;
            resolve(row && Array.isArray(row.entries) ? row.entries : null);
        };
    });
}

/**
 * Deletes all shards and meta for one tree.
 * @param {string} treeKey
 */
export async function clearTree(treeKey) {
    const db = await openDb();
    const low = `${treeKey}|`;
    const high = `${treeKey}|\uffff`;
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_SHARDS, STORE_META], 'readwrite');
        const sh = tx.objectStore(STORE_SHARDS);
        const range = IDBKeyRange.bound(low, high);
        const req = sh.openCursor(range);
        req.onerror = () => reject(req.error);
        req.onsuccess = (ev) => {
            const cursor = ev.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
        tx.objectStore(STORE_META).delete(treeKey);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * @param {string} treeKey
 * @param {{ fingerprint: string, updatedAt?: number }} meta
 */
export async function putMeta(treeKey, meta) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_META, 'readwrite');
        const r = tx.objectStore(STORE_META).put({
            treeKey,
            formatVersion: SEARCH_INDEX_FORMAT_VERSION,
            fingerprint: meta.fingerprint,
            updatedAt: meta.updatedAt || Date.now()
        });
        r.onerror = () => reject(r.error);
        r.onsuccess = () => resolve();
    });
}

/** @param {string} treeKey */
export async function getMeta(treeKey) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_META, 'readonly');
        const r = tx.objectStore(STORE_META).get(treeKey);
        r.onerror = () => reject(r.error);
        r.onsuccess = () => resolve(r.result || null);
    });
}

/**
 * Exporta pack serializable para .arborito
 * @param {string} treeKey
 */
export async function exportPack(treeKey) {
    const db = await openDb();
    const meta = await getMeta(treeKey);
    const shards = {};
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_SHARDS, 'readonly');
        const req = tx.objectStore(STORE_SHARDS).openCursor();
        const pref = `${treeKey}|`;
        req.onerror = () => reject(req.error);
        req.onsuccess = (ev) => {
            const cursor = ev.target.result;
            if (cursor) {
                const row = cursor.value;
                if (row.key && String(row.key).startsWith(pref)) {
                    const rest = String(row.key).slice(pref.length);
                    shards[rest] = row.entries;
                }
                cursor.continue();
            } else {
                resolve({
                    formatVersion: SEARCH_INDEX_FORMAT_VERSION,
                    fingerprint: (meta && meta.fingerprint) || null,
                    updatedAt: (meta && meta.updatedAt) || null,
                    shards
                });
            }
        };
    });
}

/**
 * @param {string} treeKey
 * @param {object} pack — de exportPack o import archivo
 */
export async function importPack(treeKey, pack) {
    if (!pack || typeof pack !== 'object') return;
    await clearTree(treeKey);
    const fp = pack.fingerprint || 'imported';
    await putMeta(treeKey, { fingerprint: fp });
    const shards = pack.shards || {};
    for (const [rest, entries] of Object.entries(shards)) {
        const idx = rest.indexOf('|');
        if (idx < 0) continue;
        const lang = rest.slice(0, idx);
        const prefix = rest.slice(idx + 1);
        if (Array.isArray(entries)) await putShard(treeKey, lang, prefix, entries);
    }
}
