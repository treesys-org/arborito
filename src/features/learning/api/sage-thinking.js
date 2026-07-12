/** Strip model reasoning / thinking blocks from Sage chat text. */

export function stripThinking(txt) {
    let t = String(txt != null ? txt : '');
    t = t.replace(/▌$/g, '');
    t = t.replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, '');
    t = t.replace(/<think>[\s\S]*$/i, '');
    t = t.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
    t = t.replace(/<\|channel\|>\s*thought[\s\S]*?(<\|channel\|>\s*final\b)?/gi, '');
    t = t.replace(/<\|channel\|>\s*final\b/gi, '');
    t = t.replace(/<unused\d*>/gi, '');
    t = t.replace(/<\|[^|>]*\|>/g, '');
    t = t.replace(/<[^>]+>/g, '');
    return t.trim();
}
