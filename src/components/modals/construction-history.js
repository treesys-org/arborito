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

function formatHistoryTime(ts) {
    if (!ts) return '';
    try {
        return new Date(ts).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return '';
    }
}

class ArboritoModalConstructionHistory extends HTMLElement {
    connectedCallback() {
        this._selectedIndex = null;
        this._diffHtml = '';
        this._diffJob = 0;
        this._shellBuilt = false;
        this._onStoreChange = () => this._refreshFromStore();
        store.addEventListener('construction-undo-changed', this._onStoreChange);
        this._buildShell();
        this._refreshFromStore();
        this._bindShell();
    }

    disconnectedCallback() {
        store.removeEventListener('construction-undo-changed', this._onStoreChange);
        this._diffJob += 1;
    }

    _timeline() {
        if (typeof store.getConstructionHistoryTimeline !== 'function') {
            return { states: [], currentIndex: 0 };
        }
        return store.getConstructionHistoryTimeline();
    }

    _buildShell() {
        if (this._shellBuilt) return;
        this._shellBuilt = true;
        const ui = store.ui;
        const mobile = shouldShowMobileUI();
        const title = ui.conHistoryTitle || 'Edit history';
        const fade = ' animate-in fade-in';
        const backdropCls = mobile
            ? `fixed inset-0 z-[80] flex flex-col p-0 m-0 bg-slate-950 h-[100dvh] min-h-[100dvh]${fade} duration-300`
            : `fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4${fade} duration-500 arborito-modal-root`;
        const panelCls = mobile
            ? 'bg-white dark:bg-slate-900 w-full flex-1 min-h-0 h-full relative overflow-hidden flex flex-col border-0 shadow-none rounded-none cursor-auto'
            : 'bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl w-full max-w-lg relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto max-h-[90dvh]';
        const topbarCls = mobile
            ? 'arborito-sheet__hero arborito-sheet__hero--mmenu-sub arborito-dock-modal-hero shrink-0 flex items-center gap-2'
            : 'arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2 flex items-center gap-2';

        this.innerHTML = `
            <div id="con-history-backdrop" class="${backdropCls}">
                <div class="${panelCls}">
                    <div class="${topbarCls}">
                        ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0', { tagClass: 'btn-con-history-close' })}
                        <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${esc(title)}</h2>
                        ${modalWindowCloseXHtml(ui, 'btn-con-history-close', { showOnMobile: true })}
                    </div>
                    <div class="flex items-center gap-2 px-4 py-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
                        <button type="button" id="btn-con-history-back" class="flex-1 py-2 rounded-xl text-xs font-black uppercase bg-slate-100 dark:bg-slate-800 disabled:opacity-40">${esc(ui.conHistoryBack || 'Back')}</button>
                        <button type="button" id="btn-con-history-forward" class="flex-1 py-2 rounded-xl text-xs font-black uppercase bg-slate-100 dark:bg-slate-800 disabled:opacity-40">${esc(ui.conHistoryForward || 'Forward')}</button>
                    </div>
                    <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
                        <div id="con-history-list" class="flex-1 min-h-0 overflow-auto custom-scrollbar p-3 space-y-1"></div>
                        <div id="con-history-diff" class="shrink-0 border-t border-slate-100 dark:border-slate-800"></div>
                    </div>
                </div>
            </div>`;
    }

