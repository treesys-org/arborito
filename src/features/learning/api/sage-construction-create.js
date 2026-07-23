import { getArboritoStore } from '../../../core/store-singleton.js';
import { fileSystem } from '../../backup-export/api/filesystem.js';
import { graphPanelRootEl } from '../../tree-graph/api/graph-panel-api.js';
import { findParentBranch } from './sage-tree-rag.js';

/**
 * Resolve a folder/root where Sage may create a child (same idea as the map FAB).
 * Prefers explicit parent, then learning selection, graph selection, mobile path, then tree root.
 * @param {object} store
 * @param {object | null} parentNode
 * @returns {object | null}
 */
export function resolveSageConstructionParent(store, parentNode = null) {
    const find = (id) => (id != null ? store.findNode?.(id) : null);
    const treeRoot = store.state?.data || null;
    let parent = parentNode || store.state?.selectedNode || store.state?.previewNode || null;

    const graphId = store.state?.graphUi?.selectedNodeId;
    if ((!parent || (parent.type !== 'root' && parent.type !== 'branch')) && graphId) {
        parent = find(graphId) || parent;
    }

    if (!parent || (parent.type !== 'root' && parent.type !== 'branch')) {
        const path = store.state?.graphUi?.mobilePath || [];
        for (let i = path.length - 1; i >= 0; i -= 1) {
            const n = find(path[i]);
            if (n && (n.type === 'root' || n.type === 'branch') && !n._composedVirtualRoot) {
                parent = n;
                break;
            }
        }
    }

    if (parent && (parent.type === 'leaf' || parent.type === 'exam') && treeRoot) {
        parent = findParentBranch(treeRoot, parent.id) || parent;
    }

    if ((!parent || (parent.type !== 'root' && parent.type !== 'branch')) && treeRoot) {
        if ((treeRoot.type === 'root' || treeRoot.type === 'branch') && !treeRoot._composedVirtualRoot) {
            parent = treeRoot;
        }
    }

    if (!parent || (parent.type !== 'root' && parent.type !== 'branch')) return null;
    if (parent._composedVirtualRoot) return null;
    return parent;
}

/**
 * @param {'need-construction'|'readonly'|'need-module'|'create-failed'} reason
 * @param {Record<string, string>} ui
 */
export function describeSageConstructionCreateFailure(reason, ui = {}) {
    if (reason === 'need-construction') {
        return ui.sageGuideConNeedConstruction || ui.navConstruct || 'Turn on construction mode first.';
    }
    if (reason === 'readonly') {
        return (
            ui.sageConstructReadonly ||
            ui.constructionDemoReadonlyMessage ||
            ui.constructionEnterBranchToEdit ||
            ui.treeReadOnlyHint ||
            'This branch is read-only. Open a writable branch to add items.'
        );
    }
    if (reason === 'need-module') {
        return (
            ui.sageConstructNeedModule ||
            ui.sageGuideConPickModule ||
            'Select a module on the map first, then ask me again.'
        );
    }
    return (
        ui.sageConstructCreateFailed ||
        'I could not create that on the map. Check that construction mode is on and the branch is writable.'
    );
}

function dockActionFor(action) {
    return action === 'create-folder' ? 'new-folder' : action === 'create-exam' ? 'new-exam' : 'new-file';
}

/**
 * @param {object} store
 * @param {object} parent
 * @param {'create-lesson'|'create-folder'|'create-exam'} action
 * @param {string} preferredName
 */
async function createOneQuiet(store, parent, action, preferredName) {
    store.selectMobileNode?.(parent.id);
    store.setGraphMoveMode?.(false);
    const rootEl = graphPanelRootEl();
    const beforeIds = new Set((parent.children || []).map((c) => String(c.id)));
    const ok = await store.handleGraphDockAction?.(
        dockActionFor(action),
        {
            skipPrompt: true,
            openCreated: false,
            quietNotify: true,
            preferredName: preferredName || undefined,
        },
        rootEl
    );
    if (ok !== true) return null;
    const liveParent = store.findNode?.(parent.id) || parent;
    const fresh = (liveParent.children || []).find((c) => !beforeIds.has(String(c.id)));
    return fresh || null;
}

/**
 * Create one or more tree nodes from Sage AI (construction mode only).
 * Supports optional names, numbered prefixes, and one nested child batch under the first created folder.
 *
 * @param {'create-lesson'|'create-folder'|'create-exam'} action
 * @param {{
 *   parentNode?: object | null,
 *   ui?: Record<string, string>,
 *   quiet?: boolean,
 *   count?: number,
 *   name?: string,
 *   namePrefix?: string,
 *   nested?: { action: string, count?: number, namePrefix?: string, name?: string } | null,
 * }} [opts]
 * @returns {Promise<{ ok: boolean, reason?: string, parent?: object | null, created?: number, lastCreated?: object | null }>}
 */
export async function runSageConstructionCreate(
    action,
    {
        parentNode = null,
        ui: uiOverride,
        quiet = true,
        count = 1,
        name = '',
        namePrefix = '',
        nested = null,
    } = {}
) {
    const store = getArboritoStore();
    if (!store) return { ok: false, reason: 'create-failed', created: 0 };

    const ui = uiOverride || store.ui || {};
    if (!store.state.constructionMode) {
        if (!quiet) {
            store.notify(describeSageConstructionCreateFailure('need-construction', ui), true);
        }
        return { ok: false, reason: 'need-construction', created: 0 };
    }

    if (!fileSystem.features.canWrite) {
        if (!quiet) {
            store.notify(describeSageConstructionCreateFailure('readonly', ui), true);
        }
        return { ok: false, reason: 'readonly', created: 0 };
    }

    const parent = resolveSageConstructionParent(store, parentNode);
    if (!parent) {
        if (!quiet) {
            store.notify(describeSageConstructionCreateFailure('need-module', ui), true);
        }
        return { ok: false, reason: 'need-module', created: 0 };
    }

    const n = Math.max(1, Math.min(20, Math.floor(Number(count) || 1)));
    const prefix = String(namePrefix || '').trim();
    const singleName = String(name || '').trim();
    let created = 0;
    /** @type {object | null} */
    let lastCreated = null;
    /** @type {object | null} */
    let firstFolder = null;

    for (let i = 0; i < n; i += 1) {
        let preferred = '';
        if (n === 1 && singleName) preferred = singleName;
        else if (prefix) preferred = `${prefix} ${i + 1}`;
        else if (singleName && n > 1) preferred = `${singleName} ${i + 1}`;
        const node = await createOneQuiet(store, parent, action, preferred);
        if (!node) break;
        created += 1;
        lastCreated = node;
        if (!firstFolder && (node.type === 'branch' || node.type === 'root')) firstFolder = node;
    }

    if (nested && firstFolder && created > 0) {
        const childAction = nested.action || 'create-folder';
        const childCount = Math.max(1, Math.min(20, Math.floor(Number(nested.count) || 1)));
        const childPrefix = String(nested.namePrefix || nested.name || '').trim();
        for (let i = 0; i < childCount; i += 1) {
            const preferred = childPrefix
                ? childCount === 1 && nested.name && !nested.namePrefix
                    ? childPrefix
                    : `${childPrefix} ${i + 1}`
                : '';
            const node = await createOneQuiet(store, firstFolder, childAction, preferred);
            if (!node) break;
            created += 1;
            lastCreated = node;
        }
    }

    store.bumpGraphUiRevision?.();
    if (created > 0) return { ok: true, parent, created, lastCreated };
    return { ok: false, reason: 'create-failed', parent, created: 0, lastCreated: null };
}
