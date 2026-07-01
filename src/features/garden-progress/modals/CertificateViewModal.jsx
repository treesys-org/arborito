import { useGardenProgress } from '../hooks/useGardenProgress.js';
import { ModalShell } from '../../../app/components/ModalShell.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';

function formatCertDate(lang) {
    try {
        return new Date().toLocaleDateString(lang || undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    } catch {
        return new Date().toLocaleDateString();
    }
}

export function ModalCertificateView() {
    const garden = useGardenProgress();
    const { ui, dismissModal, findNode, getBookmark, modal, rawGraphData, activeSource, lang, gamification } =
        garden;

    const moduleId = modal?.moduleId;
    const node = moduleId ? findNode(moduleId) : null;
    const bookmark = node ? getBookmark(node.id, node.content) : null;
    const versionId = bookmark ? bookmark.hash.substring(0, 8).toUpperCase() : 'UNVERSIONED';
    const studentName = String(gamification?.username || '').trim() || ui.certStudentFallback || 'Student';

    let authorityName = ui.certSign || 'Treesys Certification';
    if (rawGraphData?.universeName) {
        authorityName = rawGraphData.universeName;
    } else if (activeSource?.name) {
        authorityName = activeSource.name;
    }

    const close = () => dismissModal();
    const onPrint = () => {
        if (typeof window !== 'undefined') window.print();
    };

    if (!node) return null;

    return (
        <ModalShell
            layout="centered"
            panelSize="certificate"
            shellOpts={{ rootFlags: 'arborito-modal-backdrop--certificate', enter: 'fade' }}
            onBackdropClick={close}
        >
            <div className="arborito-cert-view relative flex flex-col h-full min-h-0 overflow-hidden">
                <div
                    className="arborito-cert-view__watermark pointer-events-none absolute inset-0 flex items-center justify-center text-[12rem] select-none"
                    aria-hidden
                >
                    🎓
                </div>

                <div className="arborito-cert-view__frame relative z-10 m-4 sm:m-6 flex-1 min-h-0 rounded-2xl border-4 border-yellow-500/40 bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 p-6 sm:p-10 flex flex-col overflow-y-auto custom-scrollbar">
                    <div className="arborito-cert-view__accent h-1 w-24 rounded-full bg-yellow-400 mx-auto mb-6" />

                    <p className="text-xs font-black tracking-[0.35em] text-yellow-600 dark:text-yellow-400 text-center uppercase mb-2">
                        {ui.certTitle || 'CERTIFICATE OF COMPLETION'}
                    </p>

                    <div className="arborito-cert-view__medallion w-20 h-20 rounded-full bg-yellow-400 text-4xl flex items-center justify-center mx-auto mb-6">
                        <ChromeEmoji emoji={node.icon || '🎓'} />
                    </div>

                    <p className="text-center text-sm text-slate-600 dark:text-slate-300 mb-2">
                        {ui.certBody || 'This certifies that the student has successfully completed the module:'}
                    </p>

                    <h2 className="text-center text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mb-2">
                        {studentName}
                    </h2>

                    <h3 className="text-center text-xl sm:text-2xl font-bold text-yellow-700 dark:text-yellow-300 mb-6">
                        {node.name}
                    </h3>

                    <div className="mt-auto grid grid-cols-1 sm:grid-cols-2 gap-4 text-center text-xs text-slate-500 dark:text-slate-400">
                        <div>
                            <p className="font-bold uppercase tracking-wide mb-1">{ui.certDate || 'Date'}</p>
                            <p>{formatCertDate(lang)}</p>
                        </div>
                        <div>
                            <p className="font-bold uppercase tracking-wide mb-1">
                                {ui.certVersion || 'Version'}
                            </p>
                            <p>{versionId}</p>
                        </div>
                    </div>

                    <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-6">
                        {ui.certAuthority || 'Issued by'}: {authorityName}
                    </p>
                </div>

                <div className="relative z-10 flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-200/70 dark:border-slate-700/70 bg-white/80 dark:bg-slate-950/80 backdrop-blur">
                    <button
                        type="button"
                        className="text-sm font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white"
                        onClick={close}
                    >
                        {ui.close || 'Close'}
                    </button>
                    <button
                        type="button"
                        className="arborito-cert-view__print arborito-cta-blue px-5 py-2.5 rounded-xl text-xs font-black tracking-wide"
                        onClick={onPrint}
                    >
                        {ui.printCert || 'DOWNLOAD DIPLOMA'}
                    </button>
                </div>
            </div>
        </ModalShell>
    );
}
