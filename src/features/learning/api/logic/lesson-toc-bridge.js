import { getArboritoStore as store } from '../../../../core/store-singleton.js';
import { getToc } from '../content-toc.js';
import { getQuizBlockById } from '../content-panel-quiz.js';
import {
    addTocSectionAfter,
    addTocSubsectionAfter,
    buildConstructStarterProse,
    applyTocSectionMove,
    removeTocSection,
    renameTocSection,
    getTocLineRanges,
    prepareConstructOutlineBody,
    resolveTocRangeIndex,
} from '../lesson-toc-mutations.js';
import { applyTocSectionDrag } from '../lesson-toc-drag.js';
import { isSyntheticIntroItem } from '../lesson-section-slices.js';
import {
    bodyAfterFlushOrAbort,
    clearConstructEditorDomSeed as clearDomSeed,
    setConstructDraftBody,
} from '../../../editor/api/logic/lesson-construct-capture.js';

/**
 * Resolve a clicked TOC row when ids may collide or the list drifted.
 * Prefers idx when it still matches sectionId; else nearest id match to idx.
 */
function resolveClickedTocIndex(toc, idx, sectionId) {
    if (!Array.isArray(toc) || !toc.length) return -1;
    let target = Number(idx);
    if (!Number.isInteger(target) || target < 0 || target >= toc.length) {
        target = -1;
    }
    const want = sectionId != null ? String(sectionId) : '';
    if (target >= 0 && (!want || toc[target]?.id === want)) return target;
    if (!want) return target;
    const matches = [];
    for (let i = 0; i < toc.length; i++) {
        if (toc[i]?.id === want) matches.push(i);
    }
    if (!matches.length) return -1;
    if (matches.length === 1) return matches[0];
    if (target >= 0 && matches.includes(target)) return target;
    /* Nearest duplicate to the clicked index. */
    return matches.reduce((best, i) =>
        Math.abs(i - (target >= 0 ? target : 0)) < Math.abs(best - (target >= 0 ? target : 0))
            ? i
            : best
    );
}

function clearConstructEditorDomSeed(bridge) {
    clearDomSeed(bridge.getEditorEl?.());
}

/**
 * Flush dirty DOM into the live body, or abort.
 * Never mutate TOC / clear seed unless this returns a string.
 * @returns {string|null}
 */
export function flushBodyOrAbort(bridge) {
    const flushed = bridge._flushConstructSectionToBody?.({ force: true });
    return bodyAfterFlushOrAbort(
        flushed,
        bridge.getEditorEl?.(),
        bridge._getLessonBodyForToc?.()
    );
}

function tocMutationPanelPatch(bridge, extra) {
    return {
        lessonDraftLessonId: bridge.currentNode.id,
        lessonConstructDraft: true,
        lessonDraftNonce: bridge._lessonDraftNonce + 1,
        lessonUserHasEdited: true,
        lessonHistoryStack: [],
        lessonHistoryRedoStack: [],
        ...extra
    };
}

/**
 * @param {(body: string) => { body: string, panelExtra?: object }|null|undefined} mutateFn
 */
function runTocMutation(bridge, patchPanel, scheduleUpdate, mutateFn) {
    if (!bridge._isLessonConstructEdit?.()) return;
    const flushed = flushBodyOrAbort(bridge);
    if (flushed == null) {
        const ui = store.ui;
        store.notify(
            ui.lessonTocFlushBlocked ||
                ui.lessonSaveFlushBlocked ||
                'Could not sync the editor before changing the outline. Try again.',
            true
        );
        return;
    }
    const body = prepareConstructOutlineBody(flushed);

    const result = mutateFn(body);
    if (result == null || result.body == null) return;

    const next = prepareConstructOutlineBody(result.body);
    const panelExtra = result.panelExtra || {};
    const nodeId = bridge.currentNode?.id;
    if (nodeId != null) {
        setConstructDraftBody(nodeId, next, {
            patchPanel: (partial) =>
                patchPanel(tocMutationPanelPatch(bridge, { ...partial, ...panelExtra })),
        });
    } else {
        patchPanel(
            tocMutationPanelPatch(bridge, {
                lessonBodyMarkdown: next,
                ...panelExtra,
            })
        );
    }
    clearConstructEditorDomSeed(bridge);
    bridge.lastRenderKey = null;
    scheduleUpdate(true);
    bridge._markLessonUserEdited?.();
}

