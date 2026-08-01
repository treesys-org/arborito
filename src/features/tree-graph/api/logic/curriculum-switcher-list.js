import { getArboritoStore as store } from '../../../../core/store-singleton.js';
import { formatBranchNamesSummary, resolveBranchRefDisplayNames } from '../../../forest/api/tree-branch-labels.js';
import { canonicalNetworkTreeUrlString, resolveActiveBranchId } from '../../../sources/api/modals/logic/sources-helpers.js';
import {
    collectPlaylistMemberCoverage,
    isNetworkPlaylistMemberCourse,
} from '../../../sources/api/modals/logic/sources-playlist-member-coverage.js';
import { isBundledArboritoDemoBranch } from '../../../../core/demo/arborito-demo-ids.js';
import {
    resolveBranchCatalogIcon,
    resolveComposedTreeCatalogIcon,
    resolveOnlineListingIcon,
} from '../../../sources/api/branch-catalog-icon.js';
import { kindEmoji } from '../../../sources/api/sources-kind-ui.js';
import { parseNostrTreeUrl } from '../../../nostr/api/nostr-refs.js';

export const TREE_SWITCHER_LIST_CAP = 80;

/** @typedef {{ kind: string, id: string, name: string, url: string, isActive: boolean, branchSummary: string, icon?: string }} TreeSwitcherItem */

function branchIdFromUrl(url) {
    const u = String(url || '');
    return u.startsWith('branch://') ? u.slice('branch://'.length).split('/')[0] : '';
}

export function resolveActiveComposedTreeId(active) {
    if (!active || active.type !== 'composed-tree') return '';
    const fromUrl =
        active.url && String(active.url).startsWith('tree://')
            ? String(active.url).slice('tree://'.length).split('/')[0]
            : '';
    return String(active.treeId || fromUrl || active.id || '').trim();
}

export function isTreeSwitcherItemActive(item, active = store.value.activeSource) {
    if (!item || !active) return false;
    if (item.kind === 'branch') {
        return resolveActiveBranchId(active) === String(item.id || '');
    }
    if (item.kind === 'composed-tree') {
        return resolveActiveComposedTreeId(active) === String(item.id || '');
    }
    const activeId = String(active.id || '').split('-edition-')[0];
    const activeUrl = String(active.url || '');
    return (
        (!!activeId && activeId === String(item.id || '')) ||
        (!!activeUrl && !!item.url && String(item.url) === activeUrl)
    );
}

/**
 * Collect installed branches, composed trees, and community sources for the switcher.
 * @param {{ hidePlaylistMembers?: boolean, q?: string }} [opts]
 *   When `hidePlaylistMembers` and search is empty: omit network courses that only
 *   exist as members of a local playlist (same rule as Courses → My courses).
 */
