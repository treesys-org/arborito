import { parseContent, slugify } from './parser.js';

/**
 * Line index for each TOC entry (same length and order as getToc({ content: body })).
 * Only operates on the lesson markdown body (no file @title header).
 */
export function getTocLineRanges(body) {
    const text = (body != null ? body : '');
    const lines = text.split('\n');

    const headingIndices = [];
    for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        if (!t) continue;
        if (t.startsWith('###### ')) {
            headingIndices.push(i);
            continue;
        }
        if (t.startsWith('##### ')) {
            headingIndices.push(i);
            continue;
        }
        if (t.startsWith('#### ')) {
            headingIndices.push(i);
            continue;
        }
        if (t.startsWith('### ')) {
            headingIndices.push(i);
            continue;
        }
        if (t.startsWith('## ')) {
            headingIndices.push(i);
            continue;
        }
        if (t.startsWith('# ')) {
            headingIndices.push(i);
            continue;
        }
        if (t.startsWith('@section:')) {
            headingIndices.push(i);
            continue;
        }
        if (t.startsWith('@subsection:')) {
            headingIndices.push(i);
            continue;
        }
        if (t.startsWith('@quiz:')) {
            headingIndices.push(i);
            continue;
        }
    }

    /** @type {{ id: string, startLine: number, endLine: number, headingLine: number | null, headingRaw: string | null, isQuiz: boolean }[]} */
    const ranges = [];

    if (headingIndices.length === 0) {
        return ranges;
    }
    const blocks = parseContent(text);

    const tocBlocks = [];
    blocks.forEach((b) => {
        if (
            ['h1', 'section', 'h2', 'subsection', 'h3', 'h4', 'h5', 'h6', 'quiz'].includes(b.type)
        ) {
            tocBlocks.push(b);
        }
    });

    for (let k = 0; k < headingIndices.length; k++) {
        const start = headingIndices[k];
        const end = k + 1 < headingIndices.length ? headingIndices[k + 1] : lines.length;
        const b = tocBlocks[k];
        const id = b ? b.id : slugify(lines[start].trim().slice(0, 40));
        const isQuiz = (b && b.type) === 'quiz';
        ranges.push({
            id,
            startLine: start,
            endLine: end,
            headingLine: start,
            headingRaw: lines[start],
            isQuiz
        });
    }

    return ranges;
}

export function headingPrefixFromLine(line) {
    const t = line.trim();
    if (t.startsWith('###### ')) return { kind: 'md6', prefix: '###### ' };
    if (t.startsWith('##### ')) return { kind: 'md5', prefix: '##### ' };
    if (t.startsWith('#### ')) return { kind: 'md4', prefix: '#### ' };
    if (t.startsWith('### ')) return { kind: 'md3', prefix: '### ' };
    if (t.startsWith('## ')) return { kind: 'md2', prefix: '## ' };
    if (t.startsWith('# ')) return { kind: 'md1', prefix: '# ' };
    if (t.startsWith('@section:')) return { kind: 'section', prefix: '@section:' };
    if (t.startsWith('@subsection:')) return { kind: 'subsection', prefix: '@subsection:' };
    if (t.startsWith('@quiz:')) return { kind: 'quiz', prefix: '@quiz:' };
    return { kind: 'unknown', prefix: '' };
}

/** Nivel de esquema 1…6 (intro sin encabezado = 0). */
export function tocRangeOutlineLevel(r) {
    if (!r || r.isQuiz) return 99;
    if (r.headingLine == null) return 0;
    const k = headingPrefixFromLine(r.headingRaw || '').kind;
    if (k === 'md1' || k === 'section') return 1;
    if (k === 'md2' || k === 'subsection') return 2;
    if (k === 'md3') return 3;
    if (k === 'md4') return 4;
    if (k === 'md5') return 5;
    if (k === 'md6') return 6;
    return 2;
}

function movedSubtreeExclusiveEnd(ranges, fromIdx) {
    const L = tocRangeOutlineLevel(ranges[fromIdx]);
    let k = fromIdx + 1;
    while (k < ranges.length && tocRangeOutlineLevel(ranges[k]) > L) k++;
    return k;
}

