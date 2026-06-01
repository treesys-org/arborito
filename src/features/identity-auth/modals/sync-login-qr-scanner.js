/**
 * Scan a credentials QR shown on the user's already-signed-in device (PC or otherwise) and
 * sign this device in directly. Direction-flipped pairing: the authorized device displays the
 * QR (see `syncLoginTriadMarkup`), this modal reads it with the device camera.
 */

import { store } from '../../../core/store.js';
import { ArboritoComponent } from '../../../shared/ui/component.js';
import { escHtml as esc } from '../../../shared/lib/html-escape.js';
import { detectQrOnce, isBarcodeDetectorAvailable } from '../identity-qr.js';
import { parseSyncLoginFromText } from '../sync-login-secret.js';
import { modalShellHtml } from '../../../shared/ui/modal-shell.js';

class ArboritoModalSyncLoginQrScanner extends ArboritoComponent {
    constructor() {
        super();
        this.lastRenderKey = null;
        /** @type {'idle'|'starting'|'scanning'|'signing-in'|'success'|'error'|'unsupported'} */
        this._status = 'idle';
        this._errorMessage = '';
        /** @type {MediaStream|null} */
        this._stream = null;
        this._rafId = 0;
        this._stopRequested = false;
    }

    connectedCallback() {
        /* Always try to request camera permission first — even if BarcodeDetector
         * isn't available — so the user sees the browser permission prompt instead
         * of an unexplained "this browser cannot scan QR codes" wall. If the camera
         * works but auto-detection isn't supported, we still show the live preview
         * and a hint to use Chromium-based browsers (or fall back to manual login). */
        this._status = 'starting';
        this.render();
        void this._startCamera();
    }

    disconnectedCallback() {
        this._stopRequested = true;
        if (this._rafId) cancelAnimationFrame(this._rafId);
        this._rafId = 0;
        this._tearDownStream();
    }

    /** Cancel button / close X / Cancel CTA handler. If the scanner was
     * opened from the onboarding wizard (`m.fromOnboarding`), reopen
     * onboarding at the recorded view instead of just dismissing — the
     * user could otherwise end up on a blank canvas with no tree and no
     * identity. */
    _handleCancel() {
        const m = store.value && store.value.modal;
        const fromOnb = m && typeof m === 'object' && m.fromOnboarding;
        if (fromOnb) {
            const hint = typeof fromOnb === 'object' ? fromOnb : {};
            const payload = { type: 'onboarding' };
            if (Number(hint.step) === 2) payload.step = 2;
            if (hint.view) payload.view = hint.view;
            store.setModal(payload);
            return;
        }
        store.dismissModal();
    }

    _tearDownStream() {
        if (this._stream) {
            for (const t of this._stream.getTracks()) t.stop();
            this._stream = null;
        }
    }

