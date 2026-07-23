import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { parseContent } from './parser.js';
import { parseArboritoFile } from '../../editor/api/editor-engine.js';
import { tocHeadingTitleForEdit } from './lesson-toc-mutations.js';
import { expandQuizBlock, expandAllQuizQuestions, findQuizBlocks } from './quiz-schema.js';
import { findTocIndexForBodyLine } from './lesson-section-slices.js';
import {
    isSyntheticIntroItem,
    SYNTHETIC_INTRO_ID,
    bodyHasOutlinePathIds,
    collectSyllabusTocItems,
} from './lesson-syllabus.js';
import { didPassQuizSession, resolveQuizPassRate } from './quiz-pass.js';

/** TOC row text without leading emoji (map title already has its own icon). */
export function tocPlainLineForList(item) {
    if (!item || isSyntheticIntroItem(item)) return (item && item.text) || '';
    return tocHeadingTitleForEdit(String(item.text || ''));
}

export function tocLabelForDisplay(raw) {
    if (!raw || typeof raw !== 'string') return '';
    let s = raw
        .replace(/\bLPIC-?\d*\b/gi, '')
        .replace(/\b(certificación|certification)\b/gi, '')
        .replace(/\s*[\u2014\u2013\-]\s*[\u2014\u2013\-]\s*/g, ', ')
        .replace(/\s{2,}/g, ' ')
        .replace(/^\s*[—–-]\s*|\s*[—–-]\s*$/g, '')
        .trim();
    return s || raw.trim();
}

export function buildTocFromBlocks(blocks, { bodyHasPaths = false } = {}) {
    return collectSyllabusTocItems(blocks, { bodyHasPaths });
}

export function getToc(currentNode) {
    if (!(currentNode && currentNode.content)) return [];
    const raw = String(currentNode.content);
    const parsed = parseArboritoFile(raw);
    const body = parsed.body || raw;
    const blocks = parseContent(body);
    const toc = buildTocFromBlocks(blocks, {
        bodyHasPaths: bodyHasOutlinePathIds(body),
    });
    if (!toc.length && String(body || '').trim()) {
        return [
            {
                text: 'Introduction',
                level: 1,
                id: SYNTHETIC_INTRO_ID,
                isQuiz: false,
                synthetic: true,
            },
        ];
    }
    return toc;
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
        const quizBlocks = slice.filter((b) => b.type === 'quiz');
        if (!quizBlocks.length) return item;
        const proseOnly = slice.some((b) => PROSE_BLOCK_TYPES.has(b.type));
        return {
            ...item,
            isQuiz: true,
            kind: proseOnly ? 'quiz-mixed' : 'quiz',
        };
    });
}

export const EXAM_FINAL_TOC_ID = 'exam-final';

/** Synthetic TOC row appended to exam nodes for the pass/fail summary screen. */
export function appendExamFinalTocItem(toc, isExam) {
    if (!isExam || !toc.length) return toc;
    if (toc.some((item) => item.id === EXAM_FINAL_TOC_ID)) return toc;
    return [
        ...toc,
        {
            id: EXAM_FINAL_TOC_ID,
            text: '__exam_final__',
            level: 1,
            isQuiz: false,
            kind: 'exam-final',
        },
    ];
}

/** Every expanded @quiz question in an exam node has been answered (pass or fail). */
export function areAllExamQuestionsFinished(blocks, getQuizState) {
    const ids = getExpandedQuestionIdsForExam(blocks);
    if (!ids.length) return false;
    return ids.every((qid) => {
        const st = getQuizState(qid);
        return !!(st && st.finished);
    });
}

/** Quiz gating for one TOC section (linear unlock / exam progress). */
export function isSectionQuizSatisfied(sectionIndex, blocks, toc, getQuizState, opts = {}) {
    const requireCorrect = opts.requireCorrect !== false;
    const quizzes = getQuizBlocksForSection(blocks, toc, sectionIndex);
    if (!quizzes.length) return true;
    for (const block of quizzes) {
        const ids = expandQuizBlock(block).map((q) => q.id || 'quiz');
        if (!ids.length) continue;
        if (!ids.every((qid) => getQuizState(qid).finished)) return false;
        if (!requireCorrect) continue;
        const passRate = resolveQuizPassRate(block);
        if (!didPassQuizSession(ids, (id) => getQuizState(id), passRate)) return false;
    }
    return true;
}

