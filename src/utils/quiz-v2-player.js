/**
 * Student-facing Quiz V2 challenges (random mode per attempt).
 */

import { escAttr, escHtml } from './html-escape.js';
import {
    QUIZ_MODE_CLOZE,
    QUIZ_MODE_MULTIPLE,
    QUIZ_MODE_RECALL,
    QUIZ_MODE_CHIPS,
    QUIZ_MODE_STEPS,
    normalizeChallenge,
    pickStudyQuizMode,
    getPlayableModes
} from './quiz-v2-schema.js';
import { buildQuizMultipleOptions, filterQuizTraps } from './quiz-trap-filter.js';

const RECALL_ADVANCE_MS = 1400;

function shuffleOptions(seed, options) {
    const arr = [...options];
    let h = 0;
    const s = String(seed || 'quiz');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    for (let i = arr.length - 1; i > 0; i--) {
        h = (h * 1103515245 + 12345) | 0;
        const j = Math.abs(h) % (i + 1);
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
    }
    return arr;
}

function challengeFromBlock(b) {
    const c = normalizeChallenge({
        core_concept: b.core_concept,
        short_definition: b.short_definition,
        main_question: b.main_question,
        correct_answer: b.correct_answer,
        traps: b.traps,
        cloze_indices: b.cloze_indices,
        answer_mode: b.answer_mode,
        steps: b.steps,
        modes: b.modes,
        skip_multiple: b.skip_multiple,
        skip_ordering: b.skip_ordering
    });
    c.traps = filterQuizTraps(c.traps, {
        correct: c.correct_answer,
        concept: c.core_concept,
        mainQuestion: c.main_question
    });
    return c;
}

function renderIntro(b, ui, blockId, modes) {
    const modesLabel = modes.join(' · ');
    return `
    <div id="${escAttr(blockId)}" class="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border-2 border-indigo-200 dark:border-indigo-800 p-6 md:p-8 text-center">
        <span class="text-3xl mb-3 block" aria-hidden="true">🎯</span>
        <h3 class="text-xl font-black text-slate-800 dark:text-white mb-2">${escHtml(ui.lessonQuizV2Label || 'Desafío')}</h3>
        ${b.core_concept ? `<p class="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-300 mb-2">${escHtml(b.core_concept)}</p>` : ''}
        <p class="text-slate-500 dark:text-slate-400 mb-2 text-sm">${escHtml(ui.quizV2RandomIntro || 'Cada intento usa un tipo de desafío distinto.')}</p>
        <p class="text-[10px] text-slate-400 mb-6 font-mono">${escHtml(modesLabel)}</p>
        <button type="button" class="btn-quizv2-start w-full md:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg" data-id="${escAttr(blockId)}">${escHtml(ui.quizStart || 'Empezar')}</button>
    </div>`;
}

function renderRecallFinished(b, ui, state, blockId) {
    const remembered = !!state.v2RecallRemembered;
    const title = remembered
        ? ui.quizRecallWell || '¡Bien!'
        : ui.quizRecallReview || 'Para recordar';
    const sub = remembered ? ui.quizRecallWellSub || '' : ui.quizRecallReviewSub || '';
    const tone = remembered
        ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/30'
        : 'border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30';
    const iconTone = remembered ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400';
    return `
    <div id="${escAttr(blockId)}" class="not-prose my-12 rounded-3xl shadow-lg border p-6 md:p-8 text-center quizv2-recall-result ${tone}" data-mode="recall" data-remembered="${remembered ? '1' : '0'}">
        <p class="quizv2-recall-result__pulse text-3xl md:text-4xl font-black mb-2 ${iconTone}">${escHtml(title)}</p>
        ${sub ? `<p class="text-sm text-slate-600 dark:text-slate-300 mb-3">${escHtml(sub)}</p>` : ''}
        <p class="text-sm font-semibold text-emerald-700 dark:text-emerald-300">${escHtml(b.correct_answer || '')}</p>
    </div>`;
}

function renderFinished(b, ui, state, blockId, context) {
    const c = challengeFromBlock(b);
    const recallOnly =
        state.v2Mode === QUIZ_MODE_RECALL ||
        state.v2RecallRemembered !== undefined ||
        (Array.isArray(c.modes) && c.modes.length === 1 && c.modes[0] === QUIZ_MODE_RECALL);
    if (recallOnly) {
        return renderRecallFinished(b, ui, state, blockId);
    }
    const ok = !!state.v2Correct;
    const session = context.quizSession;
    const inSession = session && session.quizIds && session.quizIds.length > 1;
    const retryLbl = ui.quizRetry || 'Reintentar';
    let actionHtml = `<button type="button" class="btn-quizv2-retry px-6 py-3 rounded-xl bg-slate-100 dark:bg-slate-700 font-bold text-sm" data-id="${escAttr(blockId)}">${escHtml(retryLbl)}</button>`;
    if (inSession && session.awaitingAdvance && !session.finished) {
        const isLast = session.currentIndex >= session.quizIds.length - 1;
        const nextLbl = isLast
            ? ui.lessonQuizSessionFinish || 'Ver resultado'
            : ui.lessonQuizSessionNext || 'Siguiente';
        actionHtml = `<button type="button" class="btn-quizv2-next px-6 py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm" data-id="${escAttr(blockId)}">${escHtml(nextLbl)}</button>`;
    }
    return `
    <div id="${escAttr(blockId)}" class="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border p-6 md:p-8 text-center ${ok ? 'border-green-200' : 'border-red-200'}">
        <div class="text-4xl mb-3">${ok ? '✓' : '✗'}</div>
        <h3 class="text-xl font-black mb-2">${escHtml(ok ? ui.quizCorrect || 'Correcto' : ui.quizWrong || 'Incorrecto')}</h3>
        <p class="text-sm text-slate-500 mb-4">${escHtml(b.correct_answer || '')}</p>
        ${actionHtml}
    </div>`;
}

