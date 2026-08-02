import { useEffect, useState } from 'react';
import { ConfirmNestedSheet } from '../../../../shared/ui/ConfirmNestedSheet.jsx';
import { SwitchRow } from '../../../../shared/ui/SwitchRow.jsx';

/** In-hub confirm overlay inside sources (delete, stop account sync, …). */
export function SourcesDeleteOverlay({
    ui,
    title,
    body,
    confirmLabel,
    onCancel,
    onConfirm,
    alsoMembersLabel,
    alsoMembersHint,
    alsoMembersDefault = true,
    showAlsoMembers = false,
    alsoRetractLabel,
    alsoRetractHint,
    alsoRetractDefault = true,
    showAlsoRetract = false,
}) {
    const [alsoMembers, setAlsoMembers] = useState(!!alsoMembersDefault);
    const [alsoRetract, setAlsoRetract] = useState(!!alsoRetractDefault);
    useEffect(() => {
        setAlsoMembers(!!alsoMembersDefault);
    }, [alsoMembersDefault, showAlsoMembers, title]);
    useEffect(() => {
        setAlsoRetract(!!alsoRetractDefault);
    }, [alsoRetractDefault, showAlsoRetract, title]);

    const showSwitches =
        (showAlsoRetract && alsoRetractLabel) || (showAlsoMembers && alsoMembersLabel);
    const extra = showSwitches ? (
        <div className="w-full max-w-md mx-auto px-3 sm:px-4 pb-1 flex flex-col gap-1">
            {showAlsoRetract && alsoRetractLabel ? (
                <SwitchRow
                    id="sources-delete-also-retract"
                    label={alsoRetractLabel}
                    hint={alsoRetractHint}
                    checked={alsoRetract}
                    onChange={setAlsoRetract}
                    onAria={ui.deletePublishedAlsoRetractSwitchOn || alsoRetractLabel}
                    offAria={ui.deletePublishedAlsoRetractSwitchOff || alsoRetractLabel}
                    className="py-2"
                />
            ) : null}
            {showAlsoMembers && alsoMembersLabel ? (
                <SwitchRow
                    id="sources-delete-also-members"
                    label={alsoMembersLabel}
                    hint={alsoMembersHint}
                    checked={alsoMembers}
                    onChange={setAlsoMembers}
                    onAria={ui.sourcesDeleteComposedAlsoMembersSwitchOn || alsoMembersLabel}
                    offAria={ui.sourcesDeleteComposedAlsoMembersSwitchOff || alsoMembersLabel}
                    className="py-2"
                />
            ) : null}
        </div>
    ) : null;

    return (
        <ConfirmNestedSheet
            title={title ?? ui.deleteTreeConfirm}
            body={body}
            cancelLabel={ui.cancel}
            confirmLabel={confirmLabel ?? ui.sourceRemove}
            onCancel={onCancel}
            onConfirm={() => {
                const opts = {};
                if (showAlsoMembers) opts.alsoMembers = alsoMembers;
                if (showAlsoRetract) opts.alsoRetract = alsoRetract;
                onConfirm?.(showAlsoMembers || showAlsoRetract ? opts : undefined);
            }}
            zIndex={200}
            extra={extra}
        />
    );
}
