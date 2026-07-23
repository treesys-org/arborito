/**
 * Sage guide mode, author fields and lesson questionnaire only, no LLM.
 */

import { parseArboritoFile } from '../../editor/api/editor-engine.js';
import { hasSageAiConsentForInit } from './sage-ai-consent.js';

/**
 * @param {object|null|undefined} node
 * @returns {{ description: string, notes: string, hasDescription: boolean, hasNotes: boolean }}
 */
export function getSageNodeFields(node) {
    if (!node) {
        return { description: '', notes: '', hasDescription: false, hasNotes: false };
    }

    let description = String(node.description || '').trim();
    let notes = '';

    if (node.type === 'leaf' && node.content) {
        const parsed = parseArboritoFile(node.content);
        if (!description) description = String(parsed.meta.description || '').trim();
        const discussion = String(parsed.meta.discussion || '').trim();
        const callouts = extractCalloutTexts(parsed.body);
        const parts = [];
        if (discussion) parts.push(discussion);
        if (callouts.length) parts.push(callouts.join('\n\n'));
        notes = parts.join('\n\n').trim();
    } else {
        notes = String(node.discussion || '').trim();
    }

    return {
        description,
        notes,
        hasDescription: description.length > 0,
        hasNotes: notes.length > 0
    };
}

/** @param {string} bodyMd */
function extractCalloutTexts(bodyMd) {
    if (!bodyMd) return [];
    const out = [];
    for (const line of bodyMd.split('\n')) {
        const t = line.trim();
        if (t.startsWith('> ')) out.push(t.slice(2).trim());
    }
    return out.filter(Boolean);
}

const SAGE_AI_MODE_KEY = 'arborito-sage-ai-mode';
/** In-session cache; cleared when Sage closes so the next open reads persisted preference. */
let _memSageAiMode = null;

function readPersistedSageAiMode() {
    if (!hasSageAiConsentForInit()) return 'guide';
    try {
        const v = localStorage.getItem(SAGE_AI_MODE_KEY);
        if (v === 'dynamic' || v === 'guide') return v === 'dynamic' ? 'dynamic' : 'guide';
    } catch {
        /* noop */
    }
    return 'guide';
}

export function getSageAiMode() {
    if (_memSageAiMode === 'dynamic' || _memSageAiMode === 'guide') {
        return _memSageAiMode;
    }
    return readPersistedSageAiMode();
}

export function setSageAiMode(mode) {
    const next = mode === 'dynamic' ? 'dynamic' : 'guide';
    _memSageAiMode = next;
    try {
        if (hasSageAiConsentForInit()) {
            localStorage.setItem(SAGE_AI_MODE_KEY, next);
        } else {
            localStorage.removeItem(SAGE_AI_MODE_KEY);
        }
    } catch {
        /* noop */
    }
}

/** Sage open: Guide until AI consent; otherwise restore last Guide/IA choice. */
export function initSageAiModeOnOpen() {
    _memSageAiMode = readPersistedSageAiMode();
}

/** Sage close: drop session cache; persisted mode stays in localStorage when allowed. */
export function resetSageAiModeSession() {
    _memSageAiMode = null;
}

export function clearPersistedSageAiMode() {
    _memSageAiMode = 'guide';
    try {
        localStorage.removeItem(SAGE_AI_MODE_KEY);
    } catch {
        /* noop */
    }
}