function renderCloze(b, c, ui, state, blockId) {
    const words = c.short_definition.split(/\s+/).filter(Boolean);
    const hidden = c.cloze_indices.map((i) => words[i] || '').filter(Boolean);
    const inputs = hidden
        .map(
            (_, i) =>
                `<input type="text" class="quizv2-cloze-ans w-24 mx-1 border-b-2 border-indigo-500 bg-transparent text-center text-indigo-700 dark:text-indigo-300" data-idx="${i}" placeholder="…" />`
        )
        .join(' ');
    const body = words
        .map((word, i) => {
            if (!c.cloze_indices.includes(i)) return `<span class="mr-1">${escHtml(word)}</span>`;
            const hi = c.cloze_indices.indexOf(i);
            return `<span class="inline-block mx-0.5">${inputs.split(' ')[hi] || '…'}</span>`;
        })
        .join('');
    const filled = words
        .map((word, i) => {
            if (!c.cloze_indices.includes(i)) return escHtml(word);
            return `<input type="text" class="quizv2-cloze-ans w-20 inline border-b-2 border-indigo-500 bg-transparent text-center" data-idx="${c.cloze_indices.indexOf(i)}" />`;
        })
        .join(' ');
    return `
    <div id="${escAttr(blockId)}" class="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border p-6 md:p-8" data-mode="cloze">
        <p class="text-[10px] font-black uppercase text-indigo-500 mb-2">${escHtml(ui.quizModeCloze || 'Huecos')}</p>
        <p class="text-lg leading-loose text-slate-700 dark:text-slate-200 mb-6">${filled}</p>
        <button type="button" class="btn-quizv2-cloze-check w-full py-3 bg-indigo-600 text-white font-bold rounded-xl" data-id="${escAttr(blockId)}">${escHtml(ui.quizCheck || 'Comprobar')}</button>
    </div>`;
}

function renderRecall(b, c, ui, blockId, state) {
    const revealed = !!state.v2RecallRevealed;
    if (!revealed) {
        return `
    <div id="${escAttr(blockId)}" class="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border p-6 md:p-8 text-center" data-mode="recall" data-recall-phase="prompt">
        <p class="text-[10px] font-black uppercase text-violet-500 mb-3">${escHtml(ui.quizModeRecall || 'Recuerdo')}</p>
        <p class="text-2xl md:text-3xl font-black text-slate-800 dark:text-white mb-8 leading-snug">${escHtml(c.core_concept)}</p>
        <button type="button" class="btn-quizv2-reveal w-full max-w-sm mx-auto px-8 py-5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white text-lg font-black shadow-lg shadow-violet-500/30 transition-transform active:scale-[0.98]" data-id="${escAttr(blockId)}">${escHtml(ui.quizRecallShowAnswer || 'Mostrar respuesta')}</button>
    </div>`;
    }
    return `
    <div id="${escAttr(blockId)}" class="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border p-6 md:p-8 text-center" data-mode="recall" data-recall-phase="answer">
        <p class="text-[10px] font-black uppercase text-violet-500 mb-3">${escHtml(ui.quizModeRecall || 'Recuerdo')}</p>
        <p class="text-lg font-bold text-slate-500 dark:text-slate-400 mb-1">${escHtml(c.core_concept)}</p>
        <p class="text-2xl md:text-3xl font-black text-emerald-700 dark:text-emerald-300 mb-6">${escHtml(c.correct_answer)}</p>
        <p class="text-sm text-slate-500 mb-4">${escHtml(ui.quizRecallPrompt || '¿Recuerdas la respuesta?')}</p>
        <div class="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
            <button type="button" class="btn-quizv2-recall flex-1 px-6 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold" data-id="${escAttr(blockId)}" data-correct="true">${escHtml(ui.quizRecallYes || 'Lo recuerdo')}</button>
            <button type="button" class="btn-quizv2-recall flex-1 px-6 py-4 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 font-bold" data-id="${escAttr(blockId)}" data-correct="false">${escHtml(ui.quizRecallNo || 'No lo recuerdo')}</button>
        </div>
    </div>`;
}

