/**
 * Arborito catalog, IndexedDB for branches, composed trees, and installed network branches.
 */
import {
    migrateLegacyBranchId,
    normalizeBranchCatalogEntry,
    normalizeComposedTreeBranchRefs,
} from './branch-id.js';

const DB_NAME = 'arborito_catalog_v2';
const DB_NAME_V1 = 'arborito_catalog_v1';
const STORE_COMMUNITY = 'communityBranches';
const STORE_BRANCH_META = 'branchMeta';
const STORE_BRANCH_DATA = 'branchData';
const STORE_TREE_META = 'treeMeta';
const STORE_TREE_DATA = 'treeData';

/** v1 store names (pre Branches/Árboles split). */
const V1_LOCAL_META = 'localMeta';
const V1_LOCAL_DATA = 'localData';
const V1_COMMUNITY = 'communitySources';

let _catalogMigrationPromise = null;

function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            for (const [name, keyPath] of [
                [STORE_COMMUNITY, 'id'],
                [STORE_BRANCH_META, 'id'],
                [STORE_BRANCH_DATA, 'branchId'],
                [STORE_TREE_META, 'id'],
                [STORE_TREE_DATA, 'treeId'],
            ]) {
                if (!db.objectStoreNames.contains(name)) {
                    db.createObjectStore(name, { keyPath });
                }
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

function openDbV1() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME_V1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('catalog v1 open blocked'));
    });
}

async function readAllFromStore(db, storeName) {
    if (!db.objectStoreNames.contains(storeName)) return [];
    const tx = db.transaction(storeName, 'readonly');
    const rows = await idbRequest(tx.objectStore(storeName).getAll());
    return Array.isArray(rows) ? rows : [];
}

/** One-time migration from arborito_catalog_v1 → v2 (local-* ids become branch-*). */
async function migrateCatalogV1IfNeeded() {
    if (_catalogMigrationPromise) return _catalogMigrationPromise;
    _catalogMigrationPromise = (async () => {
        let v1;
        try {
            v1 = await openDbV1();
        } catch {
            return;
        }
        try {
            const existing = await loadBranchesFromV2();
            if (existing.length) return;

            const metas = await readAllFromStore(v1, V1_LOCAL_META);
            if (!metas.length) return;

            const dataRows = await readAllFromStore(v1, V1_LOCAL_DATA);
            const dataById = new Map();
            for (const row of dataRows) {
                const rawId = row?.localId || row?.branchId || row?.id;
                if (rawId) dataById.set(String(rawId), row);
            }

            for (const meta of metas) {
                if (!meta?.id) continue;
                const legacyId = String(meta.id);
                const id = migrateLegacyBranchId(legacyId);
                const dataRow = dataById.get(legacyId) || dataById.get(id);
                const data = dataRow?.data;
                const entry = normalizeBranchCatalogEntry({ ...meta, id, data });
                await persistBranchEntry(entry);
            }

            const community = await readAllFromStore(v1, V1_COMMUNITY);
            if (community.length) {
                await replaceCommunitySources(community);
            }
        } catch (e) {
            console.warn('[Arborito] catalog v1 migration failed', e);
        } finally {
            v1.close();
        }
    })();
    return _catalogMigrationPromise;
}

// --- Installed network branches (bookmarks) ---

export async function loadCommunitySources() {
    const db = await openDb();
    try {
        const tx = db.transaction(STORE_COMMUNITY, 'readonly');
        const rows = await idbRequest(tx.objectStore(STORE_COMMUNITY).getAll());
        return Array.isArray(rows) ? rows : [];
    } finally {
        db.close();
    }
}

export async function replaceCommunitySources(sources) {
    const list = Array.isArray(sources) ? sources : [];
    const db = await openDb();
    try {
        const tx = db.transaction(STORE_COMMUNITY, 'readwrite');
        const store = tx.objectStore(STORE_COMMUNITY);
        await idbRequest(store.clear());
        for (const row of list) {
            if (row?.id) await idbRequest(store.put(row));
        }
        return true;
    } finally {
        db.close();
    }
}

// --- Local branches (.arborito curriculum units) ---

