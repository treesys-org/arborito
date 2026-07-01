import { getArboritoStore } from '../../../core/store-singleton.js';
import { inferBundleTitle } from '../../publishing/api/arborito-bundle.js';
import { markPendingCurriculumSwitcher } from '../../editor/api/curriculum-switcher-pending.js';
import { formatBranchNamesSummary, resolveBranchRefDisplayNames } from '../../trees/api/tree-branch-labels.js';
import { fileSystem } from '../../backup-export/api/filesystem.js';

/** Display name without trailing " (snapshot)" suffix from versioned loads */
export function curriculumBaseName(activeSource) {
    if (!(activeSource && activeSource.name)) return '';
    return activeSource.name.split(' (')[0].trim();
}

/**
 * Human-facing tree title: prefers bundle/universe + root node names over `activeSource.name`
 * (Public Nostr sources often label the source as `Public · …`).
 * @param {{ navHome?: string }} [ui]
 */
export function curriculumTreeDisplayName(ui = {}) {
    const src = getArboritoStore().value.activeSource;
    const raw = getArboritoStore().value.rawGraphData;
    if (raw && typeof raw === 'object') {
        const t = String(inferBundleTitle(raw, src) || '').trim();
        if (t && t !== 'Arborito') return t;
    }
    const base = curriculumBaseName(src) || '';
    if (base) return base;
    return String(src?.name || ui.navHome || 'Home').trim() || 'Home';
}

export function getVersionPresentation(activeSource, releases, ui = {}) {
    const r = releases || [];
    const isArchive = (activeSource && activeSource.type) === 'archive';
    const isComposed = (activeSource && activeSource.type) === 'composed-tree';
    const isLocal =
        (activeSource && activeSource.type) === 'branch' ||
        String(activeSource?.url || '').startsWith('branch://');
    const isRolling = !isArchive && !isLocal && !isComposed;
    const t = (key, en) => (ui && ui[key]) || en;
    const versionTitle = t('releasesVersionUiTitle', t('releasesStateVersion', 'Version'));
    const scopeGlobal = t('releasesVersionScopeGlobal', 'Public on the network');
    const scopeLocal = t('releasesVersionScopeLocal', 'On this device');
    const kindLabel = isComposed
        ? t('sourcesPillComposedTree', 'Tree')
        : isLocal
          ? t('sourcesPillBranch', 'Branch')
          : t('sourcesPillInstalled', 'Installed');
    /** rolling | archive | local | composed — solid styles in CSS (.arborito-timeline-chip--btn) */
    let versionKind = 'rolling';
    let chipLabel = versionTitle;
    let chipSub = t('releasesStateRolling', 'Rolling');
    let icon = '🌊';
    let curriculumKind = isComposed ? 'composed-tree' : isLocal ? 'branch' : 'installed';
    if (isArchive) {
        versionKind = 'archive';
        chipLabel = versionTitle;
        const releaseInfo = r.find((rel) => rel.url === activeSource.url);
        if (releaseInfo) chipSub = releaseInfo.year || releaseInfo.name;
        else {
            const match = activeSource.name.match(/\((.*?)\)/);
            chipSub = match ? match[1] : activeSource.year || t('releasesStateArchive', 'Archive');
        }
        icon = '🏛️';
    } else if (isComposed) {
        versionKind = 'composed';
        chipLabel = kindLabel;
        const refs = getArboritoStore().userStore?.getTree?.(activeSource.treeId)?.branchRefs;
        const names = resolveBranchRefDisplayNames(refs);
        const summary = formatBranchNamesSummary(names, ui, { max: 2 });
        const n = names.length;
        chipSub =
            summary ||
            (n
                ? `${n} ${t('sourcesTreeBranchCount', 'branches')}`
                : t('sourcesKindSubtitleTree', 'Playlist'));
        icon = '🌳';
    } else if (isLocal) {
        versionKind = 'local';
        chipLabel = kindLabel;
        chipSub = scopeLocal;
        icon = '🌿';
    } else {
        chipSub = t('releasesStateLiveShort', t('releasesStateLive', 'Latest online'));
        icon = '🌐';
    }
    return { chipLabel, chipSub, icon, versionKind, isArchive, isLocal, isRolling, isComposed, kindLabel, curriculumKind };
}

/**
 * Version tab when there is a real choice (archives, snapshots, or construction admin).
 * @param {ReturnType<typeof getVersionPresentation>} vp
 * @param {object} state
 * @param {object} [graph]
 */
export function switcherShowsVersionTab(vp, state, graph) {
    if (graph?._curriculumSwitcherTreesOnly) return false;
    if (graph?._curriculumSwitcherVersionsOnly) return true;

    if (!vp) return false;

    if (state?.constructionMode && fileSystem.features.canWrite) {
        if (vp.isLocal) return true;
        if (vp.isComposed && fileSystem.activeComposedBranchId()) return true;
        if (fileSystem.isNostrTreeSource()) return true;
    }

    if (vp.isComposed) return false;

    if (vp.isLocal) {
        if (graph?._localSnapLoading) return true;
        const items = graph?._localSnapItems;
        return Array.isArray(items) && items.length > 0;
    }

    const releases = state?.availableReleases || [];
    return releases.some((r) => r?.type === 'archive');
}