export function collectTreeSwitcherSources({ hidePlaylistMembers = false, q = '' } = {}) {
    const out = [];
    const active = store.value.activeSource;
    const locals = store.userStore?.state?.branches || [];
    const composed = store.userStore?.state?.trees || [];
    const localBranchIds = new Set();
    const localCanonUrls = new Set();
    const hideCoveredMembers = !!hidePlaylistMembers && !String(q || '').trim();
    const playlistCoverage = hideCoveredMembers ? collectPlaylistMemberCoverage(composed) : null;

    for (const t of locals) {
        if (!t) continue;
        const id = String(t.id || '');
        const name = String(t.name || '').trim() || id;
        const pubUrlRaw = String(t.publishedNetworkUrl || '').trim();
        if (
            playlistCoverage &&
            isNetworkPlaylistMemberCourse(playlistCoverage, {
                branchId: id,
                url: pubUrlRaw,
            })
        ) {
            continue;
        }
        localBranchIds.add(id);
        localCanonUrls.add(`branch://${id}`);
        const pubCanon = canonicalNetworkTreeUrlString(pubUrlRaw);
        if (pubCanon) localCanonUrls.add(pubCanon);
        out.push({
            kind: 'branch',
            id,
            name,
            url: `branch://${id}`,
            isActive: isTreeSwitcherItemActive({ kind: 'branch', id, url: `branch://${id}` }, active),
            branchSummary: '',
            icon: resolveBranchCatalogIcon(t),
        });
    }

    const localComposedIds = new Set();
    const localComposedCanonUrls = new Set();
    for (const t of composed) {
        if (!t) continue;
        const id = String(t.id || '');
        const name = String(t.name || '').trim() || id;
        const names = resolveBranchRefDisplayNames(t.branchRefs);
        localComposedIds.add(id);
        const pubCanon = canonicalNetworkTreeUrlString(String(t.publishedNetworkUrl || '').trim());
        if (pubCanon) localComposedCanonUrls.add(pubCanon);
        out.push({
            kind: 'composed-tree',
            id,
            name,
            url: `tree://${id}`,
            isActive: isTreeSwitcherItemActive({ kind: 'composed-tree', id, url: `tree://${id}` }, active),
            branchSummary: formatBranchNamesSummary(names, store.ui, { max: 2 }),
            icon: resolveComposedTreeCatalogIcon(t, {
                communitySources: store.value.communitySources || [],
            }),
        });
    }

    const comm = store.value.communitySources || [];
    for (const s of comm) {
        if (!s) continue;
        const id = String(s.id || '');
        const name = String(s.name || '').trim() || id;
        const url = String(s.url || '');
        const contentKind = String(s.contentKind || '').trim();
        const branchDup = branchIdFromUrl(url);
        if (branchDup && localBranchIds.has(branchDup)) continue;
        if (localBranchIds.has(id)) continue;
        const canon = canonicalNetworkTreeUrlString(url);
        if (canon && localCanonUrls.has(canon)) continue;
        /* Local playlist + Saved community twin → one row (same as Courses forest collect). */
        if (contentKind === 'composed-tree') {
            if (localComposedIds.has(id)) continue;
            if (canon && localComposedCanonUrls.has(canon)) continue;
            if (url.startsWith('tree://')) {
                const treeId = url.slice('tree://'.length).split('/')[0] || '';
                if (treeId && localComposedIds.has(treeId)) continue;
            }
        }
        if (
            playlistCoverage &&
            contentKind !== 'composed-tree' &&
            isNetworkPlaylistMemberCourse(playlistCoverage, {
                branchId: branchDup || id,
                url,
            })
        ) {
            continue;
        }
        const kind = contentKind === 'composed-tree' ? 'composed-tree' : 'installed';
        let ownerPub = '';
        let universeId = '';
        try {
            const ref = parseNostrTreeUrl(url);
            ownerPub = String(ref?.pub || '');
            universeId = String(ref?.universeId || '');
        } catch {
            /* ignore */
        }
        const localTwin =
            locals.find((b) => {
                const pub = canonicalNetworkTreeUrlString(String(b?.publishedNetworkUrl || '').trim());
                return pub && canon && pub === canon;
            }) || null;
        if (kind === 'composed-tree') {
            localComposedIds.add(id);
            if (canon) localComposedCanonUrls.add(canon);
        }
        out.push({
            kind,
            id,
            name,
            url,
            isActive: isTreeSwitcherItemActive({ kind, id, url }, active),
            branchSummary: '',
            icon: resolveOnlineListingIcon({
                icon: s.icon,
                contentKind: s.contentKind || (kind === 'composed-tree' ? 'composed-tree' : 'branch'),
                ownerPub,
                universeId,
                localBranch: localTwin,
            }),
        });
    }
    return out;
}

/** True when the user has at least one tree or branch other than the active one. */
export function hasOtherTreeSwitcherSource() {
    return collectTreeSwitcherSources({ hidePlaylistMembers: true }).some((s) => !s.isActive);
}

/** @param {string} itemKind @param {'all'|'branch'|'composed-tree'} filter */
export function switcherKindMatches(itemKind, filter) {
    const f = String(filter || 'all');
    if (f === 'all') return true;
    if (f === 'branch') return itemKind === 'branch';
    if (f === 'composed-tree') return itemKind === 'composed-tree';
    return true;
}

/** @param {string} q @param {string} name */
export function scoreSwitcherMatch(q, name) {
    const qq = String(q || '').trim().toLowerCase();
    if (!qq) return 1;
    const h = String(name || '').trim().toLowerCase();
    if (!h) return 0;
    if (h === qq) return 100;
    if (h.startsWith(qq)) return 50;
    if (h.includes(qq)) return 10;
    return 0;
}

function sectionLabel(ui, key) {
    if (key === 'branch') return ui.sourcesPillBranch || ui.treeSwitcherSectionBranches || 'Course';
    if (key === 'composed-tree') {
        return ui.sourcesPillComposedTree || ui.sourcesSectionPlaylists || ui.treeSwitcherSectionTrees || 'Playlist';
    }
    return ui.treeSwitcherSectionNetwork || ui.sourcesUnifiedScopeInternet || 'Internet';
}

/**
 * Pure data for the curriculum switcher tree list (search + kind filter).
 * @param {string} qRaw
 * @param {'all'|'branch'|'composed-tree'} [kindFilter]
 * @param {object} [ui]
 */
