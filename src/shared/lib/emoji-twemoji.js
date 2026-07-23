/** Twemoji filename resolution (Twitter emoji v14 codepoint rules). */

/**
 * Match pictographic emoji and regional-indicator flag pairs (🇪🇸, 🇺🇸, …).
 * Flag letters are not `\p{Extended_Pictographic}`, so they need an explicit branch.
 */
export const EMOJI_IN_TEXT_RE =
    /(?:\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*|[\u{1F1E6}-\u{1F1FF}]{2})/gu;

export function emojiToTwemojiCandidates(emoji) {
    const hex = [];
    for (const ch of String(emoji || '')) {
        hex.push(ch.codePointAt(0).toString(16));
    }
    if (!hex.length) return ['1f4c4.png'];
    const base = hex.join('-');
    const stripped = base.replace(/-fe0f/g, '');
    const out = [];
    if (stripped) out.push(`${stripped}.png`);
    if (base !== stripped) out.push(`${base}.png`);
    if (!base.includes('fe0f')) out.push(`${base}-fe0f.png`);
    return [...new Set(out)];
}

export function emojiToTwemojiPrimaryFile(emoji) {
    return emojiToTwemojiCandidates(emoji)[0];
}
