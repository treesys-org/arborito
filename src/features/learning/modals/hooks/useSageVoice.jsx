import { useCallback, useEffect, useRef, useState } from 'react';
import { useLearningStore } from '../../hooks/useLearning.js';
import { isElectronDesktop } from '../../api/electron-bridge.js';
import {
    fetchSageVoiceAssetStatus,
    formatSageVoiceError,
    isSpeakableAssistantText,
    plainTextForSpeech,
    prefetchSageSttAssets,
    prefetchSageTtsAssets,
    resolveSageVoiceLocale,
    sageVoice,
    sageVoiceNeedsDownloadConsent,
} from '../../api/sage-voice.js';
import { grantSagePiperDownloadConsent, grantSageWhisperDownloadConsent } from '../../api/sage-voice-prefs.js';

function parseProgressPct(text) {
    const match = String(text || '').match(/(\d+)%/);
    return match ? Math.min(100, parseInt(match[1], 10)) : 0;
}

export function useSageVoice({ mode, onRerender, inputRef, ai = null }) {
    const store = useLearningStore();
    const [activeSpeakMsgIdx, setActiveSpeakMsgIdx] = useState(null);
    const [voiceOverlay, setVoiceOverlay] = useState(null);
    const [voiceConsent, setVoiceConsent] = useState(null);
    const voiceConsentResumeRef = useRef(null);
    const autoSpeakHandledRef = useRef(false);

    const putVoiceTextInInput = useCallback(
        (text) => {
            const value = String(text || '').trim();
            if (!value) return;
            const inp = inputRef?.current;
            if (!inp) return;
            inp.value = value;
            inp.readOnly = false;
            inp.disabled = false;
            inp.style.opacity = '1';
            inp.style.cursor = 'text';
            inp.style.height = 'auto';
            const max = Math.min(window.innerHeight * 0.4, 192);
            inp.style.height = `${Math.min(inp.scrollHeight, max)}px`;
            requestAnimationFrame(() => {
                try {
                    inp.focus({ preventScroll: true });
                } catch (_) {}
            });
        },
        [inputRef]
    );

    const hideVoiceOverlay = useCallback(() => {
        setVoiceOverlay(null);
    }, []);

    const showVoiceOverlay = useCallback((opts) => {
        setVoiceOverlay((prev) => {
            if (opts.hide) return null;
            if (opts.incremental && prev) {
                return { ...prev, ...opts };
            }
            return opts;
        });
    }, []);

    const hideVoiceConsent = useCallback(() => {
        setVoiceConsent(null);
        voiceConsentResumeRef.current = null;
    }, []);

    const showVoiceConsent = useCallback((kind, status, consentMode) => {
        const ui = store.ui;
        const estMb =
            kind === 'mic'
                ? (status && status.sttEstMb) || 466
                : (status && status.piperVoiceEstMb) || 20;
        const body =
            kind === 'mic'
                ? ui.sageVoiceMicDownloadConsentBody ||
                  `Using the microphone downloads Whisper (~${estMb} MB), once. Continue?`
                : ui.sageVoiceDownloadConsentBody ||
                  `Piper voice will be downloaded (~${estMb} MB). Continue?`;
        const licenseNote = ui.sageVoiceThirdPartyLicenses || ui.sageAiThirdPartyLicenses || '';
        const title =
            kind === 'mic'
                ? ui.sageVoiceMicDownloadConsentTitle || 'Enable microphone?'
                : ui.sageVoiceDownloadConsentTitle || 'Enable voice (Piper)?';
        setVoiceConsent({
            kind,
            mode: consentMode,
            title,
            body: licenseNote ? `${body}\n\n${licenseNote}` : body,
        });
    }, []);

    const ensureTtsAssetsOrPromptConsent = useCallback(
        async (consentMode, resume) => {
            const status = await fetchSageVoiceAssetStatus(resolveSageVoiceLocale());
            if (!sageVoiceNeedsDownloadConsent(status, { forTts: true })) return true;
            voiceConsentResumeRef.current = resume;
            showVoiceConsent('tts', status, consentMode);
            return false;
        },
        [showVoiceConsent]
    );

    const ensureMicAssetsOrPromptConsent = useCallback(
        async (consentMode, resume) => {
            const status = await fetchSageVoiceAssetStatus(resolveSageVoiceLocale());
            if (!sageVoiceNeedsDownloadConsent(status, { forMic: true })) return true;
            voiceConsentResumeRef.current = resume;
            showVoiceConsent('mic', status, consentMode);
            return false;
        },
        [showVoiceConsent]
    );

    const acceptVoiceDownloadConsent = useCallback(async () => {
        const ui = store.ui;
        const kind = voiceConsent?.kind;
        if (kind === 'tts') grantSagePiperDownloadConsent();
        else if (kind === 'mic') grantSageWhisperDownloadConsent();
        const resume = voiceConsentResumeRef.current;
        hideVoiceConsent();
        if (kind === 'tts') {
            showVoiceOverlay({
                iconEmoji: '🔊',
                iconTone: 'voice',
                title: ui.sageVoiceDownloadProgress || '',
                pct: 0,
            });
            try {
                await prefetchSageTtsAssets(resolveSageVoiceLocale());
            } catch (e) {
                console.warn('Sage TTS prefetch failed:', e);
                if (mode !== 'settings') {
                    store.update({
                        ai: {
                            ...store.value.ai,
                            messages: [
                                ...store.value.ai.messages,
                                { role: 'assistant', content: formatSageVoiceError(e, 'tts', ui) },
                            ],
                        },
                    });
                    onRerender();
                }
                hideVoiceOverlay();
                return;
            }
        } else if (kind === 'mic') {
            showVoiceOverlay({
                iconEmoji: '🎤',
                iconTone: 'voice',
                title: ui.sageVoiceSttDownloadProgress || ui.sageVoiceProcessing || '',
                pct: 0,
            });
            try {
                await prefetchSageSttAssets();
            } catch (e) {
                console.warn('Sage STT prefetch failed:', e);
                if (mode !== 'settings') {
                    store.update({
                        ai: {
                            ...store.value.ai,
                            messages: [
                                ...store.value.ai.messages,
                                { role: 'assistant', content: formatSageVoiceError(e, 'mic', ui) },
                            ],
                        },
                    });
                    onRerender();
                }
                hideVoiceOverlay();
                return;
            }
        }
        hideVoiceOverlay();
        if (typeof resume === 'function') {
            try {
                await resume();
            } catch (e) {
                console.warn('Sage voice resume failed:', e);
            }
        }
    }, [voiceConsent, hideVoiceConsent, hideVoiceOverlay, showVoiceOverlay, mode, onRerender]);

    const declineVoiceDownloadConsent = useCallback(() => {
        hideVoiceConsent();
        hideVoiceOverlay();
    }, [hideVoiceConsent, hideVoiceOverlay]);

    const finishChatVoiceTranscribe = useCallback(
        async (blob) => {
            const ui = store.ui;
            try {
                const status = await fetchSageVoiceAssetStatus(resolveSageVoiceLocale());
                if (status?.needsSttDownload && !sageVoiceNeedsDownloadConsent(status, { forMic: true })) {
                    await prefetchSageSttAssets();
                }
                const { text, aborted, tooShort } = await sageVoice.transcribeAudioBlob(blob);
                if (aborted) return;
                if (tooShort) {
                    store.update({
                        ai: {
                            ...store.value.ai,
                            messages: [
                                ...store.value.ai.messages,
                                { role: 'assistant', content: formatSageVoiceError('', 'mic', ui) },
                            ],
                        },
                    });
                    onRerender();
                    return;
                }
                if (text) putVoiceTextInInput(text);
                else if (ui.sageVoiceEmpty) {
                    store.update({
                        ai: {
                            ...store.value.ai,
                            messages: [
                                ...store.value.ai.messages,
                                { role: 'assistant', content: formatSageVoiceError('', 'mic', ui) },
                            ],
                        },
                    });
                    onRerender();
                }
            } catch (e) {
                const msg = e && e.message ? e.message : String(e);
                store.update({
                    ai: {
                        ...store.value.ai,
                        messages: [
                            ...store.value.ai.messages,
                            { role: 'assistant', content: formatSageVoiceError(msg, 'mic', ui) },
                        ],
                    },
                });
                onRerender();
            } finally {
                hideVoiceOverlay();
            }
        },
        [putVoiceTextInInput, onRerender, hideVoiceOverlay]
    );

    const speakMessageAtIndex = useCallback(
        async (idx) => {
            const ui = store.ui;
            const messages = store.value.ai.messages;
            const m = messages[idx];
            if (!m || m.role !== 'assistant') return;
            if (!isSpeakableAssistantText(m.content, m.content)) return;

            const speakingThis =
                activeSpeakMsgIdx === idx &&
                (sageVoice.state === 'speaking' ||
                    (sageVoice.state === 'processing' && sageVoice.progressPhase === 'tts'));
            if (
                speakingThis ||
                (activeSpeakMsgIdx === idx && sageVoice.state !== 'idle')
            ) {
                sageVoice.stopSpeaking();
                setActiveSpeakMsgIdx(null);
                onRerender();
                return;
            }
            if (
                sageVoice.state === 'speaking' ||
                (sageVoice.state === 'processing' && sageVoice.progressPhase === 'tts')
            ) {
                sageVoice.stopSpeaking();
                setActiveSpeakMsgIdx(null);
            }

            if (
                !(await ensureTtsAssetsOrPromptConsent('chat', async () => {
                    await speakMessageAtIndex(idx);
                }))
            ) {
                return;
            }
            try {
                setActiveSpeakMsgIdx(idx);
                await sageVoice.speak(plainTextForSpeech(m.content), resolveSageVoiceLocale(), {
                    forcePiper: true,
                });
            } catch (e) {
                const msg = e && e.message ? e.message : String(e);
                store.update({
                    ai: {
                        ...store.value.ai,
                        messages: [
                            ...store.value.ai.messages,
                            { role: 'assistant', content: formatSageVoiceError(msg, 'tts', ui) },
                        ],
                    },
                });
                onRerender();
            } finally {
                if (sageVoice.state === 'idle') setActiveSpeakMsgIdx(null);
            }
        },
        [activeSpeakMsgIdx, ensureTtsAssetsOrPromptConsent, onRerender]
    );

    /* Auto-speak: ai-logic sets voiceReply; same Piper consent path as the speaker button. */
    useEffect(() => {
        const live = ai || store.value.ai;
        if (!live?.voiceReply || live.status !== 'ready') {
            autoSpeakHandledRef.current = false;
            return;
        }
        if (autoSpeakHandledRef.current) return;
        autoSpeakHandledRef.current = true;
        const messages = Array.isArray(live.messages) ? live.messages : [];
        const idx = messages.length - 1;
        store.update({ ai: { ...store.value.ai, voiceReply: false } });
        if (idx < 0 || messages[idx]?.role !== 'assistant') return;
        if (!isSpeakableAssistantText(messages[idx].content, messages[idx].content)) return;
        void speakMessageAtIndex(idx);
    }, [ai?.voiceReply, ai?.status, ai?.messages, speakMessageAtIndex]);

    const handleVoiceMicClick = useCallback(async () => {
        const ui = store.ui;
        const aiState = store.value.ai;
        if (aiState.status === 'streaming' || aiState.status === 'loading' || aiState.status === 'thinking') {
            store.update({
                ai: {
                    ...aiState,
                    messages: [
                        ...aiState.messages,
                        {
                            role: 'assistant',
                            content: ui.sageVoiceBusy || 'Wait for the current voice operation to finish.',
                        },
                    ],
                },
            });
            onRerender();
            return;
        }
        if (!isElectronDesktop()) {
            store.update({
                ai: {
                    ...aiState,
                    messages: [
                        ...aiState.messages,
                        {
                            role: 'assistant',
                            content: ui.sageVoiceUnavailable || 'Voice is not available. Use the desktop app.',
                        },
                    ],
                },
            });
            onRerender();
            return;
        }
        if (sageVoice.state === 'processing') {
            await sageVoice.abortProcessing();
            hideVoiceOverlay();
            onRerender();
            return;
        }
        if (sageVoice.state === 'recording') {
            const blob = await sageVoice.stopRecordingOnly({ keepProcessing: true });
            if (!blob) {
                sageVoice._setState('idle');
                onRerender();
                return;
            }
            if (
                !(await ensureMicAssetsOrPromptConsent('chat', async () => {
                    await finishChatVoiceTranscribe(blob);
                }))
            ) {
                sageVoice._setState('idle');
                onRerender();
                return;
            }
            await finishChatVoiceTranscribe(blob);
            onRerender();
            return;
        }
        if (sageVoice.state !== 'idle') return;
        if (
            !(await ensureMicAssetsOrPromptConsent('chat', async () => {
                try {
                    await sageVoice.startRecording();
                } catch (e) {
                    const msg = e && e.message ? e.message : String(e);
                    store.update({
                        ai: {
                            ...store.value.ai,
                            messages: [
                                ...store.value.ai.messages,
                                { role: 'assistant', content: formatSageVoiceError(msg, 'mic', ui) },
                            ],
                        },
                    });
                    onRerender();
                }
            }))
        ) {
            return;
        }
        try {
            await sageVoice.startRecording();
        } catch (e) {
            const msg = e && e.message ? e.message : String(e);
            store.update({
                ai: {
                    ...store.value.ai,
                    messages: [
                        ...store.value.ai.messages,
                        { role: 'assistant', content: formatSageVoiceError(msg, 'mic', ui) },
                    ],
                },
            });
            onRerender();
        }
        onRerender();
    }, [
        ensureMicAssetsOrPromptConsent,
        finishChatVoiceTranscribe,
        hideVoiceOverlay,
        onRerender,
    ]);

    const cancelVoiceProcessing = useCallback(async () => {
        await sageVoice.abortProcessing();
        hideVoiceOverlay();
        onRerender();
    }, [hideVoiceOverlay, onRerender]);

    const updateVoiceProgressUI = useCallback(
        (message = '', pct = null) => {
            if (sageVoice.state === 'speaking') {
                if (mode !== 'settings') hideVoiceOverlay();
                return;
            }
            const ui = store.ui;
            const pctVal = pct == null ? sageVoice.progressPct : pct;
            const rawMsg = String(message || sageVoice.progressMessage || '')
                .replace(/\s*[\(\[]?\s*\d+\s*%[\)\]]?\s*/g, ' ')
                .replace(/\s{2,}/g, ' ')
                .trim();
            const processingTitle = ui.sageVoiceProcessing || 'Processing audio…';
            const ttsTitle = ui.sageVoiceDownloadProgress || 'Downloading Piper voice…';
            const sttTitle = ui.sageVoiceSttDownloadProgress || ui.sageVoiceProcessing || 'Downloading Whisper…';
            const title =
                sageVoice.progressPhase === 'tts'
                    ? ttsTitle
                    : sageVoice.progressPhase === 'stt'
                      ? sttTitle
                      : processingTitle;
            let detailMsg = rawMsg;
            if (!detailMsg || detailMsg === title || detailMsg === processingTitle) detailMsg = '';
            const busy = sageVoice.state === 'processing';
            const isVoiceDownload = sageVoice.progressPhase === 'stt' || sageVoice.progressPhase === 'tts';
            const show = busy && (isVoiceDownload || pctVal > 0 || !!detailMsg);
            if (!show) {
                hideVoiceOverlay();
                return;
            }
            showVoiceOverlay({
                iconEmoji: '🎤',
                iconTone: 'voice',
                title,
                msg: detailMsg,
                pct: pctVal,
                indeterminate: busy && pctVal === 0 && !detailMsg,
                barClass: 'bg-purple-500',
                showCancel: busy,
                incremental: busy,
            });
        },
        [mode, hideVoiceOverlay, showVoiceOverlay]
    );

    const patchLoadProgress = useCallback(
        (progressText) => {
            const ui = store.ui;
            const raw = String(progressText || '').trim();
            const isError = raw.includes('❌');
            const pct = parseProgressPct(raw);
            let label = raw;
            if (pct > 0) {
                label = raw
                    .replace(/\s*[\(\[]?\s*\d+\s*%[\)\]]?\s*/g, ' ')
                    .replace(/\s{2,}/g, ' ')
                    .trim();
            }
            if (!label) label = ui.sageLoadingProgressStarting || '…';
            const loadDesc = isElectronDesktop()
                ? ui.sageLoadingBrainDescDesktop || ui.sageLoadingBrainDesc || ''
                : ui.sageLoadingBrainDescExpert ||
                  ui.sageLoadingBrainDescBrowser ||
                  ui.sageLoadingBrainDesc ||
                  '';
            const hasFileProgress = pct > 0 || (progressText && /\d+\s*%/.test(String(progressText)));
            const msg = hasFileProgress && label ? label : loadDesc || label;
            showVoiceOverlay({
                iconEmoji: '🧠',
                iconTone: 'model',
                title: ui.sageLoadingBrainTitle || 'Loading assistant',
                msg,
                pct,
                barClass: isError ? 'arborito-sage-progress--error' : 'arborito-sage-progress--ok',
                showCancel: true,
                isLoadOverlay: true,
            });
        },
        [showVoiceOverlay]
    );

    useEffect(() => {
        sageVoice.onStateChange = () => {
            if (sageVoice.state === 'speaking') {
                if (mode !== 'settings') hideVoiceOverlay();
            } else {
                updateVoiceProgressUI();
            }
            onRerender();
        };
        sageVoice.onProgress = (data) => {
            if (!data) return;
            const msg = String(data.message || data.phase || '');
            let pct = sageVoice.progressPct;
            if (typeof data.progress === 'number' && Number.isFinite(data.progress)) {
                pct = Math.max(0, Math.min(100, Math.round(data.progress * 100)));
            }
            updateVoiceProgressUI(msg, pct);
        };
        return () => {
            sageVoice.onStateChange = null;
            sageVoice.onProgress = null;
        };
    }, [mode, hideVoiceOverlay, updateVoiceProgressUI, onRerender]);

    return {
        activeSpeakMsgIdx,
        voiceOverlay,
        voiceConsent,
        voiceState: sageVoice.state,
        voiceProgressPhase: sageVoice.progressPhase,
        isVoiceRecording: sageVoice.state === 'recording',
        isVoiceProcessing: sageVoice.state === 'processing',
        isVoiceSttProcessing: sageVoice.state === 'processing' && sageVoice.progressPhase === 'stt',
        startVoiceRecording: () => sageVoice.startRecording(),
        stopVoiceRecordingKeepProcessing: () => sageVoice.stopRecordingOnly({ keepProcessing: true }),
        transcribeVoiceBlob: (blob) => sageVoice.transcribeAudioBlob(blob),
        resetVoiceToIdle: () => sageVoice._setState('idle'),
        handleVoiceMicClick,
        speakMessageAtIndex,
        cancelVoiceProcessing,
        acceptVoiceDownloadConsent,
        declineVoiceDownloadConsent,
        hideVoiceOverlay,
        patchLoadProgress,
        ensureMicAssetsOrPromptConsent,
        ensureTtsAssetsOrPromptConsent,
        updateVoiceProgressUI,
        setVoiceConsentPanel: setVoiceConsent,
    };
}
