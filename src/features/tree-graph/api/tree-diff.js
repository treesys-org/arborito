function safeStr(s) {
    return String(s == null ? '' : s);
}

function hash32Hex(str) {
    // Same style as UserStore.computeHash: fast, not cryptographic.
    const s = safeStr(str);
    if (!s) return '0';
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
        hash = ((hash << 5) - hash) + s.charCodeAt(i);
        hash |= 0;
    }
    return hash.toString(16);
}

function nodeFingerprint(n) {
    const name = safeStr((n && n.name));
    const type = safeStr((n && n.type));
    const icon = safeStr((n && n.icon));
    const desc = safeStr((n && n.description));
    const content = safeStr((n && n.content));
    return hash32Hex(`${type}|${name}|${icon}|${desc}|${content}`);
}

function flattenNodesById(treeData) {
    /** @type {Map<string, any>} */
    const out = new Map();
    const langs = (treeData && treeData.languages) && typeof treeData.languages === 'object' ? treeData.languages : {};
    const roots = Object.values(langs);
    const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        const id = safeStr(node.id);
        if (id) out.set(id, node);
        const ch = Array.isArray(node.children) ? node.children : [];
        for (const c of ch) walk(c);
    };
    for (const r of roots) walk(r);
    return out;
}

/**
 * Compute a coarse diff between two Arborito treeData objects.
 * @param {object|null} published
 * @param {object|null} draft
 */
export function diffTreeData(published, draft) {
    const a = flattenNodesById(published);
    const b = flattenNodesById(draft);
    const added = [];
    const removed = [];
    const changed = [];

    for (const [id, nodeB] of b.entries()) {
        const nodeA = a.get(id);
        if (!nodeA) {
            added.push({ id, name: safeStr((nodeB && nodeB.name)), type: safeStr((nodeB && nodeB.type)) });
            continue;
        }
        const fa = nodeFingerprint(nodeA);
        const fb = nodeFingerprint(nodeB);
        if (fa !== fb) {
            changed.push({
                id,
                before: { name: safeStr((nodeA && nodeA.name)), type: safeStr((nodeA && nodeA.type)) },
                after: { name: safeStr((nodeB && nodeB.name)), type: safeStr((nodeB && nodeB.type)) }
            });
        }
    }
    for (const [id, nodeA] of a.entries()) {
        if (!b.has(id)) removed.push({ id, name: safeStr((nodeA && nodeA.name)), type: safeStr((nodeA && nodeA.type)) });
    }

    added.sort((x, y) => x.name.localeCompare(y.name));
    removed.sort((x, y) => x.name.localeCompare(y.name));
    changed.sort((x, y) => x.after.name.localeCompare(y.after.name));

    return {
        counts: {
            published: a.size,
            draft: b.size,
            added: added.length,
            removed: removed.length,
            changed: changed.length
        },
        added,
        removed,
        changed
    };
}

