import { getArboritoStore as store } from '../../../../../core/store-singleton.js';

/** Base unique-reporter score before popularity scaling. */
const SOURCES_REPORT_HIDE_THRESHOLD_BASE = 8;
/** Cap so obscure trees still hide at a finite ceiling. */
const SOURCES_REPORT_HIDE_THRESHOLD_MAX = 28;

/**
 * Popular trees need more verified unique reporters to drop out of Discover.
 * Index-only rule, direct links and relays are unchanged (consultative index).
 */
export function computeReportHideThreshold(metrics = {}) {
    const votes = Math.max(0, Number(metrics.votes) || 0);
    const used7 = Math.max(0, Number(metrics.used7) || 0);
    const bonus =
        Math.floor(Math.log1p(votes) * 1.8) + Math.floor(Math.log1p(used7) * 1.4);
    return Math.min(SOURCES_REPORT_HIDE_THRESHOLD_MAX, SOURCES_REPORT_HIDE_THRESHOLD_BASE + bonus);
}

export function rowKeyFromDirectory(r) {
    return `${r?.ownerPub || ''}/${r?.universeId || ''}`;
}

export function getRowMetricsFromMap(r, metricsMap) {
    const k = rowKeyFromDirectory(r);
    const metrics = metricsMap && typeof metricsMap === 'object' ? metricsMap : {};
    return metrics[k] && typeof metrics[k] === 'object' ? metrics[k] : {};
}

function isDirectoryRowOwner(r) {
    try {
        const pub = String(r?.ownerPub || '').trim();
        return !!(pub && store.getNostrPublisherPair?.(pub)?.priv);
    } catch {
        return false;
    }
}

export function computeDirectoryRowState(r, metricsMap) {
    const ownerPub = String(r?.ownerPub || '').trim();
    const universeId = String(r?.universeId || '').trim();
    const m = getRowMetricsFromMap(r, metricsMap);
    const reports14 = Number.isFinite(Number(m.reports14Unique)) ? Number(m.reports14Unique) : null;
    const reportScore = Number.isFinite(Number(m.reportScore)) ? Number(m.reportScore) : null;
    const legal90Unique = Number.isFinite(Number(m.legal90Unique)) ? Number(m.legal90Unique) : null;
    const threshold = computeReportHideThreshold(m);
    const isReported = reportScore != null && reportScore >= threshold;
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
    const legalUniqueN = Number(legal90Unique) || 0;
    const legalHides =
        legalPendingDefense && !covered && (legalUniqueN >= 2 || legalAfter48h);
    return {
        ownerPub,
        universeId,
        reports14,
        reportScore,
        legal90Unique,
        legalLatestAt,
        legalOwnerDefenseLatestAt,
        threshold,
        isReported,
        hidden,
        legalPendingDefense,
        legalWithin48h,
        legalAfter48h,
        legalDisputeWindowOpen,
        legalHides,
        covered,
    };
}

/** Hide from the in-app Discover index (owners always see their own row). */
export function shouldHideRowFromDirectory(r, metricsMap) {
    const st = computeDirectoryRowState(r, metricsMap);
    if (isDirectoryRowOwner(r)) return false;
    if (st.hidden) return true;
    return !!st.legalHides;
}

/** Ranking penalty while a legal notice is open (still listed during the 48 h window). */
export function directoryRowRankingPenalty(st) {
    if (!st || typeof st !== 'object') return 0;
    if (st.isReported || st.legalHides) return -150;
    if (st.legalWithin48h) return -55;
    return 0;
}