export async function loadBranches() {
    await migrateCatalogV1IfNeeded();
    return loadBranchesFromV2();
}

async function loadBranchesFromV2() {
    const db = await openDb();
    try {
        const tx = db.transaction([STORE_BRANCH_META, STORE_BRANCH_DATA], 'readonly');
        const metas = await idbRequest(tx.objectStore(STORE_BRANCH_META).getAll());
        if (!Array.isArray(metas) || !metas.length) return [];
        const dataStore = tx.objectStore(STORE_BRANCH_DATA);
        const out = [];
        for (const meta of metas) {
            if (!meta?.id) continue;
            const row = await idbRequest(dataStore.get(meta.id));
            const entry = row?.data ? { ...meta, data: row.data } : { ...meta };
            out.push(normalizeBranchCatalogEntry(entry));
        }
        return out;
    } finally {
        db.close();
    }
}

/** @param {{ id: string, data?: object }} entry */
export async function persistBranchEntry(entry) {
    if (!entry?.id) return false;
    const { data, ...meta } = entry;
    const db = await openDb();
    try {
        const tx = db.transaction([STORE_BRANCH_META, STORE_BRANCH_DATA], 'readwrite');
        await idbRequest(tx.objectStore(STORE_BRANCH_META).put(meta));
        if (data && typeof data === 'object') {
            await idbRequest(
                tx.objectStore(STORE_BRANCH_DATA).put({ branchId: entry.id, data, updatedAt: Date.now() })
            );
        }
        return true;
    } finally {
        db.close();
    }
}

export async function removeBranchFromCatalog(branchId) {
    if (!branchId) return false;
    const db = await openDb();
    try {
        const tx = db.transaction([STORE_BRANCH_META, STORE_BRANCH_DATA], 'readwrite');
        await idbRequest(tx.objectStore(STORE_BRANCH_META).delete(branchId));
        await idbRequest(tx.objectStore(STORE_BRANCH_DATA).delete(branchId));
        return true;
    } finally {
        db.close();
    }
}

// --- Composed trees (collections of branch refs) ---

export async function loadTrees() {
    const db = await openDb();
    try {
        const tx = db.transaction([STORE_TREE_META, STORE_TREE_DATA], 'readonly');
        const metas = await idbRequest(tx.objectStore(STORE_TREE_META).getAll());
        if (!Array.isArray(metas) || !metas.length) return [];
        const dataStore = tx.objectStore(STORE_TREE_DATA);
        const out = [];
        for (const meta of metas) {
            if (!meta?.id) continue;
            const row = await idbRequest(dataStore.get(meta.id));
            const branchRefs = row?.branchRefs ?? meta.branchRefs;
            const normalizedRefs = normalizeComposedTreeBranchRefs(branchRefs);
            out.push(normalizedRefs ? { ...meta, branchRefs: normalizedRefs } : { ...meta });
        }
        return out;
    } finally {
        db.close();
    }
}

/** @param {{ id: string, branchRefs: object[] }} entry */
export async function persistTreeEntry(entry) {
    if (!entry?.id) return false;
    const { branchRefs, ...meta } = entry;
    const db = await openDb();
    try {
        const tx = db.transaction([STORE_TREE_META, STORE_TREE_DATA], 'readwrite');
        await idbRequest(tx.objectStore(STORE_TREE_META).put(meta));
        if (Array.isArray(branchRefs)) {
            await idbRequest(
                tx.objectStore(STORE_TREE_DATA).put({
                    treeId: entry.id,
                    branchRefs,
                    updatedAt: Date.now(),
                })
            );
        }
        return true;
    } finally {
        db.close();
    }
}

export async function removeTreeFromCatalog(treeId) {
    if (!treeId) return false;
    const db = await openDb();
    try {
        const tx = db.transaction([STORE_TREE_META, STORE_TREE_DATA], 'readwrite');
        await idbRequest(tx.objectStore(STORE_TREE_META).delete(treeId));
        await idbRequest(tx.objectStore(STORE_TREE_DATA).delete(treeId));
        return true;
    } finally {
        db.close();
    }
}
