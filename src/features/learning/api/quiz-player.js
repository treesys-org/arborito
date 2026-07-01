/**
 * Quiz validation helpers (render lives in QuizChallenge.jsx).
 */

export const RECALL_ADVANCE_MS = 1400;

export function validateClozeAnswers(c, inputs) {
    const words = c.short_definition.split(/\s+/).filter(Boolean);
    const hidden = c.cloze_indices.map((i) => (words[i] || '').toLowerCase().trim());
    if (inputs.length !== hidden.length) return false;
    return hidden.every((w, i) => (inputs[i] || '').toLowerCase().trim() === w);
}

export function validateChipsOrder(c, picked) {
    return picked.join(' ') === c.correct_answer.trim();
}

export function validateStepsOrder(c, order) {
    return JSON.stringify(order) === JSON.stringify(c.steps);
}
