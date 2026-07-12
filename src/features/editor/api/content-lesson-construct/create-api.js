import { contentLessonConstructMethods } from './index.js';
import { attachLessonTocBridgeMethods } from '../../../learning/api/logic/lesson-toc-bridge.js';

/** Bind lesson construct + TOC methods onto a plain context object (no DOM bridge). */
export function createLessonConstructApi(ctx, { patchPanel, scheduleUpdate, lessonEditorMethods }) {
    const api = {
        ...ctx,
        _patchPanelField: patchPanel,
        scheduleUpdate,
        _getEditorEl: ctx.getEditorEl,
        ...lessonEditorMethods,
        ...contentLessonConstructMethods,
    };
    attachLessonTocBridgeMethods(api, { patchPanel, scheduleUpdate });
    api.patchTocFilterList = () => {
        if (ctx.tocInlineEditIdx != null && ctx.pendingTocRenameTitle != null) {
            api._applyTocRename?.(ctx.tocInlineEditIdx, ctx.pendingTocRenameTitle, '');
        }
    };
    return api;
}
