import {
    MODAL_CTA_CANCEL,
    modalCtaConfirm,
    modalCtaConfirmDanger,
    modalCtaConfirmDangerFull,
    modalCtaConfirmFull,
} from './modal-action-chrome.js';
import { LoadingButtonContent } from './Loading.jsx';

/**
 * Shared Cancel / Confirm footer for DialogModal, nested sheets, and feature modals.
 * Always wraps `arborito-modal-footer` + `arborito-action-row` so focus rings match.
 */
export function ModalBinaryFooter({
    cancelLabel = 'Cancel',
    onCancel,
    hideCancel = false,
    confirmLabel = 'OK',
    onConfirm,
    hideConfirm = false,
    danger = false,
    confirmTone = 'emerald',
    fullWidthConfirm = false,
    disabled = false,
    busy = false,
    stackMobile = false,
    footerVariant = 'flat',
    className = '',
    paddingClass = '',
    children,
}) {
    const variantClass =
        footerVariant === 'flat'
            ? 'arborito-modal-footer--bg-flat'
            : footerVariant === 'blend'
              ? 'arborito-modal-footer--blend'
              : '';
    const confirmClass = danger
        ? fullWidthConfirm || hideCancel
            ? modalCtaConfirmDangerFull()
            : modalCtaConfirmDanger()
        : fullWidthConfirm || hideCancel
          ? modalCtaConfirmFull(confirmTone)
          : modalCtaConfirm(confirmTone);
    const confirmBlocked = disabled || busy;

    return (
        <div
            className={`arborito-modal-footer shrink-0 ${variantClass} ${paddingClass} ${className}`.trim()}
        >
            {children != null ? (
                children
            ) : (
                <div
                    className={`arborito-action-row w-full ${stackMobile ? 'arborito-action-row--stack-mobile' : ''} ${hideCancel && !hideConfirm ? (stackMobile ? 'flex-col' : '') : ''}`.trim()}
                >
                    {!hideCancel ? (
                        <button
                            type="button"
                            className={MODAL_CTA_CANCEL}
                            disabled={busy}
                            onClick={onCancel}
                        >
                            {cancelLabel}
                        </button>
                    ) : null}
                    {!hideConfirm ? (
                        <button
                            type="button"
                            className={confirmClass}
                            disabled={confirmBlocked}
                            aria-busy={busy ? 'true' : undefined}
                            onClick={onConfirm}
                        >
                            {busy ? <LoadingButtonContent label={confirmLabel} /> : confirmLabel}
                        </button>
                    ) : null}
                </div>
            )}
        </div>
    );
}
