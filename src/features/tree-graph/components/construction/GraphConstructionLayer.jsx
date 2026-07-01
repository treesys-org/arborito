import { useEffect, useState } from 'react';
import { useTreeGraph } from '../../hooks/useTreeGraph.js';
import { createPortal } from 'react-dom';
import { schedulePersistTreeUiState } from '../../api/tree-ui-persist.js';
import { NODE_PROPERTY_EMOJIS } from '../../api/node-property-emojis.js';
import { ChromeEmoji } from '../../../../app/components/ChromeEmoji.jsx';
import { ModalCenteredShell } from '../../../../app/components/ModalShell.jsx';
import { shouldShowMobileUI } from '../../../../shared/ui/breakpoints.js';
import {
    filterPickerCandidates,
    pickerCandidatesNotInActiveTree,
} from '../../api/logic/construction-panel-tools.js';
import { clearConstructionUI } from '../../api/logic/construction-ui-bridge.js';

function ConstructionEmojiPicker({ state }) {
    const tree = useTreeGraph();
    const { ui, findNode } = tree;

    useEffect(() => {
        const onDoc = (ev) => {
            if (ev.target?.closest?.('.mobile-construction-emoji-pop')) return;
            clearConstructionUI();
        };
        setTimeout(() => document.addEventListener('click', onDoc, true), 0);
        return () => document.removeEventListener('click', onDoc, true);
    }, []);

    if (!state?.rect) return null;

    const { top, left, width } = state.rect;
    const style = {
        position: 'fixed',
        left: Math.max(8, left + width / 2 - 110),
        top: top + state.rect.height + 8,
        zIndex: 140,
    };

    return createPortal(
        <div className="mobile-construction-emoji-pop" style={style} role="listbox">
            <div className="mobile-construction-emoji-pop__grid">
                {NODE_PROPERTY_EMOJIS.map((emoji) => (
                    <button
                        key={emoji}
                        type="button"
                        className="mobile-construction-emoji-pop__btn"
                        aria-label={`${ui.lessonTocEmojiPlaceholder || 'Emoji'} ${emoji}`}
                        onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            clearConstructionUI();
                            const node = findNode(state.nodeId);
                            if (!node) return;
                            await tree.applyGraphConstructionNodeIcon(node, emoji);
                            tree.bumpGraphUiRevision();
                            schedulePersistTreeUiState(tree);
                        }}
                    >
                        <ChromeEmoji emoji={emoji} size={18} className="arborito-emoji-glyph" />
                    </button>
                ))}
            </div>
        </div>,
        document.body
    );
}

function ComposedAddBranchPopover({ state }) {
    const tree = useTreeGraph();
    const { ui, userStore, setModal } = tree;
    const [query, setQuery] = useState('');
    void userStore?.ensureBranchesHydrated?.();

    useEffect(() => {
        clearConstructionUI();
        const onDoc = (ev) => {
            if (ev.target?.closest?.('.arborito-composed-add-popover')) return;
            clearConstructionUI();
        };
        setTimeout(() => document.addEventListener('click', onDoc, true), 0);
        return () => document.removeEventListener('click', onDoc, true);
    }, []);

    if (!state?.rect) return null;

    const candidates = filterPickerCandidates(pickerCandidatesNotInActiveTree(), query).slice(0, 24);
    const localPill = ui.sourcesPillBranch || ui.graphComposedTreeAddLocalPill || 'Local';
    const installedPill = ui.sourcesPillInstalled || ui.graphComposedTreeAddInstalledPill || 'Installed';

    const style = {
        position: 'fixed',
        left: Math.max(8, state.rect.left + state.rect.width / 2 - 160),
        top: state.rect.bottom + 8,
        width: Math.min(320, window.innerWidth - 16),
        zIndex: 140,
    };

    const pickBranch = async (c) => {
        clearConstructionUI();
        if (c.kind === 'installed') {
            await tree.addInstalledBranchToActiveComposedTree(c.id);
        } else {
            await tree.addBranchToActiveComposedTree(c.id);
        }
        tree.bumpGraphUiRevision();
    };

    return createPortal(
        <div className="arborito-composed-add-popover" style={style} role="dialog" aria-label={ui.graphFabAddComposedBranch || 'Add branch'}>
            <div className="arborito-composed-add-popover__head">
                <p className="arborito-composed-add-popover__title">{ui.graphFabAddComposedBranch || 'Add branch'}</p>
                <button type="button" className="arborito-composed-add-popover__close" aria-label={ui.close || 'Close'} onClick={() => clearConstructionUI()}>
                    ×
                </button>
            </div>
            <input
                type="search"
                className="arborito-composed-add-popover__search arborito-input"
                autoComplete="off"
                placeholder={ui.sourcesTreeEditorSearchPh || ui.graphComposedTreeAddSearchPh || 'Search branches…'}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
            />
            <div className="arborito-composed-add-popover__list custom-scrollbar">
                {!candidates.length ? (
                    <p className="arborito-composed-add-empty">
                        {query
                            ? ui.graphComposedTreeAddEmptySearch || ui.treeSwitcherEmpty || 'No matches.'
                            : ui.graphComposedTreeAddEmptyCatalog || ui.sourcesTreeEditorNoMore || 'No more branches available.'}
                    </p>
                ) : (
                    candidates.map((c) => (
                        <button
                            key={c.addKey}
                            type="button"
                            className="arborito-composed-add-row"
                            onClick={() => pickBranch(c)}
                        >
                            <span className="arborito-composed-add-row__icon" aria-hidden="true">
                                <ChromeEmoji emoji={c.kind === 'installed' ? '🌐' : '🌿'} size={18} className="arborito-emoji-glyph" />
                            </span>
                            <span className="arborito-composed-add-row__body">
                                <span className="arborito-composed-add-row__name">{c.name || c.id}</span>
                                <span className={`arborito-composed-add-row__pill arborito-composed-add-row__pill--${c.kind === 'installed' ? 'installed' : 'local'}`}>
                                    {c.kind === 'installed' ? installedPill : localPill}
                                </span>
                            </span>
                        </button>
                    ))
                )}
            </div>
            <div className="arborito-composed-add-popover__foot">
                <button
                    type="button"
                    className="arborito-composed-add-popover__more"
                    onClick={() => {
                        clearConstructionUI();
                        setModal({ type: 'sources', focusTab: 'branches' });
                    }}
                >
                    {ui.graphComposedTreeAddMoreBranches || ui.treeSwitcherMoreTrees || 'Get more branches'}
                </button>
            </div>
        </div>,
        document.body
    );
}

