import { TreeUtils } from '../tree-graph/tree-utils.js';

const AI_CONTEXT_PRESET_KEYS = new Set(['micro', 'minimal', 'balanced']);

export function resolveAiContextPreset(preset) {
    const key = String(preset || '').toLowerCase();
    if (AI_CONTEXT_PRESET_KEYS.has(key)) return key;
    return 'minimal';
}

function clampStr(s, maxChars) {
    if (!s) return '';
    const str = String(s);
    if (!Number.isFinite(maxChars) || maxChars <= 0) return '';
    if (str.length <= maxChars) return str;
    return str.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…';
}

function chainFromRootToTarget(root, targetId) {
    if (!root || targetId === undefined || targetId === null) return null;
    const want = String(targetId);
    let found = null;
    const walk = (node, prefix) => {
        const chain = prefix.concat(node);
        if (String(node.id) === want) {
            found = chain;
            return true;
        }
        const kids = node.children;
        if (!kids || kids.length === 0) return false;
        for (let i = 0; i < kids.length; i++) {
            if (walk(kids[i], chain)) return true;
        }
        return false;
    };
    walk(root, []);
    return found;
}

export function buildTreeBreadcrumb(store, contextNode, { maxChars = 500 } = {}) {
    const root = ((store && store.state) ? store.state.data : undefined);
    if (!root || !contextNode) return '';

    const id = contextNode.id;
    const target = TreeUtils.findNode(id, root) || contextNode;

    let chain = [];
    let cur = target;
    // Prefer parentId chain when available (lazy loaded children set it).
    while (cur) {
        chain.unshift(cur);
        cur = cur.parentId ? TreeUtils.findNode(cur.parentId, root) : null;
    }
    if (chain.length === 0 || String((chain[0] ? chain[0].id : undefined)) !== String(root.id)) {
        const walked = chainFromRootToTarget(root, target.id);
        if (walked && walked.length) chain = walked;
    }
    if (chain.length === 0) return '';

    const names = chain.map((n) => String(n.type === 'root' ? (((store && store.ui) ? store.ui.navHome : undefined) || 'Home') : (n.name || '')).trim()).filter(Boolean);
    const breadcrumb = names.join(' / ');
    return clampStr(breadcrumb, maxChars);
}
