import { useGardenProgress } from '../hooks/useGardenProgress.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { DockModalShell } from '../../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { Callout } from '../../../shared/ui/Callout.jsx';
import { shareCertificate, dismissSharedCertificate } from '../api/share-certificate.js';
import { printCertificate } from '../api/print-certificate.js';
import { resolveCertificateDisplayNode } from '../api/certificate-entries.js';
import { resolvePdfSourceMeta } from '../../backup-export/api/export/resolve-pdf-source-meta.js';
import { sanitizeLocaleRichHtml } from '../../../shared/lib/locale-rich-html.js';
import { modalCtaConfirm, modalCtaConfirmFull, MODAL_CTA_CANCEL } from '../../../shared/ui/modal-action-chrome.js';
import { isOnboardingWizardIncomplete } from '../../../shared/lib/onboarding-boot-gate.js';

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
    const { ui, dismissModal, findNode, getBookmark, modal, store, lang, gamification, setModal } =
        garden;

    const fromShare = !!(modal && typeof modal === 'object' && modal.fromShare);
    const shared = modal?.sharedCert && typeof modal.sharedCert === 'object' ? modal.sharedCert : null;
    const moduleId = modal?.moduleId;
    const node = moduleId
        ? resolveCertificateDisplayNode(garden.store, String(moduleId), findNode)
        : null;

    const moduleName =
        String(node?.name || shared?.moduleName || '').trim() ||
        ui.certStudentFallback ||
        'Module';
    const moduleIcon = String(node?.icon || shared?.icon || '🎓').trim() || '🎓';
    const isTreeCertificate = !!(node?.isTreeCertificate || shared?.isTreeCertificate);

    const bookmark = node ? getBookmark(node.id, node.content) : null;
    const versionId =
        String(shared?.versionId || '').trim() ||
        (bookmark ? bookmark.hash.substring(0, 8).toUpperCase() : '') ||
        (fromShare ? '—' : 'UNVERSIONED');

    const studentName =
        String(modal?.sharedStudentName || '').trim() ||
        String(gamification?.username || '').trim() ||
        ui.certStudentFallback ||
        'Student';

    const dateText = String(shared?.dateText || '').trim() || formatCertDate(lang);

    let authorityName = ui.certSign || 'Treesys Certification';
    const rawGraphData = store?.state?.rawGraphData;
    const activeSource = store?.state?.activeSource;
    if (String(shared?.treeName || '').trim()) {
        authorityName = String(shared.treeName).trim();
    } else if (rawGraphData?.universeName) {
        authorityName = rawGraphData.universeName;
    } else if (activeSource?.name) {
        authorityName = activeSource.name;
    }

    const meta = !fromShare && store ? resolvePdfSourceMeta(store, ui) : null;
    const sharedMetaLine = [shared?.treeName, shared?.author].filter(Boolean).join(' · ');
    const disclaimerHtml =
        meta &&
        sanitizeLocaleRichHtml(
            String(ui.pdfDisclaimerText || '')
                .replaceAll('{treeName}', meta.treeName)
                .replaceAll('{author}', meta.author)
                .replaceAll('{source}', meta.source)
        );

    const close = () => {
        if (fromShare) dismissSharedCertificate(garden.store);
        else dismissModal();
    };

    const onInvite = () => {
        dismissModal();
        if (isOnboardingWizardIncomplete()) {
            setModal?.({ type: 'onboarding' });
            return;
        }
        setModal?.({ type: 'about' });
    };

    const onPrint = () => {
        void printCertificate({
            studentName,
            moduleName,
            moduleIcon,
            isTreeCertificate,
            certTitle: ui.certTitle,
            certBody: ui.certBody,
            certTreeBody: ui.certTreeBody,
            certDateLabel: ui.certDate,
            certVersionLabel: ui.certVersion,
            certAuthorityLabel: ui.certAuthority,
            authorityName,
            dateText,
            versionId,
        });
    };
    const onShare = () => {
        void shareCertificate({
            moduleId: node?.id || moduleId,
            moduleName,
            studentName,
            icon: moduleIcon,
            treeName: shared?.treeName || rawGraphData?.universeName || activeSource?.name || '',
            author: shared?.author || meta?.authorPlain || '',
            dateText,
            versionId: versionId === '—' || versionId === 'UNVERSIONED' ? '' : versionId,
            isTreeCertificate,
        });
    };

    if (!node && !shared?.moduleName && !fromShare) return null;
    if (!moduleName) return null;

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={moduleName}
            titleId="modal-title-text"
            subtitle={ui.certTitle || 'Certificate of completion'}
            leadingIcon={moduleIcon}
            tagClass="btn-close-cert-view"
            onClose={close}
        />
    );

    const footer = (
        <div className="arborito-modal-footer arborito-modal-footer--blend flex flex-col gap-2">
            {fromShare ? (
                <button
                    type="button"
                    className={`${modalCtaConfirmFull('emerald')} inline-flex items-center justify-center gap-2`}
                    onClick={onInvite}
                >
                    <ChromeEmoji emoji="🌳" className="text-sm leading-none" />
                    <span>{ui.certShareInviteCta || 'Explore Arborito'}</span>
                </button>
            ) : (
                <div
                    className={`arborito-action-row${mobile ? ' arborito-action-row--stack-mobile' : ''}`}
                >
                    <button
                        type="button"
                        className={`${MODAL_CTA_CANCEL} arborito-cert-view__share inline-flex items-center justify-center`}
                        onClick={onShare}
                        aria-label={ui.certShareButton || 'Share certificate'}
                    >
                        {ui.certShareButton || 'Share'}
                    </button>
                    <button
                        type="button"
                        className={`${modalCtaConfirm('sky')} arborito-cert-view__print inline-flex items-center justify-center`}
                        onClick={onPrint}
                    >
                        {ui.printCert || 'DOWNLOAD DIPLOMA'}
                    </button>
                </div>
            )}
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
                    <ChromeEmoji emoji={moduleIcon} />
                </div>

                <p className="text-center text-sm text-slate-600 dark:text-slate-300 mb-2">
                    {isTreeCertificate
                        ? ui.certTreeBody || 'This certifies that the student has successfully completed:'
                        : ui.certBody || 'This certifies that the student has successfully completed the module:'}
                </p>

                <h2 className="text-center text-xl sm:text-3xl font-black text-slate-900 dark:text-white mb-2">
                    {studentName}
                </h2>

                <h3 className="text-center text-lg sm:text-2xl font-bold text-yellow-700 dark:text-yellow-300 mb-4">
                    {moduleName}
                </h3>

                {meta ? (
                    <p className="text-center text-xs text-slate-500 dark:text-slate-400 mb-4">
                        {meta.treeNamePlain} · {meta.authorPlain} · {meta.sourcePlain}
                    </p>
                ) : sharedMetaLine ? (
                    <p className="text-center text-xs text-slate-500 dark:text-slate-400 mb-4">
                        {sharedMetaLine}
                    </p>
                ) : null}

                <div className="mt-auto grid grid-cols-1 sm:grid-cols-2 gap-4 text-center text-xs text-slate-500 dark:text-slate-400">
                    <div>
                        <p className="font-bold uppercase tracking-wide mb-1">{ui.certDate || 'Date'}</p>
                        <p>{dateText}</p>
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

            {fromShare ? (
                <Callout
                    tone="emerald"
                    size="sm"
                    title={ui.certShareInviteTitle || 'Learn with Arborito'}
                    body={
                        ui.certShareInviteBody ||
                        'This diploma was earned on Arborito — free maps of knowledge you can explore on your own device.'
                    }
                    bodyClass="text-[11px] leading-snug"
                    extraClass="mt-3 shrink-0"
                />
            ) : null}

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
                footer={footer}
                skipBodyWrap
                shellOpts={{ rootFlags: 'arborito-modal--certificate-view' }}
                onBackdropClick={close}
            >
                {body}
            </DockModalShell>
        </div>
    );
}
