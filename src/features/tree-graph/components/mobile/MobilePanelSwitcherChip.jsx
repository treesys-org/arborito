import { useTreeGraph } from '../../hooks/useTreeGraph.js';
import { CatalogRowEmoji } from '../../../sources/modals/components/CatalogRowEmoji.jsx';
import { parseNostrTreeUrl } from '../../../nostr/api/nostr-refs.js';
import {
    curriculumTreeDisplayName,
    getVersionPresentation,
    panelShowsBranchVersionChip,
    resolveActiveSourceVersionLabel,
} from '../../../version-updates/api/version-switch-logic.js';
import { resolveBranchPanelIcon } from '../../api/logic/graph-mobile-panel-helpers.js';
import {
    resolveBranchCatalogIcon,
    resolveComposedTreeCatalogIcon,
} from '../../../sources/api/branch-catalog-icon.js';
import { resolveActiveBranchId } from '../../../sources/api/modals/logic/sources-helpers.js';
import { resolveActiveComposedTreeId } from '../../api/logic/curriculum-switcher-list.js';

function resolvePanelVersionLabel(ui, current, tree) {
    const branchId = current?._composedBranchId ? String(current._composedBranchId) : '';
    return resolveActiveSourceVersionLabel(ui, tree, branchId ? { branchId } : {});
}

function isBranchSwitcherChip(current) {
    return current?.type === 'branch' && !current?._composedVirtualRoot;
}

/** Catalog emoji for the open course/playlist at curriculum root; folder glyph deeper in. */
function resolveSwitcherChipEmoji(current, tree) {
    if (isBranchSwitcherChip(current)) {
        return resolveBranchPanelIcon(current);
    }
    if (current?.type === 'root' || current?._composedVirtualRoot) {
        const src = tree?.activeSource;
        const userStore = tree?.userStore;
        if (src?.type === 'composed-tree' || current?._composedVirtualRoot) {
            const id = resolveActiveComposedTreeId(src);
            const entry = (userStore?.state?.trees || []).find((t) => String(t?.id || '') === id);
            if (entry) return resolveComposedTreeCatalogIcon(entry);
        }
        const branchId = resolveActiveBranchId(src);
        if (branchId) {
            const entry = (userStore?.state?.branches || []).find((b) => String(b?.id || '') === branchId);
            if (entry) return resolveBranchCatalogIcon(entry);
        }
        return tree?.resolvePanelTreeIcon?.() || '';
    }
    return '';
}

function PanelSwitcherIcon({ current, skipIcon, tree, playlist }) {
    if (skipIcon) return null;
    const ic = resolveSwitcherChipEmoji(current, tree);
    if (!ic) return null;
    return (
        <span
            className={`arborito-switcher-chip-icon${playlist ? ' arborito-switcher-chip-icon--playlist' : ''} text-xl leading-none shrink-0 mt-0.5`}
            aria-hidden="true"
        >
            <CatalogRowEmoji emoji={ic} size={24} />
        </span>
    );
}

function PanelSwitcherChipInner({
    ui,
    current,
    activeSource,
    availableReleases,
    userStore,
    tree,
    intent = 'version',
}) {
    const src = activeSource;
    const releases = availableReleases || [];
    const vp = getVersionPresentation(src, releases, ui);
    const shareKind = src?.type === 'composed-tree' ? 'composed-tree' : 'branch';
    const isPlaylist = shareKind === 'composed-tree';
    const treeName = curriculumTreeDisplayName(ui) || String(src?.name || '').trim();
    const folderName = current?.type === 'root' ? '' : String(current?.name || '').trim();
    const activeFrozen =
        src?.id &&
        !vp.isLocal &&
        typeof userStore?.isTreeFrozen === 'function' &&
        userStore.isTreeFrozen(src.id);
    const versionLineRaw = activeFrozen
        ? ui.freezeToggleOn || ui.freezeOnHint || 'Offline copy'
        : isPlaylist
          ? ''
          : String(resolvePanelVersionLabel(ui, current, tree) || vp.chipSub || '').trim();
    const versionLine =
        versionLineRaw ||
        (vp.isLocal
            ? ui.releasesVersionScopeLocal || ui.sourcesPillBranch || 'On this device'
            : ui.releasesStateLiveShort || ui.releasesStateLive || 'Latest');
    const isBranch = current?.type === 'branch' && !!folderName;
    const titleLine =
        (isBranch ? folderName : treeName || folderName || ui.navHome || 'Tree') ||
        ui.navHome ||
        'Tree';
    const treeContextLine = isBranch && treeName && treeName !== folderName ? treeName : '';
    const kindLine =
        intent === 'explore'
            ? isPlaylist
                ? ui.sourcesPillComposedTree || 'Playlist'
                : ui.sourcesPillBranch || 'Course'
            : '';
    let authorLine = '';
    if (!vp.isLocal && src?.url) {
        try {
            const treeRef = parseNostrTreeUrl(String(src.url || ''));
            const owner = tree.resolveOpenTreeOwnerDisplay?.(treeRef?.pub);
            if (owner?.label) {
                authorLine = `${ui.sourcesGlobalBy || 'by'} ${owner.label}`;
            }
        } catch {
            authorLine = '';
        }
    }
    const localClass = vp.isLocal ? ' arborito-chip-version-line--local' : '';
    /* Playlist chip: kind only — do not dump member course names (ugly + noisy). */
    const metaLine = isPlaylist
        ? kindLine ||
          (vp.isLocal
              ? ui.releasesVersionScopeLocal || 'On this device'
              : ui.releasesStateLiveShort || ui.releasesStateLive || 'Latest')
        : kindLine
          ? `${kindLine} · ${versionLine}`
          : versionLine;

    return (
        <>
            <span className="arborito-branch-panel-version-chip__copy min-w-0 flex-1 text-left space-y-0.5">
                <span className="arborito-chip-tree-line arborito-switcher-chip-title line-clamp-2 break-words">
                    {titleLine}
                </span>
                {treeContextLine ? (
                    <span className="arborito-switcher-chip-author line-clamp-1 break-words">{treeContextLine}</span>
                ) : null}
                {authorLine ? (
                    <span className="arborito-switcher-chip-author line-clamp-1 break-words">{authorLine}</span>
                ) : null}
                {metaLine ? (
                    <span className={`arborito-chip-version-line${localClass} arborito-switcher-chip-sub line-clamp-2 break-words`}>
                        {metaLine}
                    </span>
                ) : null}
            </span>
            <span className="arborito-switcher-chip-chev" aria-hidden="true">
                ▾
            </span>
        </>
    );
}

