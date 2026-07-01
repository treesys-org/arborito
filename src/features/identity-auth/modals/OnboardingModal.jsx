import { useIdentityAuth } from '../hooks/useIdentityAuth.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { notifyOnboardingShellPainted } from '../../../boot-loader.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { ModalShell } from '../../../app/components/ModalShell.jsx';
import {
    hasGdprNetworkConsent,
    grantGdprNetworkConsent,
} from '../../../shared/lib/connected-services/index.js';
import { parseSyncLoginFromExportFile, normalizeUsername } from '../api/sync-login-secret.js';
import { humanizeAuthError } from '../api/sync-login-error-humanize.js';
import {
    scheduleUsernameAvailabilityCheck,
    fetchUsernameAvailability,
} from '../api/sync-login-username-availability.js';
import { suggestUsernamesFor } from '../api/sync-login-username-suggest.js';
import { runAfterPaint, scheduleIdle } from '../../../shared/lib/yield-to-paint.js';
import { OnboardingWelcome } from './OnboardingWelcome.jsx';
import { pickOnboardingLanguage } from '../hooks/useIdentityAuth.js';
import { OnboardingChoose, OnboardingStep2Hero } from './OnboardingChoose.jsx';
import {
    OnboardingSignInLogin,
    OnboardingSignInRegister,
    OnboardingSignInRegistered,
} from './OnboardingSignIn.jsx';

const ONBOARDING_SEEN_KEY = 'arborito-onboarding-seen-v1';
const TOTAL_STEPS = 3;

