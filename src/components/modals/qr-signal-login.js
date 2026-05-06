/**
 * QR Signal Login Modal
 * Displays a temporary QR for the user to scan with their mobile and authorize login.
 * Flow: Desktop generates QR → Mobile scans → Mobile authorizes via Nostr → Desktop detects → Login complete.
 */

import { store } from '../../store.js';
import { ArboritoComponent } from '../../utils/component.js';
import { escHtml as esc, escAttr } from '../../utils/html-escape.js';
import { QR_TOKEN_EXPIRY_MS } from '../../services/qr-signaling.js';

class ArboritoModalQrSignalLogin extends ArboritoComponent {
    constructor() {
        super();
        this.lastRenderKey = null;
        this._sessionId = null;
        this._qrDataUrl = null;
        this._status = 'waiting'; // 'waiting' | 'polling' | 'authorized' | 'expired' | 'error'
        this._errorMessage = '';
        this._username = '';
        this._pollInterval = null;
        this._expiryTimeout = null;
        this._countdownInterval = null;
        this._createdAt = Date.now();
    }

    connectedCallback() {
        const modal = store.value.modal;
        if (modal?.type === 'qr-signal-login') {
            this._sessionId = modal.sessionId;
            this._qrDataUrl = modal.qrDataUrl;
        }
        this._startPolling();
        this._startExpiryTimer();
        this._startCountdown();
        this.render();
    }

    disconnectedCallback() {
        this._stopPolling();
        this._stopExpiryTimer();
        this._stopCountdown();
    }

    _startPolling() {
        // Poll every 3 seconds if mobile authorized
        this._pollInterval = setInterval(async () => {
            if (this._status === 'authorized' || this._status === 'expired' || this._status === 'error') {
                return;
            }
            try {
                const check = await store.checkQrSignalingAuth(this._sessionId);
                if (check.authorized) {
                    this._status = 'authorized';
                    this._username = check.username || '';
                    this._stopPolling();
                    // Complete login
                    await store.completeQrSignalingLogin(this._sessionId);
                    // Close modal after 1.5s to show success
                    setTimeout(() => store.dismissModal(), 1500);
                }
            } catch (e) {
                console.error('QR signaling poll error:', e);
            }
        }, 3000);
    }

    _stopPolling() {
        if (this._pollInterval) {
            clearInterval(this._pollInterval);
            this._pollInterval = null;
        }
    }

    _startExpiryTimer() {
        // Expire after 5 minutes
        this._expiryTimeout = setTimeout(() => {
            if (this._status !== 'authorized') {
                this._status = 'expired';
                this._stopPolling();
                this._stopCountdown();
                this.render();
            }
        }, QR_TOKEN_EXPIRY_MS);
    }

    _startCountdown() {
        // Update countdown display every second
        if (this._countdownInterval) return;
        this._countdownInterval = setInterval(() => {
            if (this._status === 'waiting' || this._status === 'polling') {
                this._updateTimerDisplay();
            }
        }, 1000);
    }

    _stopCountdown() {
        if (this._countdownInterval) {
            clearInterval(this._countdownInterval);
            this._countdownInterval = null;
        }
    }

    _updateTimerDisplay() {
        const timerEl = this.querySelector('.js-qr-timer');
        if (timerEl) {
            timerEl.textContent = this._getRemainingTime();
        }
    }

    _stopExpiryTimer() {
        if (this._expiryTimeout) {
            clearTimeout(this._expiryTimeout);
            this._expiryTimeout = null;
        }
    }

