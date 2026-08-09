import { getStoreTreeRoot, getStoreFields } from '../../../shared/lib/store-facade.js';
import { lessonBodyHasPlayableQuiz } from '../../learning/api/quiz-status.js';

/** Spaced-repetition care reminders (garden / backpack). */

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
 * True when this leaf can be watered (has a playable questionnaire).
 * Empty / still-lazy bodies are treated as unknown (keep until content loads).
 * @param {object|null|undefined} node
 */
export function nodeIsCareWaterable(node) {
    if (!node || (node.type !== 'leaf' && node.type !== 'exam')) return false;
    const body = node.content;
    if (body && String(body).trim()) {
        return lessonBodyHasPlayableQuiz(body);
    }
    /* Lazy / not loaded yet — keep until we can prove there is no quiz. */
    return !!(node.treeLazyContent || node.contentPath);
}

/**
 * Drop SRS rows for open-tree leaves whose body is loaded and has no playable quiz
 * (e.g. intros enrolled by older builds). Safe to call after tree load — not during render.
 * @param {import('../../../core/store.js' ).default} store
 * @returns {number} rows removed
 */
export function pruneQuizlessCareMemory(store) {
    const userStore = store?.userStore;
    if (!userStore?.state?.memory) return 0;
    const root = getStoreTreeRoot(store);
    if (!root) return 0;
    const leafIds = collectOpenTreeLeafIds(root);
    const findNode = typeof store.findNode === 'function' ? (id) => store.findNode(id) : null;
    if (!findNode) return 0;
    let removed = 0;
    for (const id of Object.keys(userStore.state.memory)) {
        if (!leafIds.has(String(id))) continue;
        const node = findNode(id);
        if (!node) continue;
        const body = node.content;
        if (!body || !String(body).trim()) continue;
        if (lessonBodyHasPlayableQuiz(body)) continue;
        if (forgetOrphanCareMemory(userStore, id)) removed += 1;
    }
    return removed;
}

/**
 * Due care ids limited to the open tree, and only lessons that can actually
 * be watered (playable quiz). Does not mutate memory (see pruneQuizlessCareMemory).
 */
export function getCareDueNodeIds(store) {
    const userStore = store?.userStore;
    if (!userStore?.getDueNodes) return [];
    const due = userStore.getDueNodes();
    const root = getStoreTreeRoot(store);
    if (!root || !due.length) return [];
    const leafIds = collectOpenTreeLeafIds(root);
    if (!leafIds.size) return [];
    const findNode = typeof store.findNode === 'function' ? (id) => store.findNode(id) : null;
    return due.map(String).filter((id) => {
        if (!leafIds.has(id)) return false;
        if (!findNode) return true;
        const node = findNode(id);
        if (!node) return false;
        return nodeIsCareWaterable(node);
    });
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

/**
 * After tree load: prune quiz-less care rows. No top toast — care is already
 * visible in Mochila / Arcade Cuidados, and mobile toasts blocked the chrome.
 * @param {import('../../../core/store.js' ).default} store
 */
export function maybeNotifyCareDue(store) {
    const fields = getStoreFields(store);
    if (fields.constructionMode || fields.loading) return;
    const src = fields.activeSource;
    if (!src || !src.id) return;
    pruneQuizlessCareMemory(store);
}

/** Opens Arcade on the Care tab. */
export function openArcadeCare(store) {
    store.setModal({ type: 'arcade', initialTab: 'garden', dockUi: true });
}
