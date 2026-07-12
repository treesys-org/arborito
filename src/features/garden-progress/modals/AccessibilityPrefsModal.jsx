import { useGardenProgress } from '../hooks/useGardenProgress.js';
import { useEffect, useState } from 'react';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { Callout } from '../../../shared/ui/Callout.jsx';
import { isElectronDesktop } from '../../learning/api/electron-bridge.js';
import { DockModalShell, ModalCenteredShell } from '../../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { SwitchRow } from '../../../shared/ui/SwitchRow.jsx';
import { modalCtaConfirmFull } from '../../../shared/ui/modal-action-chrome.js';
import {
    getA11yPrefs,
    writeReadAloudLessons,
    writeAnnounceUiChanges,
    writeReadAloudUi,
    resolveReadAloudUi,
    resolvePreferPiperVoice,
    writePreferPiperVoice,
} from '../../learning/api/a11y-prefs.js';
import { ensureDesktopTtsBeforeEnable } from '../../learning/api/sage-voice-consent-flow.js';
import {
    resolveSageVoiceAutoSpeak,
    writeSageVoiceAutoSpeak,
    fetchSageVoiceAssetStatus,
    sageVoiceNeedsDownloadConsent,
    resolveSageVoiceLocale,
    writeSageVoiceLocale,
    primeWebSpeechForBrowser,
} from '../../learning/api/sage-voice.js';
import { speakText } from '../../learning/api/read-aloud.js';

