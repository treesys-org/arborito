import { getArboritoStore as store } from '../../../../../core/store-singleton.js';
import { formatNostrTreeUrl } from '../../../../nostr/api/nostr-refs.js';
import { listingKind } from '../../sources-kind-ui.js';
import { resolveBranchRefDisplayNames } from '../../../../forest/api/tree-branch-labels.js';
import { SOURCES_UNIFIED_DISPLAY_CAP } from '../../../../p2p-webtorrent/api/directory-index-config.js';
import { catalogTitlesSearchBlob } from '../../../../../shared/lib/catalog-titles.js';
import { scoreSourcesMatch } from './sources-search-utils.js';
import { getRowMetricsFromMap, shouldHideRowFromDirectory } from './sources-directory-row-state.js';
import { canonicalNetworkTreeUrlString } from './sources-helpers.js';

function findLocalTreeForSavedSource(saved) {
    const url = String(saved?.url || '').trim();
    if (!url) return null;
    return (store.userStore?.state?.trees || []).find(
        (t) => String(t?.publishedNetworkUrl || '').trim() === url
    );
}

function scoreTreesMatch(q, name, branchNames = []) {
    const qq = String(q || '').trim().toLowerCase();
    if (!qq) return 1;
    const h = String(name || '').trim().toLowerCase();
    let best = 0;
    if (h) {
        if (h === qq) best = 100;
        else if (h.startsWith(qq)) best = 50;
        else if (h.includes(qq)) best = 10;
    }
    for (const bn of branchNames) {
        const b = String(bn || '').trim().toLowerCase();
        if (!b) continue;
        if (b === qq) best = Math.max(best, 90);
        else if (b.startsWith(qq)) best = Math.max(best, 45);
        else if (b.includes(qq)) best = Math.max(best, 8);
    }
    return best;
}

/**
 * @returns {{ score: number, kind: 'device'|'saved'|'internet', data: object, dupNote?: string }[]}
 */
export function collectForestTabItems(ctx, ui, state, activeSource, { scope, q }) {
    ctx._globalDirUiTruncated = false;
    const q2 = String(q || '');
    const sc = String(scope || 'all');
    const items = [];
    const activeTreeId =
        activeSource?.type === 'composed-tree' ? String(activeSource.treeId || '') : '';
    const metricsMap = ctx._globalDirMetrics;
    const rows = Array.isArray(ctx._globalDirRows) ? ctx._globalDirRows : [];
    const seenTreeIds = new Set();
    const ownPublishedCanonUrls = new Set();

    if (sc === 'all' || sc === 'device') {
        for (const t of store.userStore?.state?.trees || []) {
            if (!t?.id || String(t.id) === activeTreeId) continue;
            const branchNames = resolveBranchRefDisplayNames(t.branchRefs);
            const s = scoreTreesMatch(q2, t?.name, branchNames);
            if (q2 && s <= 0) continue;
            const treeId = String(t.id);
            seenTreeIds.add(treeId);
            const pubCanon = canonicalNetworkTreeUrlString(String(t?.publishedNetworkUrl || '').trim());
            if (pubCanon) ownPublishedCanonUrls.add(pubCanon);
            items.push({
                score: 40 + s,
                kind: 'device',
                data: { tree: t },
            });
        }
    }

    if (sc === 'all' || sc === 'saved') {
        const activeUrlCanon = activeSource?.url
            ? canonicalNetworkTreeUrlString(String(activeSource.url).trim())
            : '';
        for (const s0 of state.communitySources || []) {
            if (String(s0?.contentKind || '') !== 'composed-tree') continue;
            if (activeSource?.id && String(s0.id) === String(activeSource.id)) continue;
            if (activeUrlCanon) {
                const sCanon = canonicalNetworkTreeUrlString(String(s0?.url || '').trim());
                if (sCanon && sCanon === activeUrlCanon) continue;
            }
            const localTree = findLocalTreeForSavedSource(s0);
            if (localTree && seenTreeIds.has(String(localTree.id))) continue;
            try {
                const uCanon = canonicalNetworkTreeUrlString(String(s0?.url || '').trim());
                if (uCanon && ownPublishedCanonUrls.has(uCanon)) continue;
            } catch {
                /* ignore */
            }
            const s = scoreSourcesMatch(q2, s0?.name, s0?.url, String(s0?.id || ''));
            if (q2 && s <= 0) continue;
            items.push({
                score: (localTree ? 40 : 30) + s,
                kind: localTree ? 'device' : 'saved',
                data: localTree ? { tree: localTree } : { source: s0 },
            });
            if (localTree) seenTreeIds.add(String(localTree.id));
            try {
                const uCanon = canonicalNetworkTreeUrlString(String(s0?.url || '').trim());
                if (uCanon) ownPublishedCanonUrls.add(uCanon);
            } catch {
                /* ignore */
            }
        }
    }

    if (sc === 'all' || sc === 'internet') {
        const hashGroups = new Map();
        for (let ri = 0; ri < rows.length; ri++) {
            const r = rows[ri];
            if (listingKind(r?.contentKind, r?.universeId) !== 'composed-tree') continue;
            if (shouldHideRowFromDirectory(r, metricsMap)) continue;
            if (store.isNostrTreeMaintainerBlocked(r?.ownerPub, r?.universeId)) continue;
            try {
                const publicUrl = formatNostrTreeUrl(r?.ownerPub, r?.universeId);
                const uCanon = canonicalNetworkTreeUrlString(publicUrl);
                if (sc === 'all' && uCanon && ownPublishedCanonUrls.has(uCanon)) continue;
            } catch {
                /* ignore */
            }
            const s = scoreSourcesMatch(q2, catalogTitlesSearchBlob(r), r?.shareCode, r?.ownerPub, r?.description, r?.authorName);
            if (q2 && s <= 0) continue;
            const hash = String(r?.branchSetHash || '').trim();
            const m = getRowMetricsFromMap(r, metricsMap);
            const score =
                10 + s + (Number(m?.votes) || 0) * 0.5 + (Number(m?.used7) || 0) * 0.3 - ri * 0.01;
            const entry = { score, row: r, ri, hash };
            if (hash) {
                const prev = hashGroups.get(hash);
                if (!prev || score > prev.score) hashGroups.set(hash, entry);
            } else {
                items.push({
                    score,
                    kind: 'internet',
                    data: { row: r, metrics: m },
                });
            }
        }
        for (const [hash, best] of hashGroups.entries()) {
            const dupCount = rows.filter(
                (r) =>
                    listingKind(r?.contentKind, r?.universeId) === 'composed-tree' &&
                    String(r?.branchSetHash || '').trim() === hash
            ).length;
            const m = getRowMetricsFromMap(best.row, metricsMap);
            items.push({
                score: best.score,
                kind: 'internet',
                data: { row: best.row, metrics: m },
                dupNote: dupCount > 1 ? dupCount - 1 : 0,
            });
        }
    }

    items.sort((a, b) => b.score - a.score);
    const cap = SOURCES_UNIFIED_DISPLAY_CAP;
    if (items.length > cap) ctx._globalDirUiTruncated = true;
    return items.slice(0, cap);
}

export { findLocalTreeForSavedSource };
