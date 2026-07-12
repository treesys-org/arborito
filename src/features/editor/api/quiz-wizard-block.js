import {
    QUIZ_MODE_CLOZE,
    QUIZ_MODE_MULTIPLE,
    QUIZ_MODE_RECALL,
    QUIZ_MODE_CHIPS,
    QUIZ_MODE_STEPS,
    emptyChallenge,
    normalizeChallenge,
} from '../../learning/api/quiz-schema.js';

/** Live challenge state for React-mounted quiz blocks (no DOM scraping). */
const challengeByBlock = new WeakMap();

export function setQuizChallengeOnBlock(block, challenge) {
    const c = normalizeChallenge(challenge);
    if (block) challengeByBlock.set(block, c);
    if (block) {
        try {
            block.setAttribute('data-quiz-challenge', JSON.stringify(c));
        } catch {
            /* quota / circular */
        }
    }
}

/** @param {HTMLElement} block */
export function clearQuizChallengeOnBlock(block) {
    if (block) challengeByBlock.delete(block);
}

/** @param {HTMLElement} block */
export function readQuizWizard(block) {
    if (!block) return emptyChallenge();
    const stored = challengeByBlock.get(block);
    if (stored) return stored;
    const raw = block.getAttribute('data-quiz-challenge');
    if (raw) {
        try {
            return normalizeChallenge(JSON.parse(raw));
        } catch {
            /* fall through */
        }
    }
    return emptyChallenge();
}

export function modeLabel(ui, mode) {
    switch (mode) {
        case QUIZ_MODE_RECALL:
            return ui.quizModeRecall || 'Recall';
        case QUIZ_MODE_CLOZE:
            return ui.quizModeCloze || 'Cloze';
        case QUIZ_MODE_MULTIPLE:
            return ui.quizModeMultiple || 'Multiple';
        case QUIZ_MODE_CHIPS:
            return ui.quizModeChips || 'Chips';
        case QUIZ_MODE_STEPS:
            return ui.quizModeSteps || 'Steps';
        default:
            return mode;
    }
}

/** Longer tooltip copy for mode coverage pills (locale: quizWizardStepHelp*). */
export function modeHelp(ui, mode) {
    switch (mode) {
        case QUIZ_MODE_RECALL:
            return ui.quizWizardStepHelpRecall || '';
        case QUIZ_MODE_CLOZE:
            return ui.quizWizardStepHelpCloze || '';
        case QUIZ_MODE_MULTIPLE:
            return ui.quizWizardStepHelpMultiple || '';
        case QUIZ_MODE_CHIPS:
            return ui.quizWizardStepHelpChips || '';
        case QUIZ_MODE_STEPS:
            return ui.quizWizardStepHelpSteps || '';
        default:
            return '';
    }
}

export function notifyQuizEditorChange(block) {
    const editor =
        block?.closest('#lesson-visual-editor') || block?.closest('[contenteditable="true"]');
    editor?.dispatchEvent(new Event('input', { bubbles: true }));
}

/** @param {HTMLElement} block */
export function getInitialQuizChallenge(block) {
    const raw = block.getAttribute('data-quiz-challenge');
    if (raw) {
        try {
            return normalizeChallenge(JSON.parse(raw));
        } catch {
            /* fall through */
        }
    }
    return readQuizWizard(block);
}

/**
 * Mount shell for a quiz block inside contentEditable; React mounts the wizard UI.
 * @param {import('../../learning/api/quiz-schema.js').QuizChallenge} challenge
 */
export function createQuizWizardMountShell(challenge) {
    const c = normalizeChallenge(challenge);
    const payload = JSON.stringify(c).replace(/"/g, '&quot;');
    const skipMultiAttr = c.skip_multiple ? ' data-skip-multiple="1"' : '';
    const skipOrderAttr = c.skip_ordering ? ' data-skip-ordering="1"' : '';
    return `<div class="edit-block-wrapper arborito-quiz-edit" contenteditable="false" data-quiz-block="true" data-arbor-tour="lesson-edit-wizard" data-quiz-challenge="${payload}"${skipMultiAttr}${skipOrderAttr}></div><p><br></p>`;
}
