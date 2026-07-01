import { useIdentityAuth } from '../hooks/useIdentityAuth.js';
import { ArboritoLogoMark } from '../../shell-chrome/components/sidebar/SidebarMobileMoreMenu.jsx';
import { shouldShowWebDownloadUi } from '../../../shared/ui/download-app-panel.js';
import { OnboardingLanguage } from './OnboardingLanguage.jsx';

export function OnboardingWelcome({
    lang,
    stepAdvancing,
    onPickLanguage,
    onAcceptAndContinue,
    onOpenPrivacy,
    onOpenAccessibility,
    onOpenDownload,
}) {
    const { ui } = useIdentityAuth();
    const welcome = String(ui.onboardingWelcome || 'Bienvenido a Arborito').trim() || 'Bienvenido a Arborito';
    const tagline = ui.onboardingTagline || 'Aprender gratis';
    const body =
        ui.onboardingBody ||
        'Una app para aprender con mapas de conocimiento (árboles). Elige un idioma y acepta la política de privacidad para empezar.';
    const betaWarnHead = String(ui.onboardingBetaWarningHead || 'Arborito está incompleto').trim();
    const betaWarn = String(
        ui.onboardingBetaWarning ||
            'Software en desarrollo. No se garantiza estabilidad ni conservación de datos.'
    ).trim();
    const privacyHeading = String(ui.onboardingPrivacyHeading || 'Privacidad').trim();
    const privacyText = String(
        ui.onboardingPrivacyText ||
            'Tu progreso se guarda en este dispositivo. Si usas funciones en línea, te conectarás a servidores externos donde tu IP será visible.'
    ).trim();
    const privacyReadLbl = String(
        ui.onboardingPrivacyReadButton || ui.privacyTitle || 'Leer política de privacidad'
    ).trim();
    const continueLbl = String(
        ui.onboardingAcceptAndContinue || ui.onboardingStart || 'Aceptar y continuar'
    ).trim();
    const a11yLbl = String(ui.onboardingAccessibilityButton || ui.a11yPrefsTitle || 'Accesibilidad').trim();
    const appLinkLbl = String(ui.onboardingOptionalAppLink || ui.downloadAppOptionalLink || '').trim();
    const loadingLbl = String(ui.onboardingAdvancing || ui.loading || 'Cargando…').trim();
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
                {betaWarnHead && betaWarn ? (
                    <div className="arborito-onboarding-warning" role="alert">
                        <p className="arborito-onboarding-warning__head">{betaWarnHead}</p>
                        <p className="arborito-onboarding-warning__detail">{betaWarn}</p>
                    </div>
                ) : betaWarn ? (
                    <p className="arborito-onboarding-warning" role="alert">
                        {betaWarn}
                    </p>
                ) : null}
            </div>

            <OnboardingLanguage lang={lang} onPick={onPickLanguage} />

            {privacyHeading && privacyText ? (
                <div className="arborito-onboarding-privacy">
                    <p className="arborito-onboarding-privacy__head">{privacyHeading}</p>
                    <p className="arborito-onboarding-privacy__text">{privacyText}</p>
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
            </div>
        </>
    );
}
