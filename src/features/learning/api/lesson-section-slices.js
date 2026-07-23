/**
 * Lesson prose under each syllabus row — separate from temario markers.
 *
 * Syllabus / TOC rows (`#path} Title`, `@section`) live in `lesson-syllabus.js`.
 * This module extracts and replaces what the author writes beneath those rows
 * for the construct WYSIWYG (prose-only seed; outline headings stay in the file).
 */

import { parseContent } from './parser.js';
import { isFencedBlockClose, matchFencedLessonOpen } from './lesson-fenced-blocks.js';
import { isQuizBlockOpen, isQuizBlockClose } from './quiz-schema.js';
import {
    SYNTHETIC_INTRO_ID,
    isSyntheticIntroItem,
    SYLLABUS_PATH_LINE_RE,
    parseSyllabusPathLine,
    formatSyllabusPathLine,
    outlinePathIdFromHeadingLine,
    isOutlinePathId,
    bodyHasOutlinePathIds,
    isAtxHeadingLine,
    isOutlineHeadingLine,
    isForbiddenConstructProseHeadingLine,
    collectSyllabusTocItems,
} from './lesson-syllabus.js';

export {
    SYNTHETIC_INTRO_ID,
    isSyntheticIntroItem,
    SYLLABUS_PATH_LINE_RE,
    parseSyllabusPathLine,
    formatSyllabusPathLine,
    outlinePathIdFromHeadingLine,
    isOutlinePathId,
    bodyHasOutlinePathIds,
    isAtxHeadingLine,
    isOutlineHeadingLine,
    isForbiddenConstructProseHeadingLine,
};

function getTocItemsFromBody(body) {
    const text = body != null ? body : '';
    return collectSyllabusTocItems(parseContent(text), {
        bodyHasPaths: bodyHasOutlinePathIds(text),
    });
}

/**
 * Line ranges for construct editor flush (extract/replace section markdown).
 * When the body has no headings, returns a synthetic whole-body range
 * (`synthetic: true`, id `SYNTHETIC_INTRO_ID`) so index 0 still edits the full draft.
 * When headings exist, the first range starts at line 0 if there is preamble
 * prose before the first heading (so that prose is not orphaned).
 * @returns {{ tocIndex: number, id: string, startLine: number, endLine: number, synthetic?: boolean }[]}
 */
export function getTocSectionRanges(body) {
    const text = body != null ? body : '';
    const lines = text.split('\n');
    const items = getTocItemsFromBody(text);
    if (!items.length) {
        return [
            {
                tocIndex: 0,
                id: SYNTHETIC_INTRO_ID,
                startLine: 0,
                endLine: lines.length,
                synthetic: true,
            },
        ];
    }

    const starts = [];
    let inCode = false;
    let inQuiz = false;
    let fencedTag = null;
    let itemIdx = 0;
    for (let i = 0; i < lines.length && itemIdx < items.length; i++) {
        const t = lines[i].trim();
        if (t.startsWith('```')) {
            inCode = !inCode;
            continue;
        }
        if (inCode) continue;
        if (inQuiz) {
            if (isQuizBlockClose(t)) inQuiz = false;
            continue;
        }
        if (fencedTag) {
            if (isFencedBlockClose(lines[i], fencedTag)) fencedTag = null;
            continue;
        }
        if (isQuizBlockOpen(t)) {
            inQuiz = true;
            continue;
        }
        const openFence = matchFencedLessonOpen(t);
        if (openFence === 'section' || openFence === 'subsection') {
            if (isOutlineHeadingLine(t, text)) {
                starts.push(i);
                itemIdx += 1;
            }
            fencedTag = openFence;
            continue;
        }
        if (openFence) {
            fencedTag = openFence;
            continue;
        }
        if (!isOutlineHeadingLine(t, text)) continue;
        starts.push(i);
        itemIdx += 1;
    }
    while (starts.length < items.length) {
        starts.push(starts.length ? starts[starts.length - 1] : 0);
    }

    if (starts.length && starts[0] > 0) {
        const hasPreamble = lines.slice(0, starts[0]).some((l) => String(l || '').trim());
        if (hasPreamble) starts[0] = 0;
    }

    return items.map((item, i) => ({
        tocIndex: i,
        id: item.id,
        startLine: starts[i],
        endLine: i + 1 < starts.length ? starts[i + 1] : lines.length
    }));
}

