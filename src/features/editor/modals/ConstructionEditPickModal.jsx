import { useEditor } from '../hooks/useEditor.js';
import { useCallback, useEffect } from 'react';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { ModalShell } from '../../../app/components/ModalShell.jsx';
import { ModalHero } from '../../../app/components/ModalHero.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { ensureDeferredConstructionStyles } from '../../../shared/lib/lazy-stylesheet.js';
import { applyConstructionEditPick } from '../api/construction-enter-flow.js';

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
                if (result.kind === 'branch') {
                    setModal(null);
                }
            });
        },
        [setModal, finishConstructionEditPick]
    );

    const mobile = shouldShowMobileUI();
    const branches = Array.isArray(modal?.branches) ? modal.branches : [];

    const title = ui.constructionEnterPickTitle || 'What do you want to edit?';
    const treeLbl = ui.constructionEnterPickTree || 'Tree (playlist)';
    const treeHint = ui.constructionEnterPickTreeHint || 'Opens Library → Trees tab';
    const branchSection = ui.constructionEnterPickBranches || 'Edit lessons in a branch';

    useEffect(() => {
        ensureDeferredConstructionStyles();
    }, []);

    return (
        <div data-arborito-panel="modal-construction-edit-pick">
            <ModalShell
            mobile={mobile}
            layout={mobile ? 'dock' : 'top-anchored'}
            panelSize="compact auto-h"
            onBackdropClick={() => finishPick(null)}
            shellOpts={{
                scrim: 'translucent',
                panelClass: mobile
                    ? 'flex flex-col min-h-0'
                    : 'animate-in zoom-in-95 duration-200 max-h-[min(90vh,640px)]',
            }}
        >
            <ModalHero
                ui={ui}
                mobile={mobile}
                title={title}
                leadingIcon={<span className="text-2xl shrink-0 leading-none" aria-hidden="true">🏗️</span>}
                tagClass="btn-construction-pick-close"
                extraWrapClassDesktop="border-b border-slate-100 dark:border-slate-800"
                onClose={() => finishPick(null)}
            />
            <div className="arborito-construction-pick-body px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:px-6 md:pb-6 flex flex-col gap-4 min-h-0">
                <button
                    type="button"
                    className="arborito-construction-pick-card w-full text-left"
                    onClick={() => finishPick({ kind: 'tree' })}
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
                    <div className="flex flex-col gap-2 min-h-0">
                        <p className="arborito-menu-section m-0">{branchSection}</p>
                        <div className="arborito-construction-pick-list flex flex-col gap-1.5 max-h-[min(42vh,280px)] overflow-y-auto overscroll-contain">
                            {branches.map((b) => (
                                <button
                                    key={b.id}
                                    type="button"
                                    className="arborito-construction-pick-row"
                                    onClick={() => finishPick({ kind: 'branch', refId: String(b.id) })}
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
                ) : null}
            </div>
        </ModalShell>
        </div>
    );
}
