import { getArboritoStore as store } from '../../../../../core/store-singleton.js';
import { parseNostrTreeUrl } from '../../../../nostr/api/nostr-refs.js';
import { DIRECTORY_CLIENT_FETCH_LIMIT } from '../../../../p2p-webtorrent/api/directory-index-config.js';
import {
    loadGlobalDirectoryRowsFromHttp,
    loadGlobalDirectoryRowsFromTorrent,
    mergeNostrAndTorrentDirectoryRows,
} from '../../../../p2p-webtorrent/api/global-directory-torrent.js';
import { yieldToPaint } from '../../../../../shared/lib/yield-to-paint.js';
import { runBibliotecaNetworkLoad } from '../../../../../shared/lib/connected-services/index.js';
import { discoverListingScore } from './sources-search-utils.js';

export function computeReportSignalsFromRows(rows, { daysWindow = 14 } = {}) {
    const list = Array.isArray(rows) ? rows : [];
    const ms = Math.max(1, Math.min(90, Number(daysWindow) || 14)) * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - ms;
    const uniq = new Set();
    let score = 0;
    for (const rec of list) {
        if (!rec || typeof rec !== 'object') continue;
        const by = String(rec.by || '').trim();
        if (!by) continue;
        const t = Date.parse(String(rec.at || ''));
        if (!t || t < cutoff) continue;
        if (uniq.has(by)) continue;
        uniq.add(by);
        const reason = String(rec.reason || '').trim().toLowerCase();
        const reasonW = reason === 'phishing' ? 1.35 : reason === 'copyright' ? 1.25 : 1;
        score += reasonW;
    }
    return { unique: uniq.size, score: Math.round(score * 100) / 100 };
}

export function directoryRowForCommunitySource(globalDirRows, urlStr) {
    const rows = Array.isArray(globalDirRows) ? globalDirRows : [];
    if (!rows.length || !urlStr) return null;
    const ref = parseNostrTreeUrl(String(urlStr).trim());
    if (ref?.pub && ref?.universeId) {
        const pub = String(ref.pub);
        const uid = String(ref.universeId);
        return rows.find((r) => String(r?.ownerPub || '') === pub && String(r?.universeId || '') === uid) || null;
    }
    return null;
}

export function publishedDirectoryRow(url) {
    const ref = parseNostrTreeUrl(String(url || '').trim());
    if (!ref?.pub || !ref?.universeId) return null;
    return { ownerPub: ref.pub, universeId: ref.universeId };
}

export function metricsForPublishedUrl(url, metricsMap) {
    const row = publishedDirectoryRow(url);
    if (!row) return {};
    const k = `${row.ownerPub}/${row.universeId}`;
    const metrics = metricsMap && typeof metricsMap === 'object' ? metricsMap : {};
    return metrics[k] && typeof metrics[k] === 'object' ? metrics[k] : {};
}

