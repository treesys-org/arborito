import { getArboritoStore } from '../../../core/store-singleton.js';
import { parseNostrTreeUrl } from '../../nostr/api/nostr-refs.js';
import { isBundledDemoBranchId } from '../../publishing/api/demo-tree-guard.js';
import { parseArboritoFile } from '../../editor/api/editor-engine.js';
import { folderReadmeFromNode, parseFolderReadme } from '../../../shared/lib/arborito-archive.js';

const FOLDER_README_SUFFIX = '/README.md';
import { findNodeById, findNodeByPathHint } from '../../tree-graph/api/raw-graph-mutations.js';
import { resolveMutableBranchCurriculum } from '../../../core/user-store/branch-curriculum-target.js';

class FileSystemService {
    get activeSource() {
        return getArboritoStore().value.activeSource;
    }

    /**
     * Tree id in `userStore.branches` (do not confuse with composite `activeSource.id`
     * when viewing an archived version: `uuid-label` vs `branch://uuid`).
     */
    localGardenTreeId() {
        if (this.isLocalComposedTree()) {
            return this.activeComposedBranchId();
        }
        const src = this.activeSource;
        if (!src) return null;
        const u = String(src.url || '');
        if (u.startsWith('branch://')) {
            return u.slice('branch://'.length).split('/')[0] || null;
        }
        if (src.type === 'branch' && src.id) return String(src.id);
        return src.id != null ? String(src.id) : null;
    }

    composedTreeId() {
        const src = this.activeSource;
        if (!src || src.type !== 'composed-tree') return null;
        const fromUrl =
            src.url && String(src.url).startsWith('tree://')
                ? String(src.url).slice('tree://'.length).split('/')[0]
                : '';
        const id = String(src.treeId || fromUrl || src.id || '').trim();
        return id || null;
    }

    isLocalBranch() {
        const src = this.activeSource;
        return !!(src && (src.type === 'branch' || (src.url && src.url.startsWith('branch://'))));
    }

    isLocalComposedTree() {
        const id = this.composedTreeId();
        return !!(id && getArboritoStore().userStore?.getTree?.(id));
    }

    /** Branch id under a local composed tree (null at playlist root). */
    activeComposedBranchId() {
        if (!this.isLocalComposedTree()) return null;
        const store = getArboritoStore();
        const ctx = store.state.treeContext;
        /* Single-branch composed trees show the branch content directly and never
         * set `activeBranchRefId` (the path sync short-circuits on `singleBranch`).
         * Fall back to the tree's only branch so editing (move/delete) stays
         * enabled instead of vanishing. */
        let refKey = ctx?.activeBranchRefId
            ? String(ctx.activeBranchRefId)
            : ctx?.singleBranch && ctx?.branchRefId
              ? String(ctx.branchRefId)
              : '';
        /* Construction locks a branch before path sync may have set activeBranchRefId. */
        if (!refKey && store.state.constructionMode) {
            refKey = String(store.state.constructionLockedBranchRefId || '').trim();
        }
        if (!refKey) return null;
        const entry = store.userStore.getTree(this.composedTreeId());
        const ref = (entry?.branchRefs || []).find(
            (r) => String(r.refId || '') === refKey || String(r.branchId || '') === refKey
        );
        return ref ? String(ref.branchId || ref.refId || '') : refKey;
    }

    resolveNativeNodeId(nodeOrId) {
        if (nodeOrId == null) return '';
        if (typeof nodeOrId === 'object') {
            if (nodeOrId._originalId != null) return String(nodeOrId._originalId);
            return this.resolveNativeNodeId(nodeOrId.id);
        }
        const id = String(nodeOrId);
        const sep = id.indexOf('::');
        return sep >= 0 ? id.slice(sep + 2) : id;
    }

    async _reloadAfterBranchWrite(branchId) {
        if (this.isLocalComposedTree()) {
            const composedId = this.composedTreeId();
            if (composedId) await getArboritoStore().loadComposedTree(composedId, false);
            return;
        }
        const store = getArboritoStore();
        const src = store.state.activeSource;
        const url = String(src?.url || '');
        if (
            src &&
            (url.startsWith('branch://') ||
                src.type === 'branch' ||
                (src.type === 'archive' && url.startsWith('branch://')))
        ) {
            const { json } = store.sourceManager.readBranchSync(src);
            if (json) store.processLoadedData(json);
            return;
        }
        const updatedSource = store.userStore.getBranchData(branchId);
        if (updatedSource) store.processLoadedData(updatedSource);
    }

