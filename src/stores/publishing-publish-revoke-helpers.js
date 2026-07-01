import { getArboritoStore } from '../core/store-singleton.js';
import { isNostrNetworkAvailable, parseNostrTreeUrl, formatNostrTreeUrl, createNostrPair } from '../features/nostr/api/nostr-refs.js';
import { fileSystem } from '../features/backup-export/api/filesystem.js';
import { generateTreeShareCode } from '../features/sources/api/share-code.js';
import { randomUUIDSafe } from '../shared/lib/secure-web-crypto.js';
import { ensureConnectedNostr } from '../shared/lib/connected-services/index.js';
import { yieldToPaint } from '../shared/lib/yield-to-paint.js';
import { usesGlobalDirectoryPointerForTorrent } from '../features/p2p-webtorrent/api/global-directory-torrent-runtime.js';
import { escHtml as esc, escHtml as escAttr } from '../shared/lib/html-escape.js';

export function shell() {
    return getArboritoStore();
}

/**
 * Scrollable monospace preview + open / copy actions for publish-success dialog HTML.
 * @param {Record<string, string>} ui
 * @param {string} url
 * @param {string} sectionLabelEsc
 * @param {'emerald' | 'slate'} tone
 * @param {string} [firstLineExtraClass]
 */
export function publishDialogLinkSectionHtml(ui, url, sectionLabelEsc, tone, firstLineExtraClass = '') {
    const href = escAttr(url);
    const openL = esc(ui.publicTreeSuccessOpenLink || 'Open link');
    const copyL = esc(ui.publicTreeSuccessCopyLink || 'Copy');
    const box =
        tone === 'emerald'
            ? 'border-emerald-200/90 dark:border-emerald-800/50 bg-emerald-50/95 dark:bg-emerald-950/35'
            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60';
    const aTone =
        tone === 'emerald'
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-slate-600 dark:text-slate-300';
    const extra = firstLineExtraClass ? ' ' + firstLineExtraClass : '';
    return (
        '<p class="arborito-eyebrow m-0 mb-1' + extra + '">' + sectionLabelEsc + '</p>' +
        '<div class="max-h-28 w-full max-w-full overflow-auto overscroll-contain rounded-lg border ' + box + ' p-2 text-left">' +
        '<code class="block m-0 text-[11px] font-mono text-slate-700 dark:text-slate-200 break-all whitespace-pre-wrap leading-snug">' + esc(url) + '</code></div>' +
        '<p class="flex flex-wrap gap-3 justify-center items-center m-0 mt-2">' +
        '<a href="' + href + '" target="_blank" rel="noopener noreferrer" class="text-sm font-semibold ' + aTone + ' underline">' + openL + '</a>' +
        '<button type="button" data-copy="' + escAttr(url) + '" class="text-sm font-semibold px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 hover:opacity-90 active:scale-[0.98]">' + copyL + '</button></p>'
    );
}

/**
 * @param {unknown} err
 * @returns {{ kind: 'timeout' | 'event-package' | 'forbidden' | 'relay' | 'generic', detail: string }}
 */
export function classifyPublishNetworkError(err) {
    if (err && err.code === 'pub-timeout') return { kind: 'timeout', detail: '' };
    const raw = String((err && err.message) || err || '').trim();
    const low = raw.toLowerCase();
    /* nostr-tools: validateEvent / JSON.stringify before send — suele ser datos del paquete, no “el Wi‑Fi”. */
    if (low.includes("can't serialize event") || low.includes('serialize event with wrong')) {
        return { kind: 'event-package', detail: raw };
    }
    /* NIP-20 OK:false rejections from the relay. The browser reached the relay
     * fine — the relay just refuses our key. Telling the user "check your Wi‑Fi"
     * here is misleading; the actionable fix is to change the relay list. */
    if (
        low.includes('blocked:') ||
        low.includes('blocked ') ||
        low.includes('restricted:') ||
        low.includes('auth-required') ||
        low.includes('not authorized') ||
        low.includes('not allowed') ||
        low.includes('does not have permission') ||
        low.includes('only notes signed by') ||
        low.includes('paid relay') ||
        low.includes('invalid pow')
    ) {
        return { kind: 'forbidden', detail: raw };
    }
    if (
        low.includes('publish failed on all relays') ||
        low.includes('websocket') ||
        low.includes('wss://') ||
        /econnrefused|enotfound|enetunreach|econnreset|echostunreach/.test(low) ||
        /failed to fetch|networkerror|network request failed|load failed|socket hang up/.test(low) ||
        /timed out|op_closed|closed unexpectedly/.test(low)
    ) {
        return { kind: 'relay', detail: raw };
    }
    return { kind: 'generic', detail: raw };
}

