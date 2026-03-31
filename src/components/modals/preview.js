
import { store } from '../../store.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';

class ArboritoModalPreview extends HTMLElement {
    connectedCallback() {
        this.render();
    }

    close() {
        store.closePreview();
    }

    render() {
        const node = store.value.previewNode;
        if (!node) return;

        const ui = store.ui;
        const xBtn = modalWindowCloseXHtml(ui, 'btn-cancel');
        const isComplete = store.isCompleted(node.id);
        const icon = node.icon || (node.type === 'exam' ? '⚔️' : '📄');
        const btnText = isComplete ? ui.lessonFinished : ui.lessonEnter;
        const btnClass = isComplete ? 'bg-green-600 hover:bg-green-500' : 'bg-purple-600 hover:bg-purple-500';

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950 p-4 animate-in fade-in arborito-modal-root">
            <div class="arborito-float-modal-card arborito-float-modal-card--auto-h arborito-float-modal-card--md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto">
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0', { tagClass: 'btn-cancel' })}
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${ui.lessonPreview || 'Preview'}</h2>
                    ${xBtn}
                </div>
                
                <div class="p-8 text-center">
                    <div class="w-24 h-24 mx-auto bg-slate-50 dark:bg-slate-800 rounded-3xl flex items-center justify-center text-5xl mb-6 shadow-inner border border-slate-100 dark:border-slate-700/50 transform rotate-3">
                        ${icon}
                    </div>
                    
                    <h2 class="text-2xl font-black text-slate-800 dark:text-white mb-3 leading-tight">${node.name}</h2>
                    
                    <p class="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed text-sm max-w-[260px] mx-auto">
                        ${node.description || ui.noDescription}
                    </p>

                    <div class="flex gap-3 justify-center w-full">
                        <button class="btn-enter w-full py-4 rounded-2xl font-bold text-white shadow-xl shadow-purple-500/20 transition-transform active:scale-95 flex items-center justify-center gap-2 ${btnClass}">
                            <span>${isComplete ? '✓' : '🚀'}</span> ${btnText}
                        </button>
                    </div>
                </div>
            </div>
        </div>`;

        this.querySelector('.btn-enter').onclick = () => store.enterLesson();
        this.querySelectorAll('.btn-cancel').forEach((b) => b.onclick = () => this.close());
    }
}
customElements.define('arborito-modal-preview', ArboritoModalPreview);
