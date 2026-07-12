import { usePrivacyGdpr } from '../hooks/usePrivacyGdpr.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { DockModalShell, ModalCenteredShell } from '../../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { MODAL_CTA_CANCEL, modalCtaConfirm } from '../../../shared/ui/modal-action-chrome.js';

export function MediaConsentModal({ pending, onAccept, onDecline }) {
    const { ui } = usePrivacyGdpr();
    const mobile = shouldShowMobileUI();

    if (!pending?.length) return null;

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={ui.mediaConsentTitle || ''}
            titleId="arborito-media-consent-title"
            leadingIcon="🎬"
            backTagClass="btn-media-consent-decline"
            closeTagClass="btn-media-consent-decline"
            onBack={onDecline}
            onClose={onDecline}
        />
    );

    const footer = (
        <div className="arborito-modal-footer arborito-modal-footer--bg-flat">
            <div className="arborito-action-row">
                <button
                    type="button"
                    id="btn-media-consent-decline"
                    className={MODAL_CTA_CANCEL}
                    onClick={onDecline}
                >
                    {ui.mediaConsentDecline || ''}
                </button>
                <button
                    type="button"
                    id="btn-media-consent-accept"
                    className={modalCtaConfirm('sky')}
                    onClick={onAccept}
                >
                    {ui.mediaConsentAccept || ''}
                </button>
            </div>
        </div>
    );

    const body = (
            <div className="p-4 sm:p-5 text-left">
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-3 leading-relaxed m-0">
                    {ui.mediaConsentBody || ''}
                </p>
                <p className="arborito-eyebrow arborito-eyebrow--md mb-2">{ui.mediaConsentListLabel || ''}</p>
                <div className="mb-3 max-h-48 overflow-y-auto custom-scrollbar">
                    {pending.map((p) => {
                        const domain = p.origin.replace(/^https?:\/\//i, '');
                        return (
                            <div
                                key={p.origin}
                                className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/80 px-3 py-2 mb-2 text-left"
                            >
                                <div className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">
                                    {ui.mediaConsentDomainLabel || 'Origin'} ·{' '}
                                    <span className="text-emerald-700 dark:text-emerald-400">{domain}</span>
                                </div>
                                <ul className="list-none pl-0 space-y-0.5 m-0">
                                    {p.urls.slice(0, 3).map((u) => (
                                        <li
                                            key={u}
                                            className="font-mono text-[11px] text-slate-500 dark:text-slate-400 break-all"
                                        >
                                            {u}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        );
                    })}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-0 leading-relaxed m-0">
                    {ui.mediaConsentRememberHint || ''}
                </p>
            </div>
    );

    if (mobile) {
        return (
            <DockModalShell
                mobile
                layout="dock-bottom"
                hero={hero}
                footer={footer}
                onBackdropClick={onDecline}
                shellOpts={{ z: 220, scrim: 'translucent-strong', enter: 'fade' }}
            >
                {body}
            </DockModalShell>
        );
    }

    return (
        <ModalCenteredShell
            layout="centered"
            sizeTier="COMPACT"
            panelId="arborito-media-consent-root"
            onBackdropClick={onDecline}
            shellOpts={{ z: 220, scrim: 'translucent-strong', enter: 'fade' }}
            hero={hero}
            footer={footer}
        >
            {body}
        </ModalCenteredShell>
    );
}
