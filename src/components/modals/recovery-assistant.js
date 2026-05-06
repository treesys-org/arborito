
import { store } from '../../store.js';
import { shouldShowMobileUI } from '../../utils/breakpoints.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';
import { escHtml, escAttr } from '../../utils/html-escape.js';

class ArboritoModalRecoveryAssistant extends HTMLElement {
    constructor() {
        super();
        this._busy = false;
        this._error = '';
    }

    connectedCallback() {
        this.render();
        this._onState = () => this.render();
        store.addEventListener('state-change', this._onState);
    }

    disconnectedCallback() {
        if (this._onState) store.removeEventListener('state-change', this._onState);
    }

    close() {
        store.dismissModal();
    }

    render() {
        const ui = store.ui;
        const mob = shouldShowMobileUI();
        const boot = (store.getRecoveryBootstrap && store.getRecoveryBootstrap());
        const mobileChrome = mob
            ? `
                <div class="arborito-sheet__hero arborito-sheet__hero--mmenu-sub arborito-dock-modal-hero shrink-0 flex items-center gap-2">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0')}
                    <span class="text-2xl shrink-0" aria-hidden="true">🧭</span>
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0 text-left">${escHtml(ui.recoveryAssistantTitle || 'Recover your account')}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>`
            : `
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0')}
                    <span class="text-2xl shrink-0" aria-hidden="true">🧭</span>
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0 text-left">${escHtml(ui.recoveryAssistantTitle || 'Recover your account')}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>`;

        const err = this._error
            ? `<p class="text-[11px] text-red-600 dark:text-red-300 m-0 mb-3" role="alert">${escHtml(this._error)}</p>`
            : '';

        const unlockedBlock = boot
            ? `<div class="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/25 p-4 mb-4 text-left">
                <p class="text-xs font-bold text-emerald-800 dark:text-emerald-200 m-0">${escHtml(ui.recoveryUnlockedLead || 'You can add a new passkey on this device.')}</p>
                <p class="text-[11px] text-slate-600 dark:text-slate-300 m-0 mt-2">${escHtml(ui.recoveryUnlockedUserLabel || 'Account')}: <span class="font-mono font-bold">${escHtml(boot.username)}</span></p>
                <button type="button" id="recovery-register-passkey" class="mt-3 w-full px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider disabled:opacity-50" ${this._busy ? 'disabled' : ''}>${escHtml(ui.recoveryRegisterPasskeyCta || 'Register new passkey')}</button>
            </div>`
            : '';

        const codeBlock = !boot
            ? `<div class="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 p-4 mb-4 text-left">
                <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 m-0">${escHtml(ui.recoverySectionBackupCode || 'Backup code')}</h3>
                <p class="text-[11px] text-slate-600 dark:text-slate-300 m-0 mt-2 leading-snug">${escHtml(ui.recoveryBackupCodeHint || 'Enter your username and one unused recovery code.')}</p>
                <label class="block mt-3 text-[10px] font-bold uppercase text-slate-500">${escHtml(ui.passkeyUsernamePlaceholder || 'Username')}</label>
                <input id="recovery-username" autocomplete="username" class="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm" placeholder="${escAttr(ui.passkeyUsernamePlaceholder || 'username')}" value="${escAttr((boot && boot.username) || '')}" />
                <label class="block mt-3 text-[10px] font-bold uppercase text-slate-500">${escHtml(ui.recoveryCodeLabel || 'Recovery code')}</label>
                <input id="recovery-code" autocomplete="one-time-code" class="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono" placeholder="${escAttr(ui.recoveryCodePlaceholder || 'XXXX-XXXX-XXXX-XXXX')}" />
                <button type="button" id="recovery-verify-code" class="mt-3 w-full px-4 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-black uppercase tracking-wider disabled:opacity-50" ${this._busy ? 'disabled' : ''}>${escHtml(ui.recoveryVerifyCode || 'Verify code')}</button>
            </div>`
            : '';

        const fileBlock = !boot
            ? `<div class="rounded-2xl border border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/20 p-4 mb-2 text-left">
                <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 m-0">${escHtml(ui.recoverySectionKitFile || 'Recovery file')}</h3>
                <p class="text-[11px] text-slate-600 dark:text-slate-300 m-0 mt-2 leading-snug">${escHtml(ui.recoveryKitFileHint || 'Choose your encrypted recovery file and enter its passphrase.')}</p>
                <input type="file" id="recovery-kit-file" accept=".json,application/json" class="mt-3 w-full text-xs" />
                <label class="block mt-3 text-[10px] font-bold uppercase text-slate-500">${escHtml(ui.recoveryKitPassphraseLabel || 'Passphrase')}</label>
                <input type="password" id="recovery-kit-pass" autocomplete="new-password" class="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm" />
                <button type="button" id="recovery-import-kit" class="mt-3 w-full px-4 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black uppercase tracking-wider disabled:opacity-50" ${this._busy ? 'disabled' : ''}>${escHtml(ui.recoveryImportKit || 'Unlock from file')}</button>
            </div>`
            : '';

        const body = `
            <div class="p-4 md:p-6 text-left max-w-lg mx-auto">
                <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed m-0 mb-4">${escHtml(ui.recoveryAssistantLead || 'If you lost this device, use a recovery code or your recovery file. Then add a new passkey here.')}</p>
                ${err}
                ${unlockedBlock}
                ${codeBlock}
                ${fileBlock}
                ${boot ? `<button type="button" id="recovery-cancel-bootstrap" class="w-full mt-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300">${escHtml(ui.recoveryCancelUnlock || 'Cancel and start over')}</button>` : ''}
            </div>`;

        const shell = mob
            ? `bg-white dark:bg-slate-900 w-full max-w-2xl max-h-[min(92dvh,calc(100dvh-var(--arborito-mob-dock-clearance,4.25rem)-1.5rem))] rounded-2xl shadow-2xl relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800`
            : `arborito-float-modal-card bg-white dark:bg-slate-900 rounded-3xl shadow-2xl relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 max-w-xl`;

        const inner = mob ? `${mobileChrome}${body}` : `${mobileChrome}<div class="arborito-float-modal-card__inner min-h-0 overflow-y-auto custom-scrollbar">${body}</div>`;

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950 p-4 animate-in fade-in arborito-modal-root">
            <div class="${shell}">
                ${inner}
            </div>
        </div>`;

        this.querySelectorAll('.btn-close').forEach((b) => {
            b.onclick = () => this.close();
        });
        const back = this.querySelector('.arborito-mmenu-back');
        if (back) back.onclick = () => this.close();

        const verifyBtn = this.querySelector('#recovery-verify-code');
        if (verifyBtn) {
            verifyBtn.onclick = async () => {
                if (this._busy) return;
                const u = (this.querySelector('#recovery-username') ? this.querySelector('#recovery-username').value : undefined) || '';
                const c = (this.querySelector('#recovery-code') ? this.querySelector('#recovery-code').value : undefined) || '';
                this._error = '';
                this._busy = true;
                this.render();
                try {
                    await store.verifyRecoveryBackupCodeAndUnlock(u, c);
                    store.notify(ui.recoveryCodeOk || 'Code accepted.', false);
                } catch (e) {
                    this._error = String((e && e.message) || e);
                } finally {
                    this._busy = false;
                    this.render();
                }
            };
        }

        const kitIn = this.querySelector('#recovery-import-kit');
        if (kitIn) {
            kitIn.onclick = async () => {
                if (this._busy) return;
                const pass = (this.querySelector('#recovery-kit-pass') ? this.querySelector('#recovery-kit-pass').value : undefined) || '';
                const file = (this.querySelector('#recovery-kit-file') && this.querySelector('#recovery-kit-file').files ? this.querySelector('#recovery-kit-file').files[0] : undefined);
                this._error = '';
                if (!file) {
                    this._error = ui.recoveryKitNeedFile || 'Choose a recovery file first.';
                    this.render();
                    return;
                }
                let raw = '';
                try {
                    raw = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(String(reader.result || ''));
                        reader.onerror = () => reject(new Error('Could not read file.'));
                        reader.readAsText(file);
                    });
                } catch {
                    raw = '';
                }
                if (!String(raw).trim()) {
                    this._error = ui.recoveryKitNeedFile || 'Choose a recovery file first.';
                    this.render();
                    return;
                }
                this._busy = true;
                this.render();
                try {
                    await store.unlockRecoveryFromKitFile(raw, pass);
                    store.notify(ui.recoveryKitUnlocked || 'Recovery file unlocked.', false);
                } catch (e) {
                    this._error = String((e && e.message) || e);
                } finally {
                    this._busy = false;
                    this.render();
                }
            };
        }

        const reg = this.querySelector('#recovery-register-passkey');
        if (reg) {
            reg.onclick = async () => {
                if (this._busy) return;
                const name = (boot && boot.username) || '';
                this._busy = true;
                this._error = '';
                this.render();
                try {
                    await store.registerPasskeyAfterRecovery(name);
                    store.notify(ui.passkeyRegisterOk || 'Passkey created.', false);
                    this.close();
                } catch (e) {
                    this._error = String((e && e.message) || e);
                } finally {
                    this._busy = false;
                    this.render();
                }
            };
        }

        const cancelBoot = this.querySelector('#recovery-cancel-bootstrap');
        if (cancelBoot) {
            cancelBoot.onclick = () => {
                store.clearRecoveryBootstrap();
                this._error = '';
                this.render();
            };
        }
    }
}

customElements.define('arborito-modal-recovery-assistant', ArboritoModalRecoveryAssistant);
