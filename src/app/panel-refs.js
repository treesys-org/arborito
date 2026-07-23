/** Runtime refs for cross-panel APIs (replaces document.querySelector('arborito-*')). */
const refs = new Map();
/** @type {WeakMap<HTMLElement, object>} */
const domToPanel = new WeakMap();

/** @param {string} name e.g. 'sidebar', 'graph', 'content' */
export function registerPanelRef(name, panel) {
    if (name && panel) refs.set(name, panel);
}

export function unregisterPanelRef(name) {
    refs.delete(name);
}

/** @param {string} name */
export function getPanelRef(name) {
    return refs.get(name) ?? null;
}

export function linkPanelDom(root, panel) {
    if (root && panel) domToPanel.set(root, panel);
}

export function getPanelFromDom(root) {
    return root ? domToPanel.get(root) ?? null : null;
}

export function unlinkPanelDom(root) {
    if (root) domToPanel.delete(root);
}

/** Map legacy tag names to panel ref keys. */
const TAG_TO_REF = {
    'arborito-sidebar': 'sidebar',
    'arborito-graph': 'graph',
    'arborito-content': 'content',
    'arborito-construction-panel': 'construction-panel',
    'arborito-progress-widget': 'progress-widget',
    'arborito-sage': 'sage',
    'arborito-product-tour': 'product-tour',
    'arborito-tree-presentation': 'tree-presentation',
    'arborito-modal-sources': 'modal-sources',
    'arborito-modals': 'modals',
    'arborito-modal-overlay-host': 'modal-overlay-host',
};

/** Drop-in replacement for document.querySelector('arborito-*'). */
export function queryPanelRef(selector) {
    const tag = String(selector || '')
        .replace(/[<>'"]/g, '')
        .trim();
    const key = TAG_TO_REF[tag] || tag.replace(/^arborito-/, '');
    const ref = getPanelRef(key);
    if (ref) return ref;
    const byData = document.querySelector(`[data-arborito-panel="${key}"]`);
    if (byData) return byData;
    if (tag.startsWith('arborito-')) return document.querySelector(tag);
    return document.querySelector(`arborito-${tag}`);
}