/**
 * Modal notice (not just toast): above the map and more visible than `notify` if another scrim was open.
 * @param {{ showDialog: (o: object) => Promise<unknown> }} store
 * @param {Record<string, string>} ui
 * @param {'timeout' | 'event-package' | 'forbidden' | 'relay' | 'generic' | 'no-result'} kind
 * @param {string} [detail]
 */
export async function showInteractivePublishFailureDialog(store, ui, kind, detail = '') {
    const d = String(detail || '').trim();
    const detailLine = d ? `\n\n${d}` : '';
    let title;
    let body;
    if (kind === 'timeout') {
        title = ui.publicTreePublishTimeoutTitle || ui.publicTreePublishFailedTitle || 'Publish timed out';
        body = (ui.publicTreePublishTimeout || 'Publishing took too long.') + detailLine;
    } else if (kind === 'event-package') {
        title = ui.publicTreePublishEventPackageTitle || ui.publicTreePublishFailedTitle || 'Could not prepare upload';
        const tmpl = String(ui.publicTreePublishEventPackageBody || '').trim();
        const rep = d || String(ui.publicTreePublishRelayNoDetail || '—');
        body = (tmpl.includes('{detail}') ? tmpl.replace(/\{detail\}/g, rep) : `${tmpl}${detailLine}`).trim();
    } else if (kind === 'forbidden') {
        title = ui.publicTreePublishForbiddenTitle || ui.publicTreePublishFailedTitle || 'Relays refused your key';
        const tmpl = String(ui.publicTreePublishForbiddenBody || '').trim();
        const rep = d || String(ui.publicTreePublishRelayNoDetail || '—');
        body = (tmpl.includes('{detail}') ? tmpl.replace(/\{detail\}/g, rep) : `${tmpl}${detailLine}`).trim();
    } else if (kind === 'relay') {
        title = ui.publicTreePublishRelayTitle || ui.publicTreePublishFailedTitle || 'Relay connection failed';
        const tmpl = String(ui.publicTreePublishRelayBody || '').trim();
        const rep = d || String(ui.publicTreePublishRelayNoDetail || '—');
        body = (tmpl.includes('{detail}') ? tmpl.replace(/\{detail\}/g, rep) : `${tmpl}${detailLine}`).trim();
    } else if (kind === 'no-result') {
        title = ui.publicTreePublishNoResultTitle || ui.publicTreePublishFailedTitle || 'Publish did not finish';
        const lead = String(ui.publicTreePublishNoResult || '').trim();
        const hint = String(ui.publicTreePublishNoResultHint || '').trim();
        body = hint ? `${lead}\n\n${hint}` : lead;
    } else {
        title = ui.publicTreePublishFailedTitle || 'Could not publish';
        const tmpl = String(ui.publicTreePublishFailedBody || '').trim();
        const rep = d || String(ui.publicTreePublishRelayNoDetail || '—');
        body = (tmpl.includes('{detail}') ? tmpl.replace(/\{detail\}/g, rep) : `${tmpl}${detailLine}`).trim();
    }
    await store.showDialog({
        type: 'alert',
        title,
        body,
        bodyHtml: false,
        confirmText: ui.dialogOkButton || 'OK'
    });
}
