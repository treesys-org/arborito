/**
 * Quiz V2 challenge schema (authoring + student modes).
 * Based on EJEMPLO QUIZ: cloze, multiple choice, recall, chip order, step order.
 */

export const QUIZ_MODE_CLOZE = 'cloze';
export const QUIZ_MODE_MULTIPLE = 'multiple';
export const QUIZ_MODE_RECALL = 'recall';
export const QUIZ_MODE_CHIPS = 'chips';
export const QUIZ_MODE_STEPS = 'steps';

export const ALL_QUIZ_MODES = [
    QUIZ_MODE_CLOZE,
    QUIZ_MODE_MULTIPLE,
    QUIZ_MODE_RECALL,
    QUIZ_MODE_CHIPS,
    QUIZ_MODE_STEPS
];

/** @returns {import('./quiz-v2-schema.js').QuizChallenge} */
export function emptyChallenge() {
    return {
        core_concept: '',
        short_definition: '',
        main_question: '',
        correct_answer: '',
        traps: [],
        cloze_indices: [],
        answer_mode: 'chips',
        steps: [],
        modes: [...ALL_QUIZ_MODES],
        skip_multiple: false,
        skip_ordering: false
    };
}

/**
 * @param {object|null|undefined} raw
 * @returns {import('./quiz-v2-schema.js').QuizChallenge}
 */
export function normalizeChallenge(raw) {
    const c = emptyChallenge();
    if (!raw || typeof raw !== 'object') return c;
    c.core_concept = String(raw.core_concept || '').trim();
    c.short_definition = String(raw.short_definition || '').trim();
    c.main_question = String(raw.main_question || '').trim();
    c.correct_answer = String(raw.correct_answer || '').trim();
    c.traps = Array.isArray(raw.traps) ? raw.traps.map((t) => String(t || '').trim()).filter(Boolean) : [];
    c.cloze_indices = Array.isArray(raw.cloze_indices)
        ? raw.cloze_indices.map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n))
        : [];
    c.answer_mode = raw.answer_mode === 'steps' ? 'steps' : 'chips';
    c.steps = Array.isArray(raw.steps) ? raw.steps.map((s) => String(s || '').trim()).filter(Boolean) : [];
    c.skip_multiple = !!raw.skip_multiple;
    c.skip_ordering = !!raw.skip_ordering;
    if (Array.isArray(raw.modes) && raw.modes.length) {
        c.modes = raw.modes.filter((m) => ALL_QUIZ_MODES.includes(m));
    } else if (typeof raw.modes === 'string' && raw.modes.trim()) {
        c.modes = raw.modes
            .split(/[,|]/)
            .map((s) => s.trim())
            .filter((m) => ALL_QUIZ_MODES.includes(m));
    }
    return c;
}

/** @param {import('./quiz-v2-schema.js').QuizChallenge} c */
export function modeIsPlayable(c, mode) {
    switch (mode) {
        case QUIZ_MODE_CLOZE:
            return !!(c.short_definition && c.cloze_indices.length > 0);
        case QUIZ_MODE_MULTIPLE:
            return !!(c.main_question && c.correct_answer && c.traps.length > 0 && !c.skip_multiple);
        case QUIZ_MODE_RECALL:
            return !!(c.core_concept && c.correct_answer);
        case QUIZ_MODE_CHIPS:
            return !!(c.correct_answer && c.correct_answer.trim().includes(' ') && !c.skip_ordering);
        case QUIZ_MODE_STEPS:
            return !!(c.steps.length >= 2 && c.answer_mode === 'steps' && !c.skip_ordering);
        default:
            return false;
    }
}

/** @param {import('./quiz-v2-schema.js').QuizChallenge} c */
export function getPlayableModes(c) {
    const n = normalizeChallenge(c);
    const derived = ALL_QUIZ_MODES.filter((m) => modeIsPlayable(n, m));
    if (n.modes && n.modes.length) {
        return derived.filter((m) => n.modes.includes(m));
    }
    return derived;
}

/** @param {object|null|undefined} challenge */
export function isQuizV2ChallengeComplete(challenge) {
    const c = normalizeChallenge(challenge);
    if (!c.core_concept || !c.short_definition || !c.correct_answer) return false;
    return getPlayableModes(c).length > 0;
}

/**
 * Stable-ish pick for student view (per block id + optional salt).
 * @param {object} challenge
 * @param {string} blockId
 * @param {string} [salt]
 */
