/**
 * Default public Nostr relays (wss). Relay operators / jurisdiction are a policy choice (e.g. EU).
 * Override with `window.ARBORITO_NOSTR_RELAYS` or localStorage `arborito-nostr-relays-v1` (JSON string array).
 * Deploy / override details: `docs/NOSTR_RELAYS_CONFIGURATION.md`. User-facing privacy copy: `locales/*.json` (`privacyNostrRelays*`, `privacyText`).
 */

export const DEFAULT_NOSTR_RELAYS = [
    'wss://relay.tchncs.de',
    'wss://haven.relayted.de',
    'wss://relay.snort.social'
];

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
