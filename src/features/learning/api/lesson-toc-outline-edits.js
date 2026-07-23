/**
 * Construct-mode TOC outline edits (move, rename, add, remove, nest repair).
 *
 * Depends on path/range/prepare helpers in `lesson-toc-outline-core.js`.
 */
import {
    isSectionFenceLine,
    isSubsectionFenceLine,
    replaceFencedBlockAt,
} from './lesson-fenced-blocks.js';
import { stripOutlineHeadingsFromProse } from './lesson-section-slices.js';
import {
    isSyntheticIntroItem,
    formatSyllabusPathLine,
} from './lesson-syllabus.js';
import {
    OUTLINE_MAX_LEVEL,
    buildConstructOutline,
    clampPathDepth,
    getTocLineRanges,
    headingPrefixFromLine,
    isOutlinePathId,
    maxOutlineLevelInSubtree,
    outlinePathIdFromText,
    pathDepthFromOutlineLevel,
    prepareConstructOutlineMath,
    replaceOutlineRowWithFence,
    reorderTocSectionRange,
    resolveTocRangeIndex,
    syllabusFenceLines,
    tocHeadingEmojiPrefix,
    tocHeadingTitleForEdit,
    tocRangeOutlineLevel,
    tocSubtreeExclusiveEnd,
} from './lesson-toc-outline-core.js';

function outlineDepthsForRanges(ranges) {
    return ranges.map((r) => {
        if (!r || isSyntheticIntroItem(r)) return 1;
        const path =
            outlinePathIdFromText(r.headingRaw) || (isOutlinePathId(r.id) ? String(r.id) : null);
        if (path) return clampPathDepth(String(path).split('.').length);
        const L = tocRangeOutlineLevel(r);
        if (L == null || L < 2) return 1;
        return clampPathDepth(L - 1);
    });
}

/**
 * Rewrite syllabus rows to `@section` + `index` + `title` using nest depths (1 = root).
 */
function rewriteOutlineByDepths(body, depths) {
    const text = body != null ? String(body) : '';
    const ranges = getTocLineRanges(text);
    const lines = text.split('\n');
    let rootCount = 0;
    const stack = [];
    const assignments = [];
    for (let i = 0; i < ranges.length; i++) {
        const r = ranges[i];
        if (!r || isSyntheticIntroItem(r) || r.headingLine == null) continue;
        const depth = clampPathDepth(depths[i]);
        const L = depth + 1;
        while (stack.length && stack[stack.length - 1].level >= L) stack.pop();
        let path;
        if (!stack.length) {
            rootCount += 1;
            path = String(rootCount);
        } else {
            const parent = stack[stack.length - 1];
            parent.childCount += 1;
            path = `${parent.path}.${parent.childCount}`;
        }
        stack.push({ level: L, path, childCount: 0 });
        const em = tocHeadingEmojiPrefix(r.headingRaw);
        const title = tocHeadingTitleForEdit(r.headingRaw);
        const combined = em ? `${em} ${title}` : title;
        assignments.push({ hi: r.headingLine, path, title: combined });
    }
    let changed = false;
    for (let a = assignments.length - 1; a >= 0; a--) {
        const { hi, path, title } = assignments[a];
        if (hi < 0 || hi >= lines.length) continue;
        replaceOutlineRowWithFence(lines, hi, path, title);
        changed = true;
    }
    return changed ? lines.join('\n') : text;
}
/** Apply nest-depth delta to a syllabus subtree, then rewrite `index:` fences. */
function shiftSubtreeOutlineDepths(body, fromIdx, subEnd, delta) {
    if (!delta) return body;
    const text = body != null ? String(body) : '';
    const ranges = getTocLineRanges(text);
    const depths = outlineDepthsForRanges(ranges);
    for (let i = fromIdx; i < subEnd; i++) {
        depths[i] = clampPathDepth((depths[i] || 1) + delta);
    }
    return rewriteOutlineByDepths(text, depths);
}

