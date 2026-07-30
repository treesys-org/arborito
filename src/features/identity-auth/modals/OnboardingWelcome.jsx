import { useIdentityAuth } from '../hooks/useIdentityAuth.js';
import { ArboritoLogoMark } from '../../shell-chrome/components/sidebar/SidebarMobileMoreMenu.jsx';
import { shouldShowWebDownloadUi } from '../../../shared/ui/download-app-panel.js';
import { GITHUB_REPO } from '../../../shared/lib/release-downloads.js';
import { formatArboritoVersionLabel } from '../../../core/version.js';
import { OnboardingLanguage } from './OnboardingLanguage.jsx';
import { OnboardingMiniPreview } from './OnboardingMiniPreview.jsx';

export function OnboardingWelcome({
    lang,
    stepAdvancing,
    onPickLanguage,
    onAcceptAndContinue,
    onOpenPrivacy,
    onOpenAccessibility,
    onOpenDownload,
    onAccountIntent,
}) {
    const { ui } = useIdentityAuth();
    const welcome = String(ui.onboardingWelcome || 'Welcome to Arborito').trim() || 'Welcome to Arborito';
    const tagline = String(ui.onboardingTagline || 'Learn for free').trim();
    const networkNote = String(
        ui.onboardingNetworkAcceptNote ||
            'By continuing you accept the privacy policy and enable the public network. You can change this later in Privacy & data.'
    ).trim();
    const privacyLbl = String(
        ui.onboardingPrivacyShortLink || ui.onboardingPrivacyHeading || ui.privacyTitle || 'Privacy'
    ).trim();
    const exploreLbl = String(
        ui.onboardingJustExploreCta || ui.onboardingLaterCta || 'Choose what to study'
    ).trim();
    const accountLbl = String(
        ui.onboardingAccountEntryLink || 'Sign in'
    ).trim();
    const a11yLbl = String(ui.onboardingAccessibilityButton || ui.a11yPrefsTitle || 'Accessibility').trim();
    const appLinkLbl = String(
        ui.onboardingAppFootLink || ui.onboardingOptionalAppLink || ui.downloadAppOptionalLink || 'App'
    )
        .trim()
        .replace(/\s*›\s*$/u, '');
    const alphaLbl = formatArboritoVersionLabel(ui.onboardingBetaWarningHead || 'Alpha {version}');
    const githubTip = String(ui.onboardingGithubCollab || 'Contribute on GitHub').trim();
    const loadingLbl = String(ui.onboardingAdvancing || ui.loading || 'Loading…').trim();
    const showDownload = shouldShowWebDownloadUi();

    return (
        <>
            <div className="arborito-onboarding-hero arborito-onboarding-hero--quiet">
                <div className="arborito-onboarding-mascot" aria-hidden="true">
                    <ArboritoLogoMark size={36} className="arborito-onboarding-logo" />
                </div>
                <h1 className="arborito-onboarding-welcome">{welcome}</h1>
                {tagline ? <p className="arborito-onboarding-tagline">{tagline}</p> : null}
                <OnboardingMiniPreview ui={ui} lang={lang} />
            </div>

            <OnboardingLanguage lang={lang} onPick={onPickLanguage} />

            <div className="arborito-onboarding-actions">
                <button
                    type="button"
                    className={`btn-onb-start text-sm text-white${stepAdvancing ? ' btn-onb-start--busy' : ''}`}
                    disabled={stepAdvancing}
                    aria-busy={stepAdvancing ? 'true' : undefined}
                    onClick={onAcceptAndContinue}
                >
                    {stepAdvancing ? loadingLbl : exploreLbl}
                </button>
                {onAccountIntent ? (
                    <button
                        type="button"
                        className="btn-onb-skip text-sm"
                        disabled={stepAdvancing}
                        onClick={() => onAccountIntent()}
                    >
                        {accountLbl}
                    </button>
                ) : null}
                <div className="arborito-onboarding-foot-links" role="group">
                    {alphaLbl ? (
                        <>
                            <a
                                className="arborito-onboarding-foot-link arborito-onboarding-foot-link--version"
                                href={GITHUB_REPO}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={githubTip}
                                aria-label={githubTip}
                            >
                                {alphaLbl}
                            </a>
                            <span className="arborito-onboarding-foot-sep" aria-hidden="true">
                                ·
                            </span>
                        </>
                    ) : null}
                    <button type="button" className="arborito-onboarding-foot-link" onClick={onOpenPrivacy}>
                        {privacyLbl}
                    </button>
                    <span className="arborito-onboarding-foot-sep" aria-hidden="true">
                        ·
                    </span>
                    <button type="button" className="arborito-onboarding-foot-link" onClick={onOpenAccessibility}>
                        {a11yLbl}
                    </button>
                    {showDownload ? (
                        <>
                            <span className="arborito-onboarding-foot-sep" aria-hidden="true">
                                ·
                            </span>
                            <button
                                type="button"
                                className="arborito-onboarding-foot-link js-open-download-app"
                                onClick={onOpenDownload}
                            >
                                {appLinkLbl || 'App'}
                            </button>
                        </>
                    ) : null}
                </div>
                {networkNote ? (
                    <p className="arborito-onboarding-legal-note m-0 text-[11px] leading-snug text-slate-600 dark:text-slate-400 text-center">
                        {networkNote}
                    </p>
                ) : null}
            </div>
        </>
    );
}
