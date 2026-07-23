import { mascotEmojiHtml, ensureEmojiBundleReady } from '../../../shared/lib/emoji-display.js';
import { useEffect, useState } from 'react';

export function ProductTourMascot({ mascotKey }) {
    const [gen, setGen] = useState(0);
    useEffect(() => {
        const refresh = () => setGen((n) => n + 1);
        window.addEventListener('arborito-emoji-ready', refresh);
        void ensureEmojiBundleReady().then(refresh);
        return () => window.removeEventListener('arborito-emoji-ready', refresh);
    }, []);
    return (
        <span
            id="arborito-tour-mascot"
            key={gen}
            className="arborito-tour-tooltip__mascot"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: mascotEmojiHtml(mascotKey || '🌲', 28) }}
        />
    );
}
