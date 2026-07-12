import { useIdentityAuth } from '../hooks/useIdentityAuth.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { notifyOnboardingShellPainted } from '../../../boot-loader.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { DockModalShell, ModalCenteredShell } from '../../../app/components/ModalShell.jsx';
import {
    hasGdprNetworkConsent,
    grantGdprNetworkConsent,
} from '../../../shared/lib/connected-services/index.js';
import { normalizeUsername } from '../api/sync-login-secret.js';
import { humanizeAuthError } from '../api/sync-login-error-humanize.js';
import {
    scheduleUsernameAvailabilityCheck,
    fetchUsernameAvailability,
} from '../api/sync-login-username-availability.js';
import { suggestUsernamesFor } from '../api/sync-login-username-suggest.js';
import { runAfterPaint, scheduleIdle } from '../../../shared/lib/yield-to-paint.js';
import { OnboardingWelcome } from './OnboardingWelcome.jsx';
import { pickOnboardingLanguage } from '../hooks/useIdentityAuth.js';
import { OnboardingAccountEntry, OnboardingStep2Hero } from './OnboardingChoose.jsx';
import { OnboardingSignInLogin, OnboardingSignInRegistered } from './OnboardingSignIn.jsx';
import { completeOnboardingWizard } from '../api/onboarding-complete.js';
import { ensureModalChunk } from '../../../app/modal-chunk-loaders.js';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { persistUserNostrRelays, SUGGESTED_NOSTR_RELAYS } from '../../nostr/api/nostr-relays-runtime.js';
import { withdrawGdprNetworkConsent } from '../../../shared/lib/connected-services/index.js';
import { showDialogAction } from '../../../stores/shell-ui-store-actions.js';

const TOTAL_STEPS = 3;

