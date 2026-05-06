import { store } from '../store.js';
import { parseNostrTreeUrl } from './nostr-refs.js';
import { parseArboritoFile } from '../utils/editor-engine.js';
import { findNodeById, findNodeByPathHint } from '../utils/raw-graph-mutations.js';

class FileSystemService {
    get activeSource() {
        return store.value.activeSource;
    }

    /**
     * Tree id in `userStore.localTrees` (do not confuse with composite `activeSource.id`
     * when viewing an archived version: `uuid-label` vs `local://uuid`).
     */
    localGardenTreeId() {
        const src = this.activeSource;
        if (!src) return null;
        const u = String(src.url || '');
        if (u.startsWith('local://')) {
            return u.slice('local://'.length).split('/')[0] || null;
        }
        if (src.type === 'local' && src.id) return String(src.id);
        return src.id != null ? String(src.id) : null;
    }

    get isLocal() {
        const src = this.activeSource;
        return src && (src.type === 'local' || (src.url && src.url.startsWith('local://')));
    }

    /** Nostr-backed trees are edited in-memory and published via Nostr bundle. */
    isNostrTreeSource() {
        const src = this.activeSource;
        return !!((src && src.url) && parseNostrTreeUrl(src.url));
    }

    /** HTTPS / archive / read-only bundles: view from in-memory graph only. */
    isMemoryReadOnlySource() {
        return !this.isLocal && !this.isNostrTreeSource();
    }

    get features() {
        if (this.isLocal) {
            return {
                canWrite: true,
                hasGovernance: false,
                canDelete: true,
                canMove: true,
                isRealtime: true
            };
        }
        if (this.isNostrTreeSource()) {
            const role =
                typeof store.getMyTreeNetworkRole === 'function' ? store.getMyTreeNetworkRole() : null;
            const canWrite = role === 'owner' || role === 'editor';
            return {
                canWrite,
                hasGovernance: role === 'owner' || role === 'proposer',
                canDelete: canWrite,
                canMove: canWrite,
                isRealtime: false,
                networkTreeRole: role
            };
        }
        return {
            canWrite: false,
            hasGovernance: false,
            canDelete: false,
            canMove: false,
            isRealtime: false
        };
    }

    // --- READ OPERATIONS ---

    async getFile(nodeId, sourcePath = null) {
        if (this.isLocal) {
            const node = store.findNode(nodeId);
            if (!node) {
                if (nodeId.startsWith('new-')) return { content: '', meta: {}, sha: null };
                throw new Error(store.ui.fileNotFound || 'File not found in local garden.');
            }

            const rawContent = node.content || '';
            if (node.type === 'branch' || node.type === 'root') {
                return {
                    content: JSON.stringify(
                        {
                            name: node.name,
                            icon: node.icon,
                            description: node.description,
                            order: node.order
                        },
                        null,
                        2
                    ),
                    sha: null,
                    isMeta: true
                };
            }

            const parsed = parseArboritoFile(rawContent);
            const meta = {
                title: node.name,
                icon: node.icon,
                description: node.description,
                order: node.order,
                ...parsed.meta
            };

            return { content: rawContent, meta, body: parsed.body, sha: null, isMeta: false };
        }

        // In-memory graph (Nostr tree, HTTPS curriculum, etc.)
        const node = store.findNode(nodeId);
        if (!node) {
            if (String(nodeId).startsWith('new-')) return { content: '', meta: {}, sha: null };
            throw new Error(store.ui.fileNotFound || 'Node not found.');
        }

        if (node.type === 'branch' || node.type === 'root') {
            return {
                content: JSON.stringify(
                    {
                        name: node.name,
                        icon: node.icon,
                        description: node.description,
                        order: node.order
                    },
                    null,
                    2
                ),
                sha: null,
                isMeta: true,
                meta: {},
                body: ''
            };
        }

        const rawContent = node.content || '';
        const parsed = parseArboritoFile(rawContent);
        const meta = {
            title: node.name,
            icon: node.icon,
            description: node.description,
            order: node.order,
            ...parsed.meta
        };
        return { content: rawContent, meta, body: parsed.body, sha: null, isMeta: false };
    }