    async _startCamera() {
        const ui = store.ui;
        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
            this._status = 'error';
            this._errorMessage =
                ui.syncLoginQrNoMediaDevices ||
                'This context cannot access the camera. Open the app over HTTPS (or in the desktop build) and try again.';
            this.render();
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: { facingMode: { ideal: 'environment' } }
            });
            if (this._stopRequested) {
                for (const t of stream.getTracks()) t.stop();
                return;
            }
            this._stream = stream;
            /* If the browser lacks the BarcodeDetector API we still show the live preview
             * so the user knows the camera works; we just can't auto-decode the QR. */
            this._status = isBarcodeDetectorAvailable() ? 'scanning' : 'unsupported';
            this.render();
            const video = this.querySelector('video');
            if (!video) return;
            video.srcObject = stream;
            await video.play().catch(() => {});
            if (this._status === 'scanning') this._scanLoop(video);
        } catch (e) {
            this._status = 'error';
            const name = (e && e.name) || '';
            if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
                this._errorMessage =
                    ui.syncLoginQrPermissionDenied ||
                    'Camera permission was denied. Allow it in your browser/OS settings and reopen this screen.';
            } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
                this._errorMessage =
                    ui.syncLoginQrNoCamera ||
                    'No camera was found on this device. You can sign in manually with your username and secret instead.';
            } else if (name === 'NotReadableError' || name === 'TrackStartError') {
                this._errorMessage =
                    ui.syncLoginQrCameraBusy ||
                    'The camera is being used by another app. Close it and try again.';
            } else {
                this._errorMessage = String((e && e.message) || e);
            }
            this.render();
        }
    }

    _scanLoop(video) {
        const tick = async () => {
            if (this._stopRequested || this._status !== 'scanning') return;
            if (video.readyState >= 2 && video.videoWidth > 0) {
                try {
                    const raw = await detectQrOnce(video);
                    if (raw) {
                        await this._handleDetectedQrText(raw);
                        return;
                    }
                } catch { /* keep scanning */ }
            }
            this._rafId = requestAnimationFrame(tick);
        };
        this._rafId = requestAnimationFrame(tick);
    }

    async _handleDetectedQrText(text) {
        const parsed = parseSyncLoginFromText(text);
        if (!parsed) {
            this._status = 'error';
            this._errorMessage = store.ui.syncLoginQrUnreadable || 'That QR is not a credentials code.';
            this.render();
            return;
        }
        this._status = 'signing-in';
        this.render();
        this._tearDownStream();
        try {
            await store.signInWithSyncSecret(parsed.username, parsed.secret);
            this._status = 'success';
            this.render();
            /* Bypass `dismissModal`'s onboarding-redirect path: we just
             * signed in, so the user should land on the canvas (or the
             * auto-loaded tree), not back on the onboarding step. */
            setTimeout(() => store.setModal(null), 1200);
        } catch (e) {
            this._status = 'error';
            this._errorMessage = String((e && e.message) || e);
            this.render();
        }
    }

    render() {
        const ui = store.ui;
        const key = `${this._status}|${this._errorMessage}`;
        if (key === this.lastRenderKey) return;
        this.lastRenderKey = key;

        const title = esc(ui.syncLoginScanQrTitle || 'Scan a QR from your signed-in device');
        const lead = esc(
            ui.syncLoginScanQrLead ||
                'Open Profile on the device that is already signed in, choose "Show QR to pair a device", and aim the camera at the QR shown there.'
        );
        const cancelLb = esc(ui.syncLoginQrCancel || 'Cancel');

        let body = '';
        if (this._status === 'unsupported') {
            /* Camera works but BarcodeDetector isn't available — show the live preview
             * (the user can decide to type credentials manually) and explain *why* auto-detect
             * doesn't work, instead of vaguely blaming "the browser". */
            body = `<div class="relative overflow-hidden rounded-2xl border-2 border-slate-200 bg-black aspect-square dark:border-slate-700">
                <video class="absolute inset-0 h-full w-full object-cover" playsinline muted></video>
                <div class="absolute inset-6 rounded-xl border-2 border-amber-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]"></div>
            </div>
            <div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                ${esc(ui.syncLoginScanQrUnsupported || 'Your browser doesn\u2019t support automatic QR detection (only Chromium-based browsers do for now). The camera works \u2014 to sign in, type your username and secret in the form below, or open this page in Chrome/Edge.')}
            </div>`;
        } else if (this._status === 'starting') {
            body = `<div class="flex items-center justify-center gap-2 text-slate-600 dark:text-slate-300 text-sm">
                <div class="w-4 h-4 border-2 border-slate-300 border-t-sky-500 rounded-full animate-spin"></div>
                <span>${esc(ui.syncLoginScanQrStarting || 'Starting camera…')}</span>
            </div>`;
        } else if (this._status === 'scanning') {
            body = `<div class="relative overflow-hidden rounded-2xl border-2 border-slate-200 bg-black aspect-square dark:border-slate-700">
                <video class="absolute inset-0 h-full w-full object-cover" playsinline muted></video>
                <div class="absolute inset-6 rounded-xl border-2 border-emerald-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]"></div>
            </div>
            <p class="m-0 text-center text-xs text-slate-500 dark:text-slate-400">${esc(ui.syncLoginScanQrAim || 'Center the QR inside the green frame.')}</p>`;
        } else if (this._status === 'signing-in') {
            body = `<div class="flex items-center justify-center gap-2 text-sky-600 dark:text-sky-400 text-sm font-bold">
                <div class="w-4 h-4 border-2 border-slate-300 border-t-sky-500 rounded-full animate-spin"></div>
                <span>${esc(ui.syncLoginScanQrSigningIn || 'Signing in…')}</span>
            </div>`;
        } else if (this._status === 'success') {
            body = `<div class="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-bold">
                <span class="text-lg">✓</span>
                <span>${esc(ui.syncLoginScanQrSuccess || 'Signed in.')}</span>
            </div>`;
        } else {
            body = `<div class="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
                ${esc(this._errorMessage || ui.syncLoginQrError || 'Could not read the QR.')}
            </div>`;
        }

        const panelBody = `
                    <div class="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
                        <h2 class="text-lg font-bold text-slate-800 dark:text-white">${title}</h2>
                        <button type="button" class="js-close-modal text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition" aria-label="${esc(ui.close || 'Close')}">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    <div class="p-5 space-y-4">
                        <p class="text-sm text-slate-600 dark:text-slate-300 m-0">${lead}</p>
                        ${body}
                    </div>
                    <div class="arborito-modal-footer arborito-modal-footer--bg-flat">
                        <button type="button" class="js-close-modal arborito-cta-slate w-full py-2.5 px-4 rounded-lg font-semibold">${cancelLb}</button>
                    </div>`;
        this.innerHTML = modalShellHtml({
            bodyHtml: panelBody,
            panelSize: 'xs auto-h',
        });

        this.querySelectorAll('.js-close-modal').forEach((b) => {
            b.addEventListener('click', () => this._handleCancel());
        });

        if (this._status === 'scanning' || this._status === 'unsupported') {
            const video = this.querySelector('video');
            if (video && this._stream) {
                video.srcObject = this._stream;
                video.play().catch(() => {});
            }
        }
    }
}

customElements.define('arborito-modal-sync-login-qr-scanner', ArboritoModalSyncLoginQrScanner);
