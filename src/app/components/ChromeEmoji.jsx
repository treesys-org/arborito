import { useEffect, useState } from 'react';
import { chromeEmojiHtml, ensureEmojiBundleReady } from '../../shared/lib/emoji-display.js';

/** Twemoji img for nav / chrome (Linux-safe). Re-renders when the Twemoji bundle finishes loading.
 *  See emoji-display.js for documented raw-Unicode exceptions. */
export function ChromeEmoji({ emoji, size = 20, className = '' }) {
    const [, setEmojiGen] = useState(0);

    useEffect(() => {
        const refresh = () => setEmojiGen((n) => n + 1);
        window.addEventListener('arborito-emoji-ready', refresh);
        // Bundle may finish before this effect runs; refresh once so data-URIs replace file URLs.
        void ensureEmojiBundleReady().then(refresh);
        return () => window.removeEventListener('arborito-emoji-ready', refresh);
    }, []);

    const html = chromeEmojiHtml(emoji, size);

    /* No remount `key` — remounting on bundle-ready flashed the glyph (and could
     * briefly fall back to a generic chip while the parent re-resolved). */
    return (
        <span
            className={className || undefined}
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}