/** TOC construct bridge methods on content panel API ref. */
export function attachLessonTocBridgeMethods(bridge, { patchPanel, scheduleUpdate }) {
    bridge._getQuizBlockById = (id) => getQuizBlockById(bridge, id);

    bridge._applyTocRename = (idx, title, emoji, sectionId) => {
        runTocMutation(bridge, patchPanel, scheduleUpdate, (body) => {
            const cleaned = String(title != null ? title : '').trim();
            if (!cleaned) {
                /* Empty titles are forbidden — close the editor, keep the heading. */
                return { body, panelExtra: { tocInlineEditIdx: null } };
            }
            const toc = getToc({ content: body });
            const target = resolveClickedTocIndex(toc, idx, sectionId);
            if (target < 0) return null;
            return {
                body: renameTocSection(body, target, cleaned, emoji, toc),
                panelExtra: { tocInlineEditIdx: null },
            };
        });
    };

    bridge._lessonTocAdd = () => {
        runTocMutation(bridge, patchPanel, scheduleUpdate, (body) => {
            const ui = store.ui;
            const title = ui.lessonTocNewSectionTitle || 'New section';
            const bodyHint =
                ui.lessonTocNewSectionStarter || 'Write the content for this part here.';
            const starter = buildConstructStarterProse(title, bodyHint);
            const ranges = getTocLineRanges(body);
            const rangeAfterIdx = ranges.length ? ranges.length - 1 : 0;
            const next = addTocSectionAfter(body, rangeAfterIdx, title, starter);
            const tocAfter = getToc({ content: next });
            return {
                body: next,
                panelExtra: { activeSectionIndex: Math.max(0, tocAfter.length - 1) },
            };
        });
    };

    bridge._lessonTocAddSubAt = (afterIdx, parentId) => {
        runTocMutation(bridge, patchPanel, scheduleUpdate, (body) => {
            const ui = store.ui;
            const title = ui.lessonTocNewSubsectionTitle || 'New sub-topic';
            const bodyHint =
                ui.lessonTocNewSubsectionStarter || 'Write the content for this sub-step here.';
            const ranges = getTocLineRanges(body);
            const tocNow = getToc({ content: body });
            /* Prefer range list (same order as mutations); fall back to getToc ids. */
            let parentIdx = -1;
            const wantId = parentId != null ? String(parentId) : '';
            if (Number.isInteger(afterIdx) && afterIdx >= 0 && afterIdx < ranges.length) {
                if (!wantId || ranges[afterIdx]?.id === wantId) {
                    parentIdx = afterIdx;
                }
            }
            if (parentIdx < 0) {
                parentIdx = resolveClickedTocIndex(tocNow, afterIdx, parentId);
            }
            if (parentIdx < 0 || parentIdx >= ranges.length || isSyntheticIntroItem(ranges[parentIdx])) {
                store.notify(
                    ui.lessonTocMoveBlocked ||
                        'That section move is not available (quiz rows, nesting limits, or filter).',
                    true
                );
                return null;
            }

            const starter = buildConstructStarterProse(title, bodyHint);
            const next = addTocSubsectionAfter(body, parentIdx, title, starter);
            if (next === body) {
                store.notify(
                    ui.lessonTocMoveBlocked ||
                        'That section move is not available (quiz rows, nesting limits, or filter).',
                    true
                );
                return null;
            }
            /* Stay on the clicked row: index is stable when appending after its subtree. */
            return {
                body: next,
                panelExtra: {
                    activeSectionIndex: Math.max(0, Math.min(parentIdx, getToc({ content: next }).length - 1)),
                },
            };
        });
    };

    bridge._lessonTocMoveAt = (idx, action) => {
        if (!['up', 'down', 'indent', 'outdent'].includes(action)) return;

        runTocMutation(bridge, patchPanel, scheduleUpdate, (body) => {
            const tocBefore = getToc({ content: body });
            if (!Number.isInteger(idx) || idx < 0 || idx >= tocBefore.length) return null;
            /* Path math only: ok ⇔ availability. Body bytes never decide success. */
            const result = applyTocSectionMove(body, idx, action);
            if (!result.ok) {
                const ui = store.ui;
                store.notify(
                    ui.lessonTocMoveBlocked ||
                        'That section move is not available (quiz rows, nesting limits, or filter).',
                    true
                );
                return null;
            }
            const tocAfter = getToc({ content: result.body });
            const active =
                result.selectedIndex >= 0 && result.selectedIndex < tocAfter.length
                    ? result.selectedIndex
                    : bridge.activeSectionIndex;
            return {
                body: result.body,
                panelExtra: {
                    activeSectionIndex: Math.max(0, Math.min(active, tocAfter.length - 1)),
                },
            };
        });
    };

    /* DnD entry: same reorder + setLevel primitives as ↑↓←→ (no separate nest engine). */
    bridge._lessonTocDragTo = (fromIdx, insertIndex, targetLevel) => {
        runTocMutation(bridge, patchPanel, scheduleUpdate, (body) => {
            const tocBefore = getToc({ content: body });
            if (!Number.isInteger(fromIdx) || fromIdx < 0 || fromIdx >= tocBefore.length) return null;
            const result = applyTocSectionDrag(body, fromIdx, insertIndex, targetLevel);
            if (!result.ok) {
                const ui = store.ui;
                store.notify(
                    ui.lessonTocMoveBlocked ||
                        'That section move is not available (quiz rows, nesting limits, or filter).',
                    true
                );
                return null;
            }
            const tocAfter = getToc({ content: result.body });
            const active =
                result.selectedIndex >= 0 && result.selectedIndex < tocAfter.length
                    ? result.selectedIndex
                    : bridge.activeSectionIndex;
            return {
                body: result.body,
                panelExtra: {
                    activeSectionIndex: Math.max(0, Math.min(active, tocAfter.length - 1)),
                },
            };
        });
    };

    bridge._lessonTocRemoveAt = async (idx) => {
        if (!bridge._isLessonConstructEdit?.()) return;

        /* Confirm against current body before flush — cancel must not clear the editor. */
        const preview = prepareConstructOutlineBody(bridge._getLessonBodyForToc?.() ?? '');
        const tocPreview = getToc({ content: preview });
        const ui = store.ui;
        if (tocPreview.length <= 1) {
            store.notify(ui.lessonTocRemoveBlocked || 'At least one section is required.', true);
            return;
        }
        const safeIdx = Number.isInteger(idx) ? idx : bridge.activeSectionIndex;
        const target = tocPreview[safeIdx];
        if (!target || isSyntheticIntroItem(target)) return;
        const ranges = getTocLineRanges(preview);
        const rangeIdx = resolveTocRangeIndex(ranges, safeIdx, tocPreview);
        if (ranges[rangeIdx]?.isQuiz) {
            const ok = await store.confirm(
                ui.lessonTocRemoveQuizSectionBody ||
                    'This section includes a quiz. Delete the section and its quiz?',
                ui.lessonTocRemoveQuizSectionTitle || 'Delete section?',
                true
            );
            if (!ok) return;
        }

        runTocMutation(bridge, patchPanel, scheduleUpdate, (body) => {
            const toc = getToc({ content: body });
            if (toc.length <= 1) return null;
            if (safeIdx < 0 || safeIdx >= toc.length) return null;
            if (isSyntheticIntroItem(toc[safeIdx])) return null;
            const next = removeTocSection(body, safeIdx, toc);
            const tocAfter = getToc({ content: next });
            let nextActive = bridge.activeSectionIndex;
            if (bridge.activeSectionIndex >= safeIdx) {
                nextActive = Math.max(0, Math.min(bridge.activeSectionIndex - 1, tocAfter.length - 1));
            }
            return {
                body: next,
                panelExtra: { activeSectionIndex: nextActive },
            };
        });
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
