import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { DOCK_SHEET_SCROLL_PAD } from '../../../shared/ui/dock-sheet-chrome.js';
import { Callout } from '../../../shared/ui/Callout.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { ModalShell } from '../../../app/components/ModalShell.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { SageMobPanel } from './components/SageLayout.jsx';
import { SageChatOverlay } from './SageScreens.jsx';
import { sageHideDismissButton } from '../api/modals/logic/sage-ui-helpers.js';
import { SageSwitchRow } from './components/sage/SageSwitchRow.jsx';
import { useSageSettings } from './hooks/useSageSettings.jsx';

export function SageSettings({
    ui,
    ai,
    sageEnterAnim,
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
            leadingIcon={<ChromeEmoji emoji="⚙️" size={24} />}
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
            <Callout
                tone="blue"
                richHtml={
                    ui.sageAiOptionalBannerShort ||
                    ui.sageAiOptionalBanner ||
                    'La IA es opcional: todo funciona sin ella.'
                }
            />
            <section className="arborito-sage-settings-card space-y-4">
                <div className="arborito-sage-settings-card__head">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-xl shrink-0 leading-none">
                            <ChromeEmoji emoji={s.isDesktop ? '⚡' : '🔑'} size={20} />
                        </span>
                        <div className="min-w-0">
                            <p className="arborito-sage-settings-card__title arborito-sage-settings-card__title--green">
                                {s.isDesktop
                                    ? ui.sageProviderDesktopNative || 'Native (desktop)'
                                    : ui.sageExpertSettingsTitle || 'Expert mode (API)'}
                            </p>
                            <p className="arborito-sage-settings-card__hint">
                                {s.isDesktop
                                    ? ui.sageSettingsDesktopNativeDesc || ui.sageSettingsBrowserDesc
                                    : ui.sageExpertSettingsDesc || ui.sageSettingsBrowserDesc}
                            </p>
                        </div>
                    </div>
                    {s.sageAi.isProviderActive ? (
                        <span className="arborito-pill arborito-pill--sm arborito-pill--green">{ui.sageBadgeActive}</span>
                    ) : null}
                </div>

                {!s.isDesktop ? (
                    <div className="arborito-sage-settings-subpanel space-y-3">
                        <SageSwitchRow
                            id="tog-expert-enabled"
                            label={ui.sageExpertEnableLabel || 'Modo experto (API)'}
                            hint=""
                            checked={s.expertEnabled}
                            onAria={ui.sageExpertEnableOn || 'Activar modo experto'}
                            offAria={ui.sageExpertEnableOff || 'Desactivar modo experto'}
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
                            <label className="arborito-sage-settings-label text-sm" htmlFor="sel-sage-model">
                                {ui.sageSettingsModelLabel || 'Modelo de chat'}
                            </label>
                            <p className="arborito-sage-settings-meta mt-1">{ui.sageSettingsModelHint || 'Formato repo/archivo.gguf'}</p>
                        </div>
                        <select
                            id="sel-sage-model"
                            className="arborito-select text-sm w-full"
                            aria-label={ui.sageSettingsModelLabel || 'Modelo'}
                            value={s.selectedModel}
                            onChange={(e) => {
                                const id = e.target.value.trim();
                                s.setSelectedModel(id);
                                if (id) {
                                    s.sageAi.setConfig({ browserModel: id });
                                }
                            }}
                        >
                            {s.savedModels.map((m) => (
                                <option key={m} value={m} title={m.length > 48 ? m : ''}>
                                    {s.formatModelDisplayName(m)}
                                </option>
                            ))}
                        </select>
                        <p className="arborito-sage-settings-meta truncate" title={s.currentModel}>
                            {s.currentModel}
                        </p>
                        {ui.sageAiThirdPartyLicenses ? (
                            <p className="arborito-sage-settings-meta">
                                {s.fillSageAiConsentTokens(ui.sageAiThirdPartyLicenses, s.isDesktop)}
                            </p>
                        ) : null}
                        <details className="arborito-sage-settings-details">
                            <summary>{ui.sageSettingsModelManage || 'Gestionar modelos'}</summary>
                            <div className="arborito-sage-settings-details__body space-y-2">
                                <input
                                    id="inp-new-model"
                                    type="text"
                                    className="arborito-input arborito-input--compact text-sm w-full"
                                    placeholder={ui.sageSettingsModelNewPlaceholder || 'usuario/repo:modelo.gguf'}
                                    aria-label={ui.sageSettingsModelNewPlaceholder || 'Nuevo modelo'}
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
                        </details>
                    </section>
                )}

                {s.isDesktop ? (
                    <section className="arborito-sage-settings-panel arborito-sage-settings-panel--purple rounded-xl p-4 space-y-3">
                        <div>
                            <p className="arborito-sage-settings-card__title arborito-sage-settings-card__title--purple text-sm">
                                {ui.sageVoiceSettingsTitle || 'Voz'}
                            </p>
                            <p className="arborito-sage-settings-card__hint">
                                {s.fillSageAiConsentTokens(ui.sageVoiceStackNote || '', s.isDesktop)}
                            </p>
                        </div>
                        <div>
                            <label className="arborito-sage-settings-label" htmlFor="sel-voice-locale">
                                {ui.sageVoiceLocaleLabel || 'Idioma de voz'}
                            </label>
                            <select id="sel-voice-locale" className="arborito-select arborito-select--compact text-sm w-full" value={s.voiceLocale} onChange={(e) => s.setVoiceLocale(e.target.value)} aria-label={ui.sageVoiceLocaleLabel || 'Idioma de voz'}>
                                <option value="es">{ui.sageVoiceLocaleEs || 'Español'}</option>
                                <option value="en">{ui.sageVoiceLocaleEn || 'English'}</option>
                                <option value="de">{ui.sageVoiceLocaleDe || 'Deutsch'}</option>
                            </select>
                        </div>
                        <SageSwitchRow
                            id="tog-voice-auto-speak"
                            label={ui.sageVoiceAutoSpeakLabel || 'Leer respuestas en voz alta siempre'}
                            hint={ui.sageVoiceAutoSpeakHint || ''}
                            checked={s.voiceAutoSpeak}
                            onAria={ui.sageVoiceAutoSpeakOn || 'Activar lectura en voz alta'}
                            offAria={ui.sageVoiceAutoSpeakOff || 'Desactivar lectura en voz alta'}
                            onChange={s.setVoiceAutoSpeak}
                        />
                        <button type="button" id="btn-sage-voice-test" className="arborito-cta-purple w-full py-3 rounded-lg text-sm font-semibold min-h-[var(--arborito-mob-touch)]" onClick={s.onVoiceTest}>
                            {voice.isVoiceRecording ? ui.sageVoiceTestStop || 'Detener prueba' : ui.sageVoiceTestMic || 'Probar micrófono'}
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
                            <div id="sage-voice-settings-consent">
                                <Callout tone="amber" layout="stack" size="sm">
                                    <p className="arborito-callout__body text-xs m-0 mb-2 leading-normal">
                                        {ui.sageVoiceDownloadConsentBody || ''}
                                    </p>
                                </Callout>
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <button
                                        type="button"
                                        id="btn-voice-consent-accept-settings"
                                        className="flex-1 text-sm py-2 rounded-lg font-semibold arborito-cta-purple"
                                        onClick={s.onAcceptVoiceDownloadConsent}
                                    >
                                        {ui.sageVoiceDownloadConsentAccept || 'Aceptar y descargar'}
                                    </button>
                                    <button
                                        type="button"
                                        id="btn-voice-consent-decline-settings"
                                        className="flex-1 text-sm py-2 rounded-lg font-semibold arborito-btn-ghost"
                                        onClick={s.onDeclineVoiceDownloadConsent}
                                    >
                                        {ui.sageVoiceDownloadConsentDecline || 'Cancelar'}
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </section>
                ) : null}

                <details className="arborito-sage-settings-details">
                    <summary>{ui.sageSettingsAdvanced || 'Opciones avanzadas'}</summary>
                    <div className="arborito-sage-settings-details__body space-y-3">
                        <SageSwitchRow
                            id="tog-sage-context-strict"
                            label={ui.sageContextStrictLabel || 'Solo contexto del curso'}
                            hint={ui.sageContextStrictHint || ''}
                            checked={s.contextStrict}
                            onAria={ui.sageContextStrictOn || 'Activar modo estricto'}
                            offAria={ui.sageContextStrictOff || 'Permitir conocimiento general'}
                            onChange={s.setContextStrict}
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="arborito-sage-settings-label" htmlFor="sel-context-preset">
                                    {ui.sageContextPresetLabel || 'Contexto'}
                                </label>
                                <select id="sel-context-preset" className="arborito-select arborito-select--compact text-sm w-full" value={s.contextPreset} onChange={(e) => s.setContextPreset(e.target.value)}>
                                    <option value="micro">{ui.sageContextPresetMicro || 'Micro (4k)'}</option>
                                    <option value="minimal">{ui.sageContextPresetMinimal || 'Mínimo (6k)'}</option>
                                    <option value="balanced">{ui.sageContextPresetBalanced || 'Equilibrado (8k)'}</option>
                                </select>
                                <p className="arborito-sage-settings-meta mt-1">{ui.sageContextPresetHint || ''}</p>
                            </div>
                            <div>
                                <label className="arborito-sage-settings-label" htmlFor="inp-browser-max-tokens">
                                    {ui.sageMaxNewTokensLabel || 'Máx. tokens'}
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
                    {ui.sageSettingsAcceptChanges || 'Guardar'}
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
        return (
            <div className="pointer-events-auto arborito-sage-settings-mob-root" onPointerDown={stopShellBubble}>
                <SageMobPanel enterAnim={sageEnterAnim} extraClass=" arborito-sage-settings-mob-root">
                    {panel}
                </SageMobPanel>
            </div>
        );
    }

    return (
        <div className="pointer-events-auto" onPointerDown={stopShellBubble}>
            <ModalShell
                mobile={false}
                layout="centered"
                panelSize="content auto-h"
                panelTone="sage"
                rootFlags="arborito-sage-desk-scrim"
                scrim="opaque"
                shellOpts={{
                    z: 10,
                    enter: 'fade-fast',
                    panelClass: 'arborito-sage-settings-shell overflow-hidden',
                }}
                onBackdropClick={onExit}
            >
                {panel}
            </ModalShell>
        </div>
    );
}
