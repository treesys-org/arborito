import { getArboritoStore as store } from '../../../../../core/store-singleton.js';
import { formatNostrTreeUrl } from '../../../../nostr/api/nostr-refs.js';
import { listingKind } from '../../sources-kind-ui.js';
import { resolveBranchRefDisplayNames } from '../../../../forest/api/tree-branch-labels.js';
import { catalogTitlesSearchBlob } from '../../../../../shared/lib/catalog-titles.js';
import { scoreSourcesMatch } from './sources-search-utils.js';
import { getRowMetricsFromMap, shouldHideRowFromDirectory } from './sources-directory-row-state.js';
import { canonicalNetworkTreeUrlString } from './sources-helpers.js';

function findLocalTreeForSavedSource(saved) {
    const url = String(saved?.url || '').trim();
    if (!url) return null;
    const canon = canonicalNetworkTreeUrlString(url);
    return (store.userStore?.state?.trees || []).find((t) => {
        const pub = String(t?.publishedNetworkUrl || '').trim();
        if (!pub) return false;
        if (pub === url) return true;
        const tCanon = canonicalNetworkTreeUrlString(pub);
        return !!(canon && tCanon && canon === tCanon);
    });
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

    if (sc === 'all' || sc === 'device' || sc === 'internet') {
        for (const t of store.userStore?.state?.trees || []) {
            if (!t?.id) continue;
            const treeId = String(t.id);
            const pubCanon = canonicalNetworkTreeUrlString(String(t?.publishedNetworkUrl || '').trim());
            /* Always track active + published URLs so Saved/Discover do not re-list the same tree. */
            if (pubCanon) ownPublishedCanonUrls.add(pubCanon);
            if (treeId === activeTreeId) {
                seenTreeIds.add(treeId);
                continue;
            }
            const branchNames = resolveBranchRefDisplayNames(t.branchRefs);
            const s = scoreTreesMatch(q2, t?.name, branchNames);
            if (q2 && s <= 0) continue;
            seenTreeIds.add(treeId);
            items.push({
                score: 40 + s,
                kind: 'device',
                data: { tree: t },
            });
        }
    }

    /* Mis cursos + Explorar: árboles locales/añadidos; no duplicar en el catálogo de red. */
    if (sc === 'all' || sc === 'saved' || sc === 'device' || sc === 'internet') {
        const activeUrlCanon = (() => {
            const fromActive = activeSource?.url
                ? canonicalNetworkTreeUrlString(String(activeSource.url).trim())
                : '';
            if (fromActive) return fromActive;
            if (!activeTreeId) return '';
            const activeTree = (store.userStore?.state?.trees || []).find(
                (t) => String(t?.id) === activeTreeId
            );
            return canonicalNetworkTreeUrlString(String(activeTree?.publishedNetworkUrl || '').trim());
        })();
        for (const s0 of state.communitySources || []) {
            if (String(s0?.contentKind || '') !== 'composed-tree') continue;
            if (activeSource?.id && String(s0.id) === String(activeSource.id)) continue;
            const sCanon = canonicalNetworkTreeUrlString(String(s0?.url || '').trim());
            if (activeUrlCanon && sCanon && sCanon === activeUrlCanon) continue;
            const localTree = findLocalTreeForSavedSource(s0);
            if (localTree && String(localTree.id) === activeTreeId) continue;
            if (localTree && seenTreeIds.has(String(localTree.id))) continue;
            if (sCanon && ownPublishedCanonUrls.has(sCanon)) continue;
            const s = scoreSourcesMatch(q2, s0?.name, s0?.url, String(s0?.id || ''));
            if (q2 && s <= 0) continue;
            items.push({
                score: (localTree ? 40 : 30) + s,
                kind: localTree ? 'device' : 'saved',
                data: localTree ? { tree: localTree } : { source: s0 },
            });
            if (localTree) seenTreeIds.add(String(localTree.id));
            if (sCanon) ownPublishedCanonUrls.add(sCanon);
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
                const installedInCommunity = (state.communitySources || []).some((cs) => {
                    const c = canonicalNetworkTreeUrlString(String(cs?.url || '').trim());
                    return !!c && !!uCanon && c === uCanon;
                });
                if (installedInCommunity && (sc === 'all' || sc === 'internet')) continue;
                if ((sc === 'all' || sc === 'internet') && uCanon && ownPublishedCanonUrls.has(uCanon)) continue;
            } catch {
                /* ignore */
            }
            /* Never score against ownerPub hex (substring false-positives). */
            const s = scoreSourcesMatch(
                q2,
                catalogTitlesSearchBlob(r),
                r?.shareCode,
                r?.description,
                r?.authorName
            );
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
    /* No hard slice: Forest “Show more” pages locally; network width via fetchLimit. */
    ctx._globalDirUiTruncated = false;
    return items;
}

export { findLocalTreeForSavedSource };
