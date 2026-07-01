import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { Callout } from '../../../shared/ui/Callout.jsx';
import { LocaleRichText } from '../../../shared/ui/LocaleRichText.jsx';
import { fillSageAiConsentTokens } from '../api/ai-models.js';
import { isElectronDesktop } from '../api/electron-bridge.js';
import { DOCK_SHEET_SCROLL_PAD } from '../../../shared/ui/dock-sheet-chrome.js';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { ModalShell } from '../../../app/components/ModalShell.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { SageModeToggle, SageMobPanel, SageDeskGuideShell, SageOutsideDismiss } from './components/SageLayout.jsx';
import { sageHideDismissButton } from '../api/modals/logic/sage-ui-helpers.js';
import { SAGE_OPEN } from '../api/modals/logic/sage-ui-helpers.js';

function SageScreenHero({ ui, mob, title, subtitle, trailing, leadingIcon, onClose, backAsClose }) {
    const hideDismiss = sageHideDismissButton();
    return (
        <ModalHubHero
            ui={ui}
            mobile={mob}
            title={title}
            subtitle={subtitle}
            leadingIcon={leadingIcon ?? <ChromeEmoji emoji="🦉" size={24} />}
            trailingHtml={trailing}
            showBack={!hideDismiss}
            showClose={!hideDismiss}
            backTagClass={backAsClose ? 'btn-close' : undefined}
            tagClass="btn-close"
            onClose={onClose}
            onBack={onClose}
            subtitleClass="arborito-sage-hero-subtitle"
        />
    );
}

export function SageDynamicConsent({ ui, sageEnterAnim, constructionMode, isAi, onSwitchMode, onAccept, onDecline, onClose }) {
    const mob = shouldShowMobileUI();
    const optionalBannerHtml =
        ui.sageAiOptionalBanner ||
        'AI in Arborito is fully <strong>optional</strong>. You can keep using every other feature without it.';
    const body = (
        <div className={DOCK_SHEET_SCROLL_PAD}>
            <Callout tone="blue" layout="stack" extraClass="mb-4">
                <div className="arborito-callout__body m-0">
                    <LocaleRichText html={optionalBannerHtml} />
                </div>
            </Callout>
            <Callout
                tone="amber"
                layout="stack"
                extraClass="mb-4"
                body={ui.sageExperimentalBuggyWarn || ''}
            />
            <Callout
                tone="amber"
                layout="stack"
                extraClass="mb-4"
                body={ui.sageExperimentalDisclaimer || ''}
            />
            <button type="button" id="btn-accept-dynamic-consent" className="arborito-cta-purple w-full py-3 font-bold rounded-xl shadow-lg active:scale-95 transition-transform" onClick={onAccept}>
                {ui.sageExperimentalOptIn || 'Enable AI (optional)'}
            </button>
            <button type="button" id="btn-sage-decline-dynamic" className="arborito-sage-decline-btn" onClick={onDecline}>
                {ui.sageExperimentalStayGuide || 'No thanks — stay in Guide mode'}
            </button>
        </div>
    );
    const hero = (
        <SageScreenHero
            ui={ui}
            mob={mob}
            title={ui.sageExperimentalTitle || 'Optional AI helper (preview)'}
            subtitle={ui.sageExperimentalBadge || 'Experimental'}
            trailing={<SageModeToggle ui={ui} isAi={isAi} onChange={onSwitchMode} />}
            onClose={onDecline}
            backAsClose
        />
    );
    const panel = (
        <>
            {hero}
            {body}
        </>
    );
    if (mob) {
        return (
            <SageMobPanel guide enterAnim={sageEnterAnim}>
                {panel}
            </SageMobPanel>
        );
    }
    return <SageDeskGuideShell enterAnim={sageEnterAnim} onDismiss={onDecline}>{panel}</SageDeskGuideShell>;
}

export function SageWebAiGate({ ui, sageEnterAnim, onExpertSetup, onStayGuide, onClose }) {
    const mob = shouldShowMobileUI();
    const body = (
        <div className={`${DOCK_SHEET_SCROLL_PAD} space-y-4`}>
            <Callout tone="blue" layout="stack">
                <p className="arborito-callout__body m-0">
                    <LocaleRichText html={ui.sageWebAiUnavailableBody || ''} />
                </p>
            </Callout>
            <button type="button" id="btn-sage-expert-setup" className="arborito-cta-purple w-full py-3 font-bold rounded-xl shadow-lg active:scale-95 transition-transform" onClick={onExpertSetup}>
                {ui.sageWebExpertSetupBtn || 'Expert mode — connect API'}
            </button>
            <button type="button" id="btn-sage-stay-guide" className="arborito-sage-decline-btn" onClick={onStayGuide}>
                {ui.sageExperimentalStayGuide || 'Stay in Guide mode'}
            </button>
        </div>
    );
    const hero = (
        <SageScreenHero
            ui={ui}
            mob={mob}
            title={ui.sageExperimentalTitle || 'Optional AI helper'}
            subtitle={ui.sageExperimentalBadge || 'Experimental'}
            onClose={onStayGuide}
            backAsClose
        />
    );
    if (mob) {
        return <SageMobPanel>{hero}{body}</SageMobPanel>;
    }
    return (
        <ModalShell mobile={false} layout="centered" panelSize="compact auto-h" panelTone="sage" rootFlags="arborito-sage-desk-scrim" scrim="opaque" shellOpts={{ enter: 'dock' }} onBackdropClick={onStayGuide}>
            {hero}
            {body}
        </ModalShell>
    );
}

