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
import { SageInputBar, SageSendIcon, SageStreamIcon } from './components/sage/SageInputBar.jsx';

function computeFormState({ ui, isLoading, isThinking, isStreaming, isVoiceBusy, isVoiceSttProcessing }) {
    const isBusy = isLoading || isThinking || isStreaming || isVoiceBusy;
    const blockForm = isLoading || isThinking || isStreaming || isVoiceSttProcessing;
    const sendBtnColor = 'arborito-cta-purple';
    let btnClass = `arborito-icon-btn--touch ${sendBtnColor} hover:opacity-90 transition-all flex items-center justify-center shadow-lg active:scale-95`;
    let btnIcon = <SageSendIcon />;
    if (isLoading || isThinking || isStreaming) {
        btnClass = 'arborito-icon-btn--touch arborito-cta-amber transition-all flex items-center justify-center shadow-lg active:scale-95';
        btnIcon = <SageStreamIcon />;
    }
    const cancelLabel = ui.cancel || 'Cancelar';
    const sendLabel = ui.sageSendMessage || 'Enviar mensaje';
    const sendAriaLabel = isLoading || isThinking || isStreaming ? cancelLabel : sendLabel;
    return { isBusy, blockForm, btnClass, btnIcon, sendBtnColor, sendAriaLabel };
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
    constructionMode,
    isAi,
    onSwitchMode,
    onClose,
    onOpenSettings,
    voice,
    inputRef,
    onCancelLoad,
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
    const voiceBtnTitle = isVoiceStop ? ui.sageVoiceStop || 'Detener' : ui.sageVoiceStart || 'Hablar (micrófono)';
    const voiceDisabled = formState.isBusy && !isVoiceStop;
    const hasQuickActions = hasSageLessonContext(learning);

    useEffect(() => {
        if (isLoading) voice.patchLoadProgress(ai.progress);
        else if (!voice.voiceOverlay && !voice.isVoiceProcessing) voice.hideVoiceOverlay();
    }, [isLoading, ai.progress, voice]);

    useEffect(() => {
        const area = chatAreaRef.current;
        if (!area) return;
        area.scrollTop = area.scrollHeight;
    }, [displayMessages.length, isThinking, isStreaming, ai.messages]);

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
            update({ ai: { ...ai, contextMode: 'sage-tree' } });
            chatWithSage(msg);
        },
        [ui, learning, selectedNode, previewNode, ai, update, chatWithSage]
    );

    const onSubmit = useCallback(
        (e) => {
            e.preventDefault();
            const isBusy = ai.status === 'loading' || ai.status === 'streaming' || ai.status === 'thinking';
            if (isBusy) {
                abortSage();
                return;
            }
            const inp = localInputRef.current;
            const text = inp && typeof inp.value === 'string' ? inp.value.trim() : '';
            if (!text) return;
            update({ ai: { ...ai, contextMode: 'sage-tree' } });
            chatWithSage(text);
            inp.value = '';
            inp.style.height = 'auto';
        },
        [ai.status, localInputRef, abortSage, update, ai, chatWithSage]
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
            {ui.sageExperimentalBadge || providerName}
        </span>
    );

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mob}
            title={ui.sageTitle}
            titleId="sage-dialog-title"
            subtitle={sageSubtitle}
            leadingIcon={<ChromeEmoji emoji="🦉" size={24} />}
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
            <Callout
                tone="amber"
                size="sm"
                inline
                extraClass="shrink-0 px-3 py-1.5 m-0 leading-snug"
                body={ui.sageExperimentalChatNote || ''}
            />
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
                    let displayContent = m.content;
                    if (m.role === 'assistant' && typeof displayContent === 'string') {
                        displayContent = stripThinking(displayContent);
                    }
                    return (
                        <SageMessageBubble
                            key={`${idx}-${m.role}-${String(m.content || '').length}`}
                            message={m}
                            idx={idx}
                            ui={ui}
                            isStreamingRow={isStreaming && m.role === 'assistant' && idx === displayMessages.length - 1}
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
                                        <span className="sage-thinking__label">{ui.sageThinking || 'Pensando…'}</span>
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
                <div className="arborito-sage-chat-quick-actions custom-scrollbar">
                    <button type="button" className="btn-qa btn-qa--blue whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors" onClick={() => runQuickAction('summarize')}>
                        <ChromeEmoji emoji="📝" size={14} /> {ui.sageBtnSummarize}
                    </button>
                    <button type="button" className="btn-qa btn-qa--blue whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors" onClick={() => runQuickAction('explain')}>
                        <ChromeEmoji emoji="🎓" size={14} /> {ui.sageBtnExplain}
                    </button>
                    <button type="button" className="btn-qa btn-qa--blue whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-colors" onClick={() => runQuickAction('quiz')}>
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
        <>
            {hero}
            <div className="arborito-sage-chat-stack flex flex-col flex-1 min-h-0 overflow-hidden min-w-0">{chatStack}</div>
        </>
    ) : (
        <>
            {hero}
            {chatStack}
        </>
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

    if (mob) {
        return (
            <SageMobPanel extraClass=" arborito-sage-chat-shell-mob" enterAnim={sageEnterAnim}>
                {chatBody}
                {overlays}
            </SageMobPanel>
        );
    }
    return (
        <SageDeskChatShell onDismiss={onClose}>
            {chatBody}
            {overlays}
        </SageDeskChatShell>
    );
}
