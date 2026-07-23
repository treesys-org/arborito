import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { fileSystem } from '../../backup-export/api/filesystem.js';
import { getMobilePath } from '../../tree-graph/api/graph-ui-accessors.js';
import { getPanelRef } from '../../../app/panel-refs.js';
import { ensureModalChunk } from '../../../app/modal-chunk-loaders.js';
import { persistActiveComposedBranchFromRaw } from '../../forest/api/persist-composed-branch-from-raw.js';

/** @param {'branch' | null} focus */
export function setConstructionEditFocus(focus, opts = {}) {
    const patch = { constructionEditFocus: focus || null };
    if (opts.lockedBranchRefId != null) {
        patch.constructionLockedBranchRefId = String(opts.lockedBranchRefId || '') || null;
    } else if (!focus) {
        patch.constructionLockedBranchRefId = null;
    }
    store.update(patch);
    syncConstructionAboutFromFocus();
}

/** Map store focus + graph scope → dataset for tree-presentation. */
export function syncConstructionAboutFromFocus() {
    if (typeof document === 'undefined') return;
    const kind = resolvePresentationAboutKind();
    if (kind) {
        document.documentElement.dataset.arboritoConstructionAbout = kind;
    } else {
        delete document.documentElement.dataset.arboritoConstructionAbout;
    }
    const pres = getPanelRef('tree-presentation');
    if (pres && typeof pres.render === 'function') {
        pres._lastPresKey = null;
        pres.render();
    }
}

/** @returns {'branch' | ''} */
export function resolvePresentationAboutKind() {
    if (!store.state.constructionMode) return '';
    if (fileSystem.isLocalComposedTree()) {
        return store.state.constructionEditFocus === 'branch' ? 'branch' : '';
    }
    return 'branch';
}

export function isConstructionBranchLocked() {
    return (
        !!store.state.constructionMode &&
        !!String(store.state.constructionLockedBranchRefId || '').trim()
    );
}

/**
 * @param {object|null} data, graph root
 * @param {string} refKey, branchRef refId or branchId
 * @returns {string|null} wrapper node id
 */
export function findComposedBranchWrapperId(data, refKey) {
    const key = String(refKey || '').trim();
    if (!data || !key) return null;
    let found = null;
    const walk = (node) => {
        if (!node || found) return;
        if (node._composedWrapper) {
            const refId = String(node._composedRefId || '');
            const branchId = String(node._composedBranchId || '');
            if (refId === key || branchId === key) found = String(node.id);
        }
        if (Array.isArray(node.children)) node.children.forEach(walk);
    };
    walk(data);
    return found;
}

/** Minimum mobile path when a branch is locked (root + branch wrapper). */
export function getConstructionLockedMinPath(rootData = store.state.data) {
    const refId = String(store.state.constructionLockedBranchRefId || '').trim();
    if (!refId || !rootData?.id) return null;
    const wrapperId = findComposedBranchWrapperId(rootData, refId);
    if (!wrapperId) return null;
    return [String(rootData.id), wrapperId];
}

/** Clamp graph path so the user cannot return to the playlist root. */
export function enforceConstructionPathLock() {
    if (!store.state.constructionMode) return false;
    const minPath = getConstructionLockedMinPath();
    if (!minPath) return false;

    const current = getMobilePath();
    const ok =
        current.length >= minPath.length &&
        minPath.every((id, i) => String(current[i]) === String(id));

    if (ok) return false;

    store.navigateMobilePath([...minPath]);
    store.bumpGraphUiRevision();
    return true;
}

/** Whether the panel back button may move up one level. */
export function canConstructionNavigateBack(graphOrPath) {
    const minPath = getConstructionLockedMinPath();
    const path = Array.isArray(graphOrPath?.mobilePath)
        ? graphOrPath.mobilePath
        : getMobilePath();
    const depth = path.length || 0;
    if (minPath) return depth > minPath.length;
    return depth > 1;
}

/** Whether a path knot index is tappable (breadcrumb navigation). */
export function canConstructionNavigateToPathIndex(graph, index) {
    const minPath = getConstructionLockedMinPath();
    if (!minPath) return true;
    return index + 1 >= minPath.length;
}