function rewriteHeadingToLevel(headingRaw, targetLevel) {
    if (!headingRaw) return headingRaw;
    const title = tocHeadingTitleForEdit(headingRaw);
    const em = tocHeadingEmojiPrefix(headingRaw);
    const combined = em ? `${em} ${title}` : title;
    const lv = Math.max(1, Math.min(6, Number.isFinite(targetLevel) ? Math.floor(targetLevel) : 1));
    return `${'#'.repeat(lv)} ${combined}`;
}

function rewriteSliceHeadingLevels(sliceLines, sourceLevel, targetLevel) {
    const delta = targetLevel - sourceLevel;
    if (!delta) return sliceLines;
    return sliceLines.map((line) => {
        const { kind } = headingPrefixFromLine(line || '');
        let cur = Number.parseInt(kind.slice(2), 10);
        if (kind === 'section') cur = 1;
        if (kind === 'subsection') cur = 2;
        if (!Number.isFinite(cur)) return line;
        const next = Math.max(1, Math.min(6, cur + delta));
        return rewriteHeadingToLevel(line, next);
    });
}

function rebuildBodyFromRangeOrder(body, order) {
    const ranges = getTocLineRanges(body);
    if (!order.length || order.length !== ranges.length) return body;
    const lines = body.split('\n');
    const chunks = order.map((i) => {
        const r = ranges[i];
        return lines.slice(r.startLine, r.endLine).join('\n');
    });
    return chunks.join('\n');
}

/**
 * Reorders or re-nests one TOC entry (same indices as `getToc` / `getTocLineRanges`).
 * @param {'reorder'|'nestUnder'} mode `nestUnder`: place the block at the end of the parent range and set heading to parent+1 or requested level.
 */
export function moveTocSectionRange(body, fromIdx, toIdx, mode = 'reorder', desiredLevel = null) {
    const ranges = getTocLineRanges(body);
    if (!ranges.length || fromIdx === toIdx) return body;
    const fromR = ranges[fromIdx];
    if (!fromR || !ranges[toIdx]) return body;
    if (fromR.isQuiz) return body;

    if (mode === 'reorder') {
        const subEnd = movedSubtreeExclusiveEnd(ranges, fromIdx);
        if (toIdx > fromIdx && toIdx < subEnd) return body;
        const lines = body.split('\n');
        const sourceStart = fromR.startLine;
        const sourceEnd = subEnd < ranges.length ? ranges[subEnd].startLine : lines.length;
        const sliceLines = lines.slice(sourceStart, sourceEnd);
        const without = [...lines.slice(0, sourceStart), ...lines.slice(sourceEnd)];
        let insertAt = ranges[toIdx].startLine;
        if (fromIdx < toIdx) insertAt -= sourceEnd - sourceStart;
        const out = [...without.slice(0, insertAt), ...sliceLines, ...without.slice(insertAt)];
        return out.join('\n');
    }

    if (mode === 'nestUnder') {
        if (toIdx === fromIdx) return body;
        const subEnd = movedSubtreeExclusiveEnd(ranges, fromIdx);
        if (toIdx > fromIdx && toIdx < subEnd) return body;

        const parentR = ranges[toIdx];
        if (!parentR || parentR.isQuiz) return body;

        const lines = body.split('\n');
        const sourceStart = fromR.startLine;
        const sourceEnd = subEnd < ranges.length ? ranges[subEnd].startLine : lines.length;
        let sliceLines = lines.slice(sourceStart, sourceEnd);
        if (!sliceLines.length) return body;

        const parentLevel = tocRangeOutlineLevel(parentR);
        const requestedLevel = Number.isFinite(desiredLevel) ? Math.floor(desiredLevel) : parentLevel + 1;
        // Ensure we nest at least one level deeper than parent, but not more than 6
        const targetLevel = Math.max(parentLevel + 1, Math.min(6, requestedLevel));
        const sourceLevel = tocRangeOutlineLevel(fromR);
        
        sliceLines = rewriteSliceHeadingLevels(sliceLines, sourceLevel, targetLevel);
        if (fromR.headingLine != null) {
            const hi = fromR.headingLine - fromR.startLine;
            if (hi >= 0 && hi < sliceLines.length) {
                sliceLines[hi] = rewriteHeadingToLevel(sliceLines[hi], targetLevel);
            }
        }

        const without = [...lines.slice(0, sourceStart), ...lines.slice(sourceEnd)];
        const bodyMid = without.join('\n');
        const ranges2 = getTocLineRanges(bodyMid);

        const parentId = parentR.id;
        const parentNewIdx = ranges2.findIndex((r) => r.id === parentId);
        if (parentNewIdx === -1) return body;

        const parentSubEnd = movedSubtreeExclusiveEnd(ranges2, parentNewIdx);
        const insertAt = parentSubEnd < ranges2.length ? ranges2[parentSubEnd].startLine : without.length;
        const out = [...without.slice(0, insertAt), ...sliceLines, ...without.slice(insertAt)];
        return out.join('\n');
    }

    return body;
}

