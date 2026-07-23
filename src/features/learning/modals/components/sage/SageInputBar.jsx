function SageMicIcon({ className = 'w-5 h-5' }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" aria-hidden="true">
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
            />
        </svg>
    );
}

function SageStopIcon({ className = 'w-5 h-5' }) {
    return (
        <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="6" y="6" width="12" height="12" rx="1.5" />
        </svg>
    );
}

function SageSendIcon() {
    return (
        <svg className="w-5 h-5 translate-x-0.5 -translate-y-0.5" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
        </svg>
    );
}

export function SageInputBar({
    ui,
    mob,
    formState,
    showVoiceMic,
    isVoiceStop,
    voiceState,
    voiceBtnTitle,
    voiceDisabled,
    localInputRef,
    onSubmit,
    onVoiceMicClick,
}) {
    return (
        <form
            id="sage-form"
            className={`arborito-sage-chat-form${mob ? '' : ' arborito-sage-chat-form--desk'}`}
            role="search"
            aria-label={ui.sageChatFormAria || ui.sageTitle || 'Sage'}
            onSubmit={onSubmit}
        >
            {showVoiceMic ? (
                <button
                    type="button"
                    id="btn-sage-voice"
                    className={`arborito-icon-btn--touch shrink-0 shadow active:scale-95 ${
                        isVoiceStop
                            ? `arborito-cta-red${voiceState === 'recording' ? ' animate-pulse ring-2 ring-red-300' : ''}`
                            : 'sage-voice-mic-btn'
                    } ${voiceDisabled ? 'opacity-50 pointer-events-none' : ''}`}
                    title={voiceBtnTitle}
                    aria-label={voiceBtnTitle}
                    disabled={voiceDisabled}
                    onClick={onVoiceMicClick}
                >
                    {isVoiceStop ? <SageStopIcon /> : <SageMicIcon />}
                </button>
            ) : null}
            <textarea
                id="sage-input"
                ref={localInputRef}
                rows={1}
                className={`arborito-input arborito-textarea flex-1 border-none resize-none min-h-[2.75rem] max-h-[min(40vh,12rem)] leading-snug py-2.5 overflow-y-auto${
                    formState.blockInput ? ' opacity-50' : ''
                }`}
                placeholder={ui.sageInputPlaceholder}
                autoComplete="off"
                aria-label={ui.sageInputPlaceholder}
                readOnly={formState.blockInput}
                aria-readonly={formState.blockInput ? 'true' : undefined}
                onKeyDown={(e) => {
                    if (formState.blockInput) {
                        /* Allow Escape-less stop via Enter only when not generating; ignore typing. */
                        if (e.key === 'Enter' && !e.shiftKey) e.preventDefault();
                        return;
                    }
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        e.currentTarget.form?.requestSubmit();
                    }
                }}
                onInput={(e) => {
                    if (formState.blockInput) return;
                    const ta = e.currentTarget;
                    ta.style.height = 'auto';
                    const max = Math.min(window.innerHeight * 0.4, 192);
                    ta.style.height = `${Math.min(ta.scrollHeight, max)}px`;
                }}
            />
            <button
                type={formState.isStopMode ? 'button' : 'submit'}
                className={formState.btnClass}
                disabled={formState.blockSubmit}
                aria-label={formState.sendAriaLabel}
                onClick={formState.isStopMode ? (e) => { e.preventDefault(); onSubmit(e); } : undefined}
            >
                {formState.btnIcon}
            </button>
        </form>
    );
}

export { SageSendIcon, SageStopIcon };