function MobileRenameSheet({ state }) {
    const tree = useTreeGraph();
    const { ui, findNode } = tree;
    const label = ui.graphEdit || ui.graphRename || 'Rename';
    const mobile = shouldShowMobileUI();

    return createPortal(
        <ModalCenteredShell
            mobile={mobile}
            layout="bottom-sheet"
            sizeTier="CONTENT"
            onBackdropClick={() => clearConstructionUI()}
            shellOpts={{
                z: 85,
                scrim: 'translucent',
                backdropId: 'arborito-construction-rename-backdrop',
                panelClass: 'w-full rounded-t-2xl border-t border-slate-200 dark:border-slate-700 pb-[max(1rem,env(safe-area-inset-bottom))]',
            }}
        >
            <form
                className="p-4"
                role="dialog"
                aria-label={label}
                onSubmit={async (e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const name = String(fd.get('name') || '');
                    const node = findNode(state.nodeId);
                    if (node) {
                        await tree.renameGraphNodeFromConstruction(node, name);
                        tree.bumpGraphUiRevision();
                        schedulePersistTreeUiState(tree);
                    }
                    clearConstructionUI();
                }}
            >
                <p className="arborito-eyebrow arborito-eyebrow--sm m-0 mb-2">{label}</p>
                <input
                    type="text"
                    name="name"
                    className="arborito-mobile-rename-sheet__input arborito-input text-base mb-3"
                    defaultValue={state.initialName || ''}
                    autoFocus
                />
                <div className="flex gap-2 justify-end">
                    <button
                        type="button"
                        className="arborito-mobile-rename-sheet__cancel px-4 py-2.5 rounded-xl font-bold text-sm text-slate-600 dark:text-slate-300"
                        onClick={() => clearConstructionUI()}
                    >
                        {ui.cancel || 'Cancel'}
                    </button>
                    <button type="submit" className="arborito-mobile-rename-sheet__save px-5 py-2.5 rounded-xl font-bold text-sm arborito-cta-indigo">
                        {ui.save || 'Save'}
                    </button>
                </div>
            </form>
        </ModalCenteredShell>,
        document.body
    );
}

/** React overlays for construction popovers (emoji, add branch, rename). */
export function GraphConstructionLayer() {
    const tree = useTreeGraph();
    const overlay = tree.graphUi?.constructionOverlay;
    if (!overlay) return null;

    if (overlay.type === 'emoji') return <ConstructionEmojiPicker state={overlay} />;
    if (overlay.type === 'composed-add') return <ComposedAddBranchPopover state={overlay} />;
    if (overlay.type === 'rename') return <MobileRenameSheet state={overlay} />;
    return null;
}
