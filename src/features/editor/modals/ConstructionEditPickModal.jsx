import { useEditor } from '../hooks/useEditor.js';
import { useCallback, useEffect } from 'react';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { DockModalShell, ModalCenteredShell } from '../../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { ensureDeferredConstructionStyles } from '../../../shared/lib/lazy-stylesheet.js';
import { applyConstructionEditPick } from '../api/construction-enter-flow.js';
import { CONSTRUCTION_EDIT_PICK_SHELL } from '../api/construction-hub-chrome.js';

function ConstructionEditPickBody({ branches, treeLbl, treeHint, branchSection, emptyHint, onPick }) {
    return (
        <div className="arborito-construction-pick-body flex flex-col gap-4 min-h-0 flex-1">
            <button
                type="button"
                className="arborito-construction-pick-card w-full text-left"
                onClick={() => onPick({ kind: 'tree' })}
            >
                <span className="arborito-construction-pick-card__ic" aria-hidden="true">
                    <ChromeEmoji emoji="🌳" size={24} />
                </span>
                <span className="arborito-construction-pick-card__main">
                    <span className="arborito-construction-pick-card__title">{treeLbl}</span>
                    <span className="arborito-construction-pick-card__hint">{treeHint}</span>
                </span>
                <span className="arborito-construction-pick-card__chev" aria-hidden="true">›</span>
            </button>
            {branches.length > 0 ? (
                <div className="flex flex-col gap-2 min-h-0 flex-1">
                    <p className="arborito-menu-section m-0">{branchSection}</p>
                    <div className="arborito-construction-pick-list flex flex-col gap-1.5 flex-1 min-h-0 max-h-[min(42vh,280px)] overflow-y-auto overscroll-contain">
                        {branches.map((b) => (
                            <button
                                key={b.id}
                                type="button"
                                className="arborito-construction-pick-row"
                                onClick={() => onPick({ kind: 'branch', refId: String(b.id) })}
                            >
                                <span className="arborito-construction-pick-row__ic" aria-hidden="true">
                                    <ChromeEmoji emoji="🌿" size={20} />
                                </span>
                                <span className="arborito-construction-pick-row__label">{String(b.label || b.id)}</span>
                                <span className="arborito-construction-pick-row__chev" aria-hidden="true">›</span>
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <p className="arborito-muted m-0">{emptyHint}</p>
            )}
        </div>
    );
}

export function ModalConstructionEditPick() {
    const { ui, setModal, modal, editorActions } = useEditor();
    const { finishConstructionEditPick } = editorActions;

    const finishPick = useCallback(
        (result) => {
            finishConstructionEditPick(result);
            if (result == null) {
                setModal(null);
                return;
            }
            void applyConstructionEditPick(result).then(() => {
                /* Tree pick opens Sources; do not clear that modal. */
                if (result.kind === 'branch') setModal(null);
            });
        },
        [setModal, finishConstructionEditPick]
    );

    const mobile = shouldShowMobileUI();
    const branches = Array.isArray(modal?.branches) ? modal.branches : [];

    const title = ui.constructionEnterPickTitle || 'What do you want to edit?';
    const treeLbl = ui.constructionEnterPickTree || 'Tree (playlist)';
    const treeHint = ui.constructionEnterPickTreeHint || 'Opens Forest → Trees';
    const branchSection = ui.constructionEnterPickBranches || 'Edit lessons in a branch';
    const emptyHint =
        ui.constructionEnterPickEmpty ||
        ui.constructionEnterBranchToEdit ||
        'Add branches to this tree in Forest → Trees, then come back.';

    useEffect(() => {
        ensureDeferredConstructionStyles();
    }, []);

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={title}
            leadingIcon="🏗️"
            tagClass="btn-construction-pick-close"
            onBack={() => finishPick(null)}
            showBack={mobile}
            onClose={() => finishPick(null)}
        />
    );

    const body = (
        <ConstructionEditPickBody
            branches={branches}
            treeLbl={treeLbl}
            treeHint={treeHint}
            branchSection={branchSection}
            emptyHint={emptyHint}
            onPick={finishPick}
        />
    );

    if (mobile) {
        const shell = CONSTRUCTION_EDIT_PICK_SHELL;
        return (
            <div data-arborito-panel="modal-construction-edit-pick">
                <DockModalShell
                    mobile
                    layout={shell.shellOpts.layout}
                    sizeTier={shell.sizeTier}
                    panelClass={shell.panelClass}
                    skipBodyWrap
                    useDockChrome
                    shellOpts={shell.shellOpts}
                    onBackdropClick={() => finishPick(null)}
                    hero={hero}
                >
                    {body}
                </DockModalShell>
            </div>
        );
    }

    return (
        <div data-arborito-panel="modal-construction-edit-pick">
            <ModalCenteredShell
                mobile={false}
                layout="centered"
                sizeTier="COMPACT"
                skipBodyWrap
                onBackdropClick={() => finishPick(null)}
                shellOpts={{ scrim: 'translucent', enter: 'fade-fast' }}
                hero={hero}
            >
                <div className="px-4 pt-3 pb-6 md:px-6 flex flex-col min-h-0">{body}</div>
            </ModalCenteredShell>
        </div>
    );
}
