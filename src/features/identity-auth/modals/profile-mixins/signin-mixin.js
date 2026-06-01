import { store } from '../../../../core/store.js';
import { escHtml, escAttr } from '../../../../shared/lib/html-escape.js';
import { syncLoginTriadMarkup, bindSyncLoginTriadControls } from '../../sync-login-triad-html.js';
import { parseSyncLoginFromExportFile } from '../../sync-login-secret.js';
import { humanizeAuthError } from '../../sync-login-error-humanize.js';
import { publishWithTimeout } from '../../sync-login-publish-timeout.js';
import {
    suggestUsernamesFor,
    checkUsernameAvailability
} from '../../sync-login-username-suggest.js';

/** Sync-login flow surfaced inside the Profile sheet: the tabbed
 * register / sign-in form, the username-availability suggestion chips, the
 * post-sign-in "share these credentials" triad (QR / code / file), and all of
 * the related event wiring. Cross-mixin calls (`_renderUnifiedStatusRow`,
 * `_renderAdvancedBlockHtml`, `_profileEnableCloudSync`,
 * `_profileAfterSignedIn`) resolve via the shared prototype. */
export const signinMixin = {
    /** Schedule a username availability check + alternative suggestions. */
    _scheduleUsernameCheck() {
        if (this._suggestTimer) {
            clearTimeout(this._suggestTimer);
            this._suggestTimer = null;
        }
        const raw = String(this.state.tempUsername || '').trim();
        if (!raw || raw.length < 3) {
            if (this.state.usernameSuggestions.length || this.state.checkedUsername) {
                this.state.usernameSuggestions = [];
                this.state.checkedUsername = '';
                this.lastRenderKey = null;
                this.render();
            }
            return;
        }
        if (raw === this.state.checkedUsername) return;
        this._suggestTimer = setTimeout(() => {
            this._suggestTimer = null;
            void this._checkUsernameAndSuggest(raw);
        }, 600);
    },

    async _checkUsernameAndSuggest(name) {
        const target = String(name || '').trim();
        if (!target) return;
        try {
            const result = await checkUsernameAvailability(target);
            if (!result) return;
            if (String(this.state.tempUsername || '').trim() !== target) return;
            this.state.checkedUsername = target;
            if (result.taken) {
                this.state.usernameSuggestions = result.suggestions;
                if (!this.state.authError) {
                    this.state.authError = (store.ui && store.ui.syncLoginUsernameTakenShort) ||
                        'That name is already taken. Try one of the suggestions.';
                }
            } else {
                this.state.usernameSuggestions = [];
            }
            this.lastRenderKey = null;
            this.render();
        } catch {
            /* ignore — network error here is non-fatal; the register flow
             * will check again before publishing. */
        }
    },

    _renderUsernameSuggestionsHtml(escHtmlFn, escAttrFn) {
        const ui = store.ui || {};
        const list = Array.isArray(this.state.usernameSuggestions)
            ? this.state.usernameSuggestions
            : [];
        if (!list.length || this.state.authBusy) return '';
        const label = escHtmlFn(
            ui.syncLoginSuggestionsLabel || 'Try one of these free names:'
        );
        const chips = list
            .map(
                (n) =>
                    `<button type="button" class="profile-username-suggest-chip js-profile-username-suggest" data-name="${escAttrFn(
                        n
                    )}">${escHtmlFn(n)}</button>`
            )
            .join('');
        return `<div class="profile-username-suggest" role="group" aria-label="${escAttrFn(label)}">
            <p class="profile-username-suggest__label">${label}</p>
            <div class="profile-username-suggest__chips">${chips}</div>
        </div>`;
    },

    _renderSyncLoginFormHtml(ui, modeCr, modePl) {
        /* Busy banner mirrors the onboarding flow for BOTH modes: register and
         * sign-in both await Nostr round-trips that can take several seconds,
         * and the silent grey-out alone makes the UI feel frozen. The wording
         * picks the right copy per mode (creating vs connecting). */
        const busyBannerText = modeCr
            ? ui.onboardingRegisterCreatingBanner ||
              'Creating your account\u2026 this can take a few seconds. Please don\u2019t close or reload the tab.'
            : ui.onboardingLoginSigningInBanner ||
              'Connecting to the relay network\u2026 this can take a few seconds. Please don\u2019t close or reload the tab.';
        const busyBanner = this.state.authBusy
            ? `<p class="profile-busy-banner" role="status" aria-live="polite">
                <span class="profile-busy-banner__spinner" aria-hidden="true"></span>
                <span class="profile-busy-banner__text">${escHtml(busyBannerText)}</span>
            </p>`
            : '';

        const registerSocialInfo =
            modeCr
                ? `<p class="profile-fine-print profile-register-terms" role="note">${escHtml(ui.networkSocialConsentInfo || '')}</p>`
                : '';

        const registerBtnLabel = this.state.authBusy
            ? escHtml(
                  ui.onboardingRegisterCreatingButton || ui.syncLoginCreatingShort || 'Creating account\u2026'
              )
            : escHtml(ui.syncLoginSubmitRegister || 'Create account');
        const loginBtnLabel = this.state.authBusy
            ? escHtml(ui.onboardingLoginSigningInButton || 'Signing in\u2026')
            : escHtml(ui.syncLoginSubmitWithSecret || ui.syncLoginSubmitLogin || 'Continue');
        const usernameSuggestionsHtml = this._renderUsernameSuggestionsHtml(escHtml, escAttr);
        const busyAttr = this.state.authBusy ? 'disabled aria-busy="true"' : '';
        const busyOpacityCls = this.state.authBusy ? 'opacity-50 cursor-not-allowed' : '';
        const inputDisabledAttr = this.state.authBusy ? 'disabled' : '';

        return `<div class="space-y-2">
                <div class="profile-sync-tabs" role="tablist" aria-label="${escAttr(ui.syncLoginModeLabel || ui.syncLoginSectionTitle || 'Account')}">
                    <button type="button" role="tab" aria-selected="${modeCr ? 'true' : 'false'}" class="profile-sync-tab js-profile-sync-mode" data-mode="create" ${busyAttr}>${escHtml(ui.syncLoginTabRegister || 'Register')}</button>
                    <button type="button" role="tab" aria-selected="${modePl ? 'true' : 'false'}" class="profile-sync-tab js-profile-sync-mode" data-mode="login" ${busyAttr}>${escHtml(ui.syncLoginTabSignIn || 'Sign in')}</button>
                </div>
                ${
                    modeCr
                        ? `<div class="profile-sync-panel ${this.state.authBusy ? 'profile-sync-panel--busy' : ''}" role="tabpanel">
                ${busyBanner}
                ${usernameSuggestionsHtml}
                <button type="button" id="profile-sync-register" class="profile-primary-cta min-h-10 rounded-lg arborito-cta-purple py-2 text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${busyOpacityCls}" ${busyAttr}>${registerBtnLabel}</button>
                ${registerSocialInfo}
            </div>`
                        : `<div class="profile-sync-panel ${this.state.authBusy ? 'profile-sync-panel--busy' : ''}" role="tabpanel">
                    ${busyBanner}
                    <!-- Primary path: username + secret + Continue. The username field
                         is mirrored from the display-name input at the top of the modal. -->
                    <div class="profile-signin-field">
                        <label class="profile-signin-field__label" for="profile-sync-username">${escHtml(ui.profileSignInUsernameLabel || 'Online username')}</label>
                        <input type="text" id="profile-sync-username" autocomplete="username" spellcheck="false" value="${escAttr(this.state.tempUsername || '')}" placeholder="${escAttr(ui.profileSignInUsernamePlaceholder || ui.usernamePlaceholder || 'your_username')}" aria-label="${escAttr(ui.profileSignInUsernameLabel || 'Online username')}" class="arborito-input arborito-input--compact rounded-lg" ${inputDisabledAttr} />
                        <p class="profile-signin-field__hint">${escHtml(ui.profileSignInUsernameHint || 'Same name shown in your profile header above.')}</p>
                    </div>
                    <div class="profile-signin-field">
                        <label class="profile-signin-field__label" for="profile-sync-secret">${escHtml(ui.profileSignInSecretLabel || 'Login key (secret code)')}</label>
                        <div class="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                            <input type="text" id="profile-sync-secret" autocomplete="current-password" spellcheck="false" value="${escAttr(this._profileSyncSecretDraft || '')}" placeholder="${escAttr(ui.syncLoginSecretPlaceholder || '')}" aria-label="${escAttr(ui.syncLoginYourSecretLabel || 'Secret')}" class="arborito-input arborito-input--compact arborito-input--mono rounded-lg" ${inputDisabledAttr} />
                            <button type="button" class="js-profile-sync-submit-login min-h-10 shrink-0 rounded-lg arborito-cta-emerald px-4 py-2 text-sm font-bold sm:w-auto ${busyOpacityCls}" ${busyAttr}>${loginBtnLabel}</button>
                        </div>
                    </div>
                    <p class="profile-signin-alt-label">${escHtml(ui.profileSignInAltLabel || 'Or sign in without typing:')}</p>
                    <div class="profile-signin-alt-chips">
                        <button type="button" class="profile-signin-chip js-profile-sync-scan-qr ${busyOpacityCls}" aria-label="${escAttr(ui.syncLoginScanQrCtaShort || 'Scan QR')}" ${busyAttr}>
                            <span class="profile-signin-chip__ic" aria-hidden="true">📷</span>
                            <span class="profile-signin-chip__txt">${escHtml(ui.profileSignInScanQrChip || ui.syncLoginScanQrCtaShort || 'Scan QR')}</span>
                        </button>
                        <button type="button" class="profile-signin-chip js-profile-sync-pick-txt ${busyOpacityCls}" aria-label="${escAttr(ui.syncLoginUseLoginKey || ui.syncLoginAltFile || 'Key file')}" ${busyAttr}>
                            <span class="profile-signin-chip__ic" aria-hidden="true">🔑</span>
                            <span class="profile-signin-chip__txt">${escHtml(ui.profileSignInPickFileChip || ui.syncLoginAltFile || '.txt file')}</span>
                        </button>
                    </div>
                </div>`
                }
                <input type="file" id="profile-sync-file-txt" class="hidden" accept=".txt,text/plain" />
            </div>`;
    },

    _renderSyncAccessKeyHtml(ui, isSyncAccount, accountUsername) {
        if (!isSyncAccount) return '';
        const sessReveal = store.authSession;
        if (!sessReveal) return '';
        const sessionTriadReveal = {
            username: String(sessReveal.username || accountUsername || '').trim(),
            plainSecret: String(sessReveal.syncSecretPlain || '').trim(),
            qrDataUrl: String(sessReveal.syncQrDataUrl || '').trim()
        };
        return `<div class="mt-2 pt-2 border-t border-slate-200/80 dark:border-slate-700/80">
                ${syncLoginTriadMarkup(ui, sessionTriadReveal, escHtml, escAttr, {
                    profileMasking: true,
                    codeRevealed: this.state.syncAccessCodeVisible,
                    qrRevealed: this.state.syncAccessQrVisible
                })}
            </div>`;
    },

    _renderSessionPanelHtml(ui) {
        const signedIn = !!(store.isSignedIn && store.isSignedIn());
        const isSyncAccount = !!(store.isSyncAccount && store.isSyncAccount());
        const accountUsername = (store.authSession && store.authSession.username) || '';
        const cloudProgressOn = !!(store.userStore && store.userStore.state)?.cloudProgressSync;
        const modePl = this._profileSyncMode !== 'create';
        const modeCr = this._profileSyncMode === 'create';

        const unifiedStatusRow = this._renderUnifiedStatusRow(ui, signedIn, isSyncAccount, accountUsername, cloudProgressOn);
        const sessionStatusRow = signedIn || modePl ? unifiedStatusRow : '';

        const authErrorHtml = this.state.authError
            ? `<p class="text-[11px] text-red-600 dark:text-red-300 mt-3 mb-0 leading-snug" role="alert">${escHtml(this.state.authError)}</p>`
            : '';

        const sessionPanelLabel = signedIn
            ? escHtml(ui.profileSessionConnectedLabel || ui.syncLoginSectionTitle || 'Online account')
            : modeCr
              ? escHtml(ui.profileSessionRegisterLabel || ui.syncLoginTabRegister || 'Register')
              : escHtml(ui.profileSessionLoginLabel || ui.syncLoginTabSignIn || 'Sign in');

        if (signedIn) {
            const profileSyncAccessKey = this._renderSyncAccessKeyHtml(ui, isSyncAccount, accountUsername);
            const authedLogoutRow = `<button type="button" id="profile-session-signout" class="profile-primary-cta profile-session-logout min-h-10 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50 dark:border-red-900/70 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500">${escHtml(ui.authSignOut || 'Sign out')}</button>`;
            const profileAdvancedBlock = this._renderAdvancedBlockHtml(ui, isSyncAccount);
            return `<div id="profile-session-section" class="profile-sheet__session scroll-mt-4">
                <p class="profile-session__label">${sessionPanelLabel}</p>
                ${sessionStatusRow}
                ${profileSyncAccessKey}
                ${authErrorHtml}
                ${authedLogoutRow}
                ${profileAdvancedBlock}
            </div>`;
        }
        const profileSyncLoginForm = this._renderSyncLoginFormHtml(ui, modeCr, modePl);
        return `<div id="profile-session-section" class="profile-sheet__session scroll-mt-4">
                <p class="profile-session__label">${sessionPanelLabel}</p>
                ${sessionStatusRow}
                ${profileSyncLoginForm}
                ${authErrorHtml}
            </div>`;
    },

    async _tryProfileTypedLogin() {
        const ui = store.ui;
        const nameInp = this.querySelector('#inp-username');
        const signinNameInp = this.querySelector('#profile-sync-username');
        const secInp = this.querySelector('#profile-sync-secret');
        const u = (
            (signinNameInp && signinNameInp.value) ||
            (nameInp && nameInp.value) ||
            this.state.tempUsername ||
            ''
        ).trim();
        const s = ((secInp && secInp.value) || this._profileSyncSecretDraft || '').trim();
        if (!u || !s) {
            this.state.authError = ui.syncLoginNeedUserSecret || 'Enter username and code.';
            this.lastRenderKey = null;
            this.render();
            return;
        }
        this.state.authBusy = true;
        this.state.authError = '';
        this.lastRenderKey = null;
        this.render();
        try {
            await store.signInWithSyncSecret(u, s);
            this._profileAfterSignedIn();
        } catch (e) {
            this.state.authError = humanizeAuthError(e, store.ui);
        } finally {
            this.state.authBusy = false;
        }
        this.lastRenderKey = null;
        this.render();
    },

    _bindSigninEvents() {
        const nameInp = this.querySelector('#inp-username');
        const signinNameInp = this.querySelector('#profile-sync-username');
        const secInp = this.querySelector('#profile-sync-secret');

        this.querySelectorAll('.js-profile-sync-mode').forEach((btn) => {
            btn.onclick = () => {
                this._profileSyncMode = btn.getAttribute('data-mode') === 'create' ? 'create' : 'login';
                this.state.authError = '';
                this.state.usernameSuggestions = [];
                this.state.checkedUsername = '';
                this.lastRenderKey = null;
                this.render();
                if (this._profileSyncMode === 'create') {
                    this._scheduleUsernameCheck();
                }
            };
        });
        /* Keep the two username inputs in sync without re-rendering on every
           keystroke: the in-panel field is the user's primary entry point when
           the focus is on the login form, but the top "display name" field
           still updates so the profile header stays accurate. */
        if (signinNameInp) {
            signinNameInp.addEventListener('input', () => {
                this.state.tempUsername = signinNameInp.value;
                if (nameInp && nameInp.value !== signinNameInp.value) {
                    nameInp.value = signinNameInp.value;
                }
                if (this.state.authError) this.state.authError = '';
                this.updateProfileDirtyUi();
                if (this._profileSyncMode === 'create') this._scheduleUsernameCheck();
            });
            signinNameInp.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' || e.shiftKey) return;
                e.preventDefault();
                /* `secInp` is defined below; resolve lazily via the live DOM. */
                const s = this.querySelector('#profile-sync-secret');
                if (s) s.focus();
            });
        }
        this.querySelectorAll('.js-profile-sync-submit-login').forEach((btn) => {
            btn.onclick = () => {
                void this._tryProfileTypedLogin();
            };
        });
        if (secInp) {
            secInp.addEventListener('input', () => {
                this._profileSyncSecretDraft = secInp.value;
                if (this.state.authError) this.state.authError = '';
            });
            secInp.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' || e.shiftKey) return;
                e.preventDefault();
                void this._tryProfileTypedLogin();
            });
        }
        /* Cross-device pairing: an unsigned device scans the QR rendered by the
         * already-signed-in device (see `syncLoginTriadMarkup`). */
        this.querySelectorAll('.js-profile-sync-scan-qr').forEach((b) => {
            b.onclick = () => {
                store.setModal({ type: 'sync-login-qr-scanner' });
            };
        });

        const pTxt = this.querySelector('#profile-sync-file-txt');
        this.querySelectorAll('.js-profile-sync-pick-txt').forEach((b) => {
            b.onclick = () => {
                if (pTxt && typeof pTxt.click === 'function') pTxt.click();
            };
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
                    this.state.authBusy = true;
                    this.state.authError = '';
                    this.lastRenderKey = null;
                    this.render();
                    await store.signInWithSyncSecret(parsed.username, parsed.secret);
                    this._profileAfterSignedIn();
                } catch (e) {
                    this.state.authError = humanizeAuthError(e, store.ui);
                } finally {
                    this.state.authBusy = false;
                }
                this.lastRenderKey = null;
                this.render();
            });
        }
        const regBtn = this.querySelector('#profile-sync-register');
        if (regBtn) {
            regBtn.onclick = async () => {
                const ui = store.ui;
                const u = ((nameInp && nameInp.value) || this.state.tempUsername || '').trim();
                if (!u) {
                    this.state.authError = ui.authUsernameRequired || 'Type a name first.';
                    this.lastRenderKey = null;
                    this.render();
                    return;
                }
                this.state.authBusy = true;
                this.state.authError = '';
                this.state.usernameSuggestions = [];
                this.lastRenderKey = null;
                this.render();
                try {
                    const avatar = this.state.tempAvatar;
                    if (u && (u !== (store.value.gamification && store.value.gamification.username) || avatar !== (store.value.gamification && store.value.gamification.avatar))) {
                        store.updateUserProfile(u, avatar);
                    }
                    /* Race against a 20s budget so the user gets an actionable
                     * error instead of an infinite spinner if every relay is
                     * unreachable. The publish keeps running in the
                     * background; if it eventually succeeds the record is
                     * still written. Mirrors the onboarding flow. */
                    await publishWithTimeout(
                        store.registerSyncLoginAccount(u),
                        20_000,
                        ui.onboardingRegisterTimeout ||
                            'Could not confirm account creation. The connection is taking too long. Check your internet and try again.'
                    );
                    store.grantNetworkSocialConsent?.();
                    this.state.syncAccessCodeVisible = false;
                    this.state.syncAccessQrVisible = false;
                    this._profileEnableCloudSync({ showToast: false });
                } catch (e) {
                    const friendly = humanizeAuthError(e, store.ui);
                    this.state.authError = friendly;
                    const low = String(friendly || '').toLowerCase();
                    if (low.includes('ya está') || low.includes('ya esta') || low.includes('already')) {
                        try {
                            this.state.usernameSuggestions = await suggestUsernamesFor(u);
                        } catch {
                            /* ignore */
                        }
                    }
                } finally {
                    this.state.authBusy = false;
                }
                this.lastRenderKey = null;
                this.render();
            };
        }

        /* Username availability suggestion chips */
        this.querySelectorAll('.js-profile-username-suggest').forEach((b) => {
            b.onclick = () => {
                const name = String((b && b.dataset && b.dataset.name) || '').trim();
                if (!name) return;
                this.state.tempUsername = name;
                this.state.usernameSuggestions = [];
                this.state.checkedUsername = '';
                this.state.authError = '';
                const inp = this.querySelector('#inp-username');
                if (inp) inp.value = name;
                const mirror = this.querySelector('#profile-sync-username');
                if (mirror) mirror.value = name;
                this.lastRenderKey = null;
                this.render();
            };
        });

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
    }
};
