import { SOURCES_REPORT_HIDE_THRESHOLD } from './sources-local-storage.js';

export function rowKeyFromDirectory(r) {
    return `${r?.ownerPub || ''}/${r?.universeId || ''}`;
}

export function getRowMetricsFromMap(r, metricsMap) {
    const k = rowKeyFromDirectory(r);
    const metrics = metricsMap && typeof metricsMap === 'object' ? metricsMap : {};
    return metrics[k] && typeof metrics[k] === 'object' ? metrics[k] : {};
}

export function computeDirectoryRowState(r, metricsMap) {
    const ownerPub = String(r?.ownerPub || '').trim();
    const universeId = String(r?.universeId || '').trim();
    const m = getRowMetricsFromMap(r, metricsMap);
    const reports14 = Number.isFinite(Number(m.reports14Unique)) ? Number(m.reports14Unique) : null;
    const reportScore = Number.isFinite(Number(m.reportScore)) ? Number(m.reportScore) : null;
    const legal90Unique = Number.isFinite(Number(m.legal90Unique)) ? Number(m.legal90Unique) : null;
    const thr = SOURCES_REPORT_HIDE_THRESHOLD;
    const isReported = reportScore != null && reportScore >= thr;
    const hidden = !!isReported;
    const legalLatestAt = String(m.legalLatestAt || '').trim();
    const legalOwnerDefenseLatestAt = String(m.legalOwnerDefenseLatestAt || '').trim();
    const ms48 = 48 * 60 * 60 * 1000;
    const legalT = legalLatestAt ? Date.parse(legalLatestAt) : NaN;
    const covered = !!(
        legalLatestAt &&
        legalOwnerDefenseLatestAt &&
        legalOwnerDefenseLatestAt >= legalLatestAt
    );
    const legalPendingDefense =
        (Number(legal90Unique) || 0) > 0 && !!legalLatestAt && !covered && Number.isFinite(legalT);
    const legalWithin48h = !!(legalPendingDefense && Date.now() - legalT < ms48);
    const legalAfter48h = !!(legalPendingDefense && Date.now() - legalT >= ms48);
    const legalDisputeWindowOpen = legalWithin48h;
    return {
        ownerPub,
        universeId,
        reports14,
        reportScore,
        legal90Unique,
        legalLatestAt,
        legalOwnerDefenseLatestAt,
        threshold: thr,
        isReported,
        hidden,
        legalPendingDefense,
        legalWithin48h,
        legalAfter48h,
        legalDisputeWindowOpen,
    };
}
