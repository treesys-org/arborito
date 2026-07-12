import { useIdentityAuth } from '../hooks/useIdentityAuth.js';
import { useCallback, useState } from 'react';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { CompactDialogShell } from '../../../shared/ui/CompactDialogShell.jsx';
import { MODAL_CTA_CANCEL, modalCtaConfirm } from '../../../shared/ui/modal-action-chrome.js';
import { Callout } from '../../../shared/ui/Callout.jsx';
import { LoadingRow } from '../../../shared/ui/Loading.jsx';
import { humanizeAuthError } from '../api/sync-login-error-humanize.js';
import { normalizeUsername } from '../api/sync-login-secret.js';
import {
    RECOVERY_MIN_PASSPHRASE_CHARS,
    RECOVERY_RECOMMENDED_WORDS,
    checkRecoveryPassphraseStrength,
} from '../api/account-recovery.js';
import { completeOnboardingWizard } from '../api/onboarding-complete.js';
import { AuthModalForm } from '../components/AuthModalForm.jsx';
import { LoginPasswordField } from '../components/LoginPasswordField.jsx';
import { LoginRecoveryPassphraseFields } from '../components/LoginRecoveryPassphraseFields.jsx';
import { LoginSyncKeyFileLink } from '../components/LoginAuthExtras.jsx';
import { parseRecoveryKitFromExportFile } from '../api/recovery-kit.js';

/**
 * Recovery passphrase: user-chosen secret used only if they forget their password.
 */
