import { useCallback, useEffect, useState } from 'react';
import { useSageAi } from '../../hooks/useSageAi.js';
import { isElectronDesktop, sageHasNativeLlmRuntime } from '../../api/electron-bridge.js';
import { llamacppStatus } from '../../api/ai-llamacpp-bridge.js';
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
    formatModelOptionLabel,
    formatModelTechnicalName,
    estimateModelDownloadMb,
    resolveStoredBrowserModel,
    fillSageAiConsentTokens,
} from '../../api/ai-models.js';
import {
    resolveSageContextStrict,
    resolveLlamaVulkan,
    writeLlamaVulkan,
    resetLlamaVulkanPref,
} from '../../api/sage-ai-prefs.js';
import {
    resolveSavedModels,
    addSavedModel,
    removeSavedModel,
    parseModelInput,
    resolveDesktopChatModel,
    DESKTOP_NORMAL_MODEL,
    DESKTOP_SUPER_MODEL,
    isDesktopSuperModel,
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
import { llamacppClearModels } from '../../api/ai-llamacpp-bridge.js';
import { revokeSageAiConsents } from '../../api/sage-ai-consent.js';
import { getArboritoStore } from '../../../../core/store-singleton.js';

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
        () =>
            isNativeLlm
                ? resolveDesktopChatModel(sageAi.browserModel || resolveStoredBrowserModel(true))
                : sageAi.browserModel || resolveStoredBrowserModel(isDesktop)
    );
    const [contextPreset, setContextPreset] = useState(() => sageAi.contextPreset || 'minimal');
    const [maxTokens, setMaxTokens] = useState(() => sageAi.browserMaxNewTokens || 1536);
    const [contextStrict, setContextStrict] = useState(() => resolveSageContextStrict());
    const [llamaVulkan, setLlamaVulkan] = useState(() => resolveLlamaVulkan());
    const [vulkanSupported, setVulkanSupported] = useState(false);
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
        if (!isNativeLlm) {
            setVulkanSupported(false);
            setLlamaVulkan(false);
            return undefined;
        }
        let cancelled = false;
        const syncVulkanFromRuntime = () => {
            llamacppStatus()
                .then((st) => {
                    if (cancelled) return;
                    setVulkanSupported(!!st?.vulkanSupported);
                    if (st?.ready) {
                        /* Mirror the running backend so a Vulkan→CPU fallback stays honest. */
                        const active = !!st.vulkanActive;
                        setLlamaVulkan(active);
                        writeLlamaVulkan(active);
                    } else {
                        /* Server not up yet: show preferred default (ON unless user opted out). */
                        setLlamaVulkan(resolveLlamaVulkan());
                    }
                })
                .catch(() => {
                    if (!cancelled) {
                        setVulkanSupported(false);
                        setLlamaVulkan(resolveLlamaVulkan());
                    }
                });
        };
        syncVulkanFromRuntime();
        const t = setInterval(syncVulkanFromRuntime, 2000);
        return () => {
            cancelled = true;
            clearInterval(t);
        };
    }, [isNativeLlm, progress]);

    const onLlamaVulkanChange = useCallback(
        async (enabled) => {
            const on = !!enabled;
            /* Optimistic UI while the server restarts; poll snaps to the real backend. */
            setLlamaVulkan(on);
            writeLlamaVulkan(on);
            if (!isNativeLlm) return;
            try {
                sageAi.setConfig({
                    browserModel:
                        resolveDesktopChatModel(selectedModel) || DESKTOP_NORMAL_MODEL,
                });
                for (let i = 0; i < 60; i += 1) {
                    await new Promise((r) => setTimeout(r, 500));
                    const st = await llamacppStatus();
                    if (st?.ready) {
                        const active = !!st.vulkanActive;
                        setLlamaVulkan(active);
                        writeLlamaVulkan(active);
                        break;
                    }
                }
            } catch (_) {
                setLlamaVulkan(false);
                writeLlamaVulkan(false);
            }
        },
        [isNativeLlm, sageAi, selectedModel]
    );

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
        setSelectedModel(
            isNativeLlm
                ? resolveDesktopChatModel(sageAi.browserModel || resolveStoredBrowserModel(true))
                : sageAi.browserModel || resolveStoredBrowserModel(isNativeLlm)
        );
        setContextPreset(sageAi.contextPreset || 'minimal');
        setMaxTokens(sageAi.browserMaxNewTokens || 1536);
        setContextStrict(resolveSageContextStrict());
        setLlamaVulkan(resolveLlamaVulkan());
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
                    : ui.sageSettingsModelFormatError || 'Format: user/repo:model.gguf';
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
            ? resolveDesktopChatModel(selectedModel)
            : resolveStoredBrowserModel(false) || resolveDefaultModel(false);
        if (!isNativeLlm) {
            writeExpertConfig({
                enabled: expertEnabled,
                baseUrl: expertBase,
                apiKey: expertKey,
                model: expertModel,
            });
        }
        if (isNativeLlm) {
            addSavedModel(browserModel, true);
            writeLlamaVulkan(!!llamaVulkan);
            if (voiceLocale === 'de' || voiceLocale === 'en' || voiceLocale === 'es') {
                writeSageVoiceLocale(voiceLocale);
            }
            writeSageVoiceAutoSpeak(voiceAutoSpeak);
        }
        sageAi.setConfig({
            browserModel,
            contextPreset: contextPreset || 'minimal',
            browserMaxNewTokens: maxTokens != null ? Number(maxTokens) : undefined,
            contextStrict,
        });
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
        llamaVulkan,
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
            setVoiceTestStatus({ msg: ui.sageVoiceUnavailable || 'Voice is not available in this desktop build.', ok: false });
            return;
        }
        if (voice.isVoiceRecording) {
            const blob = await voice.stopVoiceRecordingKeepProcessing();
            if (!blob) {
                setVoiceTestStatus({ msg: ui.sageVoiceTestCancelled || 'Test cancelled.', ok: false });
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
            setVoiceTestStatus({ msg: ui.sageVoiceTestListening || 'Listening… tap again to stop.', ok: true });
            await voice.startVoiceRecording();
        } catch (e) {
            setVoiceTestStatus({ msg: formatSageVoiceError(e, 'mic', ui), ok: false });
        }
    }, [ui, voice, finishVoiceTest]);

    const onRestoreAi = useCallback(async () => {
        if (!isNativeLlm) return;
        const store = getArboritoStore();
        const ok = await store.confirm(
            ui.sageRestoreAiConfirmBody ||
                'This deletes downloaded AI models from this device and resets AI consent. You can enable AI again later.',
            ui.sageRestoreAiConfirmTitle || 'Reset AI?',
            true,
            ui.sageRestoreAiConfirmAction || 'Delete models'
        );
        if (!ok) return;
        try {
            const result = await llamacppClearModels();
            if (!result?.ok) {
                await store.alert(
                    result?.error || ui.sageRestoreAiFailed || 'Could not delete models.',
                    ui.sageRestoreAiConfirmTitle || 'Reset AI'
                );
                return;
            }
            revokeSageAiConsents();
            resetLlamaVulkanPref();
            setSelectedModel(DESKTOP_NORMAL_MODEL);
            sageAi.resetConfig();
            syncFormFromConfig();
            await store.alert(
                ui.sageRestoreAiDone || 'AI models removed. Enable AI again when you want.',
                ui.sageRestoreAiConfirmTitle || 'Reset AI'
            );
            onSave?.();
        } catch (e) {
            await store.alert(
                String(e && e.message ? e.message : e),
                ui.sageRestoreAiConfirmTitle || 'Reset AI'
            );
        }
    }, [isNativeLlm, ui, sageAi, syncFormFromConfig, onSave]);

    return {
        isDesktop,
        isNativeLlm,
        sageAi,
        fillSageAiConsentTokens,
        formatModelDisplayName,
        formatModelOptionLabel,
        formatModelTechnicalName,
        estimateModelDownloadMb,
        isDesktopSuperModel,
        DESKTOP_NORMAL_MODEL,
        DESKTOP_SUPER_MODEL,
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
        llamaVulkan,
        setLlamaVulkan,
        vulkanSupported,
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
        onLlamaVulkanChange,
        onRestoreAi,
    };
}
