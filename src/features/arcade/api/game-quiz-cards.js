/**
 * Canonical quiz-card building for Arcade cartridges.
 *
 * Runs in the HOST (not inside the game iframe) and is exposed to cartridges
 * through `window.__ARBORITO_GAME_BRIDGE__.quizModes`. The injected SDK
 * (`game-sdk-quiz.js`) delegates here, so mode rules live in exactly one
 * place: `quiz-schema.js` + this file. Cards are plain JSON-safe objects.
 */

import {
    getPlayableModes,
    isQuizChallengeComplete,
    normalizeChallenge,
    pickStudyQuizMode,
    challengeForPlay,
    QUIZ_MODE_CHIPS,
    QUIZ_MODE_CLOZE,
    QUIZ_MODE_MULTIPLE,
    QUIZ_MODE_RECALL,
    QUIZ_MODE_STEPS,
    tokenizeQuizAnswerChips
} from '../../learning/api/quiz-schema.js';
import { normalizeClozeToken, splitClozeDisplayWord } from '../../learning/api/quiz-player.js';

const MODE_PROMPTS = {
    ES: {
        recall: (concept) => `¿Qué es «${concept}»?`,
        chips: (concept) => `Ordena las palabras para «${concept}».`,
        steps: () => 'Ordena los pasos correctamente.'
    },
    EN: {
        recall: (concept) => `What is «${concept}»?`,
        chips: (concept) => `Order the words for «${concept}».`,
        steps: () => 'Order the steps correctly.'
    }
};

function tokenizeWords(text) {
    return tokenizeQuizAnswerChips(text);
}

