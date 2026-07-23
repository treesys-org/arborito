/**
 * Construct body: one live draft string + one flush.
 * DOM is a view of one section's prose. Never clear the editor without a successful flush.
 */

import {
    extractSectionProseMarkdown,
    getTocSectionRanges,
    replaceSectionProseMarkdown,
    sanitiseConstructSectionMarkdown,
} from '../../../learning/api/lesson-section-slices.js';
import { setSyncLessonDraftBody } from './lesson-sync-draft-body.js';
import { captureEditorSectionMarkdown } from './lesson-editor-dom.js';
import {
    parseConstructEditorSeed,
    formatConstructEditorSeed,
    resolvePinnedFlushSectionIndex,
} from './lesson-construct-seed.js';
import { resolveLiveConstructBody } from './lesson-construct-body.js';

export { bodyAfterFlushOrAbort } from './lesson-construct-seed.js';
export { resolveLiveConstructBody } from './lesson-construct-body.js';

/** @param {HTMLElement|null|undefined} ed */
export function isLessonBodyDomDirty(ed) {
    return !!ed && ed.dataset?.arboritoEditorDirty === '1';
}

/** @param {HTMLElement|null|undefined} ed */
export function clearConstructEditorDomSeed(ed) {
    if (!ed) return;
    try {
        delete ed.dataset.arboritoEditorDirty;
        delete ed.dataset.arboritoEditorSeed;
        delete ed.dataset.arboritoEditorProse;
    } catch {
        /* ignore */
    }
}

/**
 * @param {HTMLElement|null|undefined} ed
 * @param {{ markUserEdited?: () => void }} [opts]
 */
export function markConstructBodyEdited(ed, opts = {}) {
    if (ed) {
        try {
            ed.dataset.arboritoEditorDirty = '1';
        } catch {
            /* ignore */
        }
    }
    opts.markUserEdited?.();
}

/**
 * Prefer DOM seed index over React active index.
 * @param {HTMLElement|null|undefined} ed
 * @param {{ activeSectionIndex?: number }} [opts]
 */
export function resolveEditorSectionIndex(ed, opts = {}) {
    const pin = parseConstructEditorSeed(ed?.dataset?.arboritoEditorSeed);
    if (pin.index != null && Number.isInteger(pin.index)) return pin.index;
    if (Number.isInteger(opts.activeSectionIndex)) return opts.activeSectionIndex;
    return 0;
}

/**
 * Write the one live draft (sync + panel together).
 * @param {string|number} nodeId
 * @param {string} body
 * @param {{ patchPanel?: (p: object) => void, invalidateLessonParseCache?: () => void, panelExtra?: object }} [opts]
 */
export function setConstructDraftBody(nodeId, body, opts = {}) {
    setSyncLessonDraftBody(nodeId, body);
    opts.invalidateLessonParseCache?.();
    opts.patchPanel?.({
        lessonBodyMarkdown: body,
        lessonDraftLessonId: nodeId,
        lessonConstructDraft: true,
        ...(opts.panelExtra || {}),
    });
}

/**
 * Merge dirty DOM prose into body, or abort. Never clears seed/dirty on failure.
 *
 * @param {{
 *   editorEl?: HTMLElement|null,
 *   node?: { id?: string, content?: string }|null,
 *   activeSectionIndex?: number,
 *   lessonBodyMarkdown?: string|null,
 *   lessonConstructDraft?: boolean,
 *   lessonDraftLessonId?: string|null,
 *   getLessonBodyForToc?: () => string,
 *   patchPanel?: (partial: object) => void,
 *   invalidateLessonParseCache?: () => void,
 *   scheduleDraftAutosave?: () => void,
 * }} ctx
 * @param {{ commit?: boolean }} [opts] commit=false keeps dirty (autosave peek)
 * @returns {{
 *   ok: boolean,
 *   body: string,
 *   bodyMarkdown: string,
 *   flushIdx: number,
 *   sectionMd: string|null,
 *   nextSectionIdx: number,
 *   skipped?: boolean,
 *   aborted?: boolean,
 * }|null}
 */
