import { useCallback, useEffect, useState } from 'react';
import { useSageAi } from '../../hooks/useSageAi.js';
import { isElectronDesktop, sageHasNativeLlmRuntime } from '../../api/electron-bridge.js';
import {
    isExpertAiEnabled,
    resolveExpertApiBase,
    resolveExpertApiKey,
    resolveExpertApiModel,
    writeExpertConfig,
} from '../../api/ai-expert-config.js';
import {
    resolveDefaultModel,
    formatModelDisplayName,
    resolveStoredBrowserModel,
    fillSageAiConsentTokens,
} from '../../api/ai-models.js';
import { resolveSageContextStrict } from '../../api/sage-ai-prefs.js';
import {
    resolveSavedModels,
    addSavedModel,
    removeSavedModel,
    parseModelInput,
} from '../../api/sage-model-prefs.js';
import {
    isSageVoiceAvailable,
    resolveSageVoiceAutoSpeak,
    resolveSageVoiceLocale,
    fetchSageVoiceAssetStatus,
    sageVoiceNeedsDownloadConsent,
    formatSageVoiceError,
    prefetchSageSttAssets,
    prefetchSageTtsAssets,
    writeSageVoiceAutoSpeak,
    writeSageVoiceLocale,
} from '../../api/sage-voice.js';
import { grantSagePiperDownloadConsent, grantSageWhisperDownloadConsent } from '../../api/sage-voice-prefs.js';

