/**
 * Authoring wizard for Quiz V2 (ported from EJEMPLO QUIZ TeacherForm).
 */

import { store } from '../store.js';
import { escAttr, escHtml } from './html-escape.js';
import {
    emptyChallenge,
    normalizeChallenge,
    isQuizV2ChallengeComplete,
    getPlayableModes
} from './quiz-v2-schema.js';

function esc(s) {
    return escAttr(s);
}

/**
 * @param {import('./quiz-v2-schema.js').QuizChallenge} challenge
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
                <input type="text" class="quizv2-step-input flex-1 p-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 dark:text-white" value="${esc(step)}" placeholder="${esc(ui.quizWizardStepPh || 'Paso…')}" />
                <button type="button" class="quizv2-step-remove p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg" title="${esc(ui.delete || 'Eliminar')}">✕</button>
            </div>`
        )
        .join('');

    const modesPreview = getPlayableModes(c)
        .map((m) => `<span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">${escHtml(m)}</span>`)
        .join(' ');

    const complete = isQuizV2ChallengeComplete(c);
    const statusColor = complete
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    const statusText = complete
        ? ui.lessonQuizV2StatusComplete || 'Listo'
        : ui.lessonQuizV2StatusIncomplete || 'Incompleto';

    return `
    <div class="edit-block-wrapper arborito-quizv2-edit my-6 rounded-3xl border-2 border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-lg dark:shadow-2xl overflow-hidden" contenteditable="false" data-quizv2-block="true">
        <div class="arborito-quizv2-drag-handle flex items-center gap-2 px-4 py-2 border-b border-indigo-200 dark:border-indigo-800/80 bg-indigo-50 dark:bg-indigo-950/80 cursor-grab" draggable="true">
            <span aria-hidden="true">⠿</span>
            <span class="text-[10px] font-black uppercase tracking-wide text-indigo-700 dark:text-indigo-200">${escHtml(ui.lessonQuizV2DragLabel || 'Mover cuestionario')}</span>
            <span class="quizv2-status-badge ml-auto px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${statusColor}">${escHtml(statusText)}</span>
            <button type="button" class="remove-btn text-rose-400 hover:text-rose-300 text-sm font-bold px-2" onclick="this.closest('.arborito-quizv2-edit').remove()">🗑</button>
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
                <h3 class="text-lg font-black text-slate-900 dark:text-white mb-1">📖 ${escHtml(ui.quizWizardStep1Title || 'Conceptos básicos')}</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 mb-4">${escHtml(ui.quizWizardStep1Desc || 'Tema, definición y huecos opcionales.')}</p>
                <label class="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">${escHtml(ui.editorBlockCoreConcept || 'Tema principal')}</label>
                <input type="text" class="quizv2-core-input w-full p-3 mb-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 text-slate-900 dark:text-white" value="${esc(c.core_concept)}" />
                <label class="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">${escHtml(ui.editorBlockShortDef || 'Definición')}</label>
                <textarea class="quizv2-def-input w-full p-3 mb-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 text-slate-900 dark:text-white resize-none h-24">${escHtml(c.short_definition)}</textarea>
                <div class="quizv2-cloze-panel ${words.length ? '' : 'hidden'} rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-950/40 p-4 mb-2">
                    <p class="text-xs text-indigo-700 dark:text-indigo-200 mb-2">${escHtml(ui.quizWizardClozeHint || 'Clic en palabras para ocultarlas en el juego de huecos:')}</p>
                    <div class="quizv2-cloze-words flex flex-wrap gap-2">${clozeWords}</div>
                </div>
                <div class="flex justify-end mt-4">
                    <button type="button" class="quizv2-wiz-next px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold text-sm">${escHtml(ui.next || 'Siguiente')} →</button>
                </div>
            </div>

            <div class="quizv2-wizard-panel hidden" data-panel="2">
                <h3 class="text-lg font-black text-slate-900 dark:text-white mb-1">❓ ${escHtml(ui.quizWizardStep2Title || 'Mini-prueba')}</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 mb-4">${escHtml(ui.quizWizardStep2Desc || 'Pregunta de opción múltiple (opcional).')}</p>
                <label class="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">${escHtml(ui.editorBlockMainQuestion || 'Pregunta')}</label>
                <input type="text" class="quizv2-question-input w-full p-3 mb-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 text-slate-900 dark:text-white" value="${esc(c.main_question)}" />
                <label class="block text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-1">✓ ${escHtml(ui.editorBlockCorrectAnswer || 'Respuesta correcta')}</label>
                <input type="text" class="quizv2-correct-input w-full p-3 mb-3 rounded-xl border border-emerald-300 dark:border-emerald-600/50 bg-white dark:bg-slate-950 text-emerald-800 dark:text-emerald-100" value="${esc(c.correct_answer)}" />
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
                <div class="flex justify-between gap-2 mt-4 flex-wrap">
                    <button type="button" class="quizv2-wiz-prev px-4 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-bold text-sm">← ${escHtml(ui.back || 'Anterior')}</button>
                    <div class="flex gap-2">
                        <button type="button" class="quizv2-wiz-skip-multiple px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-bold">${escHtml(ui.quizWizardSkipMultiple || 'Omitir')}</button>
                        <button type="button" class="quizv2-wiz-next px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold text-sm">${escHtml(ui.next || 'Siguiente')} →</button>
                    </div>
                </div>
            </div>

            <div class="quizv2-wizard-panel hidden" data-panel="3">
                <h3 class="text-lg font-black text-slate-900 dark:text-white mb-1">🧩 ${escHtml(ui.quizWizardStep3Title || 'Desafío final')}</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 mb-4">${escHtml(ui.quizWizardStep3Desc || 'Ordenar palabras o pasos (opcional).')}</p>
                <div class="grid grid-cols-2 gap-2 mb-4">
                    <button type="button" class="quizv2-mode-chips p-3 rounded-xl border-2 text-left text-sm font-bold ${c.answer_mode !== 'steps' ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400'}" data-mode="chips">${escHtml(ui.quizWizardModeChips || 'Ordenar respuesta')}</button>
                    <button type="button" class="quizv2-mode-steps p-3 rounded-xl border-2 text-left text-sm font-bold ${c.answer_mode === 'steps' ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400'}" data-mode="steps">${escHtml(ui.quizWizardModeSteps || 'Ordenar secuencia')}</button>
                </div>
                <div class="quizv2-steps-wrap ${c.answer_mode === 'steps' ? '' : 'hidden'}">
                    <div class="quizv2-steps-list space-y-1 mb-2">${stepsHtml}</div>
                    <button type="button" class="quizv2-add-step text-xs font-bold text-amber-400 hover:underline mb-4">+ ${escHtml(ui.quizWizardAddStep || 'Añadir paso')}</button>
                </div>
                <p class="text-[10px] text-slate-500 mb-2">${escHtml(ui.quizWizardModesLabel || 'Modos activos para el alumno:')} ${modesPreview || '—'}</p>
                <div class="flex justify-between gap-2 mt-4 flex-wrap">
                    <button type="button" class="quizv2-wiz-prev px-4 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-bold text-sm">← ${escHtml(ui.back || 'Anterior')}</button>
                    <button type="button" class="quizv2-wiz-skip-ordering px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-bold">${escHtml(ui.quizWizardSkipOrdering || 'Omitir')}</button>
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

/** @param {HTMLElement} block */
function migrateQuizV2BlockIfNeeded(block) {
    if (!block?.classList?.contains('arborito-quizv2-edit')) return block;
    if (block.querySelector('.quizv2-wizard')) return block;
    const ch = readQuizV2Wizard(block);
    const wrap = document.createElement('div');
    wrap.innerHTML = buildQuizV2WizardHtml(ch);
    const fresh = wrap.querySelector('.arborito-quizv2-edit');
    if (!fresh) return block;
    if (block.dataset.skipMultiple === '1') fresh.dataset.skipMultiple = '1';
    if (block.dataset.skipOrdering === '1') fresh.dataset.skipOrdering = '1';
    block.replaceWith(fresh);
    return fresh;
}