/** Prefer a single authored @quiz_modes when present (e.g. recall-only imports). */
export function pickStudyQuizMode(challenge, blockId, salt = '') {
    const n = normalizeChallenge(challenge);
    const playable = getPlayableModes(n);
    const authored =
        Array.isArray(n.modes) && n.modes.length && n.modes.length < ALL_QUIZ_MODES.length ? n.modes : null;
    if (authored?.length === 1) {
        const only = authored[0];
        if (playable.includes(only)) return only;
    }
    return pickRandomQuizMode(n, blockId, salt);
}

export function pickRandomQuizMode(challenge, blockId, salt = '') {
    const modes = getPlayableModes(challenge);
    if (!modes.length) return QUIZ_MODE_MULTIPLE;
    let h = 0;
    const s = `${blockId}:${salt}`;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return modes[Math.abs(h) % modes.length];
}

/**
 * Pick a different playable mode than the previous attempt (retry / «otra vez»).
 * @param {object} challenge
 * @param {string} blockId
 * @param {string} [previousMode]
 */
export function pickNextQuizMode(challenge, blockId, previousMode = '') {
    const modes = getPlayableModes(normalizeChallenge(challenge));
    if (!modes.length) return QUIZ_MODE_MULTIPLE;
    if (modes.length === 1) return modes[0];
    const prev = String(previousMode || '').trim();
    const rest = prev ? modes.filter((m) => m !== prev) : modes;
    const pool = rest.length ? rest : modes;
    let h = 0;
    const s = `${blockId}:retry:${Date.now()}`;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return pool[Math.abs(h) % pool.length];
}

/** @param {import('./quiz-v2-schema.js').QuizChallenge} c */
export function challengeToQuizBlock(c, id = 'quiz-v2') {
    const n = normalizeChallenge(c);
    return {
        type: 'quizv2',
        id,
        core_concept: n.core_concept,
        short_definition: n.short_definition,
        main_question: n.main_question,
        correct_answer: n.correct_answer,
        traps: [...n.traps],
        cloze_indices: [...n.cloze_indices],
        answer_mode: n.answer_mode,
        steps: [...n.steps],
        modes:
            Array.isArray(n.modes) && n.modes.length && n.modes.length < ALL_QUIZ_MODES.length
                ? n.modes.filter((m) => modeIsPlayable(n, m))
                : getPlayableModes(n),
        skip_multiple: n.skip_multiple,
        skip_ordering: n.skip_ordering
    };
}

/** Serialize extra challenge fields into @-lines (after standard fields). */
export function serializeChallengeExtras(c) {
    const n = normalizeChallenge(c);
    const modes = getPlayableModes(n);
    const lines = [];
    if (modes.length) lines.push(`@quiz_modes: ${modes.join(',')}`);
    if (n.cloze_indices.length) lines.push(`@cloze_indices: ${n.cloze_indices.join(',')}`);
    if (n.answer_mode === 'steps') lines.push('@answer_mode: steps');
    else if (n.skip_ordering) lines.push('@answer_mode: none');
    for (const step of n.steps) {
        if (step) lines.push(`@quiz_step: ${step}`);
    }
    if (n.skip_multiple) lines.push('@skip_multiple: yes');
    if (n.skip_ordering) lines.push('@skip_ordering: yes');
    return lines;
}

/** Merge parsed @-tags into challenge object. */
export function applyChallengeMetaLine(challenge, key, val) {
    const c = challenge || emptyChallenge();
    const k = String(key || '').toLowerCase();
    const v = String(val || '').trim();
    if (k === 'quiz_modes') {
        c.modes = v
            .split(/[,|]/)
            .map((s) => s.trim())
            .filter((m) => ALL_QUIZ_MODES.includes(m));
    } else if (k === 'cloze_indices') {
        c.cloze_indices = v
            .split(/[,|]/)
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => !Number.isNaN(n));
    } else if (k === 'answer_mode') {
        c.answer_mode = v === 'steps' ? 'steps' : v === 'none' ? 'none' : 'chips';
        if (v === 'none') c.skip_ordering = true;
    } else if (k === 'quiz_step') {
        if (v) c.steps.push(v);
    } else if (k === 'skip_multiple') {
        c.skip_multiple = ['1', 'true', 'yes', 'si', 'sí'].includes(v.toLowerCase());
    } else if (k === 'skip_ordering') {
        c.skip_ordering = ['1', 'true', 'yes', 'si', 'sí'].includes(v.toLowerCase());
    }
    return c;
}

export const CHALLENGE_EXTRA_KEYS = new Set([
    'quiz_modes',
    'cloze_indices',
    'answer_mode',
    'quiz_step',
    'skip_multiple',
    'skip_ordering'
]);