/** Sage settings form state + handlers, única puerta para SageSettings.jsx. */
export function useSageSettings({ ui, ai, voice, onSave }) {
    const sageAi = useSageAi();
    const isDesktop = isElectronDesktop();
    const isNativeLlm = sageHasNativeLlmRuntime();
    const [modelKey, setModelKey] = useState(0);
    const [voiceTestStatus, setVoiceTestStatus] = useState(null);
    const [showVoiceConsent, setShowVoiceConsent] = useState(false);
    const [voiceConsentKinds, setVoiceConsentKinds] = useState({ tts: false, mic: false });
    const [newModelInput, setNewModelInput] = useState('');
    const [selectedModel, setSelectedModel] = useState(
        () => sageAi.browserModel || resolveStoredBrowserModel(isDesktop)
    );
    const [contextPreset, setContextPreset] = useState(() => sageAi.contextPreset || 'minimal');
    const [maxTokens, setMaxTokens] = useState(() => sageAi.browserMaxNewTokens || 1536);
    const [contextStrict, setContextStrict] = useState(() => resolveSageContextStrict());
    const [voiceLocale, setVoiceLocale] = useState(() => resolveSageVoiceLocale());
    const [voiceAutoSpeak, setVoiceAutoSpeak] = useState(() => resolveSageVoiceAutoSpeak());
    const [expertEnabled, setExpertEnabled] = useState(() => isExpertAiEnabled());
    const [expertBase, setExpertBase] = useState(() => resolveExpertApiBase());
    const [expertKey, setExpertKey] = useState(() => resolveExpertApiKey());
    const [expertModel, setExpertModel] = useState(() => resolveExpertApiModel());

    const progress = ai.progress || '';
    let providerPullPct = 0;
    const providerPullMatch = progress.match(/(\d+)%/);
    if (providerPullMatch) providerPullPct = Math.min(100, parseInt(providerPullMatch[1], 10));
    const savedModels = resolveSavedModels(isNativeLlm);
    const currentModel = sageAi.browserModel || resolveStoredBrowserModel(isNativeLlm);
    const showProgressBar = !!progress;

    useEffect(() => {
        if (!isDesktop || !isSageVoiceAvailable()) return undefined;
        let cancelled = false;
        fetchSageVoiceAssetStatus(resolveSageVoiceLocale())
            .then((status) => {
                if (cancelled) return;
                const needTts = sageVoiceNeedsDownloadConsent(status, { forTts: true });
                const needMic = sageVoiceNeedsDownloadConsent(status, { forMic: true });
                setVoiceConsentKinds({ tts: needTts, mic: needMic });
                setShowVoiceConsent(needTts || needMic);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [isDesktop, modelKey]);

    useEffect(() => {
        const consent = voice.voiceConsent;
        if (consent?.mode !== 'settings' || !consent.kind) return;
        setVoiceConsentKinds((prev) => ({
            tts: prev.tts || consent.kind === 'tts',
            mic: prev.mic || consent.kind === 'mic',
        }));
        setShowVoiceConsent(true);
    }, [voice.voiceConsent]);

    const refreshModels = useCallback(() => setModelKey((k) => k + 1), []);

    const syncFormFromConfig = useCallback(() => {
        setSelectedModel(sageAi.browserModel || resolveStoredBrowserModel(isNativeLlm));
        setContextPreset(sageAi.contextPreset || 'minimal');
        setMaxTokens(sageAi.browserMaxNewTokens || 1536);
        setContextStrict(resolveSageContextStrict());
        setVoiceLocale(resolveSageVoiceLocale());
        setVoiceAutoSpeak(resolveSageVoiceAutoSpeak());
        setExpertEnabled(isExpertAiEnabled());
        setExpertBase(resolveExpertApiBase());
        setExpertKey(resolveExpertApiKey());
        setExpertModel(resolveExpertApiModel());
        setNewModelInput('');
        setVoiceTestStatus(null);
        refreshModels();
    }, [isNativeLlm, refreshModels, sageAi.browserModel, sageAi.contextPreset, sageAi.browserMaxNewTokens]);

    const onAddModel = useCallback(() => {
        const parsed = parseModelInput(newModelInput);
        if (!parsed.ok) {
            const hint =
                parsed.error === 'repo_only'
                    ? ui.sageSettingsModelRepoOnly ||
                      'Falta el archivo .gguf. Ejemplo: LiquidAI/LFM2.5-1.2B-Instruct-GGUF:LFM2.5-1.2B-Instruct-Q4_K_M.gguf'
                    : ui.sageSettingsModelFormatError || 'Formato: usuario/repo:modelo.gguf';
            alert(hint);
            return;
        }
        addSavedModel(parsed.id, isNativeLlm);
        setSelectedModel(parsed.id);
        sageAi.setConfig({ browserModel: parsed.id });
        setNewModelInput('');
        refreshModels();
    }, [newModelInput, isNativeLlm, ui, refreshModels, sageAi]);

    const onRemoveModel = useCallback(() => {
        const id = selectedModel;
        if (!id || resolveSavedModels(isNativeLlm).length <= 1) return;
        removeSavedModel(id, isNativeLlm);
        const remaining = resolveSavedModels(isNativeLlm);
        const nextModel = remaining[0] || resolveDefaultModel(isNativeLlm);
        setSelectedModel(nextModel);
        sageAi.setConfig({ browserModel: nextModel });
        refreshModels();
    }, [selectedModel, isNativeLlm, refreshModels, sageAi]);

    const onAcceptVoiceDownloadConsent = useCallback(async () => {
        const locale =
            voiceLocale === 'de' || voiceLocale === 'en' || voiceLocale === 'es'
                ? voiceLocale
                : resolveSageVoiceLocale();
        try {
            if (voiceConsentKinds.tts) {
                grantSagePiperDownloadConsent();
                await prefetchSageTtsAssets(locale);
            }
            if (voiceConsentKinds.mic) {
                grantSageWhisperDownloadConsent();
                await prefetchSageSttAssets();
            }
            setShowVoiceConsent(false);
            setVoiceConsentKinds({ tts: false, mic: false });
            voice.declineVoiceDownloadConsent?.();
        } catch (e) {
            setVoiceTestStatus({
                msg: formatSageVoiceError(e, voiceConsentKinds.mic ? 'mic' : 'tts', ui),
                ok: false,
            });
        }
    }, [voiceConsentKinds, voiceLocale, ui, voice]);

    const onDeclineVoiceDownloadConsent = useCallback(() => {
        setShowVoiceConsent(false);
        setVoiceConsentKinds({ tts: false, mic: false });
        voice.declineVoiceDownloadConsent?.();
    }, [voice]);

    const handleReset = useCallback(() => {
        sageAi.resetConfig();
        if (!isNativeLlm) {
            writeExpertConfig({
                enabled: false,
                baseUrl: 'http://127.0.0.1:11434/v1',
                apiKey: '',
                model: 'llama3.2',
            });
        }
        syncFormFromConfig();
    }, [isNativeLlm, syncFormFromConfig, sageAi]);

    const handleSave = useCallback(() => {
        const browserModel = isNativeLlm
            ? selectedModel.trim() || resolveDefaultModel(true)
            : resolveStoredBrowserModel(false) || resolveDefaultModel(false);
        if (!isNativeLlm) {
            writeExpertConfig({
                enabled: expertEnabled,
                baseUrl: expertBase,
                apiKey: expertKey,
                model: expertModel,
            });
        }
        sageAi.setConfig({
            browserModel,
            contextPreset: contextPreset || 'minimal',
            browserMaxNewTokens: maxTokens != null ? Number(maxTokens) : undefined,
            contextStrict,
        });
        if (isNativeLlm) {
            addSavedModel(browserModel, true);
            if (voiceLocale === 'de' || voiceLocale === 'en' || voiceLocale === 'es') {
                writeSageVoiceLocale(voiceLocale);
            }
            writeSageVoiceAutoSpeak(voiceAutoSpeak);
        }
        onSave?.();
    }, [
        isNativeLlm,
        selectedModel,
        expertEnabled,
        expertBase,
        expertKey,
        expertModel,
        contextPreset,
        maxTokens,
        contextStrict,
        voiceLocale,
        voiceAutoSpeak,
        onSave,
        sageAi,
    ]);

    const finishVoiceTest = useCallback(
        async (blob) => {
            setVoiceTestStatus({ msg: ui.sageVoiceProcessing || '…', ok: true });
            try {
                const status = await fetchSageVoiceAssetStatus(resolveSageVoiceLocale());
                if (status?.needsSttDownload && !sageVoiceNeedsDownloadConsent(status, { forMic: true })) {
                    await prefetchSageSttAssets();
                }
                const { text, aborted } = await voice.transcribeVoiceBlob(blob);
                if (aborted) return;
                if (text) {
                    setVoiceTestStatus({
                        msg: (ui.sageVoiceTestResult || 'I heard: «{text}»').replace('{text}', text),
                        ok: true,
                    });
                } else {
                    setVoiceTestStatus({ msg: formatSageVoiceError('', 'mic', ui), ok: false });
                }
            } catch (e) {
                setVoiceTestStatus({ msg: formatSageVoiceError(e, 'mic', ui), ok: false });
            }
        },
        [ui, voice]
    );

    const onVoiceTest = useCallback(async () => {
        if (!isSageVoiceAvailable()) {
            setVoiceTestStatus({ msg: ui.sageVoiceUnavailable || 'Voz no disponible en esta build.', ok: false });
            return;
        }
        if (voice.isVoiceRecording) {
            const blob = await voice.stopVoiceRecordingKeepProcessing();
            if (!blob) {
                setVoiceTestStatus({ msg: ui.sageVoiceTestCancelled || 'Prueba cancelada.', ok: false });
                voice.resetVoiceToIdle();
                return;
            }
            if (
                !(await voice.ensureMicAssetsOrPromptConsent('settings', async () => {
                    await finishVoiceTest(blob);
                }))
            ) {
                return;
            }
            await finishVoiceTest(blob);
            return;
        }
        if (voice.voiceState !== 'idle') {
            setVoiceTestStatus({ msg: ui.sageVoiceBusy || 'Wait for the voice operation to finish.', ok: false });
            return;
        }
        try {
            setVoiceTestStatus({ msg: ui.sageVoiceTestListening || 'Escuchando… pulsa de nuevo para detener.', ok: true });
            await voice.startVoiceRecording();
        } catch (e) {
            setVoiceTestStatus({ msg: formatSageVoiceError(e, 'mic', ui), ok: false });
        }
    }, [ui, voice, finishVoiceTest]);

    return {
        isDesktop,
        isNativeLlm,
        sageAi,
        fillSageAiConsentTokens,
        formatModelDisplayName,
        savedModels,
        currentModel,
        showProgressBar,
        providerPullPct,
        progress,
        selectedModel,
        setSelectedModel,
        contextPreset,
        setContextPreset,
        maxTokens,
        setMaxTokens,
        contextStrict,
        setContextStrict,
        voiceLocale,
        setVoiceLocale,
        voiceAutoSpeak,
        setVoiceAutoSpeak,
        expertEnabled,
        setExpertEnabled,
        expertBase,
        setExpertBase,
        expertKey,
        setExpertKey,
        expertModel,
        setExpertModel,
        newModelInput,
        setNewModelInput,
        voiceTestStatus,
        showVoiceConsent,
        onAddModel,
        onRemoveModel,
        onAcceptVoiceDownloadConsent,
        onDeclineVoiceDownloadConsent,
        handleReset,
        handleSave,
        onVoiceTest,
    };
}
