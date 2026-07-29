/** Default folder/branch glyph shown when a branch has no explicit icon.
 * Twemoji's 📁/📂 render as a blue folder, which clashes with the app theme; we
 * use 🗂️ (a warm beige organizer) instead and remap the legacy blue glyphs at
 * display time via `folderDisplayIcon()` so existing trees look consistent. */
export const FOLDER_DISPLAY_ICON = '🗂️';

/** Reserved for branch switcher chips / catalog “no custom icon”; not offered in the picker. */
export const BRANCH_CHIP_ICON = '🌿';

/** Folder / module node glyph, default 🗂️ when no custom icon is set. */
export function folderDisplayIcon(icon) {
    const v = String(icon || '').trim();
    if (!v || v === '📁' || v === '📂' || v === BRANCH_CHIP_ICON) return FOLDER_DISPLAY_ICON;
    return v;
}

/**
 * Categorized emoji sets for lesson/folder icon pickers.
 * `id` maps to i18n `graphEmojiCat{PascalId}` (e.g. docs → graphEmojiCatDocs).
 * Blue 📁/📂 and chip-reserved 🌿 are omitted (use 🗂️ / 🌱 / 🌲 instead).
 */
export const NODE_PROPERTY_EMOJI_CATEGORIES = [
    {
        id: 'docs',
        emojis: [
            '📄',
            '🗂️',
            '📋',
            '📑',
            '📚',
            '📖',
            '📕',
            '📗',
            '📘',
            '📙',
            '📓',
            '📝',
            '📜',
            '🧾',
            '📌',
            '📍',
            '🏷️',
            '✏️',
            '✂️',
            '🖊️',
            '🧵',
        ],
    },
    {
        id: 'marks',
        emojis: ['✨', '🔥', '💡', '🚀', '⭐', '🌟', '💫', '✅', '❓', '❗', '➕', '▶️', '⬆️', '⬇️', '🔀', '🔁', '⏳', '🏁', '💥'],
    },
    {
        id: 'people',
        emojis: ['💬', '🗣️', '👀', '👋', '🤷', '👥', '🚶', '👩‍🏫', '👨‍🔬', '🤝', '👍', '👏', '🙏', '🦴', '🧠'],
    },
    {
        id: 'science',
        emojis: ['🧬', '🔬', '🧪', '⚗️', '🎓', '🎯', '🏆', '🥇', '⚖️'],
    },
    {
        id: 'tech',
        emojis: [
            '💻',
            '🖥️',
            '⌨️',
            '💾',
            '📀',
            '📦',
            '🗄️',
            '🪟',
            '☁️',
            '🌐',
            '🔗',
            '🔑',
            '⚙️',
            '🔧',
            '🛠️',
            '🧰',
            '🛡️',
            '🧱',
            '🧩',
            '🔠',
            '🔢',
            '📆',
            '📉',
            '🛂',
            '⚡',
        ],
    },
    {
        id: 'arts',
        emojis: ['🎨', '🖌️', '🎭', '🎬', '🎵', '🎸', '🎮', '🕹️'],
    },
    {
        id: 'nature',
        emojis: ['🌱', '🌳', '🌲', '🍀', '🐍', '🐙', '🐳', '🦉', '🐢', '🦋', '🐝', '🍎', '🍊', '☕', '🌍', '🌎', '🌙', '☀️'],
    },
    {
        id: 'feelings',
        emojis: ['💔', '❤️', '💙', '💚', '💜', '✉️', '🧥', '🪞'],
    },
];

/** Flat list (same set as categories) for insert panels and legacy callers. */
export const NODE_PROPERTY_EMOJIS = NODE_PROPERTY_EMOJI_CATEGORIES.flatMap((c) => c.emojis);
