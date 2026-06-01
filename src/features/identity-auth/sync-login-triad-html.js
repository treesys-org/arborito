/**
 * Sync secret presentation: code-first, with QR pairing for new devices, and the file as a backup action.
 */

/**
 * @param {Record<string, string>} ui
 * @param {{ plainSecret: string, username: string, qrDataUrl?: string }} reveal
 * @param {(s: string) => string} escHtml
 * @param {(s: string) => string} escAttr
 * @param {{ profileMasking?: boolean, codeRevealed?: boolean, qrRevealed?: boolean }} [opts]
 */
export function syncLoginTriadMarkup(ui, reveal, escHtml, escAttr, opts = {}) {
    const code = String(reveal.plainSecret || '').trim();
    const user = String(reveal.username || '').trim();
    const qr = String(reveal.qrDataUrl || '').trim();
    const title = escHtml(ui.syncLoginAccessKeyTitle || 'Your access key');
    const copyLabel = escHtml(ui.syncLoginCopyCode || 'Copy code');
    const showCodeLabel = escHtml(ui.syncLoginShowCodeCta || 'Show code');
    const dlLabel = escHtml(ui.syncLoginDownloadFile || 'Download backup');
    const showQrLabel = escHtml(ui.syncLoginShowQrCta || 'Show QR to pair a device');
    const hideQrLabel = escHtml(ui.syncLoginHideQrCta || 'Hide QR');
    const qrHint = escHtml(
        ui.syncLoginQrPairHint ||
            'Open Arborito on the other device, choose "Scan QR from another device" and aim its camera here.'
    );

    const profileMasking = !!opts.profileMasking;
    const codeRevealed = !!opts.codeRevealed;
    const qrRevealed = !!opts.qrRevealed;
    const hasSecret = !!code;
    const hasQr = !!qr;

    const maskedLen = hasSecret ? Math.min(Math.max(code.length, 12), 48) : 24;
    const maskedDisplay = '•'.repeat(maskedLen);
    const codeParagraph = !hasSecret
        ? `<p class="m-0 break-all text-center font-mono text-sm font-bold leading-snug text-slate-500 dark:text-slate-400">${escHtml(
              ui.syncLoginSecretNotInSession || 'Secret not kept in this session. Sign in again with your code or generate a new one below.'
          )}</p>`
        : profileMasking && !codeRevealed
          ? `<p class="js-sync-triad-code-face m-0 select-none break-all text-center font-mono text-lg font-extrabold leading-snug tracking-tight text-slate-700 dark:text-slate-200 sm:text-xl" aria-hidden="true">${escHtml(maskedDisplay)}</p>`
          : `<p class="js-sync-triad-code-face m-0 break-all text-center font-mono text-lg font-extrabold leading-snug tracking-tight text-slate-900 select-all dark:text-slate-50 sm:text-xl">${escHtml(code)}</p>`;

    const primaryBtn = !hasSecret
        ? `<button type="button" disabled class="mt-4 w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 py-3.5 text-sm font-bold uppercase tracking-wide text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">${showCodeLabel}</button>`
        : profileMasking && !codeRevealed
          ? `<button type="button" class="js-profile-sync-code-toggle mt-4 w-full rounded-xl border-2 border-emerald-600 bg-emerald-600 py-3.5 text-sm font-black uppercase tracking-wide text-white shadow-md shadow-emerald-600/20 transition-all hover:bg-emerald-500 active:scale-[0.99]">${showCodeLabel}</button>`
          : `<button type="button" class="js-sync-triad-copy mt-4 w-full rounded-xl bg-emerald-600 py-3.5 text-sm font-black uppercase tracking-wide text-white shadow-md shadow-emerald-600/20 transition-all hover:bg-emerald-500 active:scale-[0.99]">${copyLabel}</button>`;

    const dlDisabled = !hasSecret ? 'disabled opacity-50 cursor-not-allowed' : '';

    /* QR pairing panel: only visible when there is a credential payload to show. The QR
     * is hidden behind a "show" toggle to avoid leaking the secret to a shoulder-surfer,
     * and includes a short hint about the new direction (this device shows, other scans). */
    const qrPanel = hasQr
        ? `<div class="mt-4 rounded-2xl border-2 border-violet-200/90 bg-white px-4 py-4 shadow-sm dark:border-violet-800/80 dark:bg-slate-950/90">
            ${
                qrRevealed
                    ? `<div class="flex flex-col items-center gap-3">
                        <img src="${escAttr(qr)}" alt="" class="h-44 w-44 rounded-md border border-slate-200 bg-white p-1 dark:border-slate-700" />
                        <p class="m-0 text-center text-[11px] leading-snug text-slate-600 dark:text-slate-300">${qrHint}</p>
                        <button type="button" class="js-profile-sync-qr-toggle w-full rounded-xl border border-violet-300 bg-white py-2 text-xs font-bold uppercase tracking-wide text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:bg-slate-950 dark:text-violet-300 dark:hover:bg-violet-900/30">${hideQrLabel}</button>
                    </div>`
                    : `<button type="button" class="js-profile-sync-qr-toggle w-full rounded-xl bg-violet-600 py-3 text-sm font-black uppercase tracking-wide text-white shadow-md shadow-violet-600/20 transition-all hover:bg-violet-500 active:scale-[0.99]"><span class="mr-2" aria-hidden="true">📱</span>${showQrLabel}</button>`
            }
        </div>`
        : '';

    return `<div class="sync-login-triad">
        <input type="hidden" class="js-sync-triad-user" value="${escAttr(user)}" />
        <input type="hidden" class="js-sync-triad-secret" value="${escAttr(code)}" />
        <p class="arborito-eyebrow m-0 mb-3 text-center">${title}</p>
        <div class="rounded-2xl border-2 border-emerald-200/90 bg-white px-4 py-5 shadow-sm dark:border-emerald-800/80 dark:bg-slate-950/90">
            ${codeParagraph}
            ${primaryBtn}
        </div>
        ${qrPanel}
        <div class="mt-4 flex flex-col items-center sm:justify-center">
            <button type="button" class="js-sync-triad-download flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2.5 text-xs font-semibold text-sky-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50 dark:text-sky-300 dark:hover:bg-slate-800/80 ${dlDisabled}">
                <span class="text-base leading-none" aria-hidden="true">⬇</span>
                <span>${dlLabel}</span>
            </button>
        </div>
    </div>`;
}

