import {
    tocPlainLineForList,
    tocLabelForDisplay,
} from '../api/content-toc.js';
import { isOutlinePathId } from '../api/lesson-toc-mutations.js';

/** Nest steps under construct floor from the visible path id (`1`→0, `1.1`→1). */
export function nestDepthFromPathOrLevel(item, outlineLevel = null) {
    if (isOutlinePathId(item?.id)) {
        return Math.min(5, Math.max(0, String(item.id).split('.').length - 1));
    }
    const lv = Number.isFinite(outlineLevel)
        ? outlineLevel
        : Number.isFinite(item?.level)
          ? item.level
          : 2;
    return Math.max(0, Math.min(5, lv - 2));
}

export function getTocRowStyle(item, construct, outlineLevel = null) {
    const nestDepth = construct
        ? nestDepthFromPathOrLevel(item, outlineLevel)
        : Math.max(
              0,
              Math.min(
                  5,
                  (Number.isFinite(outlineLevel)
                      ? outlineLevel
                      : Number.isFinite(item?.level)
                        ? item.level
                        : 1) - 1
              )
          );
    const lv = construct
        ? nestDepth + 2
        : Math.min(
              8,
              Math.max(1, Number.isFinite(outlineLevel) ? outlineLevel : item.level || 1)
          );
    const depthIndent = construct ? Math.min(80, nestDepth * 16) : 0;
    const paddingLeft = construct ? 0 : 6 + Math.max(0, lv - 1) * 18;
    const fontSize =
        lv >= 6
            ? 'text-[10px] font-bold'
            : lv >= 5
              ? 'text-[11px] font-bold'
              : lv === 4
                ? 'text-xs font-bold'
                : lv === 3
                  ? 'text-xs font-medium'
                  : 'text-sm font-bold';
    const iconSize = lv >= 4 ? 'w-5 h-5' : 'w-6 h-6';
    const depthTag = Math.min(6, nestDepth + 1);
    const depthCls = construct ? '' : `arborito-lesson-toc-depth-${depthTag}`;
    return { depthCls, depthTag, nestDepth, fontSize, iconSize, paddingLeft, depthIndent };
}

export function getTocListDisplay(item, ui, { showPath = false } = {}) {
    const listLine = tocPlainLineForList(item);
    let listDisplay = tocLabelForDisplay(listLine);
    if (item.kind === 'exam-final') {
        return ui.examFinalEvaluation || 'Final evaluation';
    }
    if (!String(listDisplay || '').trim()) {
        listDisplay = ui.lessonTocUntitledSection || 'Untitled section';
    }
    if (showPath && isOutlinePathId(item?.id)) {
        return `${item.id} ${listDisplay}`;
    }
    return listDisplay;
}

/** Quiet path chip for construct (not glued into the title). */
export function getTocPathBadge(item) {
    return isOutlinePathId(item?.id) ? String(item.id) : '';
}

export function collectVisibleRowRects(navEl) {
    if (!navEl) return [];
    const rows = navEl.querySelectorAll('.arborito-lesson-toc-row--construct[data-toc-idx]');
    const out = [];
    rows.forEach((el) => {
        const idx = Number(el.getAttribute('data-toc-idx'));
        if (!Number.isInteger(idx) || idx < 0) return;
        const r = el.getBoundingClientRect();
        out.push({
            idx,
            top: r.top,
            bottom: r.bottom,
            left: r.left,
            width: r.width,
            height: r.height,
        });
    });
    return out;
}

/**
 * Stretch each nest cable up to the previous same-or-shallower visible row
 * so siblings after deeper cousins still meet the parent spine.
 */
export function syncTocTreeStemLifts(navEl) {
    if (!navEl) return;
    const rows = [...navEl.querySelectorAll('.arborito-lesson-toc-row--construct[data-toc-idx]')];
    const byIdx = new Map();
    for (const el of rows) {
        const idx = Number(el.getAttribute('data-toc-idx'));
        if (Number.isInteger(idx) && idx >= 0) byIdx.set(idx, el);
    }
    const sortedIdx = [...byIdx.keys()].sort((a, b) => a - b);
    for (const idx of sortedIdx) {
        const el = byIdx.get(idx);
        const nest = Number(el.getAttribute('data-toc-nest'));
        if (!Number.isFinite(nest) || nest <= 0) {
            el.style.removeProperty('--toc-stem-lift');
            continue;
        }
        let attachIdx = -1;
        for (let j = sortedIdx.indexOf(idx) - 1; j >= 0; j--) {
            const prevIdx = sortedIdx[j];
            const prevNest = Number(byIdx.get(prevIdx).getAttribute('data-toc-nest'));
            if (Number.isFinite(prevNest) && prevNest <= nest) {
                attachIdx = prevIdx;
                break;
            }
        }
        const er = el.getBoundingClientRect();
        const myMid = er.top + er.height / 2;
        if (attachIdx < 0) {
            el.style.setProperty('--toc-stem-lift', `${Math.max(20, er.height / 2 + 12)}px`);
            continue;
        }
        const ar = byIdx.get(attachIdx).getBoundingClientRect();
        const attachMid = ar.top + ar.height / 2;
        const lift = Math.max(12, myMid - attachMid);
        el.style.setProperty('--toc-stem-lift', `${lift}px`);
    }
}

/** Nest hue token for drop rail (outline level 2 → nest 0). */
export function tocDropNestAccentVar(targetLevel) {
    const nest = Math.max(0, Math.min(4, Math.floor(Number(targetLevel)) - 2));
    return `var(--toc-hue-${nest}, rgb(14 165 233))`;
}
