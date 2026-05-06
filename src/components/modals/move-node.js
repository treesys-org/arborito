import { store } from '../../store.js';
import { shouldShowMobileUI } from '../../utils/breakpoints.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';
import { bindMobileTap, isModalBackdropEmptyTap } from '../../utils/mobile-tap.js';
import { fileSystem } from '../../services/filesystem.js';
import { escHtml, escAttr } from '../../utils/html-escape.js';

/** Valid folders as new parent (excludes node and whole subtree). */
function collectMoveTargets(root, movingNode) {
    const invalid = new Set();
    const markDesc = (n) => {
        invalid.add(n.id);
        (n.children || []).forEach(markDesc);
    };
    markDesc(movingNode);

    const out = [];
    const walk = (n) => {
        if ((n.type === 'root' || n.type === 'branch') && !invalid.has(n.id)) {
            out.push(n);
        }
        (n.children || []).forEach(walk);
    };
    walk(root);
    return out;
}

/** Human-readable path from root (e.g. "Home / Module / Unit"). */
function breadcrumbPath(root, target) {
    const labels = [];
    const dfs = (n, stack) => {
        if (String(n.id) === String(target.id)) {
            labels.push(...stack.map((x) => x.name || String(x.id)), n.name || String(n.id));
            return true;
        }
        for (const c of n.children || []) {
            if (dfs(c, [...stack, n])) return true;
        }
        return false;
    };
    dfs(root, []);
    return labels.join(' / ');
}

class ArboritoModalMoveNode extends HTMLElement {
    connectedCallback() {
        const modal = store.value.modal;
        const root = store.value.data;
        const ui = store.ui;
        const xDismiss = modalWindowCloseXHtml(ui, 'js-move-x');
        const moving = (modal && modal.node) ? store.findNode(modal.node.id) : null;

        if (!moving || !root || moving.type === 'root') {
            store.dismissModal();
            return;
        }

        const rawTargets = collectMoveTargets(root, moving);
        const isMob = shouldShowMobileUI();

        if (rawTargets.length === 0) {
            store.dismissModal();
            queueMicrotask(() => store.alert(ui.moveNoTargets || 'No valid folder to move into.'));
            return;
        }

        const decorated = rawTargets.map((t) => ({
            node: t,
            crumb: breadcrumbPath(root, t)
        }));
        decorated.sort((a, b) =>
            a.crumb.localeCompare(b.crumb, undefined, { sensitivity: 'base' })
        );

        const rows = decorated
            .map(({ node: t, crumb }) => {
                const id = String(t.id).replace(/"/g, '&quot;');
                const title = t.name || t.path || crumb;
                const filterRaw = `${t.name || ''} ${crumb}`.toLowerCase();
                return `<button type="button" class="move-node-target-btn w-full text-left px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 transition-colors active:scale-[0.99] flex items-start gap-2" data-target-id="${id}" data-filter-text="${escAttr(filterRaw)}">
                <span class="text-lg shrink-0 leading-none pt-0.5" aria-hidden="true">${t.icon || '📁'}</span>
                <span class="min-w-0 flex-1 flex flex-col gap-0.5">
                    <span class="text-sm font-bold break-words">${escHtml(title)}</span>
                    <span class="text-[10px] font-semibold text-slate-500 dark:text-slate-400 break-words leading-snug">${escHtml(crumb)}</span>
                </span>
            </button>`;
            })
            .join('');

        const searchPh = escAttr(ui.moveSearchPlaceholder || 'Search folders…');
        const pickTreeLabel = escHtml(ui.movePickOnTreeBtn || 'Choose on tree');

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-slate-950 p-0 sm:p-4 animate-in fade-in duration-200 arborito-modal-root ${isMob ? 'arborito-modal--mobile' : ''}">
            <div class="arborito-float-modal-card arborito-float-modal-card--auto-h arborito-float-modal-card--narrow bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:w-auto max-h-[min(88dvh,640px)] flex flex-col border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800 items-start">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0', { tagClass: 'js-move-back' })}
                    <div class="min-w-0 flex-1">
                        <h3 class="text-lg font-black text-slate-800 dark:text-white m-0">${escHtml(ui.moveChooseParent || 'Move into folder')}</h3>
                        <p class="text-xs text-slate-500 mt-1 font-semibold truncate">${escHtml(moving.icon || '')} ${escHtml(moving.name || '')}</p>
                    </div>
                    ${xDismiss}
                </div>
                <div class="shrink-0 px-3 pt-3 pb-2 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <label for="move-node-filter" class="sr-only">${escHtml(ui.moveSearchPlaceholder || 'Search folders')}</label>
                    <input type="search" id="move-node-filter" autocomplete="off" placeholder="${searchPh}" class="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/80 px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
                </div>
                <div class="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 custom-scrollbar" id="move-node-target-list">
                    ${rows}
                </div>
                <div class="p-3 border-t border-slate-100 dark:border-slate-800 shrink-0 flex flex-col gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    <button type="button" class="js-move-pick-tree w-full py-2.5 rounded-xl font-bold border border-amber-400/60 dark:border-amber-600/50 bg-amber-50 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100 text-sm">${pickTreeLabel}</button>
                    <button type="button" class="js-move-cancel w-full py-3 rounded-xl font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">${escHtml(ui.cancel || 'Cancel')}</button>
                </div>
            </div>
        </div>`;

        const backdrop = this.querySelector('#modal-backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', (e) => {
                if (isModalBackdropEmptyTap(backdrop, e)) store.dismissModal();
            });
        }
        const dismissMove = () => store.dismissModal();
        const backEl = this.querySelector('.js-move-back');
        if (backEl) bindMobileTap(backEl, dismissMove);
        const xBtn = this.querySelector('.js-move-x');
        if (xBtn) bindMobileTap(xBtn, dismissMove);
        const cancelEl = this.querySelector('.js-move-cancel');
        if (cancelEl) bindMobileTap(cancelEl, dismissMove);

        const filterEl = this.querySelector('#move-node-filter');
        (filterEl && filterEl.addEventListener)('input', () => {
            const q = (filterEl.value || '').trim().toLowerCase();
            this.querySelectorAll('.move-node-target-btn[data-target-id]').forEach((btn) => {
                const hay = (btn.getAttribute('data-filter-text') || '').toLowerCase();
                btn.classList.toggle('hidden', !!(q && !hay.includes(q)));
            });
        });

        const pickTree = this.querySelector('.js-move-pick-tree');
        if (pickTree) {
            bindMobileTap(pickTree, () => {
                const graphEl = document.querySelector('arborito-graph');
                store.dismissModal();
                queueMicrotask(() => { if (graphEl && graphEl.startMovePickOnTree) graphEl.startMovePickOnTree(moving.id); });
            });
        }

        this.querySelectorAll('.move-node-target-btn[data-target-id]').forEach((btn) => {
            bindMobileTap(btn, async (ev) => {
                if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
                const id = btn.getAttribute('data-target-id');
                store.dismissModal();
                if (id) await store.moveNode(moving, id);
            });
        });
    }
}

customElements.define('arborito-modal-move-node', ArboritoModalMoveNode);
