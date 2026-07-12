import { useState } from 'react';

function EyeToggleIcon({ hidden }) {
    if (hidden) {
        return (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <path d="M1 1l22 22" />
                <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            </svg>
        );
    }
    return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    );
}

/** Password input with reveal toggle for login/register flows. */
export function LoginPasswordField({
    id,
    label,
    value,
    onChange,
    disabled = false,
    autoComplete = 'current-password',
    placeholder,
    ui,
    onEnter,
    className = '',
}) {
    const [visible, setVisible] = useState(false);
    const showLbl = ui?.loginPasswordShow || 'Show password';
    const hideLbl = ui?.loginPasswordHide || 'Hide password';

    return (
        <div className={`arborito-onb-field${className ? ` ${className}` : ''}`}>
            {label ? <label htmlFor={id}>{label}</label> : null}
            <div className="arborito-onb-password-wrap">
                <input
                    id={id}
                    type={visible ? 'text' : 'password'}
                    autoComplete={autoComplete}
                    className="arborito-onb-input arborito-onb-input--password"
                    disabled={disabled}
                    value={value}
                    placeholder={placeholder}
                    aria-label={label || placeholder}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            onEnter?.();
                        }
                    }}
                />
                <button
                    type="button"
                    className="arborito-onb-password-toggle"
                    disabled={disabled}
                    aria-label={visible ? hideLbl : showLbl}
                    title={visible ? hideLbl : showLbl}
                    aria-pressed={visible ? 'true' : 'false'}
                    onClick={() => setVisible((on) => !on)}
                >
                    <EyeToggleIcon hidden={visible} />
                </button>
            </div>
        </div>
    );
}
