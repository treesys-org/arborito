
import { store } from '../../../core/store.js';
import { parseNostrTreeUrl } from '../../nostr/nostr-refs.js';
import { sanitizeLocaleRichHtml } from '../../../shared/lib/locale-rich-html.js';
import { urlSummaryForUser } from '../../../shared/lib/url-display-summary.js';
import { modalShellHtml } from '../../../shared/ui/modal-shell.js';
import { modalHeroHtml } from '../../../shared/ui/modal-hero.js';
import { escHtml as esc } from '../../../shared/lib/html-escape.js';

class ArboritoModalSecurityWarning extends HTMLElement {
    
    connectedCallback() {
        this.render();
    }

    close() {
        store.dismissModal();
    }

    confirm() {
        const url = (store.value.modal && store.value.modal.url);
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
            const res = store.addCommunitySource(url);
            store.notifyCommunityAddResult(res);
        }
        this.close();
    }

    render() {
        const ui = store.ui;
        const url = (store.value.modal && store.value.modal.url);
        const isPublicNostrTree = !!parseNostrTreeUrl(url || '');
        const title = isPublicNostrTree
            ? ui.nostrPublicWarningTitle || ui.secWarningTitle || 'Security Warning'
            : ui.secWarningTitle || 'Security Warning';
        const body = isPublicNostrTree ? ui.nostrPublicWarningBody : ui.secWarningBody;
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
                    backTagClass: 'btn-sec-mob-back', closeTagClass: 'btn-sec-x',
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
                            ${ui.secCancel || "Cancel"}
                        </button>
                        <button class="btn-confirm arborito-cta-rose py-3 rounded-xl font-bold shadow-lg shadow-red-500/20 transition-transform active:scale-95">
                            ${isPublicNostrTree ? ui.nostrPublicWarningConfirm || ui.secConfirm || 'I understand' : ui.secConfirm || 'I trust this tree'}
                        </button>
                    </div>
                </div>`;
        this.innerHTML = modalShellHtml({
            bodyHtml,
            panelSize: 'auto-h',
            panelClass: 'arborito-float-modal-card--md transition-all duration-300',
            panelTone: 'danger',
        });

        const btnS = this.querySelector('.btn-sec-mob-back'); if (btnS) btnS.addEventListener('click', () => this.close());
        this.querySelectorAll('.btn-sec-x').forEach((b) => (b.onclick = () => this.close()));

        this.querySelector('.btn-cancel').onclick = () => this.close();
        this.querySelector('.btn-confirm').onclick = () => this.confirm();
    }
}

customElements.define('arborito-modal-security-warning', ArboritoModalSecurityWarning);
