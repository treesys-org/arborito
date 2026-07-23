/**
 * Rsync-style progress sync helpers: per-field merge + content fingerprint.
 * Top-level `updatedAt` is ignored for equality so republishing the same
 * payload does not look like a change.
 */

import { mergeRemoteGamification } from './gamification-merge.js';

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function mergeGameDataBuckets(local, remote) {
    const out = { ...asObject(local) };
    if (!remote || typeof remote !== 'object') return out;
    for (const [gameId, remoteBucket] of Object.entries(remote)) {
        if (!remoteBucket || typeof remoteBucket !== 'object') continue;
        const localBucket = out[gameId];
        if (!localBucket || typeof localBucket !== 'object') {
            out[gameId] = { ...remoteBucket };
            continue;
        }
        const remoteUpdated = Number(remoteBucket._sys_updated) || 0;
        const localUpdated = Number(localBucket._sys_updated) || 0;
        if (remoteUpdated >= localUpdated) {
            out[gameId] = { ...localBucket, ...remoteBucket };
        } else {
            out[gameId] = { ...remoteBucket, ...localBucket };
        }
    }
    return out;
}

export function mergeMemoryMaps(local, remote) {
    const out = { ...asObject(local) };
    if (!remote || typeof remote !== 'object') return out;
    for (const [id, remoteRow] of Object.entries(remote)) {
        const localRow = out[id];
        if (!localRow || typeof localRow !== 'object') {
            out[id] = remoteRow;
            continue;
        }
        if (!remoteRow || typeof remoteRow !== 'object') continue;
        const remoteAt = Number(remoteRow.updatedAt || remoteRow.last || remoteRow.lastReview || 0);
        const localAt = Number(localRow.updatedAt || localRow.last || localRow.lastReview || 0);
        out[id] = remoteAt >= localAt ? { ...localRow, ...remoteRow } : { ...remoteRow, ...localRow };
    }
    return out;
}

export function mergeBookmarkMaps(local, remote) {
    const out = { ...asObject(local) };
    if (!remote || typeof remote !== 'object') return out;
    for (const [id, remoteRow] of Object.entries(remote)) {
        if (remoteRow == null) continue;
        const localRow = out[id];
        if (localRow == null) {
            out[id] = remoteRow;
            continue;
        }
        if (
            typeof remoteRow === 'object' &&
            typeof localRow === 'object' &&
            remoteRow !== null &&
            localRow !== null
        ) {
            const remoteAt = Number(remoteRow.updatedAt || remoteRow.ts || 0);
            const localAt = Number(localRow.updatedAt || localRow.ts || 0);
            out[id] = remoteAt >= localAt ? { ...localRow, ...remoteRow } : { ...remoteRow, ...localRow };
        }
    }
    return out;
}

function sortedObjectFingerprint(obj, rowStamp) {
    const o = asObject(obj);
    const keys = Object.keys(o).sort();
    return keys.map((k) => [k, rowStamp(o[k])]);
}

function stampMemoryRow(row) {
    if (!row || typeof row !== 'object') return row;
    return {
        updatedAt: Number(row.updatedAt || row.last || row.lastReview || 0),
        ease: row.ease,
        interval: row.interval,
        reps: row.reps,
        lapses: row.lapses,
        due: row.due,
        state: row.state,
    };
}

function stampBookmarkRow(row) {
    if (row == null) return null;
    if (typeof row !== 'object') return row;
    return {
        updatedAt: Number(row.updatedAt || row.ts || 0),
        index: row.index,
        kind: row.kind,
        title: row.title,
    };
}

function stampGameBucket(bucket) {
    if (!bucket || typeof bucket !== 'object') return null;
    return {
        updated: Number(bucket._sys_updated) || 0,
        keys: Object.keys(bucket).sort(),
    };
}

