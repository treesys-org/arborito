import { useEffect } from 'react';
import { useTreeGraph } from '../../hooks/useTreeGraph.js';
import { createPortal } from 'react-dom';
import { getArboritoStore } from '../../../../core/store-singleton.js';
import { schedulePersistTreeUiState } from '../../api/tree-ui-persist.js';
import { NodeEmojiPickerGrid } from '../shared/NodeEmojiPickerGrid.jsx';
import { ModalCenteredShell } from '../../../../app/components/ModalShell.jsx';
import { shouldShowMobileUI } from '../../../../shared/ui/breakpoints.js';
import { clearConstructionUI } from '../../api/logic/construction-ui-bridge.js';
import { MODAL_CTA_CANCEL, modalCtaConfirm } from '../../../../shared/ui/modal-action-chrome.js';
import { ModalBinaryFooter } from '../../../../shared/ui/ModalBinaryFooter.jsx';

function ConstructionEmojiPicker({ state }) {
    const tree = useTreeGraph();
    const { ui, findNode } = tree;

    useEffect(() => {
        let cancelled = false;
        let timer;
        const onDoc = (ev) => {
            if (ev.target?.closest?.('.mobile-construction-emoji-pop')) return;
            clearConstructionUI();
        };
        timer = setTimeout(() => {
            if (!cancelled) document.addEventListener('click', onDoc, true);
        }, 0);
        return () => {
            cancelled = true;
            clearTimeout(timer);
            document.removeEventListener('click', onDoc, true);
        };
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
            <NodeEmojiPickerGrid
                ui={ui}
                onPick={async (emoji) => {
                    clearConstructionUI();
                    const node = findNode(state.nodeId);
                    if (!node) return;
                    await tree.applyGraphConstructionNodeIcon(node, emoji);
                    tree.bumpGraphUiRevision();
                    schedulePersistTreeUiState(getArboritoStore());
                }}
            />
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
            layout={mobile ? 'bottom-sheet' : 'centered'}
            sizeTier="COMPACT"
            onBackdropClick={() => clearConstructionUI()}
            shellOpts={{
                z: 85,
                scrim: 'translucent',
                backdropId: 'arborito-construction-rename-backdrop',
                panelClass: mobile
                    ? 'w-full rounded-t-2xl border-t border-slate-200 dark:border-slate-700 pb-[max(1rem,env(safe-area-inset-bottom))]'
                    : undefined,
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
                    if (!node) {
                        clearConstructionUI();
                        return;
                    }
                    const ok = await tree.renameGraphNodeFromConstruction(node, name);
                    if (!ok) {
                        const ui = tree.ui || {};
                        const trimmed = String(name || '').trim();
                        getArboritoStore()?.notify?.(
                            !trimmed
                                ? ui.graphRenameEmpty || 'Enter a name to rename.'
                                : ui.nodePropertiesSaveError ||
                                      ui.graphErrorWithMessage?.replace('{message}', 'Rename failed.') ||
                                      'Could not rename this item.',
                            true
                        );
                        return;
                    }
                    tree.bumpGraphUiRevision();
                    schedulePersistTreeUiState(getArboritoStore());
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
                <ModalBinaryFooter footerVariant="" className="mt-1">
                    <div className="arborito-action-row w-full">
                        <button
                            type="button"
                            className={MODAL_CTA_CANCEL}
                            onClick={() => clearConstructionUI()}
                        >
                            {ui.cancel || 'Cancel'}
                        </button>
                        <button type="submit" className={modalCtaConfirm('indigo')}>
                            {ui.save || 'Save'}
                        </button>
                    </div>
                </ModalBinaryFooter>
            </form>
        </ModalCenteredShell>,
        document.body
    );
}

/** React overlays for construction popovers (emoji, rename). */
export function GraphConstructionLayer() {
    const tree = useTreeGraph();
    const overlay = tree.graphUi?.constructionOverlay;
    if (!overlay) return null;

    if (overlay.type === 'emoji') return <ConstructionEmojiPicker state={overlay} />;
    if (overlay.type === 'rename') return <MobileRenameSheet state={overlay} />;
    return null;
}
