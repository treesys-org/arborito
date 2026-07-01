import { chromeEmojiHtml } from '../../shared/lib/emoji-display.js';

/** Twemoji img for nav / chrome (Linux-safe). */
export function ChromeEmoji({ emoji, size = 20, className = '' }) {
    return (
        <span
            className={className || undefined}
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: chromeEmojiHtml(emoji, size) }}
        />
    );
}
