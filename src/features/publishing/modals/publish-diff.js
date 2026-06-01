import { store } from '../../../core/store.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { modalHeroHtml } from '../../../shared/ui/modal-hero.js';
import { modalShellHtml } from '../../../shared/ui/modal-shell.js';
import { bindMobileTap } from '../../../shared/ui/mobile-tap.js';
import { diffTreeData } from '../../tree-graph/tree-diff.js';
import { escHtml as esc } from '../../../shared/lib/html-escape.js';

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
        const topbar = modalHeroHtml(ui, {
            mobile,
            title: esc(title),
            titleTruncate: true,
            tagClass: 'btn-publish-diff-back',
            trailingSpacer: true,
        });

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
                                   <p class="arborito-eyebrow arborito-eyebrow--md m-0">${esc(ui.publishDiffAdded || 'Added')}</p>
                                   <ul class="m-0 mt-2 p-0 list-none">${d.added.slice(0, 120).map(itemRow).join('')}</ul>
                               </div>`
                            : ''
                    }
                    ${
                        d.removed.length
                            ? `<div class="px-4 pt-4">
                                   <p class="arborito-eyebrow arborito-eyebrow--md m-0">${esc(ui.publishDiffRemoved || 'Removed')}</p>
                                   <ul class="m-0 mt-2 p-0 list-none">${d.removed.slice(0, 120).map(itemRow).join('')}</ul>
                               </div>`
                            : ''
                    }
                    ${
                        d.changed.length
                            ? `<div class="px-4 pt-4 pb-4">
                                   <p class="arborito-eyebrow arborito-eyebrow--md m-0">${esc(ui.publishDiffChanged || 'Changed')}</p>
                                   <ul class="m-0 mt-2 p-0 list-none">${d.changed.slice(0, 200).map(changedRow).join('')}</ul>
                               </div>`
                            : ''
                    }
               </div>`;

        const bodyHtml = `
                    ${topbar}
                    ${body}
                    <div class="arborito-modal-footer flex flex-wrap gap-2 justify-end items-center">
                        <button type="button" class="btn-publish-diff-back arborito-cta-slate px-4 py-2 rounded-xl text-sm font-black">${esc(ui.close || 'Close')}</button>
                        ${
                            !noBaseline
                                ? `<button type="button" id="btn-publish-diff-publish" class="px-4 py-2 rounded-xl text-sm font-black inline-flex items-center gap-2 ${noChanges ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 shadow-inner' : 'arborito-cta-emerald shadow-lg active:scale-95'}" ${noChanges ? 'disabled' : ''}>
                                        <span aria-hidden="true">${noChanges ? '✓' : '🔄'}</span>
                                        <span>${esc(noChanges ? (ui.publicTreeUpToDateLabel || 'Up to date') : (ui.publishDiffPublishCta || ui.publicTreeRepublishButton || 'Publish these changes'))}</span>
                                   </button>`
                                : ''
                        }
                    </div>`;
        this.innerHTML = modalShellHtml({
            bodyHtml,
            mobile,
            layout: 'dock',
            z: 80,
            enter: 'fade',
            backdropId: 'publish-diff-backdrop',
            panelRadius: mobile ? 'none' : '2xl',
            panelSize: mobile ? undefined : 'md auto-h',
        });
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
        const publishBtn = this.querySelector('#btn-publish-diff-publish');
        if (publishBtn) {
            bindMobileTap(publishBtn, async (e) => {
                e.stopPropagation();
                if (publishBtn.disabled) return;
                publishBtn.disabled = true;
                publishBtn.classList.add('opacity-60', 'pointer-events-none');
                try {
                    if (typeof store.publishTreePublicInteractive === 'function') {
                        await store.publishTreePublicInteractive();
                    }
                    // Do NOT close the modal automatically to allow user to see the success state list clearing or button turning gray
                } finally {
                    publishBtn.disabled = false;
                    publishBtn.classList.remove('opacity-60', 'pointer-events-none');
                }
            });
        }
    }
}

customElements.define('arborito-modal-publish-diff', ArboritoModalPublishDiff);


