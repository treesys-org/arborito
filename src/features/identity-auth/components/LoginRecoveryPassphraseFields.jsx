import { LoginPasswordField } from './LoginPasswordField.jsx';

/** Recovery passphrase setup — same field chrome as password register. */
export function LoginRecoveryPassphraseFields({
    ui,
    disabled = false,
    passphrase,
    passphraseConfirm,
    onPassphraseChange,
    onPassphraseConfirmChange,
    onEnter,
    minHint = '',
}) {
    return (
        <>
            <LoginPasswordField
                id="recovery-passphrase-setup"
                label={ui.recoveryPassphraseLabel || 'Recovery passphrase'}
                autoComplete="new-password"
                placeholder={ui.recoveryPassphrasePlaceholder || 'Recovery passphrase'}
                disabled={disabled}
                value={passphrase}
                ui={ui}
                onChange={onPassphraseChange}
                onEnter={onEnter}
            />
            <LoginPasswordField
                id="recovery-passphrase-setup-repeat"
                label={ui.recoveryPassphraseRepeatLabel || 'Repeat recovery passphrase'}
                autoComplete="new-password"
                placeholder={ui.recoveryPassphraseRepeatPlaceholder || 'Repeat the passphrase'}
                disabled={disabled}
                value={passphraseConfirm}
                ui={ui}
                onChange={onPassphraseConfirmChange}
                onEnter={onEnter}
            />
            {minHint ? <p className="arborito-onb-fineprint">{minHint}</p> : null}
        </>
    );
}
