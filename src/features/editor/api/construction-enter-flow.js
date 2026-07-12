import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { fileSystem } from '../../backup-export/api/filesystem.js';
import { getMobilePath } from '../../tree-graph/api/graph-ui-accessors.js';
import { getPanelRef } from '../../../app/panel-refs.js';
import { ensureModalChunk } from '../../../app/modal-chunk-loaders.js';

/** @param {'tree' | 'branch' | null} focus */
export function setConstructionEditFocus(focus, opts = {}) {
    const patch = { constructionEditFocus: focus || null };
    if (opts.lockedBranchRefId != null) {
        patch.constructionLockedBranchRefId = String(opts.lockedBranchRefId || '') || null;
    } else if (focus === 'tree') {
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

/** @returns {'tree' | 'branch' | ''} */
export function resolvePresentationAboutKind() {
    const focus = store.state.constructionEditFocus;
    if (!store.state.constructionMode) return '';

    if (fileSystem.isLocalComposedTree()) {
        if (focus === 'branch') return 'branch';
        return '';
    }

    return focus === 'branch' || !focus ? 'branch' : '';
}

export function isConstructionTreeOnlyMode() {
    return (
        !!store.state.constructionMode &&
        fileSystem.isLocalComposedTree() &&
        store.state.constructionEditFocus === 'tree'
    );
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
    if (isConstructionTreeOnlyMode()) return depth > 1;
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

/** Whether closing Biblioteca should leave construction (tree-edit pick). */
export function shouldExitConstructionWhenSourcesClosed(modal) {
    if (!store.state.constructionMode) return false;
    if (store.state.constructionEditFocus === 'tree') return true;
    return !!(modal && typeof modal === 'object' && modal.constructionTreeLibrary);
}

export async function exitConstructionAfterTreeLibraryClosed(modal) {
    if (!shouldExitConstructionWhenSourcesClosed(modal)) return;
    if (typeof store.toggleConstructionMode === 'function') {
        await store.toggleConstructionMode();
    }
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
    if (picked.kind === 'tree') {
        setConstructionEditFocus('tree');
        try {
            await ensureModalChunk('sources');
        } catch (e) {
            console.warn('[Arborito] sources modal chunk preload failed', e);
        }
        store.setModal({ type: 'sources', focusTab: 'trees', constructionTreeLibrary: true });
        return;
    }
    const refKey = String(picked.refId || '');
    setConstructionEditFocus('branch', { lockedBranchRefId: refKey });
    if (!navigateComposedBranch(refKey)) {
        store.notify(ui.constructionEnterBranchNavigateFailed || 'Could not open that branch.', true);
    }
}

function showConstructionEditPickModal({ branches }) {
    return new Promise((resolve) => {
        store._constructionEditPickResolve = resolve;
        store.setModal({ type: 'construction-edit-pick', branches });
    });
}

/** Tap the root clover (“carita”) while already in construction. */
export function openConstructionEditPickFromRoot() {
    if (!store.state.constructionMode || !fileSystem.isLocalComposedTree()) return;
    if (store.state.modal?.type === 'construction-edit-pick') return;

    const treeId = fileSystem.composedTreeId();
    const entry = treeId ? store.userStore?.getTree?.(treeId) : null;
    const branches = constructionEditPickBranches(entry);

    store.setModal({ type: 'construction-edit-pick', branches });
}

/**
 * On entering construction with a composed tree (playlist), ask tree vs branch.
 * Standalone branches default to branch metadata immediately.
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
