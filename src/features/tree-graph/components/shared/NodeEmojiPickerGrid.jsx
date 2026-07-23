import { ChromeEmoji } from '../../../../app/components/ChromeEmoji.jsx';
import { NODE_PROPERTY_EMOJIS } from '../../api/node-property-emojis.js';

/** Shared emoji grid for construction popover and node-properties modal. */
export function NodeEmojiPickerGrid({
    emojis = NODE_PROPERTY_EMOJIS,
    ui,
    onPick,
    gridClassName = 'mobile-construction-emoji-pop__grid',
    btnClassName = 'mobile-construction-emoji-pop__btn',
    emojiSize = 18,
}) {
    const pickLabel = ui?.lessonTocEmojiPlaceholder || 'Emoji';

    return (
        <div className={gridClassName} role="listbox">
            {emojis.map((emoji) => (
                <button
                    key={emoji}
                    type="button"
                    className={btnClassName}
                    aria-label={`${pickLabel} ${emoji}`}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onPick(emoji);
                    }}
                >
                    <ChromeEmoji emoji={emoji} size={emojiSize} className="arborito-emoji-glyph" />
                </button>
            ))}
        </div>
    );
}
