import { TreeUtils } from '../../tree-graph/api/tree-utils.js';

export const TREE_CERT_PREFIX = '__tree_cert__:';

/** Match composed `ref::id` and bare lesson ids in a completion set. */
export function setHasCompletableId(set, nodeId) {
    const id = String(nodeId || '');
    if (!id) return false;
    if (set.has(id)) return true;
    const sep = id.indexOf('::');
    if (sep >= 0) {
        const bare = id.slice(sep + 2);
        if (bare && set.has(bare)) return true;
    } else {
        const suffix = `::${id}`;
        for (const c of set) {
            if (String(c).endsWith(suffix)) return true;
        }
    }
    return false;
}

/** @param {string} rootNodeId */
export function makeTreeCertificateId(rootNodeId) {
    return `${TREE_CERT_PREFIX}${String(rootNodeId || '').trim()}`;
}

/** @param {string} id */
export function parseTreeCertificateId(id) {
    const s = String(id || '');
    if (!s.startsWith(TREE_CERT_PREFIX)) return null;
    return s.slice(TREE_CERT_PREFIX.length) || null;
}

/** @param {object} node */
export function isSubtreeComplete(node, completedNodes) {
    if (!node) return false;
    const set = completedNodes instanceof Set ? completedNodes : new Set(completedNodes || []);
    if (setHasCompletableId(set, node.id)) return true;
    const leafIds = TreeUtils.collectDescendantCompletableIds(node, []);
    if (!leafIds.length) return false;
    return leafIds.every((id) => setHasCompletableId(set, id));
}

/**
 * Tree-level trophy for composed trees (playlist). Standalone curricula use a branch trophy instead.
 * See `docs/terminology.md`.
 */
export function shouldShowTreeCertificate(store) {
    if (!store?.state?.data) return false;
    const ctx = store.state.treeContext;
    return ctx?.kind === 'composed-tree';
}

/**
 * @param {import('../../../core/store-singleton.js').ArboritoStore | null} store
 * @returns {object|null}
 */
export function buildTreeCertificateEntry(store) {
    if (!store?.state?.data || !shouldShowTreeCertificate(store)) return null;

    const data = store.state.data;
    const raw = store.state.rawGraphData;
    const ctx = store.state.treeContext;
    const completed = store.userStore?.state?.completedNodes;
    const completedSafe = completed instanceof Set ? completed : new Set();

    const rootId = String(data.id || '');
    if (!rootId) return null;

    const name =
        String(raw?.universeName || store.state.activeSource?.name || data.name || '').trim() || 'Tree';

    let isComplete = false;
    if (ctx?.kind === 'composed-tree' && !ctx.singleBranch) {
        const wrappers = (data.children || []).filter((c) => String(c.id).endsWith('::wrapper'));
        if (wrappers.length) {
            isComplete = wrappers.every((w) => isSubtreeComplete(w, completedSafe));
        } else {
            isComplete = isSubtreeComplete(data, completedSafe);
        }
    } else {
        isComplete = isSubtreeComplete(data, completedSafe);
    }

    return {
        id: makeTreeCertificateId(rootId),
        name,
        icon: data.icon || '🌳',
        description: data.description || '',
        isCertifiable: true,
        isComplete,
        isTreeCertificate: true,
        scope: 'tree',
        path: data.path || name,
    };
}

/**
 * Resolve a certificate display node (real graph node or synthetic tree diploma).
 * @param {import('../../../core/store-singleton.js').ArboritoStore | null} store
 * @param {string} moduleId
 * @param {(id: string) => object|null} findNode
 */
export function resolveCertificateDisplayNode(store, moduleId, findNode) {
    const rootId = parseTreeCertificateId(moduleId);
    if (rootId && store?.state?.data && String(store.state.data.id) === rootId) {
        const entry = buildTreeCertificateEntry(store);
        if (!entry) return null;
        return {
            id: entry.id,
            name: entry.name,
            icon: entry.icon,
            description: entry.description,
            type: 'root',
            isTreeCertificate: true,
        };
    }
    return findNode?.(moduleId) || null;
}

/**
 * @param {import('../../../core/store-singleton.js').ArboritoStore | null} store
 * @param {object[]} moduleCerts
 */
export function mergeTreeCertificate(moduleCerts, store) {
    const treeCert = buildTreeCertificateEntry(store);
    if (!treeCert) return moduleCerts;
    const withoutDup = (moduleCerts || []).filter((c) => String(c.id) !== treeCert.id);
    return [treeCert, ...withoutDup];
}
