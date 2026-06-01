
import { store } from '../../../core/store.js';
import { escAttr as escHtml } from '../../../shared/lib/html-escape.js';
import { modalShellHtml } from '../../../shared/ui/modal-shell.js';
import { modalHeroHtml } from '../../../shared/ui/modal-hero.js';

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
        const isComplete = store.isCompleted(node.id);
        const icon = node.icon || (node.type === 'exam' ? '⚔️' : '📄');
        const btnText = isComplete ? ui.lessonFinished : ui.lessonEnter;
        const btnClass = isComplete ? 'arborito-cta-green' : 'arborito-cta-purple';
        const nameHtml = escHtml(node.name);
        const descHtml = escHtml(node.description || ui.noDescription);

        const body = `
                ${modalHeroHtml(ui, { title: ui.lessonPreview || 'Preview', tagClass: 'btn-cancel' })}

                <div class="p-8 text-center">
                    <div class="w-24 h-24 mx-auto bg-slate-50 dark:bg-slate-800 rounded-3xl flex items-center justify-center text-5xl mb-6 shadow-inner border border-slate-100 dark:border-slate-700/50 transform rotate-3">
                        ${icon}
                    </div>

                    <h2 class="text-2xl font-black text-slate-800 dark:text-white mb-3 leading-tight">${nameHtml}</h2>

                    <p class="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed text-sm max-w-[260px] mx-auto">
                        ${descHtml}
                    </p>

                    <div class="flex gap-3 justify-center w-full">
                        <button class="btn-enter w-full py-4 rounded-2xl font-bold text-white shadow-xl shadow-purple-500/20 transition-transform active:scale-95 flex items-center justify-center gap-2 ${btnClass}">
                            <span>${isComplete ? '✓' : '🚀'}</span> ${btnText}
                        </button>
                    </div>
                </div>`;
        this.innerHTML = modalShellHtml({
            bodyHtml: body,
            panelSize: 'auto-h',
            panelClass: 'arborito-float-modal-card--md',
            enter: 'fade',
        });

        this.querySelector('.btn-enter').onclick = () => store.enterLesson();
        this.querySelectorAll('.btn-cancel').forEach((b) => b.onclick = () => this.close());
    }
}
customElements.define('arborito-modal-preview', ArboritoModalPreview);
