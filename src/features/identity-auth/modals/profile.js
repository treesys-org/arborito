
import { store } from '../../../core/store.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { modalHeroHtml } from '../../../shared/ui/modal-hero.js';
import { modalShellHtml } from '../../../shared/ui/modal-shell.js';
import { bindCloseTaps } from '../../../shared/ui/mobile-tap.js';
import { formatUserHandle } from '../../../shared/lib/user-handle.js';
import { escHtml } from '../../../shared/lib/html-escape.js';
import { identityMixin } from './profile-mixins/identity-mixin.js';
import { signinMixin } from './profile-mixins/signin-mixin.js';
import { toolsMixin } from './profile-mixins/tools-mixin.js';
import { prefsMixin } from './profile-mixins/prefs-mixin.js';
/* Celebration preferences (sound / effects) moved out of the Profile sheet — see
 * `components/modals/celebration-prefs.js`. */

class ArboritoModalProfile extends HTMLElement {
    constructor() {
        super();
        this.state = {
            showEmojiPicker: false,
            tempAvatar: store.value.gamification.avatar || '👤',
            tempUsername: store.value.gamification.username || '',
            authBusy: false,
            authError: '',
            /** Sync access key: code hidden as bullets until user taps “Show code”. */
            syncAccessCodeVisible: false,
            /** Profile: QR hidden until user taps “Show QR”. */
            syncAccessQrVisible: false,
            /** Suggested alternative usernames (when current is taken). */
            usernameSuggestions: [],
            /** Username last checked for suggestions, to avoid duplicate work. */
            checkedUsername: ''
        };
        this.lastRenderKey = null;
        /** @type {'login'|'create'} */
        this._profileSyncMode = 'create';
        this._profileSyncSecretDraft = '';
        this._lastProfileDirty = false;
        this._suggestTimer = null;
    }

