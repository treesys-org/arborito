import { parseContent } from './parser.js';
import { isTocFenceLine } from './lesson-fenced-blocks.js';

/** Same heading types as getToc() in content-toc.js (no quiz). */
const TOC_BLOCK_TYPES = new Set([
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'section',
    'subsection'
]);

function getTocItemsFromBody(body) {
    const blocks = parseContent(body != null ? body : '');
    const items = [];
    blocks.forEach((b) => {
        if (b.type === 'h1' || b.type === 'section') {
            items.push({ text: b.text, level: 1, id: b.id });
        } else if (b.type === 'h2' || b.type === 'subsection') {
            items.push({ text: b.text, level: 2, id: b.id });
        } else if (b.type === 'h3') {
            items.push({ text: b.text, level: 3, id: b.id });
        } else if (b.type === 'h4') {
            items.push({ text: b.text, level: 4, id: b.id });
        } else if (b.type === 'h5') {
            items.push({ text: b.text, level: 5, id: b.id });
        } else if (b.type === 'h6') {
            items.push({ text: b.text, level: 6, id: b.id });
        }
    });
    return items;
}

function isTocHeadingLine(trimmed) {
    if (!trimmed) return false;
    /* @quiz fences and the @quiz fences are body content, not TOC entries. */
    if (/^@\/?quiz\b/i.test(trimmed)) return false;
    return (
        trimmed.startsWith('# ') ||
        trimmed.startsWith('## ') ||
        trimmed.startsWith('### ') ||
        trimmed.startsWith('#### ') ||
        trimmed.startsWith('##### ') ||
        trimmed.startsWith('###### ') ||
        isTocFenceLine(trimmed)
    );
}

/**
 * Line ranges aligned 1:1 with getToc() / getTocItemsFromBody (TOC headings only).
 * @returns {{ tocIndex: number, id: string, startLine: number, endLine: number }[]}
 */
function getTocSectionRanges(body) {
    const text = body != null ? body : '';
    const lines = text.split('\n');
    const items = getTocItemsFromBody(text);
    if (!items.length) {
        return [{ tocIndex: 0, id: 'intro', startLine: 0, endLine: lines.length }];
    }

    const starts = [];
    let inCode = false;
    let itemIdx = 0;
    for (let i = 0; i < lines.length && itemIdx < items.length; i++) {
        const t = lines[i].trim();
        if (t.startsWith('```')) {
            inCode = !inCode;
            continue;
        }
        if (inCode) continue;
        if (!isTocHeadingLine(t)) continue;
        starts.push(i);
        itemIdx += 1;
    }
    while (starts.length < items.length) {
        starts.push(lines.length);
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
    const r = ranges[tocIndex];
    if (!r) return lines.join('\n');
    return lines.slice(r.startLine, r.endLine).join('\n');
}

export function replaceTocSectionMarkdown(body, tocIndex, sectionMarkdown) {
    const lines = (body != null ? body : '').split('\n');
    const ranges = getTocSectionRanges(body);
    const r = ranges[tocIndex];
    if (!r) return sectionMarkdown != null ? String(sectionMarkdown) : '';
    const insert = String(sectionMarkdown != null ? sectionMarkdown : '')
        .replace(/\n{3,}/g, '\n\n')
        .split('\n');
    const next = [...lines.slice(0, r.startLine), ...insert, ...lines.slice(r.endLine)];
    return next.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

/** One section per editor: drop stray headings pasted from another slice. */
export function sanitiseConstructSectionMarkdown(sectionMd) {
    const lines = String(sectionMd != null ? sectionMd : '').split('\n');
    const out = [];
    let headingCount = 0;
    for (const line of lines) {
        const t = line.trim();
        if (isTocHeadingLine(t)) {
            headingCount += 1;
            if (headingCount > 1) break;
        }
        out.push(line);
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

const PRACTICE_SECTION_RE = /^(pr[aá]ctica|practice|repaso|ejercicios?|quiz)$/i;

/** Where a legacy header @quiz block should be injected in the body. */
export function findHeaderQuizTargetSectionIndex(body) {
    const items = getTocItemsFromBody(body);
    if (!items.length) return 0;
    for (let i = items.length - 1; i >= 0; i--) {
        const title = String(items[i].text || '').trim();
        if (PRACTICE_SECTION_RE.test(title)) return i;
    }
    return items.length - 1;
}

/** Meta @quiz block (declared in the file header) belongs on the practice/last section. */
export function metaQuizBelongsOnSectionIndex(fullBody, tocIndex) {
    return tocIndex === findHeaderQuizTargetSectionIndex(fullBody);
}
