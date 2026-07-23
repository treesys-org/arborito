/** Default folder/branch glyph shown when a branch has no explicit icon.
 * Twemoji's 📁/📂 render as a blue folder, which clashes with the app theme; we
 * use 🗂️ (a warm beige organizer) instead and remap the legacy blue glyphs at
 * display time via `folderDisplayIcon()` so existing trees look consistent. */
export const FOLDER_DISPLAY_ICON = '🗂️';

/** Reserved for branch switcher chips only, not offered in the emoji picker. */
export const BRANCH_CHIP_ICON = '🌿';

/** Folder / module node glyph, default 🗂️ when no custom icon is set. */
export function folderDisplayIcon(icon) {
    const v = String(icon || '').trim();
    if (!v || v === '📁' || v === '📂' || v === BRANCH_CHIP_ICON) return FOLDER_DISPLAY_ICON;
    return v;
}

/** Emojis offered for lesson/folder node icon (same set as node-properties modal).
 * The blue 📁/📂 are intentionally omitted in favor of the themed 🗂️. */
export const NODE_PROPERTY_EMOJIS = [
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
    '📌',
    '📍',
    '✏️',
    '✂️',
    '🖊️',
    '🧾',
    '✨',
    '🔥',
    '💡',
    '🚀',
    '⭐',
    '🌟',
    '💫',
    '✅',
    '❓',
    '❗',
    '💬',
    '🧬',
    '🔬',
    '🧪',
    '⚗️',
    '💻',
    '🖥️',
    '⌨️',
    '🎨',
    '🖌️',
    '🎭',
    '🎬',
    '🎵',
    '🎸',
    '⚖️',
    '🧠',
    '🎯',
    '🏆',
    '🥇',
    '🎓',
    '👩‍🏫',
    '👨‍🔬',
    '🌱',
    '🌳',
    '🌲',
    '🍀',
    '🍎',
    '🍊',
    '🌍',
    '🌎',
    '🌙',
    '☀️',
    '⚡',
    '🔧',
    '🛠️',
    '🧰',
    '🎮',
    '🕹️',
    '🦉',
    '🐢',
    '🦋',
    '🐝',
    '❤️',
    '💙',
    '💚',
    '💜',
    '🤝',
    '👍',
    '👏',
    '🙏'
];
