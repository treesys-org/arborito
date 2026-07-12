import { getArboritoStore } from '../../../core/store-singleton.js';
import { inferBundleTitle } from '../../publishing/api/arborito-bundle.js';
import { markPendingCurriculumSwitcher } from '../../editor/api/curriculum-switcher-pending.js';
import { formatBranchNamesSummary, resolveBranchRefDisplayNames } from '../../forest/api/tree-branch-labels.js';
import { fileSystem } from '../../backup-export/api/filesystem.js';
import { resolveEditionManifestUrl } from '../../sources/api/library-mirrors.js';

export function normalizeReleaseUrl(url) {
    return String(url || '')
        .trim()
        .replace(/\?.*$/, '')
        .replace(/#.*$/, '');
}

export function releaseEditionKey(release) {
    if (!release) return '';
    const id = String(release.id || release.year || '').trim();
    if (id) return id;
    const url = normalizeReleaseUrl(release.url);
    const m = url.match(/\/releases\/([^/]+)\//i);
    return m ? m[1] : url;
}

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
    const isArchive =
        activeSource?.type === 'archive' ||
        activeSource?.localArchiveReleaseId != null ||
        (activeSource?.editionId != null && String(activeSource.editionId) !== '');
    const isComposed = (activeSource && activeSource.type) === 'composed-tree';
    const isLocal =
        (activeSource && activeSource.type) === 'branch' ||
        String(activeSource?.url || '').startsWith('branch://');
    const isRolling =
        !isArchive &&
        !isLocal &&
        !isComposed &&
        (activeSource?.type === 'rolling' || !activeSource?.type || activeSource?.type === 'installed');
    const t = (key, en) => (ui && ui[key]) || en;
    const versionTitle = t('releasesVersionUiTitle', t('releasesStateVersion', 'Version'));
    const scopeGlobal = t('releasesVersionScopeGlobal', 'Public on the network');
    const scopeLocal = t('releasesVersionScopeLocal', 'On this device');
    const kindLabel = isComposed
        ? t('sourcesPillComposedTree', 'Tree')
        : isLocal
          ? t('sourcesPillBranch', 'Branch')
          : t('sourcesPillInstalled', 'Installed');
    /** rolling | archive | local | composed, solid styles in CSS (.arborito-timeline-chip--btn) */
    let versionKind = 'rolling';
    let chipLabel = versionTitle;
    let chipSub = t('releasesStateLiveShort', t('releasesStateLive', 'Live'));
    let icon = '🌊';
    let curriculumKind = isComposed ? 'composed-tree' : isLocal ? 'branch' : 'installed';
    if (isArchive) {
        versionKind = 'archive';
        chipLabel = versionTitle;
        const releaseInfo = r.find(
            (rel) =>
                normalizeReleaseUrl(rel.url) === normalizeReleaseUrl(activeSource.url) ||
                String(rel.id || rel.year || '') === String(activeSource.editionId || '')
        );
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
/** True when the version/snapshots switcher would offer a real choice beyond the current edition. */
export function hasVersionSwitcherChoice(state, graph, ui = {}) {
    const src = state?.activeSource;
    if (!src) return false;
    const releases = state?.availableReleases || [];
    const vp = getVersionPresentation(src, releases, ui);

    if (state?.constructionMode && fileSystem.features.canWrite) {
        if (vp.isLocal) return true;
        if (vp.isComposed && fileSystem.activeComposedBranchId()) return true;
        if (fileSystem.isNostrTreeSource()) return true;
    }

    if (vp.isArchive) return true;

    if (vp.isLocal) {
        if (state?.constructionMode && fileSystem.features.canWrite) return true;
        if (graph?._localSnapLoading) return true;
        const items = graph?._localSnapItems;
        if (!Array.isArray(items)) return true;
        return items.length > 0;
    }

    return releases.some((r) => r?.type === 'archive');
}

export function switcherShowsVersionTab(vp, state, graph) {
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
        if (!Array.isArray(items)) return true;
        return items.length > 0;
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
        return ui.treeSwitcherTabVersions || ui.releasesVersionsChip || ui.treeSwitcherTabSnapshots || 'Versions';
    }
    return ui.treeSwitcherTabVersions || ui.treeSwitcherTabEdition || ui.releasesVersionUiTitle || 'Edition';
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

    const liveLabel = vp.isLocal
        ? t('releasesLocalDraftShort', t('releasesLiveSimple', 'Current draft'))
        : t('releasesStateLiveShort', t('releasesStateLive', 'Current'));
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
    const st = getArboritoStore();
    const activeSource = st.value.activeSource;
    const editionId = releaseEditionKey(release);
    if (
        activeSource?.type === 'archive' &&
        (normalizeReleaseUrl(activeSource.url) === normalizeReleaseUrl(release.url) ||
            String(activeSource.editionId || '') === editionId)
    ) {
        return Promise.resolve(true);
    }
    const manifestBaseUrl = activeSource.manifestBaseUrl || resolveEditionManifestUrl(activeSource.url);
    const newSource = {
        ...activeSource,
        manifestBaseUrl,
        editionId,
        id: editionId ? `${String(activeSource.id || '').split('-edition-')[0]}-edition-${editionId}` : activeSource.id,
        name: release.name || `${activeSource.name.split(' (')[0]} (${editionId || 'edition'})`,
        url: release.url,
        type: 'archive',
    };
    markPendingCurriculumSwitcher();
    return st.loadData(newSource, true);
}

export function applyLiveSwitch() {
    const st = getArboritoStore();
    const activeSource = st.value.activeSource;
    const releases = st.value.availableReleases || [];
    const vp = getVersionPresentation(activeSource, releases);
    if (vp.isRolling) {
        return Promise.resolve(true);
    }
    const manifestBaseUrl = activeSource.manifestBaseUrl || resolveEditionManifestUrl(activeSource.url);
    const rolling = releases.find((r) => r.type === 'rolling');
    let newUrl = rolling ? rolling.url : manifestBaseUrl || activeSource.url;
    if (!rolling && activeSource.type === 'archive') {
        if (activeSource.url.includes('/releases/')) {
            newUrl = resolveEditionManifestUrl(activeSource.url);
        } else if (manifestBaseUrl) {
            newUrl = manifestBaseUrl;
        }
    }
    const newSource = {
        ...activeSource,
        manifestBaseUrl,
        editionId: null,
        id: activeSource.id.split('-edition-')[0] || activeSource.id,
        name: activeSource.name.split(' (')[0],
        url: newUrl,
        type: 'rolling',
    };
    delete newSource.localArchiveReleaseId;
    markPendingCurriculumSwitcher();
    return st.loadData(newSource, true);
}

export function applyLocalDraftSwitch() {
    const st = getArboritoStore();
    const activeSource = st.value.activeSource;
    const url = String(activeSource?.url || '');
    if (!url.startsWith('branch://')) return undefined;
    const branchId = url.slice('branch://'.length).split('/')[0];
    if (!branchId) return undefined;
    if (activeSource.type !== 'archive' && activeSource.localArchiveReleaseId == null) {
        return Promise.resolve(true);
    }
    const newSource = {
        ...activeSource,
        id: branchId,
        name: String(activeSource.name || '').split(' (')[0],
        url: `branch://${branchId}`,
        type: 'branch',
    };
    delete newSource.localArchiveReleaseId;
    delete newSource.editionId;
    markPendingCurriculumSwitcher();
    return st.loadData(newSource, true);
}
