/**
 * Sync flush of the open construct lesson into localStorage.
 * Used by web `beforeunload` and Electron window-close (before the leave dialog).
 */

import { getArboritoStore } from '../../../../core/store-singleton.js';
import { getPanelRef } from '../../../../app/panel-refs.js';
import { saveLessonDraft, lessonContentFingerprint } from './lesson-draft-persist.js';

export function flushConstructDraftToLocalStorage() {
    const contentEl = getPanelRef('content');
    if (!contentEl?._isLessonDirty?.() || typeof contentEl.captureLiveConstructBody !== 'function') {
        return;
    }
    const body = contentEl.captureLiveConstructBody();
    const node = contentEl.currentNode;
    const st = getArboritoStore();
    const sourceId = st?.state?.activeSource?.id;
    if (body == null || node?.id == null || sourceId == null) return;
    const sectionIdx = Number.isInteger(contentEl.activeSectionIndex)
        ? contentEl.activeSectionIndex
        : 0;
    const meta =
        contentEl.headerMetaDraft?.nodeId === node.id ? contentEl.headerMetaDraft : null;
    saveLessonDraft({
        sourceId,
        nodeId: node.id,
        bodyMarkdown: body,
        headerMetaDraft: meta,
        activeSectionIndex: Math.max(0, sectionIdx),
        baseContentFp: lessonContentFingerprint(node.content),
        curriculumLang:
            st.getCurrentContentLangKey?.() ||
            st.state?.curriculumEditLang ||
            st.state?.lang,
    });
}