function previousSiblingAtLevel(ranges, tocIdx, L) {
    let prev = tocIdx - 1;
    while (prev >= 0) {
        const Lp = tocRangeOutlineLevel(ranges[prev]);
        if (Lp == null || Lp < L) return -1;
        if (Lp === L) return prev;
        prev--;
    }
    return -1;
}
export function tocSelectedIndexAfterMove(body, tocIdx, action) {
    const { ranges } = buildConstructOutline(body);
    const idx = Math.floor(Number(tocIdx));
    if (!Number.isInteger(idx) || idx < 0 || idx >= ranges.length) return -1;
    const r = ranges[idx];
    if (!r || isSyntheticIntroItem(r)) return -1;
    const L = tocRangeOutlineLevel(r);
    if (L == null) return -1;
    if (action === 'up') {
        const prev = previousSiblingAtLevel(ranges, idx, L);
        return prev >= 0 ? prev : idx;
    }
    if (action === 'down') {
        const subEnd = tocSubtreeExclusiveEnd(ranges, idx);
        if (subEnd >= ranges.length || tocRangeOutlineLevel(ranges[subEnd]) !== L) return idx;
        const nextEnd = tocSubtreeExclusiveEnd(ranges, subEnd);
        return idx + (nextEnd - subEnd);
    }
    return idx;
}

function moveActionAllowed(avail, action) {
    if (action === 'up') return !!avail.canUp;
    if (action === 'down') return !!avail.canDown;
    if (action === 'indent') return !!avail.canIndent;
    if (action === 'outdent') return !!avail.canOutdent;
    return false;
}

/**
 * Cave-man outline move — pure path math.
 *
 * `ok` is true iff availability allows the action. It never depends on whether
 * the markdown bytes change (identical sibling blobs still yield ok:true).
 * `selectedIndex` is the slot the moved row occupies after the permutation.
 *
 * @returns {{ ok: boolean, body: string, selectedIndex: number }}
 */
export function applyTocSectionMove(body, tocIdx, action) {
    const { body: text, ranges } = buildConstructOutline(body);
    const idx = Math.floor(Number(tocIdx));
    const stay = (i) => ({ ok: false, body: text, selectedIndex: Number.isInteger(i) && i >= 0 ? i : 0 });
    if (!Number.isInteger(idx) || idx < 0 || idx >= ranges.length) return stay(idx);
    const r = ranges[idx];
    if (!r || isSyntheticIntroItem(r)) return stay(idx);
    const L = tocRangeOutlineLevel(r);
    if (L == null) return stay(idx);

    const avail = tocSectionMoveAvailabilityFromRanges(ranges, idx);
    if (!moveActionAllowed(avail, action)) {
        return { ok: false, body: text, selectedIndex: idx };
    }

    const selectedIndex = tocSelectedIndexAfterMove(text, idx, action);
    let next = text;
    if (action === 'up') {
        const prev = previousSiblingAtLevel(ranges, idx, L);
        next = prepareConstructOutlineMath(reorderTocSectionRange(text, idx, prev));
    } else if (action === 'down') {
        const subEnd = tocSubtreeExclusiveEnd(ranges, idx);
        const nextEnd = tocSubtreeExclusiveEnd(ranges, subEnd);
        next = prepareConstructOutlineMath(reorderTocSectionRange(text, idx, nextEnd));
    } else if (action === 'outdent') {
        next = setTocSectionLevel(text, idx, L - 1);
    } else if (action === 'indent') {
        next = setTocSectionLevel(text, idx, L + 1);
    }
    return { ok: true, body: next, selectedIndex };
}

