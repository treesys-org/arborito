/**
 * Quiz V2 / challenge schema completeness (shared by editor badge and construction "game ready").
 */

import { parseArboritoFile } from './editor-engine.js';
import {
    isQuizV2ChallengeComplete,
    normalizeChallenge,
    applyChallengeMetaLine,
    CHALLENGE_EXTRA_KEYS,
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
    return /@core_concept:/i.test(b) || /data-quizv2-block/i.test(b) || /arborito-quizv2-edit/i.test(b);
}

/**
 * Renderer block for read mode when quiz lives in file metadata (@core_concept header).
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
 * Walk raw graph language tree for at least one leaf with a complete quiz.
 * @param {object|null|undefined} rawGraph
 * @param {string} [lang]
 */
export function treeHasGameReadyQuiz(rawGraph, lang = 'EN') {
    if (!rawGraph || !rawGraph.languages) return false;
    const root = rawGraph.languages[lang] || rawGraph.languages[Object.keys(rawGraph.languages)[0]];
    if (!root) return false;
    let found = false;
    const walk = (n) => {
        if (found || !n) return;
        if ((n.type === 'leaf' || n.type === 'exam') && lessonBodyHasPlayableQuiz(n.content)) {
            found = true;
            return;
        }
        if (n.children) n.children.forEach(walk);
    };
    walk(root);
    return found;
}

/**
 * @param {string} content
 * @returns {object|null}
 */
const CHALLENGE_LINE_KEYS = new Set([
    'core_concept',
    'short_definition',
    'main_question',
    'correct_answer',
    'trap',
    ...CHALLENGE_EXTRA_KEYS
]);

function newChallengeDraft() {
    return normalizeChallenge(null);
}

function applyChallengeLine(challenge, key, val) {
    if (!challenge) return;
    if (CHALLENGE_EXTRA_KEYS.has(key)) {
        applyChallengeMetaLine(challenge, key, val);
        return;
    }
    if (key === 'trap') {
        if (val) challenge.traps.push(val);
    } else {
        challenge[key] = val;
    }
}

/**
 * Scan body/meta for every complete @core_concept … @trap group (supports multiple quizzes per lesson).
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

    const { meta } = parseArboritoFile(content);
    const metaC = meta && meta.challenge;
    if (metaC && isQuizV2ChallengeComplete(metaC)) {
        pushIfComplete(metaC);
    }

    let draft = null;
    for (const line of String(content).split('\n')) {
        const trim = line.trim();
        if (!trim.startsWith('@')) continue;
        const idx = trim.indexOf(':');
        if (idx === -1) continue;
        const key = trim.substring(1, idx).trim().toLowerCase();
        const val = trim.substring(idx + 1).trim();
        if (!CHALLENGE_LINE_KEYS.has(key)) continue;

        if (key === 'core_concept') {
            if (draft) pushIfComplete(draft);
            draft = newChallengeDraft();
            draft.core_concept = val;
            continue;
        }
        if (!draft) draft = newChallengeDraft();
        applyChallengeLine(draft, key, val);
    }
    if (draft) pushIfComplete(draft);

    return out;
}

export function parseChallengeFromLessonContent(content) {
    const all = parseAllChallengesFromLessonContent(content);
    if (!all.length) return null;
    const first = all[0];
    return {
        core_concept: first.core_concept,
        short_definition: first.short_definition,
        main_question: first.main_question,
        correct_answer: first.correct_answer,
        traps: Array.isArray(first.traps) ? [...first.traps] : []
    };
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
