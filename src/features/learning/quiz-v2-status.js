/**
 * Quiz V2 / challenge schema completeness (shared by editor badge and construction "game ready").
 */

import { parseArboritoFile } from '../editor/editor-engine.js';
import {
    isQuizV2ChallengeComplete,
    normalizeChallenge,
    findQuizBlocks,
    challengeToQuizBlock as schemaChallengeToBlock
} from './quiz-v2-schema.js';

export { isQuizV2ChallengeComplete };

/**
 * @param {string} content - lesson .md / arborito file body
 */
export function lessonContentHasCompleteQuiz(content) {
    if (!content) return false;
    if (parseAllChallengesFromLessonContent(content).length > 0) return true;
    const { meta } = parseArboritoFile(content);
    return isQuizV2ChallengeComplete(meta.challenge);
}

/** True when body has at least one complete questionnaire (incl. recall-only). */
export function lessonBodyHasPlayableQuiz(body) {
    if (!body || !String(body).trim()) return false;
    return lessonContentHasCompleteQuiz(body) || parseAllChallengesFromLessonContent(body).length > 0;
}

/** @param {string} body */
export function bodyMarkdownHasQuizV2Block(body) {
    const b = String(body || '');
    return /^@quiz\s*$/im.test(b) || /data-quizv2-block/i.test(b) || /arborito-quizv2-edit/i.test(b);
}

/**
 * Renderer block for read mode when quiz lives in file metadata.
 * @param {string} fullContent
 * @returns {object|null}
 */
export function getQuizV2RenderBlockFromContent(fullContent) {
    if (!fullContent) return null;
    const { meta } = parseArboritoFile(fullContent);
    const c = meta && meta.challenge;
    if (!isQuizV2ChallengeComplete(c)) return null;
    return { ...schemaChallengeToBlock(normalizeChallenge(c), 'quiz-v2-meta') };
}

/**
 * Scan body/meta for every complete @quiz block (supports multiple quizzes per lesson).
 * @param {string} content
 * @returns {Array<object>} quizv2-shaped blocks with stable ids
 */
export function parseAllChallengesFromLessonContent(content) {
    if (!content) return [];
    const out = [];
    let ordinal = 0;

    const pushIfComplete = (challenge) => {
        if (!isQuizV2ChallengeComplete(challenge)) return;
        ordinal += 1;
        out.push(schemaChallengeToBlock(normalizeChallenge(challenge), `quiz-v2-${ordinal}`));
    };

    const parsed = parseArboritoFile(content);
    const meta = parsed && parsed.meta;
    const body = parsed && typeof parsed.body === 'string' ? parsed.body : '';
    const metaC = meta && meta.challenge;
    if (metaC && isQuizV2ChallengeComplete(metaC)) {
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
 * Scan a module subtree for Quiz V2 completeness (in-memory content only).
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
