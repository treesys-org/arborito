/**
 * External multimedia: consent per origin (scheme + host + port).
 * Storage shape `v2`: `{ v: 2, origins: string[] }` in both `localStorage`
 * (persistent "remember") and `sessionStorage` (one-tab grant). The `v2`
 * suffix is just a schema-version label so future storage shape changes can
 * coexist with old persisted values without losing user choices.
 */

export const MEDIA_CONSENT_STORAGE_KEY_V2 = 'arborito.mediaConsent.v2';
export const MEDIA_SESSION_KEY_V2 = 'arborito.mediaSessionOrigins.v2';

function isExternalMediaSrc(src) {
    if (!src || typeof src !== 'string') return false;
    const t = src.trim();
    if (!/^https?:\/\//i.test(t)) return false;
    if (typeof window === 'undefined' || !(window.location && window.location.origin)) return true;
    try {
        const u = new URL(t, window.location.href);
        return u.origin !== window.location.origin;
    } catch {
        return false;
    }
}

/** @param {string} src */
function parseMediaOrigin(src) {
    if (!isExternalMediaSrc(src)) return null;
    try {
        return new URL(src.trim(), typeof window !== 'undefined' ? window.location.href : undefined).origin;
    } catch {
        return null;
    }
}

/** @returns {Map<string, string[]>} origin -> example URLs (up to 4 per origin) */
function collectExternalMediaByOrigin(blocks) {
    const map = new Map();
    if (!(blocks && blocks.length)) return map;
    for (const b of blocks) {
        if (b.type !== 'image' && b.type !== 'video' && b.type !== 'audio') continue;
        const origin = parseMediaOrigin(b.src);
        if (!origin) continue;
        const url = b.src.trim();
        if (!map.has(origin)) map.set(origin, []);
        const arr = map.get(origin);
        if (arr.length < 4 && !arr.includes(url)) arr.push(url);
    }
    return map;
}

function readV2OriginsFromLocal() {
    try {
        const raw = localStorage.getItem(MEDIA_CONSENT_STORAGE_KEY_V2);
        if (!raw) return null;
        const o = JSON.parse(raw);
        if (o && Array.isArray(o.origins)) return new Set(o.origins.filter((x) => typeof x === 'string'));
    } catch {
        /* ignore */
    }
    return null;
}

function readV2OriginsFromSession() {
    try {
        const raw = sessionStorage.getItem(MEDIA_SESSION_KEY_V2);
        if (!raw) return new Set();
        const o = JSON.parse(raw);
        if (o && Array.isArray(o.origins)) return new Set(o.origins.filter((x) => typeof x === 'string'));
    } catch {
        /* ignore */
    }
    return new Set();
}

function isOriginAllowedForMedia(origin) {
    if (!origin) return true;
    const local = readV2OriginsFromLocal();
    if (local && local.has(origin)) return true;
    return readV2OriginsFromSession().has(origin);
}

/** @returns {boolean} */
export function isMediaSrcBlocked(src) {
    if (!isExternalMediaSrc(src)) return false;
    const origin = parseMediaOrigin(src);
    if (!origin) return true;
    return !isOriginAllowedForMedia(origin);
}

/**
 * Origins in blocks that still need user approval.
 * @returns {{ origin: string, urls: string[] }[]}
 */
export function getPendingExternalMediaDetails(blocks) {
    const map = collectExternalMediaByOrigin(blocks);
    const out = [];
    for (const [origin, urls] of map) {
        if (!isOriginAllowedForMedia(origin)) out.push({ origin, urls });
    }
    return out.sort((a, b) => a.origin.localeCompare(b.origin));
}

/** For reactivity in lesson render stateKey. */
export function getMediaConsentStateFingerprint() {
    const l = readV2OriginsFromLocal();
    const s = readV2OriginsFromSession();
    const a = l ? [...l].sort().join(',') : '';
    const b = [...s].sort().join(',');
    return `v2:${a}|${b}`;
}

/**
 * @param {string[]} originsToAdd
 * @param {boolean} remember
 */
export function persistMediaOriginsConsent(originsToAdd, remember) {
    const add = [...new Set(originsToAdd || [])].filter(Boolean);
    if (!add.length) return;

    if (remember) {
        const cur = readV2OriginsFromLocal() || new Set();
        add.forEach((o) => cur.add(o));
        try {
            localStorage.setItem(MEDIA_CONSENT_STORAGE_KEY_V2, JSON.stringify({ v: 2, origins: [...cur] }));
            sessionStorage.removeItem(MEDIA_SESSION_KEY_V2);
        } catch {
            /* quota */
        }
    } else {
        const cur = readV2OriginsFromSession();
        add.forEach((o) => cur.add(o));
        try {
            sessionStorage.setItem(MEDIA_SESSION_KEY_V2, JSON.stringify({ v: 2, origins: [...cur] }));
        } catch {
            /* ignore */
        }
    }
}