/**
 * Cave-man invariants after prepare. Used by tests (and safe to call in debug).
 * Move success is geometry (`applyTocSectionMove.ok`), never body-byte equality.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function constructOutlineInvariants(body) {
    const errors = [];
    const text = prepareConstructOutlineMath(body);
    const ranges = getTocLineRanges(text);
    for (let i = 0; i < ranges.length; i++) {
        const r = ranges[i];
        if (!r || isSyntheticIntroItem(r)) continue;
        const L = tocRangeOutlineLevel(r);
        if (L == null) {
            errors.push(`idx ${i}: null outline level`);
            continue;
        }
        if (L < 2) errors.push(`idx ${i}: level ${L} below construct floor ##`);
        if (L > OUTLINE_MAX_LEVEL) errors.push(`idx ${i}: level ${L} above max path depth`);
        const title = tocHeadingTitleForEdit(r.headingRaw || '').trim();
        if (!title) errors.push(`idx ${i}: empty title`);
        if (L > 2) {
            /* Nested rows must always be able to walk left toward ##. */
            const avail = tocSectionMoveAvailability(text, i);
            if (!avail.canOutdent) errors.push(`idx ${i}: L=${L} but canOutdent false`);
        }
        /* Availability ↔ apply.ok (path math). Body bytes are irrelevant for up/down. */
        const actions = [
            ['up', 'canUp'],
            ['down', 'canDown'],
            ['indent', 'canIndent'],
            ['outdent', 'canOutdent'],
        ];
        const avail = tocSectionMoveAvailability(text, i);
        for (const [action, flag] of actions) {
            const result = applyTocSectionMove(text, i, action);
            if (avail[flag] !== result.ok) {
                errors.push(
                    `idx ${i}: ${flag}=${avail[flag]} but apply.${action}.ok=${result.ok}`
                );
            }
            if (!result.ok) continue;
            if (action === 'up' && result.selectedIndex >= i) {
                errors.push(`idx ${i}: up ok but selectedIndex ${result.selectedIndex} not before`);
            }
            if (action === 'down' && result.selectedIndex <= i) {
                errors.push(`idx ${i}: down ok but selectedIndex ${result.selectedIndex} not after`);
            }
            if ((action === 'indent' || action === 'outdent') && result.body === text) {
                errors.push(`idx ${i}: ${action} ok but body unchanged`);
            }
        }
    }
    return { ok: errors.length === 0, errors };
}


/**
 * Move arrows from already-parsed ranges (no prepare — safe to call per row).
 * @param {ReturnType<typeof getTocLineRanges>} ranges
 */
export function tocSectionMoveAvailabilityFromRanges(ranges, tocIdx) {
    const none = { canUp: false, canDown: false, canOutdent: false, canIndent: false };
    const idx = Math.floor(Number(tocIdx));
    if (!Number.isInteger(idx) || idx < 0 || idx >= ranges.length) return none;
    const r = ranges[idx];
    if (!r || isSyntheticIntroItem(r)) return none;
    const L = tocRangeOutlineLevel(r);
    if (L == null || L < 2) return none;

    const prevSibling = previousSiblingAtLevel(ranges, idx, L);
    const canUp = prevSibling >= 0;

    const subEnd = tocSubtreeExclusiveEnd(ranges, idx);
    const canDown = subEnd < ranges.length && tocRangeOutlineLevel(ranges[subEnd]) === L;

    const canOutdent = L > 2;
    const canIndent =
        prevSibling >= 0 && maxOutlineLevelInSubtree(ranges, idx) < OUTLINE_MAX_LEVEL;

    return { canUp, canDown, canOutdent, canIndent };
}

/** Move availability for outline index (bare index into prepared ranges). */
export function tocSectionMoveAvailability(body, tocIdx, _tocUnused) {
    /* Display/UI path: trust current body bytes — do not re-prepare (O(n) cost × rows). */
    return tocSectionMoveAvailabilityFromRanges(getTocLineRanges(body), tocIdx);
}

/**
 * Move one TOC section up, down, indent, or outdent one level.
 * Thin wrapper over {@link applyTocSectionMove} (returns body only).
 * Prefer `applyTocSectionMove` when you need ok / selectedIndex — success is
 * path math, not body-byte equality.
 */
export function moveTocSectionByAction(body, tocIdx, action, _tocUnused) {
    return applyTocSectionMove(body, tocIdx, action).body;
}

/**
 * Adjusts heading level (##/###/####…) for one section and its whole subtree (subheadings)
 * without reordering. Useful to “unnest” (drag left).
 * @param {string} body
 * @param {number} tocIndex
 * @param {number} targetLevel 1…6
 * @param {{ level?: number, id?: string }[] | null | undefined} [toc]
 */