/**
 * Section done for navigation / progress (quizzes answered; prose visited when no quiz).
 * Differs from {@link isTocSectionCompleted} during an exam attempt: ticks stay hidden until submit.
 */
export function isTocSectionProgressDone(
    sectionIndex,
    toc,
    blocks,
    visitedSections,
    getQuizState,
    opts = {}
) {
    if (!toc.length || sectionIndex < 0 || sectionIndex >= toc.length) return false;
    if (opts.isExam && !opts.examStarted) return false;
    if (isExamFinalSectionIndex(toc, sectionIndex)) {
        return !!opts.examShowResults && areAllExamQuestionsFinished(blocks, getQuizState);
    }
    const questionIds = getExpandedQuestionIdsForSection(blocks, toc, sectionIndex);
    const quizSatisfied = isSectionQuizSatisfied(sectionIndex, blocks, toc, getQuizState, opts);
    if (questionIds.length > 0) {
        /* Exams: every question must be finished. Lessons: visit is enough; quiz is optional. */
        if (opts.isExam) return quizSatisfied;
        if (quizSatisfied) return true;
        return visitedSections.has(sectionIndex);
    }
    if (!visitedSections.has(sectionIndex)) return false;
    return true;
}

export function isExamFinalSectionIndex(toc, idx) {
    return idx >= 0 && idx < toc.length && toc[idx]?.id === EXAM_FINAL_TOC_ID;
}

/** TOC rows that map to authored lesson content (excludes synthetic exam-final). */
export function getContentTocLength(toc) {
    if (!toc.length) return 0;
    return toc.filter((item) => item.id !== EXAM_FINAL_TOC_ID).length;
}

/** @param {{ examStarted?: boolean, examShowResults?: boolean }} examState */
export function buildExamSectionOpts(examState = {}) {
    return {
        isExam: true,
        examStarted: !!examState.examStarted,
        examShowResults: !!examState.examShowResults,
        requireCorrect: false,
    };
}

export function getTocAccess(isExam, examStarted) {
    if (!isExam) return 'all';
    if (!examStarted) return 'firstOnly';
    return 'all';
}

/** @param {{ requireCorrect?: boolean, examStarted?: boolean, examShowResults?: boolean }} [opts] */
export function isTocSectionCompleted(
    sectionIndex,
    toc,
    blocks,
    visitedSections,
    getQuizState,
    opts = {}
) {
    if (!toc.length || sectionIndex < 0 || sectionIndex >= toc.length) return false;
    if (isExamFinalSectionIndex(toc, sectionIndex)) {
        return !!opts.examShowResults && areAllExamQuestionsFinished(blocks, getQuizState);
    }
    return isTocSectionProgressDone(sectionIndex, toc, blocks, visitedSections, getQuizState, opts);
}

/** Whether a section still has unanswered / unsatisfied quiz questions. */
export function sectionHasIncompleteQuiz(sectionIndex, blocks, toc, getQuizState, opts = {}) {
    const questionIds = getExpandedQuestionIdsForSection(blocks, toc, sectionIndex);
    if (!questionIds.length) return false;
    return !isSectionQuizSatisfied(sectionIndex, blocks, toc, getQuizState, opts);
}

/** First incomplete TOC row from top to bottom (skips completed sections). */
export function findFirstIncompleteSectionIndex(
    toc,
    blocks,
    visitedSections,
    getQuizState,
    opts = {}
) {
    if (!toc.length) return -1;
    const contentLen = getContentTocLength(toc);
    for (let i = 0; i < contentLen; i++) {
        if (!isTocSectionProgressDone(i, toc, blocks, visitedSections, getQuizState, opts)) return i;
    }
    return -1;
}

/** Lesson progress bar: completed sections / total. */
export function computeLessonProgress(toc, blocks, visitedSections, getQuizState, opts = {}) {
    const contentLen = getContentTocLength(toc);
    if (!contentLen) return 0;
    let done = 0;
    for (let i = 0; i < contentLen; i++) {
        if (isTocSectionProgressDone(i, toc, blocks, visitedSections, getQuizState, opts)) done += 1;
    }
    return Math.round((done / contentLen) * 100);
}

