/**
 * Construct TOC drag helpers — pointer UX over the same primitives arrows use
 * (`reorderTocSectionRange` + `setTocSectionLevel`).
 *
 * IMPORTANT — do not reinvent or bypass path/`index:` math here.
 * Nest depth and renumbering live in the lesson `.md` via `lesson-toc-mutations.js`
 * (`index:` path segments). That number logic is correct and intentional; this
 * file only chooses an insert slot + target outline level, then calls those APIs.
 *
 * Drop model (one cue, always visible):
 *   Y → insert before / after a row
 *   X → outline level (line indents; discrete columns)
 */
import {
    buildConstructOutline,
    maxOutlineLevelInSubtree,
    OUTLINE_MAX_LEVEL,
    prepareConstructOutlineMath,
    reorderTocSectionRange,
    setTocSectionLevel,
    tocRangeOutlineLevel,
    tocSubtreeExclusiveEnd,
} from './lesson-toc-mutations.js';
import { isSyntheticIntroItem } from './lesson-syllabus.js';

/** px per nest step — must match construct row indent. */
export const TOC_INDENT_PX = 16;
/** Lateral px per ±1 level when dragging left/right. */
export const TOC_LEVEL_STEP_PX = 28;

/** Outline index of the moved root after a successful reorder. */
export function tocSelectedIndexAfterReorder(fromIdx, subEnd, insertIndex) {
    const from = Math.floor(Number(fromIdx));
    const end = Math.floor(Number(subEnd));
    const ins = Math.floor(Number(insertIndex));
    const len = end - from;
    if (len < 1) return from;
    if (ins <= from) return ins;
    if (ins >= end) return ins - len;
    return from;
}

/**
 * Move one outline row (with subtree) to an insert slot, optionally changing nest level.
 * Delegates to reorder + setTocSectionLevel — does not invent path/`index:` rules.
 *
 * @returns {{ ok: boolean, body: string, selectedIndex: number }}
 */
export function applyTocSectionDrag(body, fromIdx, insertIndex, targetLevel) {
    const { body: text, ranges } = buildConstructOutline(body);
    const from = Math.floor(Number(fromIdx));
    let ins = Math.floor(Number(insertIndex));
    const stay = (i) => ({
        ok: false,
        body: text,
        selectedIndex: Number.isInteger(i) && i >= 0 ? i : 0,
    });
    if (!Number.isInteger(from) || from < 0 || from >= ranges.length) return stay(from);
    const fromR = ranges[from];
    if (!fromR || isSyntheticIntroItem(fromR)) return stay(from);
    const curL = tocRangeOutlineLevel(fromR);
    if (curL == null || curL < 2) return stay(from);

    const subEnd = tocSubtreeExclusiveEnd(ranges, from);
    ins = Math.max(0, Math.min(Number.isInteger(ins) ? ins : from, ranges.length));
    if (ins > from && ins < subEnd) return stay(from);

    const wantL = Math.max(
        2,
        Math.min(OUTLINE_MAX_LEVEL, Number.isFinite(targetLevel) ? Math.floor(targetLevel) : curL)
    );
    const delta = wantL - curL;
    if (delta > 0 && maxOutlineLevelInSubtree(ranges, from) + delta > OUTLINE_MAX_LEVEL) {
        return stay(from);
    }

    const reorderNoop = ins === from || ins === subEnd;
    const levelNoop = wantL === curL;
    if (reorderNoop && levelNoop) {
        return { ok: true, body: text, selectedIndex: from };
    }

    let next = text;
    let selectedIndex = from;
    if (!reorderNoop) {
        next = prepareConstructOutlineMath(reorderTocSectionRange(text, from, ins));
        selectedIndex = tocSelectedIndexAfterReorder(from, subEnd, ins);
    }
    if (!levelNoop) {
        next = setTocSectionLevel(next, selectedIndex, wantL);
        /* setTocSectionLevel keeps the root index stable (depth-only shift). */
    }
    return { ok: true, body: next, selectedIndex };
}

/** Previous outline index before `ins` that is outside the dragged subtree. */
function prevIndexOutsideDrag(ranges, from, subEnd, ins) {
    let i = Math.min(ins, ranges.length) - 1;
    while (i >= 0) {
        if (i < from || i >= subEnd) return i;
        i -= 1;
    }
    return -1;
}

/** Previous sibling at the same outline level, or -1. */
function previousSiblingAtLevel(ranges, tocIdx, L) {
    let prev = tocIdx - 1;
    while (prev >= 0) {
        const Lp = tocRangeOutlineLevel(ranges[prev]);
        if (Lp == null || Lp < L) return -1;
        if (Lp === L) return prev;
        prev -= 1;
    }
    return -1;
}