export function setTocSectionLevel(body, tocIndex, targetLevel, _tocUnused) {
    const text = prepareConstructOutlineMath(body);
    const ranges = getTocLineRanges(text);
    const idx = Math.floor(Number(tocIndex));
    if (!Number.isInteger(idx) || idx < 0 || idx >= ranges.length) return text;
    const r = ranges[idx];
    if (!r || isSyntheticIntroItem(r)) return text;

    const nextLevel = Math.max(
        2,
        Math.min(OUTLINE_MAX_LEVEL, Number.isFinite(targetLevel) ? Math.floor(targetLevel) : 2)
    );
    const curLevel = tocRangeOutlineLevel(r);
    if (curLevel == null || curLevel < 2) return text;
    if (curLevel === nextLevel) return text;

    const delta = pathDepthFromOutlineLevel(nextLevel) - pathDepthFromOutlineLevel(curLevel);
    if (
        delta > 0 &&
        maxOutlineLevelInSubtree(ranges, idx) + (nextLevel - curLevel) > OUTLINE_MAX_LEVEL
    ) {
        return text;
    }

    const subEnd = tocSubtreeExclusiveEnd(ranges, idx);
    return prepareConstructOutlineMath(shiftSubtreeOutlineDepths(text, idx, subEnd, delta));
}

export function renameTocSection(body, tocIndex, newTitle, emojiPrefix, toc) {
    const text = prepareConstructOutlineMath(body);
    const ranges = getTocLineRanges(text);
    const idx = resolveTocRangeIndex(ranges, tocIndex, toc);
    const r = ranges[idx];
    /* Rename the outline heading even when the section contains a quiz. */
    if (!r || r.headingLine == null) return text;

    const title = String(newTitle != null ? newTitle : '').trim();
    if (!title) return text;

    const lines = text.split('\n');
    const raw = lines[r.headingLine];
    let { kind, prefix } = headingPrefixFromLine(r.headingRaw || '');
    if (kind === 'unknown') {
        const t = String(raw || '').trim();
        if (isSectionFenceLine(t)) kind = 'section';
        else if (isSubsectionFenceLine(t)) kind = 'subsection';
        else ({ kind, prefix } = headingPrefixFromLine(raw));
    }
    if (kind === 'unknown') return text;

    const em = String(emojiPrefix != null ? emojiPrefix : '').trim();
    const combined = em ? `${em} ${title}` : title;

    if (kind === 'section' || kind === 'subsection') {
        const index =
            (isOutlinePathId(r.id) && String(r.id)) ||
            outlinePathIdFromText(raw) ||
            '';
        replaceFencedBlockAt(lines, r.headingLine, 'section', {
            ...(index ? { index } : {}),
            title: combined,
        });
    } else {
        const path = outlinePathIdFromText(raw) || outlinePathIdFromText(r.headingRaw);
        lines[r.headingLine] = path ? formatSyllabusPathLine(path, combined) : `## ${combined}`;
    }

    return prepareConstructOutlineMath(lines.join('\n'));
}

