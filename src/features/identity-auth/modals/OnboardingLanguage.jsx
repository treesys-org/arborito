import { useIdentityAuth } from '../hooks/useIdentityAuth.js';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';

/** Inline language picker on onboarding step 1 (`uiOnly` — no tree content language yet). */
export function OnboardingLanguage({ lang, onPick }) {
    const { ui, availableLanguages } = useIdentityAuth();
    const langLbl = ui.onboardingLanguage || ui.languageTitle || 'Idioma';
    const langs = Array.isArray(availableLanguages) ? availableLanguages : [];

    return (
        <div className="arborito-onboarding-lang">
            <p className="arborito-onboarding-lang-label">{langLbl}</p>
            <div className="arborito-onboarding-lang-grid arborito-no-emojify">
                {langs.map((l) => {
                    const active = lang === l.code;
                    return (
                        <button
                            key={l.code}
                            type="button"
                            className={`btn-onb-lang${active ? ' arborito-onboarding-lang--active' : ''}`}
                            aria-pressed={active ? 'true' : 'false'}
                            aria-label={l.name || l.nativeName || l.code}
                            onClick={() => onPick(l.code)}
                        >
                            <span className="text-xl leading-none shrink-0 arborito-emoji-native" aria-hidden="true">
                                <ChromeEmoji emoji={l.flag || '🌍'} size={20} />
                            </span>
                            <span className="text-xs font-black truncate">
                                {l.nativeName || l.name || l.code}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
