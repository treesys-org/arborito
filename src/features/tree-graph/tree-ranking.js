/**
 * Weekly tree leaderboard via Nostr (opt-in). Client-side aggregation only.
 */

import { formatUserHandle } from '../../shared/lib/user-handle.js';
import { hasNetworkSocialConsent } from '../privacy-gdpr/network-social-consent.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** ISO week key e.g. "2026-W21" */
function getWeekKey(date = new Date()) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * @param {import('../../core/store.js').default} store
 */
function canUseTreeRanking(store) {
    if (!hasNetworkSocialConsent(store)) return false;
    const g = store.userStore.state.gamification;
    if (!g.rankingOptIn) return false;
    const treeRef = store.getActivePublicTreeRef?.();
    if (!treeRef?.pub) return false;
    const pair = store.getNetworkUserPair?.();
    if (!pair?.pub) return false;
    return true;
}

/**
 * @param {import('../../core/store.js').default} store
 */
function buildRankingPayload(store) {
    const g = store.userStore.state.gamification;
    const pair = store.getNetworkUserPair();
    const weekKey = getWeekKey();
    const weeklyLumens = Math.max(0, Number(g.weeklyLumens) || Number(g.dailyXP) || 0);
    return {
        weekKey,
        userPub: pair?.pub || '',
        weeklyLumens,
        streak: Number(g.streak) || 0,
        avatar: g.avatar || '🌱',
        displayName: g.rankingAnonymous ? null : String(g.username || '').trim() || null,
        anonymous: !!g.rankingAnonymous,
        updatedAt: Date.now()
    };
}

/**
 * @param {import('../../core/store.js').default} store
 */
export async function publishTreeRankingIfOptedIn(store) {
    if (!canUseTreeRanking(store)) return;
    let pair = store.getNetworkUserPair();
    if (!pair?.priv && store.ensureNetworkUserPair) {
        pair = await store.ensureNetworkUserPair();
    }
    if (!pair?.priv) return;
    const treeRef = store.getActivePublicTreeRef();
    const payload = buildRankingPayload(store);
    payload.userPub = pair.pub;
    try {
        await store.nostr.putTreeLeaderboardEntry({
            pub: treeRef.pub,
            universeId: treeRef.universeId,
            userPub: pair.pub,
            signerPair: pair,
            record: payload
        });
    } catch {
        /* offline / relay */
    }
}

/**
 * @typedef {{ rank: number, userPub: string, weeklyLumens: number, streak: number, avatar: string, displayName: string, isSelf: boolean }} RankingRow
 */

/**
 * @param {import('../../core/store.js').default} store
 * @returns {Promise<{ rows: RankingRow[], weekKey: string, treeLabel: string }|null>}
 */
export async function fetchTreeRanking(store) {
    const treeRef = store.getActivePublicTreeRef?.();
    if (!treeRef?.pub) return null;
    const weekKey = getWeekKey();
    const myPub = store.getNetworkUserPair?.()?.pub || '';

    let events = [];
    try {
        events = await store.nostr.queryTreeLeaderboard({
            pub: treeRef.pub,
            universeId: treeRef.universeId,
            weekKey,
            limit: 80
        });
    } catch {
        return { rows: [], weekKey, treeLabel: store.state.activeSource?.name || '' };
    }

    /** @type {Map<string, object>} */
    const byPub = new Map();
    for (const ev of events) {
        try {
            const row = JSON.parse(ev.content || '{}');
            if (!row?.userPub) continue;
            if (row.weekKey && row.weekKey !== weekKey) continue;
            const prev = byPub.get(row.userPub);
            if (!prev || (row.updatedAt || 0) > (prev.updatedAt || 0)) {
                byPub.set(row.userPub, row);
            }
        } catch {
            continue;
        }
    }

    const sorted = [...byPub.values()].sort((a, b) => (b.weeklyLumens || 0) - (a.weeklyLumens || 0));
    const rows = sorted.slice(0, 20).map((row, i) => ({
        rank: i + 1,
        userPub: row.userPub,
        weeklyLumens: row.weeklyLumens || 0,
        streak: row.streak || 0,
        avatar: row.avatar || '🌱',
        displayName: row.anonymous || !row.displayName
            ? formatUserHandle('', row.userPub)
            : row.displayName,
        isSelf: myPub && String(row.userPub) === String(myPub)
    }));

    return {
        rows,
        weekKey,
        treeLabel: store.state.activeSource?.name || ''
    };
}

/** Reset weekly counter when week rolls over (called from user-store). */
export function ensureWeeklyLumensReset(gamification) {
    const wk = getWeekKey();
    if (gamification.weeklyWeekKey !== wk) {
        return { weeklyWeekKey: wk, weeklyLumens: 0 };
    }
    return null;
}