function rerankRows(rows, filter, metricsMap) {
    const tieBreak = (a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    const m2 = metricsMap && typeof metricsMap === 'object' ? metricsMap : {};
    const dirScore = (r) => {
        const k = `${r.ownerPub}/${r.universeId}`;
        const mm = m2[k] || {};
        if (filter === 'discover') return discoverListingScore(r, mm);
        if (filter === 'voted') return Number(mm.votes) || 0;
        if (filter === 'used7') return Number(mm.used7) || 0;
        if (filter === 'active') return Number(mm.used1) || 0;
        return 0;
    };
    const out = [...rows];
    if (filter === 'recent') out.sort((a, b) => tieBreak(a, b));
    else if (filter === 'discover' || filter === 'voted' || filter === 'used7' || filter === 'active') {
        out.sort((a, b) => dirScore(b) - dirScore(a) || tieBreak(a, b));
    }
    return out;
}

export async function ensureGlobalMetricsForRows(rows, filter, metricsMap, setMetricsMap, {
    sortOnly = false,
    moderationOnly = false,
} = {}) {
    const net = store.nostr;
    if (!net || !Array.isArray(rows) || !rows.length) return metricsMap;

    const needVotes = !moderationOnly && (filter === 'voted' || filter === 'discover');
    const needUsed7 = !moderationOnly && (filter === 'used7' || filter === 'discover');
    const needUsed1 = !moderationOnly && (filter === 'active' || filter === 'discover');
    const needForks = !moderationOnly && (needVotes || needUsed7 || needUsed1);
    const needReports = moderationOnly;
    const needLegal = moderationOnly;
    if (sortOnly && !needVotes && !needUsed7 && !needUsed1 && !needForks) return metricsMap;
    if (moderationOnly && !needReports && !needLegal) return metricsMap;

    const metricsRowLimit = sortOnly ? 16 : 24;
    const queue = [];
    const nextMap = { ...(metricsMap || {}) };

    for (const r of rows.slice(0, metricsRowLimit)) {
        const k = `${r.ownerPub}/${r.universeId}`;
        const cur = nextMap[k] || {};
        const missing =
            (needVotes && cur.votes == null) ||
            (needUsed7 && cur.used7 == null) ||
            (needUsed1 && cur.used1 == null) ||
            (needForks && cur.forks == null) ||
            (needReports && (cur.reportScore == null || cur.reports14Unique == null)) ||
            (needLegal && cur.legal90Unique == null) ||
            (needLegal &&
                Number(cur.legal90Unique) > 0 &&
                (cur.legalLatestAt === undefined || cur.legalOwnerDefenseLatestAt === undefined));
        if (!missing || cur.loading) continue;
        nextMap[k] = { ...cur, loading: true };
        queue.push({ r, k });
    }

    if (!queue.length) return metricsMap;
    setMetricsMap(nextMap);

    const runOne = async ({ r, k }) => {
        try {
            const next = { ...(nextMap[k] || {}) };
            if (needVotes) next.votes = await net.countTreeVotesOnce({ ownerPub: r.ownerPub, universeId: r.universeId });
            if (needUsed7) {
                next.used7 = await net.countTreeUsageUniqueLastNDaysOnce({
                    ownerPub: r.ownerPub,
                    universeId: r.universeId,
                    days: 7,
                });
            }
            if (needUsed1) {
                next.used1 = await net.countTreeUsageUniqueLastNDaysOnce({
                    ownerPub: r.ownerPub,
                    universeId: r.universeId,
                    days: 1,
                });
            }
            if (needForks && typeof net.countTreeForksOnce === 'function') {
                next.forks = await net.countTreeForksOnce({ ownerPub: r.ownerPub, universeId: r.universeId });
            }
            if (needReports && typeof net.listTreeReportsOnce === 'function') {
                const reportRows = await net.listTreeReportsOnce({
                    ownerPub: r.ownerPub,
                    universeId: r.universeId,
                    max: 900,
                });
                const sig = computeReportSignalsFromRows(reportRows, { daysWindow: 14 });
                next.reports14Unique = sig.unique;
                next.reportScore = sig.score;
            }
            if (needLegal && typeof net.countTreeLegalReportsOnce === 'function') {
                next.legal90Unique = await net.countTreeLegalReportsOnce({
                    ownerPub: r.ownerPub,
                    universeId: r.universeId,
                    daysWindow: 90,
                });
                if (Number(next.legal90Unique) > 0) {
                    if (typeof net.listTreeLegalReportsOnce === 'function') {
                        const lr = await net.listTreeLegalReportsOnce({
                            ownerPub: r.ownerPub,
                            universeId: r.universeId,
                            max: 1,
                        });
                        next.legalLatestAt = String(lr?.[0]?.at || '');
                    } else {
                        next.legalLatestAt = '';
                    }
                    if (typeof net.loadTreeLegalOwnerDefenseOnce === 'function') {
                        const def = await net.loadTreeLegalOwnerDefenseOnce({
                            ownerPub: r.ownerPub,
                            universeId: r.universeId,
                        });
                        next.legalOwnerDefenseLatestAt = String(def?.latestLegalReportAt || '');
                    } else {
                        next.legalOwnerDefenseLatestAt = '';
                    }
                } else {
                    next.legalLatestAt = '';
                    next.legalOwnerDefenseLatestAt = '';
                }
            }
            next.loading = false;
            nextMap[k] = next;
            setMetricsMap({ ...nextMap });
        } catch {
            nextMap[k] = { ...(nextMap[k] || {}), loading: false };
            setMetricsMap({ ...nextMap });
        }
    };

    const concurrency = 6;
    let idx = 0;
    await Promise.all(
        Array.from({ length: concurrency }, async () => {
            while (idx < queue.length) {
                const item = queue[idx++];
                await runOne(item);
            }
        })
    );
    return nextMap;
}

export async function applyGlobalDirectorySortAndMetrics(state, setters, { onUpdate }) {
    const filter = String(state.globalDirFilter || 'discover');
    const rows = Array.isArray(state.globalDirRows) ? [...state.globalDirRows] : [];
    const tieBreak = (a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));

    if (filter === 'recent') {
        setters.setGlobalDirRows(rows.sort((a, b) => tieBreak(a, b)));
        onUpdate?.();
        return;
    }

    await yieldToPaint();
    await ensureGlobalMetricsForRows(rows, filter, state.globalDirMetrics, setters.setGlobalDirMetrics, {
        sortOnly: true,
    });
    const sorted = rerankRows(rows, filter, state.globalDirMetrics);
    setters.setGlobalDirRows(sorted);
    onUpdate?.();
    void ensureGlobalMetricsForRows(sorted, filter, state.globalDirMetrics, setters.setGlobalDirMetrics, {
        moderationOnly: true,
    }).then(() => onUpdate?.());
}

