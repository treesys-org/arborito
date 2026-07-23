/**
 * Hard refuse only when strict mode has *no* retrieved course/demo evidence.
 * Synonyms and paraphrase are left to the model + system prompts; keyword
 * overlap checks would false-refuse valid questions.
 */

import { SAGE_INTENT } from './sage-context-resolver.js';

/**
 * @param {object} opts
 * @param {boolean} opts.contextStrict
 * @param {string} opts.mode
 * @param {boolean} opts.isGreeting
 * @param {string} [opts.intent]
 * @param {object} [opts.grounding]
 * @returns {boolean}
 */
export function shouldRefuseOutsideTreeContext({
    contextStrict,
    mode,
    isGreeting,
    intent,
    grounding = {},
}) {
    if (!contextStrict || isGreeting) return false;
    if (mode !== 'sage-tree') return false;

    const g = grounding || {};
    const hasLesson = !!g.hasLesson;
    const hasModule = !!g.hasModule;
    const hasMap = !!g.hasMap;
    const hasRag = !!g.hasRag;
    const hasDemo = !!g.hasDemo;

    if (intent === SAGE_INTENT.APP_HELP) {
        /* Demo docs, course RAG (when already on the demo tree), or lesson evidence. */
        return !(hasDemo || hasRag || hasLesson || hasModule);
    }

    if (intent === SAGE_INTENT.NAV_OUTLINE) {
        return !(hasModule || hasMap || hasRag);
    }

    /* LESSON_QA / GENERAL: need lesson body, module outline, or related RAG.
     * A bare course map is not enough. Do NOT require query-term overlap;
     * synonyms must reach the model with CONTEXT + strict prompts. */
    return !(hasLesson || hasModule || hasRag);
}

/**
 * @param {'EN'|'ES'|string} lang
 * @param {object} [ui]
 */
export function sageOutsideTreeRefusalText(lang, ui = {}) {
    const fromUi = String(ui.sageCannotAnswerNotInTree || '').trim();
    if (fromUi) return fromUi;
    if (lang === 'ES') {
        return 'Me encanta ayudar con este curso: solo sé lo que hay en el árbol abierto. Abre una lección en el mapa, o pregúntame por un tema del curso.';
    }
    return "I'd love to help with this course: I only know what's in the open tree. Open a lesson on the map, or ask about a topic from the course.";
}