/** Navigate into a composed-tree branch wrapper and lock editing to it. */
export function navigateComposedBranch(refKey) {
    const data = store.state.data;
    const wrapperId = findComposedBranchWrapperId(data, refKey);
    if (!wrapperId || !data?.id) return false;

    const ids = [String(data.id), wrapperId];
    store.dispatchEvent(new CustomEvent('arborito-set-mobile-path', { detail: { ids } }));

    store.navigateMobilePath(ids);
    if (typeof store.syncTreeContextFromMobilePath === 'function') store.syncTreeContextFromMobilePath();
    store.bumpGraphUiRevision();
    return true;
}

function waitForGraphData(maxMs = 8000) {
    return new Promise((resolve) => {
        const ready = () => !!store.state.data?.id && !!store.state.rawGraphData;
        if (ready()) {
            resolve(true);
            return;
        }
        const started = Date.now();
        const onChange = () => {
            if (ready()) {
                store.removeEventListener('state-change', onChange);
                resolve(true);
            } else if (Date.now() - started >= maxMs) {
                store.removeEventListener('state-change', onChange);
                resolve(false);
            }
        };
        store.addEventListener('state-change', onChange);
        requestAnimationFrame(onChange);
    });
}

function waitForComposedTreeEntry(treeId, maxMs = 8000) {
    if (!treeId) return Promise.resolve(null);
    return new Promise((resolve) => {
        const read = () => store.userStore?.getTree?.(treeId) || null;
        const entry = read();
        if (entry) {
            resolve(entry);
            return;
        }
        const started = Date.now();
        const onChange = () => {
            const next = read();
            if (next) {
                store.removeEventListener('state-change', onChange);
                resolve(next);
            } else if (Date.now() - started >= maxMs) {
                store.removeEventListener('state-change', onChange);
                resolve(null);
            }
        };
        store.addEventListener('state-change', onChange);
        requestAnimationFrame(onChange);
    });
}

function constructionEditPickBranches(entry) {
    const ui = store.ui;
    const branchRefs = Array.isArray(entry?.branchRefs) ? entry.branchRefs : [];
    return branchRefs.map((ref) => {
        const refId = String(ref.refId || ref.branchId || '');
        const branchId = String(ref.branchId || ref.refId || '');
        const localBranch = branchId ? store.userStore?.getBranch?.(branchId) : null;
        const label =
            String(ref.displayName || localBranch?.name || ref.branchId || ref.refId || '').trim() ||
            ui.constructionSessionBranchFallback ||
            'Branch';
        return { id: refId || branchId, label };
    });
}

export async function applyConstructionEditPick(picked) {
    if (!picked) return;
    const ui = store.ui;

    /* Shortcut to Forest → Trees (playlist editing). Leaves construction. */
    if (picked.kind === 'tree') {
        if (typeof store.toggleConstructionMode === 'function' && store.state.constructionMode) {
            await store.toggleConstructionMode();
        }
        try {
            await ensureModalChunk('sources');
        } catch (e) {
            console.warn('[Arborito] sources modal chunk preload failed', e);
        }
        store.setModal({ type: 'sources', focusTab: 'trees' });
        return;
    }

    if (picked.kind !== 'branch') return;
    const refKey = String(picked.refId || '').trim();
    if (!refKey) return;

    const prevLock = String(store.state.constructionLockedBranchRefId || '').trim();
    if (prevLock && prevLock !== refKey) {
        /*
         * Undo frames are whole-graph snaps but disk persist only writes the
         * active locked branch. Flush + clear history when switching branches.
         */
        store._flushPendingConstructionUndo?.();
        try {
            persistActiveComposedBranchFromRaw(store, store.state.rawGraphData);
        } catch {
            /* ignore */
        }
        store.clearConstructionUndoStack?.();
    }

    const ctx = store.state.treeContext;
    const singleBranch = !!(
        ctx?.singleBranch ||
        store.state.rawGraphData?._composedSingleBranch
    );

    setConstructionEditFocus('branch', { lockedBranchRefId: refKey });

    /* Single-branch composed trees have no playlist wrappers — already on branch content. */
    if (singleBranch) {
        if (ctx && ctx.kind === 'composed-tree') {
            store.update({
                treeContext: {
                    ...ctx,
                    branchRefId: ctx.branchRefId || refKey,
                    activeBranchRefId: refKey,
                },
            });
        }
        store.bumpGraphUiRevision?.();
        return;
    }

    if (!navigateComposedBranch(refKey)) {
        setConstructionEditFocus(null);
        store.notify(ui.constructionEnterBranchNavigateFailed || 'Could not open that branch.', true);
    }
}

