/**
 * Persist sync-login session to localStorage so reload / profile remount
 * does not silently drop an authenticated user. Plaintext sync secret stays
 * on-device only (same threat model as keeping it in `_authSession` memory).
 */

const STORAGE_KEY = 'arborito-auth-session-v1';

/**
 * @param {{ v?: number, username?: string, authMode?: string, authenticatedAt?: string, syncSecretPlain?: string } | null} session
 */
export function persistAuthSession(session) {
    if (typeof localStorage === 'undefined') return;
    const username = String(session?.username || '').trim();
    if (!username) return;
    try {
        const payload = {
            v: 1,
            username,
            authMode: session.authMode === 'sync' ? 'sync' : 'sync',
            authenticatedAt: String(session.authenticatedAt || new Date().toISOString()),
            ...(session.syncSecretPlain
                ? { syncSecretPlain: String(session.syncSecretPlain).trim() }
                : {})
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
        /* quota / private mode */
    }
}

/** @returns {{ v: number, username: string, authMode: string, authenticatedAt: string, syncSecretPlain?: string } | null} */
export function loadPersistedAuthSession() {
    if (typeof localStorage === 'undefined') return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const o = JSON.parse(raw);
        const username = String(o?.username || '').trim();
        if (!username) return null;
        return {
            v: 1,
            username,
            authMode: 'sync',
            authenticatedAt: String(o.authenticatedAt || ''),
            ...(o.syncSecretPlain ? { syncSecretPlain: String(o.syncSecretPlain).trim() } : {})
        };
    } catch {
        return null;
    }
}

export function clearPersistedAuthSession() {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        /* ignore */
    }
}
