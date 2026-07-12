/**
 * Lesson quiz / challenge schema completeness (editor badge and construction "game ready").
 */

import { parseArboritoFile } from '../../editor/api/editor-engine.js';
import {
    isQuizChallengeComplete,
    normalizeChallenge,
    findQuizBlocks,
    expandQuizBlock,
    challengeToQuizBlock as schemaChallengeToBlock
} from './quiz-schema.js';
import { getQuizBlocksForSection } from './content-toc.js';
import { extractTocSectionMarkdown } from './lesson-section-slices.js';

export { isQuizChallengeComplete };

function countExpandedQuestions(blocks) {
    let n = 0;
    for (const b of blocks) {
        if (b.type !== 'quiz') continue;
        n += expandQuizBlock(b).length;
    }
    return n;
}

/**
 * Arcade readiness for one TOC section while authoring.
 * @returns {{ status: 'none'|'draft'|'ready', questionCount: number }}
 */
export function getSectionArcadeQuizStatus(bodyMarkdown, blocks, toc, sectionIndex) {
    if (!toc.length || sectionIndex < 0 || sectionIndex >= toc.length) {
        return { status: 'none', questionCount: 0 };
    }
    const quizzes = getQuizBlocksForSection(blocks || [], toc, sectionIndex);
    if (quizzes.length) {
        const questionCount = countExpandedQuestions(quizzes);
        const ready = quizzes.some((b) => isQuizChallengeComplete(b));
        return { status: ready ? 'ready' : 'draft', questionCount };
    }
    const sectionMd = extractTocSectionMarkdown(bodyMarkdown || '', sectionIndex);
    const fenced = findQuizBlocks(sectionMd);
    if (!fenced.length) return { status: 'none', questionCount: 0 };
    const questionCount = fenced.reduce((sum, f) => {
        const items = normalizeChallenge(f.challenge).items;
        return sum + (items.length || 1);
    }, 0);
    const ready = fenced.some((f) => isQuizChallengeComplete(f.challenge));
    return { status: ready ? 'ready' : 'draft', questionCount };
}

/**
 * @param {string} content - lesson .md / arborito file body
 */
export function lessonContentHasCompleteQuiz(content) {
    if (!content) return false;
    return parseAllChallengesFromLessonContent(content).length > 0;
}

/** True when body has at least one complete questionnaire (incl. recall-only). */
export function lessonBodyHasPlayableQuiz(body) {
    if (!body || !String(body).trim()) return false;
    return parseAllChallengesFromLessonContent(body).length > 0;
}

/** @param {string} body */
export function bodyMarkdownHasQuizBlock(body) {
    const b = String(body || '');
    return /^@quiz\s*$/im.test(b) || /data-quiz-block/i.test(b) || /arborito-quiz-edit/i.test(b);
}

/**
 * Unified exam quiz detection (open, intro gate, render).
 * @param {string} bodyMarkdown - lesson body (post parseArboritoFile)
 * @param {object[]} [blocks] - parsed content blocks
 * @returns {{ hasPlayableQuizzes: boolean, hasAnyQuizFence: boolean, questionCount: number }}
 */
export function getExamQuizPresence(bodyMarkdown, blocks = []) {
    const body = String(bodyMarkdown || '');
    const quizBlocks = Array.isArray(blocks) ? blocks.filter((b) => b.type === 'quiz') : [];
    const fenced = findQuizBlocks(body);
    const hasAnyQuizFence =
        fenced.length > 0 || bodyMarkdownHasQuizBlock(body) || quizBlocks.length > 0;

    let questionCount = 0;
    if (quizBlocks.length) {
        questionCount = countExpandedQuestions(quizBlocks);
    } else if (fenced.length) {
        questionCount = fenced.reduce((sum, f) => {
            const items = normalizeChallenge(f.challenge).items;
            return sum + (items.length || 1);
        }, 0);
    }

    const hasPlayableQuizzes =
        quizBlocks.some((b) => isQuizChallengeComplete(b)) ||
        fenced.some((f) => isQuizChallengeComplete(f.challenge)) ||
        parseAllChallengesFromLessonContent(body).length > 0;

    return { hasPlayableQuizzes, hasAnyQuizFence, questionCount };
}

/**
 * Scan body for every complete @quiz block (supports multiple quizzes per lesson).
 * @param {string} content
 * @returns {Array<object>} quiz-shaped blocks with stable ids
 */
export function parseAllChallengesFromLessonContent(content) {
    if (!content) return [];
    const out = [];
    let blockOrdinal = 0;

    const pushIfComplete = (challenge, id) => {
        const c = normalizeChallenge(challenge);
        if (!isQuizChallengeComplete(c)) return;
        out.push(schemaChallengeToBlock(c, id || `quiz-${out.length + 1}`));
    };

    const parsed = parseArboritoFile(content);
    const body = parsed && typeof parsed.body === 'string' ? parsed.body : String(content || '');

    for (const block of findQuizBlocks(body)) {
        blockOrdinal += 1;
        const wrapped = schemaChallengeToBlock(
            normalizeChallenge(block.challenge),
            `quiz-${blockOrdinal}`
        );
        for (const q of expandQuizBlock(wrapped)) {
            pushIfComplete(q, q.id);
        }
    }

    return out;
}

/**
 * Scan a module subtree for lesson quiz completeness (in-memory content only).
 * @param {object|null|undefined} rootNode, branch, root, or leaf
 * @returns {{ totalLeaves: number, withCompleteQuiz: number, uncheckedLeaves: number, staticReady: boolean }}
 */
export function getModuleStaticGameReadiness(rootNode) {
    const stats = { totalLeaves: 0, withCompleteQuiz: 0, uncheckedLeaves: 0, staticReady: false };
    if (!rootNode) return stats;
    const walk = (n) => {
        if (!n) return;
        if (n.type === 'leaf' || n.type === 'exam') {
            stats.totalLeaves += 1;
            const body = n.content;
            if (!body || !String(body).trim()) {
                stats.uncheckedLeaves += 1;
                return;
            }
            if (lessonBodyHasPlayableQuiz(body)) {
                stats.withCompleteQuiz += 1;
            }
        } else if (n.type === 'branch' || n.type === 'root') {
            if (n.children) n.children.forEach(walk);
        }
    };
    walk(rootNode);
    stats.staticReady = stats.withCompleteQuiz > 0;
    return stats;
}
