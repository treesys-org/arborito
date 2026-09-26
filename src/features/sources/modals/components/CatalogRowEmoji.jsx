import { ChromeEmoji } from '../../../../app/components/ChromeEmoji.jsx';

/**
 * Course/catalog glyph. Uses the same Twemoji PNGs as the rest of the chrome
 * (`vendor/emoji/twemoji`), not only the small inlined set. Glyphs missing
 * from that set were falling back to raw text and showed up blank.
 */
export function CatalogRowEmoji({ emoji, size = 22, className = '' }) {
    const ch = String(emoji || '').trim() || '🌿';
    const px = Math.max(12, Number(size) || 22);

    return (
        <ChromeEmoji
            emoji={ch}
            size={px}
            className={`arborito-sources-row-title__emoji ${className}`.trim()}
        />
    );
}
