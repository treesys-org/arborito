import { TreeUtils } from '../tree-utils.js';

/**
 * Pure path resolution, no store / graph mutations.
 * @returns {{ pathNodes: object[], current: object, normalizedPath: string[], pendingDeeperPathLoad: boolean }}
 */
export function computeMobilePathNodes(mobilePath, root, findNode) {
    if (!root) {
        return { pathNodes: [], current: null, normalizedPath: [], pendingDeeperPathLoad: false };
    }

    let path = Array.isArray(mobilePath) ? mobilePath.map(String) : [];
    if (path.length === 0 || String(path[0]) !== String(root.id)) {
        path = [String(root.id)];
    }

    const pathNodes = [];
    let current = root;
    pathNodes.push(current);
    let pendingDeeperPathLoad = false;

    for (let i = 1; i < path.length; i++) {
        const targetId = String(path[i]);
        const next = TreeUtils.resolvePathChild(current, targetId, findNode);
        if (!next) {
            if (current?.hasUnloadedChildren) {
                pendingDeeperPathLoad = true;
            }
            break;
        }
        current = next;
        pathNodes.push(current);
    }

    const normalizedPath = pendingDeeperPathLoad ? path : pathNodes.map((n) => String(n.id));

    return { pathNodes, current, normalizedPath, pendingDeeperPathLoad };
}
