import { chromeEmojiHtml } from '../../../../shared/lib/emoji-display.js';

/**
 * Course/catalog glyph. Uses the same Twemoji PNGs as the rest of the chrome
 * (`vendor/emoji/twemoji`), not only the small inlined set. Glyphs missing
 * from that set were falling back to raw text and showed up blank.
 */
export function CatalogRowEmoji({ emoji, size = 22, className = '' }) {
    const ch = String(emoji || '').trim() || '🌿';
    const px = Math.max(12, Number(size) || 22);
    const html = chromeEmojiHtml(ch, px);

    return (
        <span
            className={`arborito-sources-row-title__emoji ${className}`.trim()}
            aria-hidden="true"
            style={{ width: px, height: px }}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}