/**
 * @param {ReturnType<typeof getVersionPresentation>} vp
 * @param {object} ui
 */
export function switcherVersionTabLabel(vp, ui = {}) {
    if (vp?.isLocal || (vp?.isComposed && fileSystem.isLocalComposedTree())) {
        return ui.treeSwitcherTabSnapshots || ui.releasesSnapshotsChip || 'Snapshots';
    }
    return ui.treeSwitcherTabEdition || ui.releasesVersionUiTitle || 'Edition';
}

/**
 * Panel title when the version tab is hidden (playlists, single edition, etc.).
 * @param {object} ui
 */
export function switcherPanelTitle(ui = {}) {
    return ui.treeSwitcherTitleShort || ui.treeSwitcherTabContent || 'Switch';
}

/**
 * Short label for the active edition / snapshot (branch panel chip).
 * @param {Record<string, string>} [ui]
 * @param {object} [state]
 * @param {{ branchId?: string }} [opts]
 */
export function resolveActiveSourceVersionLabel(ui = {}, state, opts = {}) {
    const st = getArboritoStore();
    const resolvedState = state ?? st?.state;
    const src = resolvedState?.activeSource;
    if (!src) return '';
    const releases = resolvedState?.availableReleases || [];
    const vp = getVersionPresentation(src, releases, ui);
    const t = (key, en) => (ui && ui[key]) || en;

    if (src.type === 'archive' || src.localArchiveReleaseId != null) {
        const id =
            src.localArchiveReleaseId != null
                ? String(src.localArchiveReleaseId)
                : (() => {
                      const m = String(src.name || '').match(/\(([^)]+)\)\s*$/);
                      return m ? m[1].trim() : '';
                  })();
        if (id) return id;
        const releaseInfo = releases.find((rel) => rel.url === src.url);
        if (releaseInfo?.year || releaseInfo?.name) return String(releaseInfo.year || releaseInfo.name);
        return String(vp.chipSub || src.year || t('releasesStateArchive', 'Archive')).trim();
    }

    const liveLabel = t('releasesStateLiveShort', t('releasesStateLive', 'Current'));
    const localSnapLabel = (localId) => {
        const entry = (getArboritoStore().userStore?.state?.branches || []).find((b) => String(b?.id) === localId);
        const snapCount = entry?.releaseSnapshots ? Object.keys(entry.releaseSnapshots).length : 0;
        if (src.type !== 'archive' && src.localArchiveReleaseId == null && snapCount > 0) {
            return `${liveLabel} · ${snapCount}`;
        }
        return liveLabel;
    };

    if (vp.isComposed && fileSystem.isLocalComposedTree()) {
        const branchId = opts.branchId || fileSystem.activeComposedBranchId();
        if (branchId) return localSnapLabel(String(branchId));
        return '';
    }

    if (vp.isLocal) {
        if (src.type === 'branch' || String(src.url || '').startsWith('branch://')) {
            const localId = String(src.url || '').startsWith('branch://')
                ? String(src.url).slice('branch://'.length).split('/')[0]
                : String(src.id || '');
            if (localId) return localSnapLabel(localId);
        }
        return liveLabel;
    }

    if (vp.isRolling) {
        return t('releasesStateLiveShort', t('releasesStateLive', 'Live'));
    }

    return String(vp.chipSub || '').trim();
}

/**
 * Construction: branch folders (and editable roots) show the version/snapshots chip.
 * Explore mode keeps the full unified tree chip at root (see panelTitleCellRead).
 * @param {object} graph
 * @param {object|null} current
 */
export function panelShowsBranchVersionChip(current) {
    if (!current || current._composedVirtualRoot) return false;
    if (current._composedWrapper || current._composedBranchId) return true;
    if (current.type !== 'root' && current.type !== 'branch') return false;

    if (current.type === 'branch') return true;

    if (getArboritoStore().state.constructionMode) {
        if (!fileSystem.features.canWrite) return false;
        return fileSystem.isLocalBranch();
    }

    return fileSystem.isLocalBranch();
}

export function applyReleaseSwitch(release) {
    const activeSource = getArboritoStore().value.activeSource;
    const newSource = {
        ...activeSource,
        id: `${activeSource.id}-${release.id}`,
        name: release.name || `${activeSource.name} (${release.id})`,
        url: release.url,
        type: release.type || 'archive'
    };
    markPendingCurriculumSwitcher();
    getArboritoStore().loadData(newSource);
}

export function applyLiveSwitch() {
    const activeSource = getArboritoStore().value.activeSource;
    const releases = getArboritoStore().value.availableReleases || [];
    const rolling = releases.find((r) => r.type === 'rolling');
    let newUrl = rolling ? rolling.url : activeSource.url;
    if (!rolling && activeSource.type === 'archive') {
        if (activeSource.url.includes('/releases/')) {
            newUrl = activeSource.url.split('/releases/')[0] + '/data.json';
        }
    }
    const newSource = {
        ...activeSource,
        id: `live-${Date.now()}`,
        name: activeSource.name.split(' (')[0],
        url: newUrl,
        type: 'rolling'
    };
    markPendingCurriculumSwitcher();
    getArboritoStore().loadData(newSource);
}
