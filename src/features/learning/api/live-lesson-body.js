/**
 * Resolve the in-editor lesson body when construction has unsaved DOM / draft state.
 * Used by meta saves (icon, rename, properties) so they do not overwrite live edits.
 */

import { getPanelRef } from '../../../app/panel-refs.js';
import { parseArboritoFile } from '../../editor/api/editor-engine.js';
import { extractTocSectionMarkdown } from './lesson-section-slices.js';

/**
 * @param {object|null|undefined} node
 * @returns {string|null} live body when the open construct lesson matches `node`; else null
 */
export function captureLiveConstructBodyForNode(node) {
    if (!node || (node.type !== 'leaf' && node.type !== 'exam')) return null;
    const api = getPanelRef('content');
    if (!api || String(api.currentNode?.id || '') !== String(node.id)) return null;
    if (typeof api.captureLiveConstructBody === 'function') {
        return api.captureLiveConstructBody();
    }
    return null;
}

/**
 * Body for meta persist: live construct body if open, else parsed file body.
 * @param {object} node
 * @returns {string}
 */
export function resolveLessonBodyForMetaPersist(node) {
    const live = captureLiveConstructBodyForNode(node);
    if (typeof live === 'string') return live;
    return parseArboritoFile(node?.content || '').body || '';
}

/**
 * Sync capture used by the content panel API — delegates to flush / getLessonBodyForToc.
 * @returns {string|null} body, or null when dirty DOM could not be flushed (caller must abort)
 */
export function captureLiveConstructBodyFromCtx(ctx) {
    const ed = ctx.getEditorEl?.();
    if (ed && ed.dataset?.arboritoEditorDirty === '1') {
        const flushed = ctx.flushForce?.();
        if (flushed && flushed.ok !== false && !flushed.aborted && flushed.bodyMarkdown != null) {
            return flushed.bodyMarkdown;
        }
        return null;
    }
    return ctx.getLessonBodyForToc?.() || ctx.lessonBodyMarkdown || '';
}

export { extractTocSectionMarkdown };