/**
 * Legal level window at an insert slot (UX clamp only).
 *
 * Do not change how `index:` paths are rewritten — mutations own that.
 * Here we only expose levels the drop cue may offer:
 * - Floor ## (min 2): slide left through every shallower level.
 * - Ceiling = the row you are aiming at + 1 (nest-under / indent), never the
 *   deepest cousin in that row’s subtree (that wrongly offered L4 under an L2).
 * - Insert-before: also capped by the following row’s level.
 *
 * @returns {{ minLevel: number, maxLevel: number, baseLevel: number }}
 */
export function tocDropLevelWindow(ranges, fromIdx, insertIndex, _baseLevelHint, opts = {}) {
    const from = Math.floor(Number(fromIdx));
    const fromL = tocRangeOutlineLevel(ranges[from]);
    if (fromL == null || fromL < 2) {
        return { minLevel: 2, maxLevel: 2, baseLevel: 2 };
    }
    const subEnd = tocSubtreeExclusiveEnd(ranges, from);
    const ins = Math.max(0, Math.min(Math.floor(Number(insertIndex)), ranges.length));
    const maxInSub = maxOutlineLevelInSubtree(ranges, from);
    const subtreeHeadroom = OUTLINE_MAX_LEVEL - maxInSub;
    const nestUnderIdx = Number.isInteger(opts.nestUnderIdx) ? opts.nestUnderIdx : -1;
    const beforeIdx = Number.isInteger(opts.beforeIdx) ? opts.beforeIdx : -1;
    const nestUnderOther =
        nestUnderIdx >= 0 &&
        nestUnderIdx !== from &&
        !(nestUnderIdx > from && nestUnderIdx < subEnd);

    let minLevel = 2;
    let maxLevel = fromL;

    if (nestUnderOther) {
        /*
         * Drop under the pointed row only: max = that row’s level + 1.
         * Ignore deeper descendants under it — aiming at an L2 must not offer L4
         * just because L2 already has nested kids (point at those kids instead).
         */
        const nestL = tocRangeOutlineLevel(ranges[nestUnderIdx]);
        maxLevel = 2;
        if (nestL != null && nestL >= 2) {
            maxLevel = Math.min(OUTLINE_MAX_LEVEL, nestL + 1);
        }
        maxLevel = Math.min(maxLevel, fromL + Math.max(0, subtreeHeadroom));
        maxLevel = Math.max(2, maxLevel);
        minLevel = 2;
    } else if (ins === from || ins === subEnd) {
        /* In place: same as ←→ — outdent to ##, indent at most +1 when a prev sibling exists. */
        minLevel = 2;
        maxLevel = fromL;
        if (previousSiblingAtLevel(ranges, from, fromL) >= 0 && subtreeHeadroom > 0) {
            maxLevel = Math.min(OUTLINE_MAX_LEVEL, fromL + 1);
        }
    } else {
        /*
         * Insert before `ins` (drag upward). Cap with following row so we never
         * nest deeper than the item we place above.
         */
        const prev = prevIndexOutsideDrag(ranges, from, subEnd, ins);
        const prevL = prev >= 0 ? tocRangeOutlineLevel(ranges[prev]) : null;
        const nextL = ins < ranges.length ? tocRangeOutlineLevel(ranges[ins]) : null;
        maxLevel = 2;
        if (prevL != null && prevL >= 2) {
            maxLevel = Math.min(OUTLINE_MAX_LEVEL, prevL + 1);
        }
        if (nextL != null && nextL >= 2) {
            maxLevel = Math.min(maxLevel, nextL);
        }
        maxLevel = Math.min(maxLevel, fromL + Math.max(0, subtreeHeadroom));
        maxLevel = Math.max(2, maxLevel);
    }

    /*
     * Top half of a later row (insert-before), including adjacent no-op reorder:
     * still cannot nest deeper than that following row.
     */
    if (
        beforeIdx >= 0 &&
        beforeIdx !== from &&
        !(beforeIdx > from && beforeIdx < subEnd) &&
        beforeIdx < ranges.length
    ) {
        const beforeL = tocRangeOutlineLevel(ranges[beforeIdx]);
        if (beforeL != null && beforeL >= 2) {
            maxLevel = Math.min(maxLevel, beforeL);
        }
    }

    /* Lateral slide starts at current depth when still inside the window. */
    const baseLevel = Math.max(minLevel, Math.min(maxLevel, fromL));
    return { minLevel, maxLevel, baseLevel };
}

function clampLevel(n, minLevel, maxLevel) {
    return Math.max(minLevel, Math.min(maxLevel, Math.floor(n)));
}

/**
 * Resolve pointer → insert slot + nest level.
 * One mode only (`place`): blue/purple/amber drop line at the target indent.
 *
 * @returns {{
 *   mode: 'place',
 *   insertIndex: number,
 *   targetLevel: number,
 *   baseLevel: number,
 *   minLevel: number,
 *   maxLevel: number,
 *   anchorIdx: number,
 *   insertBefore: boolean,
 * }|null}
 */
