/**
 * Write the active branch curriculum from composed rawGraphData back to userStore
 * so reload does not revive undone CRUD.
 */

import { fileSystem } from '../../backup-export/api/filesystem.js';

/** @param {object} node @param {string} prefix */
function unprefixComposedSubtree(node, prefix) {
    if (!node || typeof node !== 'object') return node;
    const walk = (n) => {
        if (!n || typeof n !== 'object') return;
        if (typeof n.id === 'string' && n.id.startsWith(prefix)) {
            n.id = n.id.slice(prefix.length);
        }
        if (typeof n.parentId === 'string' && n.parentId.startsWith(prefix)) {
            n.parentId = n.parentId.slice(prefix.length);
        }
        delete n._originalId;
        delete n._composedRefId;
        delete n._composedBranchId;
        delete n._composedWrapper;
        delete n._composedVirtualRoot;
        if (Array.isArray(n.children)) n.children.forEach(walk);
    };
    walk(node);
    return node;
}

function resolveActiveComposedRefKeys(store, branchId) {
    const ctx = store?.state?.treeContext;
    const keys = new Set();
    const add = (v) => {
        const s = String(v || '').trim();
        if (s) keys.add(s);
    };
    add(branchId);
    add(ctx?.activeBranchRefId);
    add(ctx?.branchRefId);
    add(store?.state?.constructionLockedBranchRefId);
    return [...keys];
}

function findComposedWrapper(composedRoot, matchKeys) {
    const children = composedRoot?.children || [];
    for (const c of children) {
        if (!c) continue;
        const refId = String(c._composedRefId || '').trim();
        const bid = String(c._composedBranchId || '').trim();
        const id = String(c.id || '');
        for (const key of matchKeys) {
            if (refId === key || bid === key) return c;
            if (id === `${key}::wrapper` || id.startsWith(`${key}::`)) return c;
        }
    }
    return null;
}

/**
 * @param {object} store
 * @param {object|null|undefined} snap restored composed rawGraphData
 * @param {{ notifyOnFailure?: boolean }} [opts]
 * @returns {boolean} true when persisted; false when skipped (not composed) or failed
 */
export function persistActiveComposedBranchFromRaw(store, snap, opts = {}) {
    const notifyOnFailure = !!opts.notifyOnFailure;
    if (!store || !snap?.languages || !fileSystem.isLocalComposedTree()) return false;

    const branchId = fileSystem.localGardenTreeId();
    /* Playlist root / not inside a branch yet — expected, never toast. */
    if (!branchId) return false;

    const entry = store.userStore?.state?.branches?.find((t) => String(t.id) === String(branchId));
    /* Installed/network branch in the playlist has no local garden entry. */
    if (!entry) return false;

    if (snap._composedSingleBranch) {
        const data = JSON.parse(JSON.stringify(snap));
        delete data._composedTreeId;
        delete data._composedSingleBranch;
        delete data._composedBranchRefId;
        delete data._composedTree;
        entry.data = data;
        entry.updated = Date.now();
        store.userStore.state.branches = [...store.userStore.state.branches];
        store.userStore.markBranchDirty(branchId);
        store.userStore.persist();
        return true;
    }

    const matchKeys = resolveActiveComposedRefKeys(store, branchId);
    const base =
        entry.data && typeof entry.data === 'object'
            ? JSON.parse(JSON.stringify(entry.data))
            : { languages: {} };
    if (!base.languages || typeof base.languages !== 'object') base.languages = {};

    let touched = false;
    for (const lang of Object.keys(snap.languages || {})) {
        const composedRoot = snap.languages[lang];
        if (!composedRoot) continue;
        const wrapper = findComposedWrapper(composedRoot, matchKeys);
        if (!wrapper) continue;
        const refId = String(wrapper._composedRefId || branchId);
        const prefix = `${refId}::`;
        const children = JSON.parse(JSON.stringify(wrapper.children || []));
        children.forEach((ch) => unprefixComposedSubtree(ch, prefix));

        const existing = base.languages[lang];
        if (existing && typeof existing === 'object') {
            existing.children = children;
            base.languages[lang] = existing;
        } else {
            base.languages[lang] = {
                id: `${branchId}-root`,
                name: String(wrapper.name || branchId),
                type: 'root',
                icon: wrapper.icon || '🌿',
                expanded: true,
                path: String(wrapper.name || branchId),
                children,
            };
        }
        touched = true;
    }
    if (!touched) {
        if (notifyOnFailure) {
            const ui = store.ui || {};
            store.notify?.(
                ui.constructionComposedPersistFailed ||
                    'Could not save this tree branch on this device.',
                true
            );
        }
        return false;
    }
    entry.data = base;
    entry.updated = Date.now();
    store.userStore.state.branches = [...store.userStore.state.branches];
    store.userStore.markBranchDirty(branchId);
    store.userStore.persist();
    return true;
}
