/**
 * Authoring wizard for Quiz V2 (challenge schema).
 *
 * Three panels:
 *   1. Concept & answer  — required (core_concept, short_definition, correct_answer, optional cloze).
 *   2. Multiple choice   — optional (main_question + traps). Soft-skip toggles a flag, never destroys data.
 *   3. Order & sequence  — optional (chips from correct_answer or custom steps). Soft-skip too.
 *
 * Design goals:
 *   - Make `correct_answer` visible up front because it powers Recall, Cloze and Chips.
 *   - Show a persistent mode-coverage strip so the teacher knows which Quiz V2 modes are
 *     reachable with the current data.
 *   - Skip flags survive a re-render: `data-skip-multiple` / `data-skip-ordering` are written
 *     onto the wrapper from the normalised challenge, and Re-enable buttons clear them.
 */

import { store } from '../../core/store.js';
import { escAttr, escHtml, escHtml as esc } from '../../shared/lib/html-escape.js';
import {
    QUIZ_MODE_CLOZE,
    QUIZ_MODE_MULTIPLE,
    QUIZ_MODE_RECALL,
    QUIZ_MODE_CHIPS,
    QUIZ_MODE_STEPS,
    ALL_QUIZ_MODES,
    emptyChallenge,
    normalizeChallenge,
    isQuizV2ChallengeComplete,
    getPlayableModes
} from '../learning/quiz-v2-schema.js';

const MODE_ICONS = {
    [QUIZ_MODE_RECALL]: '🧠',
    [QUIZ_MODE_CLOZE]: '🧩',
    [QUIZ_MODE_MULTIPLE]: '🔘',
    [QUIZ_MODE_CHIPS]: '🔤',
    [QUIZ_MODE_STEPS]: '📋'
};

function modeLabel(ui, mode) {
    switch (mode) {
        case QUIZ_MODE_RECALL: return ui.quizModeRecall || 'Recall';
        case QUIZ_MODE_CLOZE: return ui.quizModeCloze || 'Cloze';
        case QUIZ_MODE_MULTIPLE: return ui.quizModeMultiple || 'Multiple';
        case QUIZ_MODE_CHIPS: return ui.quizModeChips || 'Chips';
        case QUIZ_MODE_STEPS: return ui.quizModeSteps || 'Steps';
        default: return mode;
    }
}

function buildCoverageStripHtml(c, ui) {
    const playable = new Set(getPlayableModes(c));
    return ALL_QUIZ_MODES
        .map((m) => {
            const on = playable.has(m);
            const cls = on
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200 border-emerald-400'
                : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 border-slate-300 dark:border-slate-700';
            return `<span class="quizv2-mode-pill inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${cls}" data-mode="${esc(m)}" data-on="${on ? '1' : '0'}"><span aria-hidden="true">${MODE_ICONS[m] || '·'}</span>${escHtml(modeLabel(ui, m))}</span>`;
        })
        .join(' ');
}

/**
 * @param {import('../learning/quiz-v2-schema.js').QuizChallenge} challenge
 */