export function ModalRecoverAccount() {
    const { ui, dismissModal, setModal, notify, identityActions, modal, authSession } = useIdentityAuth();
    const { setAccountRecovery, recoverAccountWithPassphrase, signInWithSyncSecret, downloadRecoveryKitFile } =
        identityActions;
    const mobile = shouldShowMobileUI();

    const m = modal && typeof modal === 'object' ? modal : {};
    const mode = m.mode === 'setup' ? 'setup' : 'recover';

    const [username, setUsername] = useState(String(m.prefillUsername || '').trim());
    const [passphrase, setPassphrase] = useState('');
    const [passphrase2, setPassphrase2] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const close = useCallback(() => {
        const fromOnb = m && m.fromOnboarding;
        if (fromOnb) {
            const hint = typeof fromOnb === 'object' ? fromOnb : {};
            const payload = { type: 'onboarding' };
            if (Number(hint.step) === 2) payload.step = 2;
            if (hint.view) payload.view = hint.view;
            setModal(payload);
            return;
        }
        if (m && m.fromProfile) {
            setModal({ type: 'profile' });
            return;
        }
        dismissModal();
    }, [dismissModal, m, setModal]);

    const tryRecoveryKeyFile = useCallback(
        async (file) => {
            if (!file) return;
            setBusy(true);
            setError('');
            try {
                const raw = await file.text();
                const parsed = await parseRecoveryKitFromExportFile(raw);
                if (!parsed) {
                    setError(ui.recoveryKeyFileUnreadable || 'Invalid recovery key file.');
                    setBusy(false);
                    return;
                }
                await signInWithSyncSecret(parsed.username, parsed.password);
                notify(ui.recoveryKeyFileSignedInOk || 'Signed in with your recovery key.', false);
                const fromOnb = m && m.fromOnboarding;
                if (fromOnb) {
                    completeOnboardingWizard({ setModal });
                } else if (m.fromProfile) {
                    setModal({ type: 'profile' });
                } else {
                    dismissModal();
                }
            } catch (e) {
                setError(humanizeAuthError(e, ui));
                setBusy(false);
            }
        },
        [signInWithSyncSecret, notify, ui, dismissModal, m, setModal]
    );

    const doRecover = useCallback(async () => {
        const name = normalizeUsername(username);
        if (!name) {
            setError(ui.authUsernameRequired || 'Enter your username.');
            return;
        }
        if (!passphrase.trim()) {
            setError(ui.recoveryPassphraseRequired || 'Enter your recovery passphrase.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            await recoverAccountWithPassphrase({ username: name, passphrase });
            notify(ui.recoveryRecoveredOk || 'Account recovered. You are signed in.', false);
            const fromOnb = m && m.fromOnboarding;
            if (fromOnb) {
                completeOnboardingWizard({ setModal });
            } else if (m.fromProfile) {
                setModal({ type: 'profile' });
            } else {
                dismissModal();
            }
        } catch (e) {
            setError(humanizeAuthError(e, ui));
            setBusy(false);
        }
    }, [username, passphrase, recoverAccountWithPassphrase, notify, ui, dismissModal, m, setModal]);

    const doSetup = useCallback(async () => {
        const strength = checkRecoveryPassphraseStrength(passphrase);
        if (!strength.ok) {
            setError(
                (ui.recoveryPassphraseTooWeak ||
                    'Passphrase too weak. Use at least {n} characters ({w}+ words recommended).')
                    .replace('{n}', String(RECOVERY_MIN_PASSPHRASE_CHARS))
                    .replace('{w}', String(RECOVERY_RECOMMENDED_WORDS))
            );
            return;
        }
        if (passphrase.trim() !== passphrase2.trim()) {
            setError(ui.recoveryPassphraseMismatch || 'The passphrases do not match.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            await setAccountRecovery({ passphrase });
            if (m.fromOnboarding) {
                window.dispatchEvent(new CustomEvent('arborito-onboarding-recovery-setup'));
            }
            close();
        } catch (e) {
            setError(humanizeAuthError(e, ui));
            setBusy(false);
        }
    }, [passphrase, passphrase2, setAccountRecovery, close, ui, m.fromOnboarding]);

    const title =
        mode === 'setup'
            ? ui.profileAccountRecoveryTitle || ui.recoverySetupTitle || 'Account recovery'
            : ui.recoveryRecoverTitle || 'Recover your account';

    const securityNote =
        ui.recoveryPassphraseNote ||
        'Choose a phrase you will remember if you forget your password. Do not reuse your login password. The phrase never leaves this device.';

    const minHint = (ui.recoveryMinHint || 'At least {n} characters ({w}+ words recommended).')
        .replace('{n}', String(RECOVERY_MIN_PASSPHRASE_CHARS))
        .replace('{w}', String(RECOVERY_RECOMMENDED_WORDS));

    const primaryLabel =
        mode === 'recover'
            ? ui.recoveryRecoverCta || 'Recover account'
            : ui.recoverySaveCta || 'Save recovery passphrase';
    const primaryAction = mode === 'recover' ? () => void doRecover() : () => void doSetup();

    let body;
    if (busy) {
        body = (
            <LoadingRow
                label={mode === 'setup' ? (ui.recoverySaving || 'Saving…') : (ui.recoveryWorking || 'Recovering…')}
                tone="sky"
                size="sm"
                extraClass="justify-center font-bold"
            />
        );
    } else if (mode === 'recover') {
        body = (
            <AuthModalForm>
                <p className="arborito-onb-field-hint">
                    {ui.recoveryEnterUsernameLead ||
                        'Enter your username and the recovery passphrase you chose when you set it up.'}
                </p>
                <div className="arborito-onb-field">
                    <label htmlFor="recovery-username">{ui.profileSignInUsernameLabel || 'Online username'}</label>
                    <input
                        id="recovery-username"
                        type="text"
                        autoComplete="username"
                        spellCheck={false}
                        className="arborito-onb-input"
                        value={username}
                        placeholder={ui.profileSignInUsernamePlaceholder || 'your_username'}
                        onChange={(e) => {
                            setUsername(e.target.value);
                            if (error) setError('');
                        }}
                    />
                </div>
                <LoginPasswordField
                    id="recovery-passphrase-recover"
                    label={ui.recoveryPassphraseLabel || 'Recovery passphrase'}
                    autoComplete="off"
                    placeholder={ui.recoveryPassphrasePlaceholder || 'Recovery passphrase'}
                    disabled={busy}
                    value={passphrase}
                    ui={ui}
                    onChange={(v) => {
                        setPassphrase(v);
                        if (error) setError('');
                    }}
                    onEnter={primaryAction}
                />
                {error ? <Callout tone="red" body={error} /> : null}
                <div className="login-recovery-extras login-recovery-extras--modal">
                    <p className="arborito-onb-field-hint m-0">
                        {ui.recoveryKeyFileLead ||
                            'If you exported a recovery key file, you can sign in with it instead of a passphrase.'}
                    </p>
                    <LoginSyncKeyFileLink
                        ui={ui}
                        disabled={busy}
                        fileInputId="recover-sync-key-file"
                        onPickFile={(f) => void tryRecoveryKeyFile(f)}
                    />
                </div>
            </AuthModalForm>
        );
    } else {
        body = (
            <AuthModalForm>
                <Callout tone="sky" body={securityNote} />
                <LoginRecoveryPassphraseFields
                    ui={ui}
                    disabled={busy}
                    passphrase={passphrase}
                    passphraseConfirm={passphrase2}
                    onPassphraseChange={(v) => {
                        setPassphrase(v);
                        if (error) setError('');
                    }}
                    onPassphraseConfirmChange={(v) => {
                        setPassphrase2(v);
                        if (error) setError('');
                    }}
                    onEnter={primaryAction}
                    minHint={minHint}
                />
                {error ? <Callout tone="red" body={error} /> : null}
                {downloadRecoveryKitFile && authSession?.syncSecretPlain && authSession?.recoveryKeyPlain ? (
                    <div className="login-recovery-extras login-recovery-extras--modal">
                        <button
                            type="button"
                            className="login-recovery-extras__link"
                            disabled={busy}
                            onClick={() =>
                                void downloadRecoveryKitFile(
                                    String(authSession.username || '').trim(),
                                    String(authSession.syncSecretPlain || '').trim(),
                                    String(authSession.recoveryKeyPlain || '').trim()
                                )
                            }
                        >
                            {ui.syncKeyExportCta || 'Export recovery key'}
                        </button>
                    </div>
                ) : null}
            </AuthModalForm>
        );
    }

    return (
        <CompactDialogShell
            ui={ui}
            mobile={mobile}
            title={title}
            leadingIcon="🔐"
            panelDataAttr="modal-recover-account"
            backTagClass="btn-recover-back"
            closeTagClass="btn-recover-close"
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
                            onClick={primaryAction}
                            disabled={busy}
                            aria-busy={busy ? 'true' : undefined}
                        >
                            {primaryLabel}
                        </button>
                    </div>
                </div>
            }
        >
            <div className="arborito-dialog-scroll flex-1 min-h-0">{body}</div>
        </CompactDialogShell>
    );
}
