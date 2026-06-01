/**
 * Quiz V2 challenge schema (authoring + student modes).
 * Five game modes: cloze, multiple choice, recall, chip order, step order.
 *
 * Authoring surface in markdown is a single fenced block (one per quiz):
 *
 *     @quiz
 *     concept: GNU/Linux
 *     definition: {Sistema operativo} libre basado en el {kernel} Linux
 *     question: What is GNU/Linux?
 *     answer: An open-source OS based on the Linux kernel
 *     modes: cloze,multiple,recall,chips
 *     traps:
 *     - A text editor
 *     - A relational database
 *     steps:
 *     - Step 1
 *     - Step 2
 *     skip_multiple: yes
 *     skip_ordering: yes
 *     @/quiz
 *
 * Cloze syntax: wrap the words or phrases to blank in {curly braces} inside
 * the `definition` line. Multi-word phrases like `{Sistema operativo}` map to
 * a run of consecutive blanks.
 *
 * Internal challenge objects keep the longer field names (core_concept,
 * short_definition, …) because they are referenced from many runtime files.
 * Only the human-facing markdown vocabulary is short.
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

/** Markdown keys → internal challenge fields (single source of truth). */
const QUIZ_KEY_TO_FIELD = {
    concept: 'core_concept',
    definition: 'short_definition',
    question: 'main_question',
    answer: 'correct_answer'
};

const TRUTHY = new Set(['1', 'true', 'yes', 'si', 'sí', 'on', 'y']);

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
function modeIsPlayable(c, mode) {
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
 * Prefers a single authored mode when one was explicitly requested.
 * @param {object} challenge
 * @param {string} blockId
 * @param {string} [salt]
 */
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

function pickRandomQuizMode(challenge, blockId, salt = '') {
    const modes = getPlayableModes(challenge);
    if (!modes.length) return QUIZ_MODE_MULTIPLE;
    let h = 0;
    const s = `${blockId}:${salt}`;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return modes[Math.abs(h) % modes.length];
}

/**
 * Pick a different playable mode than the previous attempt (retry / "try again").
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

/* ---------- @quiz fenced block: parser + serializer ---------- */

const QUIZ_OPEN = /^@quiz\s*$/i;
const QUIZ_CLOSE = /^@\/quiz\s*$/i;

/** @param {string} line */
export function isQuizBlockOpen(line) {
    return QUIZ_OPEN.test(String(line || '').trim());
}

/** @param {string} line */
export function isQuizBlockClose(line) {
    return QUIZ_CLOSE.test(String(line || '').trim());
}

/**
 * Strip `{phrase}` cloze markers from a definition string.
 * Returns the visible text and the word indices that fell inside the braces;
 * multi-word phrases produce consecutive indices. Unmatched braces are
 * treated as literal characters.
 * @param {string} raw
 * @returns {{ text: string, indices: number[] }}
 */
export function parseInlineCloze(raw) {
    const src = String(raw || '');
    if (!src.includes('{') || !src.includes('}')) {
        return { text: src.trim(), indices: [] };
    }
    let plain = '';
    const masked = [];
    let inside = false;
    for (const ch of src) {
        if (ch === '{' && !inside) { inside = true; continue; }
        if (ch === '}' && inside) { inside = false; continue; }
        plain += ch;
        masked.push(inside);
    }
    if (inside) return { text: src.trim(), indices: [] };
    const indices = [];
    let w = 0;
    const re = /\S+/g;
    let m;
    while ((m = re.exec(plain)) !== null) {
        for (let k = m.index; k < m.index + m[0].length; k++) {
            if (masked[k]) { indices.push(w); break; }
        }
        w++;
    }
    return { text: plain.trim().replace(/\s+/g, ' '), indices };
}

/** Inverse of parseInlineCloze. Adjacent indices collapse into one phrase. */
export function renderInlineCloze(text, indices) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    if (!words.length || !indices?.length) return String(text || '');
    const set = new Set(indices.filter((n) => Number.isInteger(n) && n >= 0 && n < words.length));
    const out = [];
    let i = 0;
    while (i < words.length) {
        if (!set.has(i)) { out.push(words[i]); i++; continue; }
        let j = i;
        while (j < words.length && set.has(j)) j++;
        out.push(`{${words.slice(i, j).join(' ')}}`);
        i = j;
    }
    return out.join(' ');
}

/**
 * Parse the body lines (between @quiz and @/quiz) into a normalized challenge.
 * @param {string|string[]} bodyLinesOrText
 * @returns {import('./quiz-v2-schema.js').QuizChallenge}
 */