export function SageDownloadConsent({ ui, sageEnterAnim, constructionMode, isAi, onSwitchMode, onAccept, onDecline }) {
    const mob = shouldShowMobileUI();
    const isDesktop = isElectronDesktop();
    const gdprBody = fillSageAiConsentTokens(ui.sageGdprText || '', isDesktop);
    const gdprNote = fillSageAiConsentTokens(ui.sageGdprConnectsNote || '', isDesktop);
    const licenseText = ui.sageAiThirdPartyLicenses
        ? fillSageAiConsentTokens(ui.sageAiThirdPartyLicenses, isDesktop)
        : '';
    const body = (
        <div className={DOCK_SHEET_SCROLL_PAD}>
            <Callout tone="blue" layout="stack" extraClass="mb-6" body={gdprBody} />
            <Callout tone="yellow" layout="stack" size="sm" extraClass="mb-6 font-bold" body={gdprNote} />
            {licenseText ? (
                <Callout tone="slate" layout="stack" size="sm" extraClass="mb-6" body={licenseText} />
            ) : null}
            <button type="button" id="btn-accept-consent" className="arborito-cta-blue w-full py-3 font-bold rounded-xl shadow-lg active:scale-95 transition-transform" onClick={onAccept}>
                {ui.sageGdprAccept || 'Accept'}
            </button>
        </div>
    );
    const hero = (
        <SageScreenHero
            ui={ui}
            mob={mob}
            title={ui.sageGdprTitle || ''}
            subtitle={ui.sageExperimentalBadge || 'Experimental'}
            leadingIcon={<ChromeEmoji emoji="📡" size={24} />}
            trailing={<SageModeToggle ui={ui} isAi={isAi} onChange={onSwitchMode} />}
            onClose={onDecline}
            backAsClose
        />
    );
    const panel = (
        <>
            {hero}
            {body}
        </>
    );
    if (mob) {
        return <SageMobPanel guide enterAnim={sageEnterAnim}>{panel}</SageMobPanel>;
    }
    return <SageDeskGuideShell enterAnim={sageEnterAnim} onDismiss={onDecline}>{panel}</SageDeskGuideShell>;
}

export function SageLoadingScreen({ ui, progress, onCancel, onClose }) {
    const mob = shouldShowMobileUI();
    const isDesktop = isElectronDesktop();
    const loadDesc = isDesktop
        ? ui.sageLoadingBrainDescDesktop || ui.sageLoadingBrainDesc || ''
        : ui.sageLoadingBrainDescExpert || ui.sageLoadingBrainDescBrowser || ui.sageLoadingBrainDesc || '';
    const hideDismiss = sageHideDismissButton();
    let parsed = null;
    if (progress) {
        const match = String(progress).match(/(\d+)%/);
        if (match) parsed = Math.min(100, parseInt(match[1], 10));
    }
    const isError = String(progress || '').includes('❌');
    const percent = parsed !== null && !isError ? parsed : isError ? 100 : 0;
    const barClass = isError ? 'arborito-sage-progress--error' : 'arborito-sage-progress--ok';
    const textClass = isError ? 'arborito-sage-status--error' : 'arborito-sage-status--ok';
    const starting = ui.sageLoadingProgressStarting || '…';

    const loadingBody = (
        <div id="loading-container" className={`arborito-sage-loading-panel${mob ? '' : ' arborito-sage-loading-panel--desk arborito-float-modal-card arborito-float-modal-card--auto-h rounded-2xl w-[min(420px,calc(100vw-2rem))] max-h-[calc(100vh-2.5rem)]'}`}>
            <div className="w-16 h-16 arborito-sage-success-icon rounded-full mx-auto flex items-center justify-center mb-4" aria-hidden="true">
                <ChromeEmoji emoji="🧠" size={40} />
            </div>
            <h3 className="arborito-sage-loading-panel__title">{ui.sageLoadingBrainTitle || ''}</h3>
            <p className="arborito-sage-loading-panel__desc">{loadDesc}</p>
            <div className="arborito-sage-loading-track">
                <div className={`js-progress-bar ${barClass} h-full min-w-0 transition-[width] duration-300 ease-out`} style={{ width: `${percent}%` }} />
            </div>
            <p className={`js-progress-text text-xs font-mono font-bold ${textClass}`}>{progress || starting}</p>
            {!hideDismiss ? (
                <button type="button" id="btn-sage-loading-cancel" className="arborito-sage-loading-cancel active:scale-95" onClick={onCancel}>
                    {ui.cancel || 'Cancel'}
                </button>
            ) : null}
        </div>
    );

    if (mob) {
        const head = hideDismiss ? null : (
            <SageScreenHero ui={ui} mob onClose={onClose} backAsClose />
        );
        return <SageMobPanel>{head}{loadingBody}</SageMobPanel>;
    }
    return (
        <>
            <SageOutsideDismiss onDismiss={onClose} />
            <div className="pointer-events-auto transition-all duration-300 origin-bottom-right animate-in slide-in-from-bottom-10 fade-in arborito-sage-loading-desk-wrap">
                {loadingBody}
            </div>
        </>
    );
}

