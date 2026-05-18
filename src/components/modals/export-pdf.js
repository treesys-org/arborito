
import { store } from '../../store.js';
import { pdfGenerator } from '../../services/pdf-generator.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';

class ArboritoModalExportPdf extends HTMLElement {
    constructor() {
        super();
        this.state = {
            isGeneratingPdf: false,
            pdfProgress: 0
        };
    }

    connectedCallback() {
        this.render();
    }

    close() {
        store.dismissModal();
    }

    async handleExport(mode, node) {
        this.state.isGeneratingPdf = true;
        this.state.pdfProgress = 0;
        this.render(); // Re-render to show progress spinner
        
        try {
            let nodesToPrint = [];
            
            if (mode === 'lesson') {
                nodesToPrint = [node];
            } else {
                // Fetch Module
                const parentId = node.parentId;
                let parentNode = store.findNode(parentId);
                
                if (!parentNode) {
                     nodesToPrint = [node];
                } else {
                     // Ensure children are loaded
                     if (parentNode.hasUnloadedChildren) {
                         await store.loadNodeChildren(parentNode);
                     }
                     // Filter only leaves
                     const siblings = parentNode.children.filter(n => n.type === 'leaf' || n.type === 'exam');
                     nodesToPrint = await Promise.all(siblings.map(async (child) => child));
                }
            }
            
            await pdfGenerator.generate(nodesToPrint, (progress) => {
                this.state.pdfProgress = progress;
                this.render();
            });
            
            this.close();

        } catch (e) {
            console.error(e);
            const ui = store.ui;
            store.alert(
                (ui.exportPdfError || 'Error generating PDF: {message}').replace('{message}', e.message)
            );
            this.close();
        }
    }

    render() {
        const ui = store.ui;
        const node = store.value.modal.node;

        let innerContent = '';

        if (this.state.isGeneratingPdf) {
            innerContent = `
             <div class="p-12 flex flex-col items-center justify-center text-center">
                 <div class="relative w-20 h-20 mb-6 flex items-center justify-center">
                     <svg class="w-20 h-20 text-slate-200 dark:text-slate-700" viewBox="0 0 100 100">
                        <circle stroke-width="8" stroke="currentColor" fill="transparent" r="42" cx="50" cy="50" />
                        <circle class="text-purple-600 transition-all duration-300 ease-out" stroke-width="8" stroke-dasharray="264" stroke-dashoffset="${264 * (1 - this.state.pdfProgress / 100)}" stroke-linecap="round" stroke="currentColor" fill="transparent" r="42" cx="50" cy="50" style="transform: rotate(-90deg); transform-origin: 50% 50%;" />
                     </svg>
                     <span class="absolute font-black text-slate-700 dark:text-white text-lg">${this.state.pdfProgress}%</span>
                 </div>
                 <h2 class="text-xl font-bold text-slate-800 dark:text-white animate-pulse">${ui.generatingPdf}</h2>
                 <p class="text-xs text-slate-400 mt-2">Processing lessons...</p>
             </div>`;
        } else {
            innerContent = `
            <div class="p-8 text-center">
                <h2 class="text-2xl font-black mb-2 text-slate-800 dark:text-white">${ui.exportTitle}</h2>
                <p class="text-slate-500 dark:text-slate-400 mb-8">${ui.exportDesc}</p>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button id="btn-export-lesson" class="bg-slate-50 dark:bg-slate-800 hover:bg-purple-50 dark:hover:bg-purple-900/20 border-2 border-slate-100 dark:border-slate-700 hover:border-purple-500 dark:hover:border-purple-500 rounded-2xl p-6 transition-all group active:scale-95 text-left">
                        <div class="w-12 h-12 bg-white dark:bg-slate-700 rounded-full flex items-center justify-center text-2xl mb-4 shadow-sm group-hover:scale-110 transition-transform">📄</div>
                        <h3 class="font-bold text-lg text-slate-800 dark:text-white mb-1 group-hover:text-purple-600 dark:group-hover:text-purple-400">${ui.exportLesson}</h3>
                        <p class="text-xs text-slate-500 dark:text-slate-400">${ui.exportLessonDesc}</p>
                    </button>
                    
                    <button id="btn-export-module" class="bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-2 border-slate-100 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 rounded-2xl p-6 transition-all group active:scale-95 text-left">
                         <div class="w-12 h-12 bg-white dark:bg-slate-700 rounded-full flex items-center justify-center text-2xl mb-4 shadow-sm group-hover:scale-110 transition-transform">📚</div>
                         <h3 class="font-bold text-lg text-slate-800 dark:text-white mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400">${ui.exportModule}</h3>
                         <p class="text-xs text-slate-500 dark:text-slate-400">${ui.exportModuleDesc}</p>
                    </button>
                </div>
            </div>`;
        }

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950 p-4 animate-in arborito-modal-root">
            <div class="arborito-float-modal-card arborito-float-modal-card--auto-h arborito-float-modal-card--lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto transition-all duration-300">
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0')}
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${ui.exportTitle}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>
                <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar">${innerContent}</div>
            </div>
        </div>`;

        this.querySelectorAll('.btn-close').forEach((b) => (b.onclick = () => this.close()));
        
        const btnLesson = this.querySelector('#btn-export-lesson');
        if(btnLesson) btnLesson.onclick = () => this.handleExport('lesson', node);
        
        const btnModule = this.querySelector('#btn-export-module');
        if(btnModule) btnModule.onclick = () => this.handleExport('module', node);
    }
}
customElements.define('arborito-modal-export-pdf', ArboritoModalExportPdf);
