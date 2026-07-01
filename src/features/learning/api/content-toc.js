import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { parseContent } from './parser.js';
import { parseArboritoFile } from '../../editor/api/editor-engine.js';
import { tocHeadingTitleForEdit } from './lesson-toc-mutations.js';

/** TOC row text without leading emoji (map title already has its own icon). */
export function tocPlainLineForList(item) {
    if (!item || item.id === 'intro') return (item && item.text) || '';
    const lv = Math.min(6, Math.max(1, item.level || 1));
    const prefix = '#'.repeat(lv);
    return tocHeadingTitleForEdit(`${prefix} ${item.text || ''}`);
}

export function tocLabelForDisplay(raw) {
    if (!raw || typeof raw !== 'string') return '';
    let s = raw
        .replace(/\bLPIC-?\d*\b/gi, '')
        .replace(/\b(certificación|certification)\b/gi, '')
        .replace(/\s*[\u2014\u2013\-]\s*[\u2014\u2013\-]\s*/g, ' — ')
        .replace(/\s{2,}/g, ' ')
        .replace(/^\s*[—–-]\s*|\s*[—–-]\s*$/g, '')
        .trim();
    return s || raw.trim();
}

export function buildTocFromBlocks(blocks) {
    const items = [];
    blocks.forEach((b) => {
        if (b.type === 'h1' || b.type === 'section') {
            items.push({ text: b.text, level: 1, id: b.id, isQuiz: false });
        }
        if (b.type === 'h2' || b.type === 'subsection') {
            items.push({ text: b.text, level: 2, id: b.id, isQuiz: false });
        }
        if (b.type === 'h3') {
            items.push({ text: b.text, level: 3, id: b.id, isQuiz: false });
        }
        if (b.type === 'h4') {
            items.push({ text: b.text, level: 4, id: b.id, isQuiz: false });
        }
        if (b.type === 'h5') {
            items.push({ text: b.text, level: 5, id: b.id, isQuiz: false });
        }
        if (b.type === 'h6') {
            items.push({ text: b.text, level: 6, id: b.id, isQuiz: false });
        }
    });
    return items;
}

export function getToc(currentNode) {
    if (!(currentNode && currentNode.content)) return [];
    const raw = String(currentNode.content);
    const parsed = parseArboritoFile(raw);
    const blocks = parseContent(parsed.body || raw);
    return buildTocFromBlocks(blocks);
}

/** How many toc rows before `tocIdx` share the same block id (for disambiguating duplicate slugs). */
export function tocIdOrdinalBefore(toc, tocIdx) {
    if (tocIdx <= 0 || !toc[tocIdx]) return 0;
    const id = toc[tocIdx].id;
    let n = 0;
    for (let i = 0; i < tocIdx; i++) {
        if (toc[i].id === id) n++;
    }
    return n;
}

/** Nth block in `blocks` with `id` (0-based), or -1 */
function findNthBlockById(blocks, id, ordinal) {
    let seen = 0;
    for (let j = 0; j < blocks.length; j++) {
        if (blocks[j].id === id) {
            if (seen === ordinal) return j;
            seen++;
        }
    }
    return -1;
}

const TOC_ANCHOR_TYPES = new Set([
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'section',
    'subsection',
    'quiz',
    'quiz'
]);

/** When ids are missing or ambiguous, align toc slots to heading blocks in order. */
function anchorBlockIndicesForToc(blocks, toc) {
    const idx = [];
    for (let i = 0; i < blocks.length; i++) {
        if (TOC_ANCHOR_TYPES.has(blocks[i].type)) idx.push(i);
    }
    return idx.length === toc.length ? idx : null;
}

/** Mark TOC rows that contain an evaluation block (quiz). */
export function annotateTocWithQuizSections(blocks, toc) {
    if (!toc.length) return toc;
    return toc.map((item, i) => {
        const slice = getActiveBlocks(blocks, toc, i);
        const hasQuiz = slice.some((b) => b.type === 'quiz');
        return hasQuiz ? { ...item, isQuiz: true } : item;
    });
}

/** Student finished a TOC row: visited + quiz sections need a correct attempt. */
export function isTocSectionCompleted(sectionIndex, toc, blocks, visitedSections, getQuizState) {
    if (!toc.length || sectionIndex < 0 || sectionIndex >= toc.length) return false;
    if (!visitedSections.has(sectionIndex)) return false;
    const item = toc[sectionIndex];
    if (!item?.isQuiz) return true;
    const quizzes = getQuizBlocksForSection(blocks, toc, sectionIndex);
    if (!quizzes.length) return true;
    return quizzes.every((q) => {
        const st = getQuizState(q.id || 'quiz-meta');
        if (!st || !st.finished) return false;
        if (st.correct != null) return !!st.correct;
        if (Array.isArray(st.results) && st.results.length) return st.results.every(Boolean);
        return (st.score || 0) > 0;
    });
}

