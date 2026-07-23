/* ──────────────────────────────────────────────────────────────────────────
 * Construction-mode CRUD actions.
 *
 * Methods exported here are merged onto `<arborito-graph>.prototype` by
 * `graph.js`. They drive the dock buttons, FAB, drag-and-drop, and inline
 * rename, every "edit the curriculum" path on the tree.
 *
 * Pattern: each function uses `this` (the graph host) and delegates the
 * actual filesystem write to `fileSystem` / `persistNodeMetaProperties`,
 * then nudges the store / graph to repaint.
 * ────────────────────────────────────────────────────────────────────────── */

import { getArboritoStore } from '../../../../core/store-singleton.js';
import { fileSystem } from '../../../backup-export/api/filesystem.js';
import { shouldShowMobileUI } from '../../../../shared/ui/breakpoints.js';
import { TreeUtils } from '../tree-utils.js';
import { parseArboritoFile } from '../../../editor/api/editor-engine.js';
import { persistNodeMetaProperties } from '../node-meta-persist.js';
import { getPanelRef } from '../../../../app/panel-refs.js';
import { resolveLessonBodyForMetaPersist } from '../../../learning/api/live-lesson-body.js';

/** True when deleting `node` would remove the open lesson (self or ancestor folder). */
function openLessonAffectedByDelete(store, node, openId) {
    if (openId == null || !node) return false;
    if (String(openId) === String(node.id)) return true;
    let cur = store.findNode?.(openId);
    let guard = 0;
    while (cur && guard++ < 64) {
        if (String(cur.id) === String(node.id)) return true;
        if (!cur.parentId) break;
        cur = store.findNode?.(cur.parentId);
    }
    return false;
}

/** Resolve a just-created node after reload (composed trees use `refId::nativeId`). */
function findCreatedGraphNode(store, createdId, parentId, name) {
    if (createdId != null && createdId !== true && createdId !== false) {
        const exact = store.findNode?.(createdId);
        if (exact) return exact;
        const needle = String(createdId);
        const walk = (n) => {
            if (!n) return null;
            const id = String(n.id || '');
            if (id === needle || id.endsWith(`::${needle}`)) return n;
            for (const c of n.children || []) {
                const hit = walk(c);
                if (hit) return hit;
            }
            return null;
        };
        const hit = walk(store.state?.data);
        if (hit) return hit;
    }
    const parent = parentId != null ? store.findNode?.(parentId) : null;
    return (parent?.children || []).find((child) => child.name === name) || null;
}

/** Move node (same as desktop "move" mode + graph drag). */
export function openMoveNodePicker() {
    const node = getArboritoStore().findNode(this.selectedNodeId);
    const ui = getArboritoStore().ui;
    if (!node) return;
    if (node.type === 'root') {
        getArboritoStore().alert(ui.graphMoveDisabledRoot || 'The curriculum root cannot be moved.');
        return;
    }
    if (node._composedWrapper) {
        getArboritoStore().notify(
            ui.graphMoveDisabledComposedWrapper || 'Linked branches in a tree cannot be moved.',
            true
        );
        return;
    }
    if (!fileSystem.features.canMove) {
        getArboritoStore().notify(
            ui.constructionEnterBranchToEdit ||
                ui.graphMoveDisabledRoot ||
                'Open a writable branch to move items.',
            true
        );
        return;
    }
    if (fileSystem.isLocal || fileSystem.isNostrTreeSource()) {
        if (shouldShowMobileUI()) {
            this.startMovePickOnTree(node.id);
        } else {
            this.pendingMoveNodeId = null;
            getArboritoStore().setModal({ type: 'move-node', node });
        }
        return;
    }
    this.pendingMoveNodeId = null;
    getArboritoStore().setModal({ type: 'move-node', node });
}

/**
 * Closes modal and pick destination folder by navigating tree ("Move here" on current folder).
 * @param {string} nodeId
 */
export function startMovePickOnTree(nodeId) {
    const node = getArboritoStore().findNode(nodeId);
    if (!node || node.type === 'root' || node._composedWrapper) return;
    if (!fileSystem.features.canMove) return;
    this.pendingMoveNodeId = String(nodeId);
    this.selectedNodeId = String(nodeId);
    this.isMoveMode = true;
    this.invalidateMobilePrototypeKeys();
    this.renderMobileTopBanner();
    if (getArboritoStore().value.data) this.renderMobilePrototypeTree(getArboritoStore().value.data);
}

/**
 * @param {'delete'|'new-file'|'new-folder'|'new-exam'} action
 * @param {{ skipPrompt?: boolean, openCreated?: boolean, quietNotify?: boolean, preferredName?: string, nameBase?: string }} [opts]
 * @returns {Promise<boolean|void>} true when a create action actually added a node
 */