export function flushConstructEditor(ctx, opts = {}) {
    const commit = opts.commit !== false;
    const ed = ctx.editorEl;
    const node = ctx.node;
    if (!ed || !node?.id) return null;

    const body =
        typeof ctx.getLessonBodyForToc === 'function'
            ? ctx.getLessonBodyForToc() || ''
            : resolveLiveConstructBody({
                  nodeId: node.id,
                  nodeContent: node.content,
                  lessonBodyMarkdown: ctx.lessonBodyMarkdown,
                  lessonConstructDraft: ctx.lessonConstructDraft,
                  lessonDraftLessonId: ctx.lessonDraftLessonId,
              });

    if (!isLessonBodyDomDirty(ed)) {
        const flushIdx = resolveEditorSectionIndex(ed, {
            activeSectionIndex: ctx.activeSectionIndex,
        });
        const sectionMd = extractSectionProseMarkdown(body, flushIdx);
        return {
            ok: true,
            body,
            bodyMarkdown: body,
            flushIdx,
            sectionMd,
            nextSectionIdx: flushIdx,
            skipped: true,
        };
    }

    let flushIdx = resolvePinnedFlushSectionIndex(ed, body);
    if (flushIdx == null) {
        /* Heal a missing/stale pin from the focused section so TOC/save are not stuck. */
        const ranges = getTocSectionRanges(body);
        const active = Number.isInteger(ctx.activeSectionIndex) ? ctx.activeSectionIndex : 0;
        if (ranges.length && active >= 0 && active < ranges.length) {
            try {
                ed.dataset.arboritoEditorSeed = formatConstructEditorSeed(
                    active,
                    ranges[active]?.id || ''
                );
            } catch {
                /* ignore */
            }
            flushIdx = active;
        }
    }
    if (flushIdx == null) {
        return {
            ok: false,
            body,
            bodyMarkdown: body,
            flushIdx: -1,
            sectionMd: null,
            nextSectionIdx: Number.isInteger(ctx.activeSectionIndex) ? ctx.activeSectionIndex : 0,
            aborted: true,
        };
    }

    const pin = parseConstructEditorSeed(ed.dataset.arboritoEditorSeed);
    const rangesBefore = getTocSectionRanges(body);
    const beforeId = pin.sectionId || rangesBefore[flushIdx]?.id;
    const proseMd = sanitiseConstructSectionMarkdown(captureEditorSectionMarkdown(ed));
    const nextBody = replaceSectionProseMarkdown(body, flushIdx, proseMd);

    let nextSectionIdx = flushIdx;
    const rangesAfter = getTocSectionRanges(nextBody);
    if (beforeId) {
        const j = rangesAfter.findIndex((r) => r.id === beforeId);
        if (j !== -1) nextSectionIdx = j;
        else nextSectionIdx = Math.max(0, Math.min(flushIdx, Math.max(0, rangesAfter.length - 1)));
    } else if (rangesAfter.length) {
        nextSectionIdx = Math.max(0, Math.min(flushIdx, rangesAfter.length - 1));
    }

    setSyncLessonDraftBody(node.id, nextBody);

    if (commit) {
        try {
            delete ed.dataset.arboritoEditorDirty;
        } catch {
            /* ignore */
        }
        if (nextBody !== ctx.lessonBodyMarkdown) {
            ctx.invalidateLessonParseCache?.();
            ctx.patchPanel?.({
                lessonBodyMarkdown: nextBody,
                lessonDraftLessonId: node.id,
                lessonConstructDraft: true,
                ...(nextSectionIdx !== ctx.activeSectionIndex
                    ? {
                          activeSectionIndex: nextSectionIdx,
                          lessonHistoryStack: [],
                          lessonHistoryRedoStack: [],
                      }
                    : {}),
            });
            ctx.scheduleDraftAutosave?.();
        }
    }

    return {
        ok: true,
        body: nextBody,
        bodyMarkdown: nextBody,
        flushIdx,
        sectionMd: proseMd,
        nextSectionIdx,
    };
}
