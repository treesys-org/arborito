import { store } from '../../store.js';
import { bindMobileTap, isModalBackdropEmptyTap } from '../../utils/mobile-tap.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';

/** Safe for text nodes (body, titles, button labels). */
function escText(s) {
    return String(s != null ? s : '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/** For double-quoted HTML attributes. */
function escAttr(s) {
    return escText(s).replace(/"/g, '&quot;');
}

function sanitizeDialogHtml(html) {
    const raw = String(html != null ? html : '');
    if (!raw) return '';
    // DOM-based allowlist sanitizer (keeps basic formatting without allowing script injection).
    const parser = new DOMParser();
    const doc = parser.parseFromString(raw, 'text/html');

    const allowedTags = new Set([
        'STRONG',
        'BR',
        'CODE',
        'P',
        'SPAN',
        'A',
        'UL',
        'OL',
        'LI',
        'EM',
        'DIV',
        'BUTTON'
    ]);
    const allowedAttrsByTag = {
        A: new Set(['href', 'target', 'rel', 'class']),
        P: new Set(['class']),
        SPAN: new Set(['class']),
        CODE: new Set(['class']),
        STRONG: new Set(['class']),
        EM: new Set(['class']),
        UL: new Set(['class']),
        OL: new Set(['class']),
        LI: new Set(['class']),
        DIV: new Set(['class']),
        BUTTON: new Set(['type', 'class', 'data-copy'])
    };

    const isSafeHref = (href) => {
        const h = String(href != null ? href : '').trim();
        if (!h) return false;
        if (h.startsWith('#') || h.startsWith('/')) return true;
        try {
            const u = new URL(h, window.location.origin);
            return u.protocol === 'http:' || u.protocol === 'https:';
        } catch {
            return false;
        }
    };

    const walk = (node) => {
        const children = [...node.childNodes];
        for (const ch of children) {
            if (ch.nodeType === Node.ELEMENT_NODE) {
                const el = /** @type {HTMLElement} */ (ch);
                const tag = el.tagName;
                if (!allowedTags.has(tag)) {
                    // Drop the tag but keep its text/content.
                    el.replaceWith(...[...el.childNodes]);
                    continue;
                }

                // Strip disallowed attrs + any inline event handlers.
                const allowedAttrs = allowedAttrsByTag[tag] || new Set();
                for (const attr of [...el.attributes]) {
                    const name = attr.name.toLowerCase();
                    if (name.startsWith('on')) {
                        el.removeAttribute(attr.name);
                        continue;
                    }
                    if (!allowedAttrs.has(attr.name)) el.removeAttribute(attr.name);
                }

                if (tag === 'A') {
                    const href = el.getAttribute('href');
                    if (!isSafeHref(href)) {
                        // If href is unsafe, unwrap to plain text.
                        el.replaceWith(...[...el.childNodes]);
                        continue;
                    }
                    // Ensure safe link behavior.
                    if (!el.getAttribute('rel')) el.setAttribute('rel', 'noopener noreferrer');
                    if (!el.getAttribute('target')) el.setAttribute('target', '_blank');
                }

                if (tag === 'BUTTON') {
                    const t = String(el.getAttribute('type') || 'button').toLowerCase();
                    if (t !== 'button') el.setAttribute('type', 'button');
                }

                walk(el);
            } else if (ch.nodeType === Node.COMMENT_NODE) {
                ch.remove();
            }
        }
    };

    walk(doc.body);
    return doc.body.innerHTML;
}

class ArboritoModalDialog extends HTMLElement {
    constructor() {
        super();
        this.value = '';
    }

    connectedCallback() {
        this.render();
        setTimeout(() => {
            const inp = this.querySelector('input[type="text"]');
            if (inp) inp.focus();
            else {
                const ch = this.querySelector('.export-snap-cb');
                const btn = ch || this.querySelector('.btn-choice') || this.querySelector('.btn-confirm');
                if (btn) btn.focus();
            }
        }, 50);

        this.addEventListener('keydown', (e) => {
            const dlgType = (store.value.modal && store.value.modal.dialogType);
            if (e.key === 'Enter') {
                if (dlgType === 'choice') {
                    e.preventDefault();
                    return;
                }
                e.preventDefault();
                this.confirm();
            }
            if (e.key === 'Escape') {
                this.cancel();
            }
        });
    }

    cancel() {
        store.closeDialog(null);
    }

    confirm() {
        const type = store.value.modal.dialogType;
        if (type === 'prompt') {
            const val = this.querySelector('input').value;
            store.closeDialog(val || '');
        } else if (type === 'confirm') {
            store.closeDialog(true);
        } else if (type === 'exportSnapshots') {
            const checked = [...this.querySelectorAll('input.export-snap-cb:checked')].map((i) => i.value);
            store.closeDialog(checked);
        } else {
            store.closeDialog(true);
        }
    }

    render() {
        const {
            title,
            body,
            dialogType,
            placeholder,
            confirmText,
            cancelText,
            danger,
            choices,
            exportSnapshots,
            selectAllText,
            selectNoneText,
            bodyHtml
        } = store.value.modal;

        const isPrompt = dialogType === 'prompt';
        const isConfirm = dialogType === 'confirm';
        const isAlert = dialogType === 'alert';
        const isChoice = dialogType === 'choice';
        const isExportSnapshots = dialogType === 'exportSnapshots';

        let icon = 'ℹ️';
        if (danger) icon = '⚠️';
        if (isPrompt) icon = '✍️';
        if (isConfirm && !danger) icon = '❓';
        if (isChoice) icon = '📦';
        if (isExportSnapshots) icon = '📦';

        let confirmBtnClass = danger
            ? 'bg-red-600 hover:bg-red-500 text-white'
            : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90';

        const ui = store.ui;
        const chromeRow = `<div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2">
                ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0', { tagClass: 'btn-dialog-mob-back' })}
                <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${escText(title)}</h2>
                ${modalWindowCloseXHtml(ui, 'btn-dialog-dismiss')}
            </div>`;

        const snapRows =
            isExportSnapshots && Array.isArray(exportSnapshots) && exportSnapshots.length
                ? exportSnapshots
                      .map(
                          (row) => `
                <label class="flex items-start gap-3 py-2 px-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/80 cursor-pointer text-left">
                    <input type="checkbox" class="export-snap-cb mt-0.5 shrink-0 rounded border-slate-300 dark:border-slate-600" value="${escAttr(row.id)}" checked>
                    <span class="text-sm font-medium text-slate-800 dark:text-slate-100 break-all">${escText((row.label != null ? row.label : row.id))}</span>
                </label>`
                      )
                      .join('')
                : '';

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950 p-4 animate-in fade-in duration-200 arborito-modal-root">
            <div class="arborito-float-modal-card arborito-float-modal-card--auto-h arborito-float-modal-card--narrow bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200 relative overflow-hidden flex flex-col max-h-[min(90vh,640px)]">
                ${chromeRow}
                <div class="p-6 pt-2 flex flex-col min-h-0 flex-1 overflow-hidden">
                <div class="flex flex-col items-center text-center mb-4 shrink-0">
                    <div class="text-4xl mb-3">${icon}</div>
                    ${
                        bodyHtml
                            ? `<div class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed ${isChoice || isExportSnapshots ? 'whitespace-pre-line max-w-md' : 'w-full max-w-md mx-auto'}">${sanitizeDialogHtml(body)}</div>`
                            : `<p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed ${isChoice || isExportSnapshots ? 'whitespace-pre-line max-w-md' : ''}">${escText(body)}</p>`
                    }
                </div>

                ${isPrompt ? `
                <div class="mb-6 shrink-0">
                    <input type="text" class="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="${escAttr(placeholder || '')}">
                </div>
                ` : ''}

                ${isExportSnapshots && snapRows ? `
                <div class="flex flex-col min-h-0 flex-1 mb-4">
                    <div class="max-h-52 overflow-y-auto overscroll-contain border border-slate-200 dark:border-slate-700 rounded-xl px-1 py-1 mb-3">
                        ${snapRows}
                    </div>
                    <div class="flex flex-wrap justify-center gap-4 shrink-0 mb-2">
                        <button type="button" class="btn-export-snap-all text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline">${escText(selectAllText || 'All')}</button>
                        <button type="button" class="btn-export-snap-none text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline">${escText(selectNoneText || 'None')}</button>
                    </div>
                    <button type="button" class="btn-confirm w-full py-3 ${confirmBtnClass} font-bold rounded-xl shadow-lg transition-transform active:scale-95 text-xs uppercase tracking-wider shrink-0">
                        ${escText(confirmText || 'OK')}
                    </button>
                </div>
                ` : ''}

                ${isChoice && Array.isArray(choices) && choices.length ? `
                <div class="flex flex-col gap-3 w-full mb-4">
                    ${choices
                        .map(
                            (c) => `
                    <button type="button" data-choice-id="${String(c.id).replace(/"/g, '&quot;')}" class="btn-choice w-full py-3 ${confirmBtnClass} font-bold rounded-xl shadow-lg transition-transform active:scale-95 text-xs uppercase tracking-wider text-center">
                        ${escText(c.label)}
                    </button>`
                        )
                        .join('')}
                </div>
                ` : ''}

                ${!isExportSnapshots && !(isChoice && Array.isArray(choices) && choices.length) ? `
                <div class="flex gap-3 shrink-0">
                    ${!isAlert ? `
                    <button class="btn-cancel flex-1 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-xl transition-colors text-xs uppercase tracking-wider">
                        ${escText(cancelText || 'Cancel')}
                    </button>
                    ` : ''}
                    
                    <button class="btn-confirm flex-1 py-3 ${confirmBtnClass} font-bold rounded-xl shadow-lg transition-transform active:scale-95 text-xs uppercase tracking-wider">
                        ${escText(confirmText || 'OK')}
                    </button>
                </div>
                ` : ''}
                </div>
            </div>
        </div>`;

        const cancelFn = () => this.cancel();
        const mobBackBtn = this.querySelector('.btn-dialog-mob-back');
        if (mobBackBtn) bindMobileTap(mobBackBtn, cancelFn);
        this.querySelectorAll('.btn-dialog-dismiss').forEach((b) => bindMobileTap(b, cancelFn));

        const btnCancel = this.querySelector('.btn-cancel');
        if (btnCancel) bindMobileTap(btnCancel, () => this.cancel());

        const btnConfirm = this.querySelector('.btn-confirm');
        if (btnConfirm) bindMobileTap(btnConfirm, () => this.confirm());

        this.querySelectorAll('.btn-choice').forEach((b) =>
            bindMobileTap(b, () => store.closeDialog(b.getAttribute('data-choice-id')))
        );

        const setAllSnaps = (on) => {
            this.querySelectorAll('input.export-snap-cb').forEach((cb) => {
                cb.checked = on;
            });
        };
        const btnAll = this.querySelector('.btn-export-snap-all');
        const btnNone = this.querySelector('.btn-export-snap-none');
        if (btnAll) bindMobileTap(btnAll, () => setAllSnaps(true));
        if (btnNone) bindMobileTap(btnNone, () => setAllSnaps(false));

        this.querySelectorAll('button[data-copy]').forEach((b) => {
            bindMobileTap(b, async () => {
                const text = b.getAttribute('data-copy');
                if (!text) return;
                try {
                    await navigator.clipboard.writeText(text);
                    const msg =
                        (store.ui && store.ui.publicTreeLinkCopied) ||
                        (store.ui && store.ui.sourcesShareCopied) ||
                        'Copied to clipboard.';
                    store.notify(msg, false);
                } catch {
                    store.notify((store.ui && store.ui.publicTreeLinkCopyFailed) || 'Could not copy.', true);
                }
            });
        });

        if (!danger) {
            const bd = this.querySelector('#modal-backdrop');
            if (bd) {
                bd.addEventListener('click', (e) => {
                    if (isModalBackdropEmptyTap(bd, e)) this.cancel();
                });
            }
        }
    }
}

customElements.define('arborito-modal-dialog', ArboritoModalDialog);