export function SageChatOverlay({ overlay, ui, onCancelLoad, onCancelVoice }) {
    if (!overlay) return null;
    const pct = Math.max(0, Math.min(100, overlay.pct || 0));
    const bar =
        overlay.showBar !== false && !overlay.indeterminate ? (
            <>
                <div className="sage-chat-overlay__bar-wrap">
                    <div className={`sage-chat-overlay__bar ${overlay.barClass || 'arborito-sage-progress--ok'}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="sage-chat-overlay__pct">{pct}%</p>
            </>
        ) : overlay.indeterminate ? (
            <div className="sage-chat-overlay__bar-wrap sage-chat-overlay__bar-wrap--indeterminate">
                <div className={`sage-chat-overlay__bar ${overlay.barClass || 'bg-purple-500'}`} />
            </div>
        ) : null;
    return (
        <div id="sage-chat-overlay" className="sage-chat-overlay" aria-live="polite" aria-busy="true">
            <div className="sage-chat-overlay__card">
                <div className={`sage-chat-overlay__icon sage-chat-overlay__icon--${overlay.iconTone || 'model'}`}>
                    <ChromeEmoji emoji={overlay.iconEmoji || '🧠'} size={40} />
                </div>
                {overlay.title ? <h3 className="sage-chat-overlay__title">{overlay.title}</h3> : null}
                {overlay.msg ? <p className="sage-chat-overlay__msg">{overlay.msg}</p> : null}
                {bar}
                {overlay.showCancel ? (
                    <div className="sage-chat-overlay__actions">
                        <button
                            type="button"
                            id={overlay.isLoadOverlay ? 'btn-sage-loading-cancel' : 'btn-sage-voice-cancel'}
                            className="arborito-sage-overlay-cancel-btn arborito-btn-ghost"
                            onClick={overlay.isLoadOverlay ? onCancelLoad : onCancelVoice}
                        >
                            {ui.cancel || 'Cancelar'}
                        </button>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

export function SageVoiceConsentOverlay({ consent, ui, onAccept, onDecline }) {
    if (!consent || consent.mode === 'settings') return null;
    return (
        <div id="sage-chat-overlay" className="sage-chat-overlay" aria-live="polite">
            <div className="sage-chat-overlay__card">
                <div className="sage-chat-overlay__icon sage-chat-overlay__icon--voice">
                    <ChromeEmoji emoji={consent.kind === 'mic' ? '🎤' : '🔊'} size={40} />
                </div>
                <h3 className="sage-chat-overlay__title">{consent.title}</h3>
                <p className="sage-chat-overlay__msg whitespace-pre-wrap">{consent.body}</p>
                <div className="sage-chat-overlay__actions flex gap-2">
                    <button type="button" id="btn-voice-consent-accept-chat" className="flex-1 text-sm py-2.5 rounded-xl font-semibold arborito-cta-purple" onClick={onAccept}>
                        {ui.sageVoiceDownloadConsentAccept || 'Descargar y continuar'}
                    </button>
                    <button type="button" id="btn-voice-consent-decline-chat" className="flex-1 text-sm py-2.5 rounded-xl font-semibold arborito-btn-ghost" onClick={onDecline}>
                        {ui.sageVoiceDownloadConsentDecline || 'Cancelar'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export function sageHostClassName({ mob, construction, lessonOverlay, deskScrim }) {
    if (deskScrim) return `${SAGE_OPEN} pointer-events-auto arborito-sage-desk-scrim fixed z-[160]`;
    if (mob) {
        const frameCls = lessonOverlay
            ? 'arborito-sage-mob-frame arborito-sage-mob-frame--lesson'
            : 'arborito-sage-mob-frame';
        return `${SAGE_OPEN} fixed z-[160] ${frameCls} flex flex-col items-stretch pointer-events-none`;
    }
    return `${SAGE_OPEN} fixed inset-x-0 bottom-0 z-[160] flex flex-col items-end justify-end md:w-auto pointer-events-none`;
}
