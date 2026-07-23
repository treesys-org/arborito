/**
 * Device-local preferences for gamification feedback (not synced / exported).
 */

const PREFS_KEY = 'arborito-gamification-prefs';

const DEFAULTS = Object.freeze({
    sound: true,
    effects: true
});

/** @returns {{ sound: boolean, effects: boolean }} */
export function getGamificationPrefs() {
    try {
        const raw = localStorage.getItem(PREFS_KEY);
        if (!raw) return { ...DEFAULTS };
        const parsed = JSON.parse(raw);
        return {
            sound: parsed.sound !== false,
            effects: parsed.effects !== false
        };
    } catch {
        return { ...DEFAULTS };
    }
}

/** @param {'sound'|'effects'} key @param {boolean} value */
export function setGamificationPref(key, value) {
    const next = { ...getGamificationPrefs(), [key]: !!value };
    try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
        /* private mode */
    }
    return next;
}
