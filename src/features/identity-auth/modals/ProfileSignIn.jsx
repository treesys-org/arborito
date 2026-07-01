import { useIdentityAuth } from '../hooks/useIdentityAuth.js';
import { useEffect, useRef } from 'react';
import { SyncLoginTriad } from './SyncLoginTriad.jsx';
import { parseSyncLoginFromExportFile, normalizeUsername } from '../api/sync-login-secret.js';
import { humanizeAuthError } from '../api/sync-login-error-humanize.js';
import {
    scheduleUsernameAvailabilityCheck,
    fetchUsernameAvailability,
} from '../api/sync-login-username-availability.js';
import { suggestUsernamesFor } from '../api/sync-login-username-suggest.js';
import { LoadingBrandRing } from '../../../shared/ui/Loading.jsx';
import { ProfileUnifiedStatusRow, profileAfterSignedIn } from './ProfilePrefs.jsx';
import { ProfileAdvancedBlock } from './ProfileTools.jsx';

function BusyBanner({ label }) {
    if (!label) return null;
    return (
        <p className="profile-busy-banner" role="status" aria-live="polite">
            <LoadingBrandRing size="sm" />
            <span className="profile-busy-banner__text">{label}</span>
        </p>
    );
}

function UsernameSuggestions({ ui, suggestions, busy, onPick }) {
    if (!suggestions?.length || busy) return null;
    const label = ui.syncLoginSuggestionsLabel || 'Try one of these free names:';
    return (
        <div className="profile-username-suggest" role="group" aria-label={label}>
            <p className="profile-username-suggest__label">{label}</p>
            <div className="profile-username-suggest__chips">
                {suggestions.map((n) => (
                    <button
                        key={n}
                        type="button"
                        className="profile-username-suggest-chip"
                        onClick={() => onPick(n)}
                    >
                        {n}
                    </button>
                ))}
            </div>
        </div>
    );
}

function SyncAccessTriad({ codeRevealed, qrRevealed, onRevealCode, onToggleQr }) {
    const { authSession, isSyncAccount } = useIdentityAuth();
    const sess = authSession;
    const accountUsername = (sess && sess.username) || '';
    if (!sess || !isSyncAccount()) return null;

    return (
        <div className="mt-2 pt-2 border-t border-slate-200/80 dark:border-slate-700/80">
            <SyncLoginTriad
                username={String(sess.username || accountUsername || '').trim()}
                plainSecret={String(sess.syncSecretPlain || '').trim()}
                qrDataUrl={String(sess.syncQrDataUrl || '').trim()}
                profileMasking
                codeRevealed={codeRevealed}
                qrRevealed={qrRevealed}
                onRevealCode={onRevealCode}
                onToggleQr={onToggleQr}
            />
        </div>
    );
}

