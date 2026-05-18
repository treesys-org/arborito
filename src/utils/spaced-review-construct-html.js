import { escAttr, escHtml } from './html-escape.js';

/**
 * Toggle compacto de repaso en la cabecera de lección (modo construcción).
 * @param {object} ui
 * @param {{ repaso: boolean }} values
 */
export function spacedReviewConstructPanelHtml(ui, values) {
    const v = values || {};
    const checked = v.repaso ? ' checked' : '';
    const label = ui.constructRepasoToggle || 'Recordar';
    const hint =
        ui.constructRepasoHint ||
        'Te avisamos cuando toque repasar. La evaluación V2 define el ritmo al estudiar.';
    return `
    <label class="arborito-lesson-repaso-chip shrink-0" title="${escAttr(hint)}">
        <input type="checkbox" id="inp-lesson-spaced-review" class="arborito-lesson-repaso-chip__input"${checked} />
        <span class="arborito-lesson-repaso-chip__face" aria-hidden="true">🔔</span>
        <span class="arborito-lesson-repaso-chip__label">${escHtml(label)}</span>
    </label>`;
}
