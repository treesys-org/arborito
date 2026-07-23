import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { createPortal } from 'react-dom';
import { isSagePointerGuarded, isSageSettingsDismissBlocked } from '../api/sage-pointer-guard.js';
import { DOCK_SHEET_SCROLL_PAD } from '../../../shared/ui/dock-sheet-chrome.js';
import { Callout } from '../../../shared/ui/Callout.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { DockModalShell, ModalShell } from '../../../app/components/ModalShell.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { SageChatOverlay } from './SageScreens.jsx';
import { sageHideDismissButton } from '../api/modals/logic/sage-ui-helpers.js';
import { SageSwitchRow } from './components/sage/SageSwitchRow.jsx';
import { useSageSettings } from './hooks/useSageSettings.jsx';

export function SageSettings({
    ui,
    ai,
    onExit,
    onSave,
    voice,
}) {
    const mob = shouldShowMobileUI();
    const hideDismiss = sageHideDismissButton();
    const s = useSageSettings({ ui, ai, voice, onSave });
    const stopShellBubble = (e) => {
        e.stopPropagation();
    };

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mob}
            title={ui.sageConfigTitle}
            leadingIcon="⚙️"
            showBack={!hideDismiss}
            showClose={!hideDismiss}
            backTagClass="btn-sage-settings-back"
            tagClass="btn-close"
            onBack={onExit}
            onClose={onExit}
        />
    );

    const body = (
        <div className={`arborito-sage-settings-body p-5 space-y-4${mob ? ' arborito-sage-settings-body--mob' : ''}`}>
            <section className="arborito-sage-settings-card space-y-4">
                <div className="arborito-sage-settings-card__head">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-xl shrink-0 leading-none">
                            <ChromeEmoji emoji={s.isNativeLlm ? '⚡' : '🔑'} size={20} />
                        </span>
                        <div className="min-w-0">
                            <p className="arborito-sage-settings-card__title arborito-sage-settings-card__title--green">
                                {s.isNativeLlm
                                    ? ui.sageProviderDesktopNative || 'Native (desktop)'
                                    : ui.sageExpertSettingsTitle || 'Expert mode (API)'}
                            </p>
                            <p className="arborito-sage-settings-card__hint">
                                {s.isNativeLlm
                                    ? ui.sageSettingsDesktopNativeDesc || ui.sageSettingsBrowserDesc
                                    : ui.sageExpertSettingsDesc || ui.sageSettingsBrowserDesc}
                            </p>
                        </div>
                    </div>
                    {s.sageAi.isProviderActive ? (
                        <span className="arborito-pill arborito-pill--sm arborito-pill--green">{ui.sageBadgeActive}</span>
                    ) : null}
                </div>

                {!s.isNativeLlm ? (
                    <div className="arborito-sage-settings-subpanel space-y-3">
                        <SageSwitchRow
                            id="tog-expert-enabled"
                            label={ui.sageExpertEnableLabel || 'Modo experto (API)'}
                            hint=""
                            checked={s.expertEnabled}
                            onAria={ui.sageExpertEnableOn || 'Enable expert mode'}
                            offAria={ui.sageExpertEnableOff || 'Disable expert mode'}
                            onChange={s.setExpertEnabled}
                        />
                        <input id="inp-expert-base" type="url" className="arborito-input arborito-input--compact text-sm w-full" placeholder="http://127.0.0.1:11434/v1" value={s.expertBase} onChange={(e) => s.setExpertBase(e.target.value)} aria-label={ui.sageExpertApiBaseLabel || 'URL API'} />
                        <input id="inp-expert-key" type="password" autoComplete="off" className="arborito-input arborito-input--compact text-sm w-full" value={s.expertKey} onChange={(e) => s.setExpertKey(e.target.value)} placeholder={ui.sageExpertApiKeyPh || ui.sageExpertApiKeyLabel || 'API key (optional)'} aria-label={ui.sageExpertApiKeyLabel || 'API key'} />
                        <input id="inp-expert-model" type="text" className="arborito-input arborito-input--compact text-sm w-full" value={s.expertModel} onChange={(e) => s.setExpertModel(e.target.value)} placeholder="llama3.2" aria-label={ui.sageExpertApiModelLabel || 'Modelo'} />
                        <p className="arborito-sage-settings-meta">{ui.sageExpertApiPrivacyNote || ''}</p>
                    </div>
                ) : (
                    <section className="arborito-sage-settings-panel arborito-sage-settings-panel--green rounded-xl p-4 space-y-3">
                        <div>
                            <p className="arborito-sage-settings-label text-sm m-0" id="sage-model-seg-label">
                                {ui.sageSettingsModelLabel || 'Modelo de chat'}
                            </p>
                        </div>
                        <div
                            className="arborito-seg-track arborito-seg-track--wide"
                            role="radiogroup"
                            aria-labelledby="sage-model-seg-label"
                        >
                            <button
                                type="button"
                                id="seg-sage-model-lfm"
                                role="radio"
                                aria-checked={!s.isDesktopSuperModel(s.selectedModel)}
                                className={`arborito-seg-btn transition-all ${
                                    !s.isDesktopSuperModel(s.selectedModel) ? 'arborito-seg-btn--active' : ''
                                }`}
                                onClick={() => {
                                    s.setSelectedModel(s.DESKTOP_NORMAL_MODEL);
                                    s.sageAi.setConfig({ browserModel: s.DESKTOP_NORMAL_MODEL });
                                }}
                            >
                                <ChromeEmoji emoji="⚡" size={14} className="mr-1.5" />
                                {ui.sageModelIntelNormal || 'Fast'}
                            </button>
                            <button
                                type="button"
                                id="seg-sage-model-super"
                                role="radio"
                                aria-checked={s.isDesktopSuperModel(s.selectedModel)}
                                className={`arborito-seg-btn transition-all ${
                                    s.isDesktopSuperModel(s.selectedModel) ? 'arborito-seg-btn--active-accent' : ''
                                }`}
                                onClick={() => {
                                    s.setSelectedModel(s.DESKTOP_SUPER_MODEL);
                                    s.sageAi.setConfig({ browserModel: s.DESKTOP_SUPER_MODEL });
                                }}
                            >
                                <ChromeEmoji emoji="🧠" size={14} className="mr-1.5" />
                                {ui.sageModelIntelHigh || 'Superintelligence'}
                            </button>
                        </div>
                        <div className="space-y-1">
                            <p className="arborito-sage-settings-meta m-0 leading-relaxed">
                                {s.isDesktopSuperModel(s.selectedModel)
                                    ? ui.sageModelSuperHint ||
                                      'More capable, but heavier. Better on a stronger PC.'
                                    : ui.sageModelNormalHint ||
                                      'Light and quick. Ideal for almost any PC.'}
                            </p>
                            <p className="arborito-sage-settings-meta m-0 leading-relaxed">
                                {(ui.sageModelTermsNote ||
                                    'Model: {model} (~{mb} MB). By using it you accept its license terms.')
                                    .replace(
                                        '{model}',
                                        s.formatModelTechnicalName(s.selectedModel)
                                    )
                                    .replace(
                                        '{mb}',
                                        String(s.estimateModelDownloadMb(s.selectedModel))
                                    )}
                            </p>
                        </div>
                        {s.vulkanSupported ? (
                            <SageSwitchRow
                                id="tog-llama-vulkan"
                                label={ui.sageVulkanLabel || 'Use GPU (Vulkan)'}
                                hint={ui.sageVulkanHint || ''}
                                checked={s.llamaVulkan}
                                onAria={ui.sageVulkanOn || 'Enable GPU'}
                                offAria={ui.sageVulkanOff || 'Disable GPU'}
                                onChange={s.onLlamaVulkanChange}
                            />
                        ) : null}
                    </section>
                )}

                {s.isDesktop ? (
                    <section className="arborito-sage-settings-panel arborito-sage-settings-panel--purple rounded-xl p-4 space-y-3">
                        <div>
                            <p className="arborito-sage-settings-card__title arborito-sage-settings-card__title--purple text-sm">
                                {ui.sageVoiceSettingsTitle || 'Voice'}
                            </p>
                            <p className="arborito-sage-settings-card__hint">
                                {s.fillSageAiConsentTokens(ui.sageVoiceStackNote || '', s.isDesktop)}
                            </p>
                        </div>
                        <div>
                            <p className="arborito-sage-settings-label m-0 mb-2" id="sage-voice-locale-label">
                                {ui.sageVoiceLocaleLabel || 'Response voice'}
                            </p>
                            <div
                                className="arborito-seg-track arborito-seg-track--wide"
                                role="radiogroup"
                                aria-labelledby="sage-voice-locale-label"
                            >
                                {[
                                    { id: 'es', label: ui.sageVoiceLocaleEs || 'Español' },
                                    { id: 'en', label: ui.sageVoiceLocaleEn || 'English' },
                                    { id: 'de', label: ui.sageVoiceLocaleDe || 'Deutsch' },
                                ].map((opt) => (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={s.voiceLocale === opt.id}
                                        className={`arborito-seg-btn transition-all ${
                                            s.voiceLocale === opt.id ? 'arborito-seg-btn--active' : ''
                                        }`}
                                        onClick={() => s.setVoiceLocale(opt.id)}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <SageSwitchRow
                            id="tog-voice-auto-speak"
                            label={ui.sageVoiceAutoSpeakLabel || 'Always read responses aloud'}
                            hint={ui.sageVoiceAutoSpeakHint || ''}
                            checked={s.voiceAutoSpeak}
                            onAria={ui.sageVoiceAutoSpeakOn || 'Enable read-aloud'}
                            offAria={ui.sageVoiceAutoSpeakOff || 'Disable read-aloud'}
                            onChange={s.setVoiceAutoSpeak}
                        />
                        <button type="button" id="btn-sage-voice-test" className="arborito-cta-purple w-full py-3 rounded-lg text-sm font-semibold min-h-[var(--arborito-mob-touch)]" onClick={s.onVoiceTest}>
                            {voice.isVoiceRecording ? ui.sageVoiceTestStop || 'Stop test' : ui.sageVoiceTestMic || 'Test microphone'}
                        </button>
                        {s.voiceTestStatus ? (
                            <p
                                id="sage-voice-test-status"
                                className={`arborito-sage-settings-meta ${s.voiceTestStatus.ok ? 'arborito-sage-status--ok' : 'arborito-sage-status--error'}`}
                                aria-live="polite"
                            >
                                {s.voiceTestStatus.msg}
                            </p>
                        ) : (
                            <p id="sage-voice-test-status" className="arborito-sage-settings-meta hidden" aria-live="polite" />
                        )}
                        {s.showVoiceConsent ? (
                            <div id="sage-voice-settings-consent" className="arborito-callout-actions">
                                <Callout tone="amber" layout="stack" size="sm">
                                    <p className="arborito-callout__body text-xs m-0 leading-normal">
                                        {ui.sageVoiceDownloadConsentBody || ''}
                                    </p>
                                </Callout>
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <button
                                        type="button"
                                        id="btn-voice-consent-accept-settings"
                                        className="flex-1 text-sm py-2 rounded-lg font-semibold arborito-cta-purple min-h-[44px]"
                                        onClick={s.onAcceptVoiceDownloadConsent}
                                    >
                                        {ui.sageVoiceDownloadConsentAccept || 'Download and continue'}
                                    </button>
                                    <button
                                        type="button"
                                        id="btn-voice-consent-decline-settings"
                                        className="flex-1 text-sm py-2 rounded-lg font-semibold arborito-btn-ghost min-h-[44px]"
                                        onClick={s.onDeclineVoiceDownloadConsent}
                                    >
                                        {ui.sageVoiceDownloadConsentDecline || 'Cancel'}
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </section>
                ) : null}

                <details className="arborito-sage-settings-details">
                    <summary>{ui.sageSettingsAdvanced || 'Opciones avanzadas'}</summary>
                    <div className="arborito-sage-settings-details__body space-y-3">
                        {s.isNativeLlm ? (
                            <div className="arborito-sage-settings-subpanel space-y-3">
                                <p className="arborito-sage-settings-card__title text-sm m-0">
                                    {ui.sageSettingsModelManage || 'Modelo personalizado (GGUF)'}
                                </p>
                                <p className="arborito-sage-settings-meta m-0">
                                    {ui.sageSettingsModelHint ||
                                        'Only if you want a GGUF file other than Fast / Superintelligence.'}
                                </p>
                                <input
                                    id="inp-new-model"
                                    type="text"
                                    className="arborito-input arborito-input--compact text-sm w-full"
                                    placeholder={ui.sageSettingsModelNewPlaceholder || 'user/repo:model.gguf'}
                                    aria-label={ui.sageSettingsModelNewPlaceholder || 'New model'}
                                    value={s.newModelInput}
                                    onChange={(e) => s.setNewModelInput(e.target.value)}
                                />
                                <div className="flex flex-wrap gap-2 pb-1">
                                    <button type="button" id="btn-add-model" className="flex-1 min-w-[8rem] text-sm py-2.5 rounded-lg font-semibold arborito-cta-green" onClick={s.onAddModel}>
                                        {ui.sageSettingsModelAdd || 'Agregar'}
                                    </button>
                                    <button type="button" id="btn-remove-model" className="flex-1 min-w-[8rem] text-sm py-2.5 rounded-lg font-semibold arborito-btn-ghost" onClick={s.onRemoveModel}>
                                        {ui.sageSettingsModelRemove || 'Quitar'}
                                    </button>
                                </div>
                            </div>
                        ) : null}
                        {s.isNativeLlm ? (
                            <div className="arborito-sage-settings-subpanel space-y-3">
                                <p className="arborito-sage-settings-card__title text-sm m-0">
                                    {ui.sageExpertSettingsTitle || 'Expert mode (API)'}
                                </p>
                                <p className="arborito-sage-settings-meta m-0">
                                    {ui.sageDesktopExpertApiHint ||
                                        ui.sageExpertSettingsDesc ||
                                        'Optional OpenAI-compatible API instead of the local model.'}
                                </p>
                                <SageSwitchRow
                                    id="tog-expert-enabled-desktop"
                                    label={ui.sageExpertEnableLabel || 'Expert mode (API)'}
                                    hint=""
                                    checked={s.expertEnabled}
                                    onAria={ui.sageExpertEnableOn || 'Enable expert mode'}
                                    offAria={ui.sageExpertEnableOff || 'Disable expert mode'}
                                    onChange={s.setExpertEnabled}
                                />
                                {s.expertEnabled ? (
                                    <>
                                        <input
                                            id="inp-expert-base-desktop"
                                            type="url"
                                            className="arborito-input arborito-input--compact text-sm w-full"
                                            placeholder="http://127.0.0.1:11434/v1"
                                            value={s.expertBase}
                                            onChange={(e) => s.setExpertBase(e.target.value)}
                                            aria-label={ui.sageExpertApiBaseLabel || 'API URL'}
                                        />
                                        <input
                                            id="inp-expert-key-desktop"
                                            type="password"
                                            autoComplete="off"
                                            className="arborito-input arborito-input--compact text-sm w-full"
                                            value={s.expertKey}
                                            onChange={(e) => s.setExpertKey(e.target.value)}
                                            placeholder={ui.sageExpertApiKeyPh || ui.sageExpertApiKeyLabel || 'API key (optional)'}
                                            aria-label={ui.sageExpertApiKeyLabel || 'API key'}
                                        />
                                        <input
                                            id="inp-expert-model-desktop"
                                            type="text"
                                            className="arborito-input arborito-input--compact text-sm w-full"
                                            value={s.expertModel}
                                            onChange={(e) => s.setExpertModel(e.target.value)}
                                            placeholder="llama3.2"
                                            aria-label={ui.sageExpertApiModelLabel || 'Model'}
                                        />
                                        <p className="arborito-sage-settings-meta">{ui.sageExpertApiPrivacyNote || ''}</p>
                                    </>
                                ) : null}
                            </div>
                        ) : null}
                        <SageSwitchRow
                            id="tog-sage-context-strict"
                            label={ui.sageContextStrictLabel || 'Solo contexto del curso'}
                            hint={ui.sageContextStrictHint || ''}
                            checked={s.contextStrict}
                            onAria={ui.sageContextStrictOn || 'Branch context only'}
                            offAria={ui.sageContextStrictOff || 'Permitir conocimiento general'}
                            onChange={s.setContextStrict}
                        />
                        <div className="space-y-3">
                            <div>
                                <p className="arborito-sage-settings-label m-0 mb-2" id="sage-context-preset-label">
                                    {ui.sageContextPresetLabel || 'Contexto'}
                                </p>
                                <div
                                    className="arborito-seg-track arborito-seg-track--wide"
                                    role="radiogroup"
                                    aria-labelledby="sage-context-preset-label"
                                >
                                    {[
                                        { id: 'micro', label: ui.sageContextPresetMicro || 'Micro (4k)' },
                                        { id: 'minimal', label: ui.sageContextPresetMinimal || 'Minimal (6k)' },
                                        { id: 'balanced', label: ui.sageContextPresetBalanced || 'Equilibrado (8k)' },
                                    ].map((opt) => (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            role="radio"
                                            aria-checked={s.contextPreset === opt.id}
                                            className={`arborito-seg-btn transition-all ${
                                                s.contextPreset === opt.id ? 'arborito-seg-btn--active' : ''
                                            }`}
                                            onClick={() => s.setContextPreset(opt.id)}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                                <p className="arborito-sage-settings-meta mt-1">{ui.sageContextPresetHint || ''}</p>
                            </div>
                            <div>
                                <label className="arborito-sage-settings-label" htmlFor="inp-browser-max-tokens">
                                    {ui.sageMaxNewTokensLabel || 'Max tokens'}
                                </label>
                                <input
                                    id="inp-browser-max-tokens"
                                    type="number"
                                    min="128"
                                    max={s.sageAi.maxBrowserNewTokens}
                                    step="64"
                                    className="arborito-input arborito-input--compact text-sm w-full"
                                    value={s.maxTokens}
                                    onChange={(e) => s.setMaxTokens(Number(e.target.value))}
                                />
                                <p className="arborito-sage-settings-meta mt-1">{ui.sageMaxNewTokensHint || ''}</p>
                            </div>
                        </div>
                        {s.isNativeLlm ? (
                            <div className="arborito-sage-settings-subpanel space-y-2">
                                <p className="arborito-sage-settings-card__title text-sm m-0">
                                    {ui.sageRestoreAiTitle || 'Reset AI'}
                                </p>
                                <p className="arborito-sage-settings-meta m-0">
                                    {ui.sageRestoreAiHint ||
                                        'Deletes downloaded models from this device and turns AI off until you enable it again.'}
                                </p>
                                <button
                                    type="button"
                                    id="btn-sage-restore-ai"
                                    className="w-full text-sm py-2.5 rounded-lg font-semibold arborito-btn-ghost"
                                    onClick={s.onRestoreAi}
                                >
                                    {ui.sageRestoreAiAction || 'Delete models and reset AI'}
                                </button>
                            </div>
                        ) : null}
                    </div>
                </details>

                {s.showProgressBar ? (
                    <div>
                        <p className="arborito-sage-settings-card__title arborito-sage-settings-card__title--green text-xs mb-1">{s.progress}</p>
                        <div className="arborito-sage-settings-progress-track">
                            <div className="arborito-cta-green h-full min-w-0 transition-[width] duration-300 ease-out" style={{ width: `${s.providerPullPct}%` }} />
                        </div>
                    </div>
                ) : null}
            </section>
        </div>
    );

    const footer = (
        <div className="arborito-sage-settings-footer shrink-0">
            <div className="arborito-sage-settings-footer-actions">
                <button type="button" id="btn-use-browser" className="arborito-cta-green flex-1 py-3 font-bold rounded-xl text-sm shadow transition-transform active:scale-[0.98]" onClick={s.handleSave}>
                    {ui.sageSettingsAcceptChanges || 'Apply changes'}
                </button>
                <button
                    type="button"
                    id="btn-reset-config"
                    className="arborito-btn-ghost flex-1 py-3 rounded-xl text-sm font-semibold"
                    onClick={s.handleReset}
                >
                    {ui.sageSettingsRestoreDefaults || 'Restablecer'}
                </button>
            </div>
        </div>
    );

    const panel = (
        <>
            {hero}
            <div className={DOCK_SHEET_SCROLL_PAD}>{body}</div>
            {footer}
            <SageChatOverlay overlay={voice.voiceOverlay} ui={ui} onCancelLoad={voice.cancelVoiceProcessing} onCancelVoice={voice.cancelVoiceProcessing} />
        </>
    );

    if (mob) {
        const dismiss = () => {
            if (isSagePointerGuarded() || isSageSettingsDismissBlocked()) return;
            onExit();
        };
        return createPortal(
            <div className="arborito-sage-settings-mob-root pointer-events-auto" onPointerDown={stopShellBubble}>
                <DockModalShell
                    mobile
                    skipBodyWrap
                    hero={hero}
                    footer={footer}
                    shellOpts={{
                        rootFlags: 'arborito-modal--sage-settings',
                        backdropId: 'sage-settings-backdrop',
                        z: 240,
                    }}
                    onBackdropClick={dismiss}
                >
                    <div className={DOCK_SHEET_SCROLL_PAD}>{body}</div>
                    <SageChatOverlay
                        overlay={voice.voiceOverlay}
                        ui={ui}
                        onCancelLoad={voice.cancelVoiceProcessing}
                        onCancelVoice={voice.cancelVoiceProcessing}
                    />
                </DockModalShell>
            </div>,
            document.body
        );
    }

    return (
        <div className="arborito-sage-settings-desk-root pointer-events-auto" onPointerDown={stopShellBubble}>
            <ModalShell
                mobile={false}
                layout="centered"
                panelSize="content auto-h"
                panelTone="sage"
                backdropId="sage-settings-backdrop"
                rootFlags="arborito-modal--sage-settings"
                scrim="none"
                shellOpts={{
                    enter: 'instant',
                    panelClass: 'arborito-sage-settings-shell overflow-hidden',
                }}
                onBackdropClick={() => {
                    if (isSagePointerGuarded() || isSageSettingsDismissBlocked()) return;
                    onExit();
                }}
            >
                {panel}
            </ModalShell>
        </div>
    );
}
