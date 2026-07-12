/**
 * Throttle expensive background work (catalog curation, publish repair, etc.)
 * so it does not run in tight loops on every navigation or modal open.
 */

const MIN_INTERVAL_MS = 8000;
/** @type {Map<string, number>} */
const lastRunAt = new Map();
/** @type {Set<string>} */
const sessionOnceDone = new Set();

/**
 * @param {string} key
 * @param {{ oncePerSession?: boolean, minIntervalMs?: number }} [opts]
 */
export function shouldRunBackgroundTask(key, opts = {}) {
    const id = String(key || '').trim();
    if (!id) return false;
    const once = !!opts.oncePerSession;
    const minGap = Math.max(0, Number(opts.minIntervalMs) || MIN_INTERVAL_MS);
    if (once && sessionOnceDone.has(id)) return false;
    const prev = lastRunAt.get(id) || 0;
    if (Date.now() - prev < minGap) return false;
    return true;
}

/**
 * @param {string} key
 * @param {() => void | Promise<void>} fn
 * @param {{ oncePerSession?: boolean, minIntervalMs?: number }} [opts]
 */
export async function runThrottledBackgroundTask(key, fn, opts = {}) {
    if (!shouldRunBackgroundTask(key, opts)) return false;
    const id = String(key || '').trim();
    lastRunAt.set(id, Date.now());
    if (opts.oncePerSession) sessionOnceDone.add(id);
    await fn();
    return true;
}
