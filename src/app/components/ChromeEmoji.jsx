import { useEffect, useState } from 'react';
import { chromeEmojiHtml, ensureEmojiBundleReady } from '../../shared/lib/emoji-display.js';

/** Twemoji img for nav / chrome (Linux-safe). Re-renders when the Twemoji bundle finishes loading.
 *  See emoji-display.js for documented raw-Unicode exceptions. */
export function ChromeEmoji({ emoji, size = 20, className = '' }) {
    const [emojiGen, setEmojiGen] = useState(0);

    useEffect(() => {
        const refresh = () => setEmojiGen((n) => n + 1);
        window.addEventListener('arborito-emoji-ready', refresh);
        // Bundle may finish before this effect runs; useMemo would otherwise keep stale placeholder HTML.
        void ensureEmojiBundleReady().then(refresh);
        return () => window.removeEventListener('arborito-emoji-ready', refresh);
    }, []);

    const html = chromeEmojiHtml(emoji, size);

    return (
        <span
            key={emojiGen}
            className={className || undefined}
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}
