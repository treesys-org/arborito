/**
 * Fixes common author copy-paste mistakes before the lesson escape pipeline.
 * Intentionally tiny, not a general HTML decoder (XSS-safe).
 */
export function normalizeAuthorMarkupArtifacts(text) {
    let t = String(text ?? '');
    // Double-encoded entities (HTML exports, CMS paste).
    t = t.replace(/&amp;amp;/gi, '&amp;');
    t = t.replace(/&amp;lt;/gi, '&lt;');
    t = t.replace(/&amp;gt;/gi, '&gt;');
    t = t.replace(/&amp;quot;/gi, '&quot;');
    t = t.replace(/&amp;apos;/gi, '&apos;');
    t = t.replace(/&amp;&amp;/g, '&&');
    // Pasted HTML line breaks.
    t = t.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
    // Decode common text entities authors paste literally (escHtml re-escapes safely).
    t = t.replace(/&quot;/gi, '"');
    t = t.replace(/&apos;/gi, "'");
    t = t.replace(/&#39;/gi, "'");
    t = t.replace(/&#x27;/gi, "'");
    t = t.replace(/&gt;&gt;/g, '>>');
    t = t.replace(/&lt;&lt;/g, '<<');
    t = t.replace(/&gt;/g, '>');
    t = t.replace(/&lt;/g, '<');
    // Neutralize any accidental tags except <br>.
    t = t.replace(/<(?!br\s*\/?>)[^>]*>/gi, '');
    return t;
}
