/**
 * Quiz validation helpers (render lives in QuizChallenge.jsx).
 */

import { tokenizeQuizAnswerChips } from './quiz-schema.js';

export const RECALL_ADVANCE_MS = 1400;

/**
 * Strip leading/trailing punctuation so cloze blanks like `{word},` accept `word`.
 * Keeps letters/digits/marks from Latin scripts used in Arborito courses.
 * @param {string} text
 */
export function normalizeClozeToken(text) {
    return String(text || '')
        .toLowerCase()
        .trim()
        .replace(/^[^0-9a-zàáâãäåæçèéêëìíîïñòóôõöùúûüýÿœß]+/i, '')
        .replace(/[^0-9a-zàáâãäåæçèéêëìíîïñòóôõöùúûüýÿœß]+$/i, '');
}

/**
 * Split a definition word into leading punct + core + trailing punct for cloze UI.
 * @param {string} word
 * @returns {{ lead: string, core: string, trail: string }}
 */
export function splitClozeDisplayWord(word) {
    const s = String(word || '');
    const m = s.match(/^([^0-9A-Za-zÀ-ÿ]*)(.*?)([^0-9A-Za-zÀ-ÿ]*)$/);
    if (!m) return { lead: '', core: s, trail: '' };
    return { lead: m[1] || '', core: m[2] || '', trail: m[3] || '' };
}

export function validateClozeAnswers(c, inputs) {
    const words = String(c.short_definition || '')
        .split(/\s+/)
        .filter(Boolean);
    const hidden = (c.cloze_indices || []).map((i) => normalizeClozeToken(words[i] || ''));
    if (!hidden.length || inputs.length !== hidden.length) return false;
    return hidden.every((w, i) => normalizeClozeToken(inputs[i]) === w && w.length > 0);
}

export function validateChipsOrder(c, picked) {
    const expected = tokenizeQuizAnswerChips(c.correct_answer).map((t) => t.trim().toLowerCase());
    const got = (Array.isArray(picked) ? picked : []).map((t) => String(t || '').trim().toLowerCase());
    if (!expected.length || got.length !== expected.length) return false;
    return got.every((t, i) => t === expected[i]);
}

export function validateStepsOrder(c, order) {
    const expected = (Array.isArray(c.steps) ? c.steps : []).map((s) => String(s || '').trim());
    const got = (Array.isArray(order) ? order : []).map((s) => String(s || '').trim());
    if (!expected.length || got.length !== expected.length) return false;
    return got.every((s, i) => s === expected[i]);
}
