import { store } from '../../store.js';
import { shouldShowMobileUI } from '../../utils/breakpoints.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';

/** Carpetas válidas como nuevo padre (excluye el nodo y todo su subárbol). */
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
    out.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
    return out;
}

class ArboritoModalMoveNode extends HTMLElement {
    connectedCallback() {
        const modal = store.value.modal;
        const root = store.value.data;
        const ui = store.ui;
        const xDismiss = modalWindowCloseXHtml(ui, 'js-move-x');
        const moving = modal?.node ? store.findNode(modal.node.id) : null;

        if (!moving || !root || moving.type === 'root') {
            store.dismissModal();
            return;
        }

        const targets = collectMoveTargets(root, moving);
        const isMob = shouldShowMobileUI();

        if (targets.length === 0) {
            store.dismissModal();
            queueMicrotask(() => store.alert(ui.moveNoTargets || 'No valid folder to move into.'));
            return;
        }

        const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

        const rows = targets
            .map((t) => {
                const id = String(t.id).replace(/"/g, '&quot;');
                const label = esc(t.path || t.name || '');
                return `<button type="button" class="w-full text-left px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-bold text-slate-800 dark:text-slate-100 transition-colors active:scale-[0.99]" data-target-id="${id}">
                <span class="text-lg mr-2" aria-hidden="true">${t.icon || '📁'}</span>
                <span class="break-words align-middle">${label}</span>
            </button>`;
            })
            .join('');

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-slate-950 p-0 sm:p-4 animate-in fade-in duration-200 arborito-modal-root ${isMob ? 'arborito-modal--mobile' : ''}">
            <div class="arborito-float-modal-card arborito-float-modal-card--auto-h arborito-float-modal-card--narrow bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:w-auto max-h-[min(88dvh,640px)] flex flex-col border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800 items-start">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0', { tagClass: 'js-move-back' })}
                    <div class="min-w-0 flex-1">
                        <h3 class="text-lg font-black text-slate-800 dark:text-white m-0">${ui.moveChooseParent || 'Move into folder'}</h3>
                        <p class="text-xs text-slate-500 mt-1 font-semibold truncate">${esc(moving.icon || '')} ${esc(moving.name || '')}</p>
                    </div>
                    ${xDismiss}
                </div>
                <div class="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                    ${rows}
                </div>
                <div class="p-3 border-t border-slate-100 dark:border-slate-800 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    <button type="button" class="js-move-cancel w-full py-3 rounded-xl font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">${ui.cancel || 'Cancel'}</button>
                </div>
            </div>
        </div>`;

        const backdrop = this.querySelector('#modal-backdrop');
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) store.dismissModal();
        });
        const dismissMove = () => store.dismissModal();
        this.querySelector('.js-move-back')?.addEventListener('click', dismissMove);
        const xBtn = this.querySelector('.js-move-x');
        if (xBtn) xBtn.onclick = dismissMove;
        this.querySelector('.js-move-cancel').onclick = dismissMove;

        this.querySelectorAll('[data-target-id]').forEach((btn) => {
            btn.onclick = async () => {
                const id = btn.getAttribute('data-target-id');
                store.dismissModal();
                if (id) await store.moveNode(moving, id);
            };
        });
    }
}

customElements.define('arborito-modal-move-node', ArboritoModalMoveNode);