    async getTree(path = 'content') {
        if (this.isLocal) {
            const treeId = this.localGardenTreeId();
            const treeData = store.userStore.getLocalTreeData(treeId);
            if (!treeData) return [];

            const flatList = [];
            const traverse = (node, currentPath) => {
                const myPath = currentPath ? `${currentPath}/${node.name}` : node.name;
                flatList.push({
                    path: myPath,
                    type: node.type === 'branch' || node.type === 'root' ? 'tree' : 'blob',
                    sha: null,
                    id: node.id
                });
                if (node.children) node.children.forEach((child) => traverse(child, myPath));
            };
            Object.values(treeData.languages).forEach((root) => traverse(root, ''));
            return flatList;
        }
        return [];
    }

    // --- WRITE OPERATIONS ---

    async saveFile(node, content, meta, commitMsg) {
        if (this.isLocal) {
            const treeId = this.localGardenTreeId();
            const success = store.userStore.updateLocalNode(treeId, node.id, content, meta);

            if (success) {
                const updatedSource = store.userStore.getLocalTreeData(treeId);
                store.processLoadedData(updatedSource);
                return { success: true, mode: 'instant' };
            }
            throw new Error(store.ui.saveFailedLocal || 'Local save failed. Node not found.');
        }

        if (this.isNostrTreeSource()) {
            const ok = store.applyNodeContentToRawGraph(node.id, content, meta);
            if (ok) return { success: true, mode: 'instant' };
            throw new Error(store.ui.saveFailedLocal || 'Save failed.');
        }

        throw new Error(store.ui.treeReadOnlyHint || 'This tree is read-only. Open a local or public tree to edit.');
    }

    /**
     * @param {string} parentPath
     * @param {string} name
     * @param {'folder'|'file'} type
     * @param {string | null} [explicitParentId] — id del nodo padre en el grafo (evita fallos por ruta `a / b` o nombres repetidos a profundidad).
     */
    async createNode(parentPath, name, type, explicitParentId = null) {
        if (this.isLocal) {
            const treeId = this.localGardenTreeId();
            if (!treeId) throw new Error(store.ui.treeReadOnlyHint || 'No local tree.');

            /* Versiones: no son nodos del curriculum; el snapshot vive en userStore.releaseSnapshots. */
            if (
                (parentPath === 'content/releases' || String(parentPath).startsWith('content/releases/')) &&
                type === 'folder'
            ) {
                const entry = store.userStore.state.localTrees.find((t) => t.id === treeId);
                if (!entry) throw new Error(store.ui.fileNotFound || 'Local tree not found.');
                return true;
            }

            const treeEntry = store.userStore.state.localTrees.find((t) => t.id === treeId);
            if (treeEntry) {
                let parentNode = null;
                if (explicitParentId) {
                    for (const langKey in treeEntry.data.languages) {
                        parentNode = findNodeById(treeEntry.data.languages[langKey], explicitParentId);
                        if (parentNode) break;
                    }
                }
                if (!parentNode && parentPath) {
                    for (const langKey in treeEntry.data.languages) {
                        parentNode = findNodeByPathHint(treeEntry.data.languages[langKey], parentPath);
                        if (parentNode) break;
                    }
                }

                if (parentNode) {
                    let basePath = parentNode.sourcePath || parentNode.path;
                    if (basePath && basePath.endsWith('/meta.json')) basePath = basePath.replace('/meta.json', '');

                    const newSourcePath =
                        basePath ? `${basePath}/${name}` + (type === 'folder' ? '/meta.json' : '.md') : `${name}.md`;

                    store.userStore.createLocalNode(treeId, parentPath, name, type, parentNode.id);

                    const updatedSource = store.userStore.getLocalTreeData(treeId);

                    const findNewChild = (n) => {
                        if (n.name === name && n.parentId === parentNode.id) return n;
                        if (n.children) {
                            for (const c of n.children) {
                                const found = findNewChild(c);
                                if (found) return found;
                            }
                        }
                        return null;
                    };

                    let newChild = null;
                    for (const langKey in updatedSource.languages) {
                        newChild = findNewChild(updatedSource.languages[langKey]);
                        if (newChild) break;
                    }

                    if (newChild) {
                        newChild.sourcePath = newSourcePath;
                        store.userStore.persist();
                    }

                    store.processLoadedData(updatedSource);
                    return true;
                }
            }

            store.userStore.createLocalNode(treeId, parentPath, name, type, explicitParentId || null);
            const updatedSource = store.userStore.getLocalTreeData(treeId);
            store.processLoadedData(updatedSource);
            return true;
        }

        if (this.isNostrTreeSource()) {
            const newId = store.nostrCreateChild(parentPath, name, type, explicitParentId || null);
            if (newId) return true;
            throw new Error(store.ui.graphCreateParentError || 'Could not resolve parent folder for the new item.');
        }

        throw new Error(store.ui.treeReadOnlyHint || 'Read-only tree.');
    }