export function ensurePublishedTreeMetrics(urls, metricsMap, setMetricsMap) {
    const rows = [];
    const seen = new Set();
    for (const url of urls || []) {
        const row = publishedDirectoryRow(url);
        if (!row) continue;
        const k = `${row.ownerPub}/${row.universeId}`;
        if (seen.has(k)) continue;
        seen.add(k);
        rows.push(row);
    }
    if (!rows.length) return;
    void ensureGlobalMetricsForRows(rows, 'discover', metricsMap, setMetricsMap, { sortOnly: true });
}

export function ensureSavedSourcesMetrics(sources, metricsMap, setMetricsMap) {
    const rows = [];
    const seen = new Set();
    for (const s0 of sources || []) {
        try {
            const ref = parseNostrTreeUrl(String(s0?.url || '').trim());
            if (!ref?.pub || !ref?.universeId) continue;
            const k = `${ref.pub}/${ref.universeId}`;
            if (seen.has(k)) continue;
            seen.add(k);
            rows.push({ ownerPub: ref.pub, universeId: ref.universeId });
        } catch {
            /* ignore */
        }
    }
    if (!rows.length) return;
    void ensureGlobalMetricsForRows(rows, 'discover', metricsMap, setMetricsMap, { sortOnly: true });
}

export function scheduleGlobalDirectoryFetch(state, setters, { reason = 'input', onUpdate } = {}) {
    if (state.globalDirTimer) clearTimeout(state.globalDirTimer);
    const delay = reason === 'render' ? 0 : 450;
    const timer = setTimeout(() => {
        void runGlobalDirectoryFetch(state, setters, { onUpdate });
    }, delay);
    setters.setGlobalDirTimer(timer);
}