    _getRemainingTime() {
        const elapsed = Date.now() - this._createdAt;
        const remaining = Math.max(0, QR_TOKEN_EXPIRY_MS - elapsed);
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    render() {
        const ui = store.ui;
        const key = `${this._sessionId}-${this._status}`;
        if (key === this.lastRenderKey) return;
        this.lastRenderKey = key;

        const remainingTime = this._getRemainingTime();

        let statusContent = '';
        if (this._status === 'waiting' || this._status === 'polling') {
            statusContent = `
                <div class="flex items-center justify-center gap-2 text-slate-600 dark:text-slate-300 text-sm">
                    <div class="w-4 h-4 border-2 border-slate-300 border-t-sky-500 rounded-full animate-spin"></div>
                    <span>${esc(ui.syncLoginQrWaiting || 'Waiting for mobile authorization...')}</span>
                </div>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    ${esc(ui.syncLoginQrTimeRemaining || 'Expires in:')} <strong class="js-qr-timer">${remainingTime}</strong>
                </p>
            `;
        } else if (this._status === 'authorized') {
            statusContent = `
                <div class="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-bold">
                    <span class="text-lg">✓</span>
                    <span>${esc(ui.syncLoginQrAuthorized || 'Device authorized!')}</span>
                </div>
                ${this._username ? `<p class="text-xs text-slate-600 dark:text-slate-300 mt-1">${esc(this._username)}</p>` : ''}
            `;
        } else if (this._status === 'expired') {
            statusContent = `
                <div class="flex items-center justify-center gap-2 text-amber-600 dark:text-amber-400 text-sm">
                    <span class="text-lg">⏱</span>
                    <span>${esc(ui.syncLoginQrExpired || 'QR code expired. Please try again.')}</span>
                </div>
            `;
        } else if (this._status === 'error') {
            statusContent = `
                <div class="flex items-center justify-center gap-2 text-red-600 dark:text-red-400 text-sm">
                    <span class="text-lg">✗</span>
                    <span>${esc(this._errorMessage || ui.syncLoginQrError || 'Authorization failed.')}</span>
                </div>
            `;
        }

        const qrSection = this._qrDataUrl
            ? `<div class="flex justify-center p-4 bg-white rounded-xl border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-950">
                <img src="${escAttr(this._qrDataUrl)}" alt="QR Code" class="w-48 h-48" />
            </div>`
            : `<div class="flex justify-center p-8 bg-slate-100 rounded-xl dark:bg-slate-800">
                <span class="text-slate-400">${esc(ui.syncLoginQrGenerating || 'Generating...')}</span>
            </div>`;

        this.innerHTML = `
            <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950 p-4 animate-in fade-in arborito-modal-root">
                <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-800 cursor-auto relative overflow-hidden flex flex-col">
                    <div class="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
                        <h2 class="text-lg font-bold text-slate-800 dark:text-white">
                            ${esc(ui.syncLoginQrSignalTitle || 'Sign in with QR')}
                        </h2>
                        <button type="button" class="js-close-modal text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    
                    <div class="p-6 space-y-4">
                        <p class="text-sm text-slate-600 dark:text-slate-300 text-center">
                            ${esc(ui.syncLoginQrSignalInstructions || 'Open Arborito on your mobile device, go to Profile, and scan this QR code to sign in.')}
                        </p>
                        
                        ${qrSection}
                        
                        <div class="text-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                            ${statusContent}
                        </div>
                        
                        <div class="text-xs text-slate-400 dark:text-slate-500 text-center space-y-1">
                            <p>${esc(ui.syncLoginQrSignalHint1 || 'Make sure you are signed in on your mobile device.')}</p>
                            <p>${esc(ui.syncLoginQrSignalHint2 || 'This QR code is for one-time use only.')}</p>
                        </div>
                    </div>
                    
                    <div class="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                        <button type="button" class="js-cancel-btn w-full py-2.5 px-4 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition">
                            ${esc(ui.syncLoginQrCancel || 'Cancel')}
                        </button>
                    </div>
                </div>
            </div>
        `;

        this._bindEvents();
    }

    _bindEvents() {
        this.querySelector('.js-close-modal')?.addEventListener('click', () => {
            this._cancelAndClose();
        });

        this.querySelector('.js-cancel-btn')?.addEventListener('click', () => {
            this._cancelAndClose();
        });
    }

    _cancelAndClose() {
        this._stopPolling();
        this._stopExpiryTimer();
        if (this._sessionId) {
            store.cancelQrSignalingSession(this._sessionId).catch(() => {});
        }
        store.dismissModal();
    }
}

customElements.define('arborito-modal-qr-signal-login', ArboritoModalQrSignalLogin);
