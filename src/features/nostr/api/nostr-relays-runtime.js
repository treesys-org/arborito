/**
 * Nostr relay URL configuration.
 * Override deploy list with `window.ARBORITO_NOSTR_RELAYS` or user choice via
 * `localStorage` key `arborito-nostr-relays-v1` (JSON string array).
 * Deploy details: `docs/NETWORK.md`.
 * User-facing copy: `locales/*.json` (`privacyNostrRelays*`, `onboardingNetwork*`).
 */

export const NOSTR_RELAYS_STORAGE_KEY = 'arborito-nostr-relays-v1';
const RELAYS_BACKFILL_KEY = 'arborito-relays-backfill-v1';
const RELAYS_STOCK_MIGRATE_KEY = 'arborito-relays-stock-migrate-v2';

/** Stock build: no implicit relay connections until the user opts in. */
export const DEFAULT_NOSTR_RELAYS = [];

/**
 * Former onboarding bundle (pre-v2). Used only to detect unmodified stock lists
 * for a silent one-shot swap — custom lists are never rewritten.
 */
export const LEGACY_SUGGESTED_NOSTR_RELAYS = [
    'wss://relay.tchncs.de',
    'wss://nostr.einundzwanzig.space',
    'wss://purplepag.es',
    'wss://nos.lol',
    'wss://relay.primal.net',
];

/**
 * Availability-first bundle offered in onboarding / profile restore.
 * Relays that already carry Arborito directory + bundle data (DE + CA).
 * Disclosed in privacy copy when the user accepts network.
 */
export const SUGGESTED_NOSTR_RELAYS = [
    'wss://nos.lol',
    'wss://nostr.mom',
    'wss://relay.primal.net',
    'wss://relay.ditto.pub',
    'wss://relay.nostr.net',
];

/** Short labels for onboarding relay chips (host + region hint). */
export const SUGGESTED_NOSTR_RELAY_LABELS = {
    'wss://nos.lol': 'DE',
    'wss://nostr.mom': 'DE',
    'wss://relay.primal.net': 'CA',
    'wss://relay.ditto.pub': 'CA',
    'wss://relay.nostr.net': 'CA',
};

/**
 * @param {unknown} v
 * @returns {string[]}
 */