export function ModalAccessibilityPrefs({ embed = false }) {
    const { ui, dismissModal } = useGardenProgress();
    const [, tick] = useState(0);
    const refresh = () => tick((n) => n + 1);
    const prefs = getA11yPrefs();
    const mobile = embed ? true : shouldShowMobileUI();
    const isDesktop = isElectronDesktop();
    const sageAuto = resolveSageVoiceAutoSpeak();
    const piperLocale = resolveSageVoiceLocale();
    const [consentBanner, setConsentBanner] = useState(null);

    const title = ui.a11yPrefsTitle || 'Accesibilidad';
    const platformNote = isDesktop ? ui.a11yDesktopPlatformNote || '' : ui.a11yWebPlatformNote || '';
    const optionsHeading = isDesktop
        ? ui.a11yPrefsTitle || 'Accesibilidad'
        : ui.a11yWebOptionsHeading || 'Opciones en el navegador';

    useEffect(() => {
        if (!isDesktop) return undefined;
        let cancelled = false;
        void (async () => {
            const status = await fetchSageVoiceAssetStatus(resolveSageVoiceLocale());
            if (cancelled) return;
            if (sageVoiceNeedsDownloadConsent(status, { forTts: true })) {
                const estMb = status?.piperVoiceEstMb || 20;
                setConsentBanner(
                    ui.a11yPiperDownloadBanner ||
                        `Read-aloud on desktop downloads a local voice (~${estMb} MB). Turn on a voice option to download after you accept.`
                );
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isDesktop, ui.a11yPiperDownloadBanner]);

    const close = () => {
        if (embed) return;
        dismissModal();
    };

    const wireToggle = async ({
        read,
        write,
        needsTtsConsent = false,
        primeWebSpeech = false,
    }) => {
        const next = !read();
        if (next && needsTtsConsent) {
            const ok = await ensureDesktopTtsBeforeEnable(ui);
            if (!ok) return;
        }
        if (next && primeWebSpeech) {
            await primeWebSpeechForBrowser();
        }
        write(next);
        setConsentBanner(null);
        refresh();
    };

    const bodyContent = (
        <>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal m-0 mb-2">
                {ui.a11yPrefsIntro || ''}
            </p>
            {platformNote ? (
                <Callout
                    tone="sky"
                    size="sm"
                    inline
                    extraClass="font-semibold leading-snug m-0 mb-3"
                    body={platformNote}
                />
            ) : null}
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200 m-0 mb-2">
                {optionsHeading}
            </p>
            <div className="divide-y divide-slate-100 dark:divide-slate-800" role="group" aria-label={title}>
                <SwitchRow
                    id="a11y-pref-read-lessons"
                    label={ui.a11yReadLessonsLabel || 'Leer lecciones en voz alta'}
                    hint={ui.a11yReadLessonsHint || ''}
                    checked={prefs.readAloudLessons}
                    onAria={ui.a11yReadLessonsOn || 'Activar lectura de lecciones'}
                    offAria={ui.a11yReadLessonsOff || 'Desactivar lectura de lecciones'}
                    onChange={() =>
                        wireToggle({
                            read: () => prefs.readAloudLessons,
                            write: writeReadAloudLessons,
                            needsTtsConsent: isDesktop && resolvePreferPiperVoice(),
                            primeWebSpeech: !isDesktop,
                        })
                    }
                />
                {isDesktop && (
                    <SwitchRow
                        id="a11y-pref-sage-auto"
                        label={ui.sageVoiceAutoSpeakLabel || 'Leer respuestas de Sage'}
                        hint={ui.a11ySageAutoSpeakHint || ''}
                        checked={sageAuto}
                        onAria={ui.sageVoiceAutoSpeakOn || 'Activar'}
                        offAria={ui.sageVoiceAutoSpeakOff || 'Desactivar'}
                        onChange={() =>
                            wireToggle({
                                read: resolveSageVoiceAutoSpeak,
                                write: writeSageVoiceAutoSpeak,
                                needsTtsConsent: true,
                            })
                        }
                    />
                )}
                <SwitchRow
                    id="a11y-pref-read-ui"
                    label={ui.a11yReadUiLabel || 'Leer etiquetas de la interfaz'}
                    hint={ui.a11yReadUiHint || ''}
                    checked={prefs.readAloudUi}
                    onAria={ui.a11yReadUiOn || 'Activar lectura de la interfaz'}
                    offAria={ui.a11yReadUiOff || 'Desactivar lectura de la interfaz'}
                    onChange={() =>
                        wireToggle({
                            read: resolveReadAloudUi,
                            write: writeReadAloudUi,
                            primeWebSpeech: !isDesktop,
                        })
                    }
                />
                <SwitchRow
                    id="a11y-pref-announce"
                    label={ui.a11yAnnounceUiLabel || 'Anunciar cambios de pantalla'}
                    hint={ui.a11yAnnounceUiHint || ''}
                    checked={prefs.announceUi}
                    onAria={ui.a11yAnnounceUiOn || 'Activar anuncios'}
                    offAria={ui.a11yAnnounceUiOff || 'Desactivar anuncios'}
                    onChange={() =>
                        wireToggle({
                            read: () => prefs.announceUi,
                            write: writeAnnounceUiChanges,
                        })
                    }
                />
            </div>

            {isDesktop && (
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200 m-0 mb-2">
                        {ui.a11yPiperSectionHeading || 'Voz de lectura (escritorio)'}
                    </p>
                    <div
                        className="divide-y divide-slate-100 dark:divide-slate-800"
                        role="group"
                        aria-label={ui.a11yPiperVoiceLabel || 'Voz Piper'}
                    >
                        <SwitchRow
                            id="a11y-pref-piper"
                            label={ui.a11yPiperVoiceLabel || 'Voz mejorada Piper (local)'}
                            hint={ui.a11yPiperVoiceHint || ''}
                            checked={prefs.preferPiper}
                            onAria={ui.a11yPiperVoiceOn || 'Activar voz Piper'}
                            offAria={ui.a11yPiperVoiceOff || 'Desactivar voz Piper'}
                            onChange={() =>
                                wireToggle({
                                    read: resolvePreferPiperVoice,
                                    write: writePreferPiperVoice,
                                    needsTtsConsent: true,
                                })
                            }
                        />
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 mb-2 leading-snug m-0">
                        {ui.a11yPiperLocaleHint || ui.sageVoiceLocaleLabel || ''}
                    </p>
                    <div className="flex gap-2">
                        {(['es', 'en', 'de']).map((code) => (
                            <button
                                key={code}
                                type="button"
                                className={`a11y-piper-locale flex-1 min-h-[40px] rounded-lg border-2 text-xs font-bold transition-all ${piperLocale === code ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/40 text-violet-900 dark:text-violet-100' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}
                                onClick={() => {
                                    writeSageVoiceLocale(code);
                                    refresh();
                                }}
                            >
                                {code === 'es'
                                    ? ui.sageVoiceLocaleEs || 'Español'
                                    : code === 'en'
                                      ? ui.sageVoiceLocaleEn || 'English'
                                      : ui.sageVoiceLocaleDe || 'Deutsch'}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <button
                type="button"
                id="a11y-pref-test-voice"
                className={`${modalCtaConfirmFull('sky')} mt-3`}
                onClick={async () => {
                    if (isDesktop) {
                        const ok = await ensureDesktopTtsBeforeEnable(ui);
                        if (!ok) return;
                    } else {
                        await primeWebSpeechForBrowser();
                    }
                    void speakText(ui.a11yTestVoiceSample || 'Arborito accessibility is on.');
                }}
            >
                {isDesktop
                    ? ui.a11yTestVoiceBtnDesktop || ui.a11yTestVoiceBtn || 'Probar voz'
                    : ui.a11yTestVoiceBtn || 'Probar voz del sistema'}
            </button>

            {consentBanner ? (
                <div
                    id="a11y-voice-consent"
                    className="mt-3 p-3 rounded-xl border border-violet-200/80 dark:border-violet-800/60 bg-violet-50/80 dark:bg-violet-950/30 text-[11px] leading-snug text-violet-950 dark:text-violet-100"
                >
                    {consentBanner}
                </div>
            ) : null}

            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-4 leading-snug m-0">
                {isDesktop ? ui.a11ySageVoiceNote || '' : ui.a11yWebVoiceNote || ''}
            </p>
        </>
    );

    if (embed) {
        return (
            <div
                data-arborito-panel="modal-accessibility-prefs"
                data-embed="1"
                className="arborito-a11y-embed-root flex flex-col flex-1 min-h-0 w-full min-w-0 overflow-y-auto custom-scrollbar px-4 pt-2 pb-4"
            >
                {bodyContent}
            </div>
        );
    }

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={title}
            titleTruncate
            titleId="accessibility-prefs-title"
            leadingIcon="♿"
            tagClass="btn-close"
            onClose={close}
        />
    );

    const body = (
        <div className="px-4 pb-6 pt-2 flex flex-col min-h-0 flex-1 overflow-y-auto custom-scrollbar">
            {bodyContent}
        </div>
    );

    if (mobile) {
        return (
            <div data-arborito-panel="modal-accessibility-prefs">
                <DockModalShell
                    mobile
                    sizeTier="COMPACT"
                    layout="dock-bottom"
                    shellOpts={{ rootFlags: 'arborito-modal--accessibility-prefs', scrim: 'translucent' }}
                    panelClass="arborito-modal-dock-panel w-full max-h-[85vh]"
                    onBackdropClick={close}
                    hero={hero}
                >
                    {body}
                </DockModalShell>
            </div>
        );
    }

    return (
        <div data-arborito-panel="modal-accessibility-prefs">
            <ModalCenteredShell
                mobile={false}
                layout="centered"
                sizeTier="COMPACT"
                hero={hero}
                panelRadius="2xl"
                shellOpts={{
                    rootFlags: 'arborito-modal--accessibility-prefs',
                    enter: 'fade-fast',
                    scrim: 'translucent',
                }}
                onBackdropClick={close}
            >
                {body}
            </ModalCenteredShell>
        </div>
    );
}
