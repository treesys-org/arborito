import { renderSageMessage } from '../../../../../shared/lib/render-sage-message.jsx';

function SageStopIcon({ className = 'w-4 h-4' }) {
    return (
        <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="6" y="6" width="12" height="12" rx="1.5" />
        </svg>
    );
}

function SageSpeakerIcon({ className = 'w-4 h-4' }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" aria-hidden="true">
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
            />
        </svg>
    );
}

export function SageMessageBubble({
    message,
    idx,
    ui,
    isStreamingRow,
    showVoiceMic,
    activeSpeakMsgIdx,
    sendBtnColor,
    displayContent,
    onSpeak,
    onPrivacy,
}) {
    let hasCursor = false;
    let contentForFormat = displayContent;
    if (isStreamingRow && typeof displayContent === 'string' && displayContent.endsWith('▌')) {
        hasCursor = true;
        contentForFormat = displayContent.slice(0, -1);
    }

    const isSpeaking = activeSpeakMsgIdx === idx;
    const speakLabel = isSpeaking
        ? ui.sageVoiceStopPlayback || 'Detener'
        : ui.sageVoiceReadMessage || 'Escuchar mensaje';
    const speakOpacity = isSpeaking
        ? 'opacity-100'
        : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100';

    return (
        <div
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} pb-9`}
            data-sage-streaming={isStreamingRow ? '1' : undefined}
            data-sage-role={message.role}
        >
            <div className="max-w-[85%] relative group text-left">
                <div
                    className={`p-3 rounded-2xl text-sm leading-relaxed shadow-sm select-text sage-msg-bubble ${
                        message.role === 'user'
                            ? `${sendBtnColor} rounded-br-none`
                            : 'sage-msg-bubble--assistant rounded-bl-none'
                    }`}
                >
                    <div
                        className="sage-msg-body"
                        onClick={(e) => {
                            const btn = e.target instanceof Element ? e.target.closest('.btn-sage-privacy') : null;
                            if (btn) onPrivacy(e);
                        }}
                    >
                        {renderSageMessage(contentForFormat)}
                    </div>
                    {hasCursor ? (
                        <span className="sage-stream-cursor inline-block w-0.5 h-[1em] bg-current ml-px align-text-bottom opacity-70" />
                    ) : null}
                </div>
                {message.role === 'assistant' && showVoiceMic && !isStreamingRow ? (
                    <button
                        type="button"
                        className={`sage-msg-speak-btn sage-msg-speak-btn--${isSpeaking ? 'active' : 'idle'} absolute -bottom-1 right-0 translate-y-full mt-1 w-8 h-8 rounded-lg shadow-sm flex items-center justify-center ${speakOpacity} transition-opacity`}
                        data-sage-msg-idx={idx}
                        aria-label={speakLabel}
                        title={speakLabel}
                        onClick={() => onSpeak(idx)}
                    >
                        {isSpeaking ? <SageStopIcon /> : <SageSpeakerIcon />}
                    </button>
                ) : null}
            </div>
        </div>
    );
}
