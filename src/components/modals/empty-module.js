
import { store } from '../../store.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';

class ArboritoModalEmptyModule extends HTMLElement {
    connectedCallback() {
        this.render();
    }

    close() {
        store.dismissModal();
    }

    render() {
        const ui = store.ui;
        const node = store.value.modal.node;
        
        // Calculate GitHub Repo URL
        let repoUrl = 'https://github.com/treesys-org/arborito-library';
        const sourceUrl = store.value.activeSource?.url;
        
        if (sourceUrl) {
            if (sourceUrl.includes('raw.githubusercontent.com')) {
                const parts = sourceUrl.split('/');
                // Format: https://raw.githubusercontent.com/OWNER/REPO/main/...
                if (parts.length >= 5) {
                    repoUrl = `https://github.com/${parts[3]}/${parts[4]}`;
                }
            } else if (sourceUrl.includes('github.io')) {
                // Heuristic: https://OWNER.github.io/REPO/...
                try {
                    const urlObj = new URL(sourceUrl);
                    const owner = urlObj.hostname.split('.')[0];
                    const repo = urlObj.pathname.split('/')[1];
                    if (owner && repo) {
                        repoUrl = `https://github.com/${owner}/${repo}`;
                    }
                } catch(e) {}
            }
        }

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950 p-4 animate-in fade-in arborito-modal-root">
            <div class="relative arborito-float-modal-card arborito-float-modal-card--auto-h arborito-float-modal-card--narrow w-full">
                <div class="bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl p-8 text-center relative overflow-visible border border-slate-200 dark:border-slate-800 transform transition-all hover:scale-[1.02] flex flex-col">
                    <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2 items-center gap-2 mb-4">
                        ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0', { tagClass: 'btn-close' })}
                        <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0 text-left truncate text-base">${ui.emptyModuleTitle}</h2>
                        ${modalWindowCloseXHtml(ui, 'btn-close')}
                    </div>

                    <!-- Decorative Balloon Tail (Pointing down to the node) -->
                    <div class="absolute -bottom-3 left-1/2 -translate-x-1/2 w-8 h-8 bg-white dark:bg-slate-900 rotate-45 transform border-r border-b border-slate-200 dark:border-slate-800"></div>

                    <div class="text-6xl mb-4 animate-bounce" style="animation-duration: 2s;">🍂</div>
                    
                    <p class="text-slate-500 dark:text-slate-400 mb-6 text-sm font-medium leading-relaxed">
                        ${ui.emptyModuleDesc}
                    </p>
                    
                    <div class="space-y-3 relative z-10">
                        <a href="${repoUrl}" target="_blank" rel="noopener noreferrer" class="flex items-center justify-center gap-2 w-full py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl shadow-lg hover:opacity-90 active:scale-95 transition-all text-sm group">
                            <svg class="w-5 h-5 transition-transform group-hover:rotate-12" fill="currentColor" viewBox="0 0 24 24"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.164 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.322-3.369-1.322-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.597 1.028 2.688 0 3.848-2.339 4.685-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z" /></svg>
                            ${ui.contributeLink}
                        </a>

                        ${store.value.githubUser 
                            ? `<button class="btn-create-lesson w-full py-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 font-bold rounded-xl border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors text-sm">
                                + ${ui.adminNewFile} (Editor)
                               </button>` 
                            : ''}
                    </div>
                </div>
            </div>
        </div>`;

        this.querySelectorAll('.btn-close').forEach((b) => (b.onclick = () => this.close()));
        const btnCreate = this.querySelector('.btn-create-lesson');
        if(btnCreate) {
            btnCreate.onclick = () => {
                this.close();
                
                // Construct a new temporary node for the editor
                // Ensure we strip 'meta.json' if the folder sourcePath included it
                let parentPath = node.sourcePath;
                if (parentPath.endsWith('/meta.json')) parentPath = parentPath.replace('/meta.json', '');
                if (parentPath.endsWith('/')) parentPath = parentPath.slice(0, -1);

                const newNode = {
                    id: `new-${Date.now()}`,
                    parentId: node.id,
                    name: "New Lesson",
                    type: "leaf",
                    icon: "📄",
                    description: "New content...",
                    // Default path suggestion for the new file
                    sourcePath: `${parentPath}/01_Intro.md`, 
                    content: "# New Lesson\n\nStart writing here."
                };
                
                store.openEditor(newNode);
            };
        }
    }
}
customElements.define('arborito-modal-empty-module', ArboritoModalEmptyModule);
