import { Callout } from './Callout.jsx';
import { MODAL_CTA_CANCEL, modalCtaConfirm } from './modal-action-chrome.js';
import { NestedSheetShell } from './NestedSheetShell.jsx';

/**
 * Destructive / binary confirm inside a dock hub (Biblioteca, curriculum switcher, …).
 * Keeps the parent modal mounted, use `store.confirm()` for viewport-level dialogs.
 */
export function ConfirmNestedSheet({
    title,
    body,
    icon = '⚠️',
    cancelLabel = 'Cancel',
    confirmLabel = 'OK',
    danger = true,
    onCancel,
    onConfirm,
    zIndex = 120,
    ariaLabel,
}) {
    const confirmTone = danger ? 'red' : 'emerald';
    const titleClass = 'arborito-callout__title font-black m-0 dark:text-white';

    return (
        <NestedSheetShell
            variant="confirm"
            onBackdropClick={onCancel}
            zIndex={zIndex}
            ariaLabel={ariaLabel || title}
        >
            <Callout
                tone="amber"
                layout="centered"
                icon={icon}
                title={title}
                body={body}
                extraClass="w-full border-0 bg-transparent shadow-none p-0 m-0 gap-3 px-2 sm:px-3"
                titleClass={titleClass}
                bodyClass="arborito-callout__body text-sm text-slate-500 dark:text-slate-400 mt-1 mb-0 text-center leading-relaxed px-1"
            />
            <div className="arborito-modal-footer arborito-modal-footer--bg-flat">
                <div className="arborito-action-row w-full">
                    <button type="button" className={MODAL_CTA_CANCEL} onClick={onCancel}>
                        {cancelLabel}
                    </button>
                    <button type="button" className={modalCtaConfirm(confirmTone)} onClick={onConfirm}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </NestedSheetShell>
    );
}
