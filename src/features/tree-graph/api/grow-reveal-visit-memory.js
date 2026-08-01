/** Per-mounted-curriculum set of node ids that already played grow-reveal. */
const visitedByMount = new Map();

function visitSet(mountKey) {
    const key = String(mountKey || '');
    let set = visitedByMount.get(key);
    if (!set) {
        set = new Set();
        visitedByMount.set(key, set);
        /* Drop other mounts — only the open curriculum matters. */
        if (visitedByMount.size > 2) {
            for (const k of visitedByMount.keys()) {
                if (k !== key) visitedByMount.delete(k);
            }
        }
    }
    return set;
}

export function hasGrowRevealVisit(mountKey, nodeId) {
    const id = String(nodeId || '').trim();
    if (!id) return false;
    return visitSet(mountKey).has(id);
}

export function markGrowRevealVisit(mountKey, nodeId) {
    const id = String(nodeId || '').trim();
    if (!id) return;
    visitSet(mountKey).add(id);
}
