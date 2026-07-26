import { chromeEmojiHtml } from '../../shared/lib/emoji-display.js';

/**
 * Twemoji img for nav / chrome (Linux-safe).
 * Data-URI pack is statically imported, so first paint already has the correct src —
 * no bundle-ready re-render (that used to flash every chrome glyph after init).
 * See emoji-display.js for documented raw-Unicode exceptions.
 */
export function ChromeEmoji({ emoji, size = 20, className = '' }) {
    const html = chromeEmojiHtml(emoji, size);

    return (
        <span
            className={className || undefined}
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}
