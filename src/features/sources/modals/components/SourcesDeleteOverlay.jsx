import { ConfirmNestedSheet } from '../../../../shared/ui/ConfirmNestedSheet.jsx';

/** Delete confirm overlay inside sources modal (branch or composed tree). */
export function SourcesDeleteOverlay({ ui, title, body, onCancel, onConfirm }) {
    return (
        <ConfirmNestedSheet
            title={title ?? ui.deleteTreeConfirm}
            body={body}
            cancelLabel={ui.cancel}
            confirmLabel={ui.sourceRemove}
            onCancel={onCancel}
            onConfirm={onConfirm}
            zIndex={200}
        />
    );
}
