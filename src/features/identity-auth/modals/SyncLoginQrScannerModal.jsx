import { useIdentityAuth } from '../hooks/useIdentityAuth.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { ModalCenteredShell } from '../../../app/components/ModalShell.jsx';
import { Callout } from '../../../shared/ui/Callout.jsx';
import { LoadingRow } from '../../../shared/ui/Loading.jsx';
import { detectQrOnce, isBarcodeDetectorAvailable } from '../api/identity-qr.js';
import { parseSyncLoginFromText } from '../api/sync-login-secret.js';

function QrVideoFrame({ frameTone, videoRef }) {
    const borderCls = frameTone === 'amber'
        ? 'border-amber-400/80'
        : 'border-emerald-400/80';

    return (
        <div className="relative overflow-hidden rounded-2xl border-2 border-slate-200 bg-black aspect-square dark:border-slate-700">
            <video
                ref={videoRef}
                className="absolute inset-0 h-full w-full object-cover"
                playsInline
                muted
            />
            <div className={`absolute inset-6 rounded-xl border-2 ${borderCls} shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]`} />
        </div>
    );
}

export function ModalSyncLoginQrScanner() {
    const { ui, dismissModal, setModal, identityActions, modal } = useIdentityAuth();
    const { signInWithSyncSecret } = identityActions;
    const mobile = shouldShowMobileUI();
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const rafRef = useRef(0);
    const stopRequestedRef = useRef(false);
    const statusRef = useRef('starting');
    /** @type {['starting'|'scanning'|'signing-in'|'success'|'error'|'unsupported', import('react').Dispatch<import('react').SetStateAction<'starting'|'scanning'|'signing-in'|'success'|'error'|'unsupported'>>]} */
    const [status, setStatus] = useState('starting');
    const [errorMessage, setErrorMessage] = useState('');

    statusRef.current = status;

    const tearDownStream = useCallback(() => {
        const stream = streamRef.current;
        if (stream) {
            for (const t of stream.getTracks()) t.stop();
            streamRef.current = null;
        }
    }, []);

    const handleCancel = useCallback(() => {
        const m = modal;
        const fromOnb = m && typeof m === 'object' && m.fromOnboarding;
        if (fromOnb) {
            const hint = typeof fromOnb === 'object' ? fromOnb : {};
            const payload = { type: 'onboarding' };
            if (Number(hint.step) === 2) payload.step = 2;
            if (hint.view) payload.view = hint.view;
            setModal(payload);
            return;
        }
        const fromProfile = m && typeof m === 'object' && m.fromProfile;
        if (fromProfile) {
            setModal({ type: 'profile' });
            return;
        }
        dismissModal();
    }, [dismissModal, modal, setModal]);

    const handleDetectedQrText = useCallback(async (text) => {
        const parsed = parseSyncLoginFromText(text);
        if (!parsed) {
            setStatus('error');
            setErrorMessage(ui.syncLoginQrUnreadable || 'That QR is not a credentials code.');
            return;
        }
        setStatus('signing-in');
        tearDownStream();
        try {
            await signInWithSyncSecret(parsed.username, parsed.secret);
            setStatus('success');
            setTimeout(() => setModal(null), 1200);
        } catch (e) {
            setStatus('error');
            setErrorMessage(String((e && e.message) || e));
        }
    }, [tearDownStream, ui.syncLoginQrUnreadable]);

    const scanLoop = useCallback((video) => {
        const tick = async () => {
            if (stopRequestedRef.current || statusRef.current !== 'scanning') return;
            if (video.readyState >= 2 && video.videoWidth > 0) {
                try {
                    const raw = await detectQrOnce(video);
                    if (raw) {
                        await handleDetectedQrText(raw);
                        return;
                    }
                } catch {
                    /* keep scanning */
                }
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
    }, [handleDetectedQrText]);

    useEffect(() => {
        stopRequestedRef.current = false;
        setStatus('starting');

        const startCamera = async () => {
            if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
                setStatus('error');
                setErrorMessage(
                    ui.syncLoginQrNoMediaDevices ||
                    'This context cannot access the camera. Open the app over HTTPS (or in the desktop build) and try again.'
                );
                return;
            }
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: { facingMode: { ideal: 'environment' } },
                });
                if (stopRequestedRef.current) {
                    for (const t of stream.getTracks()) t.stop();
                    return;
                }
                streamRef.current = stream;
                setStatus(isBarcodeDetectorAvailable() ? 'scanning' : 'unsupported');
            } catch (e) {
                setStatus('error');
                const name = (e && e.name) || '';
                if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
                    setErrorMessage(
                        ui.syncLoginQrPermissionDenied ||
                        'Camera permission was denied. Allow it in your browser/OS settings and reopen this screen.'
                    );
                } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
                    setErrorMessage(
                        ui.syncLoginQrNoCamera ||
                        'No camera was found on this device. You can sign in manually with your username and secret instead.'
                    );
                } else if (name === 'NotReadableError' || name === 'TrackStartError') {
                    setErrorMessage(
                        ui.syncLoginQrCameraBusy ||
                        'The camera is being used by another app. Close it and try again.'
                    );
                } else {
                    setErrorMessage(String((e && e.message) || e));
                }
            }
        };

        void startCamera();

        return () => {
            stopRequestedRef.current = true;
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = 0;
            tearDownStream();
        };
    }, [tearDownStream, ui]);

    useEffect(() => {
        if (status !== 'scanning' && status !== 'unsupported') return undefined;
        const video = videoRef.current;
        const stream = streamRef.current;
        if (!video || !stream) return undefined;
        video.srcObject = stream;
        video.play().catch(() => {});
        if (status === 'scanning') {
            scanLoop(video);
        }
        return () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = 0;
            }
        };
    }, [scanLoop, status]);

    const title = ui.syncLoginScanQrTitle || 'Scan a QR from your signed-in device';
    const lead =
        ui.syncLoginScanQrLead ||
        'Open Profile on the device that is already signed in, choose "Show QR to pair a device", and aim the camera at the QR shown there.';
    const cancelLb = ui.syncLoginQrCancel || 'Cancel';

    let body;
    if (status === 'unsupported') {
        body = (
            <>
                <QrVideoFrame frameTone="amber" videoRef={videoRef} />
                <Callout
                    tone="amber"
                    body={
                        ui.syncLoginScanQrUnsupported ||
                        'Your browser doesn\u2019t support automatic QR detection (only Chromium-based browsers do for now). The camera works \u2014 to sign in, type your username and secret in the form below, or open this page in Chrome/Edge.'
                    }
                />
            </>
        );
    } else if (status === 'starting') {
        body = (
            <LoadingRow
                label={ui.syncLoginScanQrStarting || 'Starting camera…'}
                tone="sky"
                size="sm"
                extraClass="justify-center"
            />
        );
    } else if (status === 'scanning') {
        body = (
            <>
                <QrVideoFrame frameTone="emerald" videoRef={videoRef} />
                <p className="m-0 text-center text-xs text-slate-500 dark:text-slate-400">
                    {ui.syncLoginScanQrAim || 'Center the QR inside the green frame.'}
                </p>
            </>
        );
    } else if (status === 'signing-in') {
        body = (
            <LoadingRow
                label={ui.syncLoginScanQrSigningIn || 'Signing in…'}
                tone="sky"
                size="sm"
                extraClass="justify-center font-bold"
            />
        );
    } else if (status === 'success') {
        body = (
            <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-bold">
                <span className="text-lg">✓</span>
                <span>{ui.syncLoginScanQrSuccess || 'Signed in.'}</span>
            </div>
        );
    } else {
        body = (
            <Callout
                tone="red"
                body={errorMessage || ui.syncLoginQrError || 'Could not read the QR.'}
            />
        );
    }

    return (
        <ModalCenteredShell
            mobile={mobile}
            sizeTier="XS"
            onBackdropClick={handleCancel}
        >
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">{title}</h2>
                <button
                    type="button"
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    aria-label={ui.close || 'Close'}
                    onClick={handleCancel}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <div className="p-5 space-y-4">
                <p className="text-sm text-slate-600 dark:text-slate-300 m-0">{lead}</p>
                {body}
            </div>
            <div className="arborito-modal-footer arborito-modal-footer--bg-flat">
                <button
                    type="button"
                    className="arborito-cta-slate w-full py-2.5 px-4 rounded-lg font-semibold"
                    onClick={handleCancel}
                >
                    {cancelLb}
                </button>
            </div>
        </ModalCenteredShell>
    );
}
