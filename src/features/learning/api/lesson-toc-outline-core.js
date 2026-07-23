/**
 * Construct-mode TOC outline core (path math, ranges, prepare, invariants base).
 *
 * Canonical row is always an `@section` fence with `index:` + `title:`.
 * Nest depth = segments of `index`. Moves/renumber read and write that field
 * directly — `#path} Title` is only accepted on ingest (old files) and converted.
 *
 * Syllabus markers: `lesson-syllabus.js`. Prose slices: `lesson-section-slices.js`.
 * Outline edits (move/rename/add/remove): `lesson-toc-outline-edits.js`.
 */
/**
 * Construct-mode TOC outline math (temario).
 *
 * Canonical row is always an `@section` fence with `index:` + `title:`.
 * Nest depth = segments of `index`. Moves/renumber read and write that field
 * directly — `#path} Title` is only accepted on ingest (old files) and converted.
 *
 * Syllabus markers: `lesson-syllabus.js`. Prose slices: `lesson-section-slices.js`.
 */
import {
    isSectionFenceLine,
    isSubsectionFenceLine,
    replaceFencedBlockAt,
    fencedTitleAt,
    readFencedBlockAt,
    serializeSectionBlock,
    indexFromFields,
} from './lesson-fenced-blocks.js';
import { getTocSectionRanges, stripOutlineHeadingsFromProse } from './lesson-section-slices.js';
import {
    isOutlineHeadingLine,
    isSyntheticIntroItem,
    SYNTHETIC_INTRO_ID,
    isOutlinePathId as isPathIdFromSlices,
    outlinePathIdFromHeadingLine,
    formatSyllabusPathLine,
    parseSyllabusPathLine,
} from './lesson-syllabus.js';

export function stripOutlinePathId(text) {
    const syl = parseSyllabusPathLine(text);
    if (syl) return syl.title;
    return String(text != null ? text : '').replace(/^\s+|\s+$/gu, '');
}

export function outlinePathIdFromText(text) {
    return outlinePathIdFromHeadingLine(text);
}

/** True for human outline paths like `1`, `1.2`, `1.2.3`. */
export function isOutlinePathId(id) {
    return isPathIdFromSlices(id);
}

/** Canonical syllabus fence lines for path + title. */
export function syllabusFenceLines(pathId, titleText) {
    return serializeSectionBlock({
        index: String(pathId || '').trim(),
        title: String(titleText || '').trim() || 'Section',
    }).split('\n');
}

/**
 * Replace outline row at headingLine with a canonical `@section` fence.
 * Returns net line delta (fenceLength - removedSpan).
 */
export function replaceOutlineRowWithFence(lines, headingLine, pathId, titleText) {
    if (headingLine < 0 || headingLine >= lines.length) return 0;
    const fence = syllabusFenceLines(pathId, titleText);
    const raw = String(lines[headingLine] || '').trim();
    let span = 1;
    if (isSectionFenceLine(raw) || isSubsectionFenceLine(raw)) {
        const block = readFencedBlockAt(lines, headingLine);
        if (block && Number.isFinite(block.endLine)) {
            span = Math.max(1, block.endLine - headingLine + 1);
        }
    }
    lines.splice(headingLine, span, ...fence);
    return fence.length - span;
}

/**
 * Max path segments (`1.2.3…`). Nest depth lives in `index:` path segments.
 * Arrows ←→ are +1/−1 on this depth; renumber remaps the numbers.
 */
export const OUTLINE_MAX_PATH_DEPTH = 8;
/** Stack level = pathDepth + 1 (root path `1` → level 2). */
export const OUTLINE_MAX_LEVEL = OUTLINE_MAX_PATH_DEPTH + 1;

/** Path segment count → construct outline level (UI indent = level − 2). */
export function outlineLevelFromPathId(pathId) {
    if (!isOutlinePathId(pathId)) return 2;
    const depth = String(pathId).trim().split('.').length;
    return Math.min(OUTLINE_MAX_LEVEL, Math.max(2, depth + 1));
}

export function pathDepthFromOutlineLevel(level) {
    const L = Math.floor(Number(level));
    if (!Number.isFinite(L)) return 1;
    return Math.min(OUTLINE_MAX_PATH_DEPTH, Math.max(1, L - 1));
}