export async function handleDockAction(action, opts = {}) {
    const node = getArboritoStore().findNode(this.selectedNodeId);
    if (!node) return false;
    const nodePath = node.sourcePath || node.path;

    if (action === 'delete') {
        const ui = getArboritoStore().ui;
        if (!fileSystem.features.canDelete) {
            getArboritoStore().notify(
                ui.constructionEnterBranchToEdit ||
                    ui.treeReadOnlyHint ||
                    'Open a writable branch to delete items.',
                true
            );
            return;
        }
        const store = getArboritoStore();
        const contentApi = getPanelRef('content');
        const openId = contentApi?.currentNode?.id;
        if (node._composedWrapper) {
            store.notify(
                ui.sourcesComposedTreeReadOnlyHint ||
                    'Playlists are edited in Forest → Trees, not in construction mode.',
                true
            );
            return;
        }
        if (openLessonAffectedByDelete(store, node, openId)) {
            if (typeof contentApi?.confirmLeaveIfNeeded === 'function') {
                const leaveOk = await contentApi.confirmLeaveIfNeeded();
                if (!leaveOk) return;
            }
        }
        const delBody = (ui.graphDeleteNodeBody || `Delete '{name}'?`).replace('{name}', node.name || '');
        if (await store.confirm(delBody, ui.graphDeleteNodeTitle || 'Delete node', true)) {
            try {
                const type = node.type === 'branch' || node.type === 'root' ? 'folder' : 'file';
                await fileSystem.deleteNode(nodePath, type, node.id);
                this.selectedNodeId = null;
                this.isMoveMode = false;
                this.pendingMoveNodeId = null;
                if (fileSystem.isLocal || fileSystem.isLocalComposedTree()) {
                    if (getArboritoStore().value.data) this.renderMobilePrototypeTree(getArboritoStore().value.data);
                }
                /* Nostr mutations already refresh via DataProcessor — do not reloadCurrentSource (cache revert). */
            } catch (err) {
                getArboritoStore().alert((ui.graphErrorWithMessage || 'Error: {message}').replace('{message}', err.message));
            }
        }
        return;
    }

    if (action === 'new-file' || action === 'new-folder' || action === 'new-exam') {
        if (!fileSystem.features.canWrite) {
            const ui = getArboritoStore().ui;
            getArboritoStore().notify(
                ui.constructionEnterBranchToEdit ||
                    ui.treeReadOnlyHint ||
                    'Open a writable branch to add items.',
                true
            );
            return false;
        }
        if (this._curriculumCreateBusy) return false;
        this._curriculumCreateBusy = true;
        let createdOk = false;
        try {
            const findNode = (id) => getArboritoStore().findNode(id);
            /* Leaves/exams are not containers — always create under the folder/root. */
            const parentFolder = TreeUtils.folderNodeForNewChild(node, findNode);
            const dirPath = TreeUtils.directoryPathForNewChild(node, findNode);
            const ui = getArboritoStore().ui;
            /*
             * Deep trees (especially lazy children): parent may not yet have
             * materialized `path/sourcePath`, so `directoryPathForNewChild` returns null.
             * For Local and Nostr trees, `fileSystem.createNode` can resolve parent via
             * `explicitParentId`, so do not block creation solely for missing path.
             */
            const canResolveByIdOnly = !!(
                parentFolder?.id &&
                (fileSystem.isLocal || fileSystem.isNostrTreeSource())
            );
            if (!parentFolder || (!dirPath && !canResolveByIdOnly)) {
                getArboritoStore().alert(ui.graphCreateParentError || 'Could not resolve parent folder for the new item.');
                return false;
            }
            const safeDirPath = dirPath || '';
            const isFolder = action === 'new-folder';
            const isExam = action === 'new-exam';
            const defaultName = isFolder
                ? ui.graphDefaultModuleName || ui.graphUntitledDefault || 'Untitled module'
                : isExam
                  ? ui.graphDefaultExamName || ui.defaultExamName || 'New exam'
                  : ui.defaultLessonName || ui.graphUntitledDefault || 'Untitled lesson';
            const parentName =
                parentFolder.type === 'root'
                    ? ui.navHome || parentFolder.name || 'tree'
                    : parentFolder.name || 'this module';
            const label = isFolder
                ? (ui.graphPromptFolderNameFriendly || ui.graphPromptFolderName || 'Name the new module:').replace(
                      '{parent}',
                      parentName
                  )
                : isExam
                  ? (ui.graphPromptExamNameFriendly || ui.graphPromptExamName || 'Name the new exam:').replace(
                        '{parent}',
                        parentName
                    )
                  : (ui.graphPromptLessonNameFriendly || ui.graphPromptLessonName || 'Name the new lesson:').replace(
                        '{parent}',
                        parentName
                    );
            const promptTitle = isFolder
                ? ui.graphNewFolderPromptTitle || ui.graphNewNodePromptTitle || 'New module'
                : isExam
                  ? ui.graphNewExamPromptTitle || ui.graphNewNodePromptTitle || 'New exam'
                  : ui.graphNewLessonPromptTitle || ui.graphNewNodePromptTitle || 'New lesson';

            let name;
            if (opts.skipPrompt) {
                const parentLive = findNode(parentFolder.id) || parentFolder;
                const base = String(opts.preferredName || opts.nameBase || defaultName).trim() || defaultName;
                name = this.pickUniqueChildName(parentLive, base);
            } else {
                name = await getArboritoStore().prompt(label, defaultName, promptTitle);
            }
            if (name) {
                const type = isFolder ? 'folder' : isExam ? 'exam' : 'file';
                try {
                    const createdId = await fileSystem.createNode(safeDirPath, name, type, parentFolder.id);
                    /* Nostr: nostrCreateChild already runs DataProcessor — skip reloadCurrentSource. */
                    const created = findCreatedGraphNode(
                        getArboritoStore(),
                        createdId,
                        parentFolder.id,
                        name
                    );
                    createdOk = !!created;
                    if (created) {
                        if (created.type === 'branch' || created.type === 'root') {
                            const parent = findNode(parentFolder.id);
                            if (parent) parent.expanded = true;
                            getArboritoStore().dispatchEvent(new CustomEvent('graph-update'));
                        } else if (opts.openCreated !== false) {
                            /* Sage batch create passes openCreated:false — stay on the map. */
                            await getArboritoStore().navigateTo(created.id);
                        } else {
                            const parent = findNode(parentFolder.id);
                            if (parent) parent.expanded = true;
                            getArboritoStore().dispatchEvent(new CustomEvent('graph-update'));
                        }
                        if (opts.quietNotify !== true) {
                            getArboritoStore().notify(
                                isFolder
                                    ? ui.graphFolderCreatedOk || 'Module created. Add lessons inside it next.'
                                    : isExam
                                      ? ui.graphExamCreatedOk || 'Exam created. You can edit its content now.'
                                      : ui.graphLessonCreatedOk || 'Lesson created. You can edit its content now.',
                                false
                            );
                        }
                    }
                } catch (err) {
                    getArboritoStore().alert(
                        (ui.graphErrorWithMessage || 'Error: {message}').replace('{message}', err.message)
                    );
                }
            }
        } finally {
            this._curriculumCreateBusy = false;
        }
        return createdOk;
    }
}

