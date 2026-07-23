/**
 * Maintainer blocklist: embedded JSON + optional GitHub refresh when online.
 *
 * Data file: `maintainer-nostr-tree-blocklist.json`
 * Shape: `[{ "ownerPub": "…", "universeId": "…" }, …]`
 *
 * - Embedded copy ships with the build (offline / first paint).
 * - With GDPR network consent, we fetch the same path on `main` from GitHub and
 *   merge (union). Old installs pick up new blocks without an app update.
 * - Not automatic moderation. Relays may still hold the events.
 */

import blocklistJson from './maintainer-nostr-tree-blocklist.json';
import {
    hasGdprNetworkConsent,
    onGdprNetworkConsentGranted,
} from '../../privacy-gdpr/api/network-consent.js';
import { GITHUB_REPO } from '../../../shared/lib/release-downloads.js';

const REMOTE_PATH = 'src/features/nostr/api/maintainer-nostr-tree-blocklist.json';
const REMOTE_URL = `${GITHUB_REPO.replace('github.com', 'raw.githubusercontent.com')}/main/${REMOTE_PATH}`;
const LS_KEY = 'arborito.maintainer-nostr-tree-blocklist.v1';
const FETCH_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const MAX_REMOTE_ENTRIES = 5000;

const _key = (ownerPub, universeId) =>
    `${String(ownerPub || '').trim().toLowerCase()}/${String(universeId || '').trim()}`;

/** @type {Set<string>} */
const _blocked = new Set();

let _lastFetchAt = 0;
let _fetchInFlight = null;

function addPairs(rows) {
    const list = Array.isArray(rows) ? rows : [];
    let n = 0;
    for (const row of list) {
        if (!row || typeof row !== 'object') continue;
        const k = _key(row.ownerPub, row.universeId);
        if (k === '/') continue;
        _blocked.add(k);
        n += 1;
        if (n >= MAX_REMOTE_ENTRIES) break;
    }
}

function readCachedRemote() {
    if (typeof localStorage === 'undefined') return null;
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        if (!Array.isArray(parsed.pairs)) return null;
        return parsed;
    } catch {
        return null;
    }
}

function writeCachedRemote(pairs) {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(
            LS_KEY,
            JSON.stringify({ at: new Date().toISOString(), pairs: pairs.slice(0, MAX_REMOTE_ENTRIES) })
        );
    } catch {
        /* private mode / quota */
    }
}

function rebuildFromEmbeddedAndCache() {
    _blocked.clear();
    addPairs(blocklistJson);
    const cached = readCachedRemote();
    if (cached?.pairs) addPairs(cached.pairs);
}

rebuildFromEmbeddedAndCache();

/**
 * @param {string} ownerPub
 * @param {string} universeId
 * @returns {boolean}
 */
export function isNostrTreeMaintainerBlocked(ownerPub, universeId) {
    return _blocked.has(_key(ownerPub, universeId));
}

/** @returns {string} */
export function maintainerBlocklistRemoteUrl() {
    return REMOTE_URL;
}

/**
 * Fetch GitHub copy and merge. No-op without network consent.
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<boolean>} true if remote was applied
 */
export async function refreshMaintainerNostrTreeBlocklist(opts = {}) {
    const force = !!opts.force;
    if (!hasGdprNetworkConsent()) return false;
    const now = Date.now();
    if (!force && now - _lastFetchAt < FETCH_MIN_INTERVAL_MS) return false;
    if (_fetchInFlight) return _fetchInFlight;

    _fetchInFlight = (async () => {
        const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer =
            ac && typeof setTimeout === 'function'
                ? setTimeout(() => {
                      try {
                          ac.abort();
                      } catch {
                          /* ignore */
                      }
                  }, FETCH_TIMEOUT_MS)
                : null;
        try {
            const res = await fetch(REMOTE_URL, {
                method: 'GET',
                cache: 'no-cache',
                signal: ac?.signal,
            });
            if (!res.ok) return false;
            const data = await res.json();
            if (!Array.isArray(data)) return false;
            const pairs = data
                .filter((row) => row && typeof row === 'object')
                .map((row) => ({
                    ownerPub: String(row.ownerPub || '').trim().toLowerCase(),
                    universeId: String(row.universeId || '').trim(),
                }))
                .filter((row) => row.ownerPub && row.universeId)
                .slice(0, MAX_REMOTE_ENTRIES);
            writeCachedRemote(pairs);
            rebuildFromEmbeddedAndCache();
            _lastFetchAt = Date.now();
            return true;
        } catch (e) {
            console.warn('[Arborito] maintainer blocklist remote refresh failed', e);
            return false;
        } finally {
            if (timer) clearTimeout(timer);
            _fetchInFlight = null;
        }
    })();

    return _fetchInFlight;
}

try {
    onGdprNetworkConsentGranted(() => {
        void refreshMaintainerNostrTreeBlocklist({ force: true });
    });
} catch {
    /* ignore */
}
