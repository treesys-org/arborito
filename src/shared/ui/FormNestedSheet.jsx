import { useEffect } from 'react';
import { NestedSheetShell } from './NestedSheetShell.jsx';
import { MODAL_CTA_CANCEL, modalCtaConfirm } from './modal-action-chrome.js';

/**
 * Consolidated in-hub form sheet (forum new topic, arcade add game, …).
 * Header + scroll body + cancel/submit footer, same chrome as Biblioteca nested forms.
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
    panelSizeTier = 'STANDARD',
}) {
    const resolvedHeadingId = headingId || ariaLabelledBy;

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
            panelSizeTier={panelSizeTier}
            onBackdropClick={onCancel}
            cardExtraClass="rounded-2xl sm:rounded-3xl border border-slate-200/90 dark:border-slate-600/80 bg-white dark:bg-slate-900 p-5 sm:p-7"
        >
            <div className="flex items-start justify-between gap-3 mb-4 shrink-0">
                <div className="min-w-0">
                    {kicker ? <p className="arborito-eyebrow mb-1">{kicker}</p> : null}
                    <h3
                        id={resolvedHeadingId}
                        className="text-lg sm:text-xl font-black text-slate-900 dark:text-white leading-tight"
                    >
                        {title}
                    </h3>
                    {hint ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">{hint}</p>
                    ) : null}
                </div>
                <button
                    type="button"
                    className="arborito-icon-btn arborito-icon-btn--md"
                    aria-label={closeLabel || 'Close'}
                    onClick={onCancel}
                >
                    ×
                </button>
            </div>

            <div className="arborito-mob-scroll-pane custom-scrollbar space-y-4 pr-1">{children}</div>

            <div className="arborito-modal-footer arborito-modal-footer--bg-flat mt-0">
                <div className="arborito-action-row w-full">
                    <button type="button" className={MODAL_CTA_CANCEL} onClick={onCancel}>
                        {cancelLabel || 'Cancel'}
                    </button>
                    <button
                        type="button"
                        className={modalCtaConfirm('emerald')}
                        disabled={submitDisabled}
                        aria-busy={submitBusy ? 'true' : undefined}
                        onClick={onSubmit}
                    >
                        {submitLabel}
                    </button>
                </div>
            </div>
        </NestedSheetShell>
    );
}
