/** Default folder glyph when none is set. Legacy 📁/📂 map to this at display time. */
export const FOLDER_DISPLAY_ICON = '🗂️';

/** Catalog / switcher sentinel; not listed in the picker (use 🌱 or 🌲). */
export const BRANCH_CHIP_ICON = '🌿';

/** Resolve folder icon for display. */
export function folderDisplayIcon(icon) {
    const v = String(icon || '').trim();
    if (!v || v === '📁' || v === '📂' || v === BRANCH_CHIP_ICON) return FOLDER_DISPLAY_ICON;
    return v;
}

/** Icon picker categories. `id` → i18n `graphEmojiCat{PascalId}`. */
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
        id: 'clothes',
        emojis: [
            '🧥',
            '👕',
            '👖',
            '👗',
            '👘',
            '👚',
            '🩳',
            '🧦',
            '🧤',
            '🧣',
            '👔',
            '👞',
            '👟',
            '👠',
            '🥾',
            '👒',
            '🎩',
            '🧢',
            '👓',
            '🕶️',
            '🥽',
            '👜',
            '🎒',
            '👛',
            '💍',
            '💄',
            '🪞',
            '🧵',
            '🪡',
            '🧶',
        ],
    },
    {
        id: 'feelings',
        emojis: [
            '❤️',
            '🧡',
            '💛',
            '💚',
            '💙',
            '💜',
            '🖤',
            '🤍',
            '💔',
            '💕',
            '💖',
            '💗',
            '💘',
            '💝',
            '💌',
            '✉️',
            '😊',
            '🥰',
            '😍',
            '😌',
            '😢',
            '😭',
            '😤',
            '🤔',
            '😴',
            '💪',
        ],
    },
];

/** Flat list for insert panels and callers that need every icon. */
export const NODE_PROPERTY_EMOJIS = NODE_PROPERTY_EMOJI_CATEGORIES.flatMap((c) => c.emojis);
