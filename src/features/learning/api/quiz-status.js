/**
 * Lesson quiz / challenge schema completeness (editor badge and construction "game ready").
 */

import { parseArboritoFile } from '../../editor/api/editor-engine.js';
import {
    isQuizChallengeComplete,
    normalizeChallenge,
    findQuizBlocks,
    challengeToQuizBlock as schemaChallengeToBlock
} from './quiz-schema.js';
import { getQuizBlocksForSection } from './content-toc.js';
import { extractTocSectionMarkdown } from './lesson-section-slices.js';

export { isQuizChallengeComplete };

/**
 * Arcade readiness for one TOC section while authoring.
 * @returns {'none'|'draft'|'ready'}
 */
export function getSectionArcadeQuizStatus(bodyMarkdown, blocks, toc, sectionIndex) {
    if (!toc.length || sectionIndex < 0 || sectionIndex >= toc.length) return 'none';
    const quizzes = getQuizBlocksForSection(blocks || [], toc, sectionIndex);
    if (quizzes.length) {
        const ready = quizzes.some((b) => isQuizChallengeComplete(b));
        return ready ? 'ready' : 'draft';
    }
    const sectionMd = extractTocSectionMarkdown(bodyMarkdown || '', sectionIndex);
    const fenced = findQuizBlocks(sectionMd);
    if (!fenced.length) return 'none';
    const ready = fenced.some((f) => isQuizChallengeComplete(f.challenge));
    return ready ? 'ready' : 'draft';
}

/**
 * @param {string} content - lesson .md / arborito file body
 */
export function lessonContentHasCompleteQuiz(content) {
    if (!content) return false;
    if (parseAllChallengesFromLessonContent(content).length > 0) return true;
    const { meta } = parseArboritoFile(content);
    return isQuizChallengeComplete(meta.challenge);
}

/** True when body has at least one complete questionnaire (incl. recall-only). */
export function lessonBodyHasPlayableQuiz(body) {
    if (!body || !String(body).trim()) return false;
    return lessonContentHasCompleteQuiz(body) || parseAllChallengesFromLessonContent(body).length > 0;
}

/** @param {string} body */
export function bodyMarkdownHasQuizBlock(body) {
    const b = String(body || '');
    return /^@quiz\s*$/im.test(b) || /data-quiz-block/i.test(b) || /arborito-quiz-edit/i.test(b);
}

/**
 * Renderer block for read mode when quiz lives in file metadata.
 * @param {string} fullContent
 * @returns {object|null}
 */
export function getQuizRenderBlockFromContent(fullContent) {
    if (!fullContent) return null;
    const { meta } = parseArboritoFile(fullContent);
    const c = meta && meta.challenge;
    if (!isQuizChallengeComplete(c)) return null;
    return { ...schemaChallengeToBlock(normalizeChallenge(c), 'quiz-meta') };
}

/**
 * Scan body/meta for every complete @quiz block (supports multiple quizzes per lesson).
 * @param {string} content
 * @returns {Array<object>} quiz-shaped blocks with stable ids
 */
export function parseAllChallengesFromLessonContent(content) {
    if (!content) return [];
    const out = [];
    let ordinal = 0;

    const pushIfComplete = (challenge) => {
        if (!isQuizChallengeComplete(challenge)) return;
        ordinal += 1;
        out.push(schemaChallengeToBlock(normalizeChallenge(challenge), `quiz-${ordinal}`));
    };

    const parsed = parseArboritoFile(content);
    const meta = parsed && parsed.meta;
    const body = parsed && typeof parsed.body === 'string' ? parsed.body : '';
    const metaC = meta && meta.challenge;
    if (metaC && isQuizChallengeComplete(metaC)) {
        pushIfComplete(metaC);
    }

    /* Scan the body for additional fenced @quiz blocks. The header challenge
       (if any) was already pushed above, so we look only at the body to avoid
       duplicates when authors keep the questionnaire in the file header. */
    for (const block of findQuizBlocks(body)) {
        pushIfComplete(block.challenge);
    }

    return out;
}

/**
 * Scan a module subtree for lesson quiz completeness (in-memory content only).
 * @param {object|null|undefined} rootNode — branch, root, or leaf
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
