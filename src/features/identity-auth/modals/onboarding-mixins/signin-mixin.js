import { store } from '../../../../core/store.js';
import { bindMobileTap } from '../../../../shared/ui/mobile-tap.js';
import { parseSyncLoginFromExportFile } from '../../sync-login-secret.js';
import { humanizeAuthError } from '../../sync-login-error-humanize.js';
import { publishWithTimeout } from '../../sync-login-publish-timeout.js';
import {
    suggestUsernamesFor,
    checkUsernameAvailability
} from '../../sync-login-username-suggest.js';
import { escHtml as esc } from '../../../../shared/lib/html-escape.js';

/** Step 2 sign-in / register sub-views and their async actions.
 *
 * Owns:
 *   - the login form (username + secret, plus QR / file alt entry points)
 *   - the register form (username, with debounced availability check
 *     producing free-name suggestions on collisions)
 *   - the "registered" landing view that surfaces the freshly-generated
 *     secret, copy / download chips, and the gated Continue CTA
 *   - the network actions that drive each (sign-in, register w/ timeout,
 *     file-based sign-in, QR scanner hand-off, secret export)
 *   - the wiring for every step-2 input / button (`_wireStep2`).
 *
 * The "choose" sub-view (registered vs guest) is in `choose-mixin`; the
 * shell (constructor, render, navbar, lifecycle, `_complete`) lives in
 * `onboarding.js`. */
