import { useEffect } from 'react';
import { ModalHubHero } from '../../app/components/ModalHero.jsx';
import { NestedSheetShell } from './NestedSheetShell.jsx';
import { ModalBinaryFooter } from './ModalBinaryFooter.jsx';
import { shouldShowMobileUI } from './breakpoints.js';

/**
 * In-hub form prompt — same header chrome as Language / DialogModal:
 * ModalHubHero (grab + icon + title + ×/←) → body → ModalBinaryFooter.
 * Hosted in NestedSheetShell (absolute scrim inside the parent hub).
 */
export function FormNestedSheet({
    panelId,
    ariaLabelledBy,
    headingId,
    kicker,
    title,
    hint,
    closeLabel,
    cancelLabel,
    submitLabel,
    onCancel,
    onSubmit,
    submitDisabled = false,
    submitBusy = false,
    focusInputId,
    children,
    leadingIcon = '📋',
}) {
    const resolvedHeadingId = headingId || ariaLabelledBy;
    const ui = { close: closeLabel || 'Close', navBack: closeLabel || 'Close' };
    const mobile = shouldShowMobileUI();

    useEffect(() => {
        const h = (e) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            e.stopImmediatePropagation();
            onCancel?.();
        };
        document.addEventListener('keydown', h, true);
        return () => document.removeEventListener('keydown', h, true);
    }, [onCancel]);

    useEffect(() => {
        if (!focusInputId) return;
        document.getElementById(focusInputId)?.focus();
    }, [focusInputId]);

    return (
        <NestedSheetShell
            variant="form"
            panelId={panelId}
            ariaLabelledBy={resolvedHeadingId}
            zIndex={200}
            onBackdropClick={onCancel}
        >
            <div className="arborito-nested-form-shell flex flex-col min-h-0 w-full">
                <ModalHubHero
                    ui={ui}
                    mobile={mobile}
                    title={title}
                    titleId={resolvedHeadingId}
                    leadingIcon={leadingIcon}
                    tagClass="btn-dialog-dismiss"
                    backTagClass="btn-dialog-mob-back"
                    closeTagClass="btn-dialog-dismiss"
                    onBack={onCancel}
                    onClose={onCancel}
                />
                <div className="arborito-nested-form-body flex flex-col min-h-0 flex-1">
                    {kicker ? <p className="arborito-eyebrow mb-2">{kicker}</p> : null}
                    {hint ? <p className="arborito-dialog-intro">{hint}</p> : null}
                    {children ? <div className="w-full min-h-0 space-y-4">{children}</div> : null}
                </div>
                <ModalBinaryFooter
                    className="mt-0 w-full relative z-[4]"
                    footerVariant="blend"
                    cancelLabel={cancelLabel || 'Cancel'}
                    onCancel={onCancel}
                    confirmLabel={submitLabel}
                    onConfirm={onSubmit}
                    disabled={submitDisabled}
                    busy={submitBusy}
                />
            </div>
        </NestedSheetShell>
    );
}
