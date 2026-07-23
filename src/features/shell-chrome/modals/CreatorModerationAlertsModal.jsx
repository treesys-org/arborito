import { useMemo } from 'react';
import { useShellChrome } from '../hooks/useShellChrome.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { DockModalShell, ModalCenteredShell } from '../../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { MODAL_CTA_CANCEL, modalCtaConfirmFull } from '../../../shared/ui/modal-action-chrome.js';

function alertSummary(ui, alert) {
    const title = String(alert?.title || '').trim() || ui.creatorModerationAlertUntitled || 'Published tree';
    const caseBit = alert?.caseId
        ? (ui.creatorModerationAlertCaseRef || 'Case {caseId}').replace(/\{caseId\}/g, alert.caseId)
        : '';
    if (alert?.kind === 'legal-dispute') {
        const body = (ui.creatorModerationAlertLegal || 'Legal notice on “{title}”. Respond within ~48 h. {case}')
            .replace(/\{title\}/g, title)
            .replace(/\{case\}/g, caseBit);
        return { title, body };
    }
    if (alert?.kind === 'community-threshold') {
        const body = (
            ui.creatorModerationAlertThreshold ||
            '“{title}” reached the community report threshold ({score}/{threshold}). Hidden from Discover for others.'
        )
            .replace(/\{title\}/g, title)
            .replace(/\{score\}/g, String(alert?.score ?? '?'))
            .replace(/\{threshold\}/g, String(alert?.threshold ?? '?'));
        return { title, body };
    }
    const body = (
        ui.creatorModerationAlertCommunity ||
        'New community report on “{title}” (score {score}/{threshold}).'
    )
        .replace(/\{title\}/g, title)
        .replace(/\{score\}/g, String(alert?.score ?? '?'))
        .replace(/\{threshold\}/g, String(alert?.threshold ?? '?'));
    return { title, body };
}

export function ModalCreatorModerationAlerts() {
    const shell = useShellChrome();
    const {
        ui,
        creatorModerationAlerts,
        dismissModal,
        markCreatorModerationAlertsRead,
        setModal,
    } = shell;
    const mobile = shouldShowMobileUI();
    const alerts = Array.isArray(creatorModerationAlerts) ? creatorModerationAlerts : [];
    const items = useMemo(
        () =>
            alerts.map((a) => ({
                alert: a,
                ...alertSummary(ui, a),
            })),
        [alerts, ui]
    );

    const onClose = () => {
        markCreatorModerationAlertsRead?.();
        dismissModal();
    };

    const openBiblioteca = () => {
        markCreatorModerationAlertsRead?.();
        dismissModal();
        setModal({
            type: 'sources',
            focusTab: 'trees',
        });
    };

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={ui.creatorModerationAlertsTitle || 'Creator alerts'}
            titleId="creator-moderation-alerts-title"
            leadingIcon="🔔"
            onClose={onClose}
        />
    );

    const body = (
        <div className="arborito-dialog-body-block px-4 sm:px-6 pt-2 pb-2 flex flex-col gap-3 overflow-y-auto custom-scrollbar min-h-0 flex-1">
            <p className="text-xs text-slate-500 dark:text-slate-400 m-0 leading-relaxed">
                {ui.creatorModerationAlertsLead ||
                    'Reports and legal notices on trees you published from this device. Restrictions affect Discover only, your links still work.'}
            </p>
            {items.length === 0 ? (
                <p className="text-sm text-slate-600 dark:text-slate-300 m-0">
                    {ui.creatorModerationAlertsEmpty || 'No pending alerts.'}
                </p>
            ) : (
                <ul className="list-none m-0 p-0 flex flex-col gap-3">
                    {items.map(({ alert, title, body: itemBody }) => (
                        <li
                            key={alert.id}
                            className={`rounded-2xl border px-3 py-3 ${
                                alert.read
                                    ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                                    : 'border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30'
                            }`}
                        >
                            <p className="text-sm font-bold text-slate-800 dark:text-slate-100 m-0 mb-1">{title}</p>
                            <p className="text-xs text-slate-600 dark:text-slate-300 m-0 mb-2 leading-relaxed">
                                {itemBody}
                            </p>
                            {alert.shareCode ? (
                                <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 m-0">
                                    #{alert.shareCode}
                                </p>
                            ) : null}
                        </li>
                    ))}
                </ul>
            )}
            <p className="text-[11px] text-slate-500 dark:text-slate-400 m-0 leading-relaxed">
                {ui.creatorModerationAlertsPolicyHint ||
                    'Full moderation rules: About → Legal. Quote the same case reference in e-mail threads with claimants.'}
            </p>
        </div>
    );

    const footer = (
        <div className="arborito-modal-footer shrink-0 px-4 sm:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="arborito-action-row w-full arborito-action-row--stack-mobile">
                <button type="button" className={MODAL_CTA_CANCEL} onClick={onClose}>
                    {ui.dialogOkButton || ui.cancel || 'Close'}
                </button>
                {items.length ? (
                    <button type="button" className={modalCtaConfirmFull('emerald')} onClick={openBiblioteca}>
                        {ui.creatorModerationOpenBiblioteca || 'Open in Biblioteca'}
                    </button>
                ) : null}
            </div>
        </div>
    );

    if (mobile) {
        return (
            <DockModalShell mobile hero={hero} footer={footer} sizeTier="COMPACT" onBackdropClick={onClose}>
                {body}
            </DockModalShell>
        );
    }

    return (
        <ModalCenteredShell hero={hero} footer={footer} sizeTier="STANDARD" onBackdropClick={onClose}>
            {body}
        </ModalCenteredShell>
    );
}