function stampGamification(g) {
    const x = asObject(g);
    return {
        avatar: String(x.avatar || '').trim(),
        username: String(x.username || '').trim(),
        profileUpdatedAt: String(x.profileUpdatedAt || ''),
        xp: Number(x.xp) || 0,
        dailyXP: Number(x.dailyXP) || 0,
        streak: Number(x.streak) || 0,
        weeklyLumens: Number(x.weeklyLumens) || 0,
        streakShields: Number(x.streakShields) || 0,
        lumensSpent: Number(x.lumensSpent) || 0,
        arcadeScore: Number(x.arcadeScore) || 0,
        seeds: Array.isArray(x.seeds) ? x.seeds.map((s) => s?.id).filter(Boolean).sort() : [],
        inventory: Array.isArray(x.inventory) ? [...x.inventory].map(String).sort() : [],
    };
}

/**
 * Stable content identity for a sync payload (ignores top-level updatedAt / v).
 * @param {Record<string, unknown>|null|undefined} data
 */
export function fingerprintProgressPayload(data) {
    if (!data || typeof data !== 'object') return '';
    const progress = Array.isArray(data.progress)
        ? [...data.progress].map(String).filter(Boolean).sort()
        : [];
    return JSON.stringify({
        progress,
        memory: sortedObjectFingerprint(data.memory, stampMemoryRow),
        bookmarks: sortedObjectFingerprint(data.bookmarks, stampBookmarkRow),
        gameData: sortedObjectFingerprint(data.gameData, stampGameBucket),
        arcadeSaves: sortedObjectFingerprint(data.arcadeSaves, stampGameBucket),
        gamification: stampGamification(data.gamification),
    });
}

/**
 * @param {Record<string, unknown>|null|undefined} data
 */
export function isProgressPayloadEmpty(data) {
    if (!data || typeof data !== 'object') return true;
    if (Array.isArray(data.progress) && data.progress.length) return false;
    if (Object.keys(asObject(data.memory)).length) return false;
    if (Object.keys(asObject(data.bookmarks)).length) return false;
    if (Object.keys(asObject(data.gameData)).length) return false;
    if (Object.keys(asObject(data.arcadeSaves)).length) return false;
    const g = asObject(data.gamification);
    if ((Number(g.xp) || 0) > 0) return false;
    if ((Number(g.streak) || 0) > 0) return false;
    if ((Number(g.weeklyLumens) || 0) > 0) return false;
    if ((Number(g.arcadeScore) || 0) > 0) return false;
    const avatar = String(g.avatar || '').trim();
    if (avatar && avatar !== '👤' && avatar !== '🌱') return false;
    if (String(g.username || '').trim()) return false;
    if (Array.isArray(g.seeds) && g.seeds.length) return false;
    if (Array.isArray(g.inventory) && g.inventory.length) return false;
    return true;
}

/**
 * Merge remote sync blob fields into a plain local snapshot (not a UserStore).
 * @param {Record<string, unknown>} local
 * @param {Record<string, unknown>} remote
 */
export function mergeProgressSnapshots(local, remote) {
    const base = local && typeof local === 'object' ? local : {};
    const rem = remote && typeof remote === 'object' ? remote : {};
    const localProgress = Array.isArray(base.progress) ? base.progress.map(String) : [];
    const remoteProgress = Array.isArray(rem.progress) ? rem.progress.map(String) : [];
    return {
        v: 1,
        progress: [...new Set([...localProgress, ...remoteProgress])],
        memory: mergeMemoryMaps(base.memory, rem.memory),
        bookmarks: mergeBookmarkMaps(base.bookmarks, rem.bookmarks),
        gameData: mergeGameDataBuckets(base.gameData, rem.gameData),
        arcadeSaves: mergeGameDataBuckets(base.arcadeSaves, rem.arcadeSaves),
        gamification: mergeRemoteGamification(base.gamification, rem.gamification),
    };
}

/**
 * After a successful pull+merge, publish only when local content differs from remote
 * (or remote was missing and local has something worth uploading).
 * @param {{ remote: Record<string, unknown>|null, merged: Record<string, unknown> }} args
 */
export function shouldPublishMergedProgress({ remote, merged }) {
    if (isProgressPayloadEmpty(merged)) return false;
    if (!remote || typeof remote !== 'object') return true;
    return fingerprintProgressPayload(merged) !== fingerprintProgressPayload(remote);
}