/** All @quiz blocks in document order. */
export function getAllQuizBlocks(blocks) {
    if (!Array.isArray(blocks)) return [];
    return blocks.filter((b) => b.type === 'quiz');
}

/** Session key for one @quiz block within a section. */
export function makeBlockSessionKey(nodeId, sectionIndex, blockId) {
    return `${nodeId ?? ''}:${sectionIndex}:${blockId || 'quiz'}`;
}

/** Expanded question ids for a single @quiz block (items[] flattened). */
export function getExpandedQuestionIdsForQuizBlock(block) {
    if (!block || block.type !== 'quiz') return [];
    return expandQuizBlock(block).map((q) => q.id || 'quiz');
}

/** Expanded question blocks for a single @quiz block. */
export function getExpandedQuestionsForQuizBlock(block) {
    if (!block || block.type !== 'quiz') return [];
    return expandQuizBlock(block);
}

/** Whether a TOC row is clickable under the current access mode. */
export function isTocSectionAccessible(access, idx, toc, blocks, visitedSections, getQuizState, opts = {}) {
    if (!toc.length || idx < 0 || idx >= toc.length) return false;
    if (isExamFinalSectionIndex(toc, idx)) {
        if (!opts.examStarted) return false;
        return areAllExamQuestionsFinished(blocks, getQuizState);
    }
    if (access === 'all') return true;
    if (access === 'firstOnly') return idx === 0;
    if (idx === 0) return true;
    for (let i = 0; i < idx; i++) {
        if (!isTocSectionProgressDone(i, toc, blocks, visitedSections, getQuizState, opts)) return false;
    }
    return true;
}

/** Expanded question ids for one TOC section (items[] flattened). */
export function getExpandedQuestionIdsForSection(blocks, toc, sectionIndex) {
    const quizzes = getQuizBlocksForSection(blocks, toc, sectionIndex);
    const ids = [];
    for (const b of quizzes) {
        for (const q of expandQuizBlock(b)) ids.push(q.id || 'quiz');
    }
    return ids;
}

/** Expanded question blocks for one TOC section. */
export function getExpandedQuestionsForSection(blocks, toc, sectionIndex) {
    const quizzes = getQuizBlocksForSection(blocks, toc, sectionIndex);
    const out = [];
    for (const b of quizzes) out.push(...expandQuizBlock(b));
    return out;
}

/** Expanded question ids for an entire exam node. */
export function getExpandedQuestionIdsForExam(blocks) {
    return expandAllQuizQuestions(blocks).map((q) => q.id || 'quiz');
}

/** All quiz blocks inside one TOC section. */
export function getQuizBlocksForSection(blocks, toc, sectionIndex) {
    if (!blocks.length || !toc.length || sectionIndex < 0) return [];
    return getActiveBlocks(blocks, toc, sectionIndex).filter((b) => b.type === 'quiz');
}

/** First section index that contains a quiz (exam intro / start CTA). */
export function findFirstQuizSectionIndex(blocks, toc, bodyMarkdown = '') {
    const body = String(bodyMarkdown || '');
    if (body && toc.length) {
        const fenced = findQuizBlocks(body);
        if (fenced.length) {
            const fromBody = findTocIndexForBodyLine(body, fenced[0].startLine);
            if (fromBody >= 0 && fromBody < toc.length) return fromBody;
        }
    }
    if (!blocks.length || !toc.length) return -1;
    const annotated = annotateTocWithQuizSections(blocks, toc);
    const flagged = annotated.findIndex((item) => item.isQuiz);
    if (flagged >= 0) return flagged;
    return findQuizSectionIndex(blocks, toc);
}

/** Index of the TOC section that contains a quiz block, or -1 if none. */
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
    if (isExamFinalSectionIndex(toc, activeSectionIndex)) return [];
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

export const PROSE_BLOCK_TYPES = new Set([
    'p',
    'list',
    'blockquote',
    'code',
    'table',
    'image',
    'video',
    'audio',
    'game',
]);

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