export function buildQuizV2WizardHtml(challenge) {
    const ui = store.ui || {};
    const c = normalizeChallenge(challenge);
    const traps = c.traps.length ? c.traps : ['', ''];
    while (traps.length < 2) traps.push('');

    const words = c.short_definition ? c.short_definition.split(/\s+/).filter(Boolean) : [];
    const clozeSet = new Set(c.cloze_indices);

    const clozeWords =
        words.length > 0
            ? words
                  .map(
                      (word, idx) => `
                <button type="button" class="quizv2-cloze-word px-3 py-1 rounded-md font-medium transition-all text-sm ${
                    clozeSet.has(idx)
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600'
                }" data-idx="${idx}">${escHtml(word)}</button>`
                  )
                  .join('')
            : '';

    const stepsHtml = (c.steps.length ? c.steps : ['', ''])
        .map(
            (step, idx) => `
            <div class="quizv2-step-row flex gap-3 items-center mb-2" data-step-idx="${idx}">
                <span class="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center text-sm font-bold shrink-0">${idx + 1}</span>
                <input type="text" class="quizv2-step-input arborito-input flex-1" value="${esc(step)}" placeholder="${esc(ui.quizWizardStepPh || 'Paso…')}" />
                <button type="button" class="quizv2-step-remove p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg" title="${esc(ui.delete || 'Eliminar')}">✕</button>
            </div>`
        )
        .join('');

    const coverageStrip = buildCoverageStripHtml(c, ui);
    const coverageLabel = ui.quizWizardModeCoverage || 'Available modes';

    const complete = isQuizV2ChallengeComplete(c);
    const statusColor = complete
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    const statusText = complete
        ? ui.lessonQuizV2StatusComplete || 'Listo'
        : ui.lessonQuizV2StatusIncomplete || 'Incompleto';

    /* The skip flags are also rendered as data-attrs so they survive a re-render
       (previously they only lived in `block.dataset` after the user clicked Skip,
       and the next render reset them silently). */
    const skipMultiAttr = c.skip_multiple ? 'data-skip-multiple="1"' : '';
    const skipOrderAttr = c.skip_ordering ? 'data-skip-ordering="1"' : '';

    const skipMultipleBanner = c.skip_multiple
        ? `<div class="quizv2-skip-banner mb-3 px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-600/40 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-xs flex items-center justify-between gap-3">
                <span>${escHtml(ui.quizWizardSkipMultipleSet || 'Multiple choice skipped.')}</span>
                <button type="button" class="quizv2-wiz-enable-multiple px-2.5 py-1 rounded-md bg-white/80 dark:bg-slate-900/40 text-amber-700 dark:text-amber-200 text-[10px] font-black uppercase tracking-wide border border-amber-400/50 hover:bg-white dark:hover:bg-slate-900">${escHtml(ui.quizWizardEnableMultiple || 'Re-enable')}</button>
            </div>`
        : '';

    const skipOrderingBanner = c.skip_ordering
        ? `<div class="quizv2-skip-banner mb-3 px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-600/40 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-xs flex items-center justify-between gap-3">
                <span>${escHtml(ui.quizWizardSkipOrderingSet || 'Ordering skipped.')}</span>
                <button type="button" class="quizv2-wiz-enable-ordering px-2.5 py-1 rounded-md bg-white/80 dark:bg-slate-900/40 text-amber-700 dark:text-amber-200 text-[10px] font-black uppercase tracking-wide border border-amber-400/50 hover:bg-white dark:hover:bg-slate-900">${escHtml(ui.quizWizardEnableOrdering || 'Re-enable')}</button>
            </div>`
        : '';

    return `
    <div class="edit-block-wrapper arborito-quizv2-edit my-6 rounded-3xl border-2 border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-lg dark:shadow-2xl overflow-hidden" contenteditable="false" data-quizv2-block="true" data-arbor-tour="lesson-edit-wizard" ${skipMultiAttr} ${skipOrderAttr}>
        <div class="arborito-quizv2-drag-handle flex items-center gap-2 px-4 py-2 border-b border-indigo-200 dark:border-indigo-800/80 bg-indigo-50 dark:bg-indigo-950/80 cursor-grab" draggable="true">
            <span aria-hidden="true">⠿</span>
            <span class="arborito-eyebrow text-indigo-700 dark:text-indigo-200">${escHtml(ui.lessonQuizV2DragLabel || 'Mover cuestionario')}</span>
            <span class="quizv2-status-badge ml-auto px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${statusColor}">${escHtml(statusText)}</span>
            <button type="button" class="remove-btn text-rose-400 hover:text-rose-300 text-sm font-bold px-2" onclick="this.closest('.arborito-quizv2-edit').remove()">🗑</button>
        </div>

        <div class="quizv2-coverage px-4 py-2 border-b border-indigo-100 dark:border-indigo-900/60 bg-white/70 dark:bg-slate-900/60 flex items-center gap-2 flex-wrap">
            <span class="arborito-eyebrow text-slate-500 dark:text-slate-400">${escHtml(coverageLabel)}</span>
            <span class="quizv2-coverage-strip flex flex-wrap gap-1.5">${coverageStrip}</span>
        </div>

        <div class="quizv2-wizard px-4 py-4 md:px-8 md:py-6" data-step="1">
            <div class="flex items-center justify-between gap-2 mb-6">
                ${[1, 2, 3]
                    .map(
                        (n) => `
                <button type="button" class="quizv2-wiz-step-dot w-10 h-10 rounded-full font-bold border-2 transition-colors ${
                    n === 1
                        ? 'bg-indigo-600 border-indigo-400 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500'
                }" data-goto="${n}">${n}</button>`
                    )
                    .join('<div class="flex-1 h-0.5 bg-slate-200 dark:bg-slate-700 mx-1"></div>')}
            </div>

            <div class="quizv2-wizard-panel" data-panel="1">
                <h3 class="text-lg font-black text-slate-900 dark:text-white mb-1">📖 ${escHtml(ui.quizWizardStep1Title || 'Concepto y respuesta')}</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 mb-4">${escHtml(ui.quizWizardStep1Desc || 'Tema, definición, respuesta y huecos opcionales.')}</p>
                <label class="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">${escHtml(ui.editorBlockCoreConcept || 'Tema principal')}</label>
                <input type="text" class="quizv2-core-input arborito-input mb-3" value="${esc(c.core_concept)}" />
                <label class="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">${escHtml(ui.editorBlockShortDef || 'Definición')}</label>
                <textarea class="quizv2-def-input arborito-input arborito-textarea mb-3 resize-none h-24">${escHtml(c.short_definition)}</textarea>
                <label class="block text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-1">✓ ${escHtml(ui.editorBlockCorrectAnswer || 'Respuesta correcta')}</label>
                <input type="text" class="quizv2-correct-input w-full p-3 mb-1 rounded-xl border border-emerald-300 dark:border-emerald-600/50 bg-white dark:bg-slate-950 text-emerald-800 dark:text-emerald-100" value="${esc(c.correct_answer)}" />
                <p class="text-[11px] text-slate-500 dark:text-slate-400 mb-3">${escHtml(ui.quizWizardCorrectAnswerHint || 'Esta respuesta se reutiliza en Recuerdo, Huecos y Ordenar palabras.')}</p>
                <div class="quizv2-cloze-panel ${words.length ? '' : 'hidden'} rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-950/40 p-4 mb-2">
                    <p class="text-xs text-indigo-700 dark:text-indigo-200 mb-2">${escHtml(ui.quizWizardClozeHint || 'Clic en palabras para ocultarlas en el juego de huecos:')}</p>
                    <div class="quizv2-cloze-words flex flex-wrap gap-2">${clozeWords}</div>
                </div>
                <div class="flex justify-end mt-4">
                    <button type="button" class="quizv2-wiz-next arborito-cta-indigo px-5 py-2.5 rounded-xl font-bold text-sm">${escHtml(ui.next || 'Siguiente')} →</button>
                </div>
            </div>

            <div class="quizv2-wizard-panel hidden" data-panel="2">
                <h3 class="text-lg font-black text-slate-900 dark:text-white mb-1">❓ ${escHtml(ui.quizWizardStep2Title || 'Opción múltiple (opcional)')}</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">${escHtml(ui.quizWizardStep2Desc || 'Pregunta con opciones falsas. Puedes omitirla.')}</p>
                ${skipMultipleBanner}
                <div class="quizv2-multiple-form ${c.skip_multiple ? 'opacity-60' : ''}">
                    <label class="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">${escHtml(ui.editorBlockMainQuestion || 'Pregunta')}</label>
                    <input type="text" class="quizv2-question-input arborito-input mb-3" value="${esc(c.main_question)}" />
                    <p class="text-[11px] text-slate-500 dark:text-slate-400 mb-2">${escHtml(ui.quizWizardStepHelpMultiple || 'Multiple choice: question + distractors as wrong answers.')}</p>
                    <p class="text-xs font-bold text-rose-400 mb-2">${escHtml(ui.editorBlockTraps || 'Trampas')}</p>
                    <div class="quizv2-traps-container space-y-2 mb-2">
                        ${traps
                            .map(
                                (t) => `
                        <div class="trap-row flex gap-2 items-center">
                            <span class="text-rose-500">✗</span>
                            <input type="text" class="quizv2-trap-input flex-1 p-2 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-white dark:bg-slate-950 text-rose-800 dark:text-rose-100" value="${esc(t)}" />
                        </div>`
                            )
                            .join('')}
                    </div>
                    <button type="button" class="quizv2-add-trap text-xs font-bold text-rose-400 hover:underline mb-4">+ ${escHtml(ui.lessonQuizV2AddTrap || 'Agregar trampa')}</button>
                </div>
                <div class="flex justify-between gap-2 mt-4 flex-wrap">
                    <button type="button" class="quizv2-wiz-prev px-4 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-bold text-sm">← ${escHtml(ui.back || 'Anterior')}</button>
                    <div class="flex gap-2">
                        <button type="button" class="quizv2-wiz-skip-multiple px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-bold ${c.skip_multiple ? 'hidden' : ''}">${escHtml(ui.quizWizardSkipMultiple || 'Omitir opción múltiple')}</button>
                        <button type="button" class="quizv2-wiz-next arborito-cta-indigo px-5 py-2.5 rounded-xl font-bold text-sm">${escHtml(ui.next || 'Siguiente')} →</button>
                    </div>
                </div>
            </div>

            <div class="quizv2-wizard-panel hidden" data-panel="3">
                <h3 class="text-lg font-black text-slate-900 dark:text-white mb-1">🧩 ${escHtml(ui.quizWizardStep3Title || 'Orden y secuencia (opcional)')}</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">${escHtml(ui.quizWizardStep3Desc || 'Ordenar palabras o pasos. Puedes omitirlos.')}</p>
                ${skipOrderingBanner}
                <div class="quizv2-ordering-form ${c.skip_ordering ? 'opacity-60' : ''}">
                    <div class="grid grid-cols-2 gap-2 mb-4">
                        <button type="button" class="quizv2-mode-chips p-3 rounded-xl border-2 text-left text-sm font-bold ${c.answer_mode !== 'steps' ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400'}" data-mode="chips">${escHtml(ui.quizWizardModeChips || 'Ordenar respuesta')}</button>
                        <button type="button" class="quizv2-mode-steps p-3 rounded-xl border-2 text-left text-sm font-bold ${c.answer_mode === 'steps' ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400'}" data-mode="steps">${escHtml(ui.quizWizardModeSteps || 'Ordenar secuencia')}</button>
                    </div>
                    <p class="quizv2-chips-hint text-[11px] text-slate-500 dark:text-slate-400 mb-3 ${c.answer_mode === 'steps' ? 'hidden' : ''}">${escHtml(ui.quizWizardChipsAutoHint || 'Las palabras de la respuesta correcta se barajan; activa solo si tiene varias palabras.')}</p>
                    <div class="quizv2-steps-wrap ${c.answer_mode === 'steps' ? '' : 'hidden'}">
                        <p class="text-[11px] text-slate-500 dark:text-slate-400 mb-2">${escHtml(ui.quizWizardStepHelpSteps || 'Sequence: the student orders procedural steps.')}</p>
                        <div class="quizv2-steps-list space-y-1 mb-2">${stepsHtml}</div>
                        <button type="button" class="quizv2-add-step text-xs font-bold text-amber-400 hover:underline mb-4">+ ${escHtml(ui.quizWizardAddStep || 'Añadir paso')}</button>
                    </div>
                </div>
                <div class="flex justify-between gap-2 mt-4 flex-wrap">
                    <button type="button" class="quizv2-wiz-prev px-4 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-bold text-sm">← ${escHtml(ui.back || 'Anterior')}</button>
                    <div class="flex gap-2">
                        <button type="button" class="quizv2-wiz-skip-ordering px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-bold ${c.skip_ordering ? 'hidden' : ''}">${escHtml(ui.quizWizardSkipOrdering || 'Omitir')}</button>
                        <button type="button" class="quizv2-wiz-done arborito-cta-emerald px-5 py-2.5 rounded-xl font-bold text-sm">${escHtml(ui.quizWizardDone || 'Listo')} ✓</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <p><br></p>`;
}

function showWizardStep(root, step) {
    root.dataset.step = String(step);
    root.querySelectorAll('.quizv2-wizard-panel').forEach((p) => {
        p.classList.toggle('hidden', p.dataset.panel !== String(step));
    });
    root.querySelectorAll('.quizv2-wiz-step-dot').forEach((dot) => {
        const n = parseInt(dot.dataset.goto, 10);
        const active = n === step;
        dot.className = `quizv2-wiz-step-dot w-10 h-10 rounded-full font-bold border-2 transition-colors ${
            active
                ? 'bg-indigo-600 border-indigo-400 text-white'
                : n < step
                  ? 'bg-indigo-100 dark:bg-indigo-900 border-indigo-300 dark:border-indigo-600 text-indigo-700 dark:text-indigo-200'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500'
        }`;
    });
}

function refreshClozePanel(root) {
    const def = root.querySelector('.quizv2-def-input');
    const panel = root.querySelector('.quizv2-cloze-panel');
    const wordsEl = root.querySelector('.quizv2-cloze-words');
    if (!def || !panel || !wordsEl) return;
    const words = def.value.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
        panel.classList.add('hidden');
        return;
    }
    panel.classList.remove('hidden');
    const selected = new Set(
        Array.from(wordsEl.querySelectorAll('.quizv2-cloze-word.bg-indigo-600')).map((b) =>
            parseInt(b.dataset.idx, 10)
        )
    );
    wordsEl.innerHTML = words
        .map(
            (word, idx) =>
                `<button type="button" class="quizv2-cloze-word px-3 py-1 rounded-md font-medium text-sm ${
                    selected.has(idx)
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600'
                }" data-idx="${idx}">${escHtml(word)}</button>`
        )
        .join('');
}