    get isLocal() {
        return this.isLocalBranch() || this.isLocalComposedTree();
    }

    /** Nostr-backed trees are edited in-memory and published via Nostr bundle. */
    isNostrTreeSource() {
        const src = this.activeSource;
        return !!((src && src.url) && parseNostrTreeUrl(src.url));
    }

    /** HTTPS / archive / read-only bundles: view from in-memory graph only. */
    isMemoryReadOnlySource() {
        return !this.isLocalBranch() && !this.isLocalComposedTree() && !this.isNostrTreeSource();
    }

    get features() {
        if (this.isLocalBranch()) {
            const isDemo = isBundledDemoBranchId(this.localGardenTreeId());
            return {
                canWrite: !isDemo,
                hasGovernance: false,
                canDelete: !isDemo,
                canMove: !isDemo,
                isRealtime: true,
                isBundledDemo: isDemo,
            };
        }
        if (this.isLocalComposedTree()) {
            const inBranch = !!this.activeComposedBranchId();
            return {
                canWrite: true,
                hasGovernance: false,
                canDelete: inBranch,
                canMove: inBranch,
                isRealtime: true,
                composedPlaylistRoot: !inBranch
            };
        }
        if (this.isNostrTreeSource()) {
            const role =
                typeof getArboritoStore().getMyTreeNetworkRole === 'function' ? getArboritoStore().getMyTreeNetworkRole() : null;
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
        if (this.isLocalBranch() || this.isLocalComposedTree()) {
            const node = getArboritoStore().findNode(nodeId);
            if (!node) {
                if (nodeId.startsWith('new-')) return { content: '', meta: {}, sha: null };
                throw new Error(getArboritoStore().ui.fileNotFound || 'File not found in local garden.');
            }

            const rawContent = node.content || '';
            if (node.type === 'branch' || node.type === 'root') {
                const folderMeta = rawContent ? parseFolderReadme(rawContent) : {};
                return {
                    content: rawContent || folderReadmeFromNode(node),
                    meta: {
                        title: node.name,
                        icon: folderMeta.icon || node.icon,
                        description: folderMeta.description || node.description || '',
                        order: node.order,
                        isCertifiable:
                            'certifiable' in folderMeta ? !!folderMeta.certifiable : !!node.isCertifiable,
                    },
                    sha: null,
                    isMeta: true,
                    body: ''
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
        const node = getArboritoStore().findNode(nodeId);
        if (!node) {
            if (String(nodeId).startsWith('new-')) return { content: '', meta: {}, sha: null };
            throw new Error(getArboritoStore().ui.fileNotFound || 'Node not found.');
        }

        if (node.type === 'branch' || node.type === 'root') {
            const rawContent = node.content || '';
            const folderMeta = rawContent ? parseFolderReadme(rawContent) : {};
            return {
                content: rawContent || folderReadmeFromNode(node),
                meta: {
                    title: node.name,
                    icon: folderMeta.icon || node.icon,
                    description: folderMeta.description || node.description || '',
                    order: node.order,
                    isCertifiable:
                        'certifiable' in folderMeta ? !!folderMeta.certifiable : !!node.isCertifiable,
                },
                sha: null,
                isMeta: true,
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
        if (this.isLocalBranch()) {
            const treeId = this.localGardenTreeId();
            const treeData = getArboritoStore().userStore.getBranchData(treeId);
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
            Object.values(treeData.languages || {}).forEach((root) => {
                if (root && typeof root === 'object') traverse(root, '');
            });
            return flatList;
        }
        return [];
    }

    // --- WRITE OPERATIONS ---

    async saveFile(node, content, meta, commitMsg, opts = {}) {
        const skipGraphReload = !!opts.skipGraphReload;
        if (this.isLocalBranch()) {
            if (!this.features.canWrite) {
                throw new Error(
                    getArboritoStore().ui.treeReadOnlyHint ||
                        'This tree is read-only. Open a local or public tree to edit.'
                );
            }
            const treeId = this.localGardenTreeId();
            const nativeId = this.resolveNativeNodeId(node);
            const success = getArboritoStore().userStore.updateBranchNode(
                treeId,
                nativeId || node.id,
                content,
                meta
            );

            if (success) {
                if (!skipGraphReload) await this._reloadAfterBranchWrite(treeId);
                return { success: true, mode: 'instant' };
            }
            throw new Error(getArboritoStore().ui.saveFailedLocal || 'Local save failed. Node not found.');
        }

        if (this.isLocalComposedTree()) {
            const branchId = this.activeComposedBranchId();
            if (!branchId) {
                throw new Error(
                    getArboritoStore().ui.constructionEnterBranchToEdit ||
                        'Open a branch in this tree to edit its lessons.'
                );
            }
            const nativeId = this.resolveNativeNodeId(node);
            const success = getArboritoStore().userStore.updateBranchNode(branchId, nativeId, content, meta);
            if (success) {
                if (!skipGraphReload) await this._reloadAfterBranchWrite(branchId);
                return { success: true, mode: 'instant' };
            }
            throw new Error(getArboritoStore().ui.saveFailedLocal || 'Local save failed. Node not found.');
        }

        if (this.isNostrTreeSource()) {
            const ok = getArboritoStore().applyNodeContentToRawGraph(node.id, content, meta);
            if (ok) return { success: true, mode: 'instant' };
            throw new Error(getArboritoStore().ui.saveFailedLocal || 'Save failed.');
        }

        throw new Error(getArboritoStore().ui.treeReadOnlyHint || 'This tree is read-only. Open a local or public tree to edit.');
    }

    /**
     * @param {string} parentPath
     * @param {string} name
     * @param {'folder'|'file'|'exam'} type
     * @param {string | null} [explicitParentId], id del nodo padre en el grafo (evita fallos por ruta `a / b` o nombres repetidos a profundidad).
     */
    async createNode(parentPath, name, type, explicitParentId = null) {
        let nativeParentId = explicitParentId ? this.resolveNativeNodeId(explicitParentId) : null;

        if (this.isLocalBranch() || this.isLocalComposedTree()) {
            const treeId = this.localGardenTreeId();
            if (!treeId) {
                throw new Error(
                    getArboritoStore().ui.constructionEnterBranchToEdit ||
                        getArboritoStore().ui.treeReadOnlyHint ||
                        'Open a branch in this tree to add items.'
                );
            }

            /* Versiones: no son nodos del curriculum; el snapshot vive en userStore.releaseSnapshots. */
            if (
                (parentPath === 'content/releases' || String(parentPath).startsWith('content/releases/')) &&
                type === 'folder'
            ) {
                const entry = getArboritoStore().userStore.state.branches.find((t) => t.id === treeId);
                if (!entry) throw new Error(getArboritoStore().ui.fileNotFound || 'Local tree not found.');
                return true;
            }

            const treeEntry = getArboritoStore().userStore.state.branches.find((t) => t.id === treeId);
            if (treeEntry) {
                let parentNode = null;
                const curriculum = resolveMutableBranchCurriculum(treeEntry);
                const langs = curriculum?.languages;
                if (nativeParentId && langs && typeof langs === 'object') {
                    for (const langKey of Object.keys(langs)) {
                        const root = langs[langKey];
                        if (!root) continue;
                        parentNode = findNodeById(root, nativeParentId);
                        if (parentNode) break;
                    }
                }
                /* Leaf/exam ids are not valid parents — climb to the containing folder. */
                let climbGuard = 0;
                while (
                    parentNode &&
                    (parentNode.type === 'leaf' || parentNode.type === 'exam') &&
                    parentNode.parentId &&
                    climbGuard++ < 32
                ) {
                    const climbId = this.resolveNativeNodeId(parentNode.parentId);
                    let climbed = null;
                    for (const langKey of Object.keys(langs || {})) {
                        const root = langs[langKey];
                        if (!root) continue;
                        climbed = findNodeById(root, climbId);
                        if (climbed) break;
                    }
                    parentNode = climbed;
                    nativeParentId = climbId;
                }
                if (parentNode && parentNode.type !== 'branch' && parentNode.type !== 'root') {
                    parentNode = null;
                }
                if (!parentNode && parentPath && langs && typeof langs === 'object') {
                    for (const langKey of Object.keys(langs)) {
                        const root = langs[langKey];
                        if (!root) continue;
                        parentNode = findNodeByPathHint(root, parentPath);
                        if (parentNode) break;
                    }
                    if (parentNode && parentNode.type !== 'branch' && parentNode.type !== 'root') {
                        parentNode = null;
                    }
                }

                if (parentNode) {
                    let basePath = parentNode.sourcePath || parentNode.path;
                    if (basePath && basePath.endsWith(FOLDER_README_SUFFIX)) {
                        basePath = basePath.slice(0, -FOLDER_README_SUFFIX.length);
                    }

                    const newSourcePath = basePath
                        ? type === 'folder'
                            ? `${basePath}/${name}`
                            : `${basePath}/${name}.md`
                        : `${name}.md`;

                    const createdId = getArboritoStore().userStore.createBranchNode(
                        treeId,
                        parentPath,
                        name,
                        type,
                        parentNode.id
                    );
                    if (!createdId) {
                        throw new Error(
                            getArboritoStore().ui.graphCreateParentError ||
                                'Could not resolve parent folder for the new item.'
                        );
                    }

                    const updatedSource =
                        curriculum?.isSnapshot && curriculum.snapshotId
                            ? treeEntry.releaseSnapshots?.[curriculum.snapshotId]
                            : getArboritoStore().userStore.getBranchData(treeId);

                    const findNewChild = (n) => {
                        if (String(n.id) === String(createdId)) return n;
                        if (n.children) {
                            for (const c of n.children) {
                                const found = findNewChild(c);
                                if (found) return found;
                            }
                        }
                        return null;
                    };

                    let newChild = null;
                    const updatedLangs = updatedSource?.languages;
                    if (updatedLangs && typeof updatedLangs === 'object') {
                        for (const langKey of Object.keys(updatedLangs)) {
                            const root = updatedLangs[langKey];
                            if (!root) continue;
                            newChild = findNewChild(root);
                            if (newChild) break;
                        }
                    }

                    if (newChild) {
                        newChild.sourcePath = newSourcePath;
                        getArboritoStore().userStore.markBranchDirty(treeId);
                        getArboritoStore().userStore.persist();
                    }

                    await this._reloadAfterBranchWrite(treeId);
                    return createdId;
                }
            }

            const createdId = getArboritoStore().userStore.createBranchNode(
                treeId,
                parentPath,
                name,
                type,
                nativeParentId || null
            );
            if (!createdId) {
                throw new Error(
                    getArboritoStore().ui.graphCreateParentError ||
                        'Could not resolve parent folder for the new item.'
                );
            }
            await this._reloadAfterBranchWrite(treeId);
            return createdId;
        }

        if (this.isNostrTreeSource()) {
            const newId = getArboritoStore().nostrCreateChild(parentPath, name, type, explicitParentId || null);
            if (newId) return newId;
            throw new Error(getArboritoStore().ui.graphCreateParentError || 'Could not resolve parent folder for the new item.');
        }

        throw new Error(getArboritoStore().ui.treeReadOnlyHint || 'Read-only tree.');
    }

    async deleteNode(path, type, explicitNodeId = null) {
        if (this.isLocalBranch() || this.isLocalComposedTree()) {
            const treeId = this.localGardenTreeId();
            if (!treeId) throw new Error(getArboritoStore().ui.treeReadOnlyHint || 'No local tree.');
            if (String(path).startsWith('content/releases/') && type === 'folder') {
                const version = String(path).split('/').pop();
                const entry = getArboritoStore().userStore.state.branches.find((t) => t.id === treeId);
                if ((entry && entry.releaseSnapshots) && version) {
                    delete entry.releaseSnapshots[version];
                    entry.updated = Date.now();
                    getArboritoStore().userStore.state.branches = [...getArboritoStore().userStore.state.branches];
                    getArboritoStore().userStore.markBranchDirty(treeId);
                    getArboritoStore().userStore.persist();
                }
                return true;
            }
            const ui = getArboritoStore().ui;
            const nativeId = explicitNodeId != null ? this.resolveNativeNodeId(explicitNodeId) : '';
            let deleted = false;
            if (nativeId) {
                deleted = getArboritoStore().userStore.deleteBranchNodeById(treeId, nativeId);
            }
            if (!deleted) {
                deleted = getArboritoStore().userStore.deleteBranchNodeByPath(treeId, path);
            }
            if (!deleted) {
                throw new Error(
                    (ui.graphErrorWithMessage || 'Error: {message}').replace(
                        '{message}',
                        ui.graphDeleteNodeFailed || 'Could not delete this item.'
                    )
                );
            }
            await this._reloadAfterBranchWrite(treeId);
            return true;
        }
        if (this.isNostrTreeSource()) {
            const store = getArboritoStore();
            const nativeId = explicitNodeId != null ? this.resolveNativeNodeId(explicitNodeId) : '';
            let ok = false;
            if (nativeId && typeof store.nostrDeleteNodeById === 'function') {
                ok = store.nostrDeleteNodeById(nativeId);
            }
            if (!ok) ok = store.nostrDeleteNodeByPath(path);
            if (ok) return true;
            throw new Error(
                (store.ui.graphErrorWithMessage || 'Error: {message}').replace('{message}', 'Could not delete this node.')
            );
        }
        throw new Error(getArboritoStore().ui.treeReadOnlyHint || 'Read-only tree.');
    }

    async renameNode(oldPath, newName, type) {
        if (this.isLocalBranch() || this.isLocalComposedTree()) {
            const treeId = this.localGardenTreeId();
            if (!treeId) {
                throw new Error(getArboritoStore().ui.treeReadOnlyHint || 'No local tree.');
            }
            const success = getArboritoStore().userStore.renameBranchNode(treeId, oldPath, newName);
            if (!success) {
                throw new Error(
                    getArboritoStore().ui.nodePropertiesSaveError ||
                        getArboritoStore().ui.graphRenameNeedPath ||
                        'Rename failed.'
                );
            }
            await this._reloadAfterBranchWrite(treeId);
            return true;
        }
        if (this.isNostrTreeSource()) {
            const ok = getArboritoStore().nostrRenameNodeByPath(oldPath, newName);
            if (ok) return true;
            throw new Error(getArboritoStore().ui.nodePropertiesSaveError || 'Rename failed.');
        }
        throw new Error(getArboritoStore().ui.treeReadOnlyHint || 'Read-only tree.');
    }

    async moveNode(oldPath, newParentPath) {
        const cleanOldPath = oldPath.endsWith(FOLDER_README_SUFFIX)
            ? oldPath.slice(0, -FOLDER_README_SUFFIX.length)
            : oldPath;
        const cleanParentPath = newParentPath.endsWith(FOLDER_README_SUFFIX)
            ? newParentPath.slice(0, -FOLDER_README_SUFFIX.length)
            : newParentPath;

        const parts = cleanOldPath.split('/');
        const name = parts[parts.length - 1];
        const newPath = `${cleanParentPath}/${name}`;

        if (cleanOldPath === newPath) return;

        if (this.isLocalBranch() || this.isLocalComposedTree()) {
            throw new Error(
                getArboritoStore().ui.graphMoveLocalUseTree ||
                    'Reorganize topics with Move in the course tree; path-based moves are not used for local gardens.'
            );
        }
        if (this.isNostrTreeSource()) {
            throw new Error(
                getArboritoStore().ui.nostrStructureEditHint ||
                    'Use Move in the course tree (not a path move) for public trees.'
            );
        }
        throw new Error(getArboritoStore().ui.treeReadOnlyHint || 'Read-only tree.');
    }

    /** Nostr tree: reparent by node id (used from graph-logic). */
    async moveNodeNostr(nodeId, newParentId) {
        if (!this.isNostrTreeSource()) {
            throw new Error(getArboritoStore().ui.treeReadOnlyHint || 'Read-only tree.');
        }
        const ok = getArboritoStore().nostrMoveNode(nodeId, newParentId);
        if (ok) return true;
        throw new Error(getArboritoStore().ui.moveFailed || 'Move failed.');
    }
}

export const fileSystem = new FileSystemService();