export function clampPathDepth(depth) {
    return Math.min(OUTLINE_MAX_PATH_DEPTH, Math.max(1, Number(depth) || 1));
}

/** Temp path whose segment count matches outline level (so renumber keeps nest depth). */
function tempPathForOutlineLevel(outlineLevel, temp) {
    const depth = clampPathDepth(pathDepthFromOutlineLevel(outlineLevel));
    const root = String(8000 + temp);
    if (depth <= 1) return root;
    return `${root}${'.1'.repeat(depth - 1)}`;
}

/**
 * Assign human `index:` values from syllabus nest depth.
 * Rewrites `@section` fences in place (and converts ingest `#path}` / ATX rows).
 */
export function renumberOutlinePaths(body) {
    const text = body != null ? String(body) : '';
    const ranges = getTocLineRanges(text);
    const lines = text.split('\n');
    const assignments = [];
    let rootCount = 0;
    const stack = [];

    for (let i = 0; i < ranges.length; i++) {
        const r = ranges[i];
        if (!r || isSyntheticIntroItem(r) || r.headingLine == null) continue;
        const L = tocRangeOutlineLevel(r);
        if (L == null || L < 2) continue;
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

/**
 * Line index for each TOC entry (same length and order as getToc({ content: body })).
 * Only operates on the lesson markdown body (the leading `@info` block is left untouched).
 */
export function getTocLineRanges(body) {
    const text = body != null ? body : '';
    const lines = text.split('\n');
    const shared = getTocSectionRanges(text);
    if (shared.length === 1 && shared[0].synthetic) {
        return [
            {
                id: SYNTHETIC_INTRO_ID,
                startLine: 0,
                endLine: lines.length,
                headingLine: null,
                headingRaw: null,
                isQuiz: false,
                synthetic: true,
            },
        ];
    }

    return shared.map((r) => {
        const start = r.startLine;
        const rawLine = start < lines.length ? lines[start] : '';
        const t = rawLine.trim();
        let headingRaw = rawLine || null;
        let headingLine = start;
        /* After preamble merge, startLine may be 0 while the heading is later. */
        if (!isOutlineHeadingLine(t, text)) {
            let hl = null;
            let inCode = false;
            let inQuiz = false;
            for (let i = start; i < r.endLine && i < lines.length; i++) {
                const lt = lines[i].trim();
                if (lt.startsWith('```')) {
                    inCode = !inCode;
                    continue;
                }
                if (inCode) continue;
                if (inQuiz) {
                    if (/^@\/quiz\b/i.test(lt)) inQuiz = false;
                    continue;
                }
                if (/^@quiz\b/i.test(lt)) {
                    inQuiz = true;
                    continue;
                }
                if (isOutlineHeadingLine(lt, text)) {
                    hl = i;
                    headingRaw = lines[i];
                    break;
                }
            }
            headingLine = hl;
            if (hl != null) {
                const ht = String(headingRaw || '').trim();
                if (isSectionFenceLine(ht)) headingRaw = `@@section@@${fencedTitleAt(lines, hl)}`;
                else if (isSubsectionFenceLine(ht)) headingRaw = `@@subsection@@${fencedTitleAt(lines, hl)}`;
            } else {
                headingRaw = null;
            }
        } else if (isSectionFenceLine(t)) {
            headingRaw = `@@section@@${fencedTitleAt(lines, start)}`;
        } else if (isSubsectionFenceLine(t)) {
            headingRaw = `@@subsection@@${fencedTitleAt(lines, start)}`;
        }
        return {
            id: r.id,
            startLine: r.startLine,
            endLine: r.endLine,
            headingLine,
            headingRaw,
            isQuiz: sliceHasRealQuiz(lines, r.startLine, r.endLine),
            synthetic: false,
        };
    });
}

/** True only for a real `@quiz` fence outside code fences. */
function sliceHasRealQuiz(lines, start, end) {
    let inCode = false;
    for (let i = start; i < end && i < lines.length; i++) {
        const t = String(lines[i] || '').trim();
        if (t.startsWith('```')) {
            inCode = !inCode;
            continue;
        }
        if (inCode) continue;
        if (/^@quiz\b/i.test(t)) return true;
    }
    return false;
}

export function headingPrefixFromLine(line) {
    const t = line.trim();
    if (parseSyllabusPathLine(t)) return { kind: 'syllabus', prefix: '' };
    if (t.startsWith('###### ')) return { kind: 'md6', prefix: '###### ' };
    if (t.startsWith('##### ')) return { kind: 'md5', prefix: '##### ' };
    if (t.startsWith('#### ')) return { kind: 'md4', prefix: '#### ' };
    if (t.startsWith('### ')) return { kind: 'md3', prefix: '### ' };
    if (t.startsWith('## ')) return { kind: 'md2', prefix: '## ' };
    if (t.startsWith('# ')) return { kind: 'md1', prefix: '# ' };
    if (t.startsWith('@@section@@')) return { kind: 'section', prefix: '@section' };
    if (t.startsWith('@@subsection@@')) return { kind: 'subsection', prefix: '@subsection' };
    return { kind: 'unknown', prefix: '' };
}

/** Outline level 2…6 from `index:` path (or ATX / fence before prepare). */
export function tocRangeOutlineLevel(r) {
    if (!r) return null;
    if (r.headingLine == null) {
        return isSyntheticIntroItem(r) ? 0 : null;
    }
    const path =
        outlinePathIdFromText(r.headingRaw) || (isOutlinePathId(r.id) ? String(r.id) : null);
    if (path) return outlineLevelFromPathId(path);
    const k = headingPrefixFromLine(r.headingRaw || '').kind;
    /* Title-only @section / @subsection match ## / ### until prepare assigns index:. */
    if (k === 'md1') return 1;
    if (k === 'md2' || k === 'section') return 2;
    if (k === 'md3' || k === 'subsection') return 3;
    if (k === 'md4') return 4;
    if (k === 'md5') return 5;
    if (k === 'md6') return 6;
    return null;
}

/**
 * Exclusive end index of the outline subtree rooted at fromIdx.
 * Child = later range whose heading level is strictly deeper. Quiz content never changes depth.
 */
export function tocSubtreeExclusiveEnd(ranges, fromIdx) {
    const L = tocRangeOutlineLevel(ranges[fromIdx]);
    if (L == null) return fromIdx + 1;
    let k = fromIdx + 1;
    while (k < ranges.length) {
        const Lk = tocRangeOutlineLevel(ranges[k]);
        if (Lk == null || Lk <= L) break;
        k++;
    }
    return k;
}

function movedSubtreeExclusiveEnd(ranges, fromIdx) {
    return tocSubtreeExclusiveEnd(ranges, fromIdx);
}

/** Demote/promote a single ATX heading line (normalize only — not fences). */
function rewriteAtxHeadingToLevel(headingRaw, targetLevel) {
    if (!headingRaw) return headingRaw;
    const title = tocHeadingTitleForEdit(headingRaw);
    const em = tocHeadingEmojiPrefix(headingRaw);
    const combined = em ? `${em} ${title}` : title;
    const L = Math.max(1, Math.min(6, Math.floor(Number(targetLevel)) || 2));
    return `${'#'.repeat(L)} ${combined}`.trimEnd();
}

/** Markdown from the first line after the subtree — must stay byte-identical across nest/move/remove. */
export function tocBodyTailAfterSubtree(body, tocIndex) {
    const text = body != null ? String(body) : '';
    const ranges = getTocLineRanges(text);
    if (!ranges[tocIndex]) return text;
    const subEnd = tocSubtreeExclusiveEnd(ranges, tocIndex);
    const lines = text.split('\n');
    const start = subEnd < ranges.length ? ranges[subEnd].startLine : lines.length;
    return lines.slice(start).join('\n');
}

/**
 * Reorders by moving one entry (with its subtree) to an insertion position.
 * `insertIndex` can insert before the item at that index or at the end (insertIndex === ranges.length).
 *
 * Indices refer to the TOC from `getTocLineRanges(body)` (same order as `getToc`).
 *
 * @param {string} body
 * @param {number} fromIdx
 * @param {number} insertIndex 0…ranges.length
 */
export function reorderTocSectionRange(body, fromIdx, insertIndex) {
    const ranges = getTocLineRanges(body);
    if (!ranges.length) return body;
    if (!Number.isFinite(fromIdx) || !Number.isFinite(insertIndex)) return body;
    const from = Math.floor(fromIdx);
    let ins = Math.floor(insertIndex);
    if (from < 0 || from >= ranges.length) return body;
    ins = Math.max(0, Math.min(ins, ranges.length));

    const fromR = ranges[from];
    if (!fromR || isSyntheticIntroItem(fromR)) return body;

    const subEnd = movedSubtreeExclusiveEnd(ranges, from);
    // Do not allow inserting inside one’s own subtree.
    if (ins > from && ins < subEnd) return body;

    const lines = ((body != null ? body : '')).split('\n');
    const sourceStart = fromR.startLine;
    const sourceEnd = subEnd < ranges.length ? ranges[subEnd].startLine : lines.length;
    const sliceLines = lines.slice(sourceStart, sourceEnd);
    const without = [...lines.slice(0, sourceStart), ...lines.slice(sourceEnd)];

    // Compute insertion line in body without the removed slice.
    let insertLine;
    if (ins >= ranges.length) {
        insertLine = without.length;
    } else {
        let anchorLine = ranges[ins].startLine;
        // If we removed a block before the anchor, adjust the line.
        if (from < ins) anchorLine -= sourceEnd - sourceStart;
        insertLine = Math.max(0, Math.min(anchorLine, without.length));
    }

    const out = [...without.slice(0, insertLine), ...sliceLines, ...without.slice(insertLine)];
    return out.join('\n');
}

/** Previous sibling at the same outline level, or -1. */
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

/** Deepest outline level in the subtree rooted at fromIdx (inclusive). */
export function maxOutlineLevelInSubtree(ranges, fromIdx) {
    if (!ranges?.length || fromIdx < 0 || fromIdx >= ranges.length) return 0;
    const subEnd = tocSubtreeExclusiveEnd(ranges, fromIdx);
    let maxL = 0;
    for (let i = fromIdx; i < subEnd; i++) {
        const Li = tocRangeOutlineLevel(ranges[i]);
        if (Li != null) maxL = Math.max(maxL, Li);
    }
    return maxL;
}

/** Resolve toc index → range index by id + ordinal. */
export function resolveTocRangeIndex(ranges, tocIdx, toc) {
    let idx = tocIdx;
    if (!Array.isArray(toc) || !toc[tocIdx] || !ranges?.length) {
        return Number.isInteger(idx) && idx >= 0 ? idx : -1;
    }
    const id = toc[tocIdx].id;
    let ord = 0;
    for (let i = 0; i < tocIdx; i++) {
        if (toc[i]?.id === id) ord += 1;
    }
    let seen = 0;
    for (let i = 0; i < ranges.length; i++) {
        if (ranges[i].id !== id) continue;
        if (seen === ord) return i;
        seen += 1;
    }
    return idx >= 0 && idx < ranges.length ? idx : -1;
}

/**
 * Demote lone markdown `# Title` (space after #, not `#1}`) to `##` without
 * cascading children. Never rewrites `@section` fences or `#path}` rows.
 */
export function normalizeConstructOutlineRoots(body) {
    const text = body != null ? String(body) : '';
    const ranges = getTocLineRanges(text);
    const lines = text.split('\n');
    let changed = false;
    for (const r of ranges) {
        if (r.headingLine == null) continue;
        const kind = headingPrefixFromLine(r.headingRaw || '').kind;
        if (kind !== 'md1') continue;
        const raw = lines[r.headingLine];
        lines[r.headingLine] = rewriteAtxHeadingToLevel(raw, 2);
        changed = true;
    }
    return changed ? lines.join('\n') : text;
}

/**
 * After a syllabus fence is written (hidden in construct WYSIWYG), keep a
 * large in-lesson title in the prose so the section still shows a title inside.
 * `headingIndex` should be the last line of the fence (`@/section`).
 */
function ensureInLessonLgTitle(lines, headingIndex, titleText) {
    const title = String(titleText != null ? titleText : '').trim();
    if (!title || headingIndex < 0 || headingIndex >= lines.length) return false;
    let i = headingIndex + 1;
    while (i < lines.length && !String(lines[i] || '').trim()) i++;
    const next = i < lines.length ? String(lines[i] || '').trim() : '';
    if (/\{\{lg\}\}/i.test(next)) return false;
    const insertAt = headingIndex + 1;
    const chunk = ['', `{{lg}}${title}{{/lg}}`, ''];
    lines.splice(insertAt, 0, ...chunk);
    return true;
}

/**
 * ATX outline hits for ingest/prepare — includes bare `##` even when the body
 * already has `index:` fences (path-gate would otherwise hide them).
 */
function collectAtxOutlineHits(lines) {
    const hits = [];
    let inCode = false;
    let inQuiz = false;
    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const t = String(raw || '').trim();
        if (t.startsWith('```')) {
            inCode = !inCode;
            continue;
        }
        if (inCode) continue;
        if (inQuiz) {
            if (/^@\/quiz\b/i.test(t)) inQuiz = false;
            continue;
        }
        if (/^@quiz\b/i.test(t)) {
            inQuiz = true;
            continue;
        }
        if (isSectionFenceLine(t) || isSubsectionFenceLine(t)) {
            const block = readFencedBlockAt(lines, i);
            if (block && Number.isFinite(block.endLine)) i = block.endLine;
            continue;
        }
        const blank = t.match(/^(#{1,6})$/);
        if (blank) {
            hits.push({ hi: i, level: blank[1].length });
            continue;
        }
        const { kind } = headingPrefixFromLine(raw);
        if (!kind.startsWith('md')) continue;
        const level =
            kind === 'md1' ? 1 : kind === 'md2' ? 2 : kind === 'md3' ? 3 : kind === 'md4' ? 4 : kind === 'md5' ? 5 : 6;
        hits.push({ hi: i, level });
    }
    return hits;
}

/**
 * Convert outline ATX rows to temporary indexed `@section` fences.
 */
export function promoteOutlineAtxToSyllabus(body) {
    const text = body != null ? String(body) : '';
    const lines = text.split('\n');
    const hits = collectAtxOutlineHits(lines);
    if (!hits.length) return text;
    let changed = false;
    let temp = 0;
    for (let ri = hits.length - 1; ri >= 0; ri--) {
        const { hi, level } = hits[ri];
        if (hi < 0 || hi >= lines.length) continue;
        const raw = lines[hi];
        const em = tocHeadingEmojiPrefix(raw);
        const title = tocHeadingTitleForEdit(raw);
        const combined = em ? `${em} ${title}` : title;
        temp += 1;
        const L = Math.max(2, level || 2);
        replaceOutlineRowWithFence(lines, hi, tempPathForOutlineLevel(L, temp), combined);
        ensureInLessonLgTitle(lines, hi + 3, title);
        changed = true;
    }
    return changed ? lines.join('\n') : text;
}

/**
 * Ensure every outline row is `@section` + `index` (+ title). Converts ingest
 * `#path}` and title-only fences. Optional `{{lg}}` when seeding from ATX.
 * @param {string} body
 * @param {{ injectLg?: boolean }} [opts]
 */
export function flattenOutlineFencesToAtx(body, opts = {}) {
    const injectLg = opts.injectLg !== false;
    const text = body != null ? String(body) : '';
    const ranges = getTocLineRanges(text);
    const lines = text.split('\n');
    let changed = false;
    let temp = 0;
    for (let i = ranges.length - 1; i >= 0; i--) {
        const r = ranges[i];
        if (!r || isSyntheticIntroItem(r) || r.headingLine == null) continue;
        const hi = r.headingLine;
        if (hi < 0 || hi >= lines.length) continue;
        const raw = String(lines[hi] || '').trim();
        const kind = headingPrefixFromLine(r.headingRaw || '').kind;
        const title =
            tocHeadingTitleForEdit(r.headingRaw).trim() ||
            (kind === 'subsection' ? 'Subsection' : 'Section');

        if (
            kind === 'section' ||
            kind === 'subsection' ||
            isSectionFenceLine(raw) ||
            isSubsectionFenceLine(raw)
        ) {
            const block = readFencedBlockAt(lines, hi);
            const fromField = block ? indexFromFields(block.fields) : '';
            const fromId = isOutlinePathId(r.id) ? String(r.id) : '';
            temp += 1;
            const L = tocRangeOutlineLevel(r) || (kind === 'subsection' ? 3 : 2);
            const path =
                (isOutlinePathId(fromField) && fromField) ||
                fromId ||
                tempPathForOutlineLevel(L, temp);
            const hadIndex = isOutlinePathId(fromField) || isOutlinePathId(fromId);
            replaceOutlineRowWithFence(lines, hi, path, title);
            /* Inject {{lg}} only when first materializing title-only fences. */
            if (injectLg && !hadIndex) ensureInLessonLgTitle(lines, hi + 3, title);
            changed = true;
            continue;
        }

        if (kind === 'syllabus' || kind.startsWith('md')) {
            temp += 1;
            const L = tocRangeOutlineLevel(r) || 2;
            const path =
                (isOutlinePathId(r.id) && String(r.id)) ||
                outlinePathIdFromText(raw) ||
                tempPathForOutlineLevel(L, temp);
            replaceOutlineRowWithFence(lines, hi, path, title);
            /* ATX → fence gets {{lg}}; ingest `#path}` does not. */
            if (injectLg && kind.startsWith('md')) ensureInLessonLgTitle(lines, hi + 3, title);
            changed = true;
        }
    }
    return changed ? lines.join('\n') : text;
}

/** Convert leftover `#path}` lines to `@section` fences (ingest helper). */
export function materializeSyllabusAsSectionFences(body) {
    const text = body != null ? String(body) : '';
    if (!/(?:^|\n)#\d+(?:\.\d+)*\}/.test(text)) return text;
    return flattenOutlineFencesToAtx(text, { injectLg: false });
}

/**
 * Normalize outline to indexed `@section` fences and renumber `index:`.
 * This is the construct math form and the on-disk form.
 */
export function prepareConstructOutlineMath(body, fallbackTitle = 'Section') {
    let text = body != null ? String(body) : '';
    text = normalizeConstructOutlineRoots(text);
    const hasFence = /(?:^|\n)@section\b/i.test(text) || /(?:^|\n)@subsection\b/i.test(text);
    const hasPath = /(?:^|\n)#\d+(?:\.\d+)*\}/.test(text);
    const hasAtx = /(?:^|\n)#{1,6}(?: |$)/m.test(text);
    if (hasFence || hasPath || hasAtx) {
        if (hasAtx) text = promoteOutlineAtxToSyllabus(text);
        text = flattenOutlineFencesToAtx(text);
    }
    text = repairEmptyOutlineTitles(text, fallbackTitle);
    /* Repair may leave ATX titles when path ids already existed — fence them. */
    if (/(?:^|\n)#{1,6}(?: |$)/m.test(text)) {
        text = promoteOutlineAtxToSyllabus(text);
        text = flattenOutlineFencesToAtx(text, { injectLg: true });
    }
    text = renumberOutlinePaths(text);
    return text;
}

/** Alias — human and math share indexed `@section` fences. */
export function prepareConstructOutlineBody(body, fallbackTitle = 'Section') {
    return prepareConstructOutlineMath(body, fallbackTitle);
}
export function buildConstructOutline(body) {
    const text = prepareConstructOutlineMath(body);
    const ranges = getTocLineRanges(text);
    return { body: text, ranges };
}
export function repairEmptyOutlineTitles(body, fallbackBase = 'Section') {
    const text = body != null ? String(body) : '';
    const lines = text.split('\n');
    let changed = false;
    const used = new Set();
    const base = String(fallbackBase || 'Section').trim() || 'Section';

    const takeTitle = () => {
        let n = 1;
        let next = base;
        while (used.has(next.toLowerCase())) {
            n += 1;
            next = `${base} ${n}`;
        }
        used.add(next.toLowerCase());
        return next;
    };

    /* Seed used titles from current outline. */
    for (const r of getTocLineRanges(text)) {
        if (!r || isSyntheticIntroItem(r)) continue;
        const t = tocHeadingTitleForEdit(r.headingRaw || '').trim();
        if (t) used.add(t.toLowerCase());
    }

    let inCode = false;
    let inQuiz = false;
    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const t = String(raw || '').trim();
        if (t.startsWith('```')) {
            inCode = !inCode;
            continue;
        }
        if (inCode) continue;
        if (inQuiz) {
            if (/^@\/quiz\b/i.test(t)) inQuiz = false;
            continue;
        }
        if (/^@quiz\b/i.test(t)) {
            inQuiz = true;
            continue;
        }
        const m = t.match(/^(#{1,6})\s*$/);
        if (!m) continue;
        /* Orphan blank heading line (parser skips these) — give it a real title. */
        lines[i] = `${m[1]} ${takeTitle()}`;
        changed = true;
    }

    const ranges = getTocLineRanges(lines.join('\n'));
    for (const r of ranges) {
        if (!r || r.headingLine == null || isSyntheticIntroItem(r)) continue;
        const raw = String(r.headingRaw || lines[r.headingLine] || '');
        const title = tocHeadingTitleForEdit(raw).trim();
        if (title) continue;
        const L = tocRangeOutlineLevel(r) || 2;
        const em = tocHeadingEmojiPrefix(raw);
        lines[r.headingLine] = `${'#'.repeat(Math.max(1, Math.min(6, L)))} ${em ? `${em} ` : ''}${takeTitle()}`;
        changed = true;
    }
    return changed ? lines.join('\n') : text;
}
export function tocHeadingTitleForEdit(headingRaw) {
    if (!headingRaw) return '';
    const t = headingRaw.trim();
    if (/^#{1,6}$/.test(t)) return '';
    const syl = parseSyllabusPathLine(t);
    let inner = syl ? syl.title : t;
    if (!syl) {
        if (t.startsWith('###### ')) inner = t.slice(7);
        else if (t.startsWith('##### ')) inner = t.slice(6);
        else if (t.startsWith('#### ')) inner = t.slice(5);
        else if (t.startsWith('### ')) inner = t.slice(4);
        else if (t.startsWith('## ')) inner = t.slice(3);
        else if (t.startsWith('# ')) inner = t.slice(2);
        else if (t.startsWith('@@section@@')) inner = t.slice('@@section@@'.length).trim();
        else if (t.startsWith('@@subsection@@')) inner = t.slice('@@subsection@@'.length).trim();
        inner = stripOutlinePathId(inner);
    }

    const m = inner.match(
        /^([\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]+)\s+/u
    );
    if (m) return stripOutlinePathId(inner.slice(m[0].length)).trim();
    const first = inner.codePointAt(0);
    if (first && inner.length > 2 && /[^\w\s]/.test(inner.slice(0, 2))) {
        const ch = String.fromCodePoint(first);
        if (inner.startsWith(ch + ' ')) return stripOutlinePathId(inner.slice(ch.length + 1)).trim();
    }
    return inner.trim();
}

export function tocHeadingEmojiPrefix(headingRaw) {
    if (!headingRaw) return '';
    const t = headingRaw.trim();
    const syl = parseSyllabusPathLine(t);
    let inner = syl ? syl.title : t;
    if (!syl) {
        if (t.startsWith('###### ')) inner = t.slice(7);
        else if (t.startsWith('##### ')) inner = t.slice(6);
        else if (t.startsWith('#### ')) inner = t.slice(5);
        else if (t.startsWith('### ')) inner = t.slice(4);
        else if (t.startsWith('## ')) inner = t.slice(3);
        else if (t.startsWith('# ')) inner = t.slice(2);
        else if (t.startsWith('@@section@@')) inner = t.slice('@@section@@'.length).trim();
        else if (t.startsWith('@@subsection@@')) inner = t.slice('@@subsection@@'.length).trim();
        inner = stripOutlinePathId(inner);
    }

    const m = inner.match(
        /^([\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]+)/u
    );
    if (m) return m[1];
    if (inner.length && /[^\w\s.,;:!?\-]/.test(inner[0])) {
        const cp = inner.codePointAt(0);
        const ch = String.fromCodePoint(cp);
        if (inner.startsWith(ch + ' ') || inner.length === 1) return ch;
    }
    return '';
}
