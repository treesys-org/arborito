/**
 * Shared debounced username availability check for onboarding + profile sign-in.
 */
import { checkUsernameAvailability } from './sync-login-username-suggest.js';

/** @param {{ _suggestTimer?: ReturnType<typeof setTimeout> | null }} host */
function clearUsernameSuggestTimer(host) {
    if (host._suggestTimer) {
        clearTimeout(host._suggestTimer);
        host._suggestTimer = null;
    }
}

/**
 * @param {{ _suggestTimer?: ReturnType<typeof setTimeout> | null }} host
 * @param {{ getRaw: () => string, onRun: (raw: string) => void | Promise<void>, delayMs?: number }} opts
 */
export function scheduleUsernameAvailabilityCheck(host, { getRaw, onRun, delayMs = 600 }) {
    clearUsernameSuggestTimer(host);
    const raw = String(getRaw() || '').trim();
    if (!raw || raw.length < 3) {
        void onRun('');
        return;
    }
    host._suggestTimer = setTimeout(() => {
        host._suggestTimer = null;
        void onRun(raw);
    }, delayMs);
}

/** @param {string} name */
export async function fetchUsernameAvailability(name) {
    const target = String(name || '').trim();
    if (!target) return null;
    try {
        const result = await checkUsernameAvailability(target);
        if (!result) return null;
        return {
            target,
            taken: !!result.taken,
            suggestions: result.taken && Array.isArray(result.suggestions) ? result.suggestions : []
        };
    } catch {
        return null;
    }
}
