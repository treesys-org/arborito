import { useIdentityAuth } from '../hooks/useIdentityAuth.js';
import { ArboritoLogoMark } from '../../shell-chrome/components/sidebar/SidebarMobileMoreMenu.jsx';
import { shouldShowWebDownloadUi } from '../../../shared/ui/download-app-panel.js';
import { pickHostUi } from '../../learning/api/electron-bridge.js';
import { GITHUB_REPO } from '../../../shared/lib/release-downloads.js';
import { OnboardingLanguage } from './OnboardingLanguage.jsx';

export function OnboardingWelcome({
    lang,
    stepAdvancing,
    onPickLanguage,
    onAcceptAndContinue,
    onOpenPrivacy,
    onOpenAccessibility,
    onOpenDownload,
    onLocalOnlyIntent,
}) {
    const { ui } = useIdentityAuth();
    const welcome = String(ui.onboardingWelcome || 'Welcome to Arborito').trim() || 'Welcome to Arborito';
    const tagline = ui.onboardingTagline || 'Learn for free';
    const body =
        ui.onboardingBody ||
        'Learn with knowledge maps (trees). Pick a language and accept the privacy policy to start.';
    const alphaLbl = String(ui.onboardingBetaWarningHead || 'Alpha 0.1').trim();
    const githubLbl = String(
        ui.onboardingGithubCollab || ui.aboutCommunityGithub || 'Contribute on GitHub'
    ).trim();
    const privacyHeading = String(ui.onboardingPrivacyHeading || 'Privacy').trim();
    const privacyText = pickHostUi(
        ui,
        'onboardingPrivacyText',
        'onboardingPrivacyTextApp',
        'Your progress is saved in this browser. A free account backs it up and syncs it (encrypted).'
    );
    const networkNote = String(
        ui.onboardingNetworkAcceptNote ||
            'By continuing you accept the privacy policy and enable the public network. You can change this later in Privacy & data.'
    ).trim();
    const privacyReadLbl = String(
        ui.onboardingPrivacyReadButton || ui.privacyTitle || 'Read privacy policy'
    ).trim();
    const continueLbl = String(
        ui.onboardingAcceptAndContinue || ui.onboardingStart || 'Accept and continue'
    ).trim();
    const a11yLbl = String(ui.onboardingAccessibilityButton || ui.a11yPrefsTitle || 'Accessibility').trim();
    const appLinkLbl = String(ui.onboardingOptionalAppLink || ui.downloadAppOptionalLink || '').trim();
    const localOnlyLbl = String(ui.onboardingLocalOnlyLink || 'Continue offline (local only)').trim();
    const loadingLbl = String(ui.onboardingAdvancing || ui.loading || 'Loading…').trim();
    const showDownload = shouldShowWebDownloadUi();

    return (
        <>
            <div className="arborito-onboarding-hero">
                <div className="arborito-onboarding-mascot" aria-hidden="true">
                    <ArboritoLogoMark size={44} className="arborito-onboarding-logo" />
                </div>
                <h1 className="arborito-onboarding-welcome">{welcome}</h1>
                <p className="arborito-onboarding-tagline">{tagline}</p>
                <p className="arborito-onboarding-body">{body}</p>
                {alphaLbl ? (
                    <p className="arborito-onboarding-alpha">
                        <span className="arborito-onboarding-alpha__label">{alphaLbl}</span>
                        {githubLbl ? (
                            <a
                                className="arborito-onboarding-alpha__link"
                                href={GITHUB_REPO}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {githubLbl}
                            </a>
                        ) : null}
                    </p>
                ) : null}
            </div>

            <OnboardingLanguage lang={lang} onPick={onPickLanguage} />

            {privacyHeading && privacyText ? (
                <div className="arborito-onboarding-privacy">
                    <p className="arborito-onboarding-privacy__head">{privacyHeading}</p>
                    <p className="arborito-onboarding-privacy__text">{privacyText}</p>
                    {networkNote ? (
                        <p className="arborito-onboarding-privacy__network m-0 mt-2 text-[11px] leading-snug text-slate-600 dark:text-slate-400">
                            {networkNote}
                        </p>
                    ) : null}
                    <div className="arborito-onboarding-privacy__links">
                        <button
                            type="button"
                            className="arborito-onboarding-privacy__link"
                            aria-label={privacyReadLbl}
                            onClick={onOpenPrivacy}
                        >
                            {privacyReadLbl} ›
                        </button>
                        <button
                            type="button"
                            className="arborito-onboarding-privacy__link"
                            aria-label={a11yLbl}
                            onClick={onOpenAccessibility}
                        >
                            {a11yLbl} ›
                        </button>
                        {showDownload ? (
                            <button
                                type="button"
                                className="arborito-onboarding-privacy__link js-open-download-app"
                                onClick={onOpenDownload}
                            >
                                {appLinkLbl || ui.downloadAppOptionalLink || 'Desktop app (optional) ›'}
                            </button>
                        ) : null}
                    </div>
                </div>
            ) : null}

            <div className="arborito-onboarding-actions">
                <button
                    type="button"
                    className={`btn-onb-start text-sm text-white${stepAdvancing ? ' btn-onb-start--busy' : ''}`}
                    disabled={stepAdvancing}
                    aria-busy={stepAdvancing ? 'true' : undefined}
                    onClick={onAcceptAndContinue}
                >
                    {stepAdvancing ? loadingLbl : continueLbl}
                </button>
                {onLocalOnlyIntent ? (
                    <button
                        type="button"
                        className="arborito-onboarding-local-only"
                        disabled={stepAdvancing}
                        onClick={() => void onLocalOnlyIntent()}
                    >
                        {localOnlyLbl}
                    </button>
                ) : null}
            </div>
        </>
    );
}
