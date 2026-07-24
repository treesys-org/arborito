import { emojiToTwemojiCandidates } from '../../../shared/lib/emoji-twemoji.js';
import {
    TWEMOJI_DATAURI,
    TWEMOJI_DATAURI_ALIAS,
} from '../../../shared/lib/twemoji-datauri.js';

/**
 * Twemoji data-URI for a glyph (catalog / Forest rows). Sync — no file:// fetch.
 * @param {string} emoji
 * @returns {string}
 */
export function twemojiDataUriFor(emoji) {
    const ch = String(emoji || '').trim() || '🌿';
    for (const file of emojiToTwemojiCandidates(ch)) {
        if (TWEMOJI_DATAURI?.[file]) return TWEMOJI_DATAURI[file];
        const alias = TWEMOJI_DATAURI_ALIAS?.[file];
        if (alias && TWEMOJI_DATAURI?.[alias]) return TWEMOJI_DATAURI[alias];
    }
    return '';
}