export function buildTreeSwitcherListData(qRaw, kindFilter = 'all', ui = store.ui) {
    const q = String(qRaw || '');
    const kf = String(kindFilter || 'all');
    /* Same as Courses → My courses: hide playlist-only course echoes unless
     * the user filters to Course or is searching by name. */
    const hidePlaylistMembers = kf !== 'branch';
    const ranked = collectTreeSwitcherSources({ hidePlaylistMembers, q })
        .filter((s) => switcherKindMatches(s.kind, kf))
        .map((s) => ({
            item: s,
            score: Math.max(scoreSwitcherMatch(q, s.name), scoreSwitcherMatch(q, s.branchSummary) * 0.92),
        }))
        .filter((x) => x.score > 0)
        .sort(
            (a, b) =>
                (b.item.isActive ? 1000 : 0) +
                b.score -
                ((a.item.isActive ? 1000 : 0) + a.score)
        );

    const switchables = ranked.filter((row) => !row.item.isActive);
    const pickedSource = switchables.length ? switchables : ranked;
    const cap = TREE_SWITCHER_LIST_CAP;
    const truncated = pickedSource.length > cap;
    const picked = truncated ? pickedSource.slice(0, cap) : pickedSource;

    if (!picked.length) {
        const onActiveOnly =
            ranked.length > 0 && ranked.every((row) => row.item.isActive) && !switchables.length;
        return {
            empty: true,
            emptyMessage: onActiveOnly
                ? ui.treeSwitcherAlreadyActive ||
                  ui.treeSwitcherSingleActiveHint ||
                  'You are already on this branch or tree. Use the library to add more.'
                : ui.treeSwitcherEmpty || ui.sourcesUnifiedEmpty || 'No results.',
            truncated: false,
            total: 0,
            shown: 0,
            cap,
        };
    }

    let truncLine = '';
    if (truncated) {
        const hintTpl = ui.treeSwitcherListTruncHint;
        if (hintTpl && /\{\{shown\}\}/.test(String(hintTpl)) && /\{\{total\}\}/.test(String(hintTpl))) {
            truncLine = String(hintTpl)
                .replace(/\{\{shown\}\}/g, String(cap))
                .replace(/\{\{total\}\}/g, String(ranked.length));
        } else {
            truncLine = `Showing ${cap} of ${pickedSource.length}. Narrow your search.`;
        }
    }

    if (kf === 'all') {
        const groups = [
            { key: 'branch', label: sectionLabel(ui, 'branch'), items: [] },
            { key: 'composed-tree', label: sectionLabel(ui, 'composed-tree'), items: [] },
            { key: 'installed', label: sectionLabel(ui, 'installed'), items: [] },
        ];
        for (const row of picked) {
            const bucket =
                row.item.kind === 'branch'
                    ? groups[0]
                    : row.item.kind === 'composed-tree'
                      ? groups[1]
                      : groups[2];
            bucket.items.push(row.item);
        }
        return {
            empty: false,
            grouped: true,
            groups: groups.filter((g) => g.items.length),
            showPill: false,
            truncated,
            truncLine,
            total: pickedSource.length,
            shown: picked.length,
            cap,
        };
    }

    return {
        empty: false,
        grouped: false,
        items: picked.map((x) => x.item),
        showPill: true,
        truncated,
        truncLine,
        total: ranked.length,
        shown: picked.length,
        cap,
    };
}

/** @param {object} ui @param {TreeSwitcherItem} item */
export function treeSwitcherItemMeta(ui, item) {
    const isFrozen =
        item.kind === 'installed' &&
        item.id &&
        typeof store.userStore?.isTreeFrozen === 'function' &&
        store.userStore.isTreeFrozen(item.id);
    const isArboritoDemo = item.kind === 'branch' && isBundledArboritoDemoBranch(item.id);
    const pill = isArboritoDemo
        ? ui.sourcesPillByArborito || 'Arborito'
        : item.kind === 'branch'
          ? ui.sourcesPillBranch || 'Branch'
          : item.kind === 'composed-tree'
            ? ui.sourcesPillComposedTree || 'Tree'
            : isFrozen
              ? ui.freezeToggleOn || ui.sourcesPillOffline || 'Offline'
              : ui.sourcesPillAdded || 'Added';
    const pillCls = isArboritoDemo
        ? 'arborito-tree-switcher-pill arborito-tree-switcher-pill--by-arborito'
        : item.kind === 'branch'
          ? 'arborito-tree-switcher-pill arborito-tree-switcher-pill--local'
          : item.kind === 'composed-tree'
            ? 'arborito-tree-switcher-pill arborito-tree-switcher-pill--composed'
            : isFrozen
              ? 'arborito-tree-switcher-pill arborito-tree-switcher-pill--frozen'
              : 'arborito-tree-switcher-pill arborito-tree-switcher-pill--installed';
    const emoji =
        String(item.icon || '').trim() ||
        (item.kind === 'branch'
            ? kindEmoji('branch')
            : item.kind === 'composed-tree'
              ? kindEmoji('composed-tree')
              : isFrozen
                ? '❄️'
                : '🌐');
    const avatarCls =
        item.kind === 'branch'
            ? 'arborito-tree-switcher-avatar arborito-tree-switcher-avatar--local'
            : item.kind === 'composed-tree'
              ? 'arborito-tree-switcher-avatar arborito-tree-switcher-avatar--composed'
              : 'arborito-tree-switcher-avatar arborito-tree-switcher-avatar--installed';
    return { pill, pillCls, emoji, avatarCls, isFrozen };
}
