/**
 * Username availability + suggestion helpers for the sync-login flow.
 *
 * Both the Profile modal and the Onboarding wizard hit Nostr to confirm
 * whether a chosen username is already published, and offer free
 * alternatives when it is. This module centralises both behaviours so the
 * two modals stay in lockstep.
 */

import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { getConnectedNostr } from '../../../shared/lib/connected-services/index.js';
import { normalizeUsername } from '../../../shared/lib/normalize-username.js';

const SUGGESTION_OFFSETS = [2, 3, 7, 11, 21, 42];
const MAX_SUGGESTIONS = 3;

async function _nostr() {
    if (!store) return null;
    return getConnectedNostr(store);
}

/**
 * Find up to 3 free usernames by appending small numbers to a stem of `base`.
 * If every relay is unreachable / hostile, falls back to random 3-4 digit
 * suffixes so the user always gets actionable choices.
 *
 * @param {string} base
 * @returns {Promise<string[]>}
 */
export async function suggestUsernamesFor(base) {
    const nostr = await _nostr();
    const baseStr = String(base || '');
    const stem = baseStr.replace(/\d+$/, '').slice(0, 24) || baseStr;
    const tried = new Set([baseStr.toLowerCase()]);
    const candList = [];
    for (const n of SUGGESTION_OFFSETS) {
        if (candList.length >= MAX_SUGGESTIONS * 2) break;
        const cand = `${stem}${n}`;
        if (tried.has(cand.toLowerCase())) continue;
        tried.add(cand.toLowerCase());
        candList.push(cand);
    }
    const free = [];
    if (nostr && candList.length) {
        const results = await Promise.all(
            candList.map(async (cand) => {
                try {
                    const rec = await nostr.loadSyncLoginRecordOnce(cand, undefined, 2_200, {
                        firstHit: true,
                    });
                    return !rec?.hash ? cand : null;
                } catch {
                    return cand;
                }
            })
        );
        for (const c of results) {
            if (c) free.push(c);
            if (free.length >= MAX_SUGGESTIONS) break;
        }
    }
    if (!free.length) {
        for (let i = 0; i < MAX_SUGGESTIONS; i++) {
            const rnd = Math.floor(100 + Math.random() * 9000);
            free.push(`${stem}${rnd}`);
        }
    }
    return free.slice(0, MAX_SUGGESTIONS);
}

/**
 * Check whether `name` is already published as a sync-login account.
 *
 * Returns `null` when Nostr is unavailable (caller should treat as no-op),
 * `{ taken: false, suggestions: [] }` when free, and
 * `{ taken: true, suggestions }` when taken.
 *
 * @param {string} name
 * @returns {Promise<null | { taken: boolean, suggestions: string[] }>}
 */
export async function checkUsernameAvailability(name) {
    const target = normalizeUsername(name);
    if (!target) return null;
    const nostr = await _nostr();
    if (!nostr || typeof nostr.loadSyncLoginRecordOnce !== 'function') return null;
    const rec = await nostr.loadSyncLoginRecordOnce(target, undefined, 2_500, { firstHit: true });
    if (rec && rec.hash) {
        const suggestions = await suggestUsernamesFor(target);
        return { taken: true, suggestions };
    }
    return { taken: false, suggestions: [] };
}
