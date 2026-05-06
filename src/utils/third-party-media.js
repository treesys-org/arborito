/**
 * External multimedia: consent per origin (scheme + host + port).
 * Storage: v2 per-origin; migrates legacy v1 (global allow) as all-or-nothing.
 */

export const MEDIA_CONSENT_STORAGE_KEY_V1 = 'arborito.mediaConsent.v1';
export const MEDIA_CONSENT_STORAGE_KEY_V2 = 'arborito.mediaConsent.v2';
export const MEDIA_SESSION_KEY_V1 = 'arborito.mediaSessionAllow';
export const MEDIA_SESSION_KEY_V2 = 'arborito.mediaSessionOrigins.v2';

export function isExternalMediaSrc(src) {
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
export function parseMediaOrigin(src) {
    if (!isExternalMediaSrc(src)) return null;
    try {
        return new URL(src.trim(), typeof window !== 'undefined' ? window.location.href : undefined).origin;
    } catch {
        return null;
    }
}

/** @returns {Map<string, string[]>} origin -> example URLs (up to 4 per origin) */
export function collectExternalMediaByOrigin(blocks) {
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

/** Legacy: user chose "allow + remember" before per-origin existed */
export function hasLegacyGlobalMediaAllow() {
    try {
        const raw = localStorage.getItem(MEDIA_CONSENT_STORAGE_KEY_V1);
        if (!raw) return false;
        const o = JSON.parse(raw);
        return o && o.allow === true && o.remember === true;
    } catch {
        return false;
    }
}

/** Legacy session: user allowed once without remember (v1) */
function hasLegacySessionGlobalAllow() {
    try {
        return sessionStorage.getItem(MEDIA_SESSION_KEY_V1) === '1';
    } catch {
        return false;
    }
}

export function isOriginAllowedForMedia(origin) {
    if (!origin) return true;
    if (hasLegacyGlobalMediaAllow() || hasLegacySessionGlobalAllow()) return true;
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

export function blocksNeedExternalMediaConsent(blocks) {
    return getPendingExternalMediaDetails(blocks).length > 0;
}

/** For Reactivity in lesson render stateKey (storage + legacy flags). */
export function getMediaConsentStateFingerprint() {
    if (hasLegacyGlobalMediaAllow()) return 'L1';
    if (hasLegacySessionGlobalAllow()) return 'S1';
    const l = readV2OriginsFromLocal();
    const s = readV2OriginsFromSession();
    const a = l ? [...l].sort().join(',') : '';
    const b = [...s].sort().join(',');
    return `v2:${a}|${b}`;
}

function escapeHtmlAttr(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * @param {Record<string, string>} ui
 * @param {{ origin: string, urls: string[] }[]} pending
 */
export function getMediaConsentModalMarkup(ui, pending) {
    if (!(pending && pending.length)) return '';
    const originsJson = encodeURIComponent(JSON.stringify(pending.map((p) => p.origin)));

    const rows = pending
        .map((p) => {
            const domain = escapeHtmlAttr(p.origin.replace(/^https?:\/\//i, ''));
            const urlLines = p.urls
                .slice(0, 3)
                .map((u) => `<li class="font-mono text-[11px] text-slate-500 dark:text-slate-400 break-all">${escapeHtmlAttr(u)}</li>`)
                .join('');
            return `
            <div class="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/80 px-3 py-2 mb-2 text-left">
                <div class="text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">${ui.mediaConsentDomainLabel || 'Origin'} · <span class="text-emerald-700 dark:text-emerald-400">${domain}</span></div>
                <ul class="list-none pl-0 space-y-0.5 m-0">${urlLines}</ul>
            </div>`;
        })
        .join('');

    return `
    <div id="arborito-media-consent-root" class="fixed inset-0 z-[220] flex items-center justify-center p-4" role="presentation" data-pending-origins="${escapeHtmlAttr(originsJson)}">
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true"></div>
        <div class="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-2xl p-6 text-left" role="dialog" aria-modal="true" aria-labelledby="arborito-media-consent-title">
            <h2 id="arborito-media-consent-title" class="text-lg font-bold text-slate-900 dark:text-white mb-2">${ui.mediaConsentTitle || ''}</h2>
            <p class="text-sm text-slate-600 dark:text-slate-300 mb-3 leading-relaxed">${ui.mediaConsentBody || ''}</p>
            <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">${ui.mediaConsentListLabel || ''}</p>
            <div class="mb-3 max-h-48 overflow-y-auto custom-scrollbar">${rows}</div>
            <p class="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">${ui.mediaConsentRememberHint || ''}</p>
            <div class="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                <button type="button" id="btn-media-consent-decline" class="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-semibold text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                    ${ui.mediaConsentDecline || ''}
                </button>
                <button type="button" id="btn-media-consent-accept" class="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-sm shadow">
                    ${ui.mediaConsentAccept || ''}
                </button>
            </div>
        </div>
    </div>`;
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