/**
 * Reorders by moving one entry (with its subtree) to an insertion position.
 * Unlike `moveTocSectionRange(..., 'reorder')`, `insertIndex` can insert
 * *before* the item at that index or at the end (insertIndex === ranges.length).
 *
 * Indices refer to the TOC from `getTocLineRanges(body)` (including the virtual "intro" entry).
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
    if (!fromR) return body;
    if (fromR.isQuiz) return body;

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

/**
 * Adjusts heading level (##/###/####…) for one section and its whole subtree (subheadings)
 * without reordering. Useful to “unnest” (drag left).
 * @param {string} body
 * @param {number} tocIndex
 * @param {number} targetLevel 1…6
 */
export function setTocSectionLevel(body, tocIndex, targetLevel) {
    const ranges = getTocLineRanges(body);
    const r = ranges[tocIndex];
    if (!r) return body;
    if (r.isQuiz) return body;

    // Nuevo mapping: depth=0 => '##' (nivel 2). Nunca bajamos de ##.
    const nextLevel = Math.max(2, Math.min(6, Number.isFinite(targetLevel) ? Math.floor(targetLevel) : 2));
    const curLevel = tocRangeOutlineLevel(r);
    if (!curLevel || curLevel === 99) return body;
    if (curLevel === nextLevel) return body;

    const subEnd = movedSubtreeExclusiveEnd(ranges, tocIndex);
    const lines = ((body != null ? body : '')).split('\n');
    const sourceStart = r.startLine;
    const sourceEnd = subEnd < ranges.length ? ranges[subEnd].startLine : lines.length;
    let sliceLines = lines.slice(sourceStart, sourceEnd);
    if (!sliceLines.length) return body;

    sliceLines = rewriteSliceHeadingLevels(sliceLines, curLevel, nextLevel);
    if (r.headingLine != null) {
        const hi = r.headingLine - r.startLine;
        if (hi >= 0 && hi < sliceLines.length) {
            sliceLines[hi] = rewriteHeadingToLevel(sliceLines[hi], nextLevel);
        }
    }

    const out = [...lines.slice(0, sourceStart), ...sliceLines, ...lines.slice(sourceEnd)];
    return out.join('\n');
}

/**
 * @param {string} emojiPrefix Optional character or emoji (shown before the title).
 */
export function renameTocSection(body, tocIndex, newTitle, emojiPrefix) {
    const ranges = getTocLineRanges(body);
    const r = ranges[tocIndex];
    if (!r || r.headingLine === null || r.isQuiz) return body;

    const lines = body.split('\n');
    const raw = lines[r.headingLine];
    const { kind, prefix } = headingPrefixFromLine(raw);
    if (kind === 'unknown') return body;

    const title = String(newTitle != null ? newTitle : '').trim();
    const em = String(emojiPrefix != null ? emojiPrefix : '').trim();
    const combined = em ? `${em} ${title}` : title;

    if (kind === 'section') {
        lines[r.headingLine] = `@section: ${combined}`;
    } else if (kind === 'subsection') {
        lines[r.headingLine] = `@subsection: ${combined}`;
    } else {
        lines[r.headingLine] = `${prefix}${combined}`;
    }

    return lines.join('\n');
}