/**
 * Wire copy + download for triad markup (e.g. profile).
 * @param {ParentNode} root
 * @param {{ notify: (m: string, err?: boolean) => void, downloadSyncSecretFile: (u: string, s: string) => void, ui: { syncLoginCopied?: string, syncLoginCopyFail?: string } }} store
 */
export function bindSyncLoginTriadControls(root, store) {
    const ui = store.ui || {};
    root.querySelectorAll('.js-sync-triad-copy').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const host = btn.closest('.sync-login-triad');
            const sec = host ? host.querySelector('.js-sync-triad-secret') : null;
            const raw = sec && 'value' in sec ? String(sec.value || '') : '';
            if (!raw) return;
            try {
                await navigator.clipboard.writeText(raw);
                store.notify(ui.syncLoginCopied || 'Code copied.', false);
            } catch {
                store.notify(ui.syncLoginCopyFail || 'Could not copy.', true);
            }
        });
    });
    root.querySelectorAll('.js-sync-triad-download').forEach((btn) => {
        btn.addEventListener('click', () => {
            if (btn.hasAttribute('disabled')) return;
            const host = btn.closest('.sync-login-triad');
            const uEl = host ? host.querySelector('.js-sync-triad-user') : null;
            const sEl = host ? host.querySelector('.js-sync-triad-secret') : null;
            const u = uEl && 'value' in uEl ? String(uEl.value || '').trim() : '';
            const s = sEl && 'value' in sEl ? String(sEl.value || '').trim() : '';
            if (u && s) store.downloadSyncSecretFile(u, s);
        });
    });
}
