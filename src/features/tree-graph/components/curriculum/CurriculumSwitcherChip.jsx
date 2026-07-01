import { ChromeEmoji } from '../../../../app/components/ChromeEmoji.jsx';
import { useTreeGraph } from '../../hooks/useTreeGraph.js';
import { LoadingBrandRing, LoadingRow } from '../../../../shared/ui/Loading.jsx';
import {
    curriculumTreeDisplayName,
    getVersionPresentation,
} from '../../../version-updates/api/version-switch-logic.js';
import { CURRICULUM_SWITCHER_BTN_ID } from '../../api/logic/graph-mobile-shared.js';
import { parseNostrTreeUrl } from '../../../nostr/api/nostr-refs.js';
import { resolveOpenTreeOwnerDisplay } from '../../api/tree-owner-display.js';

/** Explore-root curriculum switcher chip (JSX port of buildUnifiedCurriculumSwitcherHTML). */
export function CurriculumSwitcherChip({ rootRef }) {
    const tree = useTreeGraph();
    const { ui, graphUi, userStore } = tree;
    const src = tree.activeSource;

    if (!src) return null;

    const open = !!graphUi?.treeSwitcherOpen;
    const releases = tree.availableReleases || [];
    const vp = getVersionPresentation(src, releases, ui);
    const treeName = curriculumTreeDisplayName(ui) || (ui.sourcesActiveTreeFallback || 'Tree');
    const activeFrozen =
        src?.id &&
        !vp.isLocal &&
        typeof userStore?.isTreeFrozen === 'function' &&
        userStore.isTreeFrozen(src.id);
    const versionLine = activeFrozen
        ? ui.freezeToggleOn || ui.freezeOnHint || 'Offline copy'
        : String(vp.chipSub || '');
    const hydrating = !!tree.treeHydrating;
    const versionsOnly = !!graphUi?.curriculumSwitcherVersionsOnly;
    const btnLabel = versionsOnly
        ? ui.releasesModalTitle || ui.releasesSnapshotsChip || 'Versions'
        : ui.treeSwitcherUnifiedAria || 'Switch branch or edition';

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

    const icon = vp.icon || tree.resolvePanelTreeIcon() || '🌳';
    const localClass = vp.isLocal ? ' arborito-chip-version-line--local' : '';

    return (
        <div
            className={`arborito-curriculum-switcher-host${hydrating ? ' arborito-curriculum-switcher-host--loading' : ''}`}
        >
            <button
                type="button"
                id={CURRICULUM_SWITCHER_BTN_ID}
                className="arborito-curriculum-switcher-chip arborito-explore-curriculum-chip arborito-timeline-chip arborito-timeline-chip--btn flex items-start gap-2 rounded-2xl border-2 shadow-sm px-2.5 py-2 min-w-0 w-full text-left"
                data-arborito-version-kind={vp.versionKind || 'rolling'}
                aria-label={btnLabel}
                title={btnLabel}
                aria-expanded={open}
                aria-haspopup="dialog"
                disabled={hydrating || undefined}
                aria-busy={hydrating || undefined}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    tree.toggleCurriculumSwitcherFromChip(rootRef?.current);
                }}
            >
                <span className="arborito-switcher-chip-icon text-xl leading-none shrink-0 mt-0.5" aria-hidden="true">
                    <ChromeEmoji emoji={icon} size={22} className="arborito-emoji-glyph" />
                </span>
                <span className="min-w-0 flex-1 text-left space-y-0.5">
                    <span className="arborito-chip-tree-line arborito-switcher-chip-title line-clamp-2 break-words">
                        {treeName}
                    </span>
                    {authorLine ? (
                        <span className="arborito-switcher-chip-author line-clamp-1 break-words">{authorLine}</span>
                    ) : null}
                    <span
                        className={`arborito-chip-version-line${localClass} arborito-switcher-chip-sub line-clamp-2 break-words`}
                    >
                        {versionLine}
                    </span>
                </span>
                <span className="arborito-switcher-chip-chev shrink-0 self-center" aria-hidden="true">
                    {hydrating ? <LoadingBrandRing size="sm" /> : open ? '▲' : '▼'}
                </span>
            </button>
            {hydrating ? (
                <LoadingRow
                    label={ui.treeSwitcherChipLoading || ui.loading || 'Loading…'}
                    size="sm"
                    tone="sage"
                    extraClass="arborito-curriculum-switcher-host__loading"
                />
            ) : null}
        </div>
    );
}
