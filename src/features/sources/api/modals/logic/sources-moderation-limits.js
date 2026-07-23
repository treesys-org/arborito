import { sourcesLsGet, sourcesLsSet } from './sources-local-storage.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_COMMUNITY_REPORTS_PER_WEEK = 3;
const YOUNG_REPORTER_MS = 7 * 24 * 60 * 60 * 1000;

/** @param {string} reporterPub */
export function countReporterWeeklyCommunityReports(reporterPub) {
    const pub = String(reporterPub || '').trim();
    if (!pub) return 0;
    const key = `arborito-tree-report-week-v1:${pub}`;
    try {
        const raw = sourcesLsGet(key);
        const arr = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(arr)) return 0;
        const cutoff = Date.now() - WEEK_MS;
        return arr.filter((t) => Number(t) >= cutoff).length;
    } catch {
        return 0;
    }
}

/** @param {string} reporterPub */
export function recordReporterWeeklyCommunityReport(reporterPub) {
    const pub = String(reporterPub || '').trim();
    if (!pub) return;
    const key = `arborito-tree-report-week-v1:${pub}`;
    const cutoff = Date.now() - WEEK_MS;
    let arr = [];
    try {
        const raw = sourcesLsGet(key);
        arr = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(arr)) arr = [];
    } catch {
        arr = [];
    }
    arr = arr.filter((t) => Number(t) >= cutoff);
    arr.push(Date.now());
    sourcesLsSet(key, JSON.stringify(arr.slice(-24)));
}

export function isReporterWeeklyCommunityReportLimitReached(reporterPub) {
    return countReporterWeeklyCommunityReports(reporterPub) >= MAX_COMMUNITY_REPORTS_PER_WEEK;
}

/**
 * Weight multiplier for a reporter pubkey (local first-seen heuristic).
 * @param {string} reporterPub
 * @param {() => number} [getFirstSeenMs], defaults to local `arborito-nostr-user-first-seen`
 */
export function reporterCommunityReportWeight(reporterPub, getFirstSeenMs) {
    const pub = String(reporterPub || '').trim();
    if (!pub) return 1;
    let firstSeen = 0;
    if (typeof getFirstSeenMs === 'function') {
        firstSeen = Number(getFirstSeenMs(pub)) || 0;
    } else {
        try {
            const raw = sourcesLsGet(`arborito-nostr-user-first-seen:${pub}`);
            firstSeen = raw ? Number(raw) : 0;
        } catch {
            firstSeen = 0;
        }
    }
    if (!firstSeen) return 1;
    if (Date.now() - firstSeen < YOUNG_REPORTER_MS) return 0.5;
    return 1;
}
