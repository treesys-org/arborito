import { useBackupExport } from '../hooks/useBackupExport.js';
import { useState } from 'react';
import { pdfGenerator } from '../api/pdf-generator.js';
import { ModalCenteredShell } from '../../../app/components/ModalShell.jsx';
import { ModalHero } from '../../../app/components/ModalHero.jsx';

export function ModalExportPdf() {
    const backup = useBackupExport();
    const { ui, dismissModal, notify, findNode, loadNodeChildren, alert, modal } = backup;
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
        <ModalHero
            ui={ui}
            title={ui.exportTitle}
            tagClass="btn-close"
            onClose={close}
        />
    );

    const body = isGeneratingPdf ? (
        <div className="p-12 flex flex-col items-center justify-center text-center">
            <div className="relative w-20 h-20 mb-6 flex items-center justify-center">
                <svg
                    className="w-20 h-20 text-slate-200 dark:text-slate-700"
                    viewBox="0 0 100 100"
                >
                    <circle
                        strokeWidth="8"
                        stroke="currentColor"
                        fill="transparent"
                        r="42"
                        cx="50"
                        cy="50"
                    />
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
                <span className="absolute font-black text-slate-700 dark:text-white text-lg">
                    {pdfProgress}%
                </span>
            </div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white animate-pulse">
                {ui.generatingPdf}
            </h2>
            <p className="text-xs text-slate-400 mt-2">
                {ui.exportPdfProcessing || 'Processing lessons...'}
            </p>
        </div>
    ) : (
        <div className="p-8 text-center">
            <h2 className="text-2xl font-black mb-2 text-slate-800 dark:text-white">
                {ui.exportTitle}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 mb-8">{ui.exportDesc}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                    type="button"
                    className="bg-slate-50 dark:bg-slate-800 hover:bg-purple-50 dark:hover:bg-purple-900/20 border-2 border-slate-100 dark:border-slate-700 hover:border-purple-500 dark:hover:border-purple-500 rounded-2xl p-6 transition-all group active:scale-95 text-left"
                    onClick={() => handleExport('lesson')}
                >
                    <div className="w-12 h-12 bg-white dark:bg-slate-700 rounded-full flex items-center justify-center text-2xl mb-4 shadow-sm group-hover:scale-110 transition-transform">
                        📄
                    </div>
                    <h3 className="font-bold text-lg text-slate-800 dark:text-white mb-1 group-hover:text-purple-600 dark:group-hover:text-purple-400">
                        {ui.exportLesson}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        {ui.exportLessonDesc}
                    </p>
                </button>
                <button
                    type="button"
                    className="bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-2 border-slate-100 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 rounded-2xl p-6 transition-all group active:scale-95 text-left"
                    onClick={() => handleExport('module')}
                >
                    <div className="w-12 h-12 bg-white dark:bg-slate-700 rounded-full flex items-center justify-center text-2xl mb-4 shadow-sm group-hover:scale-110 transition-transform">
                        📚
                    </div>
                    <h3 className="font-bold text-lg text-slate-800 dark:text-white mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                        {ui.exportModule}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        {ui.exportModuleDesc}
                    </p>
                </button>
            </div>
        </div>
    );

    return (
        <div data-arborito-panel="modal-export-pdf">
        <ModalCenteredShell
            refKey="modal-export-pdf"
            layout="centered"
            sizeTier="CONTENT"
            hero={hero}
            shellOpts={{ panelClass: 'transition-all duration-300' }}
        >
            <div className="arborito-mob-scroll-pane custom-scrollbar">{body}</div>
        </ModalCenteredShell>
        </div>
    );
}
