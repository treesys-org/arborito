import { ConfirmNestedSheet } from '../../../../shared/ui/ConfirmNestedSheet.jsx';

/** In-hub confirm overlay inside sources (delete, stop account sync, …). */
export function SourcesDeleteOverlay({ ui, title, body, confirmLabel, onCancel, onConfirm }) {
    return (
        <ConfirmNestedSheet
            title={title ?? ui.deleteTreeConfirm}
            body={body}
            cancelLabel={ui.cancel}
            confirmLabel={confirmLabel ?? ui.sourceRemove}
            onCancel={onCancel}
            onConfirm={onConfirm}
            zIndex={200}
        />
    );
}
