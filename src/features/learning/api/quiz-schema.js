/**
 * Lesson quiz challenge schema (authoring + student modes).
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
 *     @/quiz
 *
 * Modes appear from filled fields: traps → multiple choice, steps → order,
 * definition braces → cloze, multi-word answer → chips, concept+answer → recall.
 *
 * Cloze syntax: wrap the words or phrases to blank in {curly braces} inside
 * the `definition` line. Multi-word phrases like `{Sistema operativo}` map to
 * a run of consecutive blanks.
 *
 * Internal challenge objects keep the longer field names (core_concept,
 * short_definition, …) because they are referenced from many runtime files.
 * Only the human-facing markdown vocabulary is short.
 */

import { QUIZ_PASS_RATE_DEFAULT_PERCENT } from './quiz-pass.js';
import { filterQuizTraps } from './quiz-trap-filter.js';

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

/**
 * Split an answer into ordering chips. Keeps parenthetical phrases intact
 * so "(saludo informal) Hola" becomes two chips, not "(saludo", "informal)", "Hola".
 * @param {string} text
 * @returns {string[]}
 */
export function tokenizeQuizAnswerChips(text) {
    const s = String(text || '').replace(/\u00a0/g, ' ').trim();
    if (!s) return [];
    const tokens = [];
    let i = 0;
    while (i < s.length) {
        while (i < s.length && /\s/.test(s[i])) i += 1;
        if (i >= s.length) break;
        if (s[i] === '(') {
            let depth = 0;
            let j = i;
            while (j < s.length) {
                if (s[j] === '(') depth += 1;
                else if (s[j] === ')') {
                    depth -= 1;
                    if (depth === 0) {
                        j += 1;
                        break;
                    }
                }
                j += 1;
            }
            const chunk = s.slice(i, j).trim();
            if (chunk) tokens.push(chunk);
            i = j;
            continue;
        }
        let j = i;
        while (j < s.length && !/\s/.test(s[j])) j += 1;
        const chunk = s.slice(i, j).trim();
        if (chunk) tokens.push(chunk);
        i = j;
    }
    return tokens;
}

/** @returns {import('./quiz-schema.js').QuizChallenge} */
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
        skip_ordering: false,
        pass_rate: null,
        items: []
    };
}

/**
 * @param {object|null|undefined} raw
 * @returns {import('./quiz-schema.js').QuizChallenge}
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
    if (raw.pass_rate != null && raw.pass_rate !== '') {
        const pct = parseInt(String(raw.pass_rate).replace('%', '').trim(), 10);
        c.pass_rate = Number.isNaN(pct) ? null : Math.min(100, Math.max(0, pct));
    }
    if (Array.isArray(raw.modes) && raw.modes.length) {
        c.modes = raw.modes.filter((m) => ALL_QUIZ_MODES.includes(m));
    } else if (typeof raw.modes === 'string' && raw.modes.trim()) {
        c.modes = raw.modes
            .split(/[,|]/)
            .map((s) => s.trim())
            .filter((m) => ALL_QUIZ_MODES.includes(m));
    }
    if (Array.isArray(raw.items) && raw.items.length) {
        c.items = raw.items.map((item) => normalizeChallenge(item));
    }
    return c;
}

/** True when a challenge (or any item) carries quiz field data worth persisting. */
export function challengeHasQuizShape(challenge) {
    const n = normalizeChallenge(challenge);
    if (n.core_concept || n.main_question || n.short_definition || n.correct_answer) return true;
    if (!Array.isArray(n.items) || !n.items.length) return false;
    return n.items.some((item) => {
        const ni = normalizeChallenge(item);
        return !!(ni.core_concept || ni.main_question || ni.short_definition || ni.correct_answer);
    });
}

/** Derive playable fields for recall flashcards (concept + definition back). */
export function challengeForPlay(raw) {
    const c = normalizeChallenge(raw);
    const answer = String(c.correct_answer || '').trim();
    const definition = String(c.short_definition || '').trim();
    if (!answer && definition && String(c.core_concept || '').trim()) {
        return normalizeChallenge({ ...c, correct_answer: definition });
    }
    return c;
}

