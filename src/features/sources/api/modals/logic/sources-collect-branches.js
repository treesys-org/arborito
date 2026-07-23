import { getArboritoStore as store } from '../../../../../core/store-singleton.js';
import { formatNostrTreeUrl, parseNostrTreeUrl } from '../../../../nostr/api/nostr-refs.js';
import { SOURCES_UNIFIED_DISPLAY_CAP } from '../../../../p2p-webtorrent/api/directory-index-config.js';
import { catalogTitlesSearchBlob } from '../../../../../shared/lib/catalog-titles.js';
import { canonicalNetworkTreeUrlString, resolveActiveBranchId } from './sources-helpers.js';
import { listingKind } from '../../sources-kind-ui.js';
import { scoreSourcesMatch } from './sources-search-utils.js';
import {
    computeDirectoryRowState,
    directoryRowRankingPenalty,
    getRowMetricsFromMap,
    rowKeyFromDirectory,
    shouldHideRowFromDirectory,
} from './sources-directory-row-state.js';
import { DEMO_BRANCH_UNIVERSE } from '../../../../../core/demo/arborito-demo-ids.js';
import { isBundledDemoBranchId } from '../../../../publishing/api/demo-tree-guard.js';
import { resolveBranchCatalogIcon } from '../../branch-catalog-icon.js';

function langMatchBoost(uiLang, langKeys) {
    if (!uiLang) return 0;
    if (!Array.isArray(langKeys) || !langKeys.length) return 0;
    return langKeys.some((k) => String(k || '').toUpperCase() === uiLang) ? 6 : 0;
}

/**
 * @param {object} ctx, sources controller (`this`)
 * @returns {{ score: number, kind: 'branch'|'saved'|'internet', data: object }[]}
 */
