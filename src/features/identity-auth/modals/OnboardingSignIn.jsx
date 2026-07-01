import { useIdentityAuth } from '../hooks/useIdentityAuth.js';
import { useRef } from 'react';
import { LoadingBrandRing } from '../../../shared/ui/Loading.jsx';

function BusyBanner({ label }) {
    if (!label) return null;
    return (
        <p className="arborito-onb-busy-banner" role="status" aria-live="polite">
            <LoadingBrandRing size="sm" />
            <span className="arborito-onb-busy-banner__text">{label}</span>
        </p>
    );
}

function UsernameSuggestions({ ui, suggestions, busy, onPick }) {
    if (!suggestions?.length || busy) return null;
    const label = ui.syncLoginSuggestionsLabel || 'Try one of these free names:';
    return (
        <div className="arborito-onb-suggest" role="group">
            <p className="arborito-onb-suggest__label">{label}</p>
            <div className="arborito-onb-suggest__chips">
                {suggestions.map((n) => (
                    <button
                        key={n}
                        type="button"
                        className="arborito-onb-suggest-chip"
                        onClick={() => onPick(n)}
                    >
                        {n}
                    </button>
                ))}
            </div>
        </div>
    );
}

export function OnboardingSignInLogin({
    username,
    secret,
    busy,
    error,
    onUsernameChange,
    onSecretChange,
    onSubmit,
    onOpenQr,
    onPickFile,
}) {
    const { ui } = useIdentityAuth();
    const fileRef = useRef(null);
    const userLbl = ui.profileSignInUsernameLabel || 'Online username';
    const userPh = ui.profileSignInUsernamePlaceholder || 'your_username';
    const secLbl = ui.profileSignInSecretLabel || 'Login key (secret code)';
    const secPh = ui.syncLoginSecretPlaceholder || '0000-0000-0000-0000';
    const submitLbl = busy
        ? ui.onboardingLoginSigningInButton || 'Signing in…'
        : ui.syncLoginSubmitLogin || 'Sign in';
    const altLbl = ui.profileSignInAltLabel || 'Or sign in without typing:';
    const qrLbl = ui.profileSignInScanQrChip || 'Scan QR';
    const fileLbl = ui.profileSignInPickFileChip || '.txt file';
    const busyBannerLabel =
        ui.onboardingLoginSigningInBanner ||
        'Connecting to the relay network… this can take a few seconds. Please don\u2019t close or reload the tab.';

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
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                document.getElementById('onb-login-secret')?.focus();
                            }
                        }}
                    />
                </div>
                <div className="arborito-onb-field">
                    <label htmlFor="onb-login-secret">{secLbl}</label>
                    <input
                        id="onb-login-secret"
                        type="text"
                        autoComplete="current-password"
                        spellCheck={false}
                        value={secret}
                        placeholder={secPh}
                        className="arborito-onb-input arborito-onb-input--mono"
                        disabled={busy}
                        onChange={(e) => onSecretChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                onSubmit();
                            }
                        }}
                    />
                </div>
                {error ? (
                    <p className="arborito-onb-error" role="alert">
                        {error}
                    </p>
                ) : null}
                <button
                    type="button"
                    className="arborito-onb-cta"
                    disabled={busy}
                    aria-busy={busy ? 'true' : undefined}
                    onClick={onSubmit}
                >
                    {submitLbl}
                </button>
                <div className="arborito-onb-alt-block">
                    <div className="arborito-onb-alt-divider">
                        <span>{altLbl}</span>
                    </div>
                    <div className="arborito-onb-alt-grid">
                        <button
                            type="button"
                            className="arborito-onb-alt-btn"
                            disabled={busy}
                            onClick={onOpenQr}
                        >
                            <span className="arborito-onb-alt-btn__ic" aria-hidden="true">
                                📷
                            </span>
                            <span className="arborito-onb-alt-btn__label">{qrLbl}</span>
                        </button>
                        <button
                            type="button"
                            className="arborito-onb-alt-btn"
                            disabled={busy}
                            onClick={() => fileRef.current?.click()}
                        >
                            <span className="arborito-onb-alt-btn__ic" aria-hidden="true">
                                🔑
                            </span>
                            <span className="arborito-onb-alt-btn__label">{fileLbl}</span>
                        </button>
                    </div>
                </div>
                <input
                    ref={fileRef}
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
        </>
    );
}