/**
 * Avoids name collisions among siblings when creating from FAB without prompt.
 * @param {object} parentNode
 * @param {string} baseName
 */
export function pickUniqueChildName(parentNode, baseName) {
    const taken = new Set(
        (parentNode?.children || [])
            .map((c) => (c.name || '').trim().toLowerCase())
            .filter(Boolean)
    );
    const candidate = String(baseName || '').trim() || 'Untitled';
    if (!taken.has(candidate.toLowerCase())) return candidate;
    let n = 2;
    let probe = `${candidate} (${n})`;
    while (taken.has(probe.toLowerCase())) {
        n += 1;
        probe = `${candidate} (${n})`;
    }
    return probe;
}

/**
 * Rename curriculum node in construction (same path as properties / meta modal).
 * @param {object} node
 * @param {string} newName
 * @returns {Promise<boolean>}
 */
export async function renameNodeFromConstruction(node, newName) {
    const ui = getArboritoStore().ui;
    const trimmed = String(newName || '').trim();
    if (!node) return false;
    if (!trimmed) return false;
    if (trimmed === String(node.name || '').trim()) return true;

    if (fileSystem.isMemoryReadOnlySource && fileSystem.isMemoryReadOnlySource()) {
        getArboritoStore().notify(ui.treeReadOnlyHint || 'Read-only tree.', true);
        return false;
    }

    if (node._composedWrapper) {
        getArboritoStore().notify(
            ui.sourcesComposedTreeReadOnlyHint ||
                'Playlists are edited in Forest → Trees, not in construction mode.',
            true
        );
        return false;
    }

    const renameViaMeta = async (targetNode, { skipPathRename = false } = {}) => {
        const n = targetNode || node;
        if (n.type === 'branch' || n.type === 'root') {
            await persistNodeMetaProperties(
                { fileSystem, store: getArboritoStore() },
                {
                    node: n,
                    name: trimmed,
                    icon: n.icon || (n.type === 'root' ? '🌳' : '📁'),
                    description: n.description || '',
                    originalMeta: { order: n.order || '99' },
                    originalBody: '',
                    skipReload: true,
                    skipPathRename: n.type === 'root' ? true : skipPathRename,
                }
            );
            return true;
        }
        if (n.type === 'leaf' || n.type === 'exam') {
            const parsed = parseArboritoFile(n.content || '');
            const bodyMd = resolveLessonBodyForMetaPersist(n);
            const nextMeta = { ...(parsed.meta || {}) };
            nextMeta.title = trimmed;
            const icon = (nextMeta.icon || n.icon || '📄').trim();
            await persistNodeMetaProperties(
                { fileSystem, store: getArboritoStore() },
                {
                    node: n,
                    name: trimmed,
                    icon,
                    description: nextMeta.description ?? n.description ?? '',
                    originalMeta: nextMeta,
                    originalBody: bodyMd,
                    skipReload: true,
                    skipPathRename,
                }
            );
            return true;
        }
        return false;
    };

    if (node.type === 'root') {
        try {
            return await renameViaMeta(node, { skipPathRename: true });
        } catch (err) {
            getArboritoStore().alert(
                (ui.graphErrorWithMessage || 'Error: {message}').replace('{message}', err.message)
            );
            return false;
        }
    }

    let oldPath = String(node.sourcePath || '').trim();
    if (oldPath.endsWith('/README.md')) {
        oldPath = oldPath.replace('/README.md', '');
    }

    /* Local + Nostr are the only writable origins. Both prefer instant meta
     * saves which already refresh the graph; the path-based rename is just
     * a follow-up. */
    try {
        if (!oldPath) {
            const ok = await renameViaMeta(node);
            if (!ok) {
                getArboritoStore().notify(ui.graphRenameNeedPath || 'Cannot rename this item yet (path missing).', true);
                return false;
            }
            return true;
        }
        const isFolder = node.type === 'branch';
        await fileSystem.renameNode(oldPath, trimmed, isFolder ? 'folder' : 'file');
        /* Path rename already updated catalog — refresh node and sync meta without a second rename. */
        const live = getArboritoStore().findNode?.(node.id) || { ...node, name: trimmed };
        try {
            await renameViaMeta(live, { skipPathRename: true });
        } catch (metaErr) {
            getArboritoStore().notify(
                (ui.graphErrorWithMessage || 'Error: {message}').replace(
                    '{message}',
                    metaErr?.message || 'Could not sync lesson title after rename.'
                ),
                true
            );
        }
        return true;
    } catch (err) {
        getArboritoStore().alert((ui.graphErrorWithMessage || 'Error: {message}').replace('{message}', err.message));
        return false;
    }
}