export function resolveTocDropTarget({
    ranges,
    fromIdx,
    clientY,
    clientX,
    startClientX,
    rowRects,
}) {
    if (!ranges?.length || !rowRects?.length) return null;
    const from = Math.floor(Number(fromIdx));
    if (!Number.isInteger(from) || from < 0 || from >= ranges.length) return null;
    const fromR = ranges[from];
    if (!fromR || isSyntheticIntroItem(fromR)) return null;
    const fromL = tocRangeOutlineLevel(fromR);
    if (fromL == null) return null;
    const subEnd = tocSubtreeExclusiveEnd(ranges, from);

    const sorted = [...rowRects].sort((a, b) => a.top - b.top);
    let hit = null;
    for (const row of sorted) {
        if (clientY >= row.top && clientY < row.bottom) {
            hit = row;
            break;
        }
    }
    if (!hit) {
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        if (clientY < first.top) hit = first;
        else if (clientY >= last.bottom) hit = last;
        else {
            let best = sorted[0];
            let bestDist = Infinity;
            for (const row of sorted) {
                const mid = (row.top + row.bottom) / 2;
                const d = Math.abs(clientY - mid);
                if (d < bestDist) {
                    bestDist = d;
                    best = row;
                }
            }
            hit = best;
        }
    }

    const anchor = Math.floor(Number(hit.idx));
    if (!Number.isInteger(anchor) || anchor < 0 || anchor >= ranges.length) return null;
    if (anchor > from && anchor < subEnd) return null;

    const h = Math.max(1, hit.bottom - hit.top);
    const relY = (clientY - hit.top) / h;
    const anchorL = tocRangeOutlineLevel(ranges[anchor]);
    if (anchorL == null || anchorL < 2) return null;

    /*
     * Same row as the dragged root: keep insert slot on itself so lateral X
     * can still indent/outdent in place (arrow ←→ equivalent).
     * Dropping on the bottom half of another row nests under that row — even
     * when insertIndex lands on `from` (we are simply the next item).
     */
    const insertBefore = relY < 0.5;
    let insertIndex;
    let baseHint;
    let nestUnderIdx = -1;
    if (anchor === from) {
        insertIndex = from;
        baseHint = fromL;
    } else if (insertBefore) {
        insertIndex = anchor;
        baseHint = anchorL;
    } else {
        insertIndex = tocSubtreeExclusiveEnd(ranges, anchor);
        baseHint = anchorL;
        nestUnderIdx = anchor;
    }
    if (insertIndex > from && insertIndex < subEnd) return null;

    const { minLevel, maxLevel, baseLevel } = tocDropLevelWindow(
        ranges,
        from,
        insertIndex,
        baseHint,
        {
            nestUnderIdx,
            beforeIdx: insertBefore ? anchor : -1,
        }
    );

    /*
     * Level from lateral delta only (grip starts on the left — absolute X
     * would false-trigger nest). Each full step of travel = ±1 level so the
     * user can slide through nest options in one gesture (no early bias).
     */
    let targetLevel = baseLevel;
    if (Number.isFinite(clientX) && Number.isFinite(startClientX)) {
        const dx = clientX - startClientX;
        const steps = Math.trunc(dx / TOC_LEVEL_STEP_PX);
        targetLevel = clampLevel(baseLevel + steps, minLevel, maxLevel);
    }
    targetLevel = clampLevel(targetLevel, minLevel, maxLevel);

    return {
        mode: 'place',
        insertIndex,
        targetLevel,
        baseLevel,
        minLevel,
        maxLevel,
        anchorIdx: anchor,
        insertBefore: insertIndex === anchor,
    };
}

/** Indices hidden because an ancestor path id is collapsed (UI-only). */
export function tocIndicesHiddenByCollapse(ranges, toc, collapsedIds) {
    const hidden = new Set();
    if (!ranges?.length || !collapsedIds?.size) return hidden;
    for (let i = 0; i < ranges.length; i++) {
        const id = toc?.[i]?.id != null ? String(toc[i].id) : '';
        if (!id || !collapsedIds.has(id)) continue;
        const end = tocSubtreeExclusiveEnd(ranges, i);
        for (let k = i + 1; k < end; k++) hidden.add(k);
    }
    return hidden;
}

export function tocRowHasChildren(ranges, idx) {
    if (!ranges?.length || idx < 0 || idx >= ranges.length) return false;
    return tocSubtreeExclusiveEnd(ranges, idx) > idx + 1;
}

export function tocSubtreeChildCount(ranges, idx) {
    if (!ranges?.length || idx < 0 || idx >= ranges.length) return 0;
    return Math.max(0, tocSubtreeExclusiveEnd(ranges, idx) - idx - 1);
}