export function OnboardingSignInRegister({
    username,
    busy,
    error,
    suggestions,
    onUsernameChange,
    onSubmit,
    onPickSuggestion,
}) {
    const { ui } = useIdentityAuth();
    const userLbl = ui.profileSignInUsernameLabel || 'Online username';
    const userPh = ui.profileSignInUsernamePlaceholder || 'your_username';
    const userHint =
        ui.onboardingRegisterUsernameHint ||
        'Pick a name that identifies you online. You can rename it later from Profile.';
    const submitLbl = busy
        ? ui.onboardingRegisterCreatingButton || ui.syncLoginCreatingShort || 'Creating account…'
        : ui.syncLoginSubmitRegister || 'Create account';
    const busyBannerLabel =
        ui.onboardingRegisterCreatingBanner ||
        'Creating your account… this can take a few seconds. Please don\u2019t close or reload the tab.';
    const consentInfo = ui.networkSocialConsentInfo || '';

    return (
        <>
            {busy ? <BusyBanner label={busyBannerLabel} /> : null}
            <div className={`arborito-onb-form${busy ? ' arborito-onb-busy' : ''}`}>
                <div className="arborito-onb-field">
                    <label htmlFor="onb-register-username">{userLbl}</label>
                    <input
                        id="onb-register-username"
                        type="text"
                        autoComplete="username"
                        spellCheck={false}
                        value={username}
                        placeholder={userPh}
                        className="arborito-onb-input"
                        disabled={busy}
                        onChange={(e) => onUsernameChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                onSubmit();
                            }
                        }}
                    />
                    <p className="arborito-onb-field-hint">{userHint}</p>
                </div>
                <UsernameSuggestions
                    ui={ui}
                    suggestions={suggestions}
                    busy={busy}
                    onPick={onPickSuggestion}
                />
                {error ? (
                    <p className="arborito-onb-error" role="alert">
                        {error}
                    </p>
                ) : null}
                <button
                    type="button"
                    className="arborito-onb-cta arborito-onb-cta--accent"
                    disabled={busy}
                    aria-busy={busy ? 'true' : undefined}
                    onClick={onSubmit}
                >
                    {submitLbl}
                </button>
                {consentInfo ? <p className="arborito-onb-fineprint">{consentInfo}</p> : null}
            </div>
        </>
    );
}

export function OnboardingSignInRegistered({
    registerResult,
    guardActive,
    onCopy,
    onDownload,
    onFinish,
}) {
    const { ui } = useIdentityAuth();
    const r = registerResult || { username: '', plainSecret: '', qrDataUrl: '' };
    const title = ui.onboardingRegisteredTitle || 'Account created!';
    const subtitle =
        ui.onboardingRegisteredSubtitle ||
        "Save this code somewhere safe. You'll need it to sign in on other devices. If you lose it, you lose access to the online account.";
    const userLbl = ui.onboardingRegisteredUsernameLabel || 'Username';
    const codeLbl = ui.onboardingRegisteredCodeLabel || 'Your secret code';
    const copyLbl = ui.onboardingRegisteredCopy || 'Copy';
    const downloadLbl = ui.onboardingRegisteredDownload || 'Download .txt file';
    const finishLbl = ui.onboardingContinue || 'Continue';
    const finishWaitLbl = ui.onboardingPleaseWait || 'Please wait a moment…';
    const qrHint =
        ui.onboardingRegisteredQrHint || 'Scan from another device to sign in.';

    return (
        <div className="arborito-onb-form arborito-onb-form--registered">
            <p className="arborito-onb-registered-title">{title}</p>
            <p className="arborito-onb-registered-sub">{subtitle}</p>
            <div className="arborito-onb-cred">
                <p className="arborito-onb-cred__label">{userLbl}</p>
                <p className="arborito-onb-cred__value">{r.username}</p>
            </div>
            <div className="arborito-onb-cred">
                <p className="arborito-onb-cred__label">{codeLbl}</p>
                <p className="arborito-onb-cred__value arborito-onb-cred__value--mono">{r.plainSecret}</p>
            </div>
            <div className="arborito-onb-cred-actions">
                <button type="button" className="arborito-onb-chip" onClick={onCopy}>
                    <span aria-hidden="true">📋</span>
                    <span>{copyLbl}</span>
                </button>
                <button type="button" className="arborito-onb-chip" onClick={onDownload}>
                    <span aria-hidden="true">💾</span>
                    <span>{downloadLbl}</span>
                </button>
            </div>
            {r.qrDataUrl ? (
                <div className="arborito-onb-qr">
                    <img src={r.qrDataUrl} alt="QR" className="arborito-onb-qr__img" />
                    <p className="arborito-onb-qr__hint">{qrHint}</p>
                </div>
            ) : null}
            <button
                type="button"
                className="arborito-onb-cta"
                disabled={guardActive}
                aria-disabled={guardActive ? 'true' : undefined}
                onClick={onFinish}
            >
                {guardActive ? finishWaitLbl : finishLbl}
            </button>
        </div>
    );
}
