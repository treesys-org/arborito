import { getArboritoStore as store } from '../../../../../core/store-singleton.js';
import { formatNostrTreeUrl, parseNostrTreeUrl } from '../../../../nostr/api/nostr-refs.js';
import {
    DIRECTORY_CLIENT_FETCH_MAX,
    DIRECTORY_CLIENT_FETCH_PAGE,
} from '../../../../p2p-webtorrent/api/directory-index-config.js';
import {
    loadGlobalDirectoryRowsFromHttp,
    loadGlobalDirectoryRowsFromTorrent,
    mergeNostrAndTorrentDirectoryRows,
} from '../../../../p2p-webtorrent/api/global-directory-torrent.js';
import { searchGlobalDirectoryViaHttpShards } from '../../../../p2p-webtorrent/api/directory-search-http.js';
import { yieldToPaint } from '../../../../../shared/lib/yield-to-paint.js';
import { runBibliotecaNetworkLoad } from '../../../../../shared/lib/connected-services/index.js';
import { refreshMaintainerNostrTreeBlocklist } from '../../../../nostr/api/maintainer-nostr-tree-blocklist.js';
import { discoverListingScore } from './sources-search-utils.js';
import { reporterCommunityReportWeight } from './sources-moderation-limits.js';
import { canonicalNetworkTreeUrlString } from './sources-helpers.js';
import {
    normalizeDirectoryCatalogIcon,
    resolveBranchCatalogIcon,
} from '../../branch-catalog-icon.js';
import { BRANCH_CHIP_ICON } from '../../../../tree-graph/api/node-property-emojis.js';
import { mergeDisplayedVotes, readLocalLiked } from './sources-vote-persist.js';
import { normalizeTreeShareCode } from '../../share-code.js';

/**
 * Fill missing directory `icon` from local published twins / Saved community meta
 * so Discover search can show catalog emoji without opening the tree.
 * @param {object[]} rows
 * @param {ReturnType<typeof store>} [storeRef]
 */
export function enrichDirectoryRowsWithKnownIcons(rows, storeRef = store) {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return list;

    /** @type {Map<string, string>} */
    const byCanon = new Map();
    /** @type {Map<string, string>} */
    const byShare = new Map();
    const branches = storeRef.userStore?.state?.branches || [];
    for (const t of branches) {
        const pubUrlRaw = String(t?.publishedNetworkUrl || '').trim();
        if (pubUrlRaw) {
            const canon = canonicalNetworkTreeUrlString(pubUrlRaw) || pubUrlRaw;
            if (!byCanon.has(canon)) {
                const ic = resolveBranchCatalogIcon(t);
                const norm = normalizeDirectoryCatalogIcon(ic);
                if (norm && norm !== BRANCH_CHIP_ICON) byCanon.set(canon, norm);
            }
        }
        const sc = String(t?.shareCode || t?.publishedShareCode || t?.data?.meta?.shareCode || '')
            .trim()
            .toUpperCase();
        if (sc) {
            const ic = resolveBranchCatalogIcon(t);
            const norm = normalizeDirectoryCatalogIcon(ic);
            if (norm && norm !== BRANCH_CHIP_ICON) byShare.set(sc, norm);
        }
    }
    const community =
        storeRef.state?.communitySources || storeRef.value?.communitySources || [];
    for (const s of community) {
        const u = String(s?.url || '').trim();
        if (u) {
            const canon = canonicalNetworkTreeUrlString(u) || u;
            if (!byCanon.has(canon)) {
                const norm = normalizeDirectoryCatalogIcon(s?.icon);
                if (norm) byCanon.set(canon, norm);
            }
        }
        const sc = String(s?.shareCode || '')
            .trim()
            .toUpperCase();
        if (sc) {
            const norm = normalizeDirectoryCatalogIcon(s?.icon);
            if (norm) byShare.set(sc, norm);
        }
    }
    if (!byCanon.size && !byShare.size) return list;

    return list.map((row) => {
        if (!row || typeof row !== 'object') return row;
        if (normalizeDirectoryCatalogIcon(row.icon)) return row;
        const ownerPub = String(row.ownerPub || '').trim();
        const universeId = String(row.universeId || '').trim();
        if (ownerPub && universeId) {
            let canon = '';
            try {
                canon = canonicalNetworkTreeUrlString(formatNostrTreeUrl(ownerPub, universeId)) || '';
            } catch {
                canon = '';
            }
            const known = canon ? byCanon.get(canon) : '';
            if (known) return { ...row, icon: known };
        }
        const sc = String(row.shareCode || '')
            .trim()
            .toUpperCase();
        const byCode = sc ? byShare.get(sc) : '';
        return byCode ? { ...row, icon: byCode } : row;
    });
}

