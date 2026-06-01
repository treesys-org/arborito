/** Spaced-repetition care reminders (garden / backpack). */

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

/** @param {import('../../core/store.js').default} store */
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

/** @param {import('../../core/store.js').default} store */
export function countCareDue(store) {
    return getCareDueNodeIds(store).length;
}

/** @param {import('../../core/store.js').default} store */
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

/** Opens Arcade on the Care tab. */
export function openArcadeCare(store) {
    store.setModal({ type: 'arcade', initialTab: 'garden', dockUi: true });
}
