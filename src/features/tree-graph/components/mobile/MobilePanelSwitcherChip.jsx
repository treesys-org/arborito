import { fileSystem } from '../../../backup-export/api/filesystem.js';
import { useTreeGraph } from '../../hooks/useTreeGraph.js';
import { ChromeEmoji } from '../../../../app/components/ChromeEmoji.jsx';
import { parseNostrTreeUrl } from '../../../nostr/api/nostr-refs.js';
import {
    curriculumTreeDisplayName,
    getVersionPresentation,
    panelShowsBranchVersionChip,
    resolveActiveSourceVersionLabel,
} from '../../../version-updates/api/version-switch-logic.js';
import { resolveOpenTreeOwnerDisplay } from '../../api/tree-owner-display.js';
import { resolveBranchPanelIcon } from '../../api/logic/graph-mobile-panel-helpers.js';

function resolvePanelVersionLabel(ui, current, tree) {
    const branchId = current?._composedBranchId ? String(current._composedBranchId) : '';
    return resolveActiveSourceVersionLabel(ui, tree, branchId ? { branchId } : {});
}

function isBranchSwitcherChip(current) {
    return current?.type === 'branch' && !current?._composedVirtualRoot;
}

function PanelSwitcherIcon({ current, skipIcon, resolvePanelTreeIcon }) {
    if (skipIcon) return null;
    if (isBranchSwitcherChip(current)) {
        const ic = resolveBranchPanelIcon(current);
        return (
            <span className="arborito-switcher-chip-icon text-xl leading-none shrink-0 mt-0.5" aria-hidden="true">
                <ChromeEmoji emoji={ic} className="arborito-emoji-glyph" />
            </span>
        );
    }
    if (current?.type === 'root' || current?._composedVirtualRoot) {
        const ic = resolvePanelTreeIcon();
        return (
            <span className="arborito-switcher-chip-icon text-xl leading-none shrink-0 mt-0.5" aria-hidden="true">
                <ChromeEmoji emoji={ic} className="arborito-emoji-glyph" />
            </span>
        );
    }
    return null;
}

function PanelSwitcherChipInner({ ui, current, activeSource, availableReleases, userStore, tree }) {
    const src = activeSource;
    const releases = availableReleases || [];
    const vp = getVersionPresentation(src, releases, ui);
    const treeName = curriculumTreeDisplayName(ui) || String(src?.name || '').trim();
    const folderName = current?.type === 'root' ? '' : String(current?.name || '').trim();
    const activeFrozen =
        src?.id &&
        !vp.isLocal &&
        typeof userStore?.isTreeFrozen === 'function' &&
        userStore.isTreeFrozen(src.id);
    const versionLine = activeFrozen
        ? ui.freezeToggleOn || ui.freezeOnHint || 'Offline copy'
        : String(vp.chipSub || resolvePanelVersionLabel(ui, current, tree) || '').trim();
    const isBranch = current?.type === 'branch' && !!folderName;
    const titleLine = isBranch ? folderName : treeName || folderName || ui.navHome || 'Tree';
    const treeContextLine = isBranch && treeName && treeName !== folderName ? treeName : '';
    let authorLine = '';
    if (!vp.isLocal && src?.url) {
        try {
            const treeRef = parseNostrTreeUrl(String(src.url || ''));
            const owner = resolveOpenTreeOwnerDisplay(tree, treeRef?.pub);
            if (owner?.label) {
                authorLine = `${ui.sourcesGlobalBy || 'by'} ${owner.label}`;
            }
        } catch {
            authorLine = '';
        }
    }
    const localClass = vp.isLocal ? ' arborito-chip-version-line--local' : '';

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
                <span className={`arborito-chip-version-line${localClass} arborito-switcher-chip-sub line-clamp-2 break-words`}>
                    {versionLine}
                </span>
            </span>
            <span className="arborito-switcher-chip-chev shrink-0 self-center" aria-hidden="true">
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
              ui.treeSwitcherUnifiedAria ||
              ui.treeSwitcherUnifiedTitle ||
              ui.treeSwitcherTitleShort ||
              'Switch tree or branch'
            : `${treeName}${ver ? ` — ${ver}` : ''}`;
    const branchChip = isBranchSwitcherChip(current);
    const kindClass = branchChip
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
                aria-label={openLbl}
                title={openLbl}
                aria-haspopup="dialog"
                onClick={onChipClick}
            >
                <PanelSwitcherIcon current={current} skipIcon={skipIcon} resolvePanelTreeIcon={tree.resolvePanelTreeIcon} />
                <PanelSwitcherChipInner
                    ui={ui}
                    current={current}
                    activeSource={activeSource}
                    availableReleases={availableReleases}
                    userStore={userStore}
                    tree={tree}
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
    const aria = ver ? `${name} — ${verLbl}: ${ver}` : `${name} — ${snapLbl}`;

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

/** Tree library chip for composed virtual root in construction. */
export function MobilePanelTreeLibraryChip({ current, ui: uiProp }) {
    const tree = useTreeGraph();
    const ui = uiProp ?? tree.ui;
    const { userStore } = tree;
    const treeId = fileSystem.composedTreeId();
    const entry = treeId ? userStore?.getTree?.(treeId) : null;
    const displayName = String(entry?.name || current?.name || curriculumTreeDisplayName(ui) || '').trim();
    const openLbl = ui.conRevertTooltip || ui.conRevertTitle || ui.emptyModuleOpenSources || 'Open in library';
    const badgeLbl = ui.treeSwitcherSectionTrees || ui.constructionEnterPickTree || 'Trees';
    const aria = `${displayName} — ${badgeLbl}`;

    return (
        <div className="mobile-panel-branch-version mobile-panel-tree-open-wrap flex-1 min-w-0">
            <button
                type="button"
                className="arborito-branch-panel-version-chip arborito-panel-tree-chip mobile-panel-tree-open"
                aria-label={aria}
                title={openLbl}
                aria-haspopup="dialog"
                onClick={tree.openTreeLibraryFromPanel}
            >
                <span className="arborito-panel-tree-chip__ic" aria-hidden="true">
                    <ChromeEmoji emoji="🌳" size={18} />
                </span>
                <span className="arborito-branch-panel-version-chip__name" title={displayName}>
                    {displayName}
                </span>
                <span className="arborito-branch-panel-version-chip__ver">{badgeLbl}</span>
                <span className="arborito-branch-panel-version-chip__chev" aria-hidden="true">
                    ▾
                </span>
            </button>
        </div>
    );
}

export { panelShowsBranchVersionChip };
