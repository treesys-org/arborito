/**
 * Cuidados: lecciones con memoria espaciada pendientes (jardín / mochila).
 */

import { TreeUtils } from './tree-utils.js';

const SESSION_KEY = 'arborito-care-reminder';

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

/** @param {import('../store.js').default} store */
export function getCareDueNodeIds(store) {
    const due = store.userStore.getDueNodes();
    const root = store.state.data;
    if (!root || !due.length) return [];
    const dueSet = new Set(due.map(String));
    const out = [];
    walkLeaves(root, (node) => {
        if (dueSet.has(String(node.id))) out.push(String(node.id));
    });
    return out;
}

/** @param {import('../store.js').default} store */
export function countCareDue(store) {
    return getCareDueNodeIds(store).length;
}

/** @param {import('../store.js').default} store */
export function findFirstCareDueNode(store) {
    const ids = getCareDueNodeIds(store);
    if (!ids.length || !store.state.data) return null;
    return TreeUtils.findNode(ids[0], store.state.data);
}

/**
 * @param {import('../store.js').default} store
 * @returns {{ id: string, name: string, icon: string, daysOverdue: number }[]}
 */
export function getCareDueLessons(store) {
    const ids = getCareDueNodeIds(store);
    const now = Date.now();
    const memory = store.userStore.state.memory || {};
    const out = [];
    for (const id of ids) {
        const node = store.findNode(id);
        if (!node) continue;
        const mem = memory[id];
        const daysOverdue = mem
            ? Math.max(0, Math.ceil((now - mem.dueDate) / (24 * 60 * 60 * 1000)))
            : 0;
        out.push({
            id: String(id),
            name: node.name || id,
            icon: node.icon || '📄',
            daysOverdue
        });
    }
    return out;
}

/** @param {import('../store.js').default} store */
export function maybeNotifyCareDue(store) {
    if (store.state.constructionMode || store.state.loading) return;
    const src = store.state.activeSource;
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

/** Abre Arcade en la pestaña Cuidados. */
export function openArcadeCare(store) {
    store.setModal({ type: 'arcade', initialTab: 'garden', dockUi: true });
}

/** @param {import('../store.js').default} store */
export function updateCareSchedule(store, nodeId, quality = 4) {
    if (!nodeId) return;
    store.userStore.reportMemory(nodeId, quality);
}