export function removeTocSection(body, tocIndex) {
    const ranges = getTocLineRanges(body);
    const r = ranges[tocIndex];
    if (!r) return body;
    const lines = body.split('\n');
    const next = [...lines.slice(0, r.startLine), ...lines.slice(r.endLine)];
    return next.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

export function addTocSectionAfter(body, afterTocIndex, title = 'New section') {
    const ranges = getTocLineRanges(body);
    if (!ranges.length) return `## ${title}\n\n`;

    const safeIdx = Math.max(0, Math.min(afterTocIndex, ranges.length - 1));
    const insertAt = ranges[safeIdx].endLine;
    const lines = body.split('\n');
    const insert = ['', `## ${title}`, '', ''];
    lines.splice(insertAt, 0, ...insert);
    return lines.join('\n');
}

/**
 * Appends a `###` heading (TOC sub-item) at the end of the selected part.
 * If the virtual TOC is only “Intro” and a `##` part already exists, and the index points at Intro,
 * insert the `###` right under that first part so it is not placed before the first `##`.
 */
function firstMajorPartRangeAfterIntro(ranges) {
    for (let i = 1; i < ranges.length; i++) {
        const r = ranges[i];
        if (r.isQuiz) continue;
        const raw = (r.headingRaw || '').trim();
        if (raw.startsWith('@subsection:')) continue;
        if (/^#{3,6} /.test(raw)) continue;
        return r;
    }
    return null;
}

export function addTocSubsectionAfter(body, afterTocIndex, title = 'Nuevo subpunto') {
    const ranges = getTocLineRanges(body);
    if (!ranges.length) return `### ${title}\n\n`;

    const safeIdx = Math.max(0, Math.min(afterTocIndex, ranges.length - 1));
    const lines = body.split('\n');

    let insertAt;
    let targetLevel = 3;
    if (ranges[safeIdx].id === 'intro' && ranges.length > 1) {
        const part = firstMajorPartRangeAfterIntro(ranges);
        insertAt = part ? part.startLine + 1 : ranges[0].endLine;
        targetLevel = part ? Math.min(6, tocRangeOutlineLevel(part) + 1) : 3;
    } else {
        const subEnd = movedSubtreeExclusiveEnd(ranges, safeIdx);
        insertAt = subEnd < ranges.length ? ranges[subEnd].startLine : lines.length;
        targetLevel = Math.min(6, tocRangeOutlineLevel(ranges[safeIdx]) + 1);
    }

    const insert = ['', `${'#'.repeat(Math.max(1, targetLevel))} ${title}`, '', ''];
    lines.splice(insertAt, 0, ...insert);
    return lines.join('\n');
}

/** Display title without leading emoji (for editing). */
export function tocHeadingTitleForEdit(headingRaw) {
    if (!headingRaw) return '';
    const t = headingRaw.trim();
    let inner = t;
    if (t.startsWith('###### ')) inner = t.slice(7);
    else if (t.startsWith('##### ')) inner = t.slice(6);
    else if (t.startsWith('#### ')) inner = t.slice(5);
    else if (t.startsWith('### ')) inner = t.slice(4);
    else if (t.startsWith('## ')) inner = t.slice(3);
    else if (t.startsWith('# ')) inner = t.slice(2);
    else if (t.startsWith('@section:')) inner = t.slice(9).trim();
    else if (t.startsWith('@subsection:')) inner = t.slice(12).trim();
    else if (t.startsWith('@quiz:')) inner = t.slice(6).trim();

    const m = inner.match(
        /^([\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]+)\s+/u
    );
    if (m) return inner.slice(m[0].length).trim();
    const first = inner.codePointAt(0);
    if (first && inner.length > 2 && /[^\w\s]/.test(inner.slice(0, 2))) {
        const ch = String.fromCodePoint(first);
        if (inner.startsWith(ch + ' ')) return inner.slice(ch.length + 1).trim();
    }
    return inner.trim();
}

export function tocHeadingEmojiPrefix(headingRaw) {
    if (!headingRaw) return '';
    const t = headingRaw.trim();
    let inner = t;
    if (t.startsWith('###### ')) inner = t.slice(7);
    else if (t.startsWith('##### ')) inner = t.slice(6);
    else if (t.startsWith('#### ')) inner = t.slice(5);
    else if (t.startsWith('### ')) inner = t.slice(4);
    else if (t.startsWith('## ')) inner = t.slice(3);
    else if (t.startsWith('# ')) inner = t.slice(2);
    else if (t.startsWith('@section:')) inner = t.slice(9).trim();
    else if (t.startsWith('@subsection:')) inner = t.slice(12).trim();
    else if (t.startsWith('@quiz:')) inner = t.slice(6).trim();

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
