
import { store } from '../../store.js';
import { shouldShowMobileUI } from '../../utils/breakpoints.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';
import { formatUserHandle } from '../../utils/user-handle.js';
import { escHtml, escAttr } from '../../utils/html-escape.js';
import { syncLoginTriadMarkup, bindSyncLoginTriadControls } from '../../utils/sync-login-triad-html.js';
import { parseSyncLoginFromExportFile } from '../../services/sync-login-secret.js';

// Comprehensive Emoji Data
const EMOJI_DATA = {
    "Faces": ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "🥲", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🥸", "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔", "🤭", "🤫", "🤥", "😶", "😐", "😑", "😬", "🙄", "😯", "😦", "😧", "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "🤐", "🥴", "🤢", "🤮", "🤧", "😷", "🤒", "🤕", "🤑", "🤠", "😈", "👿", "👹", "👺", "🤡", "💩", "👻", "💀", "☠️", "👽", "👾", "🤖", "🎃"],
    "People": ["👶", "👧", "🧒", "👦", "👩", "🧑", "👨", "👩‍🦱", "👨‍🦱", "👩‍🦰", "👨‍🦰", "👱‍♀️", "👱‍♂️", "👩‍🦳", "👨‍🦳", "👩‍🦲", "👨‍🦲", "🧔", "👵", "🧓", "👴", "👲", "👳‍♀️", "👳‍♂️", "🧕", "👮‍♀️", "👮‍♂️", "👷‍♀️", "👷‍♂️", "💂‍♀️", "💂‍♂️", "🕵️‍♀️", "🕵️‍♂️", "👩‍⚕️", "👨‍⚕️", "👩‍🌾", "👨‍🌾", "👩‍🍳", "👨‍🍳", "👩‍🎓", "👨‍🎓", "👩‍🎤", "👨‍🎤", "👩‍🏫", "👨‍🏫", "👩‍🏭", "👨‍🏭", "👩‍💻", "👨‍💻", "👩‍💼", "👨‍💼", "👩‍🔧", "👨‍🔧", "👩‍🔬", "👨‍🔬", "👩‍🎨", "👨‍🎨", "👩‍🚒", "👨‍🚒", "👩‍✈️", "👨‍✈️", "👩‍🚀", "👨‍🚀", "👩‍⚖️", "👨‍⚖️", "👰", "🤵", "👸", "🤴", "🦸‍♀️", "🦸‍♂️", "🦹‍♀️", "🦹‍♂️", "🤶", "🎅", "🧙‍♀️", "🧙‍♂️", "🧝‍♀️", "🧝‍♂️", "🧛‍♀️", "🧛‍♂️", "🧟‍♀️", "🧟‍♂️", "🧞‍♀️", "🧞‍♂️", "🧜‍♀️", "🧜‍♂️", "🧚‍♀️", "🧚‍♂️", "👼", "🤰", "🤱", "🙇‍♀️", "🙇‍♂️", "💁‍♀️", "💁‍♂️", "🙅‍♀️", "🙅‍♂️", "🙆‍♀️", "🙆‍♂️", "🙋‍♀️", "🙋‍♂️", "🧏‍♀️", "🧏‍♂️", "🤦‍♀️", "🤦‍♂️", "🤷‍♀️", "🤷‍♂️"],
    "Animals": ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐽", "🐸", "🐵", "🙉", "🙊", "🐒", "🐔", "🐧", "🐦", "🐤", "🐣", "🐥", "🦆", "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🐛", "🦋", "🐌", "🐞", "🐜", "🦟", "🦗", "🕷️", "🕸️", "🦂", "🐢", "🐍", "🦎", "🦖", "🦕", "🐙", "🦑", "🦐", "🦞", "🦀", "🐡", "🐠", "🐟", "🐬", "🐳", "🐋", "🦈", "🐊", "🐅", "🐆", "🦓", "🦍", "🦧", "🦣", "🐘", "🦛", "🦏", "🐪", "🐫", "🦒", "🦘", "🦬", "🐃", "🐂", "🐄", "🐎", "🐖", "🐏", "🐑", "🦙", "🐐", "🦌", "🐕", "🐩", "🦮", "🐕‍🦺", "🐈", "🐈‍⬛", "🪶", "🐓", "🦃", "🦤", "🦚", "🦜", "🦢", "🦩", "🕊️", "🐇", "🦝", "🦨", "🦡", "🦫", "🦦", "🦥", "🐁", "🐀", "🐿️", "🦔", "🐾", "🐉", "🐲"]
};

class ArboritoModalProfile extends HTMLElement {
    constructor() {
        super();
        this.state = {
            showEmojiPicker: false,
            tempAvatar: store.value.gamification.avatar || '👤',
            tempUsername: store.value.gamification.username || '',
            passkeyBusy: false,
            passkeyError: '',
            /** Sync access key: code hidden as bullets until user taps “Show code”. */
            syncAccessCodeVisible: false,
            /** Profile: QR hidden until user taps “Show QR”. */
            syncAccessQrVisible: false
        };
        this.lastRenderKey = null;
        /** @type {string[]|null} */
        this._recoveryPlainCodes = null;
        this._recoveryBusy = false;
        /** @type {'login'|'create'} */
        this._profileSyncMode = 'create';
        this._profileSyncSecretDraft = '';
    }

    connectedCallback() {
        if (!this.hasAttribute('embed') && typeof document !== 'undefined') {
            document.documentElement.classList.add('arborito-profile-modal-open');
        }
        this.render();
        this._storeListener = () => this.render();
        store.addEventListener('state-change', this._storeListener);

        this.pickerListener = (e) => {
             if (this.state.showEmojiPicker && !e.target.closest('#emoji-picker') && !e.target.closest('#btn-avatar-picker')) {
                 this.state.showEmojiPicker = false;
                 this.updateView();
             }
        };
        document.addEventListener('click', this.pickerListener);
    }
    
    disconnectedCallback() {
        if (!this.hasAttribute('embed') && typeof document !== 'undefined') {
            document.documentElement.classList.remove('arborito-profile-modal-open');
        }
        if (this._storeListener) {
            store.removeEventListener('state-change', this._storeListener);
        }
        document.removeEventListener('click', this.pickerListener);
    }