/** @param {import('./quiz-schema.js').QuizChallenge} c */
function modeIsPlayable(c, mode) {
    switch (mode) {
        case QUIZ_MODE_CLOZE:
            /* Cloze uses definition braces; main_question may still exist for other modes. */
            return !!(c.short_definition && c.cloze_indices.length > 0);
        case QUIZ_MODE_MULTIPLE: {
            /* Need at least one usable trap after junk filtering (not just raw length). */
            if (!(c.main_question && c.correct_answer && c.traps.length > 0)) return false;
            const usable = filterQuizTraps(c.traps, {
                correct: c.correct_answer,
                concept: c.core_concept,
                mainQuestion: c.main_question
            });
            return usable.length > 0;
        }
        case QUIZ_MODE_RECALL:
            return !!(c.core_concept && c.correct_answer);
        case QUIZ_MODE_CHIPS: {
            const wc = tokenizeQuizAnswerChips(c.correct_answer).length;
            /* Chips = short phrase (2–6 tokens). Long answers stay recall/multiple only. */
            return wc >= 2 && wc <= 6;
        }
        case QUIZ_MODE_STEPS:
            /* Fewer than 2 steps → mode omitted. */
            return c.steps.length >= 2;
        default:
            return false;
    }
}

/** @param {import('./quiz-schema.js').QuizChallenge} c */
export function getPlayableModes(c) {
    const n = challengeForPlay(c);
    const derived = ALL_QUIZ_MODES.filter((m) => modeIsPlayable(n, m));
    if (n.modes && n.modes.length) {
        return derived.filter((m) => n.modes.includes(m));
    }
    return derived;
}

/** @param {object|null|undefined} challenge */
export function isQuizChallengeComplete(challenge) {
    const c = normalizeChallenge(challenge);
    if (Array.isArray(c.items) && c.items.length) {
        const parentConcept = String(c.core_concept || '').trim();
        return c.items.every((item) => {
            const merged =
                parentConcept && !String(item?.core_concept || '').trim()
                    ? { ...item, core_concept: parentConcept }
                    : item;
            return isQuizChallengeComplete(merged);
        });
    }
    return getPlayableModes(challengeForPlay(c)).length > 0;
}

/**
 * Human-readable hints when a @quiz block cannot run any practice mode.
 * Multi-question shells (`items:`) validate each item, not the empty parent fields.
 * @param {object} challenge
 * @returns {{ es: string, en: string }[]}
 */
export function getChallengeValidationHints(challenge) {
    const c = normalizeChallenge(challenge);
    if (Array.isArray(c.items) && c.items.length) {
        const out = [];
        c.items.forEach((item, idx) => {
            const parentConcept = String(c.core_concept || '').trim();
            const merged =
                parentConcept && !String(item?.core_concept || '').trim()
                    ? { ...item, core_concept: parentConcept }
                    : item;
            const childHints = getChallengeValidationHints(merged);
            for (const h of childHints) {
                out.push({
                    es: `pregunta ${idx + 1}: ${h.es}`,
                    en: `question ${idx + 1}: ${h.en}`,
                });
            }
        });
        return out;
    }

    const hints = [];

    if (!c.correct_answer) {
        hints.push({ es: 'falta la respuesta correcta', en: 'missing the correct answer' });
    }
    if (!c.core_concept && !c.main_question && !c.short_definition) {
        hints.push({
            es: 'añade tema, pregunta o definición',
            en: 'add a topic, question, or definition'
        });
    }

    const playable = getPlayableModes(c);
    if (c.correct_answer && playable.length === 0) {
        const need = [];
        if (!c.traps.length) {
            need.push({
                es: 'añade respuestas incorrectas para opción múltiple',
                en: 'add wrong answers for multiple choice'
            });
        }
        if (c.short_definition && !c.short_definition.includes('{')) {
            need.push({
                es: 'marca palabras en la definición para el modo huecos',
                en: 'mark words in the definition for cloze mode'
            });
        }
        if (c.correct_answer && !c.correct_answer.includes(' ') && !c.steps.length) {
            need.push({
                es: 'usa una respuesta de varias palabras o añade pasos en orden',
                en: 'use a multi-word answer or add ordered steps'
            });
        }
        if (!need.length) {
            need.push({
                es: 'revisa los modos activos o completa más campos',
                en: 'check active modes or fill in more fields'
            });
        }
        hints.push({
            es: `ningún modo de práctica disponible, ${need.map((n) => n.es).join('; ')}`,
            en: `no practice mode available, ${need.map((n) => n.en).join('; ')}`
        });
    }

    return hints;
}