    async deleteNode(path, type) {
        if (this.isLocal) {
            const treeId = this.localGardenTreeId();
            if (!treeId) throw new Error(store.ui.treeReadOnlyHint || 'No local tree.');
            if (String(path).startsWith('content/releases/') && type === 'folder') {
                const version = String(path).split('/').pop();
                const entry = store.userStore.state.localTrees.find((t) => t.id === treeId);
                if ((entry && entry.releaseSnapshots) && version) {
                    delete entry.releaseSnapshots[version];
                    entry.updated = Date.now();
                    store.userStore.state.localTrees = [...store.userStore.state.localTrees];
                    store.userStore.persist();
                }
                return true;
            }
            store.userStore.deleteLocalNodeByPath(treeId, path);
            const updatedSource = store.userStore.getLocalTreeData(treeId);
            store.processLoadedData(updatedSource);
            return true;
        }
        if (this.isNostrTreeSource()) {
            const ok = store.nostrDeleteNodeByPath(path);
            if (ok) return true;
            throw new Error(
                (store.ui.graphErrorWithMessage || 'Error: {message}').replace('{message}', 'Could not delete this node.')
            );
        }
        throw new Error(store.ui.treeReadOnlyHint || 'Read-only tree.');
    }

    async renameNode(oldPath, newName, type) {
        if (this.isLocal) {
            const treeId = this.localGardenTreeId();
            if (!treeId) return false;
            const success = store.userStore.renameLocalNode(treeId, oldPath, newName);
            if (success) {
                const updatedSource = store.userStore.getLocalTreeData(treeId);
                store.processLoadedData(updatedSource);
            }
            return success;
        }
        if (this.isNostrTreeSource()) {
            const ok = store.nostrRenameNodeByPath(oldPath, newName);
            if (ok) return true;
            throw new Error(store.ui.nodePropertiesSaveError || 'Rename failed.');
        }
        throw new Error(store.ui.treeReadOnlyHint || 'Read-only tree.');
    }

    async moveNode(oldPath, newParentPath) {
        const cleanOldPath = oldPath.endsWith('/meta.json') ? oldPath.replace('/meta.json', '') : oldPath;
        const cleanParentPath = newParentPath.endsWith('/meta.json') ? newParentPath.replace('/meta.json', '') : newParentPath;

        const parts = cleanOldPath.split('/');
        const name = parts[parts.length - 1];
        const newPath = `${cleanParentPath}/${name}`;

        if (cleanOldPath === newPath) return;

        if (this.isLocal) {
            throw new Error(
                store.ui.graphMoveLocalUseTree ||
                    'Reorganize topics with Move in the course tree; path-based moves are not used for local gardens.'
            );
        }
        if (this.isNostrTreeSource()) {
            throw new Error(store.ui.nostrStructureEditHint || 'Move nodes in a local garden, then re-publish.');
        }
        throw new Error(store.ui.treeReadOnlyHint || 'Read-only tree.');
    }

    /** Nostr tree: reparent by node id (used from graph-logic). */
    async moveNodeNostr(nodeId, newParentId) {
        if (!this.isNostrTreeSource()) {
            throw new Error(store.ui.treeReadOnlyHint || 'Read-only tree.');
        }
        const ok = store.nostrMoveNode(nodeId, newParentId);
        if (ok) return true;
        throw new Error(store.ui.moveFailed || 'Move failed.');
    }
}

export const fileSystem = new FileSystemService();