export function computeReportSignalsFromRows(rows, { daysWindow = 14, ignoreBeforeAt = null } = {}) {
    const list = Array.isArray(rows) ? rows : [];
    const ms = Math.max(1, Math.min(90, Number(daysWindow) || 14)) * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - ms;
    const ignoreT = ignoreBeforeAt ? Date.parse(String(ignoreBeforeAt)) : NaN;
    const uniq = new Set();
    let score = 0;
    for (const rec of list) {
        if (!rec || typeof rec !== 'object') continue;
        const by = String(rec.by || '').trim();
        if (!by) continue;
        const t = Date.parse(String(rec.at || ''));
        if (!t || t < cutoff) continue;
        if (Number.isFinite(ignoreT) && t <= ignoreT) continue;
        if (uniq.has(by)) continue;
        uniq.add(by);
        const reason = String(rec.reason || '').trim().toLowerCase();
        let reasonW = reason === 'phishing' ? 1.35 : reason === 'copyright' ? 1.25 : 1;
        reasonW *= reporterCommunityReportWeight(by);
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

    /* Rank/display needs votes for the whole Discover page, not only the first
     * 16 by recency. Otherwise a liked-but-older course never gets `votes`,
     * shows no likes in the UI, and `discoverListingScore` keeps it at the
     * bottom. Cap at two network pages so “Show more” stays bounded. */
    const metricsRowLimit = Math.min(
        rows.length,
        sortOnly ? DIRECTORY_CLIENT_FETCH_PAGE : DIRECTORY_CLIENT_FETCH_PAGE * 2
    );
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
            if (needVotes) {
                let votes = await net.countTreeVotesOnce({
                    ownerPub: r.ownerPub,
                    universeId: r.universeId,
                });
                const liked = readLocalLiked(r.ownerPub, r.universeId);
                const merged = mergeDisplayedVotes(r.ownerPub, r.universeId, votes, liked);
                if (merged != null) votes = merged;
                next.votes = votes;
            }
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
                let appealThroughAt = '';
                if (typeof net.loadTreeDirectoryOwnerAppealOnce === 'function') {
                    const appeal = await net.loadTreeDirectoryOwnerAppealOnce({
                        ownerPub: r.ownerPub,
                        universeId: r.universeId,
                    });
                    appealThroughAt = String(appeal?.reportsThroughAt || '');
                    next.directoryAppealAt = String(appeal?.at || '');
                } else {
                    next.directoryAppealAt = '';
                }
                const sig = computeReportSignalsFromRows(reportRows, {
                    daysWindow: 14,
                    ignoreBeforeAt: appealThroughAt || null,
                });
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
    /* Use the map returned by ensure* — React state here is still the pre-fetch
     * snapshot, so ranking with `state.globalDirMetrics` would ignore votes. */
    let metrics =
        (await ensureGlobalMetricsForRows(rows, filter, state.globalDirMetrics, setters.setGlobalDirMetrics, {
            sortOnly: true,
        })) || state.globalDirMetrics;
    let sorted = rerankRows(rows, filter, metrics);
    setters.setGlobalDirRows(sorted);
    onUpdate?.();

    /* After first rank, fill engagement for any page rows still missing metrics
     * (e.g. crawl grew past the first sortOnly window), then re-rank again. */
    metrics =
        (await ensureGlobalMetricsForRows(sorted, filter, metrics, setters.setGlobalDirMetrics, {
            sortOnly: false,
        })) || metrics;
    sorted = rerankRows(sorted, filter, metrics);
    setters.setGlobalDirRows(sorted);
    onUpdate?.();

    void ensureGlobalMetricsForRows(sorted, filter, metrics, setters.setGlobalDirMetrics, {
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

/** Bumps whenever a Discover fetch starts; stale async work must not paint. */
let globalDirFetchGeneration = 0;

export function scheduleGlobalDirectoryFetch(state, setters, { reason = 'input', onUpdate } = {}) {
    if (state.globalDirTimer) clearTimeout(state.globalDirTimer);
    const delay = reason === 'render' ? 0 : reason === 'load-more' ? 0 : 450;
    const timer = setTimeout(() => {
        void runGlobalDirectoryFetch(state, setters, { onUpdate, reason });
    }, delay);
    setters.setGlobalDirTimer(timer);
}

export async function runGlobalDirectoryFetch(state, setters, { onUpdate, reason = 'input' } = {}) {
    const now = Date.now();
    const q = String(state.globalDirQ || '').trim();
    const fetchLimit = Math.max(
        DIRECTORY_CLIENT_FETCH_PAGE,
        Math.min(
            DIRECTORY_CLIENT_FETCH_MAX,
            Number(state.globalDirFetchLimit) || DIRECTORY_CLIENT_FETCH_PAGE
        )
    );
    const sameQuery = q === state.globalDirLastQuery;
    const sameLimit = fetchLimit === Number(state.globalDirLastFetchLimit || 0);
    if (reason !== 'load-more') {
        if (sameQuery && sameLimit && now - (state.globalDirLastFetchAt || 0) < 2000) return;
        if (now - (state.globalDirLastFetchAt || 0) < 800 && state.globalDirLoading) return;
    }

    const fetchGen = ++globalDirFetchGeneration;
    const stillCurrent = () => fetchGen === globalDirFetchGeneration;

    setters.setGlobalDirLastFetchAt(now);
    setters.setGlobalDirLastQuery(q);
    if (typeof setters.setGlobalDirLastFetchLimit === 'function') {
        setters.setGlobalDirLastFetchLimit(fetchLimit);
    }
    setters.setGlobalDirLoading(true);
    setters.setGlobalDirError('');
    onUpdate?.();
    await yieldToPaint();

    /**
     * Paint Discover as soon as snapshot/trigram/crawl batches arrive — do not
     * wait for mirrors or final sort. Still drop known-revoked ghosts immediately.
     * @param {object[]} partial
     */
    const publishPartialRows = (partial) => {
        void (async () => {
            if (!stillCurrent()) return;
            let next = Array.isArray(partial) ? partial : [];
            next = next.filter((r) => !store.isNostrTreeMaintainerBlocked(r?.ownerPub, r?.universeId));
            const net = store.nostr;
            if (net && typeof net._filterDirectoryRowsWithPublishedBundle === 'function') {
                try {
                    next = await net._filterDirectoryRowsWithPublishedBundle(next);
                } catch {
                    /* keep unfiltered partial on probe errors */
                }
            }
            if (!stillCurrent()) return;
            next = enrichDirectoryRowsWithKnownIcons(next);
            if (next.length > fetchLimit) next = next.slice(0, fetchLimit);
            setters.setGlobalDirRows(next);
            onUpdate?.();
        })();
    };

    try {
        await runBibliotecaNetworkLoad(async () => {
            /* Remote maintainer blocklist (GitHub) — only with network consent. */
            await refreshMaintainerNostrTreeBlocklist().catch(() => false);
            if (!stillCurrent()) return;

            const net = store.nostr;
            const qNorm = q.replace(/^#/, '').trim();
            const shareCodeNorm = normalizeTreeShareCode(qNorm);
            let rows = [];
            let directoryHitCap = false;
            let directoryFetchError = '';

            /* Static shard search (if the deploy configured one) runs in
             * parallel with the relay path: on catalogs beyond what relay
             * `#t` queries can cover, the shards ARE the search tier. Rows
             * are individually verified, so merging them is safe. */
            const shardRowsPromise =
                q.length >= 3
                    ? searchGlobalDirectoryViaHttpShards({ query: q, limit: fetchLimit }).catch(() => [])
                    : Promise.resolve([]);

            if (net && typeof net.listGlobalTreeDirectoryEntriesOnce === 'function') {
                try {
                    rows = await net.listGlobalTreeDirectoryEntriesOnce({
                        limit: fetchLimit,
                        query: q,
                        onPartial: publishPartialRows,
                    });
                    if (!stillCurrent()) return;
                    rows = Array.isArray(rows) ? rows : [];
                    rows = rows.filter((r) => !store.isNostrTreeMaintainerBlocked(r?.ownerPub, r?.universeId));
                    directoryHitCap = rows.length >= fetchLimit;
                    /* Full Nostr list before mirrors / bundle filter. */
                    publishPartialRows(rows);

                    if (shareCodeNorm && typeof net.resolveTreeShareCode === 'function') {
                        try {
                            const ref = await net.resolveTreeShareCode(shareCodeNorm);
                            if (ref?.pub && ref?.universeId) {
                                const canonPub = String(ref.pub);
                                const canonUid = String(ref.universeId);
                                if (!store.isNostrTreeMaintainerBlocked(canonPub, canonUid)) {
                                    const exists = rows.some(
                                        (r) => String(r.ownerPub) === canonPub && String(r.universeId) === canonUid
                                    );
                                    let full = null;
                                    if (typeof net.loadGlobalTreeDirectoryEntryOnce === 'function') {
                                        try {
                                            full = await net.loadGlobalTreeDirectoryEntryOnce({
                                                pub: canonPub,
                                                universeId: canonUid,
                                            });
                                        } catch {
                                            full = null;
                                        }
                                    }
                                    /* Claim can outlive delist/revoke — never invent a Discover card
                                     * from share-code alone (dead playlist / course ghosts). */
                                    if (!full || typeof full !== 'object') {
                                        /* Keep any existing list hit; bundle-header filter drops dead rows. */
                                    } else if (!exists) {
                                        rows = [
                                            {
                                                ...full,
                                                ownerPub: canonPub,
                                                universeId: canonUid,
                                                shareCode: String(full.shareCode || shareCodeNorm),
                                            },
                                            ...rows,
                                        ];
                                    } else {
                                        const idx = rows.findIndex(
                                            (r) =>
                                                String(r.ownerPub) === canonPub &&
                                                String(r.universeId) === canonUid
                                        );
                                        if (idx >= 0) {
                                            rows[idx] = {
                                                ...rows[idx],
                                                ...full,
                                                ownerPub: canonPub,
                                                universeId: canonUid,
                                                shareCode: String(
                                                    full.shareCode || rows[idx].shareCode || shareCodeNorm
                                                ),
                                            };
                                        }
                                    }
                                }
                            }
                        } catch {
                            /* ignore */
                        }
                    }
                    if (stillCurrent()) publishPartialRows(rows);
                } catch (e) {
                    directoryFetchError = String(e?.message || e);
                    rows = [];
                }
            } else {
                directoryFetchError = String(store.ui.nostrNotLoadedHint || 'Nostr is not available.').trim();
            }

            if (!stillCurrent()) return;

            const nostrRowsOk = rows.length > 0 && !directoryFetchError;
            /* Always merge mirrors when Nostr is empty/errored, or when the
             * catalog is thin — a partial relay answer used to skip fallbacks
             * and leave Discover nearly empty. */
            const wantMirrorFallback = !nostrRowsOk || rows.length < 8;
            let torrentRows = [];
            let httpRows = [];
            if (wantMirrorFallback) {
                try {
                    torrentRows = await loadGlobalDirectoryRowsFromTorrent(store, { query: q });
                } catch (e) {
                    console.warn('[Arborito] global directory torrent', e);
                }
                if (!stillCurrent()) return;
                try {
                    httpRows = await loadGlobalDirectoryRowsFromHttp({ query: q });
                } catch (e) {
                    console.warn('[Arborito] global directory http', e);
                }
                if (!stillCurrent()) return;
            }

            /* Empty Nostr + failed mirrors: clear circuit breaker and retry once. */
            if (!rows.length && !torrentRows.length && !httpRows.length && net) {
                try {
                    net._unpauseAllRelays?.();
                    rows = await net.listGlobalTreeDirectoryEntriesOnce({
                        limit: fetchLimit,
                        query: q,
                        onPartial: publishPartialRows,
                    });
                    if (!stillCurrent()) return;
                    rows = Array.isArray(rows) ? rows : [];
                    rows = rows.filter((r) => !store.isNostrTreeMaintainerBlocked(r?.ownerPub, r?.universeId));
                    if (rows.length) directoryFetchError = '';
                } catch (e) {
                    if (!directoryFetchError) directoryFetchError = String(e?.message || e);
                }
            }

            if (!stillCurrent()) return;

            const shardRows = await shardRowsPromise;
            if (!stillCurrent()) return;
            rows = mergeNostrAndTorrentDirectoryRows(
                mergeNostrAndTorrentDirectoryRows(mergeNostrAndTorrentDirectoryRows(rows, shardRows), torrentRows),
                httpRows
            );
            rows = rows.filter((r) => !store.isNostrTreeMaintainerBlocked(r?.ownerPub, r?.universeId));
            publishPartialRows(rows);
            if (net && typeof net._filterDirectoryRowsWithPublishedBundle === 'function') {
                rows = await net._filterDirectoryRowsWithPublishedBundle(rows);
                if (!stillCurrent()) return;
            }
            rows = enrichDirectoryRowsWithKnownIcons(rows);
            let hitCap = false;
            if (rows.length > fetchLimit) {
                rows = rows.slice(0, fetchLimit);
                hitCap = true;
            } else {
                hitCap = directoryHitCap;
            }
            /* At absolute max, stop offering network “load more”. */
            if (fetchLimit >= DIRECTORY_CLIENT_FETCH_MAX) hitCap = false;

            if (!stillCurrent()) return;
            setters.setGlobalDirRows(rows);
            setters.setGlobalDirLoading(false);
            setters.setGlobalDirHitCap(hitCap);
            if (!rows.length && directoryFetchError) {
                setters.setGlobalDirError(directoryFetchError);
            } else {
                setters.setGlobalDirError('');
            }
            onUpdate?.();
            const sortSetters = {
                ...setters,
                setGlobalDirRows: (next) => {
                    if (!stillCurrent()) return;
                    setters.setGlobalDirRows(next);
                },
                setGlobalDirMetrics: (next) => {
                    if (!stillCurrent()) return;
                    setters.setGlobalDirMetrics(next);
                },
            };
            await applyGlobalDirectorySortAndMetrics(
                { ...state, globalDirRows: rows, globalDirLoading: false },
                sortSetters,
                { onUpdate: () => {
                    if (!stillCurrent()) return;
                    onUpdate?.();
                } }
            );
        }, { timeoutMs: 6000 });
    } catch (e) {
        if (!stillCurrent()) return;
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