/** @param {HTMLElement} block */
export function readQuizV2Wizard(block) {
    const c = emptyChallenge();
    if (!block) return c;
    c.core_concept = (block.querySelector('.quizv2-core-input')?.value || '').trim();
    c.short_definition = (block.querySelector('.quizv2-def-input')?.value || '').trim();
    c.main_question = (block.querySelector('.quizv2-question-input')?.value || '').trim();
    c.correct_answer = (block.querySelector('.quizv2-correct-input')?.value || '').trim();
    c.traps = Array.from(block.querySelectorAll('.quizv2-trap-input'))
        .map((i) => i.value.trim())
        .filter(Boolean);
    c.cloze_indices = Array.from(block.querySelectorAll('.quizv2-cloze-word.bg-indigo-600'))
        .map((b) => parseInt(b.dataset.idx, 10))
        .filter((n) => !Number.isNaN(n));
    c.answer_mode = block.querySelector('.quizv2-mode-steps')?.classList.contains('border-amber-500')
        ? 'steps'
        : 'chips';
    c.steps = Array.from(block.querySelectorAll('.quizv2-step-input'))
        .map((i) => i.value.trim())
        .filter(Boolean);
    c.skip_multiple = block.dataset.skipMultiple === '1';
    c.skip_ordering = block.dataset.skipOrdering === '1';
    const modes = getPlayableModes(c);
    c.modes = modes;
    return normalizeChallenge(c);
}

