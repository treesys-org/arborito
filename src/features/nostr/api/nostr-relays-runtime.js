/**
 * Nostr relay URL configuration.
 * Override deploy list with `window.ARBORITO_NOSTR_RELAYS` or user choice via
 * `localStorage` key `arborito-nostr-relays-v1` (JSON string array).
 * Deploy details: `docs/NOSTR_RELAYS_CONFIGURATION.md`.
 * User-facing copy: `locales/*.json` (`privacyNostrRelays*`, `onboardingNetwork*`).
 */

export const NOSTR_RELAYS_STORAGE_KEY = 'arborito-nostr-relays-v1';
const RELAYS_BACKFILL_KEY = 'arborito-relays-backfill-v1';

/** Stock build: no implicit relay connections until the user opts in. */
export const DEFAULT_NOSTR_RELAYS = [];

/**
 * Availability-first bundle offered in onboarding / profile restore.
 * Mixed EU + US operators; disclosed in privacy copy when the user accepts network.
 */
export const SUGGESTED_NOSTR_RELAYS = [
    'wss://relay.tchncs.de',
    'wss://nostr.einundzwanzig.space',
    'wss://purplepag.es',
    'wss://nos.lol',
    'wss://relay.primal.net',
];

/** Short labels for onboarding relay chips (host + region hint). */
export const SUGGESTED_NOSTR_RELAY_LABELS = {
    'wss://relay.tchncs.de': 'DE',
    'wss://nostr.einundzwanzig.space': 'DE',
    'wss://purplepag.es': 'multi',
    'wss://nos.lol': 'US',
    'wss://relay.primal.net': 'US',
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
    const fromPage = getWindowConfiguredNostrRelays();
    const urls = fromPage.length ? fromPage : [...SUGGESTED_NOSTR_RELAYS];
    return persistUserNostrRelays(urls);
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