    close() {
        this.state.syncAccessCodeVisible = false;
        this.state.syncAccessQrVisible = false;
        if (this.hasAttribute('embed')) {
            if (document.querySelector('arborito-sidebar') && document.querySelector('arborito-sidebar').closeMobileMenuIfOpen) document.querySelector('arborito-sidebar').closeMobileMenuIfOpen();
            return;
        }
        store.dismissModal();
    }

    updateView() {
        const picker = this.querySelector('#emoji-picker');
        if (picker) {
             if (this.state.showEmojiPicker) picker.classList.remove('hidden');
             else picker.classList.add('hidden');
        }

        const avatarDisplay = this.querySelector('#avatar-display');
        if (avatarDisplay) avatarDisplay.textContent = this.state.tempAvatar;
    }

    /** Update save button without rebuilding the whole modal (typing name). */
    updateProfileDirtyUi() {
        const btn = this.querySelector('#btn-save-profile');
        if (!btn) return;
        const g = store.value.gamification;
        const dirty =
            String(this.state.tempUsername || '').trim() !== String((g && g.username) || '').trim() ||
            String(this.state.tempAvatar || '') !== String((g && g.avatar) || '');
        btn.disabled = !dirty;
        const active =
            'min-h-[44px] rounded-xl px-8 py-3 text-sm font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-sky-500 dark:focus-visible:ring-offset-slate-900 border-2 border-sky-600 bg-sky-600 text-white shadow-md hover:bg-sky-500 hover:border-sky-500 active:translate-y-px';
        const idle =
            'min-h-[44px] rounded-xl px-8 py-3 text-sm font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400 dark:focus-visible:ring-offset-slate-900 cursor-default border border-slate-400 bg-slate-300 text-slate-600 shadow-inner dark:border-slate-600 dark:bg-slate-600 dark:text-slate-300';
        btn.className = dirty ? active : idle;
    }

