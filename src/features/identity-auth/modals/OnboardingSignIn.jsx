import { useIdentityAuth } from '../hooks/useIdentityAuth.js';
import { LoadingBrandRing } from '../../../shared/ui/Loading.jsx';
import { LoginPasswordField } from '../components/LoginPasswordField.jsx';
import { LoginPasswordRecoveryLinks } from '../components/LoginAuthExtras.jsx';
import { ProfileLoginMethodTabs } from '../components/ProfileLoginMethodTabs.jsx';

function BusyBanner({ label }) {
    if (!label) return null;
    return (
        <p className="arborito-onb-busy-banner" role="status" aria-live="polite">
            <LoadingBrandRing size="sm" />
            <span className="arborito-onb-busy-banner__text">{label}</span>
        </p>
    );
}

export function OnboardingStep2Hero() {
    const { ui } = useIdentityAuth();
    const title = ui.onboardingSessionTitle || 'Sign in';
    const subtitle =
        ui.onboardingSessionSubtitle || 'Use your online account to sync progress across devices.';

    return (
        <div className="arborito-onboarding-hero arborito-onboarding-hero--step2">
            <h2 className="arborito-onb-step-title">{title}</h2>
            <p className="arborito-onb-step-subtitle">{subtitle}</p>
        </div>
    );
}

export function OnboardingSignInLogin({
    username,
    secret,
    busy,
    error,
    info,
    loginMethod = 'password',
    onLoginMethodChange,
    onUsernameChange,
    onSecretChange,
    onSubmit,
    onOpenQr,
    onOpenRecover,
}) {
    const { ui } = useIdentityAuth();
    const userLbl = ui.profileSignInUsernameLabel || 'Online username';
    const userPh = ui.profileSignInUsernamePlaceholder || 'your_username';
    const submitLbl = busy
        ? ui.onboardingLoginSigningInButton || 'Signing in…'
        : ui.syncLoginSubmitLogin || 'Sign in';
    const busyBannerLabel =
        ui.onboardingLoginSigningInBanner ||
        'Connecting to the network… this can take a few seconds. Please don\u2019t close or reload the tab.';

    return (
        <>
            {busy ? <BusyBanner label={busyBannerLabel} /> : null}
            <div className={`arborito-onb-form${busy ? ' arborito-onb-busy' : ''}`}>
                <div className="arborito-onb-field">
                    <label htmlFor="onb-login-username">{userLbl}</label>
                    <input
                        id="onb-login-username"
                        type="text"
                        autoComplete="username"
                        spellCheck={false}
                        value={username}
                        placeholder={userPh}
                        className="arborito-onb-input"
                        disabled={busy}
                        onChange={(e) => onUsernameChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey && loginMethod === 'password') {
                                e.preventDefault();
                                document.getElementById('onb-login-secret')?.focus();
                            }
                        }}
                    />
                </div>
                <ProfileLoginMethodTabs
                    ui={ui}
                    value={loginMethod}
                    disabled={busy}
                    onChange={onLoginMethodChange}
                />
                {loginMethod === 'password' ? (
                    <>
                        <LoginPasswordField
                            id="onb-login-secret"
                            label={ui.loginPasswordLabel || 'Password'}
                            autoComplete="current-password"
                            placeholder={ui.loginPasswordPlaceholder || 'Your password'}
                            disabled={busy}
                            value={secret}
                            ui={ui}
                            onChange={onSecretChange}
                            onEnter={onSubmit}
                        />
                        <LoginPasswordRecoveryLinks
                            ui={ui}
                            disabled={busy}
                            onForgotPassword={onOpenRecover}
                        />
                    </>
                ) : (
                    <p className="profile-login-method-hint">
                        {ui.loginMethodQrHint ||
                            ui.qrSyncScanHintMobile ||
                            'Scan the sync QR from your other signed-in device.'}
                    </p>
                )}
                {info ? (
                    <p className="arborito-onb-info" role="status">
                        {info}
                    </p>
                ) : null}
                {error ? (
                    <p className="arborito-onb-error" role="alert">
                        {error}
                    </p>
                ) : null}
                <button
                    type="button"
                    className="arborito-onb-cta arborito-onb-cta--signin"
                    disabled={busy}
                    aria-busy={busy ? 'true' : undefined}
                    onClick={() => {
                        if (loginMethod === 'qr') onOpenQr?.();
                        else onSubmit?.();
                    }}
                >
                    {loginMethod === 'qr' ? ui.qrSyncScanCta || 'Scan sync QR' : submitLbl}
                </button>
            </div>
        </>
    );
}
