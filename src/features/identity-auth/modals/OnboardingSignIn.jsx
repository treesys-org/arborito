import { useState } from 'react';
import { useIdentityAuth } from '../hooks/useIdentityAuth.js';
import { LoadingBrandRing } from '../../../shared/ui/Loading.jsx';
import { LoginRecoverySetupCard } from '../components/LoginRecoverySetupCard.jsx';
import { LoginPasswordField } from '../components/LoginPasswordField.jsx';
import { LoginPasswordRecoveryLinks } from '../components/LoginAuthExtras.jsx';
import { ProfileLoginMethodTabs } from '../components/ProfileLoginMethodTabs.jsx';
import { useViewportShell } from '../../../shared/ui/breakpoints.js';

function BusyBanner({ label }) {
    if (!label) return null;
    return (
        <p className="arborito-onb-busy-banner" role="status" aria-live="polite">
            <LoadingBrandRing size="sm" />
            <span className="arborito-onb-busy-banner__text">{label}</span>
        </p>
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

export function OnboardingSignInRegistered({
    registerResult,
    guardActive,
    secretSaved,
    onDownload,
    onSetupRecovery,
    onFinish,
}) {
    const { ui } = useIdentityAuth();
    const [recoverySetupOn, setRecoverySetupOn] = useState(false);
    const { mobile } = useViewportShell();
    const r = registerResult || { username: '', qrDataUrl: '' };
    const title = ui.onboardingRegisteredTitle || 'Account created!';
    const subtitle = mobile
        ? ui.onboardingRegisteredPasswordSubtitleMobile ||
          ui.onboardingRegisteredPasswordSubtitle ||
          'Your password is ready. Export a sync key or set a recovery phrase. You can also do this later in Profile.'
        : ui.onboardingRegisteredPasswordSubtitleDesktop ||
          ui.onboardingRegisteredPasswordSubtitle ||
          'Your password is ready. Show the sync QR to your phone or download a sync key file.';
    const userLbl = ui.onboardingRegisteredUsernameLabel || 'Username';
    const finishLbl = ui.onboardingContinue || 'Continue';
    const finishWaitLbl = ui.onboardingPleaseWait || 'Please wait a moment…';
    const qrHint = mobile
        ? ui.onboardingRegisteredQrHintMobile ||
          'On your other device choose “Scan sync QR” and scan this code.'
        : ui.onboardingRegisteredQrHintDesktop ||
          ui.onboardingRegisteredQrHint ||
          'Scan with your phone to sign in on that device.';

    return (
        <div className="arborito-onb-form arborito-onb-form--registered">
            <p className="arborito-onb-registered-title">{title}</p>
            <p className="arborito-onb-registered-sub">{subtitle}</p>
            <div className="arborito-onb-cred">
                <p className="arborito-onb-cred__label">{userLbl}</p>
                <p className="arborito-onb-cred__value">{r.username}</p>
            </div>
            <LoginRecoverySetupCard
                ui={ui}
                enabled={recoverySetupOn}
                onEnabledChange={setRecoverySetupOn}
                onDownloadBackup={onDownload}
                onSetupRecovery={onSetupRecovery}
            />
            {r.qrDataUrl && !mobile ? (
                <div className="arborito-onb-qr">
                    <p className="arborito-onb-qr__label">{ui.qrSyncShowCta || 'Sync with QR'}</p>
                    <img src={r.qrDataUrl} alt="" className="arborito-onb-qr__img" />
                    <p className="arborito-onb-qr__hint">{qrHint}</p>
                </div>
            ) : null}
            {secretSaved ? (
                <p className="login-recovery-card__saved" role="status" aria-live="polite">
                    ✓ {ui.onboardingRegisteredRecoverySavedHint || 'Backup saved. You can continue.'}
                </p>
            ) : null}
            <button
                type="button"
                className="arborito-onb-cta"
                disabled={guardActive}
                aria-disabled={guardActive ? 'true' : undefined}
                onClick={onFinish}
            >
                {guardActive
                    ? finishWaitLbl
                    : !secretSaved
                      ? ui.loginRecoverySkipCta || 'Continue without backup'
                      : finishLbl}
            </button>
        </div>
    );
}
