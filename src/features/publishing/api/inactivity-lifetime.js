/** GDPR-oriented max idle before auto-retraction of published network copies (12 months). */
export const PUBLISHED_INACTIVITY_MAX_IDLE_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * @returns {{ version: number, maxIdleMs: number, lastActivityAt: number, expiresAt: number }}
 */
export function createInitialInactivityPolicy(now = Date.now()) {
    const maxIdleMs = PUBLISHED_INACTIVITY_MAX_IDLE_MS;
    return {
        version: 1,
        maxIdleMs,
        lastActivityAt: now,
        expiresAt: now + maxIdleMs,
    };
}

/**
 * @param {unknown} policy
 * @param {number} [now]
 */
export function bumpInactivityPolicy(policy, now = Date.now()) {
    const maxIdleMs =
        policy && typeof policy === 'object' && Number(policy.maxIdleMs) > 0
            ? Number(policy.maxIdleMs)
            : PUBLISHED_INACTIVITY_MAX_IDLE_MS;
    return {
        version: 1,
        maxIdleMs,
        lastActivityAt: now,
        expiresAt: now + maxIdleMs,
    };
}

/** @param {unknown} meta */
export function getInactivityPolicyFromMeta(meta) {
    const p = meta && typeof meta === 'object' ? meta.inactivityPolicy : null;
    if (!p || typeof p !== 'object') return null;
    const expiresAt = Number(p.expiresAt);
    if (!Number.isFinite(expiresAt)) return null;
    const maxIdleMs = Number(p.maxIdleMs) || PUBLISHED_INACTIVITY_MAX_IDLE_MS;
    const lastActivityAt = Number(p.lastActivityAt) || expiresAt - maxIdleMs;
    return { version: 1, maxIdleMs, lastActivityAt, expiresAt };
}

/**
 * Timer pauses while learners accessed recently (owner republish syncs this from usage pings).
 * @param {{ maxIdleMs?: number, expiresAt: number } | null} policy
 * @param {{ learnerActiveToday?: boolean, now?: number }} [opts]
 */
export function effectiveInactivityExpiresAt(policy, { learnerActiveToday = false, now = Date.now() } = {}) {
    if (!policy) return null;
    if (learnerActiveToday) return now + (policy.maxIdleMs || PUBLISHED_INACTIVITY_MAX_IDLE_MS);
    return policy.expiresAt;
}

export function isInactivityExpired(policy, opts = {}) {
    const exp = effectiveInactivityExpiresAt(policy, opts);
    if (exp == null) return false;
    return Date.now() >= exp;
}

/** @param {number} ms @param {Record<string, string>} [ui] */
export function formatInactivityRemainingMs(ms, ui = {}) {
    if (ms <= 0) return ui.treeInactivityExpired || 'Expired, scheduled for removal';
    const days = Math.ceil(ms / 86400000);
    if (days >= 60) {
        const months = Math.max(1, Math.round(days / 30));
        return String(ui.treeInactivityRemainingMonths || '{n} months').replace(/\{n\}/g, String(months));
    }
    return String(ui.treeInactivityRemainingDays || '{n} days').replace(/\{n\}/g, String(days));
}

/** @param {Record<string, string>} [ui] @param {number} expiresAt @param {{ learnerActiveToday?: boolean }} [opts] */
export function formatInactivityCountdown(ui, expiresAt, opts = {}) {
    const policy = { maxIdleMs: PUBLISHED_INACTIVITY_MAX_IDLE_MS, expiresAt };
    const effective = effectiveInactivityExpiresAt(policy, opts);
    if (effective == null) return '';
    return formatInactivityRemainingMs(Math.max(0, effective - Date.now()), ui);
}