export const signinMixin = {
    _scheduleUsernameCheck() {
        if (this._suggestTimer) {
            clearTimeout(this._suggestTimer);
            this._suggestTimer = null;
        }
        const raw = String(this._sessionUsername || '').trim();
        if (!raw || raw.length < 3) {
            if (this._usernameSuggestions.length) {
                this._usernameSuggestions = [];
                this._refreshSuggestions();
            }
            return;
        }
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
            if (String(this._sessionUsername || '').trim() !== target) return;
            this._usernameSuggestions = result.taken ? result.suggestions : [];
            this._refreshSuggestions();
        } catch {
            /* non-fatal */
        }
    },

    _refreshSuggestions() {
        // Lightweight refresh: replace only the suggestions block instead of
        // re-rendering the whole wizard (would steal focus from the input).
        const slot = this.querySelector('.js-onb-username-suggest-slot');
        if (!slot) return;
        slot.innerHTML = this._renderUsernameSuggestionsHtml();
        this._wireUsernameSuggestionChips();
    },

    _renderUsernameSuggestionsHtml() {
        const ui = store.ui || {};
        const list = Array.isArray(this._usernameSuggestions) ? this._usernameSuggestions : [];
        if (!list.length || this._busy) return '';
        const label = esc(ui.syncLoginSuggestionsLabel || 'Try one of these free names:');
        const chips = list
            .map(
                (n) =>
                    `<button type="button" class="arborito-onb-suggest-chip js-onb-username-suggest" data-name="${esc(n)}">${esc(n)}</button>`
            )
            .join('');
        return `<div class="arborito-onb-suggest" role="group">
            <p class="arborito-onb-suggest__label">${label}</p>
            <div class="arborito-onb-suggest__chips">${chips}</div>
        </div>`;
    },

    _wireUsernameSuggestionChips() {
        this.querySelectorAll('.js-onb-username-suggest').forEach((b) => {
            bindMobileTap(b, () => {
                const name = String((b && b.dataset && b.dataset.name) || '').trim();
                if (!name) return;
                this._sessionUsername = name;
                this._usernameSuggestions = [];
                this._error = '';
                const inp = this.querySelector('#onb-register-username');
                if (inp) inp.value = name;
                this.render();
            });
        });
    },

    async _doLogin() {
        if (this._busy) return;
        const ui = store.ui;
        const u = String(this._sessionUsername || '').trim();
        const s = String(this._sessionSecret || '').trim();
        if (!u || !s) {
            this._error = ui.syncLoginNeedUserSecret || 'Enter username and secret.';
            this.render();
            return;
        }
        this._busy = true;
        this._error = '';
        this.render();
        try {
            await store.signInWithSyncSecret(u, s);
            // Sign-in success: auto-load (see _scheduleAutoloadTreeAfterSignIn)
            // will pick the most recent tree once relays return. Complete the
            // wizard so step 3 (Trees picker) is ready as a fallback if the
            // user has no synced trees yet.
            this._complete();
        } catch (e) {
            this._error = humanizeAuthError(e, store.ui);
            this._busy = false;
            this.render();
        }
    },

    async _doRegister() {
        if (this._busy) return;
        const ui = store.ui;
        const u = String(this._sessionUsername || '').trim();
        if (!u) {
            this._error = ui.authUsernameRequired || 'Enter a username first.';
            this.render();
            return;
        }
        this._busy = true;
        this._error = '';
        this.render();
        try {
            // Persist the chosen username as the gamification display name too
            // (the rest of the app already treats these as the same identity).
            const g = store.value.gamification || {};
            if (u !== g.username) {
                store.updateUserProfile(u, g.avatar || '👤');
            }
            /* Defense against the "spinning forever" case: when every Nostr
             * relay is unreachable from this network, `_publish` resolves
             * only when SimplePool's per-relay timeouts elapse, which can
             * take 30+ seconds. We race the register against a 20s budget
             * so the user gets an actionable error instead of an infinite
             * spinner. The publish itself keeps running in the background
             * (no way to abort SimplePool mid-flight); if it eventually
             * succeeds the record is still written. */
            const res = await publishWithTimeout(
                store.registerSyncLoginAccount(u),
                20_000,
                ui.onboardingRegisterTimeout ||
                    'Could not confirm account creation. The connection is taking too long. Check your internet and try again.'
            );
            store.grantNetworkSocialConsent?.();
            this._registerResult = res || null;
            this._sessionView = 'registered';
            /* Ghost-tap shield: the "Create account" tap that just resolved this
             * Promise may still have a queued `touchend` in the OS event loop.
             * Once the registered view paints, that event fires on whatever
             * button sits under the user's finger — usually the new
             * "Continue" CTA, which would then open the confirm dialog,
             * where a SECOND ghost-tap could land on "Accept". The dialog
             * alone is NOT enough protection (user reported the wizard still
             * "advances on its own"). We keep the CTA visibly disabled for ~1.6s so
             * any straggler is absorbed; after that it activates and the
             * confirm dialog gives a second layer of defence. */
            this._finishTapGuardUntil = Date.now() + 1600;
            if (this._finishTapGuardTimer) {
                clearTimeout(this._finishTapGuardTimer);
            }
            this._finishTapGuardTimer = setTimeout(() => {
                this._finishTapGuardTimer = null;
                if (this._sessionView === 'registered' && !this._completed) {
                    this.render();
                }
            }, 1650);
        } catch (e) {
            this._error = humanizeAuthError(e, store.ui);
            const low = String(this._error || '').toLowerCase();
            if (low.includes('ya está') || low.includes('ya esta') || low.includes('already')) {
                try {
                    this._usernameSuggestions = await suggestUsernamesFor(u);
                } catch {
                    /* ignore */
                }
            }
        } finally {
            this._busy = false;
            this.render();
        }
    },

    async _doFileLogin(file) {
        if (!file) return;
        const ui = store.ui;
        try {
            const raw = await file.text();
            const parsed = parseSyncLoginFromExportFile(raw);
            if (!parsed) {
                this._error = ui.syncLoginFileUnreadable || 'Invalid file.';
                this.render();
                return;
            }
            this._busy = true;
            this._error = '';
            this.render();
            await store.signInWithSyncSecret(parsed.username, parsed.secret);
            this._complete();
        } catch (e) {
            this._error = humanizeAuthError(e, store.ui);
            this._busy = false;
            this.render();
        }
    },

    _openQrScanner() {
        /* Hop to the dedicated QR scanner. We DON'T mark onboarding as seen
         * here — if the user cancels the scan we want to bring them back to
         * the onboarding login view instead of stranding them with no tree
         * and no identity (`fromOnboarding` flag, handled by the scanner's
         * cancel button — see `sync-login-qr-scanner.js`). On successful
         * sign-in the scanner clears the modal directly (bypassing the
         * fromOnboarding redirect) and the post-signin auto-load takes
         * over from there. */
        store.setModal({
            type: 'sync-login-qr-scanner',
            fromOnboarding: { step: 2, view: 'login' },
        });
    },

    _downloadSecretFile() {
        const r = this._registerResult;
        if (!r) return;
        try {
            store.downloadSyncSecretFile(r.username, r.plainSecret);
        } catch (e) {
            this._error = String((e && e.message) || e);
            this.render();
        }
    },

    async _copySecretToClipboard() {
        const r = this._registerResult;
        if (!r) return;
        try {
            await navigator.clipboard.writeText(r.plainSecret);
            const ui = store.ui;
            store.notify(ui.syncLoginCopiedToast || 'Code copied.', false);
        } catch (e) {
            console.warn('clipboard copy failed', e);
        }
    },

    _renderStep2Login(ui) {
        const userLbl = esc(ui.profileSignInUsernameLabel || 'Online username');
        const userPh = esc(ui.profileSignInUsernamePlaceholder || 'your_username');
        const secLbl = esc(ui.profileSignInSecretLabel || 'Login key (secret code)');
        const secPh = esc(ui.syncLoginSecretPlaceholder || '0000-0000-0000-0000');
        const submitIdleLbl = esc(ui.syncLoginSubmitLogin || 'Sign in');
        const submitBusyLbl = esc(ui.onboardingLoginSigningInButton || 'Signing in…');
        const altLbl = esc(ui.profileSignInAltLabel || 'Or sign in without typing:');
        const qrLbl = esc(ui.profileSignInScanQrChip || 'Scan QR');
        const fileLbl = esc(ui.profileSignInPickFileChip || '.txt file');
        const errBlock = this._error
            ? `<p class="arborito-onb-error" role="alert">${esc(this._error)}</p>`
            : '';
        /* Visible busy banner mirrors the register flow: sign-in awaits a Nostr
         * read across relays which can take several seconds, and the silent
         * grey-out on its own makes the UI feel frozen. The banner labels what
         * is happening; `arborito-onb-busy` below it disables pointer events
         * for the form (inputs and alt buttons) so the user cannot retap or
         * keep typing while the publish is in flight. */
        const busyBanner = this._busy
            ? `<p class="arborito-onb-busy-banner" role="status" aria-live="polite">
                <span class="arborito-onb-busy-banner__spinner" aria-hidden="true"></span>
                <span class="arborito-onb-busy-banner__text">${esc(
                    ui.onboardingLoginSigningInBanner ||
                        'Connecting to the relay network… this can take a few seconds. Please don\u2019t close or reload the tab.'
                )}</span>
            </p>`
            : '';
        const busyCls = this._busy ? ' arborito-onb-busy' : '';
        const submitLbl = this._busy ? submitBusyLbl : submitIdleLbl;
        const submitAttrs = this._busy ? 'disabled aria-busy="true"' : '';
        const inputDisabled = this._busy ? 'disabled' : '';
        return `
            ${busyBanner}
            <div class="arborito-onb-form${busyCls}">
                <div class="arborito-onb-field">
                    <label for="onb-login-username">${userLbl}</label>
                    <input id="onb-login-username" type="text" autocomplete="username" spellcheck="false" value="${esc(this._sessionUsername)}" placeholder="${userPh}" class="arborito-onb-input" ${inputDisabled} />
                </div>
                <div class="arborito-onb-field">
                    <label for="onb-login-secret">${secLbl}</label>
                    <input id="onb-login-secret" type="text" autocomplete="current-password" spellcheck="false" value="${esc(this._sessionSecret)}" placeholder="${secPh}" class="arborito-onb-input arborito-onb-input--mono" ${inputDisabled} />
                </div>
                ${errBlock}
                <button type="button" class="arborito-onb-cta js-onb-login-submit" ${submitAttrs}>${submitLbl}</button>
                <div class="arborito-onb-alt-block">
                    <div class="arborito-onb-alt-divider"><span>${altLbl}</span></div>
                    <div class="arborito-onb-alt-grid">
                        <button type="button" class="arborito-onb-alt-btn js-onb-login-qr" ${submitAttrs}>
                            <span class="arborito-onb-alt-btn__ic" aria-hidden="true">📷</span>
                            <span class="arborito-onb-alt-btn__label">${qrLbl}</span>
                        </button>
                        <button type="button" class="arborito-onb-alt-btn js-onb-login-file" ${submitAttrs}>
                            <span class="arborito-onb-alt-btn__ic" aria-hidden="true">🔑</span>
                            <span class="arborito-onb-alt-btn__label">${fileLbl}</span>
                        </button>
                    </div>
                </div>
                <input type="file" id="onb-login-file-input" class="hidden" accept=".txt,text/plain" />
            </div>`;
    },

    _renderStep2Register(ui) {
        const userLbl = esc(ui.profileSignInUsernameLabel || 'Online username');
        const userPh = esc(ui.profileSignInUsernamePlaceholder || 'your_username');
        const userHint = esc(
            ui.onboardingRegisterUsernameHint ||
                'Pick a name that identifies you online. You can rename it later from Profile.'
        );
        const submitIdleLbl = esc(ui.syncLoginSubmitRegister || 'Create account');
        const submitBusyLbl = esc(
            ui.onboardingRegisterCreatingButton || ui.syncLoginCreatingShort || 'Creating account\u2026'
        );
        const busyBanner = this._busy
            ? `<p class="arborito-onb-busy-banner" role="status" aria-live="polite">
                <span class="arborito-onb-busy-banner__spinner" aria-hidden="true"></span>
                <span class="arborito-onb-busy-banner__text">${esc(
                    ui.onboardingRegisterCreatingBanner ||
                        'Creating your account\u2026 this can take a few seconds. Please don\u2019t close or reload the tab.'
                )}</span>
            </p>`
            : '';
        const consentInfo = esc(ui.networkSocialConsentInfo || '');
        const errBlock = this._error
            ? `<p class="arborito-onb-error" role="alert">${esc(this._error)}</p>`
            : '';
        /* `arborito-onb-busy` greys out the WHOLE form including the username
         * input — keep it so the user can't keep typing or re-tap while the
         * publish to Nostr is still pending. The visible spinner banner above
         * tells them what's happening. */
        const busyCls = this._busy ? ' arborito-onb-busy' : '';
        const suggestionsBlock = this._renderUsernameSuggestionsHtml();
        return `
            ${busyBanner}
            <div class="arborito-onb-form${busyCls}">
                <div class="arborito-onb-field">
                    <label for="onb-register-username">${userLbl}</label>
                    <input id="onb-register-username" type="text" autocomplete="username" spellcheck="false" value="${esc(this._sessionUsername)}" placeholder="${userPh}" class="arborito-onb-input" ${this._busy ? 'disabled' : ''} />
                    <p class="arborito-onb-field-hint">${userHint}</p>
                </div>
                <div class="js-onb-username-suggest-slot">${suggestionsBlock}</div>
                ${errBlock}
                <button type="button" class="arborito-onb-cta arborito-onb-cta--accent js-onb-register-submit" ${this._busy ? 'disabled aria-busy="true"' : ''}>${this._busy ? submitBusyLbl : submitIdleLbl}</button>
                ${consentInfo ? `<p class="arborito-onb-fineprint">${consentInfo}</p>` : ''}
            </div>`;
    },

    _renderStep2Registered(ui) {
        const r = this._registerResult || { username: '', plainSecret: '', qrDataUrl: '' };
        const title = esc(ui.onboardingRegisteredTitle || 'Account created!');
        const subtitle = esc(
            ui.onboardingRegisteredSubtitle ||
                "Save this code somewhere safe. You'll need it to sign in on other devices. If you lose it, you lose access to the online account."
        );
        const userLbl = esc(ui.onboardingRegisteredUsernameLabel || 'Username');
        const codeLbl = esc(ui.onboardingRegisteredCodeLabel || 'Your secret code');
        const copyLbl = esc(ui.onboardingRegisteredCopy || 'Copy');
        const downloadLbl = esc(ui.onboardingRegisteredDownload || 'Download .txt file');
        /* CTA stays neutral ("Continue"); the real acknowledgement is a
         * `store.confirm()` dialog opened from the tap handler. We also keep
         * the button visibly disabled for ~1.6s after this view paints (see
         * `_finishTapGuardUntil` set in `_doRegister`) — a hard absorber for
         * the ghost-tap that fires right after the "Create account" press. */
        const guardUntil = this._finishTapGuardUntil || 0;
        const guardActive = Date.now() < guardUntil;
        const finishLbl = esc(ui.onboardingContinue || 'Continue');
        const finishWaitLbl = esc(ui.onboardingPleaseWait || 'Please wait a moment…');
        const qrSection = r.qrDataUrl
            ? `<div class="arborito-onb-qr">
                <img src="${esc(r.qrDataUrl)}" alt="QR" class="arborito-onb-qr__img" />
                <p class="arborito-onb-qr__hint">${esc(ui.onboardingRegisteredQrHint || 'Scan from another device to sign in.')}</p>
            </div>`
            : '';
        return `
            <div class="arborito-onb-form arborito-onb-form--registered">
                <p class="arborito-onb-registered-title">${title}</p>
                <p class="arborito-onb-registered-sub">${subtitle}</p>
                <div class="arborito-onb-cred">
                    <p class="arborito-onb-cred__label">${userLbl}</p>
                    <p class="arborito-onb-cred__value">${esc(r.username)}</p>
                </div>
                <div class="arborito-onb-cred">
                    <p class="arborito-onb-cred__label">${codeLbl}</p>
                    <p class="arborito-onb-cred__value arborito-onb-cred__value--mono">${esc(r.plainSecret)}</p>
                </div>
                <div class="arborito-onb-cred-actions">
                    <button type="button" class="arborito-onb-chip js-onb-reg-copy">
                        <span aria-hidden="true">📋</span><span>${copyLbl}</span>
                    </button>
                    <button type="button" class="arborito-onb-chip js-onb-reg-download">
                        <span aria-hidden="true">💾</span><span>${downloadLbl}</span>
                    </button>
                </div>
                ${qrSection}
                <button type="button" class="arborito-onb-cta js-onb-reg-finish" ${guardActive ? 'disabled aria-disabled="true"' : ''}>${guardActive ? finishWaitLbl : finishLbl}</button>
            </div>`;
    },

    /** Tap on the registered-view CTA: ask for explicit acknowledgement via a
     * styled `store.confirm()` dialog (mobile-friendly, no native checkbox)
     * and only then run `_complete()`. Bailing out leaves the user on the
     * registered view so they can copy / download the code first.
     *
     * Hard guard: if `_finishTapGuardUntil` is still in the future this is a
     * stray touchend right after the registered view paint — drop it on the
     * floor without even opening the dialog. */
    async _confirmAndCompleteFromRegistered() {
        if (this._completed || this._confirmingFinish) return;
        if (Date.now() < (this._finishTapGuardUntil || 0)) return;
        this._confirmingFinish = true;
        try {
            const ui = store.ui;
            const ok = await store.confirm(
                ui.onboardingRegisteredConfirmBody ||
                    'Have you already saved your secret code? Without it you won\u2019t be able to sign in on another device or recover the account.',
                ui.onboardingRegisteredConfirmTitle || 'Continue?',
                /* destructive */ true
            );
            if (!ok) return;
            this._complete();
        } finally {
            this._confirmingFinish = false;
        }
    },

    _wireStep2() {
        // Choose sub-view buttons
        this.querySelectorAll('.js-onb-choose-login').forEach((b) =>
            bindMobileTap(b, () => this._setSessionView('login'))
        );
        this.querySelectorAll('.js-onb-choose-register').forEach((b) =>
            bindMobileTap(b, () => this._setSessionView('register'))
        );
        this.querySelectorAll('.js-onb-choose-skip').forEach((b) =>
            bindMobileTap(b, () => this._complete())
        );
        /* Back navigation is centralized in the navbar (`_wireNavbar` →
         * `_navBack`). Per-view bottom links removed for consistency. */

        // Login view inputs / submit
        const loginUserInp = this.querySelector('#onb-login-username');
        if (loginUserInp) {
            loginUserInp.addEventListener('input', () => {
                this._sessionUsername = loginUserInp.value;
                if (this._error) {
                    this._error = '';
                    const err = this.querySelector('.arborito-onb-error');
                    if (err) err.remove();
                }
            });
            loginUserInp.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' || e.shiftKey) return;
                e.preventDefault();
                const sec = this.querySelector('#onb-login-secret');
                if (sec) sec.focus();
            });
        }
        const loginSecInp = this.querySelector('#onb-login-secret');
        if (loginSecInp) {
            loginSecInp.addEventListener('input', () => {
                this._sessionSecret = loginSecInp.value;
                if (this._error) {
                    this._error = '';
                    const err = this.querySelector('.arborito-onb-error');
                    if (err) err.remove();
                }
            });
            loginSecInp.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' || e.shiftKey) return;
                e.preventDefault();
                void this._doLogin();
            });
        }
        this.querySelectorAll('.js-onb-login-submit').forEach((b) =>
            bindMobileTap(b, () => void this._doLogin())
        );
        this.querySelectorAll('.js-onb-login-qr').forEach((b) =>
            bindMobileTap(b, () => this._openQrScanner())
        );
        const loginFileInp = this.querySelector('#onb-login-file-input');
        this.querySelectorAll('.js-onb-login-file').forEach((b) =>
            bindMobileTap(b, () => loginFileInp && typeof loginFileInp.click === 'function' && loginFileInp.click())
        );
        if (loginFileInp) {
            loginFileInp.addEventListener('change', () => {
                const f = loginFileInp.files && loginFileInp.files[0];
                loginFileInp.value = '';
                void this._doFileLogin(f || null);
            });
        }

        // Register view inputs / submit
        const regUserInp = this.querySelector('#onb-register-username');
        if (regUserInp) {
            regUserInp.addEventListener('input', () => {
                this._sessionUsername = regUserInp.value;
                if (this._error) {
                    this._error = '';
                    const err = this.querySelector('.arborito-onb-error');
                    if (err) err.remove();
                }
                this._scheduleUsernameCheck();
            });
            regUserInp.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' || e.shiftKey) return;
                e.preventDefault();
                void this._doRegister();
            });
        }
        this.querySelectorAll('.js-onb-register-submit').forEach((b) =>
            bindMobileTap(b, () => void this._doRegister())
        );
        this._wireUsernameSuggestionChips();

        // Registered view actions
        this.querySelectorAll('.js-onb-reg-copy').forEach((b) =>
            bindMobileTap(b, () => void this._copySecretToClipboard())
        );
        this.querySelectorAll('.js-onb-reg-download').forEach((b) =>
            bindMobileTap(b, () => this._downloadSecretFile())
        );
        this.querySelectorAll('.js-onb-reg-finish').forEach((b) =>
            bindMobileTap(b, () => void this._confirmAndCompleteFromRegistered())
        );
    }
};