export function parseQuizBlock(bodyLinesOrText) {
    const lines = Array.isArray(bodyLinesOrText)
        ? bodyLinesOrText
        : String(bodyLinesOrText || '').split('\n');
    const c = emptyChallenge();
    c.modes = [];
    /** @type {'traps'|'steps'|null} */
    let listKey = null;
    for (const raw of lines) {
        const line = raw.replace(/\s+$/g, '');
        if (!line.trim()) continue;
        const itemMatch = line.match(/^\s*-\s+(.*)$/);
        if (itemMatch && listKey) {
            const v = itemMatch[1].trim();
            if (!v) continue;
            (listKey === 'traps' ? c.traps : c.steps).push(v);
            continue;
        }
        const kvMatch = line.match(/^\s*([a-zA-Z_]+)\s*:\s*(.*)$/);
        if (!kvMatch) { listKey = null; continue; }
        const key = kvMatch[1].toLowerCase();
        const val = kvMatch[2].trim();
        listKey = null;
        if (key === 'definition') {
            const { text, indices } = parseInlineCloze(val);
            c.short_definition = text;
            if (indices.length) c.cloze_indices = indices;
            continue;
        }
        if (QUIZ_KEY_TO_FIELD[key]) { c[QUIZ_KEY_TO_FIELD[key]] = val; continue; }
        if (key === 'modes') {
            c.modes = val.split(/[,|\s]+/).map((s) => s.trim()).filter((m) => ALL_QUIZ_MODES.includes(m));
            continue;
        }
        if (key === 'traps' || key === 'steps') {
            listKey = key;
            if (val) c[key === 'traps' ? 'traps' : 'steps'].push(val);
            continue;
        }
        if (key === 'skip_multiple') { c.skip_multiple = TRUTHY.has(val.toLowerCase()); continue; }
        if (key === 'skip_ordering') { c.skip_ordering = TRUTHY.has(val.toLowerCase()); continue; }
        /* Unknown keys are silently ignored to keep the format extensible. */
    }
    if (c.steps.length >= 2) c.answer_mode = 'steps';
    return normalizeChallenge(c);
}

/**
 * Serialize a challenge to the fenced markdown block.
 * Cloze blanks are written inline via `{}` inside the `definition:` line.
 * @param {import('./quiz-v2-schema.js').QuizChallenge} c
 */
export function serializeQuizBlock(c) {
    const n = normalizeChallenge(c);
    const lines = ['@quiz'];
    if (n.core_concept) lines.push(`concept: ${n.core_concept}`);
    if (n.short_definition) lines.push(`definition: ${renderInlineCloze(n.short_definition, n.cloze_indices)}`);
    if (n.main_question) lines.push(`question: ${n.main_question}`);
    if (n.correct_answer) lines.push(`answer: ${n.correct_answer}`);
    const playable = getPlayableModes(n);
    if (playable.length && playable.length < ALL_QUIZ_MODES.length) {
        lines.push(`modes: ${playable.join(',')}`);
    }
    if (n.traps.length) {
        lines.push('traps:');
        n.traps.forEach((t) => lines.push(`- ${t}`));
    }
    if (n.steps.length) {
        lines.push('steps:');
        n.steps.forEach((s) => lines.push(`- ${s}`));
    }
    if (n.skip_multiple) lines.push('skip_multiple: yes');
    if (n.skip_ordering) lines.push('skip_ordering: yes');
    lines.push('@/quiz');
    return lines.join('\n');
}

/**
 * Find every well-formed @quiz…@/quiz pair in a piece of markdown.
 * Unmatched openers (no closing fence before EOF or before the next opener)
 * are skipped; callers can therefore trust the returned ranges.
 * @param {string|string[]} textOrLines
 * @returns {{ startLine:number, endLine:number, challenge: object }[]}
 */
export function findQuizBlocks(textOrLines) {
    const lines = Array.isArray(textOrLines) ? textOrLines : String(textOrLines || '').split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
        if (!isQuizBlockOpen(lines[i])) { i++; continue; }
        let close = -1;
        for (let j = i + 1; j < lines.length; j++) {
            if (isQuizBlockClose(lines[j])) { close = j; break; }
            if (isQuizBlockOpen(lines[j])) break;
        }
        if (close === -1) { i++; continue; }
        out.push({
            startLine: i,
            endLine: close,
            challenge: parseQuizBlock(lines.slice(i + 1, close))
        });
        i = close + 1;
    }
    return out;
}
