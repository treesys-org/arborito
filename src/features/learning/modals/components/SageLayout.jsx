import { armSagePointerGuard, isSagePointerGuarded } from '../../api/sage-pointer-guard.js';
import { DockHubShell } from '../../../../app/components/DockHubShell.jsx';

export function SageModeToggle({ ui, isAi, onChange }) {
    const toggle = (e) => {
        e?.stopPropagation?.();
        e?.preventDefault?.();
        armSagePointerGuard(800);
        onChange(isAi ? 'guide' : 'dynamic');
    };

    return (
        <div
            className="arborito-switch-inline shrink-0"
            role="group"
            aria-label={ui.sageModeToggleAria || 'Sage mode'}
            onPointerDown={(e) => {
                e.stopPropagation();
                armSagePointerGuard(800);
            }}
            onClick={(e) => e.stopPropagation()}
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
            onPointerDown={(e) => {
                if (isSagePointerGuarded()) {
                    e.stopPropagation();
                    e.preventDefault();
                }
            }}
            onClick={(e) => {
                if (isSagePointerGuarded()) {
                    e.stopPropagation();
                    e.preventDefault();
                    return;
                }
                onDismiss?.(e);
            }}
            role="presentation"
        />
    );
}

export function SageMobPanel({ children, hero, guide = false, extraClass = '', enterAnim = false }) {
    const guideCls = guide ? ' arborito-sage-guide-full-mob' : '';
    const anim = enterAnim ? ' arborito-dock-modal-enter' : '';
    const hostCls = guide ? '' : ' arborito-sage-overlay-host';
    return (
        <div className={`arborito-sage-mob-panel-root${guideCls}${extraClass}${anim}`}>
            <div className={`arborito-modal-dock-panel${hostCls}`}>
                <DockHubShell mobile hero={hero} skipBodyWrap rootClass="arborito-sage-dock-inner">
                    {children}
                </DockHubShell>
            </div>
        </div>
    );
}

export function SageDeskGuideShell({ children, hero, enterAnim = false }) {
    const anim = enterAnim ? ' arborito-dock-modal-enter' : '';
    return (
        <div
            className={`pointer-events-auto arborito-sage-guide-shell flex flex-col overflow-hidden${anim}`}
        >
            <DockHubShell mobile={false} hero={hero} skipBodyWrap rootClass="arborito-sage-dock-inner">
                {children}
            </DockHubShell>
        </div>
    );
}

export function SageDeskChatShell({ children, hero }) {
    return (
        <div
            className="pointer-events-auto arborito-sage-chat-shell arborito-sage-overlay-host flex flex-col animate-in slide-in-from-bottom-10 fade-in overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sage-dialog-title"
        >
            <DockHubShell mobile={false} hero={hero} skipBodyWrap rootClass="arborito-sage-dock-inner">
                {children}
            </DockHubShell>
        </div>
    );
}
