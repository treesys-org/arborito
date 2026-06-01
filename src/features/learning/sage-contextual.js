/**
 * Sage guide mode — author fields and questionnaire (quiz v2) only, no LLM.
 */

import { parseArboritoFile } from '../editor/editor-engine.js';
import { isQuizV2ChallengeComplete } from './quiz-v2-status.js';
import { buildTreeBreadcrumb } from './ai-context.js';

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

/**
 * Quiz v2 / challenge schema from current lesson.
 * @param {object|null|undefined} node
 */
export function getSageQuizContent(node) {
    const empty = {
        hasQuiz: false,
        complete: false,
        coreConcept: '',
        shortDef: '',
        question: '',
        correct: '',
        traps: []
    };
    if (!node || node.type !== 'leaf' || !node.content) return empty;

    const { meta } = parseArboritoFile(node.content);
    const c = meta.challenge;
    if (!c) return empty;

    const traps = Array.isArray(c.traps) ? c.traps.filter((t) => String(t || '').trim()) : [];
    const coreConcept = String(c.core_concept || '').trim();
    const shortDef = String(c.short_definition || '').trim();
    const question = String(c.main_question || '').trim();
    const correct = String(c.correct_answer || '').trim();
    const hasQuiz = !!(coreConcept || question || correct || shortDef || traps.length);

    return {
        hasQuiz,
        complete: isQuizV2ChallengeComplete(c),
        coreConcept,
        shortDef,
        question,
        correct,
        traps
    };
}

/**
 * Human-readable quiz status for guide (no spoilers).
 * @param {ReturnType<typeof getSageQuizContent>} quiz
 * @param {object} ui
 */
function formatSageQuizStatus(quiz, ui) {
    if (!quiz || !quiz.hasQuiz) {
        return ui.sageQuizStatusNone || ui.sageQuizEmpty || '';
    }
    if (!quiz.complete) {
        return ui.sageQuizStatusIncomplete || ui.sageSectionQuizIncomplete || '';
    }
    return ui.sageQuizStatusReady || '';
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

function resolveBreadcrumb(ctx) {
    const node = ctx.selectedNode || ctx.previewNode;
    if (!node) return '';
    if (ctx.store) {
        const crumb = buildTreeBreadcrumb(ctx.store, node, { maxChars: 280 });
        if (crumb) return crumb;
    }
    return node.path ? String(node.path).trim() : '';
}

/**
 * Fixed support copy for UI navigation questions.
 */
export function getSageSupportResponse(action, ui, ctx = {}) {
    const node = ctx.selectedNode || ctx.previewNode;
    const path = resolveBreadcrumb(ctx);
    const name = node && node.name ? String(node.name) : '';

    if (action === 'continue') {
        const tpl = ui.sageSupportContinue || '';
        return tpl.replace(/\{path\}/g, path || name || '—').replace(/\{name\}/g, name);
    }
    if (action === 'where') {
        const tpl = ui.sageSupportWhere || '';
        return tpl.replace(/\{path\}/g, path || '—').replace(/\{name\}/g, name || '—');
    }
    if (action === 'lesson-help') {
        return ui.sageSupportLessonHelp || '';
    }
    if (action === 'map') {
        return ui.sageSupportBackMap || '';
    }
    if (action === 'quiz-status') {
        const quiz = getSageQuizContent(node);
        const status = formatSageQuizStatus(quiz, ui);
        const hint = ui.sageQuizStatusHint || '';
        return [status, hint].filter(Boolean).join('\n\n');
    }
    return '';
}

export { isQuizV2ChallengeComplete };

const SAGE_AI_MODE_KEY = 'arborito-sage-ai-mode';

export function getSageAiMode() {
    const v = localStorage.getItem(SAGE_AI_MODE_KEY);
    return v === 'dynamic' ? 'dynamic' : 'guide';
}

export function setSageAiMode(mode) {
    localStorage.setItem(SAGE_AI_MODE_KEY, mode === 'dynamic' ? 'dynamic' : 'guide');
}
