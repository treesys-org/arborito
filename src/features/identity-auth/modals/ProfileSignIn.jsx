import { useIdentityAuth } from '../hooks/useIdentityAuth.js';
import { useEffect, useState } from 'react';
import { normalizeUsername, isPasswordCredentialSession } from '../api/sync-login-secret.js';
import { humanizeAuthError } from '../api/sync-login-error-humanize.js';
import {
    scheduleUsernameAvailabilityCheck,
    fetchUsernameAvailability,
} from '../api/sync-login-username-availability.js';
import { suggestUsernamesFor } from '../api/sync-login-username-suggest.js';
import { focusProfileUsernameField, clearProfileUsernameAttention } from '../api/profile-username-focus.js';
import { LoadingBrandRing } from '../../../shared/ui/Loading.jsx';
import { ProfileDangerZone } from '../components/ProfileDangerZone.jsx';
import { profileAfterSignedIn } from './ProfilePrefs.jsx';
import { LoginPasswordRegisterFields } from '../components/LoginPasswordRegisterFields.jsx';
import { LoginPasswordField } from '../components/LoginPasswordField.jsx';
import { LoginPasswordRecoveryLinks } from '../components/LoginAuthExtras.jsx';
import { ProfileLoginMethodTabs } from '../components/ProfileLoginMethodTabs.jsx';
import { ProfilePasswordSecurityPanel } from '../components/ProfilePasswordSecurityPanel.jsx';
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
        <div className="arborito-onb-suggest" role="group" aria-label={label}>
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

function SyncAccessTriad({ qrRevealed, onToggleQr }) {
    const { authSession, isSyncAccount, ui, setModal, identityActions } = useIdentityAuth();
    const { downloadRecoveryKitFile } = identityActions;
    const sess = authSession;
    const accountUsername = (sess && sess.username) || '';
    if (!sess || !isSyncAccount()) return null;
    if (!isPasswordCredentialSession(sess)) return null;

    const password = String(sess.syncSecretPlain || '').trim();
    const recoveryKey = String(sess.recoveryKeyPlain || '').trim();
    const username = String(sess.username || accountUsername).trim();
    const qr = String(sess.syncQrDataUrl || '').trim();

    return (
        <ProfilePasswordSecurityPanel
            ui={ui}
            qrDataUrl={qr}
            qrRevealed={qrRevealed}
            onToggleQr={onToggleQr}
            onChangePassword={() =>
                setModal({
                    type: 'change-password',
                    fromProfile: true,
                })
            }
            onDownloadRecoveryKit={
                password && recoveryKey
                    ? () => void downloadRecoveryKitFile(username, password, recoveryKey)
                    : undefined
            }
            onSetupRecovery={() =>
                setModal({
                    type: 'account-recovery',
                    mode: 'setup',
                    fromProfile: true,
                })
            }
        />
    );
}

function ProfileAuthTabs({ ui, syncMode, authBusy, onSyncModeChange }) {
    const registerLbl = ui.syncLoginTabRegister || 'Register';
    const signInLbl = ui.syncLoginTabSignIn || 'Sign in';
    return (
        <div
            className="profile-sync-tabs"
            role="tablist"
            aria-label={ui.syncLoginModeLabel || ui.syncLoginSectionTitle || 'Account'}
        >
            <button
                type="button"
                role="tab"
                aria-selected={syncMode === 'create' ? 'true' : 'false'}
                className="profile-sync-tab"
                disabled={authBusy}
                onClick={() => onSyncModeChange('create')}
            >
                {registerLbl}
            </button>
            <button
                type="button"
                role="tab"
                aria-selected={syncMode === 'login' ? 'true' : 'false'}
                className="profile-sync-tab"
                disabled={authBusy}
                onClick={() => onSyncModeChange('login')}
            >
                {signInLbl}
            </button>
        </div>
    );
}

function requireUsername(ui, tempUsername, onAuthError, onUsernameAttention) {
    const u = String(tempUsername || '').trim();
    if (u) return u;
    onAuthError(
        ui.profileAuthUsernameRequired ||
            ui.authUsernameRequired ||
            '↑ Enter your online username above first.'
    );
    onUsernameAttention?.(true);
    focusProfileUsernameField();
    return '';
}

