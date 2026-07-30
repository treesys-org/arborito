import { useIdentityAuth } from '../hooks/useIdentityAuth.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { notifyOnboardingShellPainted } from '../../../boot-loader.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { DockModalShell, ModalCenteredShell } from '../../../app/components/ModalShell.jsx';
import { ModalBackChevronIcon } from '../../../app/components/ModalHero.jsx';
import {
    hasGdprNetworkConsent,
    grantGdprNetworkConsent,
} from '../../../shared/lib/connected-services/index.js';
import { humanizeAuthError } from '../api/sync-login-error-humanize.js';
import { runAfterPaint, scheduleIdle } from '../../../shared/lib/yield-to-paint.js';
import { OnboardingWelcome } from './OnboardingWelcome.jsx';
import { pickOnboardingLanguage } from '../hooks/useIdentityAuth.js';
import { OnboardingSignInLogin, OnboardingStep2Hero } from './OnboardingSignIn.jsx';
import { completeOnboardingWizard } from '../api/onboarding-complete.js';
import { prewarmForestNetworkIndices } from '../api/prewarm-forest-network.js';
import { ensureModalChunk } from '../../../app/modal-chunk-loaders.js';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { isOnboardingWizardIncomplete } from '../../../shared/lib/onboarding-boot-gate.js';
import { persistUserNostrRelays, SUGGESTED_NOSTR_RELAYS } from '../../nostr/api/nostr-relays-runtime.js';

const TOTAL_STEPS = 2;

/** True when the modal payload explicitly encodes wizard step (return from sub-modal / cold start). */
function modalHasExplicitOnboardingStep(modal) {
    if (!modal || typeof modal !== 'object') return false;
    const n = Number(modal.step);
    return n === 1 || n === 2;
}

function readInitialOnboardingState(modal) {
    let step = 1;
    try {
        const m = modal;
        if (m && typeof m === 'object' && Number(m.step) === 2) {
            step = 2;
        } else if (m && typeof m === 'object' && Number(m.step) === 1) {
            step = 1;
        }
    } catch {
        /* ignore */
    }
    return { step };
}

function OnboardingNavbar({ ui, step, theme, canGoBack, onBack, onToggleTheme }) {
    const backLbl = ui.onboardingBack || 'Volver';
    const stepLbl = String(ui.onboardingStepLabel || 'Paso {n} de {total}')
        .replace('{n}', String(step))
        .replace('{total}', String(TOTAL_STEPS));
    const themeGlyph = theme === 'light' ? '🌙' : '☀️';
    const themeLbl = ui.themeToggle || 'Cambiar tema';

    return (
        <div className="arborito-modal-nav" role="navigation">
            {canGoBack ? (
                <button
                    type="button"
                    className="arborito-modal-nav__btn arborito-modal-nav__btn--back"
                    aria-label={backLbl}
                    title={backLbl}
                    onClick={onBack}
                >
                    <ModalBackChevronIcon className="w-5 h-5" />
                </button>
            ) : (
                <span className="arborito-modal-nav__btn arborito-modal-nav__btn--ghost" aria-hidden="true" />
            )}
            <div className="arborito-modal-nav__center" role="status" aria-live="polite">
                <div className="arborito-onb-steps__dots">
                    {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
                        const n = i + 1;
                        const cls =
                            n < step
                                ? 'arborito-onb-dot arborito-onb-dot--done'
                                : n === step
                                  ? 'arborito-onb-dot arborito-onb-dot--active'
                                  : 'arborito-onb-dot';
                        return <span key={n} className={cls} aria-hidden="true" />;
                    })}
                </div>
                <p className="arborito-onb-steps__label">{stepLbl}</p>
            </div>
            <button
                type="button"
                className="arborito-modal-nav__btn arborito-modal-nav__btn--theme"
                aria-label={themeLbl}
                title={themeLbl}
                onClick={onToggleTheme}
            >
                <span className="arborito-modal-nav__theme-ic" aria-hidden="true">
                    <ChromeEmoji emoji={themeGlyph} size={18} />
                </span>
            </button>
        </div>
    );
}