export function removeTocSection(body, tocIndex, toc) {
    const text = prepareConstructOutlineMath(body);
    const ranges = getTocLineRanges(text);
    const idx = resolveTocRangeIndex(ranges, tocIndex, toc);
    const r = ranges[idx];
    if (!r || isSyntheticIntroItem(r)) return text;
    const lines = text.split('\n');
    const subEnd = tocSubtreeExclusiveEnd(ranges, idx);
    const endLine = subEnd < ranges.length ? ranges[subEnd].startLine : lines.length;
    const next = [...lines.slice(0, r.startLine), ...lines.slice(endLine)];
    return next.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

/**
 * WYSIWYG starter under a new TOC heading. No `#` lines (those invent outline rows).
 * `{{lg}}` renders as large title text in the construct editor.
 */
export function buildConstructStarterProse(title, bodyHint) {
    const t = String(title || '').trim() || 'Title';
    const body = String(bodyHint || '').trim();
    const head = `{{lg}}${t}{{/lg}}`;
    const raw = body ? `${head}\n\n${body}` : head;
    return stripOutlineHeadingsFromProse(raw);
}

function sanitizeInsertedProse(prose) {
    return stripOutlineHeadingsFromProse(String(prose || '').trim());
}

function spliceHeadingWithProse(lines, insertAt, heading, prose) {
    const p = sanitizeInsertedProse(prose);
    const headLines = Array.isArray(heading) ? heading : String(heading).split('\n');
    const chunk = p ? ['', ...headLines, ...p.split('\n'), ''] : ['', ...headLines, '', ''];
    lines.splice(insertAt, 0, ...chunk);
}

/** Turn a prose-only body into a real ## root so nest math never uses level 0. */
function materializeSyntheticRoot(body, rootTitle = 'Introduction') {
    const text = body != null ? String(body) : '';
    const ranges = getTocLineRanges(text);
    if (!(ranges.length === 1 && isSyntheticIntroItem(ranges[0]))) return text;
    const base = text.trimEnd();
    const title = String(rootTitle || 'Introduction').trim() || 'Introduction';
    if (!base) return `## ${title}\n`;
    return `## ${title}\n${base}\n`;
}

export function addTocSectionAfter(body, afterTocIndex, title = 'New section', starterProse = '') {
    const safeTitle = String(title || '').trim() || 'New section';
    let text = prepareConstructOutlineMath(body, safeTitle);
    let ranges = getTocLineRanges(text);
    const heading = syllabusFenceLines('999', safeTitle).join('\n');
    const prose = sanitizeInsertedProse(starterProse);

    if (ranges.length === 1 && isSyntheticIntroItem(ranges[0])) {
        const base = text.trimEnd();
        if (!base) {
            return prepareConstructOutlineMath(
                prose ? `${heading}\n${prose}\n` : `${heading}\n`,
                safeTitle
            );
        }
        const combined = [base, prose].filter(Boolean).join('\n\n');
        return prepareConstructOutlineMath(`${heading}\n${combined}\n`, safeTitle);
    }

    const safeIdx = Math.max(0, Math.min(afterTocIndex, ranges.length - 1));
    /* After the whole subtree so a new root is not injected between a parent and its children. */
    const insertAt = insertLineAfterTocSubtree(ranges, safeIdx, text.split('\n').length);
    const lines = text.split('\n');
    spliceHeadingWithProse(lines, insertAt, heading, prose);
    let next = lines.join('\n');
    const rangesAfter = getTocLineRanges(next);
    const depths = outlineDepthsForRanges(rangesAfter);
    /* New root section: depth 1 (path will be next sibling root after renumber). */
    let newIdx = rangesAfter.findIndex((r, i) => i > safeIdx && String(r.id) === '999');
    if (newIdx < 0) {
        newIdx = rangesAfter.findIndex((r) => tocHeadingTitleForEdit(r.headingRaw) === safeTitle && String(r.id) === '999');
    }
    if (newIdx < 0) newIdx = rangesAfter.length - 1;
    if (newIdx >= 0) depths[newIdx] = 1;
    next = rewriteOutlineByDepths(next, depths);
    return prepareConstructOutlineMath(next, safeTitle);
}

/**
 * Outline level for a TOC "+" under `parentLevel`.
 * Always one step deeper (child). At max path depth, stay sibling.
 * Stay selected on the clicked row so repeated "+" adds more children under it.
 */
export function childOutlineLevelForParent(parentLevel) {
    const p = Math.floor(Number(parentLevel));
    if (!Number.isFinite(p) || p < 1) return 3;
    if (p >= OUTLINE_MAX_LEVEL) return OUTLINE_MAX_LEVEL;
    return Math.min(OUTLINE_MAX_LEVEL, p + 1);
}

/**
 * Line index to splice a new child: always after the parent's current subtree
 * (never before existing children).
 */
export function insertLineAfterTocSubtree(ranges, parentIdx, lineCount) {
    if (!ranges?.length || parentIdx < 0 || parentIdx >= ranges.length) {
        return Math.max(0, Number(lineCount) || 0);
    }
    const subEnd = tocSubtreeExclusiveEnd(ranges, parentIdx);
    if (subEnd > parentIdx + 1) {
        return ranges[subEnd - 1].endLine;
    }
    return ranges[parentIdx].endLine;
}

/**
 * If a heading with `title` landed at the wrong depth under `parentIdx`, rewrite it.
 */
export function repairSubsectionNesting(body, parentIdx, title, expectedLevel) {
    const text = body != null ? String(body) : '';
    const ranges = getTocLineRanges(text);
    if (!ranges.length || parentIdx < 0 || parentIdx >= ranges.length) return text;
    const want = String(title || '').trim();
    if (!want) return text;
    const wantDepth = pathDepthFromOutlineLevel(expectedLevel);

    const depths = outlineDepthsForRanges(ranges);
    for (let i = ranges.length - 1; i > parentIdx; i--) {
        const r = ranges[i];
        if (!r || r.headingLine == null) continue;
        const raw = String(r.headingRaw || '');
        if (tocHeadingTitleForEdit(raw) !== want) continue;
        if (depths[i] === wantDepth) return text;
        depths[i] = wantDepth;
        return rewriteOutlineByDepths(text, depths);
    }
    return text;
}

/** Fill blank outline titles so TOC rows never render empty. */
export function addTocSubsectionAfter(body, afterTocIndex, title = 'New subsection', starterProse = '') {
    const safeTitle = String(title || '').trim() || 'New subsection';
    let text = prepareConstructOutlineMath(body, safeTitle);
    let ranges = getTocLineRanges(text);
    const prose = sanitizeInsertedProse(starterProse);

    if (ranges.length === 1 && isSyntheticIntroItem(ranges[0])) {
        text = materializeSyntheticRoot(text, 'New section');
        text = prepareConstructOutlineMath(text, 'New section');
        ranges = getTocLineRanges(text);
    }

    if (!ranges.length || (ranges.length === 1 && isSyntheticIntroItem(ranges[0]))) {
        const heading = syllabusFenceLines('1', safeTitle).join('\n');
        return prepareConstructOutlineMath(
            prose ? `${heading}\n${prose}\n` : `${heading}\n`,
            safeTitle
        );
    }

    const safeIdx = Math.max(0, Math.min(afterTocIndex, Math.max(0, ranges.length - 1)));
    const clicked = ranges[safeIdx];
    if (!clicked || isSyntheticIntroItem(clicked)) return text;

    const clickedLevel = tocRangeOutlineLevel(clicked);
    if (clickedLevel == null || clickedLevel < 1) return text;

    const lines = text.split('\n');
    const insertAt = insertLineAfterTocSubtree(ranges, safeIdx, lines.length);
    const parentDepth = outlineDepthsForRanges(ranges)[safeIdx] || 1;
    const wantDepth =
        clickedLevel >= OUTLINE_MAX_LEVEL ? parentDepth : clampPathDepth(parentDepth + 1);
    /* Valid temp path so the new row is a syllabus heading before renumber. */
    const heading = syllabusFenceLines('999', safeTitle);
    spliceHeadingWithProse(lines, insertAt, heading, prose);
    let next = lines.join('\n');
    const rangesAfter = getTocLineRanges(next);
    const depths = outlineDepthsForRanges(rangesAfter);
    /* Prefer temp path 999 — default titles collide across the TOC. */
    let newIdx = rangesAfter.findIndex(
        (r, i) => i > safeIdx && String(r.id) === '999'
    );
    if (newIdx < 0) {
        newIdx = rangesAfter.findIndex(
            (r) =>
                tocHeadingTitleForEdit(r.headingRaw) === safeTitle &&
                String(r.id) === '999'
        );
    }
    if (newIdx < 0) newIdx = Math.min(rangesAfter.length - 1, safeIdx + 1);
    if (newIdx >= 0 && newIdx < depths.length) depths[newIdx] = wantDepth;
    next = rewriteOutlineByDepths(next, depths);
    return prepareConstructOutlineMath(next, safeTitle);
}

