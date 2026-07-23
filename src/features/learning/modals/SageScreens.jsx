import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { Callout } from '../../../shared/ui/Callout.jsx';
import { LocaleRichText } from '../../../shared/ui/LocaleRichText.jsx';
import { fillSageAiConsentTokens } from '../api/ai-models.js';
import { isElectronDesktop, pickHostUi } from '../api/electron-bridge.js';
import { DOCK_SHEET_SCROLL_PAD } from '../../../shared/ui/dock-sheet-chrome.js';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { SageModeToggle, SageMobPanel, SageDeskGuideShell } from './components/SageLayout.jsx';
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
            leadingIcon={leadingIcon ?? '🦉'}
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

export function SageDynamicConsent({ ui, sageEnterAnim, isAi, onSwitchMode, onAccept, onDecline, embedded = false }) {
    const mob = shouldShowMobileUI();
    const body = (
        <div className={`${DOCK_SHEET_SCROLL_PAD} arborito-callout-actions`}>
            <Callout
                tone="blue"
                layout="stack"
                body={ui.sageExperimentalDisclaimer || ui.sageExperimentalBuggyWarn || ''}
            />
            <button type="button" id="btn-accept-dynamic-consent" className="arborito-cta-purple w-full py-3 font-bold rounded-xl shadow-lg active:scale-95 transition-transform" onClick={onAccept}>
                {ui.sageGdprAccept || ui.sageExperimentalOptIn || 'Enable AI (optional)'}
            </button>
            <button type="button" id="btn-sage-decline-dynamic" className="arborito-sage-decline-btn" onClick={onDecline}>
                {ui.sageExperimentalStayGuide || 'No thanks, stay in Guide mode'}
            </button>
        </div>
    );
    const hero = (
        <SageScreenHero
            ui={ui}
            mob={mob}
            title={ui.sageGdprTitle || ui.sageExperimentalTitle || 'Optional AI · privacy'}
            trailing={<SageModeToggle ui={ui} isAi={isAi} onChange={onSwitchMode} />}
            onClose={onDecline}
            backAsClose
        />
    );
    const panel = body;
    if (mob && embedded) {
        return (
            <div className="arborito-sage-embedded flex flex-col flex-1 min-h-0">
                {hero}
                {panel}
            </div>
        );
    }
    if (mob) {
        return (
            <SageMobPanel guide hero={hero} enterAnim={sageEnterAnim}>
                {panel}
            </SageMobPanel>
        );
    }
    return <SageDeskGuideShell enterAnim={sageEnterAnim} hero={hero}>{panel}</SageDeskGuideShell>;
}

export function SageWebAiGate({ ui, sageEnterAnim, isAi, onSwitchMode, onExpertSetup, onStayGuide, embedded = false }) {
    const mob = shouldShowMobileUI();
    const body = (
        <div className={`${DOCK_SHEET_SCROLL_PAD} arborito-callout-actions`}>
            <Callout tone="blue" layout="stack">
                <p className="arborito-callout__body m-0">
                    <LocaleRichText
                        html={pickHostUi(
                            ui,
                            'sageWebAiUnavailableBody',
                            'sageWebAiUnavailableBodyApp',
                            ''
                        )}
                    />
                </p>
            </Callout>
            <button
                type="button"
                id="btn-sage-expert-setup"
                className="arborito-cta-purple w-full py-3 font-bold rounded-xl shadow-lg active:scale-95 transition-transform"
                onClick={(e) => {
                    e.stopPropagation();
                    onExpertSetup(e);
                }}
            >
                {ui.sageWebExpertSetupBtn || 'Expert mode, connect API'}
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
            trailing={<SageModeToggle ui={ui} isAi={isAi} onChange={onSwitchMode} />}
            onClose={onStayGuide}
            backAsClose
        />
    );
    const panel = body;
    if (mob && embedded) {
        return (
            <div className="arborito-sage-embedded flex flex-col flex-1 min-h-0">
                {hero}
                {panel}
            </div>
        );
    }
    if (mob) {
        return <SageMobPanel hero={hero} enterAnim={sageEnterAnim}>{panel}</SageMobPanel>;
    }
    return <SageDeskGuideShell enterAnim={sageEnterAnim} hero={hero}>{panel}</SageDeskGuideShell>;
}