export function ModalOnboarding() {
    const auth = useIdentityAuth();
    const {
        ui,
        setModal,
        lang,
        theme,
        toggleTheme,
        modal,
        identityActions,
        isSignedIn,
        warmNostrRelays,
    } = auth;

    const { loadLanguage, signInWithSyncSecret } = identityActions;

    const initial = useRef(readInitialOnboardingState(auth.modal));
    const [step, setStep] = useState(initial.current.step);
    const [sessionUsername, setSessionUsername] = useState('');
    const [sessionSecret, setSessionSecret] = useState('');
    const [busy, setBusy] = useState(false);
    const [stepAdvancing, setStepAdvancing] = useState(false);
    const [error, setError] = useState('');
    const [loginInfo, setLoginInfo] = useState('');
    const [loginMethod, setLoginMethod] = useState('password');
    const completedRef = useRef(false);
    const shellPaintedRef = useRef(false);

    const mobile = shouldShowMobileUI();
    const canGoBack = step !== 1 && !busy;

    useEffect(() => {
        if (!modal || modal.type !== 'onboarding') return;
        if (!isOnboardingWizardIncomplete()) {
            setModal({
                type: 'sources',
                instantOpen: true,
                fromOnboarding: { step: 2 },
            });
            return;
        }
        /*
         * Only apply step when the modal payload *explicitly* carries it
         * (return from privacy / recovery / QR, or cold-start step 2). A bare
         * `{ type: 'onboarding' }` must not reset local step.
         *
         * While sign-in is in flight, skip navigation sync.
         */
        const explicit = modalHasExplicitOnboardingStep(modal);
        const next = readInitialOnboardingState(modal);
        if (explicit && !busy) {
            setStep(next.step);
            if (next.step < 2) {
                completedRef.current = false;
                setStepAdvancing(false);
            }
        }
    }, [modal, setModal, busy]);

    useEffect(() => {
        if (step !== 2) return;
        try {
            void warmNostrRelays?.({ timeoutMs: 8_000, perRelayMs: 3_000, probe: true });
        } catch {
            /* ignore */
        }
    }, [step, warmNostrRelays]);

    useEffect(() => {
        if (step === 1) void ensureModalChunk('sources');
    }, [step]);

    const complete = useCallback(() => {
        if (completedRef.current) return;
        completedRef.current = true;
        completeOnboardingWizard(
            { setModal },
            {
                guest: !(typeof isSignedIn === 'function' ? isSignedIn() : false),
                returnStep: 2,
            }
        );
    }, [setModal, isSignedIn]);

    useEffect(() => {
        if (step !== 2) return;
        if (!(typeof isSignedIn === 'function' ? isSignedIn() : false)) return;
        if (completedRef.current) return;
        complete();
    }, [step, isSignedIn, complete]);

    const goToStep = useCallback(
        (n) => {
            if (busy) return;
            const next = Math.max(1, Math.min(2, Number(n) || 1));
            setStep(next);
            setError('');
            setStepAdvancing(false);
            /* Keep modal.step in sync so remounts / authSession effects cannot invent step 1. */
            setModal({ type: 'onboarding', step: next });
        },
        [busy, setModal]
    );

    const navBack = useCallback(() => {
        if (busy) return;
        if (step === 2) goToStep(1);
    }, [busy, step, goToStep]);

    const openSubModalAndReturn = useCallback((payload) => {
        if (busy) return;
        setModal(payload);
    }, [busy, setModal]);

    const acceptAndAdvance = useCallback(() => {
        if (stepAdvancing || busy) return;
        setStepAdvancing(true);
        persistUserNostrRelays(SUGGESTED_NOSTR_RELAYS);
        if (!hasGdprNetworkConsent()) grantGdprNetworkConsent();
        /* Warm relays + directory indices ASAP — never await (login must stay free). */
        prewarmForestNetworkIndices();
        void loadLanguage(lang);
        completedRef.current = true;
        runAfterPaint(() => {
            completeOnboardingWizard({ setModal }, { guest: true, returnStep: 1 });
        });
    }, [stepAdvancing, busy, loadLanguage, lang, setModal]);

    useEffect(() => {
        if (step === 1 && !shellPaintedRef.current) {
            shellPaintedRef.current = true;
            notifyOnboardingShellPainted();
            /* Pack is usually already in flight from ShellStore; apply as soon as idle
             * (short timeout) so onboarding copy is not stuck on stubs for ~500ms+. */
            scheduleIdle(() => void loadLanguage(lang), 120);
        }
    }, [step]);

    const doLogin = async () => {
        if (busy) return;
        const u = String(sessionUsername || '').trim();
        const s = String(sessionSecret || '').trim();
        if (!u || !s) {
            setError(ui.syncLoginNeedUserSecret || 'Enter username and password.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            await signInWithSyncSecret(u, s);
            complete();
        } catch (e) {
            const friendly = humanizeAuthError(e, ui);
            if (friendly) setError(friendly);
            setBusy(false);
        }
    };

    const onboardingInner = (
        <>
            <OnboardingNavbar
                ui={ui}
                step={step}
                theme={theme}
                canGoBack={canGoBack}
                onBack={navBack}
                onToggleTheme={() => toggleTheme()}
            />
            <div
                className={`arborito-onboarding-inner flex flex-col${step === 1 ? ' arborito-onboarding-inner--step1' : ' arborito-onboarding-inner--step2'}`}
            >
                {step === 1 ? (
                    <OnboardingWelcome
                        lang={lang}
                        stepAdvancing={stepAdvancing}
                        onPickLanguage={(code) => void pickOnboardingLanguage(code)}
                        onAcceptAndContinue={acceptAndAdvance}
                        onAccountIntent={() => {
                            if (stepAdvancing || busy) return;
                            persistUserNostrRelays(SUGGESTED_NOSTR_RELAYS);
                            if (!hasGdprNetworkConsent()) grantGdprNetworkConsent();
                            /* Prewarm while user fills login — do not await. */
                            prewarmForestNetworkIndices();
                            setError('');
                            setStep(2);
                            setModal({ type: 'onboarding', step: 2 });
                        }}
                        onOpenPrivacy={() =>
                            openSubModalAndReturn({
                                type: 'privacy',
                                readonly: true,
                                fromOnboarding: { step: 1 },
                            })
                        }
                        onOpenAccessibility={() =>
                            openSubModalAndReturn({
                                type: 'accessibility-prefs',
                                fromOnboarding: { step: 1 },
                            })
                        }
                        onOpenDownload={() =>
                            openSubModalAndReturn({
                                type: 'download-app',
                                fromOnboarding: { step: 1 },
                            })
                        }
                    />
                ) : (
                    <>
                        <OnboardingStep2Hero />
                        <div className="arborito-onb-session-panel">
                            <OnboardingSignInLogin
                                username={sessionUsername}
                                secret={sessionSecret}
                                busy={busy}
                                error={error}
                                info={loginInfo}
                                loginMethod={loginMethod}
                                onLoginMethodChange={(method) => {
                                    setLoginMethod(method);
                                    if (error) setError('');
                                }}
                                onUsernameChange={(v) => {
                                    setSessionUsername(v);
                                    if (error) setError('');
                                    if (loginInfo) setLoginInfo('');
                                }}
                                onSecretChange={(v) => {
                                    setSessionSecret(v);
                                    if (error) setError('');
                                }}
                                onSubmit={() => void doLogin()}
                                onOpenQr={() =>
                                    setModal({
                                        type: 'sync-login-qr-scanner',
                                        fromOnboarding: { step: 2 },
                                    })
                                }
                                onOpenRecover={() =>
                                    setModal({
                                        type: 'account-recovery',
                                        mode: 'recover',
                                        prefillUsername: String(sessionUsername || '').trim(),
                                        fromOnboarding: { step: 2 },
                                    })
                                }
                            />
                        </div>
                    </>
                )}
            </div>
        </>
    );

    const shellOpts = {
        rootFlags: 'arborito-modal--onboarding',
        scrim: 'translucent',
        instantOpen: step === 1,
        enter: step === 1 ? 'instant' : undefined,
    };
    const panelClass = 'arborito-onboarding-shell arborito-surface-panel';

    if (mobile) {
        return (
            <div data-arborito-panel="modal-onboarding">
                <DockModalShell
                    mobile
                    skipBodyWrap
                    shellOpts={{ ...shellOpts, panelClass }}
                >
                    {onboardingInner}
                </DockModalShell>
            </div>
        );
    }

    return (
        <div data-arborito-panel="modal-onboarding">
            <ModalCenteredShell
                mobile={false}
                layout="centered"
                /* Width/height come from `.arborito-onboarding-shell` (stable across steps).
                 * COMPACT+auto-h fought that and collapsed the card between steps. */
                panelClass={panelClass}
                shellOpts={shellOpts}
            >
                {onboardingInner}
            </ModalCenteredShell>
        </div>
    );
}