export function ProfileSignIn({
    tempUsername,
    tempAvatar,
    syncMode,
    syncSecretDraft,
    authBusy,
    authError,
    usernameSuggestions,
    syncQrVisible,
    signedIn,
    onSyncModeChange,
    onUsernameChange,
    onSecretChange,
    onAuthErrorClear,
    onAuthBusyChange,
    onAuthError,
    onSuggestionsChange,
    onCheckedUsernameChange,
    onToggleQr,
    onSignOut,
    suggestHostRef,
    onUsernameAttention,
}) {
    const { ui, setModal, gamification, identityActions } = useIdentityAuth();
    const { signInWithSyncSecret, registerSyncLoginAccount, updateUserProfile, grantNetworkSocialConsent } =
        identityActions;
    const modeCr = syncMode === 'create';
    const [registerPassword, setRegisterPassword] = useState('');
    const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState('');
    const [registerPasswordStep, setRegisterPasswordStep] = useState(false);
    const [registerCheckingUsername, setRegisterCheckingUsername] = useState(false);
    const [loginMethod, setLoginMethod] = useState('password');

    useEffect(() => {
        setRegisterPasswordStep(false);
        setRegisterPassword('');
        setRegisterPasswordConfirm('');
    }, [tempUsername, syncMode]);

    useEffect(() => {
        if (syncMode !== 'login') setLoginMethod('password');
    }, [syncMode]);

    const scheduleUsernameCheck = () => {
        scheduleUsernameAvailabilityCheck(suggestHostRef.current, {
            getRaw: () => tempUsername,
            onRun: async (raw) => {
                if (!raw) {
                    onSuggestionsChange([]);
                    onCheckedUsernameChange('');
                    return;
                }
                const result = await fetchUsernameAvailability(raw);
                if (!result) return;
                if (String(tempUsername || '').trim() !== result.target) return;
                onCheckedUsernameChange(result.target);
                if (result.taken) {
                    onSuggestionsChange(result.suggestions);
                    onAuthError(
                        ui.syncLoginUsernameTaken ||
                            'That username is already taken. Pick another or sign in from the Sign in tab.'
                    );
                } else {
                    onSuggestionsChange([]);
                }
            },
        });
    };

    useEffect(() => {
        if (!signedIn && modeCr) scheduleUsernameCheck();
    }, [tempUsername, signedIn, modeCr]);

    const tryTypedLogin = async () => {
        const u = requireUsername(ui, tempUsername, onAuthError, onUsernameAttention);
        if (!u) return;
        const s = String(syncSecretDraft || '').trim();
        if (!s) {
            onAuthError(ui.syncLoginNeedUserSecret || 'Enter your password.');
            return;
        }
        onAuthBusyChange(true);
        onAuthErrorClear();
        clearProfileUsernameAttention();
        onUsernameAttention?.(false);
        try {
            await signInWithSyncSecret(u, s);
            profileAfterSignedIn();
        } catch (e) {
            onAuthError(humanizeAuthError(e, ui));
        } finally {
            onAuthBusyChange(false);
        }
    };

    const tryUsernameContinue = async () => {
        const u = requireUsername(ui, tempUsername, onAuthError, onUsernameAttention);
        if (!u) return false;
        setRegisterCheckingUsername(true);
        onAuthErrorClear();
        onSuggestionsChange([]);
        try {
            const result = await fetchUsernameAvailability(u);
            if (!result) return false;
            if (String(tempUsername || '').trim() !== result.target) return false;
            onCheckedUsernameChange(result.target);
            if (result.taken) {
                onSuggestionsChange(result.suggestions);
                onAuthError(
                    ui.syncLoginUsernameTaken ||
                        'That username is already taken. Pick another or sign in from the Sign in tab.'
                );
                return false;
            }
            clearProfileUsernameAttention();
            onUsernameAttention?.(false);
            setRegisterPasswordStep(true);
            return true;
        } finally {
            setRegisterCheckingUsername(false);
        }
    };

    const tryRegister = async () => {
        const u = requireUsername(ui, tempUsername, onAuthError, onUsernameAttention);
        if (!u) return;
        onAuthBusyChange(true);
        onAuthErrorClear();
        onSuggestionsChange([]);
        clearProfileUsernameAttention();
        onUsernameAttention?.(false);
        try {
            const norm = normalizeUsername(u);
            const g = gamification;
            if (
                norm &&
                (norm !== normalizeUsername(g?.username) || tempAvatar !== (g && g.avatar))
            ) {
                updateUserProfile(norm, tempAvatar);
            }
            await registerSyncLoginAccount(norm || u, {
                credentialKind: 'password',
                password: registerPassword,
                passwordConfirm: registerPasswordConfirm,
            });
            grantNetworkSocialConsent?.();
            profileAfterSignedIn();
            onAuthErrorClear();
        } catch (e) {
            const friendly = humanizeAuthError(e, ui);
            onAuthError(friendly);
            const low = String(friendly || '').toLowerCase();
            if (
                low.includes('ya está') ||
                low.includes('ya esta') ||
                low.includes('already') ||
                low.includes('taken') ||
                low.includes('en uso')
            ) {
                try {
                    onSuggestionsChange(await suggestUsernamesFor(u));
                } catch {
                    /* ignore */
                }
            }
        } finally {
            onAuthBusyChange(false);
        }
    };

    const busyBannerText = modeCr
        ? ui.onboardingRegisterCreatingBanner ||
          'Creating your account… this can take a few seconds. Please don\u2019t close or reload the tab.'
        : ui.onboardingLoginSigningInBanner ||
          'Connecting to the network… this can take a few seconds. Please don\u2019t close or reload the tab.';

    useEffect(() => {
        const onPrimary = () => {
            if (signedIn || authBusy || registerCheckingUsername) return;
            if (modeCr) {
                if (registerPasswordStep) void tryRegister();
                else void tryUsernameContinue();
            } else if (loginMethod === 'password') {
                void tryTypedLogin();
            } else {
                setModal({ type: 'sync-login-qr-scanner', fromProfile: true });
            }
        };
        window.addEventListener('arborito-profile-auth-primary', onPrimary);
        return () => window.removeEventListener('arborito-profile-auth-primary', onPrimary);
    });

    let panelBody;
    if (signedIn) {
        panelBody = (
            <>
                <SyncAccessTriad qrRevealed={syncQrVisible} onToggleQr={onToggleQr} />
                {authError ? (
                    <p className="text-[11px] text-red-600 dark:text-red-300 mt-3 mb-0 leading-snug" role="alert">
                        {authError}
                    </p>
                ) : null}
                <button
                    type="button"
                    id="profile-session-signout"
                    className="profile-action-btn profile-action-btn--footer profile-action-btn--danger profile-session-logout"
                    onClick={onSignOut}
                >
                    {ui.authSignOut || 'Sign out'}
                </button>
                <ProfileDangerZone
                    authBusy={authBusy}
                    onAuthError={onAuthError}
                    onAuthBusyChange={onAuthBusyChange}
                />
            </>
        );
    } else {
        const primaryLbl = authBusy
            ? modeCr
                ? ui.onboardingRegisterCreatingButton || ui.syncLoginCreatingShort || 'Creating account…'
                : ui.onboardingLoginSigningInButton || 'Signing in…'
            : registerCheckingUsername
              ? ui.onboardingSessionChecking || 'Checking…'
              : modeCr
                ? registerPasswordStep
                    ? ui.syncLoginSubmitRegister || 'Create account'
                    : ui.onboardingSessionContinue || ui.onboardingContinue || 'Continue'
                : loginMethod === 'qr'
                  ? ui.qrSyncScanCta || 'Scan sync QR'
                  : ui.syncLoginSubmitLogin || 'Sign in';

        panelBody = (
            <div className="profile-session-auth arborito-auth-surface profile-guest-auth">
                <ProfileAuthTabs
                    ui={ui}
                    syncMode={syncMode}
                    authBusy={authBusy}
                    onSyncModeChange={onSyncModeChange}
                />
                <div
                    className={`profile-sync-panel profile-guest-auth__panel${authBusy ? ' profile-sync-panel--busy' : ''}`}
                    role="tabpanel"
                >
                    <div className={`arborito-onb-form profile-guest-auth__form${authBusy ? ' arborito-onb-busy' : ''}`}>
                        {authBusy ? <BusyBanner label={busyBannerText} /> : null}

                        {modeCr && !registerPasswordStep ? (
                            <UsernameSuggestions
                                ui={ui}
                                suggestions={usernameSuggestions}
                                busy={authBusy || registerCheckingUsername}
                                onPick={(name) => {
                                    onUsernameChange(name);
                                    onSuggestionsChange([]);
                                    onCheckedUsernameChange('');
                                    onAuthErrorClear();
                                    clearProfileUsernameAttention();
                                    onUsernameAttention?.(false);
                                }}
                            />
                        ) : null}

                        {modeCr && registerPasswordStep ? (
                            <LoginPasswordRegisterFields
                                ui={ui}
                                disabled={authBusy}
                                password={registerPassword}
                                passwordConfirm={registerPasswordConfirm}
                                onPasswordChange={setRegisterPassword}
                                onPasswordConfirmChange={setRegisterPasswordConfirm}
                            />
                        ) : null}

                        {!modeCr ? (
                            <>
                                <ProfileLoginMethodTabs
                                    ui={ui}
                                    value={loginMethod}
                                    disabled={authBusy}
                                    onChange={setLoginMethod}
                                />
                                {loginMethod === 'password' ? (
                                    <>
                                        <LoginPasswordField
                                            id="profile-sync-secret"
                                            label={ui.loginPasswordLabel || 'Password'}
                                            autoComplete="current-password"
                                            placeholder={ui.loginPasswordPlaceholder || 'Your password'}
                                            disabled={authBusy}
                                            value={syncSecretDraft}
                                            ui={ui}
                                            onChange={onSecretChange}
                                            onEnter={() => void tryTypedLogin()}
                                        />
                                        <LoginPasswordRecoveryLinks
                                            ui={ui}
                                            disabled={authBusy}
                                            onForgotPassword={() =>
                                                setModal({
                                                    type: 'account-recovery',
                                                    mode: 'recover',
                                                    prefillUsername: String(tempUsername || '').trim(),
                                                    fromProfile: true,
                                                })
                                            }
                                        />
                                    </>
                                ) : null}
                                {loginMethod === 'qr' ? (
                                    <p className="profile-login-method-hint">
                                        {ui.loginMethodQrHint ||
                                            ui.qrSyncScanHintMobile ||
                                            'Scan the sync QR from your other signed-in device.'}
                                    </p>
                                ) : null}
                            </>
                        ) : null}

                        {authError ? (
                            <p
                                className={`arborito-onb-error profile-guest-auth__error${String(authError).startsWith('↑') || /arriba|above|↑/i.test(authError) ? ' profile-guest-auth__error--points-up' : ''}`}
                                role="alert"
                            >
                                {authError}
                            </p>
                        ) : null}

                        <button
                            type="button"
                            id={modeCr ? 'profile-sync-register' : undefined}
                            className={`arborito-onb-cta${modeCr ? '' : ' arborito-onb-cta--signin'}`}
                            disabled={authBusy || registerCheckingUsername}
                            aria-busy={authBusy || registerCheckingUsername ? 'true' : undefined}
                            onClick={() => {
                                if (modeCr) {
                                    if (registerPasswordStep) void tryRegister();
                                    else void tryUsernameContinue();
                                } else if (loginMethod === 'password') {
                                    void tryTypedLogin();
                                } else {
                                    setModal({ type: 'sync-login-qr-scanner', fromProfile: true });
                                }
                            }}
                        >
                            {primaryLbl}
                        </button>

                        {modeCr && registerPasswordStep && ui.networkSocialConsentInfo ? (
                            <p className="arborito-onb-fineprint" role="note">
                                {ui.networkSocialConsentInfo}
                            </p>
                        ) : null}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div id="profile-session-section" className="profile-sheet__session scroll-mt-4">
            {panelBody}
        </div>
    );
}
