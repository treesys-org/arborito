import { useIdentityAuth } from '../hooks/useIdentityAuth.js';

/**
 * Sync secret presentation: code-first, with QR pairing for new devices, and the file as a backup action.
 */
export function SyncLoginTriad({
    username = '',
    plainSecret = '',
    qrDataUrl = '',
    profileMasking = false,
    codeRevealed = false,
    qrRevealed = false,
    onRevealCode,
    onToggleQr,
}) {
    const { ui, notify, identityActions } = useIdentityAuth();
    const { downloadSyncSecretFile } = identityActions;
    const code = String(plainSecret || '').trim();
    const user = String(username || '').trim();
    const qr = String(qrDataUrl || '').trim();
    const hasSecret = !!code;
    const hasQr = !!qr;

    const title = ui.syncLoginAccessKeyTitle || 'Your access key';
    const copyLabel = ui.syncLoginCopyCode || 'Copy code';
    const showCodeLabel = ui.syncLoginShowCodeCta || 'Show code';
    const dlLabel = ui.syncLoginDownloadFile || 'Download backup';
    const showQrLabel = ui.syncLoginShowQrCta || 'Show QR to pair a device';
    const hideQrLabel = ui.syncLoginHideQrCta || 'Hide QR';
    const qrHint =
        ui.syncLoginQrPairHint ||
        'Open Arborito on the other device, choose "Scan QR from another device" and aim its camera here.';

    const maskedLen = hasSecret ? Math.min(Math.max(code.length, 12), 48) : 24;
    const maskedDisplay = '•'.repeat(maskedLen);

    const handleCopy = async () => {
        if (!code) return;
        try {
            await navigator.clipboard.writeText(code);
            notify(ui.syncLoginCopied || 'Code copied.', false);
        } catch {
            notify(ui.syncLoginCopyFail || 'Could not copy.', true);
        }
    };

    const handleDownload = () => {
        if (!hasSecret || !user) return;
        downloadSyncSecretFile(user, code);
    };

    let codeFace;
    if (!hasSecret) {
        codeFace = (
            <p className="m-0 break-all text-center font-mono text-sm font-bold leading-snug text-slate-500 dark:text-slate-400">
                {ui.syncLoginSecretNotInSession ||
                    'Secret not kept in this session. Sign in again with your code or generate a new one below.'}
            </p>
        );
    } else if (profileMasking && !codeRevealed) {
        codeFace = (
            <p
                className="js-sync-triad-code-face m-0 select-none break-all text-center font-mono text-lg font-extrabold leading-snug tracking-tight text-slate-700 dark:text-slate-200 sm:text-xl"
                aria-hidden="true"
            >
                {maskedDisplay}
            </p>
        );
    } else {
        codeFace = (
            <p className="js-sync-triad-code-face m-0 break-all text-center font-mono text-lg font-extrabold leading-snug tracking-tight text-slate-900 select-all dark:text-slate-50 sm:text-xl">
                {code}
            </p>
        );
    }

    let primaryBtn;
    if (!hasSecret) {
        primaryBtn = (
            <button
                type="button"
                disabled
                className="mt-4 w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 py-3.5 text-sm font-bold uppercase tracking-wide text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
            >
                {showCodeLabel}
            </button>
        );
    } else if (profileMasking && !codeRevealed) {
        primaryBtn = (
            <button
                type="button"
                className="js-profile-sync-code-toggle mt-4 w-full rounded-xl arborito-cta-emerald py-3.5 text-sm font-black uppercase tracking-wide shadow-md shadow-emerald-600/20 transition-all active:scale-[0.99]"
                onClick={onRevealCode}
            >
                {showCodeLabel}
            </button>
        );
    } else {
        primaryBtn = (
            <button
                type="button"
                className="js-sync-triad-copy mt-4 w-full rounded-xl arborito-cta-emerald py-3.5 text-sm font-black uppercase tracking-wide shadow-md shadow-emerald-600/20 transition-all active:scale-[0.99]"
                onClick={() => void handleCopy()}
            >
                {copyLabel}
            </button>
        );
    }

    return (
        <div className="sync-login-triad">
            <input type="hidden" className="js-sync-triad-user" value={user} readOnly />
            <input type="hidden" className="js-sync-triad-secret" value={code} readOnly />
            <p className="arborito-eyebrow m-0 mb-3 text-center">{title}</p>
            <div className="rounded-2xl border-2 border-emerald-200/90 bg-white px-4 py-5 shadow-sm dark:border-emerald-800/80 dark:bg-slate-950/90">
                {codeFace}
                {primaryBtn}
            </div>
            {hasQr ? (
                <div className="mt-4 rounded-2xl border-2 border-violet-200/90 bg-white px-4 py-4 shadow-sm dark:border-violet-800/80 dark:bg-slate-950/90">
                    {qrRevealed ? (
                        <div className="flex flex-col items-center gap-3">
                            <img
                                src={qr}
                                alt=""
                                className="h-44 w-44 rounded-md border border-slate-200 bg-white p-1 dark:border-slate-700"
                            />
                            <p className="m-0 text-center text-[11px] leading-snug text-slate-600 dark:text-slate-300">
                                {qrHint}
                            </p>
                            <button
                                type="button"
                                className="js-profile-sync-qr-toggle w-full rounded-xl border border-violet-300 bg-white py-2 text-xs font-bold uppercase tracking-wide text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:bg-slate-950 dark:text-violet-300 dark:hover:bg-violet-900/30"
                                onClick={onToggleQr}
                            >
                                {hideQrLabel}
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            className="js-profile-sync-qr-toggle w-full rounded-xl bg-violet-600 py-3 text-sm font-black uppercase tracking-wide text-white shadow-md shadow-violet-600/20 transition-all hover:bg-violet-500 active:scale-[0.99]"
                            onClick={onToggleQr}
                        >
                            <span className="mr-2" aria-hidden="true">
                                📱
                            </span>
                            {showQrLabel}
                        </button>
                    )}
                </div>
            ) : null}
            <div className="mt-4 flex flex-col items-center sm:justify-center">
                <button
                    type="button"
                    className={`js-sync-triad-download flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2.5 text-xs font-semibold text-sky-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50 dark:text-sky-300 dark:hover:bg-slate-800/80${!hasSecret ? ' disabled opacity-50 cursor-not-allowed' : ''}`}
                    disabled={!hasSecret}
                    onClick={handleDownload}
                >
                    <span className="text-base leading-none" aria-hidden="true">
                        ⬇
                    </span>
                    <span>{dlLabel}</span>
                </button>
            </div>
        </div>
    );
}
