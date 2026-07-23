import { useIdentityAuth } from '../hooks/useIdentityAuth.js';
import { useCallback, useState } from 'react';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { CompactDialogShell } from '../../../shared/ui/CompactDialogShell.jsx';
import { MODAL_CTA_CANCEL, modalCtaConfirm } from '../../../shared/ui/modal-action-chrome.js';
import { Callout } from '../../../shared/ui/Callout.jsx';
import { LoadingRow } from '../../../shared/ui/Loading.jsx';
import { humanizeAuthError } from '../api/sync-login-error-humanize.js';
import { AuthModalForm } from '../components/AuthModalForm.jsx';
import { LoginPasswordField } from '../components/LoginPasswordField.jsx';
import { LoginPasswordRegisterFields } from '../components/LoginPasswordRegisterFields.jsx';

export function ModalChangePassword() {
    const { ui, dismissModal, setModal, notify, identityActions, modal } = useIdentityAuth();
    const { changeSyncLoginPassword } = identityActions;
    const mobile = shouldShowMobileUI();

    const m = modal && typeof modal === 'object' ? modal : {};

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const close = useCallback(() => {
        if (m.fromProfile) {
            setModal({ type: 'profile' });
            return;
        }
        dismissModal();
    }, [dismissModal, m.fromProfile, setModal]);

    const doChange = useCallback(async () => {
        setBusy(true);
        setError('');
        try {
            await changeSyncLoginPassword({
                currentPassword,
                newPassword,
                newPasswordConfirm,
            });
            notify(ui.changePasswordOk || 'Password updated.', false);
            close();
        } catch (e) {
            setError(humanizeAuthError(e, ui));
            setBusy(false);
        }
    }, [currentPassword, newPassword, newPasswordConfirm, changeSyncLoginPassword, notify, ui, close]);

    const title = ui.changePasswordTitle || 'Change password';
    const recoveryNote =
        ui.changePasswordRecoveryClearedHint ||
        'If you had a recovery phrase set up, you will need to configure it again.';

    let body;
    if (busy) {
        body = (
            <LoadingRow
                label={ui.changePasswordSaving || 'Saving…'}
                tone="sky"
                size="sm"
                extraClass="justify-center font-bold"
            />
        );
    } else {
        body = (
            <AuthModalForm>
                <LoginPasswordField
                        id="change-password-current"
                        label={ui.changePasswordCurrentLabel || 'Current password'}
                        autoComplete="current-password"
                        placeholder={ui.loginPasswordPlaceholder || 'Your password'}
                        disabled={busy}
                        value={currentPassword}
                        ui={ui}
                        onChange={(v) => {
                            setCurrentPassword(v);
                            if (error) setError('');
                        }}
                        onEnter={() => void doChange()}
                    />
                    <LoginPasswordRegisterFields
                        ui={ui}
                        disabled={busy}
                        password={newPassword}
                        passwordConfirm={newPasswordConfirm}
                        onPasswordChange={(v) => {
                            setNewPassword(v);
                            if (error) setError('');
                        }}
                        onPasswordConfirmChange={(v) => {
                            setNewPasswordConfirm(v);
                            if (error) setError('');
                        }}
                    />
                    <p className="arborito-onb-fineprint">{recoveryNote}</p>
                    {error ? <Callout tone="red" body={error} /> : null}
            </AuthModalForm>
        );
    }

    return (
        <CompactDialogShell
            ui={ui}
            mobile={mobile}
            title={title}
            leadingIcon="🔑"
            panelDataAttr="modal-change-password"
            backTagClass="btn-change-password-back"
            closeTagClass="btn-change-password-close"
            onClose={close}
            onBackdropClick={close}
            footer={
                <div className="arborito-modal-footer arborito-modal-footer--bg-flat">
                    <div className="arborito-action-row w-full">
                        <button type="button" className={MODAL_CTA_CANCEL} onClick={close} disabled={busy}>
                            {ui.cancel || 'Cancel'}
                        </button>
                        <button
                            type="button"
                            className={modalCtaConfirm('emerald')}
                            onClick={() => void doChange()}
                            disabled={busy}
                            aria-busy={busy ? 'true' : undefined}
                        >
                            {ui.changePasswordSaveCta || 'Save new password'}
                        </button>
                    </div>
                </div>
            }
        >
            <div className="arborito-dialog-scroll flex-1 min-h-0">{body}</div>
        </CompactDialogShell>
    );
}
