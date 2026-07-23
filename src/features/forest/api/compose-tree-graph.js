/**
 * Compose a composed tree (árbol) from branch references into a single graph JSON.
 */

import { randomUUIDSafe } from '../../../shared/lib/secure-web-crypto.js';

/**
 * Prefix node ids when merging branches to avoid collisions across refs.
 * @param {object} node
 * @param {string} refId
 * @param {string} branchId
 */
function prefixNodeTree(node, refId, branchId) {
    if (!node || typeof node !== 'object') return node;
    const copy = JSON.parse(JSON.stringify(node));
    const walk = (n) => {
        if (!n || typeof n !== 'object') return;
        if (n.id != null) {
            n._originalId = String(n.id);
            n.id = `${refId}::${n.id}`;
        }
        n._composedRefId = refId;
        n._composedBranchId = branchId;
        if (Array.isArray(n.children)) n.children.forEach(walk);
    };
    walk(copy);
    return copy;
}

/**
 * @param {string} langCode
 * @param {object} branchData - raw curriculum JSON for one branch
 */
function pickLangRoot(branchData, langCode) {
    const langs = branchData?.languages;
    if (!langs || typeof langs !== 'object') return null;
    const code = String(langCode || 'EN').toUpperCase();
    if (langs[code]) return langs[code];
    const keys = Object.keys(langs);
    return keys.length ? langs[keys[0]] : null;
}

/**
 * @param {{
 *   treeEntry: { id: string, name: string, branchRefs: object[] },
 *   branchPayloads: Array<{ ref: object, data: object }>,
 *   lang: string,
 * }} opts
 */
export function composeTreeGraph({ treeEntry, branchPayloads, lang }) {
    const treeId = String(treeEntry.id);
    const treeName = String(treeEntry.name || 'Tree');
    const payloads = Array.isArray(branchPayloads) ? branchPayloads : [];

    if (payloads.length === 1) {
        const only = payloads[0];
        const data = JSON.parse(JSON.stringify(only.data));
        data._composedTreeId = treeId;
        data._composedSingleBranch = true;
        data._composedBranchRefId = only.ref.refId || only.ref.branchId;
        return {
            graphJson: data,
            singleBranch: true,
            virtualRootId: null,
        };
    }

    const virtualRootId = `tree-root-${treeId}`;
    const children = [];

    for (const { ref, data } of payloads) {
        const refId = String(ref.refId || ref.branchId || randomUUIDSafe());
        const branchId = String(ref.branchId || '');
        const langRoot = pickLangRoot(data, lang);
        if (!langRoot) continue;
        const prefixed = prefixNodeTree(langRoot, refId, branchId);
        const displayName = String(ref.displayName || langRoot.name || ref.branchId || 'Branch');
        children.push({
            id: `${refId}::wrapper`,
            parentId: virtualRootId,
            name: displayName,
            type: 'branch',
            icon: String(ref.icon || prefixed.icon || '🌿').trim() || '🌿',
            description: prefixed.description || '',
            path: `${treeName} / ${displayName}`,
            order: String(children.length + 1),
            expanded: false,
            _composedRefId: refId,
            _composedBranchId: branchId,
            _composedWrapper: true,
            children: Array.isArray(prefixed.children) ? prefixed.children : [],
        });
    }

    const graphJson = {
        generatedAt: new Date().toISOString(),
        universeId: treeId,
        universeName: treeName,
        _composedTree: true,
        _composedTreeId: treeId,
        languages: {
            [String(lang || 'EN').toUpperCase()]: {
                id: virtualRootId,
                name: treeName,
                type: 'root',
                icon: '🌳',
                expanded: true,
                path: treeName,
                description: '',
                _composedVirtualRoot: true,
                children,
            },
        },
    };

    return {
        graphJson,
        singleBranch: false,
        virtualRootId,
    };
}

/**
 * Resolve composed branch refId from the mobile navigation path.
 * @param {object|null} data, active graph root node
 * @param {string[]} mobilePath
 * @returns {string|null}
 */
export function resolveComposedRefIdFromMobilePath(data, mobilePath) {
    const path = Array.isArray(mobilePath) ? mobilePath.map(String) : [];
    if (!data || path.length <= 1) return null;

    for (const seg of path) {
        if (seg.endsWith('::wrapper')) {
            const ref = seg.slice(0, -'::wrapper'.length);
            if (ref) return ref;
        }
    }

    let node = data;
    for (let i = 1; i < path.length; i++) {
        const children = node?.children;
        if (!Array.isArray(children)) return null;
        const next = children.find((c) => String(c.id) === path[i]);
        if (!next) return null;
        node = next;
    }

    if (node?._composedRefId) return String(node._composedRefId);
    return null;
}

/**
 * Resolve progress scope from navigation path.
 * @param {object|null} treeContext
 * @param {string[]} mobilePath
 * @param {object|null} data - active graph root node
 */
export function resolveTreeProgressScope(treeContext, mobilePath, data) {
    if (!treeContext || treeContext.kind !== 'composed-tree') {
        return { scope: 'branch', branchRefId: null };
    }
    if (treeContext.singleBranch) {
        return { scope: 'branch', branchRefId: treeContext.branchRefId || null };
    }
    const path = Array.isArray(mobilePath) ? mobilePath : [];
    if (path.length <= 1) {
        return { scope: 'tree', branchRefId: null };
    }
    const branchRefId =
        resolveComposedRefIdFromMobilePath(data, path) || treeContext.activeBranchRefId || null;
    return { scope: branchRefId ? 'branch' : 'tree', branchRefId };
}
