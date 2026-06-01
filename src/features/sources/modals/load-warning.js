
import { store } from '../../../core/store.js';
import { parseNostrTreeUrl } from '../../nostr/nostr-refs.js';
import { sanitizeLocaleRichHtml } from '../../../shared/lib/locale-rich-html.js';
import { urlSummaryForUser } from '../../../shared/lib/url-display-summary.js';
import { modalShellHtml } from '../../../shared/ui/modal-shell.js';
import { modalHeroHtml } from '../../../shared/ui/modal-hero.js';
import { escHtml as esc } from '../../../shared/lib/html-escape.js';

class ArboritoModalLoadWarning extends HTMLElement {
    
    connectedCallback() {
        this.render();
    }

    cancel() {
        store.cancelUntrustedLoad();
    }

    confirm() {
        const url = (store.value.pendingUntrustedSource && store.value.pendingUntrustedSource.url);
        if (url) {
            const treeRef = parseNostrTreeUrl(url);
            if (treeRef) {
                try {
                    localStorage.setItem(
                        `arborito-nostr-public-ack:${treeRef.pub}:${treeRef.universeId}`,
                        '1'
                    );
                } catch {
                    /* ignore */
                }
            }
        }
        store.proceedWithUntrustedLoad();
    }

    render() {
        const ui = store.ui;
        const url = (store.value.pendingUntrustedSource && store.value.pendingUntrustedSource.url);
        const isPublicNostrTree = !!parseNostrTreeUrl(url || '');
        const title = isPublicNostrTree
            ? ui.nostrPublicWarningTitle || ui.secLoadWarningTitle || 'Load tree?'
            : ui.secLoadWarningTitle || 'Load Unverified Tree?';
        const body = isPublicNostrTree ? ui.nostrPublicWarningBody : ui.secLoadWarningBody;
        const check = isPublicNostrTree ? ui.nostrPublicWarningCheck : ui.secWarningCheck;
        const { summary, full } = urlSummaryForUser(url || '');
        const urlBlock = `
                    <div class="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50/80 dark:bg-slate-900/30">
                        <p class="arborito-eyebrow arborito-eyebrow--md px-3 pt-2">${esc(
                            ui.secUrlSummaryLabel || 'Link'
                        )}</p>
                        <p class="px-3 pb-2 text-sm text-slate-800 dark:text-slate-100 break-words">${esc(summary)}</p>
                        <details class="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950/50">
                            <summary class="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-sky-700 dark:text-sky-300 hover:underline">${esc(
                                ui.secUrlDetailsToggle || 'Show full link'
                            )}</summary>
                            <div class="px-3 pb-3 pt-0 text-xs font-mono break-all text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">${esc(
                                full || 'N/A'
                            )}</div>
                        </details>
                    </div>`;

        const bodyHtml = `
                ${modalHeroHtml(ui, {
                    tone: 'danger',
                    title,
                    titleTruncate: true,
                    leadingIcon: '<span class="text-3xl shrink-0">⚠️</span>',
                    backTagClass: 'btn-load-mob-back', closeTagClass: 'btn-load-x',
                    extraWrapClass: 'pb-3 border-b border-slate-100 dark:border-slate-800',
                })}

                <div class="p-8 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    <div class="text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">${sanitizeLocaleRichHtml(body)}</div>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mb-4">${esc(check)}</p>
                    ${urlBlock}
                </div>
                
                <div class="arborito-modal-footer arborito-modal-footer--bg-flat">
                    <div class="arborito-action-row arborito-action-row--stack-mobile">
                        <button class="btn-cancel arborito-cta-slate py-3 rounded-xl font-bold">
                            ${ui.secLoadCancel || "No, take me to safety"}
                        </button>
                        <button class="btn-confirm arborito-cta-rose py-3 rounded-xl font-bold shadow-lg shadow-red-500/20 transition-transform active:scale-95">
                            ${isPublicNostrTree ? ui.nostrPublicWarningConfirm || ui.secLoadConfirm || 'I understand' : ui.secLoadConfirm || 'Yes, load this tree'}
                        </button>
                    </div>
                </div>`;
        this.innerHTML = modalShellHtml({
            bodyHtml,
            panelSize: 'auto-h',
            panelClass: 'arborito-float-modal-card--md transition-all duration-300',
            panelTone: 'danger',
        });

        const btnL = this.querySelector('.btn-load-mob-back'); if (btnL) btnL.addEventListener('click', () => this.cancel());
        this.querySelectorAll('.btn-load-x').forEach((b) => (b.onclick = () => this.cancel()));

        this.querySelector('.btn-cancel').onclick = () => this.cancel();
        this.querySelector('.btn-confirm').onclick = () => this.confirm();
    }
}

customElements.define('arborito-modal-load-warning', ArboritoModalLoadWarning);