/** TOC row that owns a body line (e.g. @quiz fence), ignoring `#` comments inside code fences. */
export function findTocIndexForBodyLine(body, lineNo) {
    const ranges = getTocSectionRanges(body);
    if (!ranges.length) return 0;
    let pick = ranges[0].tocIndex;
    for (const r of ranges) {
        if (lineNo >= r.startLine) pick = r.tocIndex;
        else break;
    }
    return pick;
}

export function extractTocSectionMarkdown(body, tocIndex) {
    const lines = (body != null ? body : '').split('\n');
    const ranges = getTocSectionRanges(body);
    if (!ranges.length) return lines.join('\n');
    const idx = Number(tocIndex);
    if (!Number.isFinite(idx) || idx < 0 || idx >= ranges.length) return '';
    const r = ranges[idx];
    return lines.slice(r.startLine, r.endLine).join('\n');
}

export function replaceTocSectionMarkdown(body, tocIndex, sectionMarkdown) {
    const text = body != null ? String(body) : '';
    const lines = text.split('\n');
    const ranges = getTocSectionRanges(body);
    if (!ranges.length) {
        return sectionMarkdown != null ? String(sectionMarkdown) : text;
    }
    const idx = Number(tocIndex);
    /* Never replace the whole lesson when the section index is stale/OOB. */
    if (!Number.isFinite(idx) || idx < 0 || idx >= ranges.length) return text;
    const r = ranges[idx];
    const insert = String(sectionMarkdown != null ? sectionMarkdown : '')
        .replace(/\n{3,}/g, '\n\n')
        .split('\n');
    const next = [...lines.slice(0, r.startLine), ...insert, ...lines.slice(r.endLine)];
    return next.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

/**
 * Walk section lines with the same fence/quiz awareness as getTocSectionRanges.
 * For `@section` / `@subsection`, `headingEndLine` is the close line (`@/section`).
 * @returns {{ headingLineIndex: number, headingEndLine: number, headingLine: string|null }}
 */
function findSectionOutlineHeading(sectionLines) {
    let inCode = false;
    let inQuiz = false;
    let fencedTag = null;
    for (let i = 0; i < sectionLines.length; i++) {
        const raw = sectionLines[i];
        const t = String(raw || '').trim();
        if (t.startsWith('```')) {
            inCode = !inCode;
            continue;
        }
        if (inCode) continue;
        if (inQuiz) {
            if (isQuizBlockClose(t)) inQuiz = false;
            continue;
        }
        if (fencedTag) {
            if (isFencedBlockClose(raw, fencedTag)) fencedTag = null;
            continue;
        }
        if (isQuizBlockOpen(t)) {
            inQuiz = true;
            continue;
        }
        const openFence = matchFencedLessonOpen(t);
        if (openFence === 'section' || openFence === 'subsection') {
            if (isOutlineHeadingLine(t, sectionLines.join('\n'))) {
                let end = i;
                while (end + 1 < sectionLines.length && !isFencedBlockClose(sectionLines[end + 1], openFence)) {
                    end += 1;
                }
                if (end + 1 < sectionLines.length && isFencedBlockClose(sectionLines[end + 1], openFence)) {
                    end += 1;
                }
                const headingBlock = sectionLines.slice(i, end + 1).join('\n');
                return {
                    headingLineIndex: i,
                    headingEndLine: end,
                    headingLine: headingBlock,
                };
            }
            fencedTag = openFence;
            continue;
        }
        if (openFence) {
            fencedTag = openFence;
            continue;
        }
        if (isOutlineHeadingLine(t, sectionLines.join('\n'))) {
            return { headingLineIndex: i, headingEndLine: i, headingLine: raw };
        }
    }
    return { headingLineIndex: -1, headingEndLine: -1, headingLine: null };
}

/**
 * Drop syllabus / ATX headings from construct prose so the WYSIWYG cannot invent
 * temario rows. Code fences and @quiz bodies keep their `#` lines.
 * In-lesson titles in construct are `{{lg}}…{{/lg}}`, not markdown headings.
 */
export function stripOutlineHeadingsFromProse(md) {
    const lines = String(md != null ? md : '').split('\n');
    const out = [];
    let inCode = false;
    let inQuiz = false;
    let skipOutlineFence = null;
    let keepFence = null;
    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const t = String(raw || '').trim();
        if (t.startsWith('```')) {
            inCode = !inCode;
            out.push(raw);
            continue;
        }
        if (inCode) {
            out.push(raw);
            continue;
        }
        if (inQuiz) {
            out.push(raw);
            if (isQuizBlockClose(t)) inQuiz = false;
            continue;
        }
        if (skipOutlineFence) {
            if (isFencedBlockClose(raw, skipOutlineFence)) skipOutlineFence = null;
            continue;
        }
        if (keepFence) {
            out.push(raw);
            if (isFencedBlockClose(raw, keepFence)) keepFence = null;
            continue;
        }
        if (isQuizBlockOpen(t)) {
            inQuiz = true;
            out.push(raw);
            continue;
        }
        const openFence = matchFencedLessonOpen(t);
        if (openFence === 'section' || openFence === 'subsection') {
            /* Outline fence — drop entirely so prose cannot invent TOC rows. */
            skipOutlineFence = openFence;
            continue;
        }
        if (openFence) {
            keepFence = openFence;
            out.push(raw);
            continue;
        }
        if (isForbiddenConstructProseHeadingLine(t)) continue;
        out.push(raw);
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

/**
 * Section body for the construct WYSIWYG: prose under the outline heading (no heading line).
 * Preamble bytes before the heading stay in the document and are not part of the editor seed
 * (so flush cannot relocate them under the heading).
 * Synthetic intro (no headings) returns the whole body as prose.
 */
export function extractSectionProseMarkdown(body, tocIndex) {
    const ranges = getTocSectionRanges(body);
    const idx = Number(tocIndex);
    if (!Number.isFinite(idx) || idx < 0 || idx >= ranges.length) return '';
    const full = extractTocSectionMarkdown(body, idx);
    if (ranges[idx].synthetic) {
        return stripOutlineHeadingsFromProse(full);
    }
    const lines = full.split('\n');
    const { headingLineIndex, headingEndLine } = findSectionOutlineHeading(lines);
    if (headingLineIndex < 0) {
        return stripOutlineHeadingsFromProse(full);
    }
    const afterIdx = Math.max(headingLineIndex, headingEndLine) + 1;
    const after = lines.slice(afterIdx).join('\n');
    return stripOutlineHeadingsFromProse(after).replace(/^\n+/, '');
}

/**
 * Rewrite only the prose under a TOC section heading. Outline headings inside proseMd are stripped.
 * Bytes before the outline heading (preamble) are preserved in place.
 */
export function replaceSectionProseMarkdown(body, tocIndex, proseMd) {
    const text = body != null ? String(body) : '';
    const ranges = getTocSectionRanges(body);
    const idx = Number(tocIndex);
    if (!Number.isFinite(idx) || idx < 0 || idx >= ranges.length) return text;
    const cleanProse = stripOutlineHeadingsFromProse(proseMd);
    const r = ranges[idx];
    if (r.synthetic) {
        return replaceTocSectionMarkdown(body, idx, cleanProse);
    }
    const sectionFull = extractTocSectionMarkdown(body, idx);
    const sectionLines = sectionFull.split('\n');
    const { headingLineIndex, headingLine } = findSectionOutlineHeading(sectionLines);
    if (headingLine == null || headingLineIndex < 0) {
        /* Non-synthetic range without a heading — refuse wipe (keep body). */
        return text;
    }
    const preamble = sectionLines.slice(0, headingLineIndex).join('\n').trimEnd();
    const parts = [];
    if (preamble) parts.push(preamble);
    parts.push(headingLine);
    if (cleanProse) parts.push(cleanProse);
    return replaceTocSectionMarkdown(body, idx, parts.join('\n'));
}

/** Construct commit sanitiser: whitespace + strip outline headings (TOC is sidebar-owned). */
export function sanitiseConstructSectionMarkdown(sectionMd) {
    return stripOutlineHeadingsFromProse(sectionMd);
}

const PRACTICE_SECTION_RE = /^(pr[aá]ctica|practice|repaso|ejercicios?|quiz)$/i;

/** Where a header @quiz block should be injected in the body. */
export function findHeaderQuizTargetSectionIndex(body) {
    const items = getTocItemsFromBody(body);
    if (!items.length) return 0;
    for (let i = items.length - 1; i >= 0; i--) {
        const title = String(items[i].text || '').trim();
        if (PRACTICE_SECTION_RE.test(title)) return i;
    }
    return items.length - 1;
}
