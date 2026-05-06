import { getTocLineRanges, tocRangeOutlineLevel } from './lesson-toc-mutations.js';

/**
 * Outline node in linear (visual) order.
 * depth: 0 => '##', 1 => '###', ... (clamped).
 * @typedef {{ id: string, depth: number, startLine: number, endLine: number, subtreeEndIndex: number }} OutlineNode
 */

/**
 * Map markdown heading level (1..6) to outline depth (0..).
 * We treat '##' as root depth 0, so: depth = level - 2.
 * @param {number} level
 */
export function depthFromHeadingLevel(level) {
    const lv = Number.isFinite(level) ? Math.floor(level) : 2;
    return Math.max(0, Math.min(4, lv - 2));
}

/**
 * Map outline depth (0..) to markdown heading level (2..6).
 * @param {number} depth
 */
export function headingLevelFromDepth(depth) {
    const d = Number.isFinite(depth) ? Math.floor(depth) : 0;
    return Math.max(2, Math.min(6, d + 2));
}

/**
 * Parse markdown body into outline nodes aligned with TOC.
 * @param {string} body
 * @returns {OutlineNode[]}
 */
export function parseOutline(body) {
    const ranges = getTocLineRanges(body);
    if (!ranges.length) return [];
    /** @type {OutlineNode[]} */
    const nodes = ranges
        .filter((r) => !!r && !r.isQuiz && r.headingLine != null)
        .map((r) => {
            const lv = tocRangeOutlineLevel(r);
            return {
                id: r.id,
                depth: depthFromHeadingLevel(lv),
                startLine: r.startLine,
                endLine: r.endLine,
                subtreeEndIndex: -1
            };
        });

    // subtreeEndIndex: first index after this node's subtree.
    for (let i = 0; i < nodes.length; i++) {
        const d = nodes[i].depth;
        let j = i + 1;
        while (j < nodes.length && nodes[j].depth > d) j++;
        nodes[i].subtreeEndIndex = j;
    }
    return nodes;
}

/**
 * Move a node and its subtree as a unit in the linear outline.
 * insertIndex is in terms of the full node list (0..nodes.length).
 * @param {OutlineNode[]} nodes
 * @param {number} fromIndex
 * @param {number} insertIndex
 * @returns {{ nextNodes: OutlineNode[], movedId: string|null }}
 */
export function moveSubtree(nodes, fromIndex, insertIndex) {
    const n = nodes || [];
    if (!n.length) return { nextNodes: n, movedId: null };
    const from = Math.max(0, Math.min(Math.floor(fromIndex), n.length - 1));
    let ins = Math.max(0, Math.min(Math.floor(insertIndex), n.length));

    const moved = n[from];
    if (!moved) return { nextNodes: n, movedId: null };
    const end = Math.max(from + 1, Math.min(n.length, moved.subtreeEndIndex || from + 1));
    // Disallow inserting into own subtree.
    if (ins > from && ins < end) return { nextNodes: n, movedId: moved.id || null };

    const slice = n.slice(from, end);
    const rest = [...n.slice(0, from), ...n.slice(end)];
    if (from < ins) ins -= end - from;
    const out = [...rest.slice(0, ins), ...slice, ...rest.slice(ins)];

    // Recompute subtreeEndIndex after move.
    for (let i = 0; i < out.length; i++) {
        const d = out[i].depth;
        let j = i + 1;
        while (j < out.length && out[j].depth > d) j++;
        out[i] = { ...out[i], subtreeEndIndex: j };
    }
    return { nextNodes: out, movedId: moved.id || null };
}

/**
 * Find parent id implied by depth for a node at index.
 * Parent is nearest previous node with depth == node.depth - 1.
 * @param {OutlineNode[]} nodes
 * @param {number} index
 * @returns {string|null}
 */
export function impliedParentId(nodes, index) {
    const n = nodes || [];
    const i = Math.max(0, Math.min(Math.floor(index), n.length - 1));
    const cur = n[i];
    if (!cur) return null;
    if (cur.depth <= 0) return null;
    const want = cur.depth - 1;
    for (let k = i - 1; k >= 0; k--) {
        if (n[k].depth === want) return n[k].id || null;
    }
    return null;
}

