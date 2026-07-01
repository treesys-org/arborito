import { useIdentityAuth } from '../hooks/useIdentityAuth.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRegisterPanel } from '../../../app/hooks/useRegisterPanel.js';
import { getPanelRef } from '../../../app/panel-refs.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { DockModalShell } from '../../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { ProfileIdentity } from './ProfileIdentity.jsx';
import { ProfileSignIn } from './ProfileSignIn.jsx';
import { ProfileToolsFooter } from './ProfileTools.jsx';

function readInitialSyncMode({ modal, isSignedIn }) {
    try {
        const m = modal;
        const alreadySignedIn = !!isSignedIn();
        if (m && typeof m === 'object' && m.focus === 'signin' && !alreadySignedIn) {
            return 'login';
        }
    } catch {
        /* ignore */
    }
    return 'create';
}

export function ModalProfile({ embed = false }) {
    const auth = useIdentityAuth();
    const {
        ui,
        dismissModal,
        setModal,
        notify,
        gamification,
        modal,
        isSignedIn,
        isSyncAccount,
        authSession,
        userStore,
        confirm,
        identityActions,
    } = auth;

    const { updateUserProfile, wipeAllLocalDataOnThisDevice, wipeAllLocalDataOnThisDeviceInteractive } =
        identityActions;

    const g = gamification;
    const mob = embed ? true : shouldShowMobileUI();

    const [tempAvatar, setTempAvatar] = useState(() => g.avatar || '👤');
    const [tempUsername, setTempUsername] = useState(() => g.username || '');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [authBusy, setAuthBusy] = useState(false);
    const [authError, setAuthError] = useState('');
    const [syncAccessCodeVisible, setSyncAccessCodeVisible] = useState(false);
    const [syncAccessQrVisible, setSyncAccessQrVisible] = useState(false);
    const [usernameSuggestions, setUsernameSuggestions] = useState([]);
    const [syncMode, setSyncMode] = useState(() => readInitialSyncMode({ modal, isSignedIn }));
    const [syncSecretDraft, setSyncSecretDraft] = useState('');
    const suggestHostRef = useRef({ _suggestTimer: null });

    useEffect(() => {
        setTempAvatar(g.avatar || '👤');
        setTempUsername(g.username || '');
    }, [g.avatar, g.username]);

    useEffect(() => {
        if (!embed && typeof document !== 'undefined' && mob) {
            document.documentElement.classList.add('arborito-profile-modal-open');
            return () => document.documentElement.classList.remove('arborito-profile-modal-open');
        }
        return undefined;
    }, [embed, mob]);

    useEffect(
        () => () => {
            if (suggestHostRef.current._suggestTimer) {
                clearTimeout(suggestHostRef.current._suggestTimer);
            }
        },
        []
    );

    const close = useCallback(() => {
        setSyncAccessCodeVisible(false);
        setSyncAccessQrVisible(false);
        if (embed) {
            getPanelRef('sidebar')?.closeMobileMenuIfOpen?.();
            return;
        }
        dismissModal();
    }, [embed]);

    useRegisterPanel('modal-profile', () => ({ close }));

    const signedIn = isSignedIn();
    const syncAccount = isSyncAccount();
    const accountUsername = (authSession && authSession.username) || '';
    const cloudProgressOn = !!(userStore && userStore.state)?.cloudProgressSync;
    const collectedItems = g.seeds || g.fruits || [];
    const seedsCount = collectedItems.length;
    const hasSavedProfile = !!String(g.username || '').trim();
    const profileDirty =
        hasSavedProfile &&
        (String(tempUsername || '').trim() !== String(g.username || '').trim() ||
            String(tempAvatar || '') !== String(g.avatar || ''));

    const seedsBadgeTitle =
        seedsCount === 0
            ? String(ui.gardenEmpty || '').trim() || String(ui.gardenTitle || '').trim()
            : String(ui.gardenTitle || 'Seeds').trim();
    const seedsBadgeAria = `${seedsCount}. ${seedsBadgeTitle}`;

    const sheetClass = [
        'profile-sheet',
        signedIn ? 'profile-sheet--authed' : '',
        embed ? 'profile-sheet--embedded' : '',
        mob && !embed ? 'profile-sheet--mobile' : '',
        !mob && !embed ? 'profile-sheet--desktop' : '',
        !signedIn && syncMode === 'create' ? 'profile-sheet--register' : '',
        !signedIn && syncMode !== 'create' ? 'profile-sheet--login' : '',
    ]
        .filter(Boolean)
        .join(' ');

    const embedPadX = embed ? 'px-3' : '';

    const identityBlock = (
        <ProfileIdentity
            tempAvatar={tempAvatar}
            tempUsername={tempUsername}
            showEmojiPicker={showEmojiPicker}
            profileDirty={profileDirty}
            streak={g.streak}
            xp={g.xp}
            seedsCount={seedsCount}
            seedsBadgeTitle={seedsBadgeTitle}
            seedsBadgeAria={seedsBadgeAria}
            onToggleEmojiPicker={setShowEmojiPicker}
            onPickEmoji={(emoji) => {
                setTempAvatar(emoji);
                setShowEmojiPicker(false);
            }}
            onUsernameChange={(v) => {
                setTempUsername(v);
                if (authError) setAuthError('');
            }}
            onSaveProfile={() => {
                const username = tempUsername.trim();
                const avatar = tempAvatar;
                updateUserProfile(username, avatar);
                setTempUsername(gamification?.username ?? username);
                setTempAvatar(gamification?.avatar ?? avatar);
            }}
        />
    );

    const sessionBlock = (
        <ProfileSignIn
            tempUsername={tempUsername}
            tempAvatar={tempAvatar}
            syncMode={syncMode}
            syncSecretDraft={syncSecretDraft}
            authBusy={authBusy}
            authError={authError}
            usernameSuggestions={usernameSuggestions}
            syncCodeVisible={syncAccessCodeVisible}
            syncQrVisible={syncAccessQrVisible}
            signedIn={signedIn}
            isSyncAccount={syncAccount}
            accountUsername={accountUsername}
            cloudProgressOn={cloudProgressOn}
            suggestHostRef={suggestHostRef}
            onSyncModeChange={(mode) => {
                setSyncMode(mode);
                setAuthError('');
                setUsernameSuggestions([]);
            }}
            onUsernameChange={setTempUsername}
            onSecretChange={setSyncSecretDraft}
            onAuthErrorClear={() => setAuthError('')}
            onAuthBusyChange={setAuthBusy}
            onAuthError={setAuthError}
            onSuggestionsChange={setUsernameSuggestions}
            onCheckedUsernameChange={() => {}}
            onRevealCode={(v) => setSyncAccessCodeVisible(v !== false)}
            onToggleQr={(v) => {
                if (typeof v === 'boolean') setSyncAccessQrVisible(v);
                else setSyncAccessQrVisible((prev) => !prev);
            }}
            onSignOut={async () => {
                if (authBusy) return;
                const ok = await confirm(
                    ui.profileLogoutClearsLocalConfirm ||
                        'Sign out and delete local Arborito data from this browser?',
                    ui.profileLogoutClearsLocalTitle || ui.authSignOut || 'Sign out',
                    true
                );
                if (!ok) return;
                setAuthBusy(true);
                setAuthError('');
                await wipeAllLocalDataOnThisDevice();
            }}
        />
    );

    const openPrivacy = () => {
        const cur = modal;
        const fromSheet = embed || !!(cur && typeof cur === 'object' && cur.fromMobileMore);
        const fromProfile = !fromSheet && !embed;
        setModal(
            fromSheet
                ? { type: 'privacy', fromMobileMore: true }
                : fromProfile
                  ? { type: 'privacy', fromProfile: true }
                  : 'privacy'
        );
    };

    const openBackup = () => {
        const cur = modal;
        const fromSheet = embed || !!(cur && typeof cur === 'object' && cur.fromMobileMore);
        const fromProfile = !fromSheet && !embed;
        setModal(
            fromSheet
                ? { type: 'backup', fromMobileMore: true }
                : fromProfile
                  ? { type: 'backup', fromProfile: true }
                  : 'backup'
        );
    };

    const toolsBlock = (
        <ProfileToolsFooter
            signedIn={signedIn}
            embedded={embed}
            onOpenBackup={openBackup}
            onOpenPrivacy={openPrivacy}
            onLocalWipe={() => wipeAllLocalDataOnThisDeviceInteractive()}
        />
    );

    const sheetInner =
        mob || embed ? (
            <>
                <section className="profile-mob-hero">
                    <div className="profile-sheet__who profile-sheet__who--mob">{identityBlock}</div>
                </section>
                <section className="profile-mob-panel profile-mob-panel--account">{sessionBlock}</section>
                <section className="profile-mob-panel profile-mob-panel--tools">
                    <div id="profile-backpack-section" className="scroll-mt-4">
                        {toolsBlock}
                    </div>
                </section>
            </>
        ) : (
            <>
                <section className="profile-desk-hero">
                    <div className="profile-sheet__who profile-sheet__who--desk">{identityBlock}</div>
                </section>
                <div className="profile-desk-grid">
                    <section className="profile-desk-panel profile-desk-panel--account">{sessionBlock}</section>
                    <section className="profile-desk-panel profile-desk-panel--tools">
                        <div id="profile-backpack-section" className="scroll-mt-4">
                            {toolsBlock}
                        </div>
                    </section>
                </div>
            </>
        );

    const scrollClass = embed
        ? 'px-0 pt-2 pb-4 arborito-mob-scroll-pane custom-scrollbar relative flex flex-col'
        : '';
    const modalScrollClass = mob
        ? 'profile-modal-scroll profile-modal-scroll--mobile arborito-mob-scroll-pane custom-scrollbar px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]'
        : 'profile-modal-scroll profile-modal-scroll--desktop overflow-y-auto custom-scrollbar';

    if (embed) {
        return (
            <div
                data-arborito-panel="modal-profile"
                data-embed="1"
                className="arborito-profile-embed-root flex flex-col flex-1 min-h-0 w-full h-full min-w-0 overflow-hidden bg-slate-50 dark:bg-slate-950"
            >
                <div className={scrollClass}>
                    <div className={`${sheetClass} ${embedPadX}`}>{sheetInner}</div>
                </div>
            </div>
        );
    }

    return (
        <div data-arborito-panel="modal-profile">
            <DockModalShell
                mobile={mob}
                sizeTier="CONTENT"
                onBackdropClick={close}
                hero={
                    <ModalHubHero
                        ui={ui}
                        mobile={mob}
                        title={ui.navProfile || 'Profile'}
                        leadingIcon={<ChromeEmoji emoji="🪪" size={mob ? 24 : 28} />}
                        tagClass="btn-close-profile"
                        trailingSpacer={mob}
                        onClose={close}
                    />
                }
            >
                <div className={modalScrollClass}>
                    <div className={sheetClass}>{sheetInner}</div>
                </div>
            </DockModalShell>
        </div>
    );
}
