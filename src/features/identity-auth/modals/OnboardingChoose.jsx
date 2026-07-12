import { useState } from 'react';
import { useIdentityAuth } from '../hooks/useIdentityAuth.js';
import { LoadingBrandRing } from '../../../shared/ui/Loading.jsx';
import { LoginPasswordRegisterFields } from '../components/LoginPasswordRegisterFields.jsx';

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

export function OnboardingAccountEntry({
    username,
    busy,
    checking,
    error,
    suggestions,
    password,
    passwordConfirm,
    onUsernameChange,
    onPasswordChange,
    onPasswordConfirmChange,
    onUsernameContinue,
    onRegister,
    onSignIn,
    onSkip,
    onPickSuggestion,
}) {
    const { ui } = useIdentityAuth();
    const [passwordStep, setPasswordStep] = useState(false);
    const userLbl = ui.profileSignInUsernameLabel || 'Online username';
    const userPh = ui.profileSignInUsernamePlaceholder || 'your_username';
    const userHint =
        ui.onboardingRegisterUsernameHint ||
        'Elige un nombre para tu cuenta online. Puedes cambiarlo después en Perfil.';
    const nextLbl = !passwordStep
        ? checking
            ? ui.onboardingSessionChecking || 'Checking…'
            : ui.onboardingSessionContinue || ui.onboardingContinue || 'Continue'
        : busy
          ? ui.onboardingRegisterCreatingButton || ui.syncLoginCreatingShort || 'Creating account…'
          : ui.syncLoginSubmitRegister || 'Create account';
    const haveAccountLbl = ui.onboardingSessionHaveAccount || 'Already have an account?';
    const signInLbl = ui.onboardingSessionSignIn || 'Sign in';
    const skipLbl = ui.onboardingSessionSkipLater || 'Later';
    const skipHint =
        ui.onboardingSessionSkipLaterHint ||
        'No account for now, progress stays in this browser only.';
    const consentInfo = ui.networkSocialConsentInfo || '';
    const actionBusy = busy || checking;
    const passwordHint =
        ui.onboardingRegisterPasswordStepHint ||
        'Ahora elige una contraseña. La repetirás una vez para confirmarla.';

    const handlePrimary = () => {
        if (!passwordStep) {
            void onUsernameContinue?.().then((ok) => {
                if (ok) setPasswordStep(true);
            });
            return;
        }
        onRegister?.();
    };

    return (
        <div className="arborito-onb-entry">
            <div className={`arborito-onb-form${actionBusy ? ' arborito-onb-busy' : ''}`}>
                <div className="arborito-onb-field">
                    <label htmlFor="onb-entry-username">{userLbl}</label>
                    <input
                        id="onb-entry-username"
                        type="text"
                        autoComplete="username"
                        spellCheck={false}
                        value={username}
                        placeholder={userPh}
                        className="arborito-onb-input"
                        disabled={actionBusy}
                        onChange={(e) => onUsernameChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey && !passwordStep) {
                                e.preventDefault();
                                handlePrimary();
                            }
                        }}
                    />
                    <p className="arborito-onb-field-hint">{userHint}</p>
                </div>
                {!passwordStep ? (
                    <UsernameSuggestions
                        ui={ui}
                        suggestions={suggestions}
                        busy={actionBusy}
                        onPick={onPickSuggestion}
                    />
                ) : (
                    <div className="arborito-onb-password-step">
                        <p className="arborito-onb-field-hint m-0 mb-3">{passwordHint}</p>
                        <LoginPasswordRegisterFields
                            ui={ui}
                            disabled={actionBusy}
                            password={password}
                            passwordConfirm={passwordConfirm}
                            onPasswordChange={onPasswordChange}
                            onPasswordConfirmChange={onPasswordConfirmChange}
                        />
                    </div>
                )}
                {error ? (
                    <p className="arborito-onb-error" role="alert">
                        {error}
                    </p>
                ) : null}
                <button
                    type="button"
                    className="arborito-onb-cta"
                    disabled={actionBusy}
                    aria-busy={actionBusy ? 'true' : undefined}
                    onClick={handlePrimary}
                >
                    {actionBusy ? (
                        <span className="arborito-onb-cta__busy">
                            <LoadingBrandRing size="sm" />
                            <span>{nextLbl}</span>
                        </span>
                    ) : (
                        nextLbl
                    )}
                </button>
                {passwordStep && consentInfo ? (
                    <p className="arborito-onb-fineprint">{consentInfo}</p>
                ) : null}
            </div>

            <div className="arborito-onb-entry-divider" role="presentation">
                <span>{haveAccountLbl}</span>
            </div>

            <button
                type="button"
                className="arborito-onb-cta arborito-onb-cta--signin"
                disabled={actionBusy}
                onClick={onSignIn}
            >
                {signInLbl}
            </button>

            <div className="arborito-onb-entry-skip">
                <button
                    type="button"
                    className="arborito-onb-entry-skip__btn"
                    disabled={actionBusy}
                    onClick={onSkip}
                >
                    {skipLbl}
                </button>
                <p className="arborito-onb-entry-skip__hint">{skipHint}</p>
            </div>
        </div>
    );
}

export function OnboardingStep2Hero() {
    const { ui } = useIdentityAuth();
    const title = ui.onboardingSessionTitle || 'Your account';
    const subtitle =
        ui.onboardingSessionSubtitle ||
        'Primero elige un nombre. Después crearás una contraseña para entrar en otros dispositivos.';

    return (
        <div className="arborito-onboarding-hero arborito-onboarding-hero--step2">
            <h2 className="arborito-onb-step-title">{title}</h2>
            <p className="arborito-onb-step-subtitle">{subtitle}</p>
        </div>
    );
}