    render() {
        const ui = store.ui;
        const g = store.value.gamification;
        let myPubForTag = '';
        try { myPubForTag = ((store.getNetworkUserPair && store.getNetworkUserPair()) ? store.getNetworkUserPair().pub : undefined) || ''; } catch { myPubForTag = ''; }
        const displayHandle = formatUserHandle(g.username, myPubForTag);
        const collectedItems = g.seeds || g.fruits || [];
        const lang = store.value.lang;
        const theme = store.value.theme;
        const embedded = this.hasAttribute('embed');

        const modal = store.value.modal;
        const profileFocus = embedded
            ? (this.getAttribute('data-focus') || 'seeds')
            : (typeof modal === 'object' && (modal && modal.type) === 'profile' ? (modal.focus || '') : '');

        const mob = embedded ? true : shouldShowMobileUI();
        const renderKey = JSON.stringify({
            lang, theme,
            username: g.username,
            avatar: g.avatar,
            xp: g.xp,
            streak: g.streak,
            seeds: collectedItems.length,
            localAvatar: this.state.tempAvatar,
            localUsername: this.state.tempUsername,
            passkeyBusy: this.state.passkeyBusy,
            passkeyError: this.state.passkeyError,
            passkeySession: (store.passkeySession && store.passkeySession.username) || '',
            passkeyAuthed: !!(store.isPasskeyAuthed && store.isPasskeyAuthed()),
            syncMat:
                String((store.passkeySession && store.passkeySession.syncSecretPlain) || '').length +
                String((store.passkeySession && store.passkeySession.syncQrDataUrl) || '').length,
            cloudProgressSync: !!(store.userStore && store.userStore.state)?.cloudProgressSync,
            profileFocus,
            mob,
            embedded,
            recoveryCodes: (this._recoveryPlainCodes || []).length,
            recoveryBusy: this._recoveryBusy,
            profileSyncMode: this._profileSyncMode,
            profileSyncSecretLen: String((this._profileSyncSecretDraft && this._profileSyncSecretDraft.length) || 0),
            syncCodeVis: this.state.syncAccessCodeVisible,
            syncQrVis: this.state.syncAccessQrVisible
        });

        if (renderKey === this.lastRenderKey) return;
        this.lastRenderKey = renderKey;

        const focusedId = document.activeElement ? document.activeElement.id : null;
        const selectionStart = document.activeElement ? document.activeElement.selectionStart : null;
        const selectionEnd = document.activeElement ? document.activeElement.selectionEnd : null;

        const mobileChrome = mob
            ? `
                <div class="arborito-sheet__hero arborito-sheet__hero--mmenu-sub arborito-dock-modal-hero shrink-0 flex w-full min-w-0 items-center gap-2">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0')}
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0 text-left">${ui.navProfile}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>`
            : `
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0')}
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0 text-left">${ui.navProfile}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>`;

        const scrollClass = embedded
            ? 'px-0 pt-2 pb-4 text-center flex-1 min-h-0 overflow-y-auto custom-scrollbar relative flex flex-col'
            : `p-4 md:p-6 ${mob ? 'pt-4' : 'pt-5'} text-center h-full overflow-y-auto custom-scrollbar relative flex flex-col flex-1 min-h-0`;
        const embedPadX = embedded ? 'px-3' : '';
        const passkeyCardShell = embedded
            ? 'rounded-none border-x-0 border-y border-emerald-200/90 bg-emerald-50/85 dark:border-emerald-800/85 dark:bg-emerald-950/35'
            : 'rounded-xl border border-emerald-200 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/25';

        const passkeyAuthed = !!(store.isPasskeyAuthed && store.isPasskeyAuthed());
        const sess = store.passkeySession;
        const isSyncAccount = !!(
            passkeyAuthed &&
            sess &&
            (sess.credentialId === 'sync-login' || sess.authMode === 'sync')
        );
        const passkeyUsername = (store.passkeySession && store.passkeySession.username) || '';
        const cloudProgressOn = !!(store.userStore && store.userStore.state)?.cloudProgressSync;
        let statusDotClass = 'bg-slate-400 dark:bg-slate-500';
        let statusLine = escHtml(ui.profileModeLocal || ui.passkeyLocalOnlyBody || 'Local only');
        if (passkeyAuthed) {
            if (isSyncAccount && cloudProgressOn) {
                statusDotClass = 'bg-emerald-500';
                statusLine = escHtml(
                    String(ui.profileModeOnlineSyncOn || '{user} · cloud on').replace(/\{user\}/g, passkeyUsername)
                );
            } else if (isSyncAccount && !cloudProgressOn) {
                statusDotClass = 'bg-amber-500';
                statusLine = escHtml(
                    String(ui.profileModeOnlineSyncOff || '{user} · cloud off').replace(/\{user\}/g, passkeyUsername)
                );
            } else {
                statusDotClass = 'bg-sky-500';
                statusLine = escHtml(
                    String(ui.profileModeOnlinePasskey || '{user} · passkey').replace(/\{user\}/g, passkeyUsername)
                );
            }
        }
        const unifiedStatusRow = `<div class="mt-2 flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-950/50 px-2.5 py-1.5 text-left" role="status">
                <span class="h-2 w-2 shrink-0 rounded-full ${statusDotClass}" aria-hidden="true"></span>
                <p class="m-0 min-w-0 flex-1 text-xs font-bold leading-snug text-slate-800 dark:text-slate-100">${statusLine}</p>
            </div>`;

        const passkeyError = this.state.passkeyError
            ? `<p class="text-[11px] text-red-600 dark:text-red-300 mt-3 mb-0 leading-snug" role="alert">${escHtml(this.state.passkeyError)}</p>`
            : '';

        const recoveryCodesPanel =
            passkeyAuthed && this._recoveryPlainCodes && this._recoveryPlainCodes.length
                ? `<div class="mt-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-white/80 dark:bg-slate-950/50 p-3 text-left">
                        <p class="text-[10px] font-black uppercase tracking-widest text-amber-800 dark:text-amber-200 m-0">${escHtml(ui.recoveryCodesOnceTitle)}</p>
                        <pre class="mt-2 text-[11px] font-mono text-slate-800 dark:text-slate-100 whitespace-pre-wrap break-all select-text m-0 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 max-h-40 overflow-y-auto">${escHtml(this._recoveryPlainCodes.join('\n'))}</pre>
                        <div class="flex flex-col gap-2 mt-3 sm:flex-row">
                            <button type="button" id="profile-recovery-codes-copy" class="min-h-[44px] flex-1 rounded-xl bg-amber-600 px-3 py-3 text-sm font-bold text-white hover:bg-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900">${escHtml(ui.recoveryCodesCopy)}</button>
                            <button type="button" id="profile-recovery-codes-done" class="min-h-[44px] flex-1 rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900">${escHtml(ui.recoveryCodesDone)}</button>
                        </div>
                    </div>`
                : '';

        const recoverySection = passkeyAuthed && !isSyncAccount
            ? `
                    <div id="profile-recovery-section" class="mb-8 pb-8 border-b border-slate-100 dark:border-slate-800 text-left scroll-mt-4 ${embedPadX}">
                        <div class="rounded-2xl p-5 border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20">
                            <h3 class="text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-200 m-0">🔑 ${escHtml(ui.recoverySectionTitle)}</h3>
                            <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-snug m-0 mt-2">${escHtml(ui.recoverySectionLead)}</p>
                            <button type="button" id="profile-open-recovery-assistant" class="mt-4 w-full min-h-[44px] rounded-xl bg-amber-700 px-4 py-3 text-sm font-bold uppercase tracking-wide text-white hover:bg-amber-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900">${escHtml(ui.recoveryHowOpenAssistant)}</button>
                            <div class="mt-3 flex flex-col gap-2 sm:flex-row">
                                <button type="button" id="profile-gen-backup-codes" class="min-h-[44px] flex-1 rounded-xl border border-amber-300 bg-white/80 px-4 py-3 text-sm font-bold text-amber-900 dark:border-amber-800 dark:bg-slate-950/40 dark:text-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${this._recoveryBusy ? 'cursor-not-allowed opacity-50' : ''}" ${this._recoveryBusy ? 'disabled' : ''}>${escHtml(ui.recoveryGenerateCodes)}</button>
                                <button type="button" id="profile-export-recovery-kit" class="min-h-[44px] flex-1 rounded-xl border border-amber-300 bg-white/80 px-4 py-3 text-sm font-bold text-amber-900 dark:border-amber-800 dark:bg-slate-950/40 dark:text-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${this._recoveryBusy ? 'cursor-not-allowed opacity-50' : ''}" ${this._recoveryBusy ? 'disabled' : ''}>${escHtml(ui.recoveryDownloadKit)}</button>
                            </div>
                            ${recoveryCodesPanel}
                        </div>
                    </div>`
            : '';

        const modePl = this._profileSyncMode !== 'create';
        const modeCr = this._profileSyncMode === 'create';
        const profileSyncLoginForm =
            !passkeyAuthed
                ? `<div class="mt-2 space-y-2">
                <div class="flex gap-0.5 rounded-lg border border-slate-200 bg-slate-100/90 p-0.5 dark:border-slate-600 dark:bg-slate-800/70" role="tablist" aria-label="${escAttr(ui.syncLoginModeLabel || ui.syncLoginSectionTitle || 'Account')}">
                    <button type="button" role="tab" aria-selected="${modeCr ? 'true' : 'false'}" class="js-profile-sync-mode min-h-9 flex-1 rounded-md px-2 py-2 text-xs font-bold transition sm:text-sm ${modeCr ? 'bg-white text-violet-700 shadow-sm ring-1 ring-slate-200/90 dark:bg-slate-950 dark:text-violet-300 dark:ring-slate-600' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}" data-mode="create">${escHtml(ui.syncLoginTabRegister || 'Register')}</button>
                    <button type="button" role="tab" aria-selected="${modePl ? 'true' : 'false'}" class="js-profile-sync-mode min-h-9 flex-1 rounded-md px-2 py-2 text-xs font-bold transition sm:text-sm ${modePl ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/90 dark:bg-slate-950 dark:text-slate-100 dark:ring-slate-600' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}" data-mode="login">${escHtml(ui.syncLoginTabSignIn || 'Sign in')}</button>
                </div>
                ${
                    modeCr
                        ? `<p class="text-[10px] text-slate-500 dark:text-slate-400 m-0 leading-snug">${escHtml([ui.syncLoginProfileUsesNameHint, ui.syncLoginRegisterLead].filter(Boolean).join(' '))}</p>
                <button type="button" id="profile-sync-register" class="min-h-10 w-full rounded-lg bg-violet-600 py-2 text-sm font-bold text-white hover:bg-violet-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${this.state.passkeyBusy ? 'cursor-not-allowed opacity-50' : ''}" ${this.state.passkeyBusy ? 'disabled' : ''}>${escHtml(ui.syncLoginSubmitRegister || 'Create account')}</button>`
                        : `<div class="space-y-2">
                    <button type="button" class="js-profile-sync-qr-signal flex w-full min-h-10 items-center justify-center gap-2 rounded-lg border-2 border-violet-300 bg-violet-50 px-2 py-2 text-sm font-bold text-violet-800 shadow-sm hover:border-violet-400 hover:bg-violet-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:border-violet-700 dark:bg-violet-900/20 dark:text-violet-300 dark:hover:border-violet-600 dark:hover:bg-violet-900/30 dark:focus-visible:ring-offset-slate-900" aria-label="${escAttr(ui.syncLoginQrSignalAlt || 'Show QR for mobile login')}">
                        <span class="text-base leading-none" aria-hidden="true">📱</span>
                        <span>${escHtml(ui.syncLoginQrSignalAlt || 'QR for mobile')}</span>
                    </button>
                    <label class="block text-left text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500" for="profile-sync-secret">${escHtml(ui.syncLoginYourSecretLabel || 'Secret')}</label>
                    <div class="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                        <input type="text" id="profile-sync-secret" autocomplete="off" spellcheck="false" value="${escAttr(this._profileSyncSecretDraft || '')}" placeholder="${escAttr(ui.syncLoginSecretPlaceholder || '')}" class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-mono text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                        <button type="button" class="js-profile-sync-submit-login min-h-10 w-full shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 sm:w-auto">${escHtml(ui.syncLoginSubmitWithSecret || ui.syncLoginSubmitLogin || 'Continue')}</button>
                    </div>
                    <div class="flex justify-center pt-0.5">
                        <button type="button" class="js-profile-sync-pick-txt text-[11px] font-medium text-slate-500 underline decoration-slate-300 decoration-dotted underline-offset-2 hover:text-sky-600 dark:text-slate-400 dark:decoration-slate-600 dark:hover:text-sky-400 border-0 bg-transparent cursor-pointer px-2 py-1">${escHtml(ui.syncLoginAltFile || 'Saved backup file')}</button>
                    </div>
                </div>
                <input type="file" id="profile-sync-file-txt" class="hidden" accept=".txt,text/plain" />`
                }
            </div>`
                : '';

        const sessReveal = store.passkeySession;
        const sessionTriadReveal =
            passkeyAuthed && isSyncAccount && sessReveal
                ? {
                      username: String(sessReveal.username || passkeyUsername || '').trim(),
                      plainSecret: String(sessReveal.syncSecretPlain || '').trim(),
                      qrDataUrl: String(sessReveal.syncQrDataUrl || '').trim()
                  }
                : null;

        const profileSyncAccessKey =
            passkeyAuthed && isSyncAccount && sessionTriadReveal
                ? `<div class="mt-3 border-t border-emerald-200/80 pt-3 dark:border-emerald-800/60">
                ${syncLoginTriadMarkup(ui, sessionTriadReveal, escHtml, escAttr, {
                    profileMasking: true,
                    codeRevealed: this.state.syncAccessCodeVisible,
                    qrRevealed: this.state.syncAccessQrVisible
                })}
            </div>`
                : '';

        const profileSyncDangerZone =
            passkeyAuthed && isSyncAccount
                ? `<div id="profile-sync-risk-section" class="scroll-mt-4 rounded-lg border-2 border-amber-300 bg-amber-50/70 p-3 text-left dark:border-amber-800/80 dark:bg-amber-950/30">
                <p class="m-0 text-[10px] font-black uppercase tracking-widest text-amber-950 dark:text-amber-200">${escHtml(ui.profileSyncRiskZoneTitle || 'Sensitive actions')}</p>
                <p class="mt-1.5 text-[11px] leading-snug text-amber-950/85 dark:text-amber-100/90">${escHtml(ui.profileSyncRiskZoneLead || '')}</p>
                <div class="mt-3 flex flex-col gap-2">
                    <button type="button" id="profile-sync-rotate" class="min-h-10 w-full rounded-lg border-2 border-amber-600/70 bg-white px-3 py-2 text-sm font-bold text-amber-950 shadow-sm dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${this.state.passkeyBusy ? 'cursor-not-allowed opacity-50' : ''}" ${this.state.passkeyBusy ? 'disabled' : ''} title="${escAttr(ui.syncLoginProfileAuthedLead || '')}">${escHtml(ui.syncLoginRotateCta || 'New QR, code & file')}</button>
                    <button type="button" id="profile-sync-delete-account" class="min-h-10 w-full rounded-lg border-2 border-red-400 bg-red-50 px-3 py-2 text-sm font-bold text-red-800 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${this.state.passkeyBusy ? 'cursor-not-allowed opacity-50' : ''}" ${this.state.passkeyBusy ? 'disabled' : ''}>${escHtml(ui.syncLoginDeleteAccountButton || 'Delete online account')}</button>
                </div>
            </div>`
                : '';

        const authedFooterRow = passkeyAuthed
            ? `<div class="mt-3">
                <button type="button" id="profile-passkey-logout" class="min-h-10 w-full rounded-lg border-2 border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50 dark:border-red-900/70 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900">${escHtml(ui.passkeyLogout || 'Sign out')}</button>
            </div>`
            : '';

        const passkeyAccountSection = `
                    <div id="profile-passkey-section" class="mb-6 scroll-mt-4 border-b border-slate-100 pb-6 text-left dark:border-slate-800 ${embedded ? 'px-0' : ''}">
                        <div class="${passkeyCardShell} p-3 md:p-4">
                            <h3 class="m-0 text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200 sm:text-xs">🔐 ${escHtml(ui.syncLoginSectionTitle || ui.passkeySectionHeading || ui.passkeyAccountTitle || 'Online account')}</h3>
                            ${unifiedStatusRow}
                            ${profileSyncLoginForm}
                            ${profileSyncAccessKey}
                            ${passkeyError}
                            ${authedFooterRow}
                        </div>
                    </div>`;

        const profileDirty =
            String(this.state.tempUsername || '').trim() !== String(g.username || '').trim() ||
            String(this.state.tempAvatar || '') !== String(g.avatar || '');
        const saveProfileBtnClass = profileDirty
            ? 'border-2 border-sky-600 bg-sky-600 text-white shadow-md hover:bg-sky-500 hover:border-sky-500 active:translate-y-px focus-visible:ring-sky-500'
            : 'cursor-default border border-slate-400 bg-slate-300 text-slate-600 shadow-inner dark:border-slate-600 dark:bg-slate-600 dark:text-slate-300';

        const seedsCount = collectedItems.length;
        const seedsBadgeTitle =
            seedsCount === 0
                ? String(ui.gardenEmpty || '').trim() || String(ui.gardenTitle || '').trim()
                : String(ui.gardenTitle || 'Seeds').trim();
        const seedsBadgeAria = `${seedsCount}. ${seedsBadgeTitle}`;

        const mainScroll = `
                <div class="${scrollClass}">
                    
                    <!-- PROFILE (name + avatar) -->
                    <div class="mb-8 pb-8 border-b border-slate-100 dark:border-slate-800 ${embedPadX}">
                        <div class="relative inline-block mb-4">
                            <button type="button" id="btn-avatar-picker" class="w-24 h-24 bg-slate-50 dark:bg-slate-800 rounded-full mx-auto flex items-center justify-center text-5xl relative group transition-transform hover:scale-105 shadow-sm border-2 border-slate-100 dark:border-slate-700">
                                <span id="avatar-display">${this.state.tempAvatar}</span>
                                <div class="absolute inset-0 bg-black/10 dark:bg-black/40 rounded-full flex items-center justify-center text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[1px]">
                                    ✏️
                                </div>
                            </button>
                            <!-- Picker -->
                            <div id="emoji-picker" class="absolute left-1/2 top-full z-50 mt-2 hidden max-h-[min(18rem,50vh)] w-[min(20rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-0 text-left shadow-2xl animate-in duration-200 zoom-in-95 custom-scrollbar dark:border-slate-700 dark:bg-slate-800 md:h-72 md:max-h-none md:w-80" role="dialog" aria-label="${escAttr(ui.profileEmojiPickerAria || 'Choose emoji')}">
                                ${Object.entries(EMOJI_DATA).map(([cat, emojis]) => `
                                    <div class="sticky top-0 z-10 border-b border-slate-100 bg-white px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-400 dark:border-slate-700 dark:bg-slate-800">${cat}</div>
                                    <div class="grid grid-cols-4 gap-1 p-2 sm:grid-cols-6">
                                        ${emojis.map(e => `<button type="button" class="emoji-btn flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 text-2xl transition-colors hover:bg-slate-100 dark:hover:bg-slate-700">${e}</button>`).join('')}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        
                        <input id="inp-username" value="${escAttr(this.state.tempUsername)}" placeholder="${escAttr(ui.usernamePlaceholder || '')}" aria-label="${escAttr(ui.profileIdentity || ui.usernamePlaceholder || 'Display name')}" class="mx-auto w-full max-w-xs border-b-2 border-sky-500/50 bg-transparent text-center text-2xl font-black text-slate-800 outline-none transition-all placeholder:text-slate-300 focus:border-sky-500 focus:ring-0 dark:text-white dark:placeholder:text-slate-600">
                        
                        <div class="flex items-center justify-center gap-2 mt-4 mb-4 flex-wrap">
                            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-bold">
                                💧 ${g.streak} ${ui.days}
                            </span>
                            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 text-xs font-bold">
                                ☀️ ${g.xp} XP
                            </span>
                            <span id="profile-seeds-badge" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-xs font-bold ${seedsCount === 0 ? 'opacity-90' : ''}" title="${escAttr(seedsBadgeTitle)}" aria-label="${escAttr(seedsBadgeAria)}">
                                🌰 ${seedsCount}
                            </span>
                        </div>

                        <button type="button" id="btn-save-profile" ${profileDirty ? '' : 'disabled'} class="min-h-[44px] rounded-xl px-8 py-3 text-sm font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${profileDirty ? 'focus-visible:ring-sky-500' : 'focus-visible:ring-slate-400'} ${saveProfileBtnClass}">
                            ${escHtml(ui.profileUpdateDisplayButton || ui.saveProfile)}
                        </button>
                    </div>

                    ${passkeyAccountSection}

                    ${recoverySection}

                    <!-- DATA MANAGEMENT (Backpack) -->
                    <div id="profile-backpack-section" class="mb-8 scroll-mt-4 ${embedPadX}">
                        <div class="bg-slate-50 dark:bg-slate-800/30 rounded-2xl p-6 border border-slate-100 dark:border-slate-800">
                            <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center justify-center gap-2">
                                💾 ${escHtml(ui.backpackTitle || 'Save & Backup')}
                            </h3>
                            <p class="text-xs text-slate-500 dark:text-slate-400 mb-6 px-2 leading-relaxed">
                                ${escHtml(
                                    !passkeyAuthed
                                        ? ui.profileBackpackDescLocalOnly ||
                                              ui.backpackDesc ||
                                              'Your progress stays in this browser. Export JSON before clearing the browser or switching devices.'
                                        : cloudProgressOn
                                          ? ui.profileBackpackDescCloudOn ||
                                                ui.backpackDesc ||
                                                'Cloud sync is on. Keep a JSON export if you want your own file copy.'
                                          : ui.profileBackpackDescCloudOff ||
                                                ui.backpackDesc ||
                                                'You are signed in but cloud sync is off—progress is mostly on this device. Export to be safe.'
                                )}
                            </p>
                            
                            <input type="file" id="file-importer" class="hidden" accept=".json,application/json">
                            <div class="flex flex-col gap-3">
                                <button type="button" id="btn-export-progress" class="min-h-[44px] w-full rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-base font-bold text-green-700 shadow-sm transition-all hover:border-green-300 hover:bg-green-100 active:scale-[0.99] dark:border-green-800 dark:bg-green-900/10 dark:text-green-400 dark:hover:border-green-600 dark:hover:bg-green-900/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900">
                                    <span class="mr-2" aria-hidden="true">💾</span>${escHtml(ui.backupBtn || 'Save to File')}
                                </button>
                                <button type="button" id="btn-import-file" class="min-h-[44px] w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-base font-bold text-slate-700 shadow-sm transition-all hover:border-sky-400 hover:text-sky-600 active:scale-[0.99] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-sky-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900">
                                    <span class="mr-2" aria-hidden="true">📥</span>${escHtml(ui.profileImportBackupButton || ui.restoreBtn || 'Import file')}
                                </button>
                            </div>

                            ${
                                !passkeyAuthed || !cloudProgressOn
                                    ? `<p class="mt-3 mb-0 text-center text-xs leading-relaxed text-slate-500 dark:text-slate-500">${escHtml(ui.profileBackpackFileHint || ui.profileSyncBlurb || '')}</p>`
                                    : ''
                            }
                        </div>
                    </div>
                    
                    <div class="mt-8 flex flex-1 flex-col gap-3 ${embedPadX}">
                        ${
                            !passkeyAuthed
                                ? `<div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left dark:border-slate-700 dark:bg-slate-800/50">
                            <p class="m-0 text-xs font-semibold text-slate-800 dark:text-slate-100">${escHtml(ui.profileLocalOnlyFooterTitle || 'This device only')}</p>
                            <p class="mt-1.5 text-[11px] leading-snug text-slate-600 dark:text-slate-400">${escHtml(ui.profileLocalOnlyFooterLead || '')}</p>
                            <button type="button" id="profile-local-wipe-btn" class="mt-3 min-h-[44px] w-full rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-800 transition-colors hover:border-red-400 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200 dark:hover:border-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900">${escHtml(ui.profileLocalWipeButton || ui.privacyWipeLocalButton)}</button>
                        </div>`
                                : ''
                        }
                        ${profileSyncDangerZone}
                        <button type="button" id="btn-open-privacy" class="min-h-[44px] w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-base font-bold text-slate-800 transition-colors hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:hover:border-slate-600 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900">${escHtml(ui.profilePrivacyAndDataButton || ui.syncPrivacyNote)}</button>
                    </div>
                </div>`;

        if (embedded) {
            this.innerHTML = `
            <div class="arborito-profile-embed-root flex flex-col flex-1 min-h-0 w-full h-full min-w-0 overflow-hidden bg-white dark:bg-slate-900">
                ${mainScroll}
            </div>`;
        } else {
            const deskShell = mob
                ? `bg-white dark:bg-slate-900 w-full min-w-0 max-w-none flex-1 min-h-0 h-[calc(100dvh-var(--arborito-mob-dock-clearance,4.25rem)-env(safe-area-inset-top,0px))] mt-[env(safe-area-inset-top,0px)] rounded-none shadow-none relative overflow-hidden flex flex-col border-0 cursor-auto`
                : `arborito-float-modal-card bg-white dark:bg-slate-900 rounded-3xl shadow-2xl relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto`;
            const bodyWrap = mob
                ? `${mobileChrome}${mainScroll}`
                : `${mobileChrome}<div class="arborito-float-modal-card__inner min-h-0">${mainScroll}</div>`;
            const backdropLayout = mob
                ? 'flex flex-col items-stretch justify-stretch p-0 arborito-modal--mobile'
                : 'flex items-center justify-center p-4';
            this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] ${backdropLayout} bg-slate-950 animate-in fade-in arborito-modal-root">
            <div class="${deskShell}">
                ${bodyWrap}
            </div>
        </div>`;
        }