export function collectBranchesTabItems(ctx, ui, state, activeSource, { scope, q }) {
    ctx._globalDirUiTruncated = false;
    const q2 = String(q || '');
    const items = [];
    const uiLang = String(store.state?.lang || '').toUpperCase();

    const activeBranchId = resolveActiveBranchId(activeSource);
    const curriculumMounted = !!(state?.data && state?.rawGraphData);
    const activeId = activeSource?.id ? String(activeSource.id) : '';
    const activeUrlCanon = activeSource?.url
        ? canonicalNetworkTreeUrlString(String(activeSource.url).trim())
        : '';
    const isPinnedActive = (sourceId, url) => {
        /* Match SourcesBranchesPanel pin: visible curriculum, not only fully hydrated graph. */
        if (!state?.data) return false;
        if (activeId && sourceId && String(sourceId) === activeId) return true;
        if (activeBranchId && sourceId && String(sourceId) === activeBranchId) return true;
        if (!activeUrlCanon || !url) return false;
        const c = canonicalNetworkTreeUrlString(String(url).trim());
        return !!c && c === activeUrlCanon;
    };

    const seenPublishedTreeUrls = new Set();
    const ownPublishedTreeUrls = new Set();
    const branchesAll = store.userStore?.state?.branches || [];
    const ownPublishedCanonUrls = new Set();
    for (const t of branchesAll) {
        const c = canonicalNetworkTreeUrlString(String(t?.publishedNetworkUrl || '').trim());
        if (c) ownPublishedCanonUrls.add(c);
    }
    const publishedBranchUrls = branchesAll
        .map((t) => String(t?.publishedNetworkUrl || '').trim())
        .filter(Boolean);
    if (publishedBranchUrls.length) void ctx._ensurePublishedTreeMetrics?.(publishedBranchUrls);

    const localPublished = new Map();
    for (const t of branchesAll) {
        const pubUrlRaw = String(t?.publishedNetworkUrl || '').trim();
        if (!pubUrlRaw) continue;
        const canon = canonicalNetworkTreeUrlString(pubUrlRaw) || pubUrlRaw;
        if (!localPublished.has(canon)) {
            localPublished.set(canon, {
                id: String(t?.id || ''),
                name: String(t?.name || ''),
                icon: resolveBranchCatalogIcon(t),
            });
        }
    }
    if (scope !== 'internet' && scope !== 'saved') {
        for (const t of branchesAll) {
            if (isPinnedActive(t?.id, t?.publishedNetworkUrl)) continue;
            const pubUrlRaw = String(t?.publishedNetworkUrl || '').trim();
            if (pubUrlRaw) {
                try {
                    const canon = canonicalNetworkTreeUrlString(pubUrlRaw) || pubUrlRaw;
                    seenPublishedTreeUrls.add(pubUrlRaw);
                    if (canon !== pubUrlRaw) seenPublishedTreeUrls.add(canon);
                    ownPublishedTreeUrls.add(pubUrlRaw);
                    if (canon !== pubUrlRaw) ownPublishedTreeUrls.add(canon);
                } catch {
                    /* ignore */
                }
            }
            const s = scoreSourcesMatch(q2, t?.name, String(t?.id || ''));
            if (q2 && s <= 0) continue;
            const localLangKeys = t?.data?.languages ? Object.keys(t.data.languages) : null;
            const isActive = !!(
                curriculumMounted &&
                activeBranchId &&
                activeBranchId === String(t.id)
            );
            /* Device/local above internet so installed garden stays near the active pin. */
            const score =
                40 +
                (isActive ? 5 : 0) +
                s +
                (t?.updated ? Math.min(15, Math.floor(Number(t.updated) / 1e13)) : 0) +
                langMatchBoost(uiLang, localLangKeys);
            items.push({ score, kind: 'branch', data: { branch: t, isActive } });
        }
    }

    const communityAll = state.communitySources || [];
    const hasLocalDemo = branchesAll.some((b) => isBundledDemoBranchId(b?.id));
    if (scope !== 'branch' && scope !== 'internet') {
        void ctx._ensureSavedSourcesMetrics?.(communityAll);
    }
    if (scope !== 'branch' && scope !== 'internet') {
        for (const s0 of communityAll) {
            if (String(s0?.contentKind || '').trim() === 'composed-tree') continue;
            const savedBranchId = String(s0?.url || '').startsWith('branch://')
                ? String(s0.url).slice('branch://'.length).split('/')[0]
                : '';
            if (savedBranchId && branchesAll.some((b) => String(b?.id) === savedBranchId)) continue;
            /* Bundled demo is the local garden — do not also list a saved/network demo row. */
            if (hasLocalDemo) {
                if (isBundledDemoBranchId(savedBranchId) || isBundledDemoBranchId(s0?.id)) continue;
                try {
                    const ref = parseNostrTreeUrl(String(s0?.url || '').trim());
                    if (ref && String(ref.universeId) === DEMO_BRANCH_UNIVERSE) continue;
                } catch {
                    /* ignore */
                }
            }
            if (isPinnedActive(s0?.id, s0?.url)) continue;
            try {
                const u = String(s0?.url || '').trim();
                const uCanon = canonicalNetworkTreeUrlString(u);
                if (uCanon && ownPublishedCanonUrls.has(uCanon)) continue;
                if (u && (seenPublishedTreeUrls.has(u) || (uCanon && seenPublishedTreeUrls.has(uCanon)))) {
                    continue;
                }
            } catch {
                /* ignore */
            }
            const s = scoreSourcesMatch(q2, s0?.name, s0?.url, String(s0?.id || ''));
            if (q2 && s <= 0) continue;
            const savedLangKeys = Array.isArray(s0?.languages) ? s0.languages : null;
            items.push({
                score: 30 + s + langMatchBoost(uiLang, savedLangKeys),
                kind: 'saved',
                data: {
                    source: s0,
                    isActive: !!(
                        curriculumMounted &&
                        activeSource &&
                        activeSource.id === s0.id
                    ),
                },
            });
            try {
                const u = String(s0?.url || '').trim();
                const uCanon = canonicalNetworkTreeUrlString(u);
                if (u) seenPublishedTreeUrls.add(u);
                if (uCanon) seenPublishedTreeUrls.add(uCanon);
            } catch {
                /* ignore */
            }
        }
    }

    let rows = scope === 'branch' ? [] : Array.isArray(ctx._globalDirRows) ? ctx._globalDirRows : [];
    if (scope === 'internet' && localPublished.size) {
        const existing = new Set(rows.map((r) => formatNostrTreeUrl(r?.ownerPub, r?.universeId)));
        for (const [u, lt] of localPublished.entries()) {
            if (existing.has(u)) continue;
            const ref = parseNostrTreeUrl(u);
            if (!ref?.pub || !ref?.universeId) continue;
            rows = [
                {
                    ownerPub: String(ref.pub),
                    universeId: String(ref.universeId),
                    title: lt.name || 'Published tree',
                    shareCode: '',
                    updatedAt: '',
                    ...(lt.icon ? { icon: lt.icon } : {}),
                },
                ...rows,
            ];
        }
    }

    const metricsMap = ctx._globalDirMetrics;
    if (scope !== 'branch' && scope !== 'saved') {
        for (let ri = 0; ri < rows.length; ri++) {
            const r = rows[ri];
            if (listingKind(r?.contentKind, r?.universeId) === 'composed-tree') continue;
            /* Bundled demo lives as the local branch only — never a second Discover row. */
            if (String(r?.universeId || '').trim() === DEMO_BRANCH_UNIVERSE) continue;
            try {
                const u = formatNostrTreeUrl(r?.ownerPub, r?.universeId);
                const uCanon = canonicalNetworkTreeUrlString(String(u || '').trim());
                const installedInCommunity = (state.communitySources || []).some((cs) => {
                    const c = canonicalNetworkTreeUrlString(String(cs?.url || '').trim());
                    return !!c && !!uCanon && c === uCanon;
                });
                if (installedInCommunity && scope === 'all') continue;
                if (scope === 'all' && uCanon && ownPublishedCanonUrls.has(uCanon)) continue;
                if (u && seenPublishedTreeUrls.has(String(u)) && !ownPublishedTreeUrls.has(String(u))) continue;
            } catch {
                /* ignore */
            }
            if (store.isNostrTreeMaintainerBlocked(r?.ownerPub, r?.universeId)) continue;
            const publicTreeUrl = (() => {
                try {
                    return formatNostrTreeUrl(r?.ownerPub, r?.universeId);
                } catch {
                    return '';
                }
            })();
            if (isPinnedActive(null, publicTreeUrl)) continue;
            const stRow = computeDirectoryRowState(r, metricsMap);
            if (shouldHideRowFromDirectory(r, metricsMap)) continue;
            const s = scoreSourcesMatch(
                q2,
                catalogTitlesSearchBlob(r),
                r?.shareCode,
                r?.ownerPub,
                r?.description,
                r?.authorName
            );
            if (q2 && s <= 0) continue;
            const dirLangKeys = Array.isArray(r?.languages) ? r.languages : null;
            const hiddenPenalty = directoryRowRankingPenalty(stRow);
            const localInfo =
                publicTreeUrl && localPublished.has(publicTreeUrl)
                    ? localPublished.get(publicTreeUrl)
                    : null;
            const orderPreserve = (rows.length - ri) * 0.09;
            items.push({
                score: 10 + orderPreserve + s + hiddenPenalty + langMatchBoost(uiLang, dirLangKeys),
                kind: 'internet',
                data: { row: r, localInfo, metrics: getRowMetricsFromMap(r, metricsMap), state: stRow },
            });
        }
    }

    items.sort((a, b) => b.score - a.score);
    const cap = SOURCES_UNIFIED_DISPLAY_CAP;
    if (items.length > cap) ctx._globalDirUiTruncated = true;
    return items.slice(0, cap);
}