export function ProfileSignIn({
    tempUsername,
    tempAvatar,
    syncMode,
    syncSecretDraft,
    authBusy,
    authError,
    usernameSuggestions,
    syncCodeVisible,
    syncQrVisible,
    signedIn,
    isSyncAccount,
    accountUsername,
    cloudProgressOn,
    onSyncModeChange,
    onUsernameChange,
    onSecretChange,
    onAuthErrorClear,
    onAuthBusyChange,
    onAuthError,
    onSuggestionsChange,
    onCheckedUsernameChange,
    onRevealCode,
    onToggleQr,
    onSignOut,
    suggestHostRef,
}) {
    const {
        ui,
        notify,
        setModal,
        gamification,
        identityActions,
    } = useIdentityAuth();
    const { signInWithSyncSecret, registerSyncLoginAccount, updateUserProfile, grantNetworkSocialConsent } =
        identityActions;
    const fileRef = useRef(null);
    const modeCr = syncMode === 'create';
    const modePl = syncMode !== 'create';

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
                        ui.syncLoginUsernameTakenShort ||
                            'That name is already taken. Try one of the suggestions.'
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
        const u = String(tempUsername || '').trim();
        const s = String(syncSecretDraft || '').trim();
        if (!u || !s) {
            onAuthError(ui.syncLoginNeedUserSecret || 'Enter username and code.');
            return;
        }
        onAuthBusyChange(true);
        onAuthErrorClear();
        try {
            await signInWithSyncSecret(u, s);
            profileAfterSignedIn();
        } catch (e) {
            onAuthError(humanizeAuthError(e, ui));
        } finally {
            onAuthBusyChange(false);
        }
    };

    const tryRegister = async () => {
        const u = String(tempUsername || '').trim();
        if (!u) {
            onAuthError(ui.authUsernameRequired || 'Type a name first.');
            return;
        }
        onAuthBusyChange(true);
        onAuthErrorClear();
        onSuggestionsChange([]);
        try {
            const norm = normalizeUsername(u);
            const g = gamification;
            if (
                norm &&
                (norm !== normalizeUsername(g?.username) || tempAvatar !== (g && g.avatar))
            ) {
                updateUserProfile(norm, tempAvatar);
            }
            await registerSyncLoginAccount(norm || u);
            grantNetworkSocialConsent?.();
            profileAfterSignedIn();
            onAuthErrorClear();
        } catch (e) {
            const friendly = humanizeAuthError(e, ui);
            onAuthError(friendly);
            const low = String(friendly || '').toLowerCase();
            if (low.includes('ya está') || low.includes('ya esta') || low.includes('already')) {
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

    const tryFileLogin = async (file) => {
        if (!file) return;
        try {
            const raw = await file.text();
            const parsed = parseSyncLoginFromExportFile(raw);
            if (!parsed) {
                notify(ui.syncLoginFileUnreadable || 'Invalid file.', true);
                return;
            }
            onAuthBusyChange(true);
            onAuthErrorClear();
            await signInWithSyncSecret(parsed.username, parsed.secret);
            profileAfterSignedIn();
        } catch (e) {
            onAuthError(humanizeAuthError(e, ui));
        } finally {
            onAuthBusyChange(false);
        }
    };

    const sessionPanelLabel = signedIn
        ? ui.profileSessionConnectedLabel || ui.syncLoginSectionTitle || 'Online account'
        : modeCr
          ? ui.profileSessionRegisterLabel || ui.syncLoginTabRegister || 'Register'
          : ui.profileSessionLoginLabel || ui.syncLoginTabSignIn || 'Sign in';

    const statusRow =
        signedIn || modePl ? (
            <ProfileUnifiedStatusRow
                signedIn={signedIn}
                isSyncAccount={isSyncAccount}
                accountUsername={accountUsername}
                cloudProgressOn={cloudProgressOn}
            />
        ) : null;

    const busyBannerText = modeCr
        ? ui.onboardingRegisterCreatingBanner ||
          'Creating your account… this can take a few seconds. Please don\u2019t close or reload the tab.'
        : ui.onboardingLoginSigningInBanner ||
          'Connecting to the relay network… this can take a few seconds. Please don\u2019t close or reload the tab.';

    let panelBody;
    if (signedIn) {
        panelBody = (
            <>
                {statusRow}
                <SyncAccessTriad
                    codeRevealed={syncCodeVisible}
                    qrRevealed={syncQrVisible}
                    onRevealCode={onRevealCode}
                    onToggleQr={onToggleQr}
                />
                {authError ? (
                    <p className="text-[11px] text-red-600 dark:text-red-300 mt-3 mb-0 leading-snug" role="alert">
                        {authError}
                    </p>
                ) : null}
                <button
                    type="button"
                    id="profile-session-signout"
                    className="profile-primary-cta profile-session-logout min-h-10 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-700 dark:border-red-900/70 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                    onClick={onSignOut}
                >
                    {ui.authSignOut || 'Sign out'}
                </button>
                <ProfileAdvancedBlock authBusy={authBusy} onAuthError={onAuthError} onAuthBusyChange={onAuthBusyChange} onRevealReset={() => { onRevealCode(false); onToggleQr(false); }} />
            </>
        );
    } else if (modeCr) {
        panelBody = (
            <>
                {statusRow}
                <div className="space-y-2">
                    <div
                        className="profile-sync-tabs"
                        role="tablist"
                        aria-label={ui.syncLoginModeLabel || ui.syncLoginSectionTitle || 'Account'}
                    >
                        <button
                            type="button"
                            role="tab"
                            aria-selected="true"
                            className="profile-sync-tab"
                            disabled={authBusy}
                            onClick={() => onSyncModeChange('create')}
                        >
                            {ui.syncLoginTabRegister || 'Register'}
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected="false"
                            className="profile-sync-tab"
                            disabled={authBusy}
                            onClick={() => onSyncModeChange('login')}
                        >
                            {ui.syncLoginTabSignIn || 'Sign in'}
                        </button>
                    </div>
                    <div className={`profile-sync-panel${authBusy ? ' profile-sync-panel--busy' : ''}`} role="tabpanel">
                        {authBusy ? <BusyBanner label={busyBannerText} /> : null}
                        <UsernameSuggestions
                            ui={ui}
                            suggestions={usernameSuggestions}
                            busy={authBusy}
                            onPick={(name) => {
                                onUsernameChange(name);
                                onSuggestionsChange([]);
                                onCheckedUsernameChange('');
                                onAuthErrorClear();
                            }}
                        />
                        <button
                            type="button"
                            id="profile-sync-register"
                            className={`profile-primary-cta min-h-10 rounded-lg arborito-cta-purple py-2 text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500${authBusy ? ' opacity-50 cursor-not-allowed' : ''}`}
                            disabled={authBusy}
                            aria-busy={authBusy ? 'true' : undefined}
                            onClick={() => void tryRegister()}
                        >
                            {authBusy
                                ? ui.onboardingRegisterCreatingButton ||
                                  ui.syncLoginCreatingShort ||
                                  'Creating account…'
                                : ui.syncLoginSubmitRegister || 'Create account'}
                        </button>
                        {ui.networkSocialConsentInfo ? (
                            <p className="profile-fine-print profile-register-terms" role="note">
                                {ui.networkSocialConsentInfo}
                            </p>
                        ) : null}
                    </div>
                </div>
                {authError ? (
                    <p className="text-[11px] text-red-600 dark:text-red-300 mt-3 mb-0 leading-snug" role="alert">
                        {authError}
                    </p>
                ) : null}
            </>
        );
    } else {
        panelBody = (
            <>
                {statusRow}
                <div className="space-y-2">
                    <div
                        className="profile-sync-tabs"
                        role="tablist"
                        aria-label={ui.syncLoginModeLabel || ui.syncLoginSectionTitle || 'Account'}
                    >
                        <button
                            type="button"
                            role="tab"
                            aria-selected="false"
                            className="profile-sync-tab"
                            disabled={authBusy}
                            onClick={() => onSyncModeChange('create')}
                        >
                            {ui.syncLoginTabRegister || 'Register'}
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected="true"
                            className="profile-sync-tab"
                            disabled={authBusy}
                            onClick={() => onSyncModeChange('login')}
                        >
                            {ui.syncLoginTabSignIn || 'Sign in'}
                        </button>
                    </div>
                    <div className={`profile-sync-panel${authBusy ? ' profile-sync-panel--busy' : ''}`} role="tabpanel">
                        {authBusy ? <BusyBanner label={busyBannerText} /> : null}
                        <div className="profile-signin-field">
                            <label className="profile-signin-field__label" htmlFor="profile-sync-username">
                                {ui.profileSignInUsernameLabel || 'Online username'}
                            </label>
                            <input
                                type="text"
                                id="profile-sync-username"
                                autoComplete="username"
                                spellCheck={false}
                                value={tempUsername}
                                placeholder={
                                    ui.profileSignInUsernamePlaceholder ||
                                    ui.usernamePlaceholder ||
                                    'your_username'
                                }
                                aria-label={ui.profileSignInUsernameLabel || 'Online username'}
                                className="arborito-input arborito-input--compact rounded-lg"
                                disabled={authBusy}
                                onChange={(e) => onUsernameChange(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        document.getElementById('profile-sync-secret')?.focus();
                                    }
                                }}
                            />
                            <p className="profile-signin-field__hint">
                                {ui.profileSignInUsernameHint ||
                                    'Same name shown in your profile header above.'}
                            </p>
                        </div>
                        <div className="profile-signin-field">
                            <label className="profile-signin-field__label" htmlFor="profile-sync-secret">
                                {ui.profileSignInSecretLabel || 'Login key (secret code)'}
                            </label>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                                <input
                                    type="text"
                                    id="profile-sync-secret"
                                    autoComplete="current-password"
                                    spellCheck={false}
                                    value={syncSecretDraft}
                                    placeholder={ui.syncLoginSecretPlaceholder || ''}
                                    aria-label={ui.syncLoginYourSecretLabel || 'Secret'}
                                    className="arborito-input arborito-input--compact arborito-input--mono rounded-lg"
                                    disabled={authBusy}
                                    onChange={(e) => onSecretChange(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            void tryTypedLogin();
                                        }
                                    }}
                                />
                                <button
                                    type="button"
                                    className={`min-h-10 shrink-0 rounded-lg arborito-cta-emerald px-4 py-2 text-sm font-bold sm:w-auto${authBusy ? ' opacity-50 cursor-not-allowed' : ''}`}
                                    disabled={authBusy}
                                    aria-busy={authBusy ? 'true' : undefined}
                                    onClick={() => void tryTypedLogin()}
                                >
                                    {authBusy
                                        ? ui.onboardingLoginSigningInButton || 'Signing in…'
                                        : ui.syncLoginSubmitWithSecret ||
                                          ui.syncLoginSubmitLogin ||
                                          'Continue'}
                                </button>
                            </div>
                        </div>
                        <p className="profile-signin-alt-label">
                            {ui.profileSignInAltLabel || 'Or sign in without typing:'}
                        </p>
                        <div className="profile-signin-alt-chips">
                            <button
                                type="button"
                                className={`profile-signin-chip${authBusy ? ' opacity-50 cursor-not-allowed' : ''}`}
                                aria-label={ui.syncLoginScanQrCtaShort || 'Scan QR'}
                                disabled={authBusy}
                                onClick={() => setModal({ type: 'sync-login-qr-scanner', fromProfile: true })}
                            >
                                <span className="profile-signin-chip__ic" aria-hidden="true">
                                    📷
                                </span>
                                <span className="profile-signin-chip__txt">
                                    {ui.profileSignInScanQrChip || ui.syncLoginScanQrCtaShort || 'Scan QR'}
                                </span>
                            </button>
                            <button
                                type="button"
                                className={`profile-signin-chip${authBusy ? ' opacity-50 cursor-not-allowed' : ''}`}
                                aria-label={ui.syncLoginUseLoginKey || ui.syncLoginAltFile || 'Key file'}
                                disabled={authBusy}
                                onClick={() => fileRef.current?.click()}
                            >
                                <span className="profile-signin-chip__ic" aria-hidden="true">
                                    🔑
                                </span>
                                <span className="profile-signin-chip__txt">
                                    {ui.profileSignInPickFileChip || ui.syncLoginAltFile || '.txt file'}
                                </span>
                            </button>
                        </div>
                    </div>
                    <input
                        ref={fileRef}
                        type="file"
                        id="profile-sync-file-txt"
                        className="hidden"
                        accept=".txt,text/plain"
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            void tryFileLogin(f || null);
                        }}
                    />
                </div>
                {authError ? (
                    <p className="text-[11px] text-red-600 dark:text-red-300 mt-3 mb-0 leading-snug" role="alert">
                        {authError}
                    </p>
                ) : null}
            </>
        );
    }

    return (
        <div id="profile-session-section" className="profile-sheet__session scroll-mt-4">
            <p className="profile-session__label">{sessionPanelLabel}</p>
            {panelBody}
        </div>
    );
}
