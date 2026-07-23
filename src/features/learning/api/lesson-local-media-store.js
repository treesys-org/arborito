/**
 * Private lesson media blobs (./media/…) — IndexedDB, never for Nostr publish.
 * Embedded into .arborito ZIP on export; restored on import.
 * Demo lesson media also falls back to Vite URLs via demo-media-assets.
 */

import { resolveBundledDemoMediaUrl } from '../../../core/demo/demo-media-assets.js';

const DB_NAME = 'arborito_lesson_media_v1';
const STORE = 'files';

function idbRequest(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('idb'));
    });
}

function openDb() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('indexedDB unavailable'));
            return;
        }
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'key' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('idb open'));
    });
}

function mediaKey(branchId, filename) {
    return `${String(branchId || '').trim()}::${String(filename || '').trim()}`;
}

const blobUrlCache = new Map();

function revokeBlobCacheKey(cacheKey) {
    const url = blobUrlCache.get(cacheKey);
    if (!url) return;
    try {
        URL.revokeObjectURL(url);
    } catch {
        /* ignore */
    }
    blobUrlCache.delete(cacheKey);
}

/** @param {string} name */
export function safeMediaFilename(name) {
    const raw = String(name || 'file');
    const base = raw
        .split(/[/\\]/)
        .pop()
        .replace(/[<>:"|?*\x00-\x1f]/g, '-')
        .replace(/\s+/g, '-')
        .replace(/^\.+/, '');
    let cleaned = base.replace(/[^A-Za-z0-9._-]/g, '');
    if (!cleaned || cleaned === '.' || cleaned === '..') {
        let h = 2166136261;
        for (let i = 0; i < raw.length; i++) {
            h ^= raw.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        const extMatch = raw.match(/(\.[A-Za-z0-9]{1,8})$/);
        cleaned = `file-${(h >>> 0).toString(36)}${extMatch ? extMatch[1].toLowerCase() : ''}`;
    }
    return cleaned.slice(0, 120);
}

/** @param {string} branchId @param {string} filename @param {Blob|ArrayBuffer|Uint8Array} data @param {string} [mime] */
export async function putLessonMediaFile(branchId, filename, data, mime = '') {
    const bid = String(branchId || '').trim();
    const file = safeMediaFilename(filename);
    if (!bid || !file) return '';
    let blob;
    if (data instanceof Blob) blob = data;
    else if (data instanceof ArrayBuffer) blob = new Blob([data], { type: mime || 'application/octet-stream' });
    else if (data instanceof Uint8Array) {
        blob = new Blob([data], { type: mime || 'application/octet-stream' });
    } else return '';
    const db = await openDb();
    try {
        await idbRequest(
            db.transaction(STORE, 'readwrite').objectStore(STORE).put({
                key: mediaKey(bid, file),
                branchId: bid,
                filename: file,
                mime: mime || blob.type || 'application/octet-stream',
                blob,
                updated: Date.now(),
            })
        );
    } finally {
        db.close();
    }
    revokeBlobCacheKey(mediaKey(bid, file));
    return `./media/${file}`;
}

/** @param {string} branchId @param {string} filename */
export async function getLessonMediaFile(branchId, filename) {
    const bid = String(branchId || '').trim();
    const file = safeMediaFilename(filename);
    if (!bid || !file) return null;
    const db = await openDb();
    try {
        const row = await idbRequest(db.transaction(STORE, 'readonly').objectStore(STORE).get(mediaKey(bid, file)));
        return row?.blob instanceof Blob ? row : null;
    } finally {
        db.close();
    }
}

/** @param {string} branchId */
export async function listLessonMediaFiles(branchId) {
    const bid = String(branchId || '').trim();
    if (!bid) return [];
    const db = await openDb();
    try {
        const rows = await idbRequest(db.transaction(STORE, 'readonly').objectStore(STORE).getAll());
        return (rows || []).filter((r) => String(r?.branchId) === bid);
    } finally {
        db.close();
    }
}

/** @param {string} branchId @param {Record<string, Uint8Array|{bytes:Uint8Array,mime?:string}>} files */
export async function importLessonMediaFiles(branchId, files) {
    const bid = String(branchId || '').trim();
    if (!bid || !files) return 0;
    let n = 0;
    for (const [name, val] of Object.entries(files)) {
        const file = safeMediaFilename(name);
        const bytes = val instanceof Uint8Array ? val : val?.bytes;
        const mime = val?.mime || '';
        if (!file || !bytes) continue;
        await putLessonMediaFile(bid, file, bytes, mime);
        n += 1;
    }
    return n;
}

/** Drop cached blob: URLs (branch switch / lesson close / file replace). */
export function clearLessonMediaBlobCache(branchId = null) {
    const prefix = branchId != null && String(branchId).trim() ? `${String(branchId).trim()}::` : null;
    for (const key of [...blobUrlCache.keys()]) {
        if (prefix && !key.startsWith(prefix)) continue;
        revokeBlobCacheKey(key);
    }
}

/** Resolve ./media/ via IDB blob or bundled demo Vite URL, else leave as-is. */
export async function resolveLessonMediaSrc(src, branchId) {
    const s = String(src || '').trim();
    if (!s) return '';
    const m = s.match(/^(?:\.\.?\/)?media\/([A-Za-z0-9._-]+)$/i);
    if (!m) return s;
    const file = m[1];
    const bid = String(branchId || '').trim();
    const cacheKey = `${bid}::${file}`;
    if (blobUrlCache.has(cacheKey)) return blobUrlCache.get(cacheKey);
    if (bid) {
        try {
            const row = await getLessonMediaFile(bid, file);
            if (row?.blob) {
                const url = URL.createObjectURL(row.blob);
                blobUrlCache.set(cacheKey, url);
                return url;
            }
        } catch {
            /* fall through */
        }
    }
    const bundled = resolveBundledDemoMediaUrl(file);
    if (bundled) return bundled;
    return `./media/${file}`;
}

/** Collect ./media/ filenames referenced in tree markdown. */
export function collectLocalMediaFilenamesFromTree(treeData) {
    const names = new Set();
    const re = /(?:url:\s*)?(?:\.\.?\/)?media\/([A-Za-z0-9._-]+)/gi;
    const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        if (typeof node.content === 'string') {
            let m;
            const text = node.content;
            re.lastIndex = 0;
            while ((m = re.exec(text))) names.add(m[1]);
        }
        if (Array.isArray(node.children)) node.children.forEach(walk);
    };
    if (treeData?.languages && typeof treeData.languages === 'object') {
        for (const lang of Object.keys(treeData.languages)) walk(treeData.languages[lang]);
    } else {
        walk(treeData);
    }
    return [...names];
}

function nodeHasLocalMedia(content) {
    return /(?:\.\.?\/)?media\/[A-Za-z0-9._-]+/i.test(String(content || ''));
}

function lessonTitleFromNode(node) {
    const name = String(node?.name || node?.title || '').trim();
    if (name) return name;
    const id = String(node?.id || '').trim();
    return id || 'Lesson';
}

/**
 * Lesson titles (any language) that still reference ./media/.
 * @param {object} treeData
 * @returns {string[]}
 */
export function collectLocalMediaLessonTitles(treeData) {
    const titles = [];
    const seen = new Set();
    const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        const type = String(node.type || '');
        if ((type === 'leaf' || type === 'exam') && nodeHasLocalMedia(node.content)) {
            const title = lessonTitleFromNode(node);
            const key = title.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                titles.push(title);
            }
        }
        if (Array.isArray(node.children)) node.children.forEach(walk);
    };
    if (treeData?.languages && typeof treeData.languages === 'object') {
        for (const lang of Object.keys(treeData.languages)) walk(treeData.languages[lang]);
    } else {
        walk(treeData);
    }
    return titles;
}

export function treeHasLocalMediaRefs(treeData) {
    return collectLocalMediaFilenamesFromTree(treeData).length > 0;
}
