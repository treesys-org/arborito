import { useBackupExport } from '../hooks/useBackupExport.js';
import { useState } from 'react';
import { pdfGenerator } from '../api/pdf-generator.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { ModalCenteredShell, DockModalShell } from '../../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { MODAL_CTA_CANCEL, modalCtaConfirmFull } from '../../../shared/ui/modal-action-chrome.js';

export function ModalExportPdf() {
    const backup = useBackupExport();
    const { ui, dismissModal, notify, findNode, loadNodeChildren, alert, modal } = backup;
    const mobile = shouldShowMobileUI();
    const node = modal?.node;
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [pdfProgress, setPdfProgress] = useState(0);

    if (!node) return null;

    const close = () => dismissModal();

    const handleExport = async (mode) => {
        setIsGeneratingPdf(true);
        setPdfProgress(0);

        try {
            let nodesToPrint = [];

            if (mode === 'lesson') {
                nodesToPrint = [node];
            } else {
                const parentId = node.parentId;
                const parentNode = findNode(parentId);

                if (!parentNode) {
                    nodesToPrint = [node];
                } else {
                    if (parentNode.hasUnloadedChildren) {
                        await loadNodeChildren(parentNode);
                    }
                    const siblings = parentNode.children.filter(
                        (n) => n.type === 'leaf' || n.type === 'exam'
                    );
                    nodesToPrint = await Promise.all(siblings.map(async (child) => child));
                }
            }

            await pdfGenerator.generate(nodesToPrint, (progress) => {
                setPdfProgress(progress);
            });

            close();
        } catch (e) {
            console.error(e);
            alert(
                (ui.exportPdfError || 'Error generating PDF: {message}').replace(
                    '{message}',
                    e.message
                )
            );
            close();
        }
    };

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={ui.exportTitle}
            leadingIcon="📄"
            tagClass="btn-close"
            onClose={close}
        />
    );

    const body = isGeneratingPdf ? (
        <div className="arborito-dialog-body-block p-8 sm:p-12 flex flex-col items-center justify-center text-center">
            <div className="relative w-20 h-20 mb-6 flex items-center justify-center">
                <svg className="w-20 h-20 text-slate-200 dark:text-slate-700" viewBox="0 0 100 100">
                    <circle strokeWidth="8" stroke="currentColor" fill="transparent" r="42" cx="50" cy="50" />
                    <circle
                        className="text-purple-600 transition-all duration-300 ease-out"
                        strokeWidth="8"
                        strokeDasharray="264"
                        strokeDashoffset={264 * (1 - pdfProgress / 100)}
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="transparent"
                        r="42"
                        cx="50"
                        cy="50"
                        style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
                    />
                </svg>
                <span className="absolute font-black text-slate-700 dark:text-white text-lg">{pdfProgress}%</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white animate-pulse">{ui.generatingPdf}</h2>
            <p className="text-xs text-slate-400 mt-2">{ui.exportPdfProcessing || 'Processing lessons...'}</p>
        </div>
    ) : (
        <div className="arborito-dialog-body-block p-6 sm:p-8 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed m-0">{ui.exportDesc}</p>
        </div>
    );

    const footer = isGeneratingPdf ? null : (
        <div className="arborito-modal-footer shrink-0 px-4 sm:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="arborito-action-row w-full arborito-action-row--stack-mobile">
                <button type="button" className={MODAL_CTA_CANCEL} onClick={close}>
                    {ui.cancel || 'Cancel'}
                </button>
                <button type="button" className={modalCtaConfirmFull('purple')} onClick={() => void handleExport('lesson')}>
                    {ui.exportLesson || 'This lesson'}
                </button>
                <button type="button" className={modalCtaConfirmFull('sky')} onClick={() => void handleExport('module')}>
                    {ui.exportModule || 'Whole module'}
                </button>
            </div>
        </div>
    );

    if (mobile) {
        return (
            <div data-arborito-panel="modal-export-pdf">
                <DockModalShell
                    mobile
                    hero={hero}
                    footer={footer}
                    shellOpts={{
                        rootFlags: 'arborito-modal--export-pdf',
                        panelClass: 'transition-all duration-300',
                    }}
                    onBackdropClick={close}
                >
                    <div className="arborito-mob-scroll-pane custom-scrollbar">{body}</div>
                </DockModalShell>
            </div>
        );
    }

    return (
        <div data-arborito-panel="modal-export-pdf">
            <ModalCenteredShell
                refKey="modal-export-pdf"
                layout="centered"
                sizeTier="COMPACT"
                hero={hero}
                footer={footer}
                shellOpts={{ panelClass: 'transition-all duration-300', rootFlags: 'arborito-modal--export-pdf' }}
                onBackdropClick={close}
            >
                <div className="arborito-mob-scroll-pane custom-scrollbar">{body}</div>
            </ModalCenteredShell>
        </div>
    );
}
