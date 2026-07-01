/* ──────────────────────────────────────────────────────────────────────────
 * Construction-mode CRUD actions.
 *
 * Methods exported here are merged onto `<arborito-graph>.prototype` by
 * `graph.js`. They drive the dock buttons, FAB, drag-and-drop, and inline
 * rename — every "edit the curriculum" path on the tree.
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

/** Move node (same as desktop "move" mode + graph drag). */
export function openMoveNodePicker() {
    const node = getArboritoStore().findNode(this.selectedNodeId);
    const ui = getArboritoStore().ui;
    if (!node) return;
    if (node.type === 'root') {
        getArboritoStore().alert(ui.graphMoveDisabledRoot || 'The curriculum root cannot be moved.');
        return;
    }
    if (!fileSystem.features.canWrite) return;
    if (fileSystem.isLocal) {
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
    if (!node || node.type === 'root') return;
    if (!fileSystem.features.canWrite) return;
    this.pendingMoveNodeId = String(nodeId);
    this.selectedNodeId = String(nodeId);
    this.invalidateMobilePrototypeKeys();
    this.renderMobileTopBanner();
    if (getArboritoStore().value.data) this.renderMobilePrototypeTree(getArboritoStore().value.data);
}

/**
 * @param {'delete'|'new-file'|'new-folder'|'new-exam'} action
 * @param {{ skipPrompt?: boolean }} [opts]
 */
export async function handleDockAction(action, opts = {}) {
    const node = getArboritoStore().findNode(this.selectedNodeId);
    if (!node) return;
    const nodePath = node.sourcePath || node.path;

    if (action === 'delete') {
        const ui = getArboritoStore().ui;
        const delBody = (ui.graphDeleteNodeBody || `Delete '{name}'?`).replace('{name}', node.name || '');
        if (await getArboritoStore().confirm(delBody, ui.graphDeleteNodeTitle || 'Delete node', true)) {
            try {
                const type = node.type === 'branch' || node.type === 'root' ? 'folder' : 'file';
                await fileSystem.deleteNode(nodePath, type);
                this.selectedNodeId = null;
                this.isMoveMode = false;
                this.pendingMoveNodeId = null;
                if (fileSystem.isNostrTreeSource()) await getArboritoStore().reloadCurrentSource();
            } catch (err) {
                getArboritoStore().alert((ui.graphErrorWithMessage || 'Error: {message}').replace('{message}', err.message));
            }
        }
        return;
    }

    if (action === 'new-file' || action === 'new-folder' || action === 'new-exam') {
        if (this._curriculumCreateBusy) return;
        this._curriculumCreateBusy = true;
        try {
            const dirPath = TreeUtils.directoryPathForNewChild(node, (id) => getArboritoStore().findNode(id));
            const ui = getArboritoStore().ui;
            /*
             * Deep trees (especially lazy children): parent may not yet have
             * materialized `path/sourcePath`, so `directoryPathForNewChild` returns null.
             * For Local and Nostr trees, `fileSystem.createNode` can resolve parent via
             * `explicitParentId`, so do not block creation solely for missing path.
             */
            const canResolveByIdOnly = !!(node?.id && (fileSystem.isLocal || fileSystem.isNostrTreeSource()));
            if (!dirPath && !canResolveByIdOnly) {
                getArboritoStore().alert(ui.graphCreateParentError || 'Could not resolve parent folder for the new item.');
                return;
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
                node.type === 'root' ? ui.navHome || node.name || 'tree' : node.name || 'this module';
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
                const parentLive = getArboritoStore().findNode(this.selectedNodeId) || node;
                name = this.pickUniqueChildName(parentLive, defaultName);
            } else {
                name = await getArboritoStore().prompt(label, defaultName, promptTitle);
            }
            if (name) {
                const type = isFolder ? 'folder' : isExam ? 'exam' : 'file';
                try {
                    await fileSystem.createNode(safeDirPath, name, type, node.id);
                    if (fileSystem.isNostrTreeSource()) await getArboritoStore().reloadCurrentSource();
                    const parent = getArboritoStore().findNode(node.id);
                    const created = (parent?.children || []).find((child) => child.name === name);
                    if (created) {
                        if (created.type === 'branch' || created.type === 'root') {
                            parent.expanded = true;
                            getArboritoStore().dispatchEvent(new CustomEvent('graph-update'));
                        } else {
                            await getArboritoStore().navigateTo(created.id);
                        }
                    }
                    getArboritoStore().notify(
                        isFolder
                            ? ui.graphFolderCreatedOk || 'Module created. Add lessons inside it next.'
                            : isExam
                              ? ui.graphExamCreatedOk || 'Exam created. You can edit its content now.'
                              : ui.graphLessonCreatedOk || 'Lesson created. You can edit its content now.',
                        false
                    );
                } catch (err) {
                    getArboritoStore().alert(
                        (ui.graphErrorWithMessage || 'Error: {message}').replace('{message}', err.message)
                    );
                }
            }
        } finally {
            this._curriculumCreateBusy = false;
        }
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
    if (!node || node.type === 'root') return false;
    if (!trimmed) return false;
    if (trimmed === String(node.name || '').trim()) return true;

    if (fileSystem.isMemoryReadOnlySource && fileSystem.isMemoryReadOnlySource()) {
        getArboritoStore().notify(ui.treeReadOnlyHint || 'Read-only tree.', true);
        return false;
    }

    const renameViaMeta = async () => {
        if (node.type === 'branch') {
            await persistNodeMetaProperties(
                { fileSystem, store },
                {
                    node,
                    name: trimmed,
                    icon: node.icon || '📁',
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
            const bodyMd = parsed.body;
            const nextMeta = { ...(parsed.meta || {}) };
            nextMeta.title = trimmed;
            const icon = (nextMeta.icon || node.icon || '📄').trim();
            await persistNodeMetaProperties(
                { fileSystem, store },
                {
                    node,
                    name: trimmed,
                    icon,
                    description: nextMeta.description ?? node.description ?? '',
                    originalMeta: nextMeta,
                    originalBody: bodyMd,
                    skipReload: true,
                }
            );
            return true;
        }
        return false;
    };

    let oldPath = String(node.sourcePath || '').trim();
    if (oldPath.endsWith('/README.md')) {
        oldPath = oldPath.replace('/README.md', '');
    }

    /* Local + Nostr are the only writable origins. Both prefer instant meta
     * saves which already refresh the graph; the path-based rename is just
     * a follow-up. */
    try {
        if (!oldPath) {
            const ok = await renameViaMeta();
            if (!ok) {
                getArboritoStore().notify(ui.graphRenameNeedPath || 'Cannot rename this item yet (path missing).', true);
                return false;
            }
            if (fileSystem.isNostrTreeSource()) await getArboritoStore().reloadCurrentSource();
            return true;
        }
        const isFolder = node.type === 'branch';
        await fileSystem.renameNode(oldPath, trimmed, isFolder ? 'folder' : 'file');
        if (fileSystem.isNostrTreeSource()) await getArboritoStore().reloadCurrentSource();
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
        if (node.type === 'branch' || node.type === 'root') {
            if (em === String(node.icon || '').trim()) return true;
            await persistNodeMetaProperties(
                { fileSystem, store },
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
            const bodyMd = parsed.body;
            await persistNodeMetaProperties(
                { fileSystem, store },
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