function studyPlayableModes(challenge) {
    const modes = getPlayableModes(normalizeChallenge(challenge));
    if (modes.length <= 1) return modes;
    return modes;
}

function hashPickSeed(s) {
    let h = 0;
    const str = String(s || '');
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(h);
}

function pickCycledStudyMode(challenge, blockId, attempt = 0) {
    const modes = studyPlayableModes(challenge);
    if (!modes.length) return QUIZ_MODE_MULTIPLE;
    return modes[hashPickSeed(`${blockId}:study:${attempt}`) % modes.length];
}

/**
 * Pick a playable study mode. First open (empty/`0` salt) is random among
 * playable modes; non-zero salts stay stable for arcade rounds / retries.
 * Prefers a single authored mode when one was explicitly requested.
 * @param {object} challenge
 * @param {string} blockId
 * @param {string|number} [salt]
 */
export function pickStudyQuizMode(challenge, blockId, salt = '') {
    const n = normalizeChallenge(challenge);
    const playable = studyPlayableModes(n);
    if (!playable.length) return QUIZ_MODE_MULTIPLE;

    const authored =
        Array.isArray(n.modes) && n.modes.length && n.modes.length < ALL_QUIZ_MODES.length ? n.modes : null;
    if (authored?.length === 1) {
        const only = authored[0];
        if (playable.includes(only)) return only;
    }
    if (playable.length === 1) return playable[0];

    const saltStr = salt == null ? '' : String(salt).trim();
    const asNum = Number(saltStr);
    const firstOpen = saltStr === '' || (Number.isFinite(asNum) && asNum === 0);
    if (firstOpen) {
        return playable[Math.floor(Math.random() * playable.length)];
    }
    const attempt = Number.isFinite(asNum) ? asNum : hashPickSeed(saltStr);
    return pickCycledStudyMode(n, blockId, attempt);
}

/**
 * Pick a different playable mode than the previous attempt (retry / "try again").
 * @param {object} challenge
 * @param {string} blockId
 * @param {string} [previousMode]
 */
export function pickNextQuizMode(challenge, blockId, previousMode = '', attempt = 0) {
    const modes = studyPlayableModes(challenge);
    if (!modes.length) return QUIZ_MODE_MULTIPLE;
    if (modes.length === 1) return modes[0];
    const prev = String(previousMode || '').trim();
    const rest = prev ? modes.filter((m) => m !== prev) : modes;
    const pool = rest.length ? rest : modes;
    void blockId;
    void attempt;
    return pool[Math.floor(Math.random() * pool.length)];
}

/** @param {import('./quiz-schema.js').QuizChallenge} c */
export function challengeToQuizBlock(c, id = 'quiz') {
    const n = normalizeChallenge(c);
    return {
        type: 'quiz',
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
        skip_ordering: n.skip_ordering,
        pass_rate: n.pass_rate,
        items: Array.isArray(n.items) ? n.items.map((item) => normalizeChallenge(item)) : []
    };
}

/** Expand one @quiz block into playable question blocks (items[] or single). */
export function expandQuizBlock(block) {
    if (!block || block.type !== 'quiz') return [];
    const baseId = block.id || 'quiz';
    const items = Array.isArray(block.items) ? block.items : [];
    if (items.length) {
        const parentConcept = String(block.core_concept || '').trim();
        return items.map((item, i) => {
            const merged =
                parentConcept && !String(item?.core_concept || '').trim()
                    ? { ...item, core_concept: parentConcept }
                    : item;
            return {
                ...challengeToQuizBlock(merged, `${baseId}:${i}`),
                pass_rate: block.pass_rate,
            };
        });
    }
    return [challengeToQuizBlock(block, baseId)];
}

