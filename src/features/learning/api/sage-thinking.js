/** Strip model reasoning / thinking blocks from Sage chat text. */

import { stripSageConstructTags } from './sage-construction-tags.js';

/**
 * @param {string} txt
 * @param {{ stream?: boolean, keepConstruct?: boolean }} [opts]
 *   keepConstruct: leave CALL / [[SAGE_CONSTRUCT:…]] for the construction parser (ai.js → ai-logic).
 */
function stripThinkingCore(txt, { stream = false, keepConstruct = false } = {}) {
    let t = String(txt != null ? txt : '');
    t = t.replace(/▌$/g, '');
    /* Closed thinking blocks first — never eat the final answer after </think>. */
    t = t.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
    t = t.replace(/<redacted_thinking>[\s\S]*?<\/redacted_thinking>/gi, '');
    /* Unclosed trailing think (incomplete stream or truncated final). */
    if (!stream) {
        t = t.replace(/<think(?:ing)?>[\s\S]*$/i, '');
        t = t.replace(/<redacted_thinking>[\s\S]*$/i, '');
    }
    /* Channel thought must consume through final (or EOS) — optional group was a no-op. */
    t = t.replace(/<\|channel\|>\s*thought\b[\s\S]*?(?=<\|channel\|>\s*final\b|$)/gi, '');
    t = t.replace(/<\|channel\|>\s*final\b/gi, '');
    t = t.replace(/<unused\d*>/gi, '');
    t = t.replace(/<\|[^|>]*\|>/g, '');
    if (!stream) t = t.replace(/<[^>]+>/g, '');
    /* Display path: hide construct tags. Parse path: keep them for ai-logic. */
    if (!keepConstruct) t = stripSageConstructTags(t);
    return stream ? t : t.trim();
}

/**
 * @param {string} txt
 * @param {{ keepConstruct?: boolean }} [opts]
 */
export function stripThinking(txt, opts = {}) {
    return stripThinkingCore(txt, { stream: false, keepConstruct: !!opts.keepConstruct });
}

/** Lighter strip while tokens arrive — avoid eating partial tags / stalling the UI. */
export function stripThinkingStream(txt) {
    return stripThinkingCore(txt, { stream: true, keepConstruct: false });
}
