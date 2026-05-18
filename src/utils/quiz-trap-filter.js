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
    if (!t || t === '—') return true;
    return GENERIC_TRAP_RE.test(t);
}

/** @param {string} text */
export function isGrammarOnlyTrap(text) {
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
export function isMeaningQuestion(mainQuestion) {
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
 * Build multiple-choice options (correct + up to maxWrong distractors).
 * @param {string} correct
 * @param {string[]} traps
 * @param {{ mainQuestion?: string, concept?: string, maxOptions?: number }} [ctx]
 */
export function buildQuizMultipleOptions(correct, traps, ctx = {}) {
    const max = ctx.maxOptions ?? 4;
    const filtered = filterQuizTraps(traps, {
        correct,
        concept: ctx.concept,
        mainQuestion: ctx.mainQuestion
    });
    const options = [{ text: correct, correct: true }];
    for (const t of filtered) {
        if (options.length >= max) break;
        if (t === correct) continue;
        options.push({ text: t, correct: false });
    }
    return options;
}
