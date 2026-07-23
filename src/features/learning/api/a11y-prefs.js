/** App-wide accessibility preferences (localStorage). */

const READ_ALOUD_LESSONS_KEY = 'arborito_a11y_read_aloud_lessons';
const ANNOUNCE_UI_KEY = 'arborito_a11y_announce_ui';
const READ_ALOUD_UI_KEY = 'arborito_a11y_read_aloud_ui';
const PREFER_PIPER_KEY = 'arborito_a11y_prefer_piper';

export function resolveReadAloudLessons() {
    try {
        return localStorage.getItem(READ_ALOUD_LESSONS_KEY) === '1';
    } catch (_) {
        return false;
    }
}

export function writeReadAloudLessons(enabled) {
    try {
        localStorage.setItem(READ_ALOUD_LESSONS_KEY, enabled ? '1' : '0');
    } catch (_) {}
}

export function resolveAnnounceUiChanges() {
    try {
        const v = localStorage.getItem(ANNOUNCE_UI_KEY);
        if (v === '1' || v === 'true') return true;
    } catch (_) {}
    return false;
}

export function writeAnnounceUiChanges(enabled) {
    try {
        localStorage.setItem(ANNOUNCE_UI_KEY, enabled ? '1' : '0');
    } catch (_) {}
}

/** Speak short UI labels (toolbar, tour steps) when TTS is available. Opt-in only. */
export function resolveReadAloudUi() {
    try {
        const v = localStorage.getItem(READ_ALOUD_UI_KEY);
        if (v === '1' || v === 'true') return true;
    } catch (_) {}
    return false;
}

export function writeReadAloudUi(enabled) {
    try {
        localStorage.setItem(READ_ALOUD_UI_KEY, enabled ? '1' : '0');
    } catch (_) {}
}

/** Desktop: use Piper neural TTS instead of OS speech when available. Opt-in. */
export function resolvePreferPiperVoice() {
    try {
        const v = localStorage.getItem(PREFER_PIPER_KEY);
        if (v === '0' || v === 'false') return false;
        if (v === '1' || v === 'true') return true;
    } catch (_) {}
    return false;
}

export function writePreferPiperVoice(enabled) {
    try {
        localStorage.setItem(PREFER_PIPER_KEY, enabled ? '1' : '0');
    } catch (_) {}
}

export function getA11yPrefs() {
    return {
        readAloudLessons: resolveReadAloudLessons(),
        announceUi: resolveAnnounceUiChanges(),
        readAloudUi: resolveReadAloudUi(),
        preferPiper: resolvePreferPiperVoice(),
    };
}
