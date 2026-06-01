import { store } from '../../../core/store.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { modalShellHtml } from '../../../shared/ui/modal-shell.js';
import { modalHeroHtml } from '../../../shared/ui/modal-hero.js';
import { bindMobileTap, isModalBackdropEmptyTap } from '../../../shared/ui/mobile-tap.js';
import { fileSystem } from '../../backup-export/filesystem.js';
import { escHtml, escAttr } from '../../../shared/lib/html-escape.js';

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

        const moveBody = `
                ${modalHeroHtml(ui, {
                    align: 'start',
                    title: escHtml(ui.moveChooseParent || 'Move into folder'),
                    titleClass: 'text-lg font-black text-slate-800 dark:text-white m-0',
                    subtitle: `${escHtml(moving.icon || '')} ${escHtml(moving.name || '')}`,
                    subtitleClass: 'text-xs text-slate-500 mt-1 font-semibold truncate',
                    backTagClass: 'js-move-back', closeTagClass: 'js-move-x',
                    extraWrapClass: 'pb-3 border-b border-slate-100 dark:border-slate-800',
                })}
                <div class="shrink-0 px-3 pt-3 pb-2 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <label for="move-node-filter" class="sr-only">${escHtml(ui.moveSearchPlaceholder || 'Search folders')}</label>
                    <input type="search" id="move-node-filter" autocomplete="off" placeholder="${searchPh}" class="arborito-input" />
                </div>
                <div class="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 custom-scrollbar" id="move-node-target-list">
                    ${rows}
                </div>
                <div class="arborito-modal-footer arborito-modal-footer--compact arborito-modal-footer--bg-flat flex flex-col gap-2">
                    <button type="button" class="js-move-pick-tree arborito-cta-amber w-full py-2.5 rounded-xl font-bold text-sm">${pickTreeLabel}</button>
                    <button type="button" class="js-move-cancel arborito-cta-slate w-full py-3 rounded-xl font-bold">${escHtml(ui.cancel || 'Cancel')}</button>
                </div>`;
        this.innerHTML = modalShellHtml({
            bodyHtml: moveBody,
            layout: 'bottom-sheet',
            z: 130,
            enter: 'fade-fast',
            panelSize: 'narrow auto-h',
        });

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
        if (filterEl) {
            filterEl.addEventListener('input', () => {
                const q = (filterEl.value || '').trim().toLowerCase();
                this.querySelectorAll('.move-node-target-btn[data-target-id]').forEach((btn) => {
                    const hay = (btn.getAttribute('data-filter-text') || '').toLowerCase();
                    btn.classList.toggle('hidden', !!(q && !hay.includes(q)));
                });
            });
        }

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
