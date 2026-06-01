/**
 * Default public Nostr relays (wss). Relay operators / jurisdiction are a policy choice (e.g. EU).
 * Override with `window.ARBORITO_NOSTR_RELAYS` or localStorage `arborito-nostr-relays-v1` (JSON string array).
 * Deploy / override details: `docs/NOSTR_RELAYS_CONFIGURATION.md`. User-facing privacy copy: `locales/*.json` (`privacyNostrRelays*`, `privacyText`).
 */

/* Default relay set is **availability-first** — Arborito needs at least one
   responsive relay for the public features to work, and several EU-only
   public relays we previously used (free.relayted.de, relay.nostrich.de,
   snort.social) had recurring multi-day outages in 2025–2026 that left
   users on a single survivor. The current set mixes EU and US-based
   providers chosen for measured uptime; the user-facing privacy copy
   (`networkSocialConsentLead`, `privacyNostrRelaysBody`) makes the mixed
   jurisdiction explicit so people can decide whether to opt in.

   Why FIVE entries instead of three or four:
   With only 4 hosts, losing 2 of them leaves the app on a single survivor
   and the user feels "el relay anda y a veces no". 5 hosts gives one extra
   margin. The per-relay circuit breaker in `nostr-universe.js` (15s → 60s
   → 5min → 10min ladder) mutes any host that fails so the cost of an extra
   entry is low: a downed relay is only contacted once per cooldown window
   per session, and a background prober re-tests cooled-down relays every
   ~3 minutes so a relay coming back online is noticed quickly.

   Deployments that target a different audience can override via
   `window.ARBORITO_NOSTR_RELAYS` or `localStorage['arborito-nostr-relays-v1']`
   — see `docs/NOSTR_RELAYS_CONFIGURATION.md` for the precedence rules. */
export const DEFAULT_NOSTR_RELAYS = [
    'wss://relay.tchncs.de',            // Germany (EU) — strfry, very stable
    'wss://nostr.einundzwanzig.space',  // Germany (EU) — community (21)
    'wss://purplepag.es',               // Profile-specialised relay, broad reach
    'wss://nos.lol',                    // United States — high-uptime general relay
    'wss://relay.primal.net'            // United States — Primal infra, high availability
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
