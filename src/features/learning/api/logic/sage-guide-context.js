/**
 * Sage Guide, pure context + navigation helpers (no HTML).
 */

import { getSageNodeFields, getSageSupportResponse } from '../sage-contextual.js';

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

/** @param {string} topicId @param {object} ui @param {object} store @param {ReturnType<typeof detectSageGuideContext>} ctx */
export function resolveTipText(topicId, ui, store, ctx) {
    const node = ctx.node;
    if (topicId === 'summary' || topicId === 'notes') {
        const fields = getSageNodeFields(node);
        return topicId === 'summary' ? fields.description : fields.notes;
    }
    return getSageSupportResponse(topicId, ui, {
        selectedNode: node,
        previewNode: store.value.previewNode,
        store,
    });
}
