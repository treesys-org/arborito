import { twemojiDataUriFor } from '../../api/twemoji-data-uri.js';

/**
 * Course/catalog glyph in Bosque rows.
 * Always an <img> with inlined Twemoji (CSP img-src allows data:; CSS
 * background-image is less reliable under Electron CSP / button resets).
 */
export function CatalogRowEmoji({ emoji, size = 22, className = '' }) {
    const ch = String(emoji || '').trim() || '🌿';
    const src = twemojiDataUriFor(ch);
    const px = Math.max(12, Number(size) || 22);

    if (!src) {
        return (
            <span
                className={`arborito-sources-row-title__emoji arborito-emoji-native ${className}`.trim()}
                aria-hidden="true"
                style={{ fontSize: `${px * 0.85}px`, lineHeight: 1 }}
            >
                {ch}
            </span>
        );
    }

    return (
        <img
            className={`arborito-sources-row-title__emoji arborito-sources-row-title__emoji-img arborito-emoji-img ${className}`.trim()}
            src={src}
            alt=""
            width={px}
            height={px}
            decoding="async"
            draggable={false}
            aria-hidden="true"
            title={ch}
            style={{ width: px, height: px, maxWidth: px, maxHeight: px }}
        />
    );
}
