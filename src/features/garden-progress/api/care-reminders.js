import { getStoreTreeRoot, getStoreFields } from '../../../shared/lib/store-facade.js';

/** Spaced-repetition care reminders (garden / backpack). */

const SESSION_KEY = 'arborito-care-reminder';

export { getStoreTreeRoot };

function walkLeaves(root, fn) {
    if (!root) return;
    const stack = [root];
    while (stack.length) {
        const node = stack.pop();
        if (!node) continue;
        if (node.type === 'leaf' || node.type === 'exam') fn(node);
        if (Array.isArray(node.children)) {
            for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
        }
    }
}

/** Leaf/exam ids in the mounted graph (single branch or composed tree). */
export function collectOpenTreeLeafIds(root) {
    const ids = new Set();
    walkLeaves(root, (node) => {
        const id = String(node?.id || '').trim();
        if (id) ids.add(id);
    });
    return ids;
}

/**
 * Due care ids limited to the open tree.
 * Composed trees use the mounted graph (`data`), which already includes their branches.
 */
export function getCareDueNodeIds(store) {
    const userStore = store?.userStore;
    if (!userStore?.getDueNodes) return [];
    const due = userStore.getDueNodes();
    const root = getStoreTreeRoot(store);
    if (!root || !due.length) return [];
    const leafIds = collectOpenTreeLeafIds(root);
    if (!leafIds.size) return [];
    return due.map(String).filter((id) => leafIds.has(id));
}

/** @param {import('../../../core/store.js' ).default} store */
export function countCareDue(store) {
    return getCareDueNodeIds(store).length;
}

/**
 * Drop a stale memory row when watering cannot resolve the lesson in the open tree.
 * @returns {boolean} true when an entry was removed
 */
export function forgetOrphanCareMemory(userStore, nodeId) {
    if (typeof userStore?.forgetMemory === 'function') {
        return !!userStore.forgetMemory(nodeId);
    }
    const id = String(nodeId || '').trim();
    if (!id || !userStore?.state?.memory) return false;
    if (!Object.prototype.hasOwnProperty.call(userStore.state.memory, id)) return false;
    delete userStore.state.memory[id];
    if (typeof userStore.persist === 'function') userStore.persist();
    return true;
}

/** @param {import('../../../core/store.js' ).default} store */
export function maybeNotifyCareDue(store) {
    const fields = getStoreFields(store);
    if (fields.constructionMode || fields.loading) return;
    const src = fields.activeSource;
    if (!src || !src.id) return;
    const count = countCareDue(store);
    if (count <= 0) return;
    try {
        const key = `${SESSION_KEY}:${src.id}`;
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, '1');
    } catch {
        /* private mode */
    }
    const ui = store.ui || {};
    const tpl = ui.careDueReminder || 'Tienes {count} cuidados pendientes.';
    store.notify(String(tpl).replace(/\{count\}/g, String(count)), false);
}

/** Opens Arcade on the Care tab. */
export function openArcadeCare(store) {
    store.setModal({ type: 'arcade', initialTab: 'garden', dockUi: true });
}
