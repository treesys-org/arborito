import { parseContent } from './parser.js';

/** Same heading types as getToc() in content-toc.js (no quiz / quizv2). */
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

export function getTocItemsFromBody(body) {
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
    if (trimmed.startsWith('@quiz:')) return false;
    if (trimmed.startsWith('@quizv2')) return false;
    return (
        trimmed.startsWith('# ') ||
        trimmed.startsWith('## ') ||
        trimmed.startsWith('### ') ||
        trimmed.startsWith('#### ') ||
        trimmed.startsWith('##### ') ||
        trimmed.startsWith('###### ') ||
        trimmed.startsWith('@section:') ||
        trimmed.startsWith('@subsection:')
    );
}

/**
 * Line ranges aligned 1:1 with getToc() / getTocItemsFromBody (TOC headings only).
 * @returns {{ tocIndex: number, id: string, startLine: number, endLine: number }[]}
 */
export function getTocSectionRanges(body) {
    const text = body != null ? body : '';
    const lines = text.split('\n');
    const items = getTocItemsFromBody(text);
    if (!items.length) {
        return [{ tocIndex: 0, id: 'intro', startLine: 0, endLine: lines.length }];
    }

    const starts = [];
    let scan = 0;
    for (let t = 0; t < items.length; t++) {
        let found = -1;
        while (scan < lines.length) {
            if (isTocHeadingLine(lines[scan].trim())) {
                found = scan;
                scan += 1;
                break;
            }
            scan += 1;
        }
        starts.push(found >= 0 ? found : lines.length);
    }

    return items.map((item, i) => ({
        tocIndex: i,
        id: item.id,
        startLine: starts[i],
        endLine: i + 1 < starts.length && starts[i + 1] < lines.length ? starts[i + 1] : lines.length
    }));
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

/** Meta @core_concept quiz belongs in the first TOC section only. */
export function metaQuizBelongsOnSectionIndex(fullBody, tocIndex) {
    return tocIndex === 0;
}
