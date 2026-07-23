import { LoginPasswordStrength } from '../components/LoginPasswordStrength.jsx';
import { LoginPasswordField } from './LoginPasswordField.jsx';

/** Register with a user-chosen password (default and only path). */
export function LoginPasswordRegisterFields({
    ui,
    disabled,
    password,
    passwordConfirm,
    onPasswordChange,
    onPasswordConfirmChange,
}) {
    return (
        <>
            <LoginPasswordField
                id="login-reg-password"
                label={ui.loginPasswordLabel || 'Password'}
                autoComplete="new-password"
                disabled={disabled}
                value={password}
                ui={ui}
                onChange={onPasswordChange}
            />
            <LoginPasswordStrength password={password} ui={ui} />
            <LoginPasswordField
                id="login-reg-password2"
                label={ui.loginPasswordConfirmLabel || 'Repeat password'}
                autoComplete="new-password"
                disabled={disabled}
                value={passwordConfirm}
                ui={ui}
                onChange={onPasswordConfirmChange}
            />
        </>
    );
}
