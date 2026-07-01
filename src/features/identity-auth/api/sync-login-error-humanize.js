/**
 * Translate raw errors from the sync-login flow (network, Nostr publish,
 * sign-in) into short user-facing strings. Both the Profile modal and the
 * Onboarding wizard share this mapping so error wording stays consistent
 * across entry points.
 *
 * Pure utility: takes the error plus a UI label dictionary (typically
 * `store.ui`) and returns the translated string. Falls back to a
 * truncated version of the raw message when nothing matches.
 */

const TECHNICAL_DETAIL_RE = /\n{2,}detalle t[eé]cnico:/i;
const RAW_MAX = 280;

/**
 * @param {unknown} err
 * @param {Record<string, string>} [ui] UI label dictionary (e.g. `store.ui`).
 * @returns {string}
 */
export function humanizeAuthError(err, ui = {}) {
    const raw = String((err && err.message) || err || '').trim();
    if (!raw) {
        return ui.syncLoginGenericError || 'Could not complete the operation. Try again.';
    }
    const low = raw.toLowerCase();
    // Strip the long "technical detail" tail so the user only sees the friendly part.
    const friendly = raw.split(TECHNICAL_DETAIL_RE)[0].trim();
    if (
        low.includes('username') &&
        (low.includes('taken') || low.includes('ya está') || low.includes('ya esta'))
    ) {
        return ui.syncLoginUsernameTakenShort || ui.syncLoginUsernameTaken ||
            'That name is already taken. Try one of the suggestions.';
    }
    if (
        low.includes('cooling down') ||
        low.includes('timeout') ||
        low.includes('time out') ||
        low.includes('demasiado') ||
        low.includes('demorando')
    ) {
        return ui.syncLoginConnectionSlow ||
            'The connection is slow. Check your internet and try again.';
    }
    if (low.includes('publish failed on all relays') || low.includes('ningún relay')) {
        return ui.syncLoginRelaysUnreachable ||
            'Could not reach any network server. Check your connection and try again.';
    }
    if (low.includes('gdpr_consent_required') || low.includes('consent')) {
        return ui.syncLoginConsentRequired ||
            'Before creating an account, accept the privacy policy in the first step.';
    }
    if (low.includes('wrong username') || low.includes('wrong secret') || low.includes('incorrecto')) {
        return ui.syncLoginWrongSecret || 'Wrong username or code.';
    }
    if (low.includes('no account') || low.includes('no hay cuenta')) {
        return ui.syncLoginNoAccount ||
            'No account with that name. Check the spelling or create a new one.';
    }
    return friendly.length > RAW_MAX ? friendly.slice(0, RAW_MAX - 3) + '…' : friendly;
}
