import { getArboritoStore } from '../core/store-singleton.js';
import { ensureConnectedNostr } from '../shared/lib/connected-services/index.js';
import { computeReportSignalsFromRows } from '../features/sources/api/modals/logic/sources-directory-fetch.js';
import { computeReportHideThreshold } from '../features/sources/api/modals/logic/sources-directory-row-state.js';
import {
    collectOwnedPublishedTreeRefs,
    countUnreadCreatorModerationAlerts,
    loadCreatorModerationAlertsState,
    markAllCreatorModerationAlertsRead,
    saveCreatorModerationAlertsState,
    upsertCreatorModerationAlert,
} from '../features/publishing/api/creator-moderation-alerts.js';

function shell() {
    return getArboritoStore();
}

function pushAlertsToStore(alerts) {
    const store = shell();
    if (!store) return;
    const unread = countUnreadCreatorModerationAlerts(alerts);
    store.update({
        creatorModerationAlerts: alerts,
        creatorModerationUnreadCount: unread,
    });
}

/** @param {ReturnType<typeof loadCreatorModerationAlertsState>['alerts']} alerts */
function persistAndSync(alerts) {
    saveCreatorModerationAlertsState({ alerts });
    pushAlertsToStore(alerts);
}

/**
 * Scan every tree/branch this device publishes and refresh the bell inbox.
 */
export async function refreshCreatorModerationAlertsAction() {
    const store = shell();
    if (!store) return false;
    const owned = collectOwnedPublishedTreeRefs(store, store.getNostrPublisherPair?.bind(store));
    if (!owned.length) {
        persistAndSync([]);
        return false;
    }
    try {
        await ensureConnectedNostr(store, { timeoutMs: 10000 });
    } catch {
        return false;
    }
    const net = store.nostr;
    if (!net) return false;

    let alerts = loadCreatorModerationAlertsState().alerts;
    let changed = false;

    for (const row of owned) {
        const { ownerPub, universeId, title, shareCode } = row;
        const base = { ownerPub, universeId, title, shareCode };

        if (typeof net.listTreeLegalReportsOnce === 'function' && typeof net.loadTreeLegalOwnerDefenseOnce === 'function') {
            try {
                const legalRows = await net.listTreeLegalReportsOnce({ ownerPub, universeId, max: 5 });
                const latest = legalRows?.[0];
                const latestLegalAt = String(latest?.at || '');
                const caseId = String(latest?.caseId || '').trim();
                if (latestLegalAt) {
                    const def = await net.loadTreeLegalOwnerDefenseOnce({ ownerPub, universeId });
                    const defAt = String(def?.latestLegalReportAt || '');
                    const needsOwner = !defAt || defAt < latestLegalAt;
                    if (needsOwner) {
                        const id = `${ownerPub}/${universeId}:legal:${latestLegalAt}`;
                        const prev = alerts.find((a) => a.id === id);
                        if (!prev) changed = true;
                        alerts = upsertCreatorModerationAlert(alerts, {
                            id,
                            kind: 'legal-dispute',
                            ...base,
                            caseId: caseId || def?.caseId || '',
                            at: latestLegalAt,
                            read: prev?.read ?? false,
                        });
                    }
                }
            } catch {
                /* ignore per tree */
            }
        }

        if (typeof net.listTreeReportsOnce === 'function') {
            try {
                let appealThroughAt = '';
                if (typeof net.loadTreeDirectoryOwnerAppealOnce === 'function') {
                    const appeal = await net.loadTreeDirectoryOwnerAppealOnce({ ownerPub, universeId });
                    appealThroughAt = String(appeal?.reportsThroughAt || '');
                }
                const reportRows = await net.listTreeReportsOnce({ ownerPub, universeId, max: 80 });
                const latestAt = String(reportRows?.[0]?.at || '');
                if (!latestAt) continue;
                const signals = computeReportSignalsFromRows(reportRows, {
                    daysWindow: 14,
                    ignoreBeforeAt: appealThroughAt || null,
                });
                let votes = 0;
                let used7 = 0;
                if (typeof net.countTreeVotesOnce === 'function') {
                    try {
                        votes = Number(await net.countTreeVotesOnce({ ownerPub, universeId })) || 0;
                    } catch {
                        /* ignore */
                    }
                }
                if (typeof net.countTreeUsageUniqueLastNDaysOnce === 'function') {
                    try {
                        used7 =
                            Number(
                                await net.countTreeUsageUniqueLastNDaysOnce({
                                    ownerPub,
                                    universeId,
                                    days: 7,
                                })
                            ) || 0;
                    } catch {
                        /* ignore */
                    }
                }
                const threshold = computeReportHideThreshold({ votes, used7 });
                const kind =
                    signals.score >= threshold ? 'community-threshold' : 'community-report';
                const id = `${ownerPub}/${universeId}:${kind}:${latestAt}`;
                const prev = alerts.find((a) => a.id === id);
                if (!prev) changed = true;
                alerts = upsertCreatorModerationAlert(alerts, {
                    id,
                    kind,
                    ...base,
                    score: signals.score,
                    threshold,
                    unique: signals.unique,
                    at: latestAt,
                    read: prev?.read ?? false,
                });
            } catch {
                /* ignore per tree */
            }
        }
    }

    persistAndSync(alerts);
    return changed;
}

export function syncCreatorModerationAlertsFromStorageAction() {
    const alerts = loadCreatorModerationAlertsState().alerts;
    pushAlertsToStore(alerts);
}

export function openCreatorModerationAlertsModalAction() {
    const store = shell();
    if (!store) return;
    const alerts = loadCreatorModerationAlertsState().alerts;
    pushAlertsToStore(alerts);
    store.update({ modal: { type: 'creator-moderation-alerts' } });
}

export function markCreatorModerationAlertsReadAction() {
    const alerts = markAllCreatorModerationAlertsRead(loadCreatorModerationAlertsState().alerts);
    persistAndSync(alerts);
}

/** Store.prototype, creator moderation bell. */
export const creatorModerationAlertsMethods = {
    refreshCreatorModerationAlerts: refreshCreatorModerationAlertsAction,
    syncCreatorModerationAlertsFromStorage: syncCreatorModerationAlertsFromStorageAction,
    openCreatorModerationAlertsModal: openCreatorModerationAlertsModalAction,
    markCreatorModerationAlertsRead: markCreatorModerationAlertsReadAction,
};
