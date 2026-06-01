import { store } from '../../../core/store.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { modalHeroHtml } from '../../../shared/ui/modal-hero.js';
import { modalShellHtml } from '../../../shared/ui/modal-shell.js';
import { bindMobileTap } from '../../../shared/ui/mobile-tap.js';
import { diffTreeData } from '../../tree-graph/tree-diff.js';
import { escHtml as esc } from '../../../shared/lib/html-escape.js';

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
        const title = ui.conHistoryTitle || 'Historial de cambios';
        /* Standard modal hero header with .btn-close — matches arcade/profile/sources. */
        const topbar = modalHeroHtml(ui, {
            mobile,
            title: esc(title),
        });

        const bodyHtml = `
                    ${topbar}
                    <div class="arborito-action-row px-4 py-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
                        <button type="button" id="btn-con-history-back" class="arborito-cta-slate flex-1 py-2 rounded-xl text-xs font-black uppercase">${esc(ui.conHistoryBack || 'Atrás')}</button>
                        <button type="button" id="btn-con-history-forward" class="arborito-cta-slate flex-1 py-2 rounded-xl text-xs font-black uppercase">${esc(ui.conHistoryForward || 'Adelante')}</button>
                    </div>
                    <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
                        <div id="con-history-list" class="flex-1 min-h-0 overflow-auto custom-scrollbar p-3 space-y-1"></div>
                        <div id="con-history-diff" class="shrink-0 border-t border-slate-100 dark:border-slate-800"></div>
                    </div>`;
        /* Desktop: centered card; mobile: dock fullbleed via canonical #modal-backdrop. */
        this.innerHTML = modalShellHtml({
            bodyHtml,
            mobile,
            layout: mobile ? 'dock' : 'centered',
            z: 80,
            scrim: mobile ? 'opaque' : 'translucent',
            panelSize: mobile ? undefined : 'lg-tight auto-h',
        });
    }

    _bindShell() {
        const close = () => store.dismissModal();
        /* Modal shell wires .btn-close and #modal-backdrop — no custom close handlers needed. */
        this.querySelectorAll('.btn-close').forEach((b) => {
            bindMobileTap(b, (e) => {
                e.preventDefault();
                close();
            });
        });
        const backdrop = this.querySelector('#modal-backdrop');
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
                    <span class="arborito-eyebrow">${esc(lbl)}${active ? ' ●' : ''}</span>
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
                <p class="arborito-eyebrow arborito-eyebrow--sm m-0">${esc(ui.conHistoryDiffHeading || 'Changes in this step')}</p>
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
