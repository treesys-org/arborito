/**
 * Deterministic RAG index (no extra LLM call): keyword hits → hyper-summary → orients Sage
 * before the full context blocks. Adds ~1 ms, not another inference pass.
 */

import { queryTerms } from './sage-tree-rag.js';
import { SAGE_INTENT } from './sage-context-resolver.js';

const INTENT_LABEL = {
    ES: {
        [SAGE_INTENT.GREETING]: 'saludo',
        [SAGE_INTENT.NAV_OUTLINE]: 'estructura del curso',
        [SAGE_INTENT.LESSON_QA]: 'lección concreta',
        [SAGE_INTENT.APP_HELP]: 'funciones de la app Arborito',
        [SAGE_INTENT.GENERAL]: 'consulta general',
    },
    EN: {
        [SAGE_INTENT.GREETING]: 'greeting',
        [SAGE_INTENT.NAV_OUTLINE]: 'course structure',
        [SAGE_INTENT.LESSON_QA]: 'specific lesson',
        [SAGE_INTENT.APP_HELP]: 'Arborito app features',
        [SAGE_INTENT.GENERAL]: 'general query',
    },
};

/**
 * @param {object} opts
 * @param {'EN'|'ES'|string} opts.lang
 * @param {string} opts.lastMsg
 * @param {object} opts.plan
 * @param {Array<{ kind: string, title: string, snippet?: string }>} opts.sources
 * @param {boolean} [opts.appKnowledgeOnly] demo docs while another course is loaded
 */
export function buildSageRagBrief({ lang, lastMsg, plan, sources = [], appKnowledgeOnly = false }) {
    if (!plan || plan.intent === SAGE_INTENT.GREETING) return '';

    const L = lang === 'ES' ? 'ES' : 'EN';
    const header = L === 'ES' ? '[Índice RAG: qué se recuperó]' : '[RAG index: what was retrieved]';
    const lines = [header];

    const intentLabel = (INTENT_LABEL[L] || INTENT_LABEL.EN)[plan.intent] || plan.intent;
    lines.push(L === 'ES' ? `Tipo: ${intentLabel}` : `Type: ${intentLabel}`);

    const keywords = queryTerms(String(lastMsg || '')).slice(0, 8);
    if (keywords.length) {
        lines.push(
            L === 'ES'
                ? `Palabras clave: ${keywords.join(', ')}`
                : `Keywords: ${keywords.join(', ')}`
        );
    }

    if (plan.moduleBranch?.name) {
        lines.push(
            L === 'ES'
                ? `Módulo localizado: «${plan.moduleBranch.name}»`
                : `Module found: «${plan.moduleBranch.name}»`
        );
    }

    if (plan.focusNode?.name) {
        lines.push(
            L === 'ES'
                ? `Lección foco: «${plan.focusNode.name}»`
                : `Focus lesson: «${plan.focusNode.name}»`
        );
    }

    for (const src of sources.slice(0, 5)) {
        if (!src?.title) continue;
        const kind =
            src.kind === 'demo'
                ? appKnowledgeOnly
                    ? L === 'ES'
                        ? 'Ayuda de la app'
                        : 'App help'
                    : L === 'ES'
                      ? 'Guía Arborito'
                      : 'Arborito guide'
                : src.kind === 'module'
                  ? L === 'ES'
                      ? 'Temario'
                      : 'Syllabus'
                  : L === 'ES'
                    ? 'Lección'
                    : 'Lesson';
        const snippet = String(src.snippet || '').trim();
        lines.push(
            snippet
                ? `- ${kind}: ${src.title}: ${snippet}`
                : `- ${kind}: ${src.title}`
        );
    }

    if (plan.intent === SAGE_INTENT.NAV_OUTLINE) {
        lines.push(
            L === 'ES'
                ? 'Responde listando exactamente los submódulos y lecciones del bloque [Módulo: …] siguiente.'
                : 'Answer by listing exactly the submodules and lessons in the [Module: …] block below.'
        );
    } else if (plan.intent === SAGE_INTENT.APP_HELP) {
        lines.push(
            appKnowledgeOnly
                ? L === 'ES'
                    ? 'Pregunta sobre la APP Arborito (no sobre el curso abierto). Usá [Ayuda de la aplicación Arborito] / [Definición de la función]. Decí qué es esa función de la app; no digas que el usuario estudia el «curso Arborito» ni el demo de Bienvenida.'
                    : 'Question about the Arborito APP (not the open course). Use [Arborito application help] / [Feature definition]. Say what that app feature is; do not claim the user is studying the “Arborito course” or the Welcome demo.'
                : L === 'ES'
                  ? 'Pregunta sobre una función de Arborito. Usá el bloque [Definición de la función] como fuente. Nombrá la función con su nombre completo del texto (Arborito, Arcade, Bosque, construcción…) — no inventes nombres cortados (Arbori, Arc). Explicá qué es y cómo se usa solo con hechos de ese bloque. No mezcles otra función ni el curso Linux.'
                  : 'App-feature question. Use the [Feature definition] block as source. Name the feature with its full name from the text (Arborito, Arcade, Forest, construction…) — do not invent truncated names. Explain what it is and how to use it only from that block. Do not mix another feature or the Linux course.'
        );
    } else if (plan.intent === SAGE_INTENT.LESSON_QA) {
        lines.push(
            L === 'ES'
                ? 'Prioriza el bloque [Lección actual] y las lecciones relacionadas siguientes.'
                : 'Prioritize the [Current lesson] block and related lessons below.'
        );
    }

    return lines.join('\n');
}

/** One-line snippet from a context part header/body. */
export function summarizeContextPart(text, maxLen = 140) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    const header = raw.match(/^\[([^\]]+)\]/)?.[1] || '';
    const body = raw.replace(/^\[[^\]]+\]\s*/m, '').replace(/\s+/g, ' ').trim();
    const pick = body || header;
    if (pick.length <= maxLen) return pick;
    return pick.slice(0, Math.max(0, maxLen - 1)).trimEnd() + '…';
}
