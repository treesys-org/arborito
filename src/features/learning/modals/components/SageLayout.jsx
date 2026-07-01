export function SageModeToggle({ ui, isAi, onChange }) {
    const toggle = () => onChange(isAi ? 'guide' : 'dynamic');

    return (
        <div
            className="arborito-switch-inline shrink-0"
            role="group"
            aria-label={ui.sageModeToggleAria || 'Sage mode'}
        >
            <span className={`arborito-switch-inline__label${isAi ? '' : ' is-on'}`} aria-hidden="true">
                {ui.sageModeGuide || 'Guide'}
            </span>
            <button
                type="button"
                id="btn-sage-mode-ai"
                className={`arborito-switch arborito-switch--touch${isAi ? ' is-on' : ''}`}
                role="switch"
                aria-checked={isAi ? 'true' : 'false'}
                aria-label={
                    isAi
                        ? ui.sageModeGuideTooltip || 'Guide mode'
                        : ui.sageModeAiTooltip || 'Enable AI mode'
                }
                onClick={toggle}
            />
            <span className={`arborito-switch-inline__label${isAi ? ' is-on' : ''}`} aria-hidden="true">
                {ui.sageModeExperimentalShort || 'AI'}
            </span>
        </div>
    );
}

export function SageOutsideDismiss({ onDismiss }) {
    return (
        <div
            className="arborito-sage-outside-dismiss"
            aria-hidden="true"
            onClick={onDismiss}
            role="presentation"
        />
    );
}

export function SageMobPanel({ children, guide = false, extraClass = '', enterAnim = false }) {
    const guideCls = guide ? ' arborito-sage-guide-full-mob' : '';
    const anim = enterAnim ? ' arborito-dock-modal-enter' : '';
    return (
        <div className={`arborito-sage-mob-panel-root${guideCls}${extraClass}${anim}`}>
            <div className={`arborito-modal-dock-panel${guide ? '' : ' arborito-sage-overlay-host'}`}>
                {children}
            </div>
        </div>
    );
}

export function SageDeskGuideShell({ children, enterAnim = false, onDismiss }) {
    const anim = enterAnim ? ' arborito-dock-modal-enter' : '';
    return (
        <>
            <SageOutsideDismiss onDismiss={onDismiss} />
            <div
                className={`pointer-events-auto arborito-sage-guide-shell flex flex-col overflow-hidden${anim}`}
            >
                {children}
            </div>
        </>
    );
}

export function SageDeskChatShell({ children, onDismiss }) {
    return (
        <>
            <SageOutsideDismiss onDismiss={onDismiss} />
            <div
                className="pointer-events-auto arborito-sage-chat-shell arborito-sage-overlay-host flex flex-col animate-in slide-in-from-bottom-10 fade-in overflow-hidden"
                role="dialog"
                aria-modal="true"
                aria-labelledby="sage-dialog-title"
            >
                {children}
            </div>
        </>
    );
}