/**
 * Migrate legacy blocks, bind wizard controls, and return the live block node.
 * @param {HTMLElement} block
 */
export function ensureAndBindQuizV2Wizard(block) {
    if (!block) return null;
    const live = migrateQuizV2BlockIfNeeded(block);
    if (live.dataset.quizv2Bound === '1') return live;
    bindQuizV2Wizard(live);
    return live;
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
export function bindQuizV2Wizard(block) {
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
        defInput.addEventListener('input', () => refreshClozePanel(wizard));
    }
    wizard.addEventListener('click', (e) => {
        const clozeBtn = e.target.closest('.quizv2-cloze-word');
        if (clozeBtn) {
            clozeBtn.classList.toggle('bg-indigo-600');
            clozeBtn.classList.toggle('text-white');
            clozeBtn.classList.toggle('bg-slate-700');
            clozeBtn.classList.toggle('text-slate-200');
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
    });

    wizard.querySelector('.quizv2-add-step')?.addEventListener('click', () => {
        const list = wizard.querySelector('.quizv2-steps-list');
        if (!list) return;
        const idx = list.querySelectorAll('.quizv2-step-row').length;
        const row = document.createElement('div');
        row.className = 'quizv2-step-row flex gap-3 items-center mb-2';
        row.innerHTML = `<span class="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-bold shrink-0">${idx + 1}</span><input type="text" class="quizv2-step-input flex-1 p-3 rounded-xl border border-slate-600 bg-slate-950 text-white" /><button type="button" class="quizv2-step-remove p-2 text-rose-500">✕</button>`;
        list.appendChild(row);
    });

    wizard.addEventListener('click', (e) => {
        if (e.target.closest('.quizv2-step-remove')) {
            e.target.closest('.quizv2-step-row')?.remove();
        }
    });

    const setMode = (mode) => {
        const chips = wizard.querySelector('.quizv2-mode-chips');
        const steps = wizard.querySelector('.quizv2-mode-steps');
        const wrap = wizard.querySelector('.quizv2-steps-wrap');
        const on = mode === 'steps';
        chips?.classList.toggle('border-amber-500', !on);
        chips?.classList.toggle('bg-amber-500/10', !on);
        steps?.classList.toggle('border-amber-500', on);
        steps?.classList.toggle('bg-amber-500/10', on);
        wrap?.classList.toggle('hidden', !on);
    };
    wizard.querySelector('.quizv2-mode-chips')?.addEventListener('click', () => setMode('chips'));
    wizard.querySelector('.quizv2-mode-steps')?.addEventListener('click', () => setMode('steps'));

    wizard.querySelector('.quizv2-wiz-skip-multiple')?.addEventListener('click', () => {
        block.dataset.skipMultiple = '1';
        wizard.querySelector('.quizv2-question-input').value = '';
        wizard.querySelectorAll('.quizv2-trap-input').forEach((i) => {
            i.value = '';
        });
        go(3);
    });
    wizard.querySelector('.quizv2-wiz-skip-ordering')?.addEventListener('click', () => {
        block.dataset.skipOrdering = '1';
        go(3);
    });
}