function readInitialOnboardingState(modal) {
    let step = 1;
    let sessionView = 'start';
    try {
        const m = modal;
        if (m && typeof m === 'object' && Number(m.step) === 2) {
            step = 2;
            const v = m.view;
            if (v === 'login' || v === 'registered') {
                sessionView = v;
            } else if (v === 'register' || v === 'choose') {
                sessionView = 'start';
            }
        }
    } catch {
        /* ignore */
    }
    return { step, sessionView };
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
                    <span aria-hidden="true">‹</span>
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
        dismissModal,
        setModal,
        notify,
        lang,
        theme,
        toggleTheme,
        confirm,
        acknowledge,
        gamification,
        modal,
        identityActions,
        isSignedIn,
    } = auth;

    const {
        loadLanguage,
        signInWithSyncSecret,
        registerSyncLoginAccount,
        updateUserProfile,
        grantNetworkSocialConsent,
        downloadRecoveryKitFile,
    } = identityActions;

    const initial = useRef(readInitialOnboardingState(auth.modal));
    const [step, setStep] = useState(initial.current.step);
    const [sessionView, setSessionView] = useState(initial.current.sessionView);
    const [sessionUsername, setSessionUsername] = useState('');
    const [sessionSecret, setSessionSecret] = useState('');
    const [registerPassword, setRegisterPassword] = useState('');
    const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState('');
    const [registerResult, setRegisterResult] = useState(null);
    const [secretSaved, setSecretSaved] = useState(false);
    const [busy, setBusy] = useState(false);
    const [checkingUsername, setCheckingUsername] = useState(false);
    const [stepAdvancing, setStepAdvancing] = useState(false);
    const [error, setError] = useState('');
    const [loginInfo, setLoginInfo] = useState('');
    const [loginMethod, setLoginMethod] = useState('password');
    const [usernameSuggestions, setUsernameSuggestions] = useState([]);
    const completedRef = useRef(false);
    const confirmingFinishRef = useRef(false);
    const finishTapGuardUntilRef = useRef(0);
    const [, bumpGuard] = useState(0);
    const suggestHostRef = useRef({ _suggestTimer: null });
    const shellPaintedRef = useRef(false);

    const mobile = shouldShowMobileUI();
    const sessionBusy = busy || checkingUsername;
    const canGoBack = step !== 1 && sessionView !== 'registered' && !sessionBusy;
    const guardActive = Date.now() < (finishTapGuardUntilRef.current || 0);

    useEffect(() => {
        if (!modal || modal.type !== 'onboarding') return;
        const next = readInitialOnboardingState(modal);
        setStep(next.step);
        setSessionView(next.sessionView);
        if (next.step < 2) {
            completedRef.current = false;
            setStepAdvancing(false);
        }
    }, [modal]);

    useEffect(() => {
        const onRecoverySetup = () => setSecretSaved(true);
        window.addEventListener('arborito-onboarding-recovery-setup', onRecoverySetup);
        return () => window.removeEventListener('arborito-onboarding-recovery-setup', onRecoverySetup);
    }, []);

    useEffect(() => {
        if (step === 2) void ensureModalChunk('sources');
    }, [step]);

    const complete = useCallback(() => {
        if (completedRef.current) return;
        completedRef.current = true;
        completeOnboardingWizard(
            { setModal },
            { guest: !(typeof isSignedIn === 'function' ? isSignedIn() : false) }
        );
    }, [setModal, isSignedIn]);

    useEffect(() => {
        if (step !== 2) return;
        /* Registered screen must stay visible (sync key / recovery setup). */
        if (sessionView === 'registered' || sessionView === 'start') return;
        if (!(typeof isSignedIn === 'function' ? isSignedIn() : false)) return;
        if (completedRef.current) return;
        complete();
    }, [step, sessionView, isSignedIn, complete]);

    const goToStep = useCallback(
        (n) => {
            if (busy) return;
            const next = Math.max(1, Math.min(2, Number(n) || 1));
            setStep(next);
            setError('');
            setStepAdvancing(false);
        },
        [busy]
    );

    const setSessionViewSafe = useCallback(
        (view) => {
            if (sessionBusy) return;
            setSessionView(view);
            setError('');
            setLoginInfo('');
        },
        [sessionBusy]
    );

    const navBack = useCallback(() => {
        if (sessionBusy) return;
        if (step === 2 && sessionView !== 'start') {
            setSessionViewSafe('start');
            return;
        }
        if (step === 2) goToStep(1);
    }, [sessionBusy, step, sessionView, setSessionViewSafe, goToStep]);

    const openSubModalAndReturn = useCallback((payload) => {
        if (busy) return;
        setModal(payload);
    }, [busy, setModal]);

    const acceptAndAdvance = useCallback(() => {
        if (stepAdvancing || busy) return;
        setStepAdvancing(true);
        persistUserNostrRelays(SUGGESTED_NOSTR_RELAYS);
        if (!hasGdprNetworkConsent()) grantGdprNetworkConsent();
        void loadLanguage(lang);
        runAfterPaint(() => goToStep(2));
    }, [stepAdvancing, busy, goToStep, loadLanguage, lang]);

    const localOnlyAndComplete = useCallback(async () => {
        if (stepAdvancing || busy) return false;
        const word = String(ui.onboardingLocalOnlyPromptWord || 'localonly')
            .normalize('NFKC')
            .replace(/\s+/g, '')
            .toLowerCase();
        const typed = await showDialogAction({
            type: 'prompt',
            title: ui.onboardingLocalOnlyConfirmTitle || 'Local-only mode?',
            body:
                ui.onboardingLocalOnlyPromptBody ||
                ui.onboardingLocalOnlyConfirmBody ||
                'Arborito will be very limited. Type the keyword to continue offline.',
            placeholder: ui.onboardingLocalOnlyPromptPlaceholder || word,
            danger: true,
            confirmText: ui.onboardingLocalOnlyConfirmButton || 'Yes, local only',
            cancelText: ui.cancel || 'Cancel',
        });
        if (typed == null) return false;
        if (
            String(typed || '')
                .normalize('NFKC')
                .replace(/\s+/g, '')
                .toLowerCase() !== word
        ) {
            notify(ui.onboardingLocalOnlyPromptMismatch || ui.privacyWipeLocalPromptMismatch || 'Confirmation did not match.', true);
            return false;
        }
        withdrawGdprNetworkConsent();
        persistUserNostrRelays([]);
        setStepAdvancing(true);
        void loadLanguage(lang);
        completedRef.current = true;
        completeOnboardingWizard({ setModal }, { guest: true, localOnly: true });
        return true;
    }, [stepAdvancing, busy, ui, notify, loadLanguage, lang, setModal]);

    const scheduleUsernameCheck = useCallback(() => {
        scheduleUsernameAvailabilityCheck(suggestHostRef.current, {
            getRaw: () => sessionUsername,
            onRun: async (raw) => {
                if (!raw) {
                    setUsernameSuggestions([]);
                    return;
                }
                const result = await fetchUsernameAvailability(raw);
                if (!result) return;
                if (String(sessionUsername || '').trim() !== result.target) return;
                setUsernameSuggestions(result.taken ? result.suggestions : []);
            },
        });
    }, [sessionUsername]);

    useEffect(() => {
        if (sessionView === 'start') scheduleUsernameCheck();
    }, [sessionUsername, sessionView, scheduleUsernameCheck]);

    const skipWithConfirm = useCallback(async () => {
        if (sessionBusy || stepAdvancing) return;
        const ok = await acknowledge({
            title: ui.onboardingSkipConfirmTitle || ui.onboardingSessionSkip || 'Continue without an account?',
            body:
                ui.onboardingSkipConfirmBody ||
                ui.onboardingSessionSkipSub ||
                'This browser only, back up in Profile so clearing site data does not erase your progress. You can create a free account later from Profile.',
            dialogIcon: '❓',
            dialogSpotlight: {
                emoji: '💻',
                label: ui.onboardingSkipConfirmSpotlight || 'This browser only',
            },
        });
        if (!ok) return;
        complete();
    }, [sessionBusy, stepAdvancing, acknowledge, ui, complete]);

    useEffect(() => {
        if (step === 1 && !shellPaintedRef.current) {
            shellPaintedRef.current = true;
            notifyOnboardingShellPainted();
            scheduleIdle(() => void loadLanguage(lang), 500);
        }
    }, [step]);

    useEffect(
        () => () => {
            if (suggestHostRef.current._suggestTimer) {
                clearTimeout(suggestHostRef.current._suggestTimer);
            }
        },
        []
    );

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
            setError(humanizeAuthError(e, ui));
            setBusy(false);
        }
    };

    const doRegister = async (rawUsername) => {
        if (busy || checkingUsername) return;
        const u = String(rawUsername ?? sessionUsername ?? '').trim();
        if (!u) {
            setError(ui.authUsernameRequired || 'Enter a username first.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            const g = gamification || {};
            const norm = normalizeUsername(u);
            if (norm && norm !== normalizeUsername(g.username)) {
                updateUserProfile(norm, g.avatar || '👤');
            }
            const res = await registerSyncLoginAccount(norm || u, {
                credentialKind: 'password',
                password: registerPassword,
                passwordConfirm: registerPasswordConfirm,
            });
            grantNetworkSocialConsent?.();
            setRegisterResult(res || null);
            setSecretSaved(false);
            setSessionView('registered');
            finishTapGuardUntilRef.current = Date.now() + 1600;
            setTimeout(() => bumpGuard((n) => n + 1), 1650);
        } catch (e) {
            const msg = humanizeAuthError(e, ui);
            setError(msg);
            const low = String(msg || '').toLowerCase();
            if (low.includes('ya está') || low.includes('ya esta') || low.includes('already')) {
                try {
                    setUsernameSuggestions(await suggestUsernamesFor(u));
                } catch {
                    /* ignore */
                }
            }
        } finally {
            setBusy(false);
        }
    };

    const continueFromStart = async () => {
        if (sessionBusy) return false;
        const u = String(sessionUsername || '').trim();
        if (!u) {
            setError(ui.authUsernameRequired || 'Enter a username first.');
            return false;
        }
        setCheckingUsername(true);
        setError('');
        try {
            const result = await fetchUsernameAvailability(u);
            if (result?.taken) {
                setUsernameSuggestions(result.suggestions || []);
                setError(
                    ui.syncLoginUsernameTaken ||
                        'That username is already taken. Pick another or sign in from the Sign in tab.'
                );
                return false;
            }
            return true;
        } finally {
            setCheckingUsername(false);
        }
    };

    const registerFromPasswordStep = async () => {
        const u = String(sessionUsername || '').trim();
        if (!u) {
            setError(ui.authUsernameRequired || 'Enter a username first.');
            return;
        }
        await doRegister(u);
    };

    const confirmAndCompleteFromRegistered = async () => {
        if (completedRef.current || confirmingFinishRef.current) return;
        if (Date.now() < (finishTapGuardUntilRef.current || 0)) return;
        confirmingFinishRef.current = true;
        try {
            complete();
        } finally {
            confirmingFinishRef.current = false;
        }
    };

    let step2Panel;
    if (sessionView === 'login') {
        step2Panel = (
            <>
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
                            fromOnboarding: { step: 2, view: 'login' },
                        })
                    }
                    onOpenRecover={() =>
                        setModal({
                            type: 'account-recovery',
                            mode: 'recover',
                            prefillUsername: String(sessionUsername || '').trim(),
                            fromOnboarding: { step: 2, view: 'login' },
                        })
                    }
                />
            </>
        );
    } else if (sessionView === 'registered') {
        step2Panel = (
            <OnboardingSignInRegistered
                registerResult={registerResult}
                guardActive={guardActive}
                secretSaved={secretSaved}
                onDownload={async () => {
                    const r = registerResult;
                    if (!r?.plainSecret || !r.recoveryKeyPlain) return;
                    try {
                        await downloadRecoveryKitFile(r.username, r.plainSecret, r.recoveryKeyPlain);
                        setSecretSaved(true);
                    } catch (e) {
                        setError(String(e?.message || e));
                    }
                }}
                onSetupRecovery={() => {
                    const r = registerResult;
                    if (!r) return;
                    setModal({
                        type: 'account-recovery',
                        mode: 'setup',
                        fromOnboarding: { step: 2, view: 'registered' },
                    });
                }}
                onFinish={() => void confirmAndCompleteFromRegistered()}
            />
        );
    } else {
        step2Panel = (
            <OnboardingAccountEntry
                username={sessionUsername}
                busy={busy}
                checking={checkingUsername}
                error={error}
                suggestions={usernameSuggestions}
                password={registerPassword}
                passwordConfirm={registerPasswordConfirm}
                onUsernameChange={(v) => {
                    setSessionUsername(v);
                    if (error) setError('');
                }}
                onPasswordChange={setRegisterPassword}
                onPasswordConfirmChange={setRegisterPasswordConfirm}
                onUsernameContinue={continueFromStart}
                onRegister={() => void registerFromPasswordStep()}
                onSignIn={() => setSessionViewSafe('login')}
                onSkip={() => void skipWithConfirm()}
                onPickSuggestion={(name) => {
                    setSessionUsername(name);
                    setUsernameSuggestions([]);
                    setError('');
                }}
            />
        );
    }

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
                            onLocalOnlyIntent={localOnlyAndComplete}
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
                            <div className="arborito-onb-session-panel">{step2Panel}</div>
                        </>
                    )}
                </div>
        </>
    );

    const shellOpts = {
        rootFlags: 'arborito-modal--onboarding',
        scrim: 'none',
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
                sizeTier="COMPACT"
                panelClass={panelClass}
                shellOpts={shellOpts}
            >
                {onboardingInner}
            </ModalCenteredShell>
        </div>
    );
}