export async function runGlobalDirectoryFetch(state, setters, { onUpdate } = {}) {
    const now = Date.now();
    const q = String(state.globalDirQ || '').trim();
    if (q === state.globalDirLastQuery && now - (state.globalDirLastFetchAt || 0) < 2000) return;
    if (now - (state.globalDirLastFetchAt || 0) < 800 && state.globalDirLoading) return;

    setters.setGlobalDirLastFetchAt(now);
    setters.setGlobalDirLastQuery(q);
    setters.setGlobalDirLoading(true);
    setters.setGlobalDirError('');
    onUpdate?.();
    await yieldToPaint();

    try {
        await runBibliotecaNetworkLoad(async () => {
            const net = store.nostr;
            const qNorm = q.replace(/^#/, '').trim();
            let rows = [];
            let directoryHitCap = false;
            let directoryFetchError = '';

            if (net && typeof net.listGlobalTreeDirectoryEntriesOnce === 'function') {
                try {
                    rows = await net.listGlobalTreeDirectoryEntriesOnce({
                        limit: DIRECTORY_CLIENT_FETCH_LIMIT,
                        query: q,
                    });
                    rows = Array.isArray(rows) ? rows : [];
                    rows = rows.filter((r) => !store.isNostrTreeMaintainerBlocked(r?.ownerPub, r?.universeId));
                    directoryHitCap = rows.length >= DIRECTORY_CLIENT_FETCH_LIMIT;

                    if (qNorm && /^[a-z0-9]{4,14}$/i.test(qNorm) && typeof net.resolveTreeShareCode === 'function') {
                        try {
                            const ref = await net.resolveTreeShareCode(qNorm);
                            if (ref?.pub && ref?.universeId) {
                                const canonPub = String(ref.pub);
                                const canonUid = String(ref.universeId);
                                if (!store.isNostrTreeMaintainerBlocked(canonPub, canonUid)) {
                                    const exists = rows.some(
                                        (r) => String(r.ownerPub) === canonPub && String(r.universeId) === canonUid
                                    );
                                    if (!exists) {
                                        const codeRow = {
                                            ownerPub: canonPub,
                                            universeId: canonUid,
                                            title: `Code #${qNorm}`,
                                            shareCode: qNorm,
                                            updatedAt: '',
                                        };
                                        if (Array.isArray(ref.recommendedRelays) && ref.recommendedRelays.length) {
                                            codeRow.recommendedRelays = ref.recommendedRelays;
                                        }
                                        rows = [codeRow, ...rows];
                                    }
                                }
                            }
                        } catch {
                            /* ignore */
                        }
                    }
                } catch (e) {
                    directoryFetchError = String(e?.message || e);
                    rows = [];
                }
            } else {
                directoryFetchError = String(store.ui.nostrNotLoadedHint || 'Nostr is not available.').trim();
            }

            const nostrRowsOk = rows.length > 0 && !directoryFetchError;
            let torrentRows = [];
            let httpRows = [];
            if (!nostrRowsOk) {
                try {
                    torrentRows = await loadGlobalDirectoryRowsFromTorrent(store, { query: q });
                } catch (e) {
                    console.warn('[Arborito] global directory torrent', e);
                }
                try {
                    httpRows = await loadGlobalDirectoryRowsFromHttp({ query: q });
                } catch (e) {
                    console.warn('[Arborito] global directory http', e);
                }
            }

            rows = mergeNostrAndTorrentDirectoryRows(
                mergeNostrAndTorrentDirectoryRows(rows, torrentRows),
                httpRows
            );
            rows = rows.filter((r) => !store.isNostrTreeMaintainerBlocked(r?.ownerPub, r?.universeId));
            if (net && typeof net._filterDirectoryRowsWithPublishedBundle === 'function') {
                rows = await net._filterDirectoryRowsWithPublishedBundle(rows);
            }
            let hitCap = false;
            if (rows.length > DIRECTORY_CLIENT_FETCH_LIMIT) {
                rows = rows.slice(0, DIRECTORY_CLIENT_FETCH_LIMIT);
                hitCap = true;
            } else {
                hitCap = directoryHitCap;
            }

            setters.setGlobalDirRows(rows);
            setters.setGlobalDirLoading(false);
            setters.setGlobalDirHitCap(hitCap);
            if (!rows.length && directoryFetchError) {
                setters.setGlobalDirError(directoryFetchError);
            } else {
                setters.setGlobalDirError('');
            }
            onUpdate?.();
            await applyGlobalDirectorySortAndMetrics(
                { ...state, globalDirRows: rows, globalDirLoading: false },
                setters,
                { onUpdate }
            );
        }, { timeoutMs: 6000 });
    } catch (e) {
        setters.setGlobalDirHitCap(false);
        setters.setGlobalDirLoading(false);
        setters.setGlobalDirRows([]);
        setters.setGlobalDirError(String(e?.message || e));
        onUpdate?.();
    }
}

export function rerankGlobalDirectoryRowsOnly(state, setters) {
    const filter = String(state.globalDirFilter || 'discover');
    const rows = Array.isArray(state.globalDirRows) ? state.globalDirRows : [];
    if (!rows.length) return;
    setters.setGlobalDirRows(rerankRows(rows, filter, state.globalDirMetrics));
}
