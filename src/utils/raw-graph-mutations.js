/**
 * Pure mutations on rawGraphData.languages[*] for Nostr / in-memory trees.
 * Node ids are shared across languages; structure is mirrored when possible.
 */

import { randomUUIDSafe } from './secure-web-crypto.js';

/** @param {string|null|undefined} s */
export function normalizePathKey(s) {
    if (s == null || s === '') return '';
    let x = String(s).trim();
    if (x.endsWith('/meta.json')) x = x.slice(0, -'/meta.json'.length);
    if (x.endsWith('.md')) {
        const i = x.lastIndexOf('/');
        x = i >= 0 ? x.slice(0, i) : '';
    }
    return x
        .replace(/\s*\/\s*/g, '/')
        .replace(/\/+/g, '/')
        .replace(/\/+$/, '')
        .toLowerCase();
}

/** Folder path for a folder-like node; for leaves, parent folder path (from sourcePath/path). */
export function folderPathForNode(n) {
    const p = (n.sourcePath || '').trim();
    if (!p) return (n.path || '').trim();
    if (p.endsWith('/meta.json')) return p.slice(0, -'/meta.json'.length);
    if (p.endsWith('.md')) {
        const i = p.lastIndexOf('/');
        return i >= 0 ? p.slice(0, i) : '';
    }
    return p.replace(/\/+$/, '');
}

export function findNodeById(root, id) {
    if (!root) return null;
    if (String(root.id) === String(id)) return root;
    if (root.children) {
        for (const c of root.children) {
            const f = findNodeById(c, id);
            if (f) return f;
        }
    }
    return null;
}

export function findParentOf(root, childId) {
    if (!(root && root.children)) return null;
    for (let i = 0; i < root.children.length; i++) {
        const c = root.children[i];
        if (String(c.id) === String(childId)) return { parent: root, index: i, child: c };
        const sub = findParentOf(c, childId);
        if (sub) return sub;
    }
    return null;
}

export function collectDescendantIds(node, out = new Set()) {
    if (!node) return out;
    out.add(String(node.id));
    if (node.children) node.children.forEach((child) => collectDescendantIds(child, out));
    return out;
}

export function isUnderSubtree(root, subtreeRootId, nodeId) {
    const sub = findNodeById(root, subtreeRootId);
    if (!sub) return false;
    return collectDescendantIds(sub).has(String(nodeId));
}

function pathKeysForMatch(n) {
    const keys = new Set();
    if (n.path) keys.add(normalizePathKey(n.path));
    if (n.sourcePath) keys.add(normalizePathKey(n.sourcePath));
    const fp = folderPathForNode(n);
    if (fp) keys.add(normalizePathKey(fp));
    return keys;
}

/**
 * Find a node whose path/sourcePath/folder path matches a dock/filesystem path string.
 */
export function findNodeByPathHint(root, pathStr) {
    if (!pathStr || !root) return null;
    const want = normalizePathKey(pathStr);
    if (!want) return null;
    let found = null;
    const walk = (n) => {
        const keys = pathKeysForMatch(n);
        if (keys.has(want)) found = n;
        (n.children && n.children.forEach)(walk);
    };
    walk(root);
    return found;
}

export function updatePathsFromRoot(root) {
    const walk = (n, parentPath) => {
        const path = parentPath ? `${parentPath} / ${n.name}` : n.name;
        n.path = path;
        if (n.children) n.children.forEach((ch) => walk(ch, path));
    };
    walk(root, '');
}

/**
 * @param {object} raw - rawGraphData
 * @param {string} preferredLang
 * @param {string} folderPath - directoryPathForNewChild output
 */
export function findParentByFolderPath(raw, preferredLang, folderPath) {
    if (!(raw && raw.languages) || !folderPath) return null;
    const langData = raw.languages[preferredLang] || raw.languages[Object.keys(raw.languages)[0]];
    if (!langData) return null;
    return findNodeByPathHint(langData, folderPath);
}

/**
 * @returns {{ ok: boolean, newId?: string }}
 */
export function addChildToAllLanguages(raw, parentId, { name, type, leafMarkdown }) {
    if (!(raw && raw.languages) || !parentId || !name) return { ok: false };
    const newId = randomUUIDSafe();
    const isFolder = type === 'folder';
    const branchType = isFolder ? 'branch' : 'leaf';
    const md = typeof leafMarkdown === 'string' && leafMarkdown.trim() ? leafMarkdown : `# ${name}\n\n`;

    let any = false;
    for (const lang of Object.keys(raw.languages)) {
        const root = raw.languages[lang];
        const parent = findNodeById(root, parentId);
        if (!parent || (parent.type !== 'branch' && parent.type !== 'root')) continue;
        if (!parent.children) parent.children = [];
        const node = {
            id: newId,
            parentId: parent.id,
            name,
            type: branchType,
            icon: isFolder ? '📁' : '📄',
            path: `${parent.path || parent.name} / ${name}`,
            order: '99',
            ...(isFolder ? { children: [] } : { content: md })
        };
        parent.children.push(node);
        updatePathsFromRoot(root);
        any = true;
    }
    return any ? { ok: true, newId } : { ok: false };
}

/**
 * @returns {boolean}
 */
export function removeNodeByIdAllLanguages(raw, nodeId) {
    if (!(raw && raw.languages) || !nodeId) return false;
    let any = false;
    for (const lang of Object.keys(raw.languages)) {
        const root = raw.languages[lang];
        const hit = findNodeById(root, nodeId);
        if ((hit && hit.type) === 'root') continue;
        if (removeNodeById(root, nodeId)) {
            updatePathsFromRoot(root);
            any = true;
        }
    }
    return any;
}

function removeNodeById(root, nodeId) {
    const res = findParentOf(root, nodeId);
    if (!res) return false;
    res.parent.children.splice(res.index, 1);
    return true;
}

/**
 * @returns {boolean}
 */
export function renameNodeByIdAllLanguages(raw, nodeId, newName) {
    if (!(raw && raw.languages) || !nodeId || !newName) return false;
    let any = false;
    for (const lang of Object.keys(raw.languages)) {
        const root = raw.languages[lang];
        const n = findNodeById(root, nodeId);
        if (!n || n.type === 'root') continue;
        n.name = newName;
        updatePathsFromRoot(root);
        any = true;
    }
    return any;
}

/**
 * Move nodeId to be child of newParentId (folder/root).
 * @returns {boolean}
 */
export function reparentNodeByIdAllLanguages(raw, nodeId, newParentId) {
    if (!(raw && raw.languages) || !nodeId || !newParentId) return false;
    if (String(nodeId) === String(newParentId)) return false;

    let any = false;
    for (const lang of Object.keys(raw.languages)) {
        const root = raw.languages[lang];
        const moving = findNodeById(root, nodeId);
        const newParent = findNodeById(root, newParentId);
        if (!moving || !newParent || moving.type === 'root') continue;
        if (newParent.type !== 'branch' && newParent.type !== 'root') continue;
        if (String(moving.parentId) === String(newParentId)) continue;
        if (isUnderSubtree(root, nodeId, newParentId)) continue;

        const lifted = findParentOf(root, nodeId);
        if (!lifted) continue;
        lifted.parent.children.splice(lifted.index, 1);

        moving.parentId = newParent.id;
        if (!newParent.children) newParent.children = [];
        newParent.children.push(moving);
        updatePathsFromRoot(root);
        any = true;
    }
    return any;
}