function shuffle(list) {
    const arr = [...list];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/** Empty / punctuation placeholders that must never appear as MC answers. */
function isJunkOptionLabel(text) {
    const t = String(text || '').trim();
    if (!t) return true;
    return (
        t === ':' ||
        t === ': ' ||
        t === '—' ||
        t === '-' ||
        t === '–' ||
        t === '…' ||
        t === '...' ||
        t === '___' ||
        t === '______' ||
        t === 'N/A' ||
        t === 'Unknown'
    );
}

function padWrongLabel(index, lang) {
    const n = Math.max(1, index);
    return String(lang || 'EN').toUpperCase() === 'ES' ? `Incorrecto ${n}` : `Wrong ${n}`;
}

/**
 * Multiple-choice pool: correct + real distractors, never blank colon pads.
 * @param {string} correct
 * @param {string[]} wrongPool
 * @param {number} count
 * @param {{ lang?: string, extraWrong?: string[] }} [opts]
 */
function buildOptionsPool(correct, wrongPool, count, opts = {}) {
    const lang = opts.lang || 'EN';
    const seen = new Set();
    const out = [];
    const c = String(correct || '').trim();
    if (c && !isJunkOptionLabel(c)) {
        out.push(c);
        seen.add(c.toLowerCase());
    }
    const merged = [...(wrongPool || []), ...(opts.extraWrong || [])];
    for (const raw of merged) {
        const t = String(raw || '').trim();
        if (isJunkOptionLabel(t)) continue;
        if (out.length >= count) break;
        const k = t.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(t);
    }
    // Need at least two choices; use readable pads, never ": " / "—".
    let padN = 1;
    while (out.length < Math.min(2, count) && c && padN <= 12) {
        const label = padWrongLabel(padN++, lang);
        const k = label.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(label);
    }
    return shuffle(out);
}

function buildClozeView(c) {
    const words = tokenizeWords(c.short_definition);
    const idxs = c.cloze_indices || [];
    const blankSet = new Set(idxs.filter((n) => Number.isInteger(n) && n >= 0 && n < words.length));
    const primaryIdx = idxs.length ? idxs[0] : -1;
    const rawBlank =
        (primaryIdx >= 0 && words[primaryIdx]) || String(c.correct_answer || '').trim();
    const blankWord = normalizeClozeToken(rawBlank) || String(c.correct_answer || '').trim();
    const display = words
        .map((w, i) => {
            if (!blankSet.has(i)) return w;
            const { lead, trail } = splitClozeDisplayWord(w);
            return `${lead}______${trail}`;
        })
        .join(' ');
    return { display, blankWord };
}

function distractorWordsExcept(text, exclude, limit = 3) {
    const ex = normalizeClozeToken(exclude);
    return tokenizeWords(text)
        .map((w) => normalizeClozeToken(w))
        .filter((w) => w && w !== ex && w.length > 1)
        .slice(0, limit);
}

/** Cloze/steps cards: show the authored question before the interactive prompt. */
function questionWithMainPrompt(mainQuestion, body, lang) {
    const mq = String(mainQuestion || '').trim();
    const bodyText = String(body || '').trim();
    if (!mq) return bodyText;
    if (!bodyText || bodyText === mq) return mq;
    return `${mq}\n\n${bodyText}`;
}

function orderingQuestion(mainQuestion, kind, lang, concept) {
    const mq = String(mainQuestion || '').trim();
    const prompts = MODE_PROMPTS[lang] || MODE_PROMPTS.EN;
    if (!mq) return prompts[kind](concept);
    if (kind === 'chips') {
        return lang === 'EN' ? `Order the words to answer: ${mq}` : `Ordena las palabras para responder: ${mq}`;
    }
    return lang === 'EN' ? `Order the steps to answer: ${mq}` : `Ordena los pasos para responder: ${mq}`;
}

/**
 * Build one playing card for a specific mode, or null when the mode is not
 * playable for this challenge.
 * @param {object} challenge
 * @param {string} mode
 * @param {{ lang?: string, lessonTitle?: string, optionCount?: number, distractorPool?: string[] }} [opts]
 */
export function buildQuizModeCard(challenge, mode, opts = {}) {
    const c = challengeForPlay(challenge);
    if (!getPlayableModes(c).includes(mode)) return null;
    const lang = String(opts.lang || 'EN').toUpperCase();
    const prompts = MODE_PROMPTS[lang] || MODE_PROMPTS.EN;
    const optionCount = Math.max(2, Math.min(Number(opts.optionCount) || 4, 6));
    const concept = c.core_concept || String(opts.lessonTitle || '') || 'Concept';
    const poolOpts = {
        lang,
        extraWrong: Array.isArray(opts.distractorPool) ? opts.distractorPool : []
    };

    switch (mode) {
        case QUIZ_MODE_MULTIPLE: {
            const wrong = [...c.traps];
            if (c.short_definition && c.short_definition !== c.correct_answer) wrong.push(c.short_definition);
            return {
                mode,
                concept,
                question: c.main_question,
                correct: c.correct_answer,
                options: buildOptionsPool(c.correct_answer, wrong, optionCount, poolOpts)
            };
        }
        case QUIZ_MODE_RECALL: {
            const wrong = [...c.traps];
            if (c.short_definition && c.short_definition !== c.correct_answer) wrong.push(c.short_definition);
            return {
                mode,
                concept,
                question: prompts.recall(concept),
                correct: c.correct_answer,
                options: buildOptionsPool(c.correct_answer, wrong, optionCount, poolOpts)
            };
        }
        case QUIZ_MODE_CLOZE: {
            const view = buildClozeView(c);
            const wrong = [...c.traps, ...distractorWordsExcept(c.short_definition, view.blankWord)];
            return {
                mode,
                concept,
                question: questionWithMainPrompt(c.main_question, view.display, lang),
                correct: view.blankWord,
                options: buildOptionsPool(view.blankWord, wrong, optionCount, poolOpts),
                clozeDisplay: view.display,
                blankWord: view.blankWord
            };
        }
        case QUIZ_MODE_CHIPS: {
            const words = tokenizeWords(c.correct_answer);
            return {
                mode,
                concept,
                question: orderingQuestion(c.main_question, 'chips', lang, concept),
                correct: words.join(' '),
                sequence: words,
                chips: shuffle(words)
            };
        }
        case QUIZ_MODE_STEPS: {
            const steps = [...c.steps];
            return {
                mode,
                concept,
                question: orderingQuestion(c.main_question, 'steps', lang, concept),
                correct: steps.join(' → '),
                sequence: steps,
                chips: shuffle(steps)
            };
        }
        default:
            return null;
    }
}

/**
 * Pick a mode and build its card.
 * Empty / `0` salt re-rolls among playable modes (lesson first open).
 * Pass a stable non-zero salt (e.g. round id) when the cartridge must keep the same mode.
 * @param {object} challenge
 * @param {string} blockId
 * @param {{ lang?: string, lessonTitle?: string, optionCount?: number, salt?: string }} [opts]
 */
export function buildQuizStudyCard(challenge, blockId, opts = {}) {
    const playable = getPlayableModes(normalizeChallenge(challenge));
    if (!playable.length) return null;
    let picked = pickStudyQuizMode(challenge, blockId, String(opts.salt || ''));
    if (!playable.includes(picked)) picked = playable[0];
    return buildQuizModeCard(challenge, picked, opts);
}

/**
 * Bridge surface consumed by the injected game SDK (`bridge.quizModes`).
 * Everything is synchronous and JSON-safe.
 */
export function buildQuizModesBridge() {
    return {
        isComplete: (challenge) => isQuizChallengeComplete(challenge),
        challengeForPlay: (challenge) => challengeForPlay(challenge),
        playable: (challenge) => getPlayableModes(normalizeChallenge(challenge)),
        isPlayable: (challenge, mode) =>
            getPlayableModes(normalizeChallenge(challenge)).includes(String(mode || '')),
        pick: (challenge, blockId, salt) => {
            const playable = getPlayableModes(normalizeChallenge(challenge));
            if (!playable.length) return QUIZ_MODE_MULTIPLE;
            const picked = pickStudyQuizMode(challenge, blockId, String(salt || ''));
            return playable.includes(picked) ? picked : playable[0];
        },
        buildCard: (challenge, mode, opts) => buildQuizModeCard(challenge, mode, opts),
        buildStudyCard: (challenge, blockId, opts) => buildQuizStudyCard(challenge, blockId, opts)
    };
}
