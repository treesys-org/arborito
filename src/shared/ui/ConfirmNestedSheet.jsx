import { useEffect } from 'react';
import { Callout } from './Callout.jsx';
import { ModalBinaryFooter } from './ModalBinaryFooter.jsx';
import { NestedSheetShell } from './NestedSheetShell.jsx';

/**
 * Binary confirm inside a dock hub (Biblioteca delete, snapshot delete, …).
 * Centered callout card — dismiss via footer Cancel / Escape / scrim.
 * Viewport-level dialogs use `store.confirm()` (Language-style ModalHubHero).
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
    const titleClass = 'arborito-callout__title font-black m-0 dark:text-white';

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
            <ModalBinaryFooter
                footerVariant="blend"
                cancelLabel={cancelLabel}
                onCancel={onCancel}
                confirmLabel={confirmLabel}
                onConfirm={onConfirm}
                danger={danger}
            />
        </NestedSheetShell>
    );
}