        this.bindEvents();
        this.updateView();
        this.updateProfileDirtyUi();

        if (focusedId) {
            const el = document.getElementById(focusedId);
            if (el) {
                el.focus({ preventScroll: true });
                if (selectionStart !== null && el.setSelectionRange) {
                    el.setSelectionRange(selectionStart, selectionEnd);
                }
            }
        }
    }
    
    bindEvents() {
        this.querySelectorAll('.btn-close').forEach((b) => {
            b.onclick = () => this.close();
        });

        const btnPrivacy = this.querySelector('#btn-open-privacy');
        if (btnPrivacy) {
            btnPrivacy.onclick = () => {
                const cur = store.value.modal;
                const fromSheet =
                    this.hasAttribute('embed') || !!(cur && typeof cur === 'object' && cur.fromMobileMore);
                store.setModal(fromSheet ? { type: 'privacy', fromMobileMore: true } : 'privacy');
            };
        }

        const profileEnableCloudSync = (opts = {}) => {
            const showToast = opts.showToast !== false;
            store.userStore.state.cloudProgressSync = true;
            store.userStore.persist();
            try {
                store.maybeSyncNetworkProgress(store.userStore.getPersistenceData());
            } catch {
                /* ignore */
            }
            if (showToast) {
                store.notify(store.ui.welcomeAccountEnabledToast || store.ui.welcomeCloudSyncOnLabel || 'On', false);
            }
        };
        const profileAfterSignedIn = () => profileEnableCloudSync();

        const nameInp = this.querySelector('#inp-username');
        const secInp = this.querySelector('#profile-sync-secret');
        this.querySelectorAll('.js-profile-sync-mode').forEach((btn) => {
            btn.onclick = () => {
                this._profileSyncMode = btn.getAttribute('data-mode') === 'create' ? 'create' : 'login';
                this.state.passkeyError = '';
                this.render();
            };
        });
        const tryProfileTypedLogin = async () => {
            const ui = store.ui;
            const u = ((nameInp && nameInp.value) || this.state.tempUsername || '').trim();
            const s = ((secInp && secInp.value) || this._profileSyncSecretDraft || '').trim();
            if (!u || !s) {
                this.state.passkeyError = ui.syncLoginNeedUserSecret || 'Enter username and secret.';
                this.render();
                return;
            }
            try {
                await store.signInWithSyncSecret(u, s);
                profileAfterSignedIn();
                this.render();
            } catch (e) {
                this.state.passkeyError = String((e && e.message) || e);
                this.render();
            }
        };
        this.querySelectorAll('.js-profile-sync-submit-login').forEach((btn) => {
            btn.onclick = () => {
                void tryProfileTypedLogin();
            };
        });
        if (secInp) {
            secInp.addEventListener('input', () => {
                this._profileSyncSecretDraft = secInp.value;
                if (this.state.passkeyError) this.state.passkeyError = '';
            });
            secInp.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' || e.shiftKey) return;
                e.preventDefault();
                void tryProfileTypedLogin();
            });
        }
        // QR Signaling: desktop displays QR, mobile authorizes
        this.querySelectorAll('.js-profile-sync-qr-signal').forEach((b) => {
            b.onclick = async () => {
                const ui = store.ui;
                this.state.passkeyBusy = true;
                this.state.passkeyError = '';
                this.render();
                try {
                    // Start QR signaling session
                    const { sessionId, qrDataUrlPromise } = await store.startQrSignalingSession();
                    const qrDataUrl = await qrDataUrlPromise;

                    // Show modal with QR
                    store.setModal({
                        type: 'qr-signal-login',
                        sessionId,
                        qrDataUrl
                    });
                } catch (e) {
                    this.state.passkeyError = String((e && e.message) || e);
                } finally {
                    this.state.passkeyBusy = false;
                }
                this.render();
            };
        });

        const pTxt = this.querySelector('#profile-sync-file-txt');
        this.querySelectorAll('.js-profile-sync-pick-txt').forEach((b) => {
            b.onclick = () => (pTxt && pTxt.click)();
        });
        if (pTxt) {
            pTxt.addEventListener('change', async () => {
                const f = (pTxt.files ? pTxt.files[0] : undefined);
                pTxt.value = '';
                if (!f) return;
                try {
                    const raw = await f.text();
                    const parsed = parseSyncLoginFromExportFile(raw);
                    if (!parsed) {
                        store.notify(store.ui.syncLoginFileUnreadable || 'Invalid file.', true);
                        return;
                    }
                    await store.signInWithSyncSecret(parsed.username, parsed.secret);
                    profileAfterSignedIn();
                    this.render();
                } catch (e) {
                    this.state.passkeyError = String((e && e.message) || e);
                    this.render();
                }
            });
        }
        const regBtn = this.querySelector('#profile-sync-register');
        if (regBtn) {
            regBtn.onclick = async () => {
                const ui = store.ui;
                const u = ((nameInp && nameInp.value) || this.state.tempUsername || '').trim();
                if (!u) {
                    this.state.passkeyError = ui.passkeyUsernameRequired || 'Enter a username first.';
                    this.render();
                    return;
                }
                this.state.passkeyBusy = true;
                this.state.passkeyError = '';
                regBtn.disabled = true;
                try {
                    const avatar = this.state.tempAvatar;
                    if (u && (u !== (store.value.gamification && store.value.gamification.username) || avatar !== (store.value.gamification && store.value.gamification.avatar))) {
                        store.updateUserProfile(u, avatar);
                    }
                    await store.registerSyncLoginAccount(u);
                    this.state.syncAccessCodeVisible = false;
                    this.state.syncAccessQrVisible = false;
                    profileEnableCloudSync({ showToast: false });
                } catch (e) {
                    this.state.passkeyError = String((e && e.message) || e);
                } finally {
                    this.state.passkeyBusy = false;
                }
                this.render();
            };
        }
        const rotBtn = this.querySelector('#profile-sync-rotate');
        if (rotBtn) {
            rotBtn.onclick = async () => {
                if (this.state.passkeyBusy) return;
                const ui = store.ui;
                if (
                    !(await store.confirm(
                        ui.syncLoginRotateWarnBody ||
                            'Old QR, code, and backup file stop working. Other devices must sign in again with the new set.',
                        ui.syncLoginRotateWarnTitle || 'Generate new secret?',
                        true
                    ))
                ) {
                    return;
                }
                this.state.passkeyBusy = true;
                this.state.passkeyError = '';
                rotBtn.disabled = true;
                try {
                    await store.rotateSyncLoginSecret();
                    this.state.syncAccessCodeVisible = false;
                    this.state.syncAccessQrVisible = false;
                } catch (e) {
                    this.state.passkeyError = String((e && e.message) || e);
                } finally {
                    this.state.passkeyBusy = false;
                }
                this.render();
            };
        }

        const delAcc = this.querySelector('#profile-sync-delete-account');
        if (delAcc) {
            delAcc.onclick = async () => {
                if (this.state.passkeyBusy) return;
                const ui = store.ui;
                if (
                    !(await store.confirm(
                        ui.syncLoginDeleteConfirm ||
                            'Removes online sign-in for this name. Local progress on this device stays.',
                        ui.syncLoginDeleteTitle || 'Delete online account?',
                        true
                    ))
                ) {
                    return;
                }
                if (
                    !(await store.confirm(
                        ui.syncLoginDeleteConfirmFinal || 'This cannot be undone. Continue?',
                        ui.syncLoginDeleteTitle || 'Delete online account?',
                        true
                    ))
                ) {
                    return;
                }
                this.state.passkeyBusy = true;
                this.state.passkeyError = '';
                delAcc.disabled = true;
                try {
                    await store.deleteSyncLoginOnlineAccount();
                    this.state.syncAccessCodeVisible = false;
                    this.state.syncAccessQrVisible = false;
                } catch (e) {
                    this.state.passkeyError = String((e && e.message) || e);
                } finally {
                    this.state.passkeyBusy = false;
                }
                this.render();
            };
        }

        bindSyncLoginTriadControls(this, store);

        this.querySelectorAll('.js-profile-sync-code-toggle').forEach((btn) => {
            btn.onclick = () => {
                this.state.syncAccessCodeVisible = true;
                this.lastRenderKey = null;
                this.render();
            };
        });
        this.querySelectorAll('.js-profile-sync-qr-toggle').forEach((btn) => {
            btn.onclick = () => {
                this.state.syncAccessQrVisible = !this.state.syncAccessQrVisible;
                this.lastRenderKey = null;
                this.render();
            };
        });

        const localWipe = this.querySelector('#profile-local-wipe-btn');
        if (localWipe) {
            localWipe.onclick = () => store.wipeAllLocalDataOnThisDeviceInteractive();
        }

        const passkeyLogout = this.querySelector('#profile-passkey-logout');
        if (passkeyLogout) {
            passkeyLogout.onclick = async () => {
                if (this.state.passkeyBusy) return;
                const ok = await store.confirm(
                    store.ui.profileLogoutClearsLocalConfirm ||
                        'Sign out and delete local Arborito data from this browser?',
                    store.ui.profileLogoutClearsLocalTitle || store.ui.passkeyLogout || 'Sign out',
                    true
                );
                if (!ok) return;
                this.state.passkeyBusy = true;
                this.state.passkeyError = '';
                this.render();
                await store.wipeAllLocalDataOnThisDevice();
            };
        }

        this.querySelector('#btn-avatar-picker').onclick = (e) => {
            e.stopPropagation();
            this.state.showEmojiPicker = !this.state.showEmojiPicker;
            this.updateView();
        };

        this.querySelectorAll('.emoji-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                this.state.tempAvatar = e.currentTarget.textContent;
                this.state.showEmojiPicker = false;
                this.updateView();
                this.updateProfileDirtyUi();
            };
        });
        
        const inpUsername = this.querySelector('#inp-username');
        if (inpUsername) {
            inpUsername.oninput = (e) => {
                this.state.tempUsername = e.target.value;
                this.updateProfileDirtyUi();
            };
        }

        const btnSave = this.querySelector('#btn-save-profile');
        if (btnSave) {
            btnSave.onclick = () => {
                if (btnSave.disabled) return;
                const username = this.state.tempUsername.trim();
                const avatar = this.state.tempAvatar;
                store.updateUserProfile(username, avatar);
                this.state.tempUsername = ((store.value.gamification && store.value.gamification.username) != null ? store.value.gamification.username : username);
                this.state.tempAvatar = ((store.value.gamification && store.value.gamification.avatar) != null ? store.value.gamification.avatar : avatar);
                this.lastRenderKey = null;
                this.render();
            };
        }

        const btnExport = this.querySelector('#btn-export-progress');
        if (btnExport) btnExport.onclick = () => store.downloadProgressFile();

        const btnImportFile = this.querySelector('#btn-import-file');
        const fileInput = this.querySelector('#file-importer');
        if (btnImportFile && fileInput) {
            btnImportFile.onclick = () => fileInput.click();
            fileInput.onchange = async (e) => {
                const file = (e.target.files ? e.target.files[0] : undefined);
                fileInput.value = '';
                if (!file) return;
                const ui = store.ui;
                const ok = await store.confirm(
                    ui.profileImportReplaceBody ||
                        'Replace current progress and profile data on this device with the contents of this file?',
                    ui.profileImportReplaceTitle || 'Replace with imported file?',
                    true
                );
                if (!ok) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                    if (store.importProgress(event.target.result)) {
                        store.alert(store.ui.importSuccess);
                        this.close();
                    } else {
                        store.alert(store.ui.importError);
                    }
                };
                reader.readAsText(file);
            };
        }

        const openRecovery = this.querySelector('#profile-open-recovery-assistant');
        if (openRecovery) {
            openRecovery.onclick = () => store.openRecoveryAssistant();
        }

        const genCodes = this.querySelector('#profile-gen-backup-codes');
        if (genCodes) {
            genCodes.onclick = async () => {
                if (this._recoveryBusy) return;
                const ui = store.ui;
                const ok = await store.confirm(
                    ui.recoveryCodesReplaceWarning,
                    ui.recoveryCodesConfirmTitle || ui.recoveryGenerateCodes,
                    true
                );
                if (!ok) return;
                this._recoveryBusy = true;
                this.lastRenderKey = null;
                this.render();
                try {
                    this._recoveryPlainCodes = await store.generateRecoveryBackupCodesForAuthedUser();
                    store.notify(ui.recoveryCodesOnceTitle || 'Codes generated.', false);
                } catch (e) {
                    store.alert(String((e && e.message) || e));
                } finally {
                    this._recoveryBusy = false;
                    this.lastRenderKey = null;
                    this.render();
                }
            };
        }

        const exportKit = this.querySelector('#profile-export-recovery-kit');
        if (exportKit) {
            exportKit.onclick = async () => {
                if (this._recoveryBusy) return;
                const ui = store.ui;
                const passphrase = await store.prompt(
                    ui.recoveryExportPassphraseBody,
                    ui.recoveryExportPassphrasePlaceholder,
                    ui.recoveryExportPassphraseTitle
                );
                if (!String(passphrase || '').trim()) return;
                this._recoveryBusy = true;
                this.lastRenderKey = null;
                this.render();
                try {
                    const json = await store.createRecoveryKitEncryptedJson(String(passphrase).trim());
                    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    const u = (store.passkeySession && store.passkeySession.username) || 'account';
                    a.download = `arborito-recovery-${String(u).replace(/[^\w.-]+/g, '_')}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    store.notify(ui.recoveryDownloadKit || 'Downloaded.', false);
                } catch (e) {
                    store.alert(String((e && e.message) || e));
                } finally {
                    this._recoveryBusy = false;
                    this.lastRenderKey = null;
                    this.render();
                }
            };
        }

        const copyCodes = this.querySelector('#profile-recovery-codes-copy');
        if (copyCodes) {
            copyCodes.onclick = async () => {
                const lines = this._recoveryPlainCodes || [];
                if (!lines.length) return;
                try {
                    await navigator.clipboard.writeText(lines.join('\n'));
                    store.notify(store.ui.recoveryCodesCopied || 'Copied.', false);
                } catch {
                    store.alert(lines.join('\n'));
                }
            };
        }

        const codesDone = this.querySelector('#profile-recovery-codes-done');
        if (codesDone) {
            codesDone.onclick = () => {
                this._recoveryPlainCodes = null;
                this.lastRenderKey = null;
                this.render();
            };
        }

    }
}
customElements.define('arborito-modal-profile', ArboritoModalProfile);
