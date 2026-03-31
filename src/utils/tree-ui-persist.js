/**
 * Persistencia del camino móvil (tronco) y ramas expandidas por fuente + idioma,
 * para que F5 no pierda el contexto del árbol.
 */

const STORAGE_VERSION = 1;
const STORAGE_PREFIX = 'arborito-tree-ui:';

function storageKey(sourceId, lang) {
    return `${STORAGE_PREFIX}${String(sourceId || '')}:${String(lang || 'EN')}`;
}

function collectExpandedIds(root) {
    const ids = [];
    const walk = (node) => {
        if (!node) return;
        if ((node.type === 'branch' || node.type === 'root') && node.expanded) {
            ids.push(String(node.id));
        }
        if (node.children) node.children.forEach(walk);
    };
    walk(root);
    return ids;
}

function applyExpandedSnapshot(root, expandedSet) {
    const walk = (node) => {
        if (!node) return;
        if (node.type === 'branch' || node.type === 'root') {
            node.expanded = expandedSet.has(String(node.id));
        }
        if (node.children) node.children.forEach(walk);
    };
    walk(root);
}

function validateMobilePath(root, ids) {
    if (!root) return [];
    const want = Array.isArray(ids) ? ids.map(String) : [];
    if (want.length === 0 || String(want[0]) !== String(root.id)) {
        return [String(root.id)];
    }
    const out = [String(root.id)];
    let cur = root;
    for (let i = 1; i < want.length; i++) {
        const id = want[i];
        const kids = cur.children || [];
        const next = kids.find((c) => String(c.id) === id);
        if (!next) break;
        out.push(id);
        cur = next;
    }
    return out;
}

function getGraphElement() {
    return document.querySelector('arborito-graph');
}

/** @param {EventTarget & { state: { data: object, activeSource: object, lang: string } }} store */
export function persistTreeUiState(store) {
    const root = store.state.data;
    const source = store.state.activeSource;
    if (!root || !source) return;
    try {
        const graph = getGraphElement();
        const mobilePath =
            graph && Array.isArray(graph.mobilePath) && graph.mobilePath.length > 0
                ? graph.mobilePath.map(String)
                : [String(root.id)];
        const expandedIds = collectExpandedIds(root);
        const payload = { v: STORAGE_VERSION, mobilePath, expandedIds };
        localStorage.setItem(storageKey(source.id, store.state.lang), JSON.stringify(payload));
    } catch (e) {
        console.warn('tree-ui-persist: save failed', e);
    }
}

let _debounceTimer = null;

/** @param {EventTarget & { state: { data: object, activeSource: object, lang: string } }} store */
export function schedulePersistTreeUiState(store) {
    if (_debounceTimer != null) clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
        _debounceTimer = null;
        persistTreeUiState(store);
    }, 200);
}

/** @param {EventTarget & { state: { data: object, activeSource: object, lang: string } }} store */
export function restoreTreeUiStateAfterLoad(store) {
    const root = store.state.data;
    const source = store.state.activeSource;
    if (!root || !source) return;

    let parsed = null;
    try {
        const raw = localStorage.getItem(storageKey(source.id, store.state.lang));
        if (raw) parsed = JSON.parse(raw);
    } catch {
        return;
    }
    if (!parsed || parsed.v !== STORAGE_VERSION) return;

    if (Array.isArray(parsed.expandedIds) && parsed.expandedIds.length > 0) {
        applyExpandedSnapshot(root, new Set(parsed.expandedIds.map(String)));
    }

    if (Array.isArray(parsed.mobilePath) && parsed.mobilePath.length > 0) {
        const mobilePath = validateMobilePath(root, parsed.mobilePath);
        store.dispatchEvent(new CustomEvent('arborito-set-mobile-path', { detail: { ids: mobilePath } }));
    }
}
