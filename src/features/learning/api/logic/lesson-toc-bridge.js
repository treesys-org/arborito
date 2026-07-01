import { getArboritoStore as store } from '../../../../core/store-singleton.js';
import { getToc } from '../content-toc.js';
import { getQuizBlockById } from '../content-panel-quiz.js';
import {
    addTocSectionAfter,
    addTocSubsectionAfter,
    removeTocSection,
    renameTocSection,
    getTocLineRanges
} from '../lesson-toc-mutations.js';

function uniqueTitle(base, toc) {
    const b = String(base || '').trim();
    if (!b) return 'New section';
    const re = new RegExp(`^${b.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}(?:\\s+(\\d+))?$`, 'i');
    let max = 0;
    for (const it of toc || []) {
        if (!it || it.id === 'intro') continue;
        const t = String(it.text || '').trim();
        const m = t.match(re);
        if (!m) continue;
        const n = m[1] ? parseInt(m[1], 10) : 1;
        if (Number.isFinite(n)) max = Math.max(max, n);
    }
    return max <= 0 ? b : `${b} ${max + 1}`;
}

/** TOC construct bridge methods on content panel API ref. */
export function attachLessonTocBridgeMethods(bridge, { patchPanel, scheduleUpdate }) {
    bridge._getQuizBlockById = (id) => getQuizBlockById(bridge, id);

    bridge._applyTocRename = (idx, title, emoji) => {
        if (!bridge._isLessonConstructEdit?.()) return;
        bridge._captureLessonDraftFromDom?.();
        const body = bridge._getLessonBodyForToc();
        const next = renameTocSection(body, idx, title, emoji);
        patchPanel({
            lessonBodyMarkdown: next,
            lessonDraftLessonId: bridge.currentNode.id,
            lessonDraftNonce: bridge._lessonDraftNonce + 1,
            tocInlineEditIdx: null,
            lessonUserHasEdited: true
        });
        bridge._skipLessonDraftDomCapture = true;
        bridge.lastRenderKey = null;
        scheduleUpdate(true);
    };

    bridge._lessonTocAdd = () => {
        if (!bridge._isLessonConstructEdit?.()) return;
        bridge._captureLessonDraftFromDom?.();
        const body = bridge._getLessonBodyForToc();
        const ui = store.ui;
        const baseTitle = ui.lessonTocNewSectionTitle || 'New section';
        const tocNow = getToc({ content: body });
        const title = uniqueTitle(baseTitle, tocNow);
        const ranges = getTocLineRanges(body);
        const rangeAfterIdx = ranges.length ? ranges.length - 1 : 0;
        const next = addTocSectionAfter(body, rangeAfterIdx, title);
        const tocAfter = getToc({ content: next });
        patchPanel({
            lessonBodyMarkdown: next,
            lessonDraftLessonId: bridge.currentNode.id,
            lessonDraftNonce: bridge._lessonDraftNonce + 1,
            activeSectionIndex: Math.max(0, tocAfter.length - 1),
            lessonUserHasEdited: true
        });
        bridge._skipLessonDraftDomCapture = true;
        bridge.lastRenderKey = null;
        scheduleUpdate(true);
    };

    bridge._lessonTocAddSubAt = (afterIdx) => {
        if (!bridge._isLessonConstructEdit?.()) return;
        bridge._captureLessonDraftFromDom?.();
        const body = bridge._getLessonBodyForToc();
        const ui = store.ui;
        const baseTitle = ui.lessonTocNewSubsectionTitle || 'New sub-topic';
        const safeAfter = Number.isInteger(afterIdx) ? afterIdx : bridge.activeSectionIndex;
        const tocNow = getToc({ content: body });
        const title = uniqueTitle(baseTitle, tocNow);
        const next = addTocSubsectionAfter(body, safeAfter, title);
        const tocAfter = getToc({ content: next });
        const titleNorm = String(title || '').trim();
        let newIdx = -1;
        for (let i = tocAfter.length - 1; i >= 0; i--) {
            if (String(tocAfter[i].text || '').trim() === titleNorm) {
                newIdx = i;
                break;
            }
        }
        patchPanel({
            lessonBodyMarkdown: next,
            lessonDraftLessonId: bridge.currentNode.id,
            lessonDraftNonce: bridge._lessonDraftNonce + 1,
            activeSectionIndex: newIdx >= 0 ? newIdx : Math.max(0, tocAfter.length - 1),
            lessonUserHasEdited: true
        });
        bridge._skipLessonDraftDomCapture = true;
        bridge.lastRenderKey = null;
        scheduleUpdate(true);
    };

    bridge._lessonTocRemoveAt = (idx) => {
        if (!bridge._isLessonConstructEdit?.()) return;
        bridge._captureLessonDraftFromDom?.();
        const body = bridge._getLessonBodyForToc();
        const toc = getToc({ content: body });
        const ui = store.ui;
        if (toc.length <= 1) {
            store.notify(ui.lessonTocRemoveBlocked || 'At least one section is required.', true);
            return;
        }
        const safeIdx = Number.isInteger(idx) ? idx : bridge.activeSectionIndex;
        const target = toc[safeIdx];
        if (!target || target.id === 'intro' || target.isQuiz) return;
        const next = removeTocSection(body, safeIdx);
        const tocAfter = getToc({ content: next });
        let nextActive = bridge.activeSectionIndex;
        if (bridge.activeSectionIndex >= safeIdx) {
            nextActive = Math.max(0, Math.min(bridge.activeSectionIndex - 1, tocAfter.length - 1));
        }
        patchPanel({
            lessonBodyMarkdown: next,
            lessonDraftLessonId: bridge.currentNode.id,
            lessonDraftNonce: bridge._lessonDraftNonce + 1,
            activeSectionIndex: nextActive,
            lessonUserHasEdited: true
        });
        bridge._skipLessonDraftDomCapture = true;
        bridge.lastRenderKey = null;
        scheduleUpdate(true);
    };
}

/** Commit open TOC inline edit if present. */
export function patchTocFilterList(ctx) {
    if (!ctx.currentNode) return;
    if (ctx._tocInlineEditIdx != null) {
        const root = ctx.root;
        const openInp = root?.querySelector('.js-toc-edit-title');
        if (openInp && Number.isInteger(ctx._tocInlineEditIdx)) {
            ctx._applyTocRename?.(ctx._tocInlineEditIdx, openInp.value, '');
        }
    }
}
