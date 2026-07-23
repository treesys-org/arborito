import { useLearning } from '../hooks/useLearning.js';
import { useSageAi } from '../hooks/useSageAi.js';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { isElectronDesktop } from '../api/electron-bridge.js';
import { getSageAiMode } from '../api/sage-contextual.js';
import { stripThinking } from '../api/sage-thinking.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { Callout } from '../../../shared/ui/Callout.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { SageModeToggle, SageMobPanel, SageDeskChatShell } from './components/SageLayout.jsx';
import { SageChatOverlay, SageVoiceConsentOverlay } from './SageScreens.jsx';
import { sageHideDismissButton } from '../api/modals/logic/sage-ui-helpers.js';
import { SageMessageBubble } from './components/sage/SageMessageBubble.jsx';
import { SageInputBar, SageSendIcon, SageStopIcon } from './components/sage/SageInputBar.jsx';
import { fillSageAiConsentTokens } from '../api/ai-models.js';
import { needsSageModelDownloadConsent, hasSageDownloadConsent } from '../api/sage-ai-consent.js';

/** Prefer already-cleaned finished replies; always scrub construct tags. */
function sageAssistantDisplayContent(content, { streaming = false } = {}) {
    const s = String(content != null ? content : '');
    if (!s) return s;
    /* Always run stripThinking — it also removes [[SAGE_CONSTRUCT:…]] (open or closed). */
    if (
        streaming ||
        /<think|redacted_thinking|<\|channel\||<unused|▌|\[\[SAGE_CONSTRUCT:/i.test(s)
    ) {
        return stripThinking(s);
    }
    return s;
}

function computeFormState({ ui, isLoading, isThinking, isStreaming, isVoiceBusy, isVoiceSttProcessing }) {
    const isAiBusy = isLoading || isThinking || isStreaming;
    const isBusy = isAiBusy || isVoiceBusy;
    const blockInput = isAiBusy || isVoiceSttProcessing;
    const isStopMode = isAiBusy;
    const sendBtnColor = 'arborito-cta-purple';
    let btnClass = `arborito-icon-btn--touch ${sendBtnColor} hover:opacity-90 transition-all flex items-center justify-center shadow-lg active:scale-95`;
    let btnIcon = <SageSendIcon />;
    if (isStopMode) {
        btnClass = 'arborito-icon-btn--touch arborito-cta-red hover:opacity-90 transition-all flex items-center justify-center shadow-lg active:scale-95';
        btnIcon = <SageStopIcon />;
    }
    const stopLabel = ui.sageStopGeneration || ui.cancel || 'Stop';
    const sendLabel = ui.sageSendMessage || 'Send message';
    const sendAriaLabel = isStopMode ? stopLabel : sendLabel;
    return {
        isBusy,
        isStopMode,
        blockInput,
        blockSubmit: isVoiceSttProcessing && !isStopMode,
        btnClass,
        btnIcon,
        sendBtnColor,
        sendAriaLabel,
    };
}

function hasSageLessonContext(learning) {
    const node = learning.selectedNode || learning.previewNode;
    if (!node) return false;
    if (node.type !== 'leaf' && node.type !== 'exam') return false;
    return !!(node.content || node.contentPath || node.treeLazyContent || node.treeContentKey);
}

export function SageChat({
    ui,
    ai,
    sageEnterAnim,
    isAi,
    constructionMode = false,
    sageLessonContext = false,
    onSwitchMode,
    onClose,
    onOpenSettings,
    voice,
    inputRef,
    onCancelLoad,
    embedded = false,
}) {
    const learning = useLearning();
    const sageAi = useSageAi();
    const {
        dismissModal,
        setModal,
        notify,
        update,
        setViewMode,
        selectedNode,
        previewNode,
        modal: learningModal,
        chatWithSage,
        abortSage,
        clearSageChat,
    } = learning;

    const mob = shouldShowMobileUI();
    const hideDismiss = sageHideDismissButton();
    const chatAreaRef = useRef(null);
    const internalInputRef = useRef(null);
    const localInputRef = inputRef ?? internalInputRef;

    const displayMessages =
        ai.messages.length > 0 ? ai.messages : [{ role: 'assistant', content: ui.sageDynamicHello || ui.sageHello }];
    const isLoading = ai.status === 'loading';
    const isThinking = ai.status === 'thinking';
    const isStreaming = ai.status === 'streaming';
    const isVoiceBusy = voice.isVoiceRecording || voice.isVoiceSttProcessing;
    const formState = computeFormState({
        ui,
        isLoading,
        isThinking,
        isStreaming,
        isVoiceBusy,
        isVoiceSttProcessing: voice.isVoiceSttProcessing,
    });
    const isProviderReady = sageAi.isProviderReady;
    const showVoiceMic = isElectronDesktop() && getSageAiMode() === 'dynamic' && isProviderReady;
    const isVoiceStop = voice.isVoiceRecording || voice.isVoiceSttProcessing;
    const voiceBtnTitle = isVoiceStop ? ui.sageVoiceStop || 'Stop' : ui.sageVoiceStart || 'Speak (microphone)';
    const voiceDisabled = formState.isBusy && !isVoiceStop;
    const hasQuickActions = hasSageLessonContext(learning);
    const sageContextMode = constructionMode && isAi ? 'architect' : 'sage-tree';
    const modelDownloadNote = useMemo(() => {
        if (!isElectronDesktop() || !needsSageModelDownloadConsent() || hasSageDownloadConsent()) return '';
        return fillSageAiConsentTokens(ui.sageGdprText || '', true);
    }, [ui.sageGdprText]);

    useEffect(() => {
        if (constructionMode && isAi && ai.contextMode !== 'architect') {
            update({ ai: { ...ai, contextMode: 'architect' } });
        }
    }, [constructionMode, isAi]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (typeof document === 'undefined') return undefined;
        document.documentElement.classList.toggle('arborito-sage-gen-busy', formState.isStopMode);
        return () => document.documentElement.classList.remove('arborito-sage-gen-busy');
    }, [formState.isStopMode]);

    const wasBlockedRef = useRef(false);
    useEffect(() => {
        const blocked = !!formState.blockInput;
        if (wasBlockedRef.current && !blocked) {
            const el = localInputRef.current;
            if (el && typeof el.focus === 'function') {
                requestAnimationFrame(() => {
                    try {
                        el.focus({ preventScroll: true });
                    } catch (_) {
                        el.focus();
                    }
                });
            }
        }
        wasBlockedRef.current = blocked;
    }, [formState.blockInput, localInputRef]);

    const scrollRafRef = useRef(null);
    const lastScrollLenRef = useRef(0);

    const runQuickAction = useCallback(
        (action) => {
            if (!hasSageLessonContext(learning)) return;
            const node = selectedNode || previewNode;
            const title = node?.name || '';
            let msg = '';
            if (action === 'summarize') {
                msg = (ui.sageQuickSummarize || 'Summarize this lesson: {title}').replace('{title}', title);
            } else if (action === 'explain') {
                msg = (ui.sageQuickExplain || 'Explain this topic clearly: {title}').replace('{title}', title);
            } else if (action === 'quiz') {
                msg = ui.sageQuickQuiz || 'Ask me a practice question from this lesson.';
            }
            if (!msg) return;
            update({ ai: { ...ai, contextMode: sageContextMode } });
            chatWithSage(msg);
            requestAnimationFrame(() => {
                const el = localInputRef.current;
                if (el && typeof el.focus === 'function') {
                    try {
                        el.focus({ preventScroll: true });
                    } catch (_) {
                        el.focus();
                    }
                }
            });
        },
        [ui, learning, selectedNode, previewNode, ai, update, chatWithSage, sageContextMode, localInputRef]
    );

    useEffect(() => {
        if (isLoading) voice.patchLoadProgress(ai.progress);
        else if (!voice.voiceOverlay && !voice.isVoiceProcessing) voice.hideVoiceOverlay();
    }, [isLoading, ai.progress, voice]);

    useEffect(() => {
        const area = chatAreaRef.current;
        if (!area) return;
        const lastMsg = displayMessages[displayMessages.length - 1];
        const len = lastMsg && typeof lastMsg.content === 'string' ? lastMsg.content.length : 0;
        if (len === lastScrollLenRef.current && !isThinking && !isStreaming) return;
        lastScrollLenRef.current = len;
        if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = requestAnimationFrame(() => {
            scrollRafRef.current = null;
            const el = chatAreaRef.current;
            if (el) el.scrollTop = el.scrollHeight;
        });
    }, [displayMessages.length, isThinking, isStreaming, displayMessages[displayMessages.length - 1]?.content]);

    const onSubmit = useCallback(
        (e) => {
            e.preventDefault();
            const isBusy = ai.status === 'loading' || ai.status === 'streaming' || ai.status === 'thinking';
            if (isBusy) {
                abortSage();
                requestAnimationFrame(() => {
                    const el = localInputRef.current;
                    if (el && typeof el.focus === 'function') {
                        try {
                            el.focus({ preventScroll: true });
                        } catch (_) {
                            el.focus();
                        }
                    }
                });
                return;
            }
            const inp = localInputRef.current;
            const text = inp && typeof inp.value === 'string' ? inp.value.trim() : '';
            if (!text) return;
            update({ ai: { ...ai, contextMode: sageContextMode } });
            chatWithSage(text);
            inp.value = '';
            inp.style.height = 'auto';
            /* Keep caret in the composer — disabling the field would blur to body. */
            requestAnimationFrame(() => {
                const el = localInputRef.current;
                if (el && typeof el.focus === 'function') {
                    try {
                        el.focus({ preventScroll: true });
                    } catch (_) {
                        el.focus();
                    }
                }
            });
        },
        [ai.status, localInputRef, abortSage, update, ai, chatWithSage, sageContextMode]
    );

    const onPrivacy = useCallback((e) => {
        e.stopPropagation();
        e.preventDefault();
        const cur = learningModal;
        const fromMobileMore = !!(cur && typeof cur === 'object' && cur.fromMobileMore);
        setModal(fromMobileMore ? { type: 'privacy', fromMobileMore: true } : 'privacy');
    }, [learningModal, setModal]);

    const providerName = useMemo(() => {
        if (sageAi.provider === 'llamacpp') return ui.sageProviderDesktopNative || 'Native (desktop)';
        if (sageAi.provider === 'expert-api') return ui.sageProviderExpertApi || 'Expert API';
        return ui.sageProviderNotConfigured || 'Not configured';
    }, [ui, sageAi.provider]);

    const sageSubtitle = (
        <span className="inline-flex items-center gap-1 truncate">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" aria-hidden="true" />
            {providerName}
        </span>
    );

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mob}
            title={ui.sageTitle}
            titleId="sage-dialog-title"
            subtitle={sageSubtitle}
            leadingIcon="🦉"
            trailingHtml={
                <div className="flex items-center gap-1 shrink-0 ml-auto pl-2 arborito-sage-chat-toolbar-divider">
                    <SageModeToggle ui={ui} isAi={isAi} onChange={onSwitchMode} />
                    <button type="button" id="btn-clear" className="arborito-icon-btn arborito-icon-btn--md" title={ui.sageClearChat} aria-label={ui.sageClearChat} onClick={() => clearSageChat()}>
                        <ChromeEmoji emoji="🗑️" size={20} />
                    </button>
                    <button
                        type="button"
                        id="btn-settings"
                        className="arborito-icon-btn arborito-icon-btn--md"
                        title={ui.sageSettings}
                        aria-label={ui.sageSettings}
                        onPointerDown={(e) => {
                            e.stopPropagation();
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onOpenSettings(e);
                        }}
                    >
                        <ChromeEmoji emoji="⚙️" size={20} />
                    </button>
                </div>
            }
            showBack={!hideDismiss}
            showClose={!hideDismiss}
            backTagClass="btn-close"
            tagClass="btn-close"
            onClose={onClose}
            onBack={onClose}
            subtitleClass="arborito-sage-hero-subtitle"
        />
    );

    const chatInner = (
        <>
            {(modelDownloadNote || (!isProviderReady && ui.sageExperimentalChatNote)) ? (
                <Callout
                    tone="blue"
                    size="sm"
                    inline
                    extraClass="arborito-sage-chat-note shrink-0 py-1.5 m-0 leading-snug"
                    body={modelDownloadNote || ui.sageExperimentalChatNote || ''}
                />
            ) : null}
            <div
                id="sage-chat-area"
                ref={chatAreaRef}
                className="arborito-sage-chat-scroll space-y-2 custom-scrollbar"
                role="log"
                aria-live="polite"
                aria-relevant="additions text"
                aria-busy={formState.isBusy ? 'true' : 'false'}
            >
                {displayMessages.map((m, idx) => {
                    const isStreamingRow =
                        isStreaming && m.role === 'assistant' && idx === displayMessages.length - 1;
                    let displayContent = m.content;
                    if (m.role === 'assistant' && typeof displayContent === 'string') {
                        displayContent = sageAssistantDisplayContent(displayContent, {
                            streaming: isStreamingRow,
                        });
                    }
                    return (
                        <SageMessageBubble
                            key={`sage-msg-${idx}`}
                            message={m}
                            idx={idx}
                            ui={ui}
                            isStreamingRow={isStreamingRow}
                            showVoiceMic={showVoiceMic}
                            activeSpeakMsgIdx={voice.activeSpeakMsgIdx}
                            sendBtnColor={formState.sendBtnColor}
                            displayContent={displayContent}
                            onSpeak={voice.speakMessageAtIndex}
                            onPrivacy={onPrivacy}
                        />
                    );
                })}
                {isThinking ? (
                    <div className="flex justify-start pb-9" data-sage-thinking="1">
                        <div className="max-w-[85%] relative group text-left">
                            <div className="p-3 rounded-2xl text-sm leading-relaxed shadow-sm sage-msg-bubble sage-msg-bubble--assistant rounded-bl-none">
                                <div className="sage-msg-body">
                                    <span className="sage-thinking inline-flex items-center gap-1.5 not-italic">
                                        <span className="sage-thinking__label">
                                            {ai.progress ||
                                                (constructionMode
                                                    ? ui.sageConstructThinking || ui.sageThinking
                                                    : ui.sageThinking) ||
                                                'Pensando…'}
                                        </span>
                                        <span className="sage-thinking__dots" aria-hidden="true">
                                            <span />
                                            <span />
                                            <span />
                                        </span>
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
            {!isProviderReady ? (
                <div className="arborito-sage-not-configured-strip">
                    <p className="arborito-eyebrow arborito-eyebrow--sm">{ui.sageAiNotConfigured}</p>
                </div>
            ) : null}
            {hasQuickActions ? (
                <div className="arborito-sage-chat-quick-actions sage-quick-row custom-scrollbar">
                    <button type="button" className="btn-qa sage-quick sage-quick--sky whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1.5" onClick={() => runQuickAction('summarize')}>
                        <ChromeEmoji emoji="📝" size={14} /> {ui.sageBtnSummarize}
                    </button>
                    <button type="button" className="btn-qa sage-quick sage-quick--indigo whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1.5" onClick={() => runQuickAction('explain')}>
                        <ChromeEmoji emoji="🎓" size={14} /> {ui.sageBtnExplain}
                    </button>
                    <button type="button" className="btn-qa sage-quick sage-quick--violet whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1.5" onClick={() => runQuickAction('quiz')}>
                        <ChromeEmoji emoji="❓" size={14} /> {ui.sageBtnQuiz}
                    </button>
                </div>
            ) : null}
            <SageInputBar
                ui={ui}
                mob={mob}
                formState={formState}
                showVoiceMic={showVoiceMic}
                isVoiceStop={isVoiceStop}
                voiceState={voice.voiceState}
                voiceBtnTitle={voiceBtnTitle}
                voiceDisabled={voiceDisabled}
                localInputRef={localInputRef}
                onSubmit={onSubmit}
                onVoiceMicClick={voice.handleVoiceMicClick}
            />
            {isProviderReady ? (
                <p className="arborito-sage-provider-footer" title={sageAi.browserModel || ''}>
                    {sageAi.providerLabel()}
                </p>
            ) : null}
        </>
    );

    const chatStack = <div className="arborito-sage-chat-body">{chatInner}</div>;
    const chatBody = mob ? (
        <div className="arborito-sage-chat-stack flex flex-col flex-1 min-h-0 overflow-hidden min-w-0">{chatStack}</div>
    ) : (
        chatStack
    );

    const overlays = (
        <>
            <SageChatOverlay
                overlay={voice.voiceOverlay}
                ui={ui}
                onCancelLoad={onCancelLoad}
                onCancelVoice={voice.cancelVoiceProcessing}
            />
            <SageVoiceConsentOverlay
                consent={voice.voiceConsent}
                ui={ui}
                onAccept={voice.acceptVoiceDownloadConsent}
                onDecline={voice.declineVoiceDownloadConsent}
            />
        </>
    );

    if (mob && embedded) {
        return (
            <div className="arborito-sage-chat-shell-mob arborito-sage-embedded flex flex-col flex-1 min-h-0 h-full overflow-hidden">
                {hero}
                {chatBody}
                {overlays}
            </div>
        );
    }
    if (mob) {
        return (
            <SageMobPanel hero={hero} extraClass=" arborito-sage-chat-shell-mob" enterAnim={sageEnterAnim}>
                {chatBody}
                {overlays}
            </SageMobPanel>
        );
    }
    return (
        <SageDeskChatShell hero={hero}>
            {chatBody}
            {overlays}
        </SageDeskChatShell>
    );
}