function refreshCoverageStrip(block) {
    const strip = block.querySelector('.quizv2-coverage-strip');
    if (!strip) return;
    const ui = store.ui || {};
    const c = readQuizV2Wizard(block);
    strip.innerHTML = buildCoverageStripHtml(c, ui);
    const badge = block.querySelector('.quizv2-status-badge');
    if (badge) {
        const complete = isQuizV2ChallengeComplete(c);
        badge.textContent = complete
            ? ui.lessonQuizV2StatusComplete || 'Listo'
            : ui.lessonQuizV2StatusIncomplete || 'Incompleto';
        badge.classList.toggle('bg-emerald-100', complete);
        badge.classList.toggle('text-emerald-700', complete);
        badge.classList.toggle('dark:bg-emerald-900/30', complete);
        badge.classList.toggle('dark:text-emerald-300', complete);
        badge.classList.toggle('bg-amber-100', !complete);
        badge.classList.toggle('text-amber-700', !complete);
        badge.classList.toggle('dark:bg-amber-900/30', !complete);
        badge.classList.toggle('dark:text-amber-300', !complete);
    }
}

/**
 * Bind wizard controls onto a freshly rendered quiz-v2 edit block.
 * @param {HTMLElement} block
 */
export function ensureAndBindQuizV2Wizard(block) {
    if (!block) return null;
    if (block.dataset.quizv2Bound === '1') return block;
    bindQuizV2Wizard(block);
    return block;
}

