import { useIdentityAuth } from '../hooks/useIdentityAuth.js';

const CHEV = <span className="arborito-onb-choice__chev" aria-hidden="true">›</span>;

export function OnboardingChoose({ onChooseLogin, onChooseRegister, onChooseSkip }) {
    const { ui } = useIdentityAuth();
    const signInLbl = ui.onboardingSessionSignIn || 'Sign in';
    const signInSub = ui.onboardingSessionSignInSub || 'I already have an account on another device';
    const registerLbl = ui.onboardingSessionRegister || 'Create account';
    const registerSub = ui.onboardingSessionRegisterSub || 'Sync your trees across devices';
    const skipLbl = ui.onboardingSessionSkip || 'Continue without an account';
    const skipSub = ui.onboardingSessionSkipSub || 'This device only';

    return (
        <div className="arborito-onb-choice-list">
            <button
                type="button"
                className="arborito-onb-choice arborito-onb-choice--primary"
                onClick={onChooseLogin}
            >
                <span className="arborito-onb-choice__ic-wrap arborito-onb-choice__ic-wrap--primary" aria-hidden="true">
                    <span className="arborito-onb-choice__ic">🔑</span>
                </span>
                <span className="arborito-onb-choice__txt">
                    <span className="arborito-onb-choice__title">{signInLbl}</span>
                    <span className="arborito-onb-choice__sub">{signInSub}</span>
                </span>
                {CHEV}
            </button>
            <button
                type="button"
                className="arborito-onb-choice arborito-onb-choice--accent"
                onClick={onChooseRegister}
            >
                <span className="arborito-onb-choice__ic-wrap arborito-onb-choice__ic-wrap--accent" aria-hidden="true">
                    <span className="arborito-onb-choice__ic">🆕</span>
                </span>
                <span className="arborito-onb-choice__txt">
                    <span className="arborito-onb-choice__title">{registerLbl}</span>
                    <span className="arborito-onb-choice__sub">{registerSub}</span>
                </span>
                {CHEV}
            </button>
            <button
                type="button"
                className="arborito-onb-choice arborito-onb-choice--ghost"
                onClick={onChooseSkip}
            >
                <span className="arborito-onb-choice__ic-wrap arborito-onb-choice__ic-wrap--ghost" aria-hidden="true">
                    <span className="arborito-onb-choice__ic arborito-onb-choice__ic--globe-off">🌐</span>
                </span>
                <span className="arborito-onb-choice__txt">
                    <span className="arborito-onb-choice__title">{skipLbl}</span>
                    <span className="arborito-onb-choice__sub">{skipSub}</span>
                </span>
                {CHEV}
            </button>
        </div>
    );
}

export function OnboardingStep2Hero() {
    const { ui } = useIdentityAuth();
    const title = ui.onboardingSessionTitle || 'Your account';
    const subtitle =
        ui.onboardingSessionSubtitle ||
        'Sign in to bring your trees, create a new account, or continue without one. You can always change this later from Profile.';

    return (
        <div className="arborito-onboarding-hero arborito-onboarding-hero--step2">
            <h2 className="arborito-onb-step-title">{title}</h2>
            <p className="arborito-onb-step-subtitle">{subtitle}</p>
        </div>
    );
}
