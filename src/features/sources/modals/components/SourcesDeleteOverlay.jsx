import { useEffect, useState } from 'react';
import { ConfirmNestedSheet } from '../../../../shared/ui/ConfirmNestedSheet.jsx';

/** In-hub confirm overlay inside sources (delete, stop account sync, …). */
export function SourcesDeleteOverlay({
    ui,
    title,
    body,
    confirmLabel,
    onCancel,
    onConfirm,
    alsoMembersLabel,
    alsoMembersDefault = true,
    showAlsoMembers = false,
}) {
    const [alsoMembers, setAlsoMembers] = useState(!!alsoMembersDefault);
    useEffect(() => {
        setAlsoMembers(!!alsoMembersDefault);
    }, [alsoMembersDefault, showAlsoMembers, title]);

    const extra =
        showAlsoMembers && alsoMembersLabel ? (
            <label className="flex items-start gap-2.5 px-3 sm:px-4 pb-1 text-left cursor-pointer select-none">
                <input
                    type="checkbox"
                    className="mt-0.5 shrink-0 rounded border-slate-300 dark:border-slate-600"
                    checked={alsoMembers}
                    onChange={(e) => setAlsoMembers(!!e.target.checked)}
                />
                <span className="text-sm text-slate-600 dark:text-slate-300 leading-snug">
                    {alsoMembersLabel}
                </span>
            </label>
        ) : null;

    return (
        <ConfirmNestedSheet
            title={title ?? ui.deleteTreeConfirm}
            body={body}
            cancelLabel={ui.cancel}
            confirmLabel={confirmLabel ?? ui.sourceRemove}
            onCancel={onCancel}
            onConfirm={() => onConfirm?.(showAlsoMembers ? { alsoMembers } : undefined)}
            zIndex={200}
            extra={extra}
        />
    );
}
