import { parseNostrTreeUrl } from '../../nostr/api/nostr-refs.js';
import { isPublishedResourceOwner } from './published-owner.js';

const STORAGE_KEY = 'arborito-creator-moderation-alerts-v1';
const MAX_ALERTS = 48;

/**
 * @typedef {{
 *   id: string,
 *   kind: 'community-report' | 'community-threshold' | 'legal-dispute',
 *   ownerPub: string,
 *   universeId: string,
 *   title?: string,
 *   shareCode?: string,
 *   caseId?: string,
 *   score?: number,
 *   threshold?: number,
 *   unique?: number,
 *   at: string,
 *   read: boolean,
 * }} CreatorModerationAlert
 */

/** @returns {{ alerts: CreatorModerationAlert[] }} */
export function loadCreatorModerationAlertsState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (!parsed || typeof parsed !== 'object') return { alerts: [] };
        const alerts = Array.isArray(parsed.alerts) ? parsed.alerts : [];
        return {
            alerts: alerts
                .filter((a) => a && typeof a === 'object' && a.id && a.kind)
                .slice(0, MAX_ALERTS),
        };
    } catch {
        return { alerts: [] };
    }
}

/** @param {{ alerts: CreatorModerationAlert[] }} state */
export function saveCreatorModerationAlertsState(state) {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                alerts: (state.alerts || []).slice(0, MAX_ALERTS),
            })
        );
    } catch {
        /* ignore */
    }
}

/** @param {CreatorModerationAlert[]} alerts */
export function countUnreadCreatorModerationAlerts(alerts) {
    return (alerts || []).filter((a) => a && !a.read).length;
}

/**
 * @param {import('../../../core/store.js').Store | null | undefined} store
 * @param {(pub: string) => { pub?: string, priv?: string } | null | undefined} getPair
 */
export function collectOwnedPublishedTreeRefs(store, getPair) {
    const out = [];
    const seen = new Set();
    const getPairFn = typeof getPair === 'function' ? getPair : () => null;
    const branches = store?.userStore?.state?.branches || [];
    const trees = store?.userStore?.state?.trees || [];
    for (const b of branches) {
        const url = String(b?.publishedNetworkUrl || '').trim();
        if (!url || !isPublishedResourceOwner(b, getPairFn)) continue;
        const ref = parseNostrTreeUrl(url);
        if (!ref?.pub || !ref?.universeId) continue;
        const k = `${ref.pub}/${ref.universeId}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({
            ownerPub: ref.pub,
            universeId: ref.universeId,
            title: String(b?.name || b?.data?.meta?.title || '').trim(),
            shareCode: String(b?.data?.meta?.shareCode || b?.shareCode || '').trim(),
        });
    }
    for (const t of trees) {
        const url = String(t?.publishedNetworkUrl || '').trim();
        if (!url || !isPublishedResourceOwner(t, getPairFn)) continue;
        const ref = parseNostrTreeUrl(url);
        if (!ref?.pub || !ref?.universeId) continue;
        const k = `${ref.pub}/${ref.universeId}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({
            ownerPub: ref.pub,
            universeId: ref.universeId,
            title: String(t?.name || t?.data?.meta?.title || '').trim(),
            shareCode: String(t?.data?.meta?.shareCode || t?.shareCode || '').trim(),
        });
    }
    return out;
}

/**
 * @param {CreatorModerationAlert[]} alerts
 * @param {CreatorModerationAlert} next
 */
export function upsertCreatorModerationAlert(alerts, next) {
    const list = Array.isArray(alerts) ? [...alerts] : [];
    const idx = list.findIndex((a) => a.id === next.id);
    if (idx >= 0) {
        const prev = list[idx];
        list[idx] = { ...prev, ...next, read: prev.read && next.read };
    } else {
        list.unshift({ ...next, read: !!next.read });
    }
    return list.slice(0, MAX_ALERTS);
}

export function markAllCreatorModerationAlertsRead(alerts) {
    return (alerts || []).map((a) => ({ ...a, read: true }));
}

export function markCreatorModerationAlertRead(alerts, id) {
    return (alerts || []).map((a) => (a.id === id ? { ...a, read: true } : a));
}