    connectedCallback() {
        if (!this.hasAttribute('embed') && typeof document !== 'undefined' && shouldShowMobileUI()) {
            document.documentElement.classList.add('arborito-profile-modal-open');
        }
        /* Honor `setModal({ type: 'profile', focus: 'signin' })` — opens the
           sign-in tab pre-selected. Used by the Trees-picker CTA for fresh
           devices, and any other future "send the user straight to sign in"
           entry point. */
        try {
            const m = store.value && store.value.modal;
            const alreadySignedIn = !!(store.isSignedIn && store.isSignedIn());
            if (m && typeof m === 'object' && m.focus === 'signin' && !alreadySignedIn) {
                this._profileSyncMode = 'login';
            }
        } catch {
            /* ignore */
        }
        this.render();
        /* render()'s own deep-equality cache (`lastRenderKey`) covers the cheap
         * skip-when-nothing-changed case; let every state-change reach it so
         * sign-in / sign-out / username / cloud-sync flips repaint the sheet. */
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
        if (this._suggestTimer) {
            clearTimeout(this._suggestTimer);
            this._suggestTimer = null;
        }
        document.removeEventListener('click', this.pickerListener);
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
            authBusy: this.state.authBusy,
            authError: this.state.authError,
            accountUsername: (store.authSession && store.authSession.username) || '',
            signedIn: !!(store.isSignedIn && store.isSignedIn()),
            syncMat:
                String((store.authSession && store.authSession.syncSecretPlain) || '').length +
                String((store.authSession && store.authSession.syncQrDataUrl) || '').length,
            cloudProgressSync: !!(store.userStore && store.userStore.state)?.cloudProgressSync,
            profileFocus,
            mob,
            embedded,
            profileSyncMode: this._profileSyncMode,
            profileSyncSecretLen: String((this._profileSyncSecretDraft && this._profileSyncSecretDraft.length) || 0),
            profileDirty:
                !!String(g.username || '').trim() && (
                    String(this.state.tempUsername || '').trim() !== String(g.username || '').trim() ||
                    String(this.state.tempAvatar || '') !== String(g.avatar || '')
                ),
            hasSavedProfile: !!String(g.username || '').trim(),
            syncCodeVis: this.state.syncAccessCodeVisible,
            syncQrVis: this.state.syncAccessQrVisible
        });

        if (renderKey === this.lastRenderKey) return;
        this.lastRenderKey = renderKey;

        const focusedId = document.activeElement ? document.activeElement.id : null;
        const selectionStart = document.activeElement ? document.activeElement.selectionStart : null;
        const selectionEnd = document.activeElement ? document.activeElement.selectionEnd : null;

        const mobileChrome = modalHeroHtml(ui, {
            mobile: mob,
            title: escHtml(ui.navProfile || 'Profile'),
            leadingIcon: mob ? '<span class="text-2xl shrink-0 leading-none" aria-hidden="true">👤</span>' : '',
            tagClass: 'btn-close-profile',
            trailingSpacer: mob,
        });

        const scrollClass = embedded
            ? 'px-0 pt-2 pb-4 flex-1 min-h-0 overflow-y-auto custom-scrollbar relative flex flex-col'
            : '';
        const embedPadX = embedded ? 'px-3' : '';
        const modalScrollClass = mob
            ? 'profile-modal-scroll profile-modal-scroll--mobile flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]'
            : 'profile-modal-scroll profile-modal-scroll--desktop overflow-y-auto custom-scrollbar';

        const signedIn = !!(store.isSignedIn && store.isSignedIn());
        const modeCr = this._profileSyncMode === 'create';
        const modePl = this._profileSyncMode !== 'create';

        const profileSessionPanel = this._renderSessionPanelHtml(ui);

        const hasSavedProfile = !!String(g.username || '').trim();
        const profileDirty =
            hasSavedProfile && (
                String(this.state.tempUsername || '').trim() !== String(g.username || '').trim() ||
                String(this.state.tempAvatar || '') !== String(g.avatar || '')
            );

        const seedsCount = collectedItems.length;
        const seedsBadgeTitle =
            seedsCount === 0
                ? String(ui.gardenEmpty || '').trim() || String(ui.gardenTitle || '').trim()
                : String(ui.gardenTitle || 'Seeds').trim();
        const seedsBadgeAria = `${seedsCount}. ${seedsBadgeTitle}`;

        const profileFooterHtml = this._renderToolsFooterHtml(ui, signedIn);
        const identityWhoHtml = this._renderIdentityWhoHtml(ui, g, profileDirty, seedsCount, seedsBadgeTitle, seedsBadgeAria);

        const sheetClass = `profile-sheet${signedIn ? ' profile-sheet--authed' : ''}${embedded ? ' profile-sheet--embedded' : ''}${mob && !embedded ? ' profile-sheet--mobile' : ''}${!mob && !embedded ? ' profile-sheet--desktop' : ''}${!signedIn && modeCr ? ' profile-sheet--register' : ''}${!signedIn && modePl ? ' profile-sheet--login' : ''}`;

        const sheetInner = mob || embedded
            ? `
                        <section class="profile-mob-hero">
                            <div class="profile-sheet__who profile-sheet__who--mob">
                                ${identityWhoHtml}
                            </div>
                        </section>
                        <section class="profile-mob-panel profile-mob-panel--account">
                            ${profileSessionPanel}
                        </section>
                        <section class="profile-mob-panel profile-mob-panel--tools">
                            <div id="profile-backpack-section" class="scroll-mt-4">
                                ${profileFooterHtml}
                            </div>
                        </section>`
            : `
                        <section class="profile-desk-hero">
                            <div class="profile-sheet__who profile-sheet__who--desk">
                                ${identityWhoHtml}
                            </div>
                        </section>
                        <div class="profile-desk-grid">
                            <section class="profile-desk-panel profile-desk-panel--account">
                                ${profileSessionPanel}
                            </section>
                            <section class="profile-desk-panel profile-desk-panel--tools">
                                <div id="profile-backpack-section" class="scroll-mt-4">
                                    ${profileFooterHtml}
                                </div>
                            </section>
                        </div>`;

        const mainScroll = embedded
            ? `<div class="${scrollClass}">
                    <div class="${sheetClass} ${embedPadX}">${sheetInner}</div>
                </div>`
            : `<div class="${modalScrollClass}">
                    <div class="${sheetClass} ${embedPadX}">${sheetInner}</div>
                </div>`;

        if (embedded) {
            this.innerHTML = `
            <div class="arborito-profile-embed-root flex flex-col flex-1 min-h-0 w-full h-full min-w-0 overflow-hidden bg-slate-50 dark:bg-slate-950">
                ${mainScroll}
            </div>`;
        } else {
            const bodyWrap = mob
                ? `<div class="profile-modal-body flex flex-col flex-1 min-h-0 h-full overflow-hidden">${mobileChrome}${mainScroll}</div>`
                : `${mobileChrome}${mainScroll}`;
            this.innerHTML = modalShellHtml({
                bodyHtml: bodyWrap,
                mobile: mob,
                layout: 'dock',
                panelSize: mob ? undefined : 'lg auto-h',
                panelClass: mob ? '' : 'arborito-profile-modal-shell',
            });
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
        bindCloseTaps(this, () => this.close(), '.btn-close-profile');
        this._bindToolsEvents();
        this._bindSigninEvents();
        this._bindIdentityEvents();
    }
}
Object.assign(ArboritoModalProfile.prototype, identityMixin, signinMixin, toolsMixin, prefsMixin);
customElements.define('arborito-modal-profile', ArboritoModalProfile);