/**
 * Event delegation so wizard navigation works after editor re-renders (existing trees).
 * @param {HTMLElement} editorEl
 */
export function bindQuizV2WizardDelegation(editorEl) {
    if (!editorEl || editorEl.dataset.quizv2Delegation === '1') return;
    editorEl.dataset.quizv2Delegation = '1';
    editorEl.addEventListener('click', (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        const block = t.closest('.arborito-quizv2-edit');
        if (!block) return;
        const wizard = block.querySelector('.quizv2-wizard');
        if (!wizard) return;
        const go = (step) => showWizardStep(wizard, step);
        const cur = () => parseInt(wizard.dataset.step || '1', 10);
        if (t.closest('.quizv2-wiz-next')) {
            e.preventDefault();
            go(Math.min(3, cur() + 1));
            return;
        }
        if (t.closest('.quizv2-wiz-prev')) {
            e.preventDefault();
            go(Math.max(1, cur() - 1));
            return;
        }
        const dot = t.closest('.quizv2-wiz-step-dot');
        if (dot?.dataset.goto) {
            e.preventDefault();
            go(parseInt(dot.dataset.goto, 10));
        }
    });
}

/** @param {HTMLElement} block */
function bindQuizV2Wizard(block) {
    if (!block) return;
    const wizard = block.querySelector('.quizv2-wizard');
    if (!wizard) return;
    if (block.dataset.quizv2Bound === '1') return;
    block.dataset.quizv2Bound = '1';

    const go = (step) => showWizardStep(wizard, step);

    wizard.querySelectorAll('.quizv2-wiz-next').forEach((btn) => {
        btn.addEventListener('click', () => {
            const cur = parseInt(wizard.dataset.step || '1', 10);
            go(Math.min(3, cur + 1));
        });
    });
    wizard.querySelectorAll('.quizv2-wiz-prev').forEach((btn) => {
        btn.addEventListener('click', () => {
            const cur = parseInt(wizard.dataset.step || '1', 10);
            go(Math.max(1, cur - 1));
        });
    });
    wizard.querySelectorAll('.quizv2-wiz-step-dot').forEach((dot) => {
        dot.addEventListener('click', () => go(parseInt(dot.dataset.goto, 10)));
    });

    const defInput = wizard.querySelector('.quizv2-def-input');
    if (defInput) {
        defInput.addEventListener('input', () => {
            refreshClozePanel(wizard);
            refreshCoverageStrip(block);
        });
    }
    /* Coverage strip stays in sync with every keystroke that affects playability. */
    const refreshOnInputSelectors = [
        '.quizv2-core-input',
        '.quizv2-correct-input',
        '.quizv2-question-input',
        '.quizv2-trap-input',
        '.quizv2-step-input'
    ];
    block.addEventListener('input', (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        if (refreshOnInputSelectors.some((sel) => t.matches(sel))) {
            refreshCoverageStrip(block);
        }
    });

    wizard.addEventListener('click', (e) => {
        const clozeBtn = e.target.closest('.quizv2-cloze-word');
        if (clozeBtn) {
            clozeBtn.classList.toggle('bg-indigo-600');
            clozeBtn.classList.toggle('text-white');
            clozeBtn.classList.toggle('bg-slate-700');
            clozeBtn.classList.toggle('text-slate-200');
            refreshCoverageStrip(block);
        }
    });

    wizard.querySelector('.quizv2-add-trap')?.addEventListener('click', () => {
        const container = wizard.querySelector('.quizv2-traps-container');
        if (!container) return;
        const row = document.createElement('div');
        row.className = 'trap-row flex gap-2 items-center';
        row.innerHTML =
            '<span class="text-rose-500">✗</span><input type="text" class="quizv2-trap-input flex-1 p-2 rounded-lg border border-rose-900/50 bg-slate-950 text-rose-100" />';
        container.appendChild(row);
        row.querySelector('input')?.focus();
        refreshCoverageStrip(block);
    });

    wizard.querySelector('.quizv2-add-step')?.addEventListener('click', () => {
        const list = wizard.querySelector('.quizv2-steps-list');
        if (!list) return;
        const idx = list.querySelectorAll('.quizv2-step-row').length;
        const row = document.createElement('div');
        row.className = 'quizv2-step-row flex gap-3 items-center mb-2';
        row.innerHTML = `<span class="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-bold shrink-0">${idx + 1}</span><input type="text" class="quizv2-step-input arborito-input flex-1" /><button type="button" class="quizv2-step-remove p-2 text-rose-500">✕</button>`;
        list.appendChild(row);
        refreshCoverageStrip(block);
    });

    wizard.addEventListener('click', (e) => {
        if (e.target.closest('.quizv2-step-remove')) {
            e.target.closest('.quizv2-step-row')?.remove();
            refreshCoverageStrip(block);
        }
    });

    const setMode = (mode) => {
        const chips = wizard.querySelector('.quizv2-mode-chips');
        const steps = wizard.querySelector('.quizv2-mode-steps');
        const wrap = wizard.querySelector('.quizv2-steps-wrap');
        const chipsHint = wizard.querySelector('.quizv2-chips-hint');
        const on = mode === 'steps';
        chips?.classList.toggle('border-amber-500', !on);
        chips?.classList.toggle('bg-amber-500/10', !on);
        steps?.classList.toggle('border-amber-500', on);
        steps?.classList.toggle('bg-amber-500/10', on);
        wrap?.classList.toggle('hidden', !on);
        chipsHint?.classList.toggle('hidden', on);
        refreshCoverageStrip(block);
    };
    wizard.querySelector('.quizv2-mode-chips')?.addEventListener('click', () => setMode('chips'));
    wizard.querySelector('.quizv2-mode-steps')?.addEventListener('click', () => setMode('steps'));

    /* Soft skip: flag the block and visually fade the form, but never destroy authored data.
       The teacher can come back via Re-enable in the same panel. */
    wizard.querySelector('.quizv2-wiz-skip-multiple')?.addEventListener('click', () => {
        block.dataset.skipMultiple = '1';
        const form = wizard.querySelector('.quizv2-multiple-form');
        form?.classList.add('opacity-60');
        wizard.querySelector('.quizv2-wiz-skip-multiple')?.classList.add('hidden');
        refreshCoverageStrip(block);
        go(3);
    });
    wizard.querySelector('.quizv2-wiz-skip-ordering')?.addEventListener('click', () => {
        block.dataset.skipOrdering = '1';
        const form = wizard.querySelector('.quizv2-ordering-form');
        form?.classList.add('opacity-60');
        wizard.querySelector('.quizv2-wiz-skip-ordering')?.classList.add('hidden');
        refreshCoverageStrip(block);
    });

    wizard.addEventListener('click', (e) => {
        if (e.target.closest('.quizv2-wiz-enable-multiple')) {
            block.removeAttribute('data-skip-multiple');
            const banner = wizard.querySelector('[data-panel="2"] .quizv2-skip-banner');
            banner?.remove();
            wizard.querySelector('.quizv2-multiple-form')?.classList.remove('opacity-60');
            wizard.querySelector('.quizv2-wiz-skip-multiple')?.classList.remove('hidden');
            refreshCoverageStrip(block);
        }
        if (e.target.closest('.quizv2-wiz-enable-ordering')) {
            block.removeAttribute('data-skip-ordering');
            const banner = wizard.querySelector('[data-panel="3"] .quizv2-skip-banner');
            banner?.remove();
            wizard.querySelector('.quizv2-ordering-form')?.classList.remove('opacity-60');
            wizard.querySelector('.quizv2-wiz-skip-ordering')?.classList.remove('hidden');
            refreshCoverageStrip(block);
        }
    });

    /* "Done" focuses the editor again so the teacher can keep writing markdown below. */
    wizard.querySelector('.quizv2-wiz-done')?.addEventListener('click', () => {
        refreshCoverageStrip(block);
        const editor = block.closest('[contenteditable="true"]') || block.parentElement;
        if (editor && typeof editor.focus === 'function') editor.focus();
    });
}
