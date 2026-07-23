import { useGardenProgress } from '../hooks/useGardenProgress.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { DockModalShell } from '../../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { Callout } from '../../../shared/ui/Callout.jsx';
import { shareCertificate } from '../api/share-certificate.js';
import { printCertificate } from '../api/print-certificate.js';
import { resolveCertificateDisplayNode } from '../api/certificate-entries.js';
import { resolvePdfSourceMeta } from '../../backup-export/api/export/resolve-pdf-source-meta.js';
import { sanitizeLocaleRichHtml } from '../../../shared/lib/locale-rich-html.js';

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
    const mobile = shouldShowMobileUI();
    const { ui, dismissModal, findNode, getBookmark, modal, store, lang, gamification } = garden;

    const moduleId = modal?.moduleId;
    const node = moduleId
        ? resolveCertificateDisplayNode(garden.store, String(moduleId), findNode)
        : null;
    const bookmark = node ? getBookmark(node.id, node.content) : null;
    const versionId = bookmark ? bookmark.hash.substring(0, 8).toUpperCase() : 'UNVERSIONED';
    const studentName = String(gamification?.username || '').trim() || ui.certStudentFallback || 'Student';

    let authorityName = ui.certSign || 'Treesys Certification';
    const rawGraphData = store?.state?.rawGraphData;
    const activeSource = store?.state?.activeSource;
    if (rawGraphData?.universeName) {
        authorityName = rawGraphData.universeName;
    } else if (activeSource?.name) {
        authorityName = activeSource.name;
    }

    const meta = store ? resolvePdfSourceMeta(store, ui) : null;
    const disclaimerHtml =
        meta &&
        sanitizeLocaleRichHtml(
            String(ui.pdfDisclaimerText || '')
                .replaceAll('{treeName}', meta.treeName)
                .replaceAll('{author}', meta.author)
                .replaceAll('{source}', meta.source)
        );

    const close = () => dismissModal();
    const onPrint = () => {
        if (!node) return;
        void printCertificate({
            studentName,
            moduleName: node.name,
            moduleIcon: node.icon || '🎓',
            isTreeCertificate: !!node.isTreeCertificate,
            certTitle: ui.certTitle,
            certBody: ui.certBody,
            certTreeBody: ui.certTreeBody,
            certDateLabel: ui.certDate,
            certVersionLabel: ui.certVersion,
            certAuthorityLabel: ui.certAuthority,
            authorityName,
            dateText: formatCertDate(lang),
            versionId,
        });
    };
    const onShare = () => {
        if (!node) return;
        void shareCertificate({ moduleName: node.name, studentName });
    };

    if (!node) return null;

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={node.name}
            titleId="modal-title-text"
            subtitle={ui.certTitle || 'Certificate of completion'}
            leadingIcon={node.icon || '🎓'}
            tagClass="btn-close-cert-view"
            onClose={close}
        />
    );

    const toolbar = (
        <div
            className={`shrink-0 ${mobile ? 'px-3' : 'px-4'} pb-2 flex items-center justify-end gap-2`}
        >
            <button
                type="button"
                className="arborito-cert-view__share px-4 py-2.5 rounded-xl text-xs font-black tracking-wide border-2 border-yellow-500/50 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 transition-colors"
                onClick={onShare}
                aria-label={ui.certShareButton || 'Share certificate'}
            >
                {ui.certShareButton || 'Share'}
            </button>
            <button
                type="button"
                className="arborito-cert-view__print arborito-cta-blue px-5 py-2.5 rounded-xl text-xs font-black tracking-wide"
                onClick={onPrint}
            >
                {ui.printCert || 'DOWNLOAD DIPLOMA'}
            </button>
        </div>
    );

    const body = (
        <div className="arborito-cert-view relative flex flex-col flex-1 min-h-0 h-full overflow-hidden p-3 sm:p-4">
            <div
                className="arborito-cert-view__watermark pointer-events-none absolute inset-0 flex items-center justify-center text-[10rem] sm:text-[12rem] select-none opacity-[0.04]"
                aria-hidden
            >
                🎓
            </div>

            <div className="arborito-cert-view__frame relative z-10 flex-1 min-h-0 w-full rounded-xl sm:rounded-2xl border-4 border-yellow-500/50 bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 p-5 sm:p-8 flex flex-col overflow-hidden box-border">
                <div className="arborito-cert-view__accent h-1 w-24 rounded-full bg-yellow-400 mx-auto mb-5" />

                <p className="text-xs font-black tracking-[0.35em] text-yellow-600 dark:text-yellow-400 text-center uppercase mb-2">
                    {ui.certTitle || 'CERTIFICATE OF COMPLETION'}
                </p>

                <div className="arborito-cert-view__medallion w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-yellow-400 text-3xl sm:text-4xl flex items-center justify-center mx-auto mb-5">
                    <ChromeEmoji emoji={node.icon || '🎓'} />
                </div>

                <p className="text-center text-sm text-slate-600 dark:text-slate-300 mb-2">
                    {node.isTreeCertificate
                        ? ui.certTreeBody || 'This certifies that the student has successfully completed:'
                        : ui.certBody || 'This certifies that the student has successfully completed the module:'}
                </p>

                <h2 className="text-center text-xl sm:text-3xl font-black text-slate-900 dark:text-white mb-2">
                    {studentName}
                </h2>

                <h3 className="text-center text-lg sm:text-2xl font-bold text-yellow-700 dark:text-yellow-300 mb-4">
                    {node.name}
                </h3>

                {meta ? (
                    <p className="text-center text-xs text-slate-500 dark:text-slate-400 mb-4">
                        {meta.treeNamePlain} · {meta.authorPlain} · {meta.sourcePlain}
                    </p>
                ) : null}

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

                <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-5">
                    {ui.certAuthority || 'Issued by'}: {authorityName}
                </p>
            </div>

            {disclaimerHtml ? (
                <Callout
                    tone="slate"
                    size="sm"
                    title={ui.pdfDisclaimerTitle || 'DISCLAIMER'}
                    richHtml={disclaimerHtml}
                    bodyClass="text-[11px] leading-snug"
                    extraClass="mt-3 shrink-0"
                />
            ) : null}
        </div>
    );

    return (
        <div data-arborito-panel="modal-certificate-view">
            <DockModalShell
                mobile={mobile}
                sizeTier="CERTIFICATE"
                layout="centered"
                useDockChrome
                hero={hero}
                toolbar={toolbar}
                skipBodyWrap
                shellOpts={{ rootFlags: 'arborito-modal--certificate-view' }}
                onBackdropClick={close}
            >
                {body}
            </DockModalShell>
        </div>
    );
}
