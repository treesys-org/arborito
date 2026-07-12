import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';

export function ProductTourMascot({ mascotKey }) {
    return (
        <span id="arborito-tour-mascot" className="arborito-tour-tooltip__mascot" aria-hidden="true">
            <ChromeEmoji emoji={mascotKey || '🌲'} size={28} className="arborito-emoji-glyph" />
        </span>
    );
}