/** Lesson progress bar: completed sections / total (quiz sections need a correct attempt). */
export function computeLessonProgress(toc, blocks, visitedSections, getQuizState) {
    if (!toc.length) return 0;
    let done = 0;
    for (let i = 0; i < toc.length; i++) {
        if (isTocSectionCompleted(i, toc, blocks, visitedSections, getQuizState)) done += 1;
    }
    return Math.round((done / toc.length) * 100);
}

/** Insert index for synthetic header meta quiz: end of the first TOC section slice. */
export function insertIndexForMetaQuizBlock(blocks, toc) {
    if (!blocks.length) return 0;
    if (!toc.length) return blocks.length;
    const slice = getActiveBlocks(blocks, toc, 0);
    if (!slice.length) return blocks.length;
    const last = slice[slice.length - 1];
    const at = blocks.indexOf(last);
    return at >= 0 ? at + 1 : blocks.length;
}

/** All quiz blocks inside one TOC section (student mini-exam). */
export function getQuizBlocksForSection(blocks, toc, sectionIndex) {
    if (!blocks.length || !toc.length || sectionIndex < 0) return [];
    return getActiveBlocks(blocks, toc, sectionIndex).filter((b) => b.type === 'quiz');
}

/** First section index that contains a quiz (exam intro / start CTA). */
export function findFirstQuizSectionIndex(blocks, toc) {
    if (!blocks.length || !toc.length) return -1;
    const annotated = annotateTocWithQuizSections(blocks, toc);
    const flagged = annotated.findIndex((item) => item.isQuiz);
    if (flagged >= 0) return flagged;
    return findQuizSectionIndex(blocks, toc);
}

/** Index of the TOC section that owns the lesson quiz (footer), or -1 if none. */
function findQuizSectionIndex(blocks, toc) {
    if (!blocks.length || !toc.length) return -1;
    const quizBlock = [...blocks].reverse().find((b) => b.type === 'quiz');
    if (!quizBlock) return -1;
    const quizKey = quizBlock.id || 'quiz';

    for (let i = 0; i < toc.length; i++) {
        const slice = getActiveBlocks(blocks, toc, i);
        if (slice.some((b) => b.type === 'quiz' && (b.id || 'quiz') === quizKey)) return i;
    }

    for (let i = 0; i < toc.length; i++) {
        if (getActiveBlocks(blocks, toc, i).some((b) => b.type === 'quiz')) return i;
    }

    return toc.length - 1;
}

export function getActiveBlocks(blocks, toc, activeSectionIndex) {
    if (!blocks.length) return [];
    if (!toc.length) return blocks;
    const activeItem = toc[activeSectionIndex];
    if (!activeItem) return blocks;
    if (toc.length === 1) return blocks;

    const nextItem = toc[activeSectionIndex + 1];

    const ordStart = tocIdOrdinalBefore(toc, activeSectionIndex);
    let startIndex = findNthBlockById(blocks, activeItem.id, ordStart);

    if (startIndex === -1) {
        const anchors = anchorBlockIndicesForToc(blocks, toc);
        if (anchors) startIndex = anchors[activeSectionIndex];
    }
    if (startIndex === -1) startIndex = 0;

    let endIndex = blocks.length;
    if (nextItem) {
        const ordNext = tocIdOrdinalBefore(toc, activeSectionIndex + 1);
        let nextIndex = findNthBlockById(blocks, nextItem.id, ordNext);
        if (nextIndex === -1) {
            const anchors = anchorBlockIndicesForToc(blocks, toc);
            if (anchors && activeSectionIndex + 1 < anchors.length) nextIndex = anchors[activeSectionIndex + 1];
        }
        if (nextIndex !== -1 && nextIndex > startIndex) endIndex = nextIndex;
    }

    return blocks.slice(startIndex, endIndex);
}

export const PROSE_BLOCK_TYPES = new Set(['p', 'list', 'blockquote', 'code', 'image', 'video', 'audio', 'game']);

export function sectionSliceHasProse(slice) {
    return (slice || []).some((b) => PROSE_BLOCK_TYPES.has(b.type));
}

/** First TOC row that contains readable body content (not only headings). */
export function findFirstSectionWithProse(blocks, toc) {
    if (!toc.length) return 0;
    for (let i = 0; i < toc.length; i++) {
        if (sectionSliceHasProse(getActiveBlocks(blocks, toc, i))) return i;
    }
    return 0;
}

export function getFilteredToc(toc, tocFilter) {
    if (!tocFilter) return toc;
    const q = tocFilter.toLowerCase();
    return toc.filter((item) => item.text.toLowerCase().includes(q));
}
