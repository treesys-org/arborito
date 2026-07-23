import { useIdentityAuth } from '../hooks/useIdentityAuth.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { CompactDialogShell } from '../../../shared/ui/CompactDialogShell.jsx';
import { MODAL_CTA_CANCEL, modalCtaConfirm } from '../../../shared/ui/modal-action-chrome.js';
import { Callout } from '../../../shared/ui/Callout.jsx';
import { LoadingRow } from '../../../shared/ui/Loading.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { detectQrOnce, isBarcodeDetectorAvailable } from '../api/identity-qr.js';
import { parseRecoveryKitFromText } from '../api/recovery-kit.js';
import { completeOnboardingWizard } from '../api/onboarding-complete.js';

function QrVideoFrame({ frameTone, videoRef }) {
    const borderCls = frameTone === 'amber'
        ? 'border-amber-400/80'
        : 'border-emerald-400/80';

    return (
        <div
            className={`relative w-full overflow-hidden rounded-2xl border-2 ${borderCls} bg-black aspect-[4/3] max-h-[min(42vh,280px)]`}
        >
            <video
                ref={videoRef}
                className="h-full w-full object-cover"
                playsInline
                muted
            />
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
    const statusRef = useRef('idle');
    /** @type {['idle'|'starting'|'scanning'|'signing-in'|'success'|'error'|'unsupported', import('react').Dispatch<import('react').SetStateAction<'idle'|'starting'|'scanning'|'signing-in'|'success'|'error'|'unsupported'>>]} */
    const [status, setStatus] = useState('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [cameraRetryable, setCameraRetryable] = useState(true);

    const fromProfile = modal && typeof modal === 'object' && modal.fromProfile;

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
        if (fromProfile) {
            setModal({ type: 'profile' });
            return;
        }
        dismissModal();
    }, [dismissModal, fromProfile, modal, setModal]);

    const handleDetectedQrText = useCallback(async (text) => {
        let parsed = await parseRecoveryKitFromText(text);
        if (!parsed) {
            setStatus('error');
            setErrorMessage(ui.syncLoginQrUnreadable || ui.qrSyncQrUnreadable || 'That QR is not a sync code.');
            return;
        }
        setStatus('signing-in');
        tearDownStream();
        try {
            await signInWithSyncSecret(parsed.username, parsed.password);
            setStatus('success');
            const fromOnb = modal && typeof modal === 'object' && modal.fromOnboarding;
            setTimeout(() => {
                if (fromOnb) {
                    completeOnboardingWizard({ setModal });
                } else {
                    setModal(null);
                }
            }, 1200);
        } catch (e) {
            setStatus('error');
            setErrorMessage(String((e && e.message) || e));
        }
    }, [tearDownStream, ui.syncLoginQrUnreadable, signInWithSyncSecret, modal, setModal]);

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

    const startCamera = useCallback(async () => {
        stopRequestedRef.current = false;
        setErrorMessage('');
        setStatus('starting');

        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
            setStatus('error');
            setCameraRetryable(false);
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
                setCameraRetryable(true);
                setErrorMessage(
                    ui.syncLoginQrPermissionDenied ||
                    'Camera permission was denied. Allow it in your browser/OS settings, then tap “Try camera again”.'
                );
            } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
                setCameraRetryable(false);
                setErrorMessage(
                    ui.syncLoginQrNoCamera ||
                    'No camera was found on this device. You can sign in manually with your username and secret instead.'
                );
            } else if (name === 'NotReadableError' || name === 'TrackStartError') {
                setCameraRetryable(true);
                setErrorMessage(
                    ui.syncLoginQrCameraBusy ||
                    'The camera is being used by another app. Close it and try again.'
                );
            } else {
                setCameraRetryable(true);
                setErrorMessage(String((e && e.message) || e));
            }
        }
    }, [ui]);

    useEffect(() => {
        return () => {
            stopRequestedRef.current = true;
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = 0;
            tearDownStream();
        };
    }, [tearDownStream]);

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

    const title = ui.syncLoginScanQrTitle || ui.qrSyncScanCta || ui.syncLoginScanQrCtaShort || 'Scan sync QR';
    const lead = mobile
        ? ui.qrSyncScanLeadMobile ||
          ui.recoveryKeyScanQrLead ||
          'On your signed-in device open Profile → “Sync with QR”, then aim this camera at the code.'
        : ui.qrSyncScanLeadDesktop ||
          ui.syncLoginScanQrLead ||
          'Open Profile on your phone or tablet → “Sync with QR”, then scan the code with this camera.';
    const cancelLb = ui.syncLoginQrCancel || ui.cancel || 'Cancel';
    const allowCameraLb = ui.syncLoginScanQrAllowCameraCta || 'Allow camera';
    const retryCameraLb = ui.syncLoginScanQrRetryCameraCta || 'Try camera again';

    const showPrimaryCamera =
        status === 'idle' || (status === 'error' && cameraRetryable);
    const primaryCameraLb = status === 'idle' ? allowCameraLb : retryCameraLb;
    const primaryBusy = status === 'starting' || status === 'signing-in' || status === 'success';

    let spotlight = null;
    if (status === 'idle') {
        spotlight = (
            <div className="arborito-dialog-spotlight" aria-hidden="true">
                <ChromeEmoji emoji="📷" size={52} className="arborito-dialog-spotlight__emoji" />
                <p className="arborito-dialog-spotlight__label">
                    {ui.syncLoginScanQrAllowCameraBody ||
                        'To read the QR we need camera access. Tap the button below, your browser will ask for permission.'}
                </p>
            </div>
        );
    } else if (status === 'starting') {
        spotlight = (
            <div className="arborito-dialog-spotlight">
                <LoadingRow
                    label={ui.syncLoginScanQrStarting || 'Starting camera…'}
                    tone="sky"
                    size="sm"
                    extraClass="justify-center"
                />
            </div>
        );
    } else if (status === 'scanning') {
        spotlight = (
            <div className="arborito-dialog-spotlight w-full">
                <QrVideoFrame frameTone="emerald" videoRef={videoRef} />
                <p className="arborito-dialog-spotlight__label m-0">
                    {ui.syncLoginScanQrAim || 'Center the QR inside the green frame.'}
                </p>
            </div>
        );
    } else if (status === 'unsupported') {
        spotlight = (
            <div className="arborito-dialog-spotlight w-full space-y-3">
                <QrVideoFrame frameTone="amber" videoRef={videoRef} />
                <Callout
                    tone="amber"
                    body={
                        ui.syncLoginScanQrUnsupported ||
                        'This browser cannot scan QR codes. Use the form below with your username and secret instead.'
                    }
                />
            </div>
        );
    } else if (status === 'signing-in') {
        spotlight = (
            <div className="arborito-dialog-spotlight">
                <LoadingRow
                    label={ui.syncLoginScanQrSigningIn || 'Signing in…'}
                    tone="sky"
                    size="sm"
                    extraClass="justify-center font-bold"
                />
            </div>
        );
    } else if (status === 'success') {
        spotlight = (
            <div className="arborito-dialog-spotlight">
                <ChromeEmoji emoji="✅" size={52} className="arborito-dialog-spotlight__emoji" />
                <p className="arborito-dialog-spotlight__label m-0">
                    {ui.syncLoginScanQrSuccess || 'Signed in.'}
                </p>
            </div>
        );
    } else {
        spotlight = (
            <div className="arborito-dialog-spotlight w-full">
                <Callout
                    tone="red"
                    body={errorMessage || ui.syncLoginQrError || 'Could not read the QR.'}
                />
            </div>
        );
    }

    return (
        <CompactDialogShell
            ui={ui}
            mobile={mobile}
            title={title}
            leadingIcon="📷"
            panelDataAttr="modal-sync-login-qr-scanner"
            backTagClass="btn-sync-qr-back"
            closeTagClass="btn-sync-qr-close"
            onClose={handleCancel}
            onBackdropClick={handleCancel}
            footer={
                <div className="arborito-modal-footer arborito-modal-footer--bg-flat">
                    <div className="arborito-action-row w-full">
                        <button
                            type="button"
                            className={MODAL_CTA_CANCEL}
                            onClick={handleCancel}
                            disabled={primaryBusy}
                        >
                            {cancelLb}
                        </button>
                        {showPrimaryCamera ? (
                            <button
                                type="button"
                                className={modalCtaConfirm('emerald')}
                                onClick={() => void startCamera()}
                                disabled={primaryBusy}
                                aria-busy={status === 'starting' ? 'true' : undefined}
                            >
                                {primaryCameraLb}
                            </button>
                        ) : null}
                    </div>
                </div>
            }
        >
            <div className="arborito-dialog-body-block flex flex-col shrink-0 mb-3 items-start text-left w-full">
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed whitespace-pre-line w-full m-0">
                    {lead}
                </p>
            </div>

            {spotlight}
        </CompactDialogShell>
    );
}