function renderMultiple(b, c, ui, blockId) {
    const correct = c.correct_answer;
    const options = shuffleOptions(
        blockId,
        buildQuizMultipleOptions(correct, c.traps, {
            concept: c.core_concept,
            mainQuestion: c.main_question || b.main_question,
            maxOptions: 4
        })
    );
    const optsHtml = options
        .map(
            (opt) =>
                `<button type="button" class="btn-quizv2-ans w-full text-left px-4 py-3.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 font-semibold hover:border-indigo-400" data-id="${escAttr(blockId)}" data-correct="${opt.correct ? 'true' : 'false'}">${escHtml(opt.text)}</button>`
        )
        .join('');
    return `
    <div id="${escAttr(blockId)}" class="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border p-6 md:p-8" data-mode="multiple">
        <p class="text-[10px] font-black uppercase text-purple-500 mb-2">${escHtml(ui.quizModeMultiple || 'Opción múltiple')}</p>
        <h3 class="text-lg font-bold mb-6">${escHtml(c.main_question || b.main_question)}</h3>
        <div class="flex flex-col gap-2">${optsHtml}</div>
    </div>`;
}

function renderChips(b, c, ui, state, blockId) {
    const words = c.correct_answer.split(/\s+/).filter(Boolean);
    const shuffled = shuffleOptions(`${blockId}-chips`, words);
    const picked = state.v2ChipOrder || [];
    const pool = shuffled.filter((w) => picked.filter((p) => p === w).length < shuffled.filter((x) => x === w).length);
    return `
    <div id="${escAttr(blockId)}" class="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border p-6 md:p-8" data-mode="chips">
        <p class="text-[10px] font-black uppercase text-amber-500 mb-2">${escHtml(ui.quizModeChips || 'Ordenar respuesta')}</p>
        <div class="min-h-[52px] p-3 border-2 border-dashed rounded-xl mb-4 flex flex-wrap gap-2 quizv2-chip-target" data-id="${escAttr(blockId)}">
            ${picked.map((w, i) => `<button type="button" class="quizv2-chip-picked px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium" data-id="${escAttr(blockId)}" data-pick-idx="${i}">${escHtml(w)}</button>`).join('')}
        </div>
        <div class="flex flex-wrap gap-2 justify-center mb-6">
            ${pool.map((w, i) => `<button type="button" class="quizv2-chip-pick px-3 py-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg text-sm" data-id="${escAttr(blockId)}" data-word="${escAttr(w)}">${escHtml(w)}</button>`).join('')}
        </div>
        <button type="button" class="btn-quizv2-chips-check w-full py-3 bg-emerald-600 text-white font-bold rounded-xl" data-id="${escAttr(blockId)}">${escHtml(ui.quizCheck || 'Comprobar')}</button>
    </div>`;
}

function renderSteps(b, c, ui, state, blockId) {
    const order = state.v2StepsOrder || shuffleOptions(`${blockId}-steps`, [...c.steps]);
    const items = order
        .map(
            (step, i) =>
                `<button type="button" class="quizv2-step-item w-full text-left p-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 mb-2 font-medium" data-id="${escAttr(blockId)}" data-step="${escAttr(step)}" data-pos="${i}">${escHtml(step)}</button>`
        )
        .join('');
    return `
    <div id="${escAttr(blockId)}" class="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border p-6 md:p-8" data-mode="steps">
        <p class="text-[10px] font-black uppercase text-amber-500 mb-2">${escHtml(ui.quizModeSteps || 'Ordenar pasos')}</p>
        <p class="text-sm text-slate-500 mb-4">${escHtml(ui.quizStepsHint || 'Pulsa en orden correcto (de arriba a abajo).')}</p>
        <div class="quizv2-steps-play space-y-1 mb-4">${items}</div>
        <button type="button" class="btn-quizv2-steps-check w-full py-3 bg-emerald-600 text-white font-bold rounded-xl" data-id="${escAttr(blockId)}">${escHtml(ui.quizCheck || 'Comprobar')}</button>
    </div>`;
}

/**
 * @param {object} b quiz block
 * @param {object} ui
 * @param {object} state quiz state
 * @param {object} context render context
 */
export function renderQuizV2Challenge(b, ui, state, context = {}) {
    const blockId = b.id || 'quiz-v2';
    const c = challengeFromBlock(b);
    const modes = getPlayableModes(c);

    if (!state.started) {
        return renderIntro(b, ui, blockId, modes);
    }
    if (state.finished && state.v2Answered) {
        return renderFinished(b, ui, state, blockId, context);
    }

    const mode = state.v2Mode || pickStudyQuizMode(c, blockId);
    switch (mode) {
        case QUIZ_MODE_CLOZE:
            return renderCloze(b, c, ui, state, blockId);
        case QUIZ_MODE_RECALL:
            return renderRecall(b, c, ui, blockId, state);
        case QUIZ_MODE_CHIPS:
            return renderChips(b, c, ui, state, blockId);
        case QUIZ_MODE_STEPS:
            return renderSteps(b, c, ui, state, blockId);
        case QUIZ_MODE_MULTIPLE:
        default:
            return renderMultiple(b, c, ui, blockId);
    }
}

export { RECALL_ADVANCE_MS };

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