export function normalizeNostrRelayUrls(v) {
    const list = Array.isArray(v) ? v : [];
    const out = [];
    const seen = new Set();
    for (const p of list) {
        let s = String(p || '').trim();
        if (!s) continue;
        if (!/^wss?:\/\//i.test(s)) {
            try {
                s = new URL(`https://${s.replace(/^\/\//, '')}`).toString().replace(/^https:/i, 'wss:');
            } catch {
                continue;
            }
        }
        if (!/^wss:\/\//i.test(s)) continue;
        if (seen.has(s)) continue;
        seen.add(s);
        out.push(s);
    }
    return out;
}

/**
 * Union of relay URL lists (deduplicated, order preserved).
 * @param {...unknown} lists
 * @returns {string[]}
 */
export function mergeNostrRelayUrls(...lists) {
    const out = [];
    const seen = new Set();
    for (const list of lists) {
        for (const url of normalizeNostrRelayUrls(list)) {
            if (seen.has(url)) continue;
            seen.add(url);
            out.push(url);
        }
    }
    return out;
}

/**
 * Same URLs as a set (order ignored).
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function sameNostrRelayUrlSet(a, b) {
    const aa = normalizeNostrRelayUrls(a);
    const bb = normalizeNostrRelayUrls(b);
    if (aa.length !== bb.length) return false;
    const setB = new Set(bb);
    return aa.every((u) => setB.has(u));
}

/** @returns {string[]} */
export function getWindowConfiguredNostrRelays() {
    try {
        const w = typeof window !== 'undefined' ? window : null;
        const raw = w && w.ARBORITO_NOSTR_RELAYS;
        const n = normalizeNostrRelayUrls(raw);
        if (n.length) return n;
    } catch {
        /* ignore */
    }
    return [];
}

/** @returns {string[]} */
export function loadUserNostrRelays() {
    if (typeof localStorage === 'undefined') return [];
    try {
        const raw = localStorage.getItem(NOSTR_RELAYS_STORAGE_KEY);
        if (!raw) return [];
        return normalizeNostrRelayUrls(JSON.parse(raw));
    } catch {
        return [];
    }
}

/**
 * @param {unknown} urls
 * @returns {string[]} normalized list that was stored
 */
export function persistUserNostrRelays(urls) {
    const normalized = normalizeNostrRelayUrls(urls);
    if (typeof localStorage !== 'undefined') {
        try {
            localStorage.setItem(NOSTR_RELAYS_STORAGE_KEY, JSON.stringify(normalized));
        } catch {
            /* private mode / quota */
        }
    }
    return normalized;
}

/**
 * Suggested (or deploy-page) relay list when the user has none stored.
 * @returns {string[]}
 */
export function resolveDefaultOptInNostrRelays() {
    const fromPage = getWindowConfiguredNostrRelays();
    return fromPage.length ? fromPage : [...SUGGESTED_NOSTR_RELAYS];
}

/**
 * After network consent is granted: if the user has no relays (e.g. after
 * local-only), persist the recommended bundle so Online actually works.
 * @returns {string[]|null} relays written, or null if already configured
 */
export function ensureOptInRelaysAfterNetworkGrant() {
    if (loadUserNostrRelays().length) return null;
    return persistUserNostrRelays(resolveDefaultOptInNostrRelays());
}

/**
 * One-time migration for alpha users who granted network consent before explicit relay storage.
 * @param {{ hasGdprNetworkConsent: () => boolean, onboardingSeen?: boolean }} opts
 * @returns {string[]|null} relays written, or null if skipped
 */
export function backfillSuggestedRelaysIfNeeded(opts = {}) {
    const { hasGdprNetworkConsent, onboardingSeen = true } = opts;
    if (!hasGdprNetworkConsent?.() || !onboardingSeen) return null;
    if (loadUserNostrRelays().length) return null;
    if (typeof localStorage === 'undefined') return null;
    try {
        if (localStorage.getItem(RELAYS_BACKFILL_KEY)) return null;
        localStorage.setItem(RELAYS_BACKFILL_KEY, '1');
    } catch {
        return null;
    }
    return persistUserNostrRelays(resolveDefaultOptInNostrRelays());
}

/**
 * Silent one-shot: if the stored list is exactly the old stock bundle, replace
 * with the current suggested set. Custom lists are left untouched.
 * @returns {string[]|null} relays written, or null if skipped
 */
export function migrateStockSuggestedRelaysIfNeeded() {
    if (typeof localStorage === 'undefined') return null;
    try {
        if (localStorage.getItem(RELAYS_STOCK_MIGRATE_KEY)) return null;
    } catch {
        return null;
    }
    const current = loadUserNostrRelays();
    if (!current.length) {
        try {
            localStorage.setItem(RELAYS_STOCK_MIGRATE_KEY, '1');
        } catch {
            /* ignore */
        }
        return null;
    }
    if (!sameNostrRelayUrlSet(current, LEGACY_SUGGESTED_NOSTR_RELAYS)) {
        try {
            localStorage.setItem(RELAYS_STOCK_MIGRATE_KEY, '1');
        } catch {
            /* ignore */
        }
        return null;
    }
    const next = persistUserNostrRelays(resolveDefaultOptInNostrRelays());
    try {
        localStorage.setItem(RELAYS_STOCK_MIGRATE_KEY, '1');
    } catch {
        /* ignore */
    }
    return next;
}

/** Display hostname from wss URL for UI chips. */
export function nostrRelayDisplayHost(url) {
    try {
        return new URL(String(url || '')).hostname.replace(/^www\./i, '');
    } catch {
        return String(url || '').replace(/^wss?:\/\//i, '').split('/')[0] || '';
    }
}

/**
 * Merge hint relay lists into a Nostr service peer set.
 * @param {{ setPeers: (p: string[]) => void, peers?: string[] }|null|undefined} nostrService
 * @param {...unknown} hintLists
 * @returns {string[]}
 */
export function applyMergedRelaysToService(nostrService, ...hintLists) {
    if (!nostrService || typeof nostrService.setPeers !== 'function') {
        return mergeNostrRelayUrls(...hintLists);
    }
    const merged = mergeNostrRelayUrls(nostrService.peers, ...hintLists);
    if (merged.length) nostrService.setPeers(merged);
    return merged;
}