export function SageDownloadConsent({ ui, sageEnterAnim, isAi, onSwitchMode, onAccept, onDecline, embedded = false }) {
    const mob = shouldShowMobileUI();
    const isDesktop = isElectronDesktop();
    const gdprBody = fillSageAiConsentTokens(ui.sageGdprText || '', isDesktop);
    const gdprNote = fillSageAiConsentTokens(ui.sageGdprConnectsNote || '', isDesktop);
    const licenseText = ui.sageAiThirdPartyLicenses
        ? fillSageAiConsentTokens(ui.sageAiThirdPartyLicenses, isDesktop)
        : '';
    const message = [gdprBody, gdprNote].filter(Boolean).join(' ');
    const body = (
        <div className={`${DOCK_SHEET_SCROLL_PAD} arborito-callout-actions`}>
            {message ? (
                <Callout tone="blue" layout="stack" body={message} />
            ) : null}
            {licenseText ? (
                <p className="arborito-sage-settings-meta text-center sm:text-left m-0 px-0.5 leading-relaxed text-xs">
                    {licenseText}
                </p>
            ) : null}
            <button type="button" id="btn-accept-consent" className="arborito-cta-blue w-full py-3 font-bold rounded-xl shadow-lg active:scale-95 transition-transform" onClick={onAccept}>
                {ui.sageGdprAccept || 'Accept'}
            </button>
            <button type="button" id="btn-sage-decline-download" className="arborito-sage-decline-btn" onClick={onDecline}>
                {ui.sageExperimentalStayGuide || 'No thanks, stay in Guide mode'}
            </button>
        </div>
    );
    const hero = (
        <SageScreenHero
            ui={ui}
            mob={mob}
            title={ui.sageGdprTitle || ''}
            leadingIcon="📡"
            trailing={<SageModeToggle ui={ui} isAi={isAi} onChange={onSwitchMode} />}
            onClose={onDecline}
            backAsClose
        />
    );
    const panel = body;
    if (mob && embedded) {
        return (
            <div className="arborito-sage-embedded flex flex-col flex-1 min-h-0">
                {hero}
                {panel}
            </div>
        );
    }
    if (mob) {
        return <SageMobPanel guide hero={hero} enterAnim={sageEnterAnim}>{panel}</SageMobPanel>;
    }
    return <SageDeskGuideShell enterAnim={sageEnterAnim} hero={hero}>{panel}</SageDeskGuideShell>;
}

export function SageLoadingScreen({ ui, progress, onCancel, onClose, embedded = false }) {
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
                <button type="button" id="btn-sage-loading-cancel" className="arborito-sage-loading-cancel arborito-btn-ghost arborito-cta-slate py-2 px-4 rounded-xl font-semibold text-sm active:scale-95" onClick={onCancel}>
                    {ui.cancel || 'Cancel'}
                </button>
            ) : null}
        </div>
    );

    if (mob) {
        const head = hideDismiss ? null : (
            <SageScreenHero ui={ui} mob onClose={onClose} backAsClose />
        );
        const body = (
            <>
                {head}
                {loadingBody}
            </>
        );
        if (embedded) {
            return <div className="arborito-sage-embedded flex flex-col flex-1 min-h-0">{body}</div>;
        }
        return <SageMobPanel hero={head}>{loadingBody}</SageMobPanel>;
    }
    return (
        <div className="pointer-events-auto transition-all duration-300 origin-bottom-right animate-in slide-in-from-bottom-10 fade-in arborito-sage-loading-desk-wrap">
            {loadingBody}
        </div>
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
                <Callout
                    tone={overlay.iconTone === 'voice' ? 'purple' : 'slate'}
                    layout="centered"
                    icon={overlay.iconEmoji || '🧠'}
                    title={overlay.title}
                    body={overlay.msg}
                    extraClass="sage-chat-overlay__callout w-full border-0 bg-transparent shadow-none p-0 m-0"
                    titleClass="sage-chat-overlay__title arborito-callout__title m-0"
                    bodyClass="sage-chat-overlay__msg arborito-callout__body m-0"
                />
                {bar}
                {overlay.showCancel ? (
                    <div className="sage-chat-overlay__actions">
                        <button
                            type="button"
                            id={overlay.isLoadOverlay ? 'btn-sage-loading-cancel' : 'btn-sage-voice-cancel'}
                            className="arborito-sage-overlay-cancel-btn arborito-btn-ghost arborito-cta-slate py-2.5 px-4 rounded-xl font-semibold text-sm"
                            onClick={overlay.isLoadOverlay ? onCancelLoad : onCancelVoice}
                        >
                            {ui.cancel || 'Cancel'}
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
                <Callout
                    tone="purple"
                    layout="centered"
                    icon={consent.kind === 'mic' ? '🎤' : '🔊'}
                    title={consent.title}
                    body={consent.body}
                    extraClass="sage-chat-overlay__callout w-full border-0 bg-transparent shadow-none p-0 m-0"
                    titleClass="sage-chat-overlay__title arborito-callout__title m-0"
                    bodyClass="sage-chat-overlay__msg arborito-callout__body m-0 whitespace-pre-wrap"
                />
                <div className="sage-chat-overlay__actions flex gap-2 w-full">
                    <button type="button" id="btn-voice-consent-accept-chat" className="flex-1 text-sm py-2.5 rounded-xl font-semibold arborito-cta-purple min-h-[44px]" onClick={onAccept}>
                        {ui.sageVoiceDownloadConsentAccept || 'Download and continue'}
                    </button>
                    <button type="button" id="btn-voice-consent-decline-chat" className="flex-1 text-sm py-2.5 rounded-xl font-semibold arborito-btn-ghost min-h-[44px]" onClick={onDecline}>
                        {ui.sageVoiceDownloadConsentDecline || 'Cancel'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export function sageHostClassName({ mob, deskScrim }) {
    if (deskScrim) return `${SAGE_OPEN} pointer-events-auto arborito-sage-desk-scrim fixed z-[235]`;
    if (mob) {
        return `${SAGE_OPEN} fixed z-[235] arborito-sage-mob-frame flex flex-col items-stretch pointer-events-none`;
    }
    return `${SAGE_OPEN} fixed inset-x-0 bottom-0 z-[235] flex flex-col items-end justify-end md:w-auto pointer-events-none`;
}
