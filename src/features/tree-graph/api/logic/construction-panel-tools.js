import { getArboritoStore as store } from '../../../../core/store-singleton.js';

/** Composed-tree playlist root (virtual root listing branch refs). */
export function isComposedTreePlaylistRoot(folderNode) {
    if (store.state.activeSource?.type !== 'composed-tree') return false;
    const pathLen = store.state.graphUi?.mobilePath?.length || 1;
    if (pathLen > 1) return false;
    return !!folderNode?._composedVirtualRoot;
}

function activeComposedTreeEntry() {
    const treeId = store.state.activeSource?.treeId;
    if (!treeId) return null;
    return store.userStore?.getTree?.(treeId) || null;
}

function branchRefsInTreeKeys(entry) {
    const keys = new Set();
    for (const r of entry?.branchRefs || []) {
        const bid = String(r.branchId || r.refId || '').trim();
        const url = String(r.networkUrl || r.sourceUrl || '').trim();
        if (bid) keys.add(`id:${bid}`);
        if (url) keys.add(`url:${url}`);
    }
    return keys;
}

function scorePickerMatch(q, name, id) {
    const qq = String(q || '').trim().toLowerCase();
    if (!qq) return 1;
    const h = String(name || '').trim().toLowerCase();
    const hid = String(id || '').trim().toLowerCase();
    if (h === qq || hid === qq) return 100;
    if (h.startsWith(qq)) return 50;
    if (h.includes(qq)) return 10;
    if (hid.includes(qq)) return 8;
    return 0;
}

/** Local + installed community branches not already in the active composed tree. */
export function pickerCandidatesNotInActiveTree() {
    const entry = activeComposedTreeEntry();
    if (!entry) return [];
    const inTree = branchRefsInTreeKeys(entry);
    const out = [];

    for (const b of store.userStore?.state?.branches || []) {
        const id = String(b?.id || '').trim();
        if (!id || inTree.has(`id:${id}`) || inTree.has(`url:branch://${id}`)) continue;
        out.push({ kind: 'local', id, name: String(b.name || id), addKey: `local:${id}` });
    }

    for (const s of store.state.communitySources || []) {
        if (!s) continue;
        if (String(s.contentKind || '').trim() === 'composed-tree') continue;
        const id = String(s.id || '').trim();
        const url = String(s.url || '').trim();
        if (!id) continue;
        if (inTree.has(`id:${id}`) || (url && inTree.has(`url:${url}`))) continue;
        out.push({ kind: 'installed', id, name: String(s.name || id), url, addKey: `installed:${id}` });
    }

    return out;
}

export function filterPickerCandidates(candidates, query) {
    const q = String(query || '').trim();
    if (!q) return candidates;
    return candidates
        .map((c) => ({ ...c, _score: scorePickerMatch(q, c.name, c.id) }))
        .filter((c) => c._score > 0)
        .sort((a, b) => b._score - a._score || String(a.name).localeCompare(String(b.name)));
}

export function shouldShowMoveHereInPanel(graph, folderNode) {
    if (!graph?.pendingMoveNodeId || !folderNode) return false;
    const srcId = graph.pendingMoveNodeId;
    const moving = store.findNode(srcId);
    if (!moving || moving.type === 'root') return false;
    if (String(folderNode.id) === String(srcId)) return false;
    if (folderNode.type !== 'root' && folderNode.type !== 'branch') return false;
    return true;
}
