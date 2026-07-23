/**
 * Sage Guide, pure context + navigation helpers (no HTML).
 */

/** @returns {{ screen: 'hub' }} */
export function defaultSageGuideNav() {
    return { screen: 'hub' };
}

/**
 * @param {object} store
 * @param {{ lessonNode?: object|null }} opts
 */
export function detectSageGuideContext(store, opts = {}) {
    const lessonNode = opts.lessonNode;
    if (lessonNode && (lessonNode.type === 'leaf' || lessonNode.type === 'exam')) {
        return { mode: 'lesson', node: lessonNode };
    }
    if (store.value.constructionMode) {
        return { mode: 'construction', node: store.value.selectedNode || null };
    }
    return { mode: 'tree', node: store.value.selectedNode || null };
}
