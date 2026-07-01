import { useConstructionAbout } from '../hooks/useConstructionAbout.js';
import { ModalShell } from '../../../app/components/ModalShell.jsx';
import { ModalHero } from '../../../app/components/ModalHero.jsx';
import { TreePresentation } from '../../tree-graph/components/TreePresentation.jsx';
import { PublishDiffPanel } from '../../publishing/modals/PublishDiffPanel.jsx';
import { BranchPublishFooter } from '../../publishing/modals/BranchPublishFooter.jsx';

/** Branch metadata + optional change diff + publish — single scroll in construction. */
export function ModalConstructionAbout() {
    const {
        ui,
        modal,
        activeSource,
        rawGraphData,
        userStore,
        publishTreePublicInteractive,
        validatePublicationMetadata,
        notify,
        formRef,
        mobile,
        title,
        instantOpen,
        close,
        flushMetadata,
    } = useConstructionAbout();

    return (
        <div data-arborito-panel="modal-construction-about">
            <ModalShell
                mobile={mobile}
                layout={mobile ? 'dock' : 'top-anchored'}
                panelSize={mobile ? 'compact auto-h' : 'standard auto-h'}
                onBackdropClick={close}
                shellOpts={{
                    scrim: mobile ? 'translucent' : 'translucent-strong',
                    z: 220,
                    instantOpen,
                    panelClass: mobile
                        ? 'flex flex-col min-h-0 max-h-[min(88dvh,calc(100dvh-var(--arborito-chrome-dock-gap,4.25rem)-1rem))]'
                        : 'animate-in zoom-in-95 duration-200 max-h-[min(90vh,640px)] flex flex-col min-h-0',
                }}
            >
                <ModalHero
                    ui={ui}
                    mobile={mobile}
                    title={title}
                    titleTruncate
                    tagClass="btn-construction-about-close"
                    extraWrapClassDesktop="border-b border-slate-100 dark:border-slate-800"
                    onClose={close}
                />
                <div
                    className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar px-3 py-3 sm:px-4 sm:py-4"
                    style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
                >
                    <p className="m-0 mb-3 text-xs leading-snug text-slate-600 dark:text-slate-300">
                        {ui.constructionBranchMetaHubHint}
                    </p>
                    <TreePresentation modalHost publishHub formRef={formRef} />
                    <PublishDiffPanel
                        ui={ui}
                        modal={modal}
                        activeSource={activeSource}
                        rawGraphData={rawGraphData}
                        userStore={userStore}
                    />
                </div>
                <BranchPublishFooter
                    ui={ui}
                    modal={modal}
                    activeSource={activeSource}
                    rawGraphData={rawGraphData}
                    userStore={userStore}
                    publishTreePublicInteractive={publishTreePublicInteractive}
                    validatePublicationMetadata={validatePublicationMetadata}
                    flushMetadata={flushMetadata}
                    notify={notify}
                    onClose={close}
                />
            </ModalShell>
        </div>
    );
}
