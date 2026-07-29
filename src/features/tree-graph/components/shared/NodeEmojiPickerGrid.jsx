import { ChromeEmoji } from '../../../../app/components/ChromeEmoji.jsx';
import {
    NODE_PROPERTY_EMOJI_CATEGORIES,
    NODE_PROPERTY_EMOJIS,
} from '../../api/node-property-emojis.js';

function categoryLabel(ui, id) {
    const key = `graphEmojiCat${id.charAt(0).toUpperCase()}${id.slice(1)}`;
    const fromUi = ui?.[key];
    if (fromUi) return fromUi;
    const fallback = {
        docs: 'Docs',
        marks: 'Marks',
        people: 'People',
        science: 'Science',
        tech: 'Tech',
        arts: 'Arts',
        nature: 'Nature',
        clothes: 'Clothes',
        feelings: 'Feelings',
    };
    return fallback[id] || id;
}

/** Shared emoji grid for construction popover and node-properties modal. */
export function NodeEmojiPickerGrid({
    emojis,
    categories = NODE_PROPERTY_EMOJI_CATEGORIES,
    ui,
    onPick,
    gridClassName = 'mobile-construction-emoji-pop__grid',
    btnClassName = 'mobile-construction-emoji-pop__btn',
    emojiSize = 18,
    categorized = true,
}) {
    const pickLabel = ui?.lessonTocEmojiPlaceholder || ui?.graphChangeIcon || 'Emoji';

    const sections =
        categorized && !emojis
            ? categories
            : [
                  {
                      id: 'all',
                      emojis: emojis || NODE_PROPERTY_EMOJIS,
                  },
              ];

    return (
        <div className="arborito-emoji-picker-cats" role="listbox" aria-label={pickLabel}>
            {sections.map((section) => (
                <div key={section.id} className="arborito-emoji-picker-cat">
                    {categorized && section.id !== 'all' ? (
                        <p className="arborito-emoji-picker-cat__label">{categoryLabel(ui, section.id)}</p>
                    ) : null}
                    <div className={gridClassName}>
                        {section.emojis.map((emoji) => (
                            <button
                                key={`${section.id}-${emoji}`}
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
                </div>
            ))}
        </div>
    );
}
