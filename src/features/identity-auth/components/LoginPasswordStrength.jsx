import { evaluateLoginPasswordStrength } from '../api/login-password-strength.js';

/**
 * Red / orange / green bar shown while the user types a login password.
 * @param {{ password: string, ui: Record<string, string> }} props
 */
export function LoginPasswordStrength({ password, ui }) {
    const ev = evaluateLoginPasswordStrength(password);
    if (!String(password || '').length) return null;

    const label =
        (ev.labelKey && ui[ev.labelKey]) ||
        (ev.level === 'strong'
            ? 'Strong password'
            : ev.level === 'good'
              ? 'Good password'
              : ev.level === 'fair'
                ? 'Fair: add length or symbols'
                : 'Weak: use at least 10 characters');

    return (
        <div className="login-pw-strength" role="status" aria-live="polite">
            <div className="login-pw-strength__track" aria-hidden="true">
                <div
                    className={`login-pw-strength__bar login-pw-strength__bar--${ev.level}`}
                    style={{ width: `${ev.percent}%` }}
                />
            </div>
            <p className={`login-pw-strength__label login-pw-strength__label--${ev.level}`}>{label}</p>
        </div>
    );
}
