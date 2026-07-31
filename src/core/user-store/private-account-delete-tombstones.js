/**
 * Durable denylist for private account drafts the user deleted locally.
 * Account pull must not recreate these ids while a live Nostr blob still exists
 * (failed/skipped unpublish, sign-out cleared sync flags, other-device republish).
 */

const STORAGE_KEY = 'arborito-private-account-deleted-v1';

/** @returns {Set<string>} */
export function readPrivateAccountDeletedIds() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return new Set();
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return new Set();
        return new Set(parsed.map((id) => String(id || '').trim()).filter(Boolean));
    } catch {
        return new Set();
    }
}

/** @param {Set<string>|string[]} ids */
function writePrivateAccountDeletedIds(ids) {
    try {
        const list = [...ids].map((id) => String(id || '').trim()).filter(Boolean);
        if (!list.length) {
            localStorage.removeItem(STORAGE_KEY);
            return;
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
        /* ignore */
    }
}

export function isPrivateAccountDeleted(id) {
    const key = String(id || '').trim();
    if (!key) return false;
    return readPrivateAccountDeletedIds().has(key);
}

export function rememberPrivateAccountDeleted(id) {
    const key = String(id || '').trim();
    if (!key) return;
    const next = readPrivateAccountDeletedIds();
    if (next.has(key)) return;
    next.add(key);
    writePrivateAccountDeletedIds(next);
}

export function forgetPrivateAccountDeleted(id) {
    const key = String(id || '').trim();
    if (!key) return;
    const next = readPrivateAccountDeletedIds();
    if (!next.delete(key)) return;
    writePrivateAccountDeletedIds(next);
}

/**
 * Drop denylist entries that no longer appear as live account drafts.
 * @param {Iterable<string>} liveIds
 */
export function prunePrivateAccountDeletedAgainstLive(liveIds) {
    const live = new Set(
        [...(liveIds || [])].map((id) => String(id || '').trim()).filter(Boolean)
    );
    const cur = readPrivateAccountDeletedIds();
    if (!cur.size) return;
    let changed = false;
    for (const id of [...cur]) {
        if (!live.has(id)) {
            cur.delete(id);
            changed = true;
        }
    }
    if (changed) writePrivateAccountDeletedIds(cur);
}
