/**
 * Secondary auth links under the password field (forgot password, sync key file).
 */
export function LoginForgotPasswordLink({ ui, disabled, onClick }) {
    if (!onClick) return null;
    const lbl = ui.loginForgotPassword || 'Forgot your password?';
    return (
        <div className="login-forgot-row">
            <button type="button" className="login-forgot-link" disabled={disabled} onClick={onClick}>
                {lbl}
            </button>
        </div>
    );
}

export function LoginSyncKeyFileLink({ ui, disabled, fileInputId = 'profile-sync-file-txt', onPickFile }) {
    if (!onPickFile) return null;
    const lbl = ui.loginSyncKeyFileLink || ui.syncKeyImportCta || 'Sign in with sync key file';
    return (
        <div className="login-recovery-extras">
            <button
                type="button"
                className="login-recovery-extras__link"
                disabled={disabled}
                onClick={() => document.getElementById(fileInputId)?.click()}
            >
                {lbl}
            </button>
            <input
                id={fileInputId}
                type="file"
                className="hidden"
                accept=".txt,text/plain"
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    onPickFile(f || null);
                }}
            />
        </div>
    );
}

/** Forgot-password entry under the password field. */
export function LoginPasswordRecoveryLinks({ ui, disabled, onForgotPassword }) {
    return (
        <div className="login-password-recovery-links">
            <LoginForgotPasswordLink ui={ui} disabled={disabled} onClick={onForgotPassword} />
        </div>
    );
}