/**
 * Changes only node icon/emoji (construction curriculum, same flow as lesson / modal).
 * @param {object} node
 * @param {string} icon
 */
export async function applyConstructionNodeIcon(node, icon) {
    const ui = getArboritoStore().ui;
    const em = String(icon || '').trim();
    if (!node || !em || !fileSystem.features.canWrite) return false;
    try {
        if (node._composedWrapper) {
            getArboritoStore().notify(
                ui.sourcesComposedTreeReadOnlyHint ||
                    'Playlists are edited in Forest → Trees, not in construction mode.',
                true
            );
            return false;
        }
        if (node.type === 'branch' || node.type === 'root') {
            if (em === String(node.icon || '').trim()) return true;
            await persistNodeMetaProperties(
                { fileSystem, store: getArboritoStore() },
                {
                    node,
                    name: node.name,
                    icon: em,
                    description: node.description || '',
                    originalMeta: { order: node.order || '99' },
                    originalBody: '',
                    skipReload: true,
                }
            );
            return true;
        }
        if (node.type === 'leaf' || node.type === 'exam') {
            const parsed = parseArboritoFile(node.content || '');
            const name = (parsed.meta.title || node.name || '').trim();
            if (!name) {
                getArboritoStore().notify(ui.graphPromptLessonName || 'Lesson name:', true);
                return false;
            }
            const baseline = (parsed.meta.icon || node.icon || '📄').trim();
            if (em === baseline) return true;
            const bodyMd = resolveLessonBodyForMetaPersist(node);
            await persistNodeMetaProperties(
                { fileSystem, store: getArboritoStore() },
                {
                    node,
                    name,
                    icon: em,
                    description: parsed.meta.description ?? node.description ?? '',
                    originalMeta: parsed.meta,
                    originalBody: bodyMd,
                    skipReload: true,
                }
            );
            return true;
        }
    } catch (e) {
        getArboritoStore().alert((ui.graphErrorWithMessage || 'Error: {message}').replace('{message}', e.message));
        return false;
    }
    return false;
}