function readInitialOnboardingState(modal) {
    let step = 1;
    let sessionView = 'choose';
    try {
        const m = modal;
        if (m && typeof m === 'object' && Number(m.step) === 2) {
            step = 2;
            const v = m.view;
            sessionView =
                v === 'login' || v === 'register' || v === 'registered' ? v : 'choose';
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
                    {themeGlyph}
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
        gamification,
        modal,
        identityActions,
    } = auth;

    const {
        loadLanguage,
        signInWithSyncSecret,
        registerSyncLoginAccount,
        updateUserProfile,
        grantNetworkSocialConsent,
        downloadSyncSecretFile,
    } = identityActions;

    const initial = useRef(readInitialOnboardingState(auth.modal));
    const [step, setStep] = useState(initial.current.step);
    const [sessionView, setSessionView] = useState(initial.current.sessionView);
    const [sessionUsername, setSessionUsername] = useState('');
    const [sessionSecret, setSessionSecret] = useState('');
    const [registerResult, setRegisterResult] = useState(null);
    const [busy, setBusy] = useState(false);
    const [stepAdvancing, setStepAdvancing] = useState(false);
    const [error, setError] = useState('');
    const [usernameSuggestions, setUsernameSuggestions] = useState([]);
    const completedRef = useRef(false);
    const confirmingFinishRef = useRef(false);
    const finishTapGuardUntilRef = useRef(0);
    const [, bumpGuard] = useState(0);
    const suggestHostRef = useRef({ _suggestTimer: null });
    const shellPaintedRef = useRef(false);

    const mobile = shouldShowMobileUI();
    const canGoBack =
        step !== 1 && sessionView !== 'registered' && !busy;
    const guardActive = Date.now() < (finishTapGuardUntilRef.current || 0);

    const complete = useCallback(() => {
        if (completedRef.current) return;
        completedRef.current = true;
        try {
            localStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
        } catch {
            /* ignore */
        }
        setModal({
            type: 'sources',
            instantOpen: true,
            fromOnboarding: { step: 2, view: 'choose' },
        });
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('arborito-onboarding-complete'));
        }
    }, []);

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
            if (busy) return;
            setSessionView(view);
            setError('');
        },
        [busy]
    );

    const navBack = useCallback(() => {
        if (busy) return;
        if (step === 2 && sessionView !== 'choose') {
            setSessionViewSafe('choose');
            return;
        }
        if (step === 2) goToStep(1);
    }, [busy, step, sessionView, setSessionViewSafe, goToStep]);

    const openSubModalAndReturn = useCallback((payload) => {
        if (busy) return;
        setModal(payload);
    }, [busy, setModal]);

    const acceptAndAdvance = useCallback(() => {
        if (stepAdvancing || busy) return;
        setStepAdvancing(true);
        if (!hasGdprNetworkConsent()) grantGdprNetworkConsent();
        void loadLanguage(lang);
        runAfterPaint(() => goToStep(2));
    }, [stepAdvancing, busy, goToStep]);

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
        if (sessionView === 'register') scheduleUsernameCheck();
    }, [sessionUsername, sessionView, scheduleUsernameCheck]);

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
            setError(ui.syncLoginNeedUserSecret || 'Enter username and secret.');
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

    const doRegister = async () => {
        if (busy) return;
                const u = String(sessionUsername || '').trim();
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
            const res = await registerSyncLoginAccount(norm || u);
            grantNetworkSocialConsent?.();
            setRegisterResult(res || null);
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

    const doFileLogin = async (file) => {
        if (!file) return;
                try {
            const raw = await file.text();
            const parsed = parseSyncLoginFromExportFile(raw);
            if (!parsed) {
                setError(ui.syncLoginFileUnreadable || 'Invalid file.');
                return;
            }
            setBusy(true);
            setError('');
            await signInWithSyncSecret(parsed.username, parsed.secret);
            complete();
        } catch (e) {
            setError(humanizeAuthError(e, ui));
            setBusy(false);
        }
    };

    const confirmAndCompleteFromRegistered = async () => {
        if (completedRef.current || confirmingFinishRef.current) return;
        if (Date.now() < (finishTapGuardUntilRef.current || 0)) return;
        confirmingFinishRef.current = true;
        try {
                        const ok = await confirm(
                ui.onboardingRegisteredConfirmBody ||
                    'Have you already saved your secret code? Without it you won\u2019t be able to sign in on another device or recover the account.',
                ui.onboardingRegisteredConfirmTitle || 'Continue?',
                true
            );
            if (ok) complete();
        } finally {
            confirmingFinishRef.current = false;
        }
    };

    let step2Panel;
    if (sessionView === 'login') {
        step2Panel = (
            <OnboardingSignInLogin
                username={sessionUsername}
                secret={sessionSecret}
                busy={busy}
                error={error}
                onUsernameChange={(v) => {
                    setSessionUsername(v);
                    if (error) setError('');
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
                onPickFile={(f) => void doFileLogin(f)}
            />
        );
    } else if (sessionView === 'register') {
        step2Panel = (
            <OnboardingSignInRegister
                username={sessionUsername}
                busy={busy}
                error={error}
                suggestions={usernameSuggestions}
                onUsernameChange={(v) => {
                    setSessionUsername(v);
                    if (error) setError('');
                }}
                onSubmit={() => void doRegister()}
                onPickSuggestion={(name) => {
                    setSessionUsername(name);
                    setUsernameSuggestions([]);
                    setError('');
                }}
            />
        );
    } else if (sessionView === 'registered') {
        step2Panel = (
            <OnboardingSignInRegistered
                registerResult={registerResult}
                guardActive={guardActive}
                onCopy={async () => {
                    const r = registerResult;
                    if (!r) return;
                    try {
                        await navigator.clipboard.writeText(r.plainSecret);
                        notify(ui.syncLoginCopiedToast || 'Code copied.', false);
                    } catch (e) {
                        console.warn('clipboard copy failed', e);
                    }
                }}
                onDownload={() => {
                    const r = registerResult;
                    if (!r) return;
                    try {
                        downloadSyncSecretFile(r.username, r.plainSecret);
                    } catch (e) {
                        setError(String(e?.message || e));
                    }
                }}
                onFinish={() => void confirmAndCompleteFromRegistered()}
            />
        );
    } else {
        step2Panel = (
            <OnboardingChoose
                onChooseLogin={() => setSessionViewSafe('login')}
                onChooseRegister={() => setSessionViewSafe('register')}
                onChooseSkip={complete}
            />
        );
    }

    return (
        <div data-arborito-panel="modal-onboarding">
            <ModalShell
                mobile={mobile}
                layout="dock"
                scrim="none"
                panelClass="arborito-onboarding-shell arborito-surface-panel"
                rootFlags="arborito-modal--onboarding"
                shellOpts={{
                    instantOpen: step === 1,
                    enter: step === 1 ? 'instant' : undefined,
                    panelClass: 'arborito-onboarding-shell arborito-surface-panel',
                    panelAttrs: 'aria-busy="false"',
                }}
            >
                <OnboardingNavbar
                    ui={ui}
                    step={step}
                    theme={theme}
                    canGoBack={canGoBack}
                    onBack={navBack}
                    onToggleTheme={() => toggleTheme()}
                />
                <div
                    className={`arborito-onboarding-inner flex flex-col${step === 1 ? ' arborito-onboarding-inner--step1' : ''}`}
                >
                    {step === 1 ? (
                        <OnboardingWelcome
                            lang={lang}
                            stepAdvancing={stepAdvancing}
                            onPickLanguage={(code) => void pickOnboardingLanguage(code)}
                            onAcceptAndContinue={acceptAndAdvance}
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
            </ModalShell>
        </div>
    );
}
