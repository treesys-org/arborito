#!/usr/bin/env node
/**
 * Graph model smoke tests — pure functions, no DOM.
 */
import { createDefaultGraphUi } from '../src/features/tree-graph/api/graph-ui-state.js';
import { computeMobilePathNodes } from '../src/features/tree-graph/api/logic/mobile-path-nodes.js';

function assert(cond, msg) {
    if (!cond) {
        console.error(`[test-graph-smoke] FAIL: ${msg}`);
        process.exit(1);
    }
}

const root = {
    id: 'root-1',
    type: 'root',
    name: 'Root',
    children: [
        { id: 'a', type: 'branch', name: 'A', children: [] },
        { id: 'b', type: 'lesson', name: 'B', children: [] },
    ],
};

const findNode = (id) => {
    if (String(id) === 'root-1') return root;
    for (const c of root.children) {
        if (String(c.id) === String(id)) return c;
    }
    return null;
};

const emptyPath = computeMobilePathNodes([], root, findNode);
assert(emptyPath.normalizedPath[0] === 'root-1', 'empty path normalizes to root id');
assert(emptyPath.pathNodes.length === 1, 'empty path yields single root node');

const graphUi = createDefaultGraphUi();
graphUi.mobilePath = ['root-1'];
const atRoot = computeMobilePathNodes(graphUi.mobilePath, root, findNode);
assert(atRoot.pathNodes.length > 0, 'path at root yields pathNodes');

const deep = computeMobilePathNodes(['root-1', 'a'], root, findNode);
assert(deep.pathNodes.length === 2, 'deep path resolves branch node');

console.log('[test-graph-smoke] All checks passed.');