/** Unit-layout curriculum / version chip for mobile panel heads. */
export function MobilePanelSwitcherChip({ current, ui: uiProp, intent = 'version', skipIcon = false }) {
    const tree = useTreeGraph();
    const ui = uiProp ?? tree.ui;
    const { activeSource, availableReleases, userStore } = tree;
    const src = activeSource;
    const releases = availableReleases || [];
    const vp = getVersionPresentation(src, releases, ui);
    const treeName = curriculumTreeDisplayName(ui) || String(current?.name || '').trim();
    const ver = resolvePanelVersionLabel(ui, current, tree);
    const openLbl =
        intent === 'explore'
            ? ui.treeSwitcherExploreAria ||
              ui.treeSwitcherExploreHint ||
              ui.treeSwitcherUnifiedAria ||
              ui.treeSwitcherTitleShort ||
              'Switch course or playlist'
            : `${treeName}${ver ? `, ${ver}` : ''}. ${ui.treeSwitcherTapHint || 'Change'}`;
    const branchChip = isBranchSwitcherChip(current);
    const isPlaylistSource =
        src?.type === 'composed-tree' || !!current?._composedVirtualRoot;
    /* Playlist → brown shell (cta-brown); course root / branch folder → emerald. */
    const kindClass = isPlaylistSource
        ? ' arborito-playlist-curriculum-chip'
        : branchChip
          ? ' arborito-branch-curriculum-chip'
          : intent === 'explore'
            ? ' arborito-explore-curriculum-chip'
            : '';
    const chipClass = `arborito-branch-panel-version-chip arborito-branch-panel-version-chip--unit arborito-timeline-chip arborito-timeline-chip--btn w-full min-w-0${kindClass}`;

    const onChipClick = (e) => {
        if (intent === 'explore') {
            tree.openExploreCurriculumSwitcher(e);
        } else {
            tree.openBranchVersionSwitcher(e);
        }
    };

    return (
        <div className="mobile-panel-branch-version flex-1 min-w-0">
            <button
                type="button"
                className={chipClass}
                data-arborito-version-kind={vp.versionKind || 'rolling'}
                data-arborito-catalog-kind={isPlaylistSource ? 'composed-tree' : 'branch'}
                aria-label={openLbl}
                title={openLbl}
                aria-haspopup="dialog"
                onClick={onChipClick}
            >
                <PanelSwitcherIcon
                    current={current}
                    skipIcon={skipIcon}
                    tree={tree}
                    playlist={isPlaylistSource}
                />
                <PanelSwitcherChipInner
                    ui={ui}
                    current={current}
                    activeSource={activeSource}
                    availableReleases={availableReleases}
                    userStore={userStore}
                    tree={tree}
                    intent={intent}
                />
            </button>
        </div>
    );
}

/** Card-layout version chip (non-stacked panel title). */
export function MobilePanelVersionCardChip({ current, ui: uiProp }) {
    const tree = useTreeGraph();
    const ui = uiProp ?? tree.ui;
    if (!panelShowsBranchVersionChip(current)) return null;
    const name =
        current.type === 'root'
            ? curriculumTreeDisplayName(ui) || String(current.name || '').trim()
            : String(current.name || '').trim();
    const ver = resolvePanelVersionLabel(ui, current, tree);
    const verLbl = ui.releasesVersionUiTitle || ui.releasesStateVersion || 'Version';
    const snapLbl = ui.releasesSnapshotsChip || ui.releasesSnapshot || 'Snapshots';
    const badge = ver || snapLbl;
    const aria = ver ? `${name}, ${verLbl}: ${ver}` : `${name}, ${snapLbl}`;

    return (
        <div className="mobile-panel-branch-version flex-1 min-w-0">
            <button
                type="button"
                className="arborito-branch-panel-version-chip"
                aria-label={aria}
                title={aria}
                aria-haspopup="dialog"
                onClick={(e) => tree.openBranchVersionSwitcher(e)}
            >
                <span className="arborito-branch-panel-version-chip__name" title={name}>
                    {name}
                </span>
                <span className="arborito-branch-panel-version-chip__ver">{badge}</span>
                <span className="arborito-branch-panel-version-chip__chev" aria-hidden="true">
                    ▾
                </span>
            </button>
        </div>
    );
}

export { panelShowsBranchVersionChip };
