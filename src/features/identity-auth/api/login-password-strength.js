/**
 * Login password strength (user-chosen credential, optional alternative to sync code).
 * Only used client-side before register; never sent to relays in plaintext.
 */

export const LOGIN_PASSWORD_MIN_CHARS = 10;

/** @typedef {'none' | 'weak' | 'fair' | 'good' | 'strong'} LoginPasswordLevel */

/**
 * @param {string} password
 * @returns {{ level: LoginPasswordLevel, percent: number, score: number, ok: boolean, labelKey: string }}
 */
export function evaluateLoginPasswordStrength(password) {
    const raw = String(password || '');
    if (!raw) {
        return { level: 'none', percent: 0, score: 0, ok: false, labelKey: '' };
    }

    let score = 0;
    if (raw.length >= 8) score += 1;
    if (raw.length >= LOGIN_PASSWORD_MIN_CHARS) score += 1;
    if (raw.length >= 14) score += 1;
    if (/[a-z]/.test(raw) && /[A-Z]/.test(raw)) score += 1;
    if (/\d/.test(raw)) score += 1;
    if (/[^A-Za-z0-9]/.test(raw)) score += 1;
    if (raw.length >= 16) score += 1;
    if (/^(.)\1{4,}$/.test(raw)) score -= 2;
    if (/^(password|12345678|qwerty|admin|letmein)/i.test(raw)) score -= 2;

    score = Math.max(0, Math.min(6, score));
    const ok = raw.length >= LOGIN_PASSWORD_MIN_CHARS && score >= 3;

    /** @type {LoginPasswordLevel} */
    let level = 'weak';
    let percent = 22;
    let labelKey = 'loginPasswordStrengthWeak';
    if (score <= 1) {
        level = 'weak';
        percent = 22;
        labelKey = 'loginPasswordStrengthWeak';
    } else if (score <= 2) {
        level = 'fair';
        percent = 48;
        labelKey = 'loginPasswordStrengthFair';
    } else if (score <= 4) {
        level = 'good';
        percent = 74;
        labelKey = 'loginPasswordStrengthGood';
    } else {
        level = 'strong';
        percent = 100;
        labelKey = 'loginPasswordStrengthStrong';
    }

    return { level, percent, score, ok, labelKey };
}

/**
 * @param {string} password
 * @returns {{ ok: boolean, level: LoginPasswordLevel, percent: number, labelKey: string }}
 */
export function checkLoginPasswordStrength(password) {
    const ev = evaluateLoginPasswordStrength(password);
    return { ok: ev.ok, level: ev.level, percent: ev.percent, labelKey: ev.labelKey };
}

/**
 * Heuristic: hex sync codes use only 0-9A-F and optional dashes/spaces.
 * @param {string} secret
 */
export function looksLikeSyncSecretCode(secret) {
    const norm = String(secret || '').trim().replace(/\s+/g, '').replace(/-/g, '');
    if (!norm || norm.length < 12) return false;
    return /^[0-9A-Fa-f]+$/.test(norm);
}
