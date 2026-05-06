import { store } from '../../store.js';
import { shouldShowMobileUI } from '../../utils/breakpoints.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';
import { bindMobileTap } from '../../utils/mobile-tap.js';
import { diffTreeData } from '../../utils/tree-diff.js';

function esc(s) {
    return String(s != null ? s : '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

class ArboritoModalPublishDiff extends HTMLElement {
    connectedCallback() {
        this.render();
        this.bind();
    }

    _resolveLocalTreeId() {
        const m = store.value.modal;
        if (m && typeof m === 'object' && m.localTreeId) return String(m.localTreeId);
        const srcUrl = String((store.value.activeSource && store.value.activeSource.url) || '');
        if (srcUrl.startsWith('local://')) return srcUrl.slice('local://'.length);
        return '';
    }

    render() {
        const ui = store.ui;
        const mobile = shouldShowMobileUI();
        const localId = this._resolveLocalTreeId();
        const us = store.userStore && store.userStore.state;
        const entry =
            localId && us && Array.isArray(us.localTrees)
                ? us.localTrees.find((t) => String(t && t.id) === String(localId))
                : null;
        const published = (entry && entry.publishedSnapshot) || null;
        const draft = store.state.rawGraphData || (entry && entry.data) || null;
        const d = diffTreeData(published, draft);

        const title = ui.publishDiffTitle || 'Changes vs published';
        const backExtra = 'arborito-mmenu-back shrink-0';
        const fade = ' animate-in fade-in';
        const backdropCls = mobile
            ? `fixed inset-0 z-[80] flex flex-col p-0 m-0 bg-slate-950 h-[100dvh] min-h-[100dvh]${fade} duration-300`
            : `fixed inset-0 z-[80] flex items-center justify-center bg-slate-950 p-4${fade} duration-500 arborito-modal-root`;
        const panelCls = mobile
            ? 'bg-white dark:bg-slate-900 w-full flex-1 min-h-0 h-full relative overflow-hidden flex flex-col border-0 shadow-none rounded-none cursor-auto'
            : 'bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl w-full max-w-xl relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto max-h-[90dvh]';
        const topbarCls = mobile
            ? 'arborito-sheet__hero arborito-sheet__hero--mmenu-sub arborito-dock-modal-hero shrink-0'
            : 'arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2 flex items-center gap-2';

        const badge = (n, cls) =>
            `<span class="px-2 py-1 rounded-lg text-[11px] font-black ${cls}">${esc(n)}</span>`;

        const itemRow = (it) =>
            `<li class="py-2 border-b border-slate-100 dark:border-slate-800">
                <p class="m-0 text-sm font-bold text-slate-800 dark:text-slate-100 truncate">${esc(it.name || it.id)}</p>
                <p class="m-0 mt-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">${esc(it.type || '')} · ${esc(it.id)}</p>
            </li>`;

        const changedRow = (it) =>
            `<li class="py-2 border-b border-slate-100 dark:border-slate-800">
                <p class="m-0 text-sm font-bold text-slate-800 dark:text-slate-100 truncate">${esc((it.after && it.after.name) || it.id)}</p>
                <p class="m-0 mt-0.5 text-[11px] text-slate-600 dark:text-slate-300 truncate">
                    <span class="font-mono">${esc(it.id)}</span>
                    <span class="mx-2 text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
                    <span class="text-slate-500 dark:text-slate-400">was:</span> ${esc((it.before && it.before.name) || '')}
                </p>
            </li>`;

        const noBaseline = !published;
        const noChanges =
            !noBaseline && d.counts.added === 0 && d.counts.removed === 0 && d.counts.changed === 0;

        const body = noBaseline
            ? `<div class="p-4">
                    <p class="m-0 text-sm text-slate-700 dark:text-slate-200">
                        ${esc(ui.publishDiffNoBaseline || 'No published snapshot was found for this local tree yet. Publish once to establish a baseline.')}
                    </p>
               </div>`
            : `<div class="p-4 border-b border-slate-100 dark:border-slate-800">
                    <div class="flex flex-wrap gap-2 items-center">
                        ${badge(`${d.counts.added} ${ui.publishDiffAdded || 'added'}`, 'bg-emerald-600 text-white')}
                        ${badge(`${d.counts.removed} ${ui.publishDiffRemoved || 'removed'}`, 'bg-rose-600 text-white')}
                        ${badge(`${d.counts.changed} ${ui.publishDiffChanged || 'changed'}`, 'bg-amber-500 text-amber-950')}
                        <span class="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                            ${esc(ui.publishDiffNodes || 'nodes')}: ${d.counts.published} → ${d.counts.draft}
                        </span>
                    </div>
                    ${noChanges ? `<p class="m-0 mt-3 text-sm text-slate-600 dark:text-slate-300">${esc(ui.publishDiffNoChanges || 'No changes since last publish.')}</p>` : ''}
               </div>
               <div class="flex-1 min-h-0 overflow-auto custom-scrollbar">
                    ${
                        d.added.length
                            ? `<div class="px-4 pt-4">
                                   <p class="m-0 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">${esc(ui.publishDiffAdded || 'Added')}</p>
                                   <ul class="m-0 mt-2 p-0 list-none">${d.added.slice(0, 120).map(itemRow).join('')}</ul>
                               </div>`
                            : ''
                    }
                    ${
                        d.removed.length
                            ? `<div class="px-4 pt-4">
                                   <p class="m-0 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">${esc(ui.publishDiffRemoved || 'Removed')}</p>
                                   <ul class="m-0 mt-2 p-0 list-none">${d.removed.slice(0, 120).map(itemRow).join('')}</ul>
                               </div>`
                            : ''
                    }
                    ${
                        d.changed.length
                            ? `<div class="px-4 pt-4 pb-4">
                                   <p class="m-0 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">${esc(ui.publishDiffChanged || 'Changed')}</p>
                                   <ul class="m-0 mt-2 p-0 list-none">${d.changed.slice(0, 200).map(changedRow).join('')}</ul>
                               </div>`
                            : ''
                    }
               </div>`;

        this.innerHTML = `
            <div id="publish-diff-backdrop" class="${backdropCls}">
                <div class="${panelCls}">
                    <div class="${topbarCls}">
                        ${
                            mobile
                                ? `<div class="arborito-mmenu-toolbar">
                                        ${modalNavBackHtml(ui, backExtra, { tagClass: 'btn-publish-diff-back' })}
                                        <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0 truncate">${esc(title)}</h2>
                                        <span class="w-10 shrink-0" aria-hidden="true"></span>
                                   </div>`
                                : `${modalNavBackHtml(ui, backExtra, { tagClass: 'btn-publish-diff-back' })}
                                   <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0 truncate">${esc(title)}</h2>
                                   ${modalWindowCloseXHtml(ui, 'btn-publish-diff-back')}`
                        }
                    </div>
                    ${body}
                    <div class="p-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2 justify-end items-center">
                        <button type="button" class="btn-publish-diff-back px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm font-black">${esc(ui.close || 'Close')}</button>
                        ${
                            !noBaseline && !noChanges
                                ? `<button type="button" id="btn-publish-diff-publish" class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-black inline-flex items-center gap-2">
                                        <span aria-hidden="true">🔄</span>
                                        <span>${esc(ui.publishDiffPublishCta || ui.publicTreeRepublishButton || 'Publish these changes')}</span>
                                   </button>`
                                : ''
                        }
                    </div>
                </div>
            </div>
        `;
    }

    bind() {
        const goBack = () => store.dismissModal();
        const btns = this.querySelectorAll('.btn-publish-diff-back');
        btns.forEach((b) => bindMobileTap(b, (e) => { e.stopPropagation(); goBack(); }));
        const backdrop = this.querySelector('#publish-diff-backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', (e) => {
                if (e.target !== backdrop) return;
                goBack();
            });
        }
        /* CTA: publicar cambios desde el mismo modal del diff (flujo sugerido por el usuario). */
        const publishBtn = this.querySelector('#btn-publish-diff-publish');
        if (publishBtn) {
            bindMobileTap(publishBtn, async (e) => {
                e.stopPropagation();
                if (publishBtn.disabled) return;
                publishBtn.disabled = true;
                publishBtn.classList.add('opacity-60', 'pointer-events-none');
                try {
                    store.dismissModal({ syncClose: true });
                    if (typeof store.publishTreePublicInteractive === 'function') {
                        await store.publishTreePublicInteractive();
                    }
                } finally {
                    publishBtn.disabled = false;
                    publishBtn.classList.remove('opacity-60', 'pointer-events-none');
                }
            });
        }
    }
}

customElements.define('arborito-modal-publish-diff', ArboritoModalPublishDiff);