function showConstructionEditPickModal({ branches }) {
    return new Promise((resolve) => {
        store._constructionEditPickResolve = resolve;
        store.setModal({ type: 'construction-edit-pick', branches });
    });
}

/** Tap the root clover while already in construction — switch locked branch. */
export function openConstructionEditPickFromRoot() {
    if (!store.state.constructionMode || !fileSystem.isLocalComposedTree()) return;
    if (store.state.modal?.type === 'construction-edit-pick') return;

    const treeId = fileSystem.composedTreeId();
    const entry = treeId ? store.userStore?.getTree?.(treeId) : null;
    const branches = constructionEditPickBranches(entry);

    store.setModal({ type: 'construction-edit-pick', branches });
}

/**
 * On entering construction with a composed tree, ask: Forest (playlist) or a branch.
 * Standalone branches default to branch focus immediately.
 */
export async function maybePromptConstructionEditTarget() {
    if (!store.state.constructionMode) return;

    if (!fileSystem.isLocalComposedTree()) {
        setConstructionEditFocus('branch');
        return;
    }

    const hasData = await waitForGraphData();
    if (!hasData) return;

    const treeId = fileSystem.composedTreeId();
    const entry = (await waitForComposedTreeEntry(treeId)) || (treeId ? store.userStore?.getTree?.(treeId) : null);
    const branches = constructionEditPickBranches(entry);
    const picked = await showConstructionEditPickModal({ branches });

    if (!picked) {
        if (typeof store.toggleConstructionMode === 'function') await store.toggleConstructionMode();
        return;
    }
}

/**
 * After closing Arcade / Biblioteca, re-ask which branch if the composed tree has no lock.
 */
export function maybeRepromptConstructionBranchAfterHubDismiss(prevModalType) {
    const t = String(prevModalType || '');
    if (t !== 'arcade' && t !== 'sources' && t !== 'forum') return;
    if (!store.state.constructionMode) return;
    if (!fileSystem.isLocalComposedTree()) return;
    if (String(store.state.constructionLockedBranchRefId || '').trim()) return;
    if (store.state.modal?.type === 'construction-edit-pick') return;
    queueMicrotask(() => {
        void maybePromptConstructionEditTarget();
    });
}

/**
 * Warn before replacing the graph while construction mode is active.
 * @param {string} [nextComposedTreeId]
 * @returns {Promise<boolean>}
 */
export async function confirmConstructionTreeLoadIfNeeded(nextComposedTreeId = '') {
    if (!store.state.constructionMode) return true;
    const hasGraph = !!(store.state.data || store.state.rawGraphData);
    if (!hasGraph) return true;

    const cur = fileSystem.isLocalComposedTree() ? String(fileSystem.composedTreeId() || '').trim() : '';
    const next = String(nextComposedTreeId || '').trim();
    if (cur && next && cur === next) return true;

    const ui = store.ui || {};
    const ok = await store.showDialog?.({
        type: 'confirm',
        title: ui.constructionLoadWhileEditingTitle || 'Load while editing?',
        body:
            ui.constructionLoadWhileEditingBody ||
            'You are in construction mode. Loading another tree or branch leaves this editing session on the map.',
        confirmText: ui.constructionLoadWhileEditingConfirm || 'Load anyway',
        cancelText: ui.cancel || 'Cancel',
    });
    return !!ok;
}