    _bindShell() {
        const close = () => store.dismissModal();
        this.querySelectorAll('.btn-con-history-close').forEach((b) => {
            bindMobileTap(b, (e) => {
                e.preventDefault();
                close();
            });
        });
        const backdrop = this.querySelector('#con-history-backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) close();
            });
        }
        const back = this.querySelector('#btn-con-history-back');
        if (back) {
            bindMobileTap(back, (e) => {
                e.preventDefault();
                if (store.undoConstructionEdit()) {
                    const { currentIndex } = this._timeline();
                    this._selectedIndex = currentIndex;
                    this._refreshFromStore();
                }
            });
        }
        const fwd = this.querySelector('#btn-con-history-forward');
        if (fwd) {
            bindMobileTap(fwd, (e) => {
                e.preventDefault();
                if (store.redoConstructionEdit()) {
                    const { currentIndex } = this._timeline();
                    this._selectedIndex = currentIndex;
                    this._refreshFromStore();
                }
            });
        }
        const list = this.querySelector('#con-history-list');
        if (list) {
            list.addEventListener('click', (e) => {
                const row = e.target instanceof Element ? e.target.closest('.con-history-row') : null;
                if (!row) return;
                e.preventDefault();
                const idx = parseInt(row.dataset.idx, 10);
                if (!Number.isNaN(idx)) {
                    this._selectedIndex = idx;
                    this._refreshList();
                    this._scheduleDiff();
                }
            });
        }
    }

    _refreshFromStore() {
        const { states, currentIndex } = this._timeline();
        if (this._selectedIndex == null || this._selectedIndex >= states.length) {
            this._selectedIndex = currentIndex;
        }
        this._refreshNavButtons();
        this._refreshList();
        this._scheduleDiff();
    }

    _refreshNavButtons() {
        const { states, currentIndex } = this._timeline();
        const canBack = currentIndex > 0;
        const canFwd = currentIndex < states.length - 1;
        const back = this.querySelector('#btn-con-history-back');
        const fwd = this.querySelector('#btn-con-history-forward');
        if (back) back.disabled = !canBack;
        if (fwd) fwd.disabled = !canFwd;
    }

    _refreshList() {
        const ui = store.ui;
        const list = this.querySelector('#con-history-list');
        if (!list) return;
        const { states, currentIndex } = this._timeline();
        if (!states.length) {
            list.innerHTML = `<p class="text-sm text-slate-500 m-0">${esc(ui.conHistoryEmpty || 'No edits recorded yet.')}</p>`;
            return;
        }
        list.innerHTML = states
            .map((st, i) => {
                const active = i === currentIndex;
                const selected = i === this._selectedIndex;
                const lbl = active
                    ? ui.conHistoryCurrent || 'Current'
                    : i < currentIndex
                      ? ui.conHistoryPast || 'Earlier'
                      : ui.conHistoryFuture || 'After undo';
                return `<button type="button" class="con-history-row w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${selected ? 'border-teal-400 bg-teal-50/80 dark:bg-teal-950/30' : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50'}" data-idx="${i}">
                    <span class="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">${esc(lbl)}${active ? ' ●' : ''}</span>
                    <span class="block text-sm font-bold text-slate-800 dark:text-slate-100 truncate">${esc(st.summary || ui.conHistoryStep || 'Map change')}</span>
                    <span class="block text-[11px] text-slate-500 dark:text-slate-400 truncate">${esc(formatHistoryTime(st.at))} · ${esc(st.by || '')}</span>
                </button>`;
            })
            .join('');
    }

    _scheduleDiff() {
        const job = ++this._diffJob;
        const diffEl = this.querySelector('#con-history-diff');
        if (diffEl) {
            diffEl.innerHTML = `<p class="m-0 p-3 text-xs text-slate-500 dark:text-slate-400">${esc(store.ui.conHistoryLoading || '…')}</p>`;
        }
        requestAnimationFrame(() => {
            if (job !== this._diffJob) return;
            this._renderDiffPanel();
        });
    }

    _renderDiffPanel() {
        const ui = store.ui;
        const diffEl = this.querySelector('#con-history-diff');
        if (!diffEl) return;
        const { states } = this._timeline();
        const sel = states[this._selectedIndex];
        const next = states[this._selectedIndex + 1];
        if (!sel || !next) {
            diffEl.innerHTML = `<p class="m-0 p-3 text-xs text-slate-500 dark:text-slate-400">${esc(ui.conHistorySelectStep || 'Select a step to see what changed.')}</p>`;
            return;
        }
        const d = diffTreeData(sel.snap, next.snap);
        const badge = (n, cls) =>
            `<span class="px-2 py-0.5 rounded-md text-[10px] font-black ${cls}">${esc(n)}</span>`;
        const row = (it) =>
            `<li class="py-1.5 text-xs text-slate-700 dark:text-slate-200 truncate">${esc(it.name || it.id)} <span class="text-slate-400 font-mono">${esc(it.type || '')}</span></li>`;
        const changedRow = (it) =>
            `<li class="py-1.5 text-xs text-slate-700 dark:text-slate-200 truncate">${esc((it.after && it.after.name) || it.id)} <span class="text-slate-400">← ${esc((it.before && it.before.name) || '')}</span></li>`;
        diffEl.innerHTML = `<div class="p-3 space-y-2">
                <p class="m-0 text-[10px] font-black uppercase tracking-wider text-slate-500">${esc(ui.conHistoryDiffHeading || 'Changes in this step')}</p>
                <div class="flex flex-wrap gap-1.5">
                    ${badge(`+${d.counts.added}`, 'bg-emerald-600 text-white')}
                    ${badge(`-${d.counts.removed}`, 'bg-rose-600 text-white')}
                    ${badge(`~${d.counts.changed}`, 'bg-amber-500 text-amber-950')}
                </div>
                ${d.added.length ? `<ul class="m-0 p-0 list-none max-h-28 overflow-auto">${d.added.slice(0, 8).map(row).join('')}</ul>` : ''}
                ${d.removed.length ? `<ul class="m-0 p-0 list-none max-h-28 overflow-auto">${d.removed.slice(0, 8).map(row).join('')}</ul>` : ''}
                ${d.changed.length ? `<ul class="m-0 p-0 list-none max-h-28 overflow-auto">${d.changed.slice(0, 8).map(changedRow).join('')}</ul>` : ''}
            </div>`;
    }
}

customElements.define('arborito-modal-construction-history', ArboritoModalConstructionHistory);