/** All expanded question blocks in document order. */
export function expandAllQuizQuestions(blocks) {
    if (!Array.isArray(blocks)) return [];
    const out = [];
    for (const b of blocks) {
        if (b.type !== 'quiz') continue;
        out.push(...expandQuizBlock(b));
    }
    return out;
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

function applyQuizKv(c, key, val) {
    const k = String(key || '').toLowerCase();
    if (k === 'definition') {
        const { text, indices } = parseInlineCloze(val);
        c.short_definition = text;
        if (indices.length) c.cloze_indices = indices;
        return;
    }
    if (QUIZ_KEY_TO_FIELD[k]) {
        c[QUIZ_KEY_TO_FIELD[k]] = val;
        return;
    }
    if (k === 'modes') {
        c.modes = val
            .split(/[,|\s]+/)
            .map((s) => s.trim())
            .filter((m) => ALL_QUIZ_MODES.includes(m));
        return;
    }
    if (k === 'skip_multiple') c.skip_multiple = TRUTHY.has(val.toLowerCase());
    if (k === 'skip_ordering') c.skip_ordering = TRUTHY.has(val.toLowerCase());
    if (k === 'pass_rate' || k === 'passrate') {
        const pct = parseInt(val.replace('%', '').trim(), 10);
        if (!Number.isNaN(pct)) c.pass_rate = Math.min(100, Math.max(0, pct));
    }
}

/**
 * Parse the body lines (between @quiz and @/quiz) into a normalized challenge.
 * @param {string|string[]} bodyLinesOrText
 * @returns {import('./quiz-schema.js').QuizChallenge}
 */
export function parseQuizBlock(bodyLinesOrText) {
    const lines = Array.isArray(bodyLinesOrText)
        ? bodyLinesOrText
        : String(bodyLinesOrText || '').split('\n');
    const c = emptyChallenge();
    c.modes = [];
    /** @type {'traps'|'steps'|'items'|null} */
    let listKey = null;
    /** @type {'traps'|'steps'|null} */
    let itemListKey = null;
    /** @type {import('./quiz-schema.js').QuizChallenge|null} */
    let currentItem = null;

    const flushItem = () => {
        if (!currentItem) return;
        c.items.push(normalizeChallenge(currentItem));
        currentItem = null;
        itemListKey = null;
    };

    for (const raw of lines) {
        const line = raw.replace(/\s+$/g, '');
        if (!line.trim()) continue;

        const itemField = line.match(/^\s{1,}([a-zA-Z_]+)\s*:\s*(.*)$/);
        if (itemField && listKey === 'items' && currentItem) {
            const fk = itemField[1].toLowerCase();
            const fval = itemField[2].trim();
            /* Top-level keys after items should not stick to the last item. */
            if (fk === 'items' || fk === 'concept' || fk === 'pass_rate' || fk === 'passrate') {
                /* fall through */
            } else {
                if (fk === 'traps' || fk === 'steps') {
                    itemListKey = fk;
                    if (fval) currentItem[fk].push(fval);
                } else {
                    itemListKey = null;
                    applyQuizKv(currentItem, itemField[1], itemField[2]);
                }
                continue;
            }
        }

        /* Nested traps/steps inside an item (2+ spaces beyond the item dash). */
        const itemList = line.match(/^\s{2,}-\s+(.*)$/);
        if (itemList && listKey === 'items' && currentItem && itemListKey) {
            const v = itemList[1].trim();
            /* Don't treat a new ` - question:` row as a trap bullet. */
            if (v && !/^[a-zA-Z_]+\s*:/.test(v)) {
                currentItem[itemListKey].push(v);
                continue;
            }
        }

        /*
         * Loose trap/step bullets while collecting an item list (1-space demos).
         * Must run before itemStart so ` - Yes, always` is not a new question.
         */
        const looseItemBullet = line.match(/^\s*-\s+(.*)$/);
        if (looseItemBullet && listKey === 'items' && currentItem && itemListKey) {
            const v = looseItemBullet[1].trim();
            if (v && !/^(question|answer|modes|definition|concept|traps|steps)\s*:/i.test(v)) {
                currentItem[itemListKey].push(v);
                continue;
            }
        }

        /* New item row: 1–2 spaces before the dash (authors often use one). */
        const itemStart = line.match(/^ {1,2}-\s+(.*)$/);
        if (itemStart && listKey === 'items') {
            flushItem();
            currentItem = emptyChallenge();
            currentItem.modes = [];
            const rest = itemStart[1].trim();
            const kvOnSame = rest.match(/^\s*([a-zA-Z_]+)\s*:\s*(.*)$/);
            if (kvOnSame) applyQuizKv(currentItem, kvOnSame[1], kvOnSame[2]);
            continue;
        }

        const itemMatch = line.match(/^\s*-\s+(.*)$/);
        if (itemMatch && listKey && listKey !== 'items') {
            const v = itemMatch[1].trim();
            if (!v) continue;
            (listKey === 'traps' ? c.traps : c.steps).push(v);
            continue;
        }

        const kvMatch = line.match(/^\s*([a-zA-Z_]+)\s*:\s*(.*)$/);
        if (!kvMatch) {
            listKey = null;
            itemListKey = null;
            continue;
        }
        const key = kvMatch[1].toLowerCase();
        const val = kvMatch[2].trim();
        if (key === 'traps' || key === 'steps' || key === 'items') {
            listKey = key;
            itemListKey = null;
            if (key === 'items') {
                flushItem();
                continue;
            }
            if (val) c[key === 'traps' ? 'traps' : 'steps'].push(val);
            continue;
        }
        if (listKey === 'items' && currentItem) {
            applyQuizKv(currentItem, key, val);
        } else {
            listKey = null;
            itemListKey = null;
            applyQuizKv(c, key, val);
        }
    }
    flushItem();
    if (c.steps.length >= 2) c.answer_mode = 'steps';
    return normalizeChallenge(c);
}

/**
 * Serialize a challenge to the fenced markdown block.
 * Cloze blanks are written inline via `{}` inside the `definition:` line.
 * Only write `modes:` when the author explicitly narrowed the list — never
 * snapshot currently playable modes (that permanently locks out cloze/chips later).
 * @param {import('./quiz-schema.js').QuizChallenge} c
 */
export function serializeQuizBlock(c) {
    const n = normalizeChallenge(c);
    const authoredModes = (challenge) => {
        const modes = Array.isArray(challenge.modes) ? challenge.modes : [];
        if (!modes.length || modes.length >= ALL_QUIZ_MODES.length) return null;
        const listed = modes.filter((m) => ALL_QUIZ_MODES.includes(m));
        return listed.length && listed.length < ALL_QUIZ_MODES.length ? listed : null;
    };
    const lines = ['@quiz'];
    if (Array.isArray(n.items) && n.items.length) {
        lines.push('items:');
        for (const item of n.items) {
            const ni = normalizeChallenge(item);
            lines.push(`  - concept: ${ni.core_concept || ''}`.trimEnd());
            if (ni.short_definition) {
                lines.push(`    definition: ${renderInlineCloze(ni.short_definition, ni.cloze_indices)}`);
            }
            if (ni.main_question) lines.push(`    question: ${ni.main_question}`);
            if (ni.correct_answer) lines.push(`    answer: ${ni.correct_answer}`);
            const modes = authoredModes(ni);
            if (modes) lines.push(`    modes: ${modes.join(',')}`);
            if (ni.traps.length) {
                lines.push('    traps:');
                ni.traps.forEach((t) => lines.push(`    - ${t}`));
            }
            if (ni.steps.length) {
                lines.push('    steps:');
                ni.steps.forEach((s) => lines.push(`    - ${s}`));
            }
        }
        if (n.pass_rate != null && n.pass_rate !== QUIZ_PASS_RATE_DEFAULT_PERCENT) {
            lines.push(`pass_rate: ${n.pass_rate}`);
        }
        lines.push('@/quiz');
        return lines.join('\n');
    }
    if (n.core_concept) lines.push(`concept: ${n.core_concept}`);
    if (n.short_definition) lines.push(`definition: ${renderInlineCloze(n.short_definition, n.cloze_indices)}`);
    if (n.main_question) lines.push(`question: ${n.main_question}`);
    if (n.correct_answer) lines.push(`answer: ${n.correct_answer}`);
    const modes = authoredModes(n);
    if (modes) lines.push(`modes: ${modes.join(',')}`);
    if (n.traps.length) {
        lines.push('traps:');
        n.traps.forEach((t) => lines.push(`- ${t}`));
    }
    if (n.steps.length) {
        lines.push('steps:');
        n.steps.forEach((s) => lines.push(`- ${s}`));
    }
    if (n.pass_rate != null && n.pass_rate !== QUIZ_PASS_RATE_DEFAULT_PERCENT) {
        lines.push(`pass_rate: ${n.pass_rate}`);
    }
    lines.push('@/quiz');
    return lines.join('\n');
}

/**
 * Find every @quiz…@/quiz pair in a piece of markdown.
 * A trailing opener without ``@/quiz`` is treated as closed at EOF.
 * A second ``@quiz`` before a closer still skips the first opener.
 * @param {string|string[]} textOrLines
 * @returns {{ startLine:number, endLine:number, challenge: object }[]}
 */
/** Compare authored challenge data (ignores derived `modes` / `answer_mode`). */
function challengeFieldsSemanticallyEqual(na, nb) {
    const idxKey = (arr) =>
        [...arr]
            .map((n) => parseInt(n, 10))
            .filter((n) => !Number.isNaN(n))
            .sort((x, y) => x - y)
            .join(',');
    const listKey = (arr) => arr.map((s) => String(s || '').trim()).join('\0');
    return (
        na.core_concept === nb.core_concept &&
        na.short_definition === nb.short_definition &&
        na.main_question === nb.main_question &&
        na.correct_answer === nb.correct_answer &&
        na.skip_multiple === nb.skip_multiple &&
        na.skip_ordering === nb.skip_ordering &&
        listKey(na.traps) === listKey(nb.traps) &&
        listKey(na.steps) === listKey(nb.steps) &&
        idxKey(na.cloze_indices) === idxKey(nb.cloze_indices)
    );
}

export function challengesSemanticallyEqual(a, b) {
    const na = normalizeChallenge(a);
    const nb = normalizeChallenge(b);
    if (na.items.length || nb.items.length) {
        if (na.items.length !== nb.items.length) return false;
        return na.items.every((item, i) => challengeFieldsSemanticallyEqual(item, nb.items[i]));
    }
    return challengeFieldsSemanticallyEqual(na, nb);
}

/** Normalize lesson body markdown so quiz fences round-trip consistently for dirty checks. */
export function canonicalizeLessonBodyMarkdown(body) {
    const text = String(body != null ? body : '');
    const lines = text.split('\n');
    const blocks = findQuizBlocks(lines);
    if (!blocks.length) return text.replace(/\n{3,}/g, '\n\n').trimEnd();
    const next = [...lines];
    for (let i = blocks.length - 1; i >= 0; i--) {
        const block = blocks[i];
        const canonical = serializeQuizBlock(block.challenge).split('\n');
        next.splice(block.startLine, block.endLine - block.startLine + 1, ...canonical);
    }
    return next.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

export function findQuizBlocks(textOrLines) {
    const lines = Array.isArray(textOrLines) ? textOrLines : String(textOrLines || '').split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
        if (!isQuizBlockOpen(lines[i])) { i++; continue; }
        let close = -1;
        let abortedByOpen = false;
        for (let j = i + 1; j < lines.length; j++) {
            if (isQuizBlockClose(lines[j])) { close = j; break; }
            if (isQuizBlockOpen(lines[j])) { abortedByOpen = true; break; }
        }
        /* Trailing @quiz without @/quiz: treat EOF as the closer. */
        if (close === -1) {
            if (abortedByOpen) { i++; continue; }
            close = lines.length;
        }
        const bodyEnd = close < lines.length ? close : lines.length;
        const challenge = parseQuizBlock(lines.slice(i + 1, bodyEnd));
        out.push({
            startLine: i,
            endLine: close < lines.length ? close : Math.max(i, lines.length - 1),
            challenge
        });
        i = close < lines.length ? close + 1 : lines.length;
    }
    return out;
}
