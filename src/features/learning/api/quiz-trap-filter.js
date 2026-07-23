/**
 * Filter quiz distractors: drop generic MC fillers and grammar-only noise on meaning questions.
 */

const GENERIC_TRAP_RE =
    /^(ninguna de las anteriores|todas las anteriores|none of the above|all of the above|both of the above|depende del contexto|depends on context|no answer|—|-)$/i;

const GRAMMAR_ONLY_RE =
    /^(der|die|das|den|dem|des|ein|eine?|einen|einem|einer|sich|\(sg\.\)|\(pl\.\)|\(m\.|f\.|n\.|t\.)$/i;

/** @param {string} text */
export function isGenericQuizTrap(text) {
    const t = String(text || '').trim();
    if (
        !t ||
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
    ) {
        return true;
    }
    return GENERIC_TRAP_RE.test(t);
}

/** @param {string} text */
function isGrammarOnlyTrap(text) {
    const t = String(text || '').trim();
    if (!t) return true;
    if (t.length <= 2) return true;
    if (/^[-–"']/.test(t) && t.length < 8) return true;
    if (GRAMMAR_ONLY_RE.test(t)) return true;
    if (/^[-–][a-zäöüß-]{0,12}$/i.test(t)) return true;
    return false;
}

/**
 * @param {string} mainQuestion
 */
function isMeaningQuestion(mainQuestion) {
    return /significa|meaning|bedeutet|translate|traduc|was heißt|qué significa/i.test(
        String(mainQuestion || '')
    );
}

/**
 * @param {string[]} traps
 * @param {{ correct?: string, concept?: string, mainQuestion?: string }} [ctx]
 */
export function filterQuizTraps(traps, ctx = {}) {
    const correct = String(ctx.correct || '').trim();
    const concept = String(ctx.concept || '').trim();
    const meaningQ = isMeaningQuestion(ctx.mainQuestion);
    const norm = (s) => String(s || '').trim().toLowerCase();
    const seen = new Set([norm(correct), norm(concept)].filter(Boolean));

    return (Array.isArray(traps) ? traps : [])
        .map((t) => String(t || '').trim())
        .filter((t) => {
            if (!t || isGenericQuizTrap(t)) return false;
            if (meaningQ && isGrammarOnlyTrap(t)) return false;
            const n = norm(t);
            if (seen.has(n)) return false;
            seen.add(n);
            return true;
        });
}

/**
 * Build multiple-choice options (correct + up to maxWrong distractors), shuffled.
 * Never returns a solitary correct button: pads with readable labels when needed.
 * @param {string} correct
 * @param {string[]} traps
 * @param {{ mainQuestion?: string, concept?: string, maxOptions?: number, seed?: string, lang?: string, distractorPool?: string[] }} [ctx]
 */
function shuffleQuizOptions(seed, options) {
    const arr = [...options];
    let h = 0;
    const s = String(seed || 'quiz');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    for (let i = arr.length - 1; i > 0; i--) {
        h = (h * 1103515245 + 12345) | 0;
        const j = Math.abs(h) % (i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export function buildQuizMultipleOptions(correct, traps, ctx = {}) {
    const max = ctx.maxOptions ?? 4;
    const lang = String(ctx.lang || 'ES').toUpperCase() === 'EN' ? 'EN' : 'ES';
    const filtered = filterQuizTraps(traps, {
        correct,
        concept: ctx.concept,
        mainQuestion: ctx.mainQuestion
    });
    const extras = Array.isArray(ctx.distractorPool)
        ? filterQuizTraps(ctx.distractorPool, {
              correct,
              concept: ctx.concept,
              mainQuestion: ctx.mainQuestion
          })
        : [];
    const distractors = [...filtered];
    for (const t of extras) {
        if (distractors.includes(t)) continue;
        distractors.push(t);
    }
    const options = [{ text: String(correct || '').trim(), correct: true }].filter((o) => o.text);
    const seen = new Set(options.map((o) => o.text.toLowerCase()));
    for (const t of distractors) {
        if (options.length >= max) break;
        const key = t.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        options.push({ text: t, correct: false });
    }
    let padN = 1;
    while (options.length < Math.min(2, max) && options.some((o) => o.correct) && padN <= 12) {
        const label = lang === 'EN' ? `Wrong ${padN}` : `Incorrecto ${padN}`;
        padN += 1;
        const key = label.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        options.push({ text: label, correct: false });
    }
    const seed =
        ctx.seed != null ? String(ctx.seed) : `${correct}:${distractors.join('|')}`;
    return shuffleQuizOptions(seed, options);
}
