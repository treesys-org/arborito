import { store } from '../../store.js';
import { aiService } from '../../services/ai.js';
import { shouldShowMobileUI } from '../../utils/breakpoints.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';

export const SAGE_OPEN = 'arborito-sage--open';

export function sageHideDismissButton() {
    return false;
}

export class ArboritoSageUICore extends HTMLElement {
    render() {
        if (!this.isVisible) {
            if (this.innerHTML !== '') {
                this.innerHTML = '';
                this.className = '';
                this.lastRenderKey = null;
            }
            return;
        }

        const { ai } = store.value;
        const provider = aiService.config.provider;
        
        const stateKey = JSON.stringify({
             visible: this.isVisible,
             mode: this.mode,
             ollamaModels: this.ollamaModels,
             pullStatus: this.pullStatus,
             aiStatus: ai.status,
             aiProgress: ai.progress,
             msgCount: ai.messages.length,
             provider: provider,
             hasConsent: this.hasConsent,
             ollamaError: this.ollamaConnectionError
        });

        if (stateKey === this.lastRenderKey) return;
        this.lastRenderKey = stateKey;

        // CHECK FOR GDPR CONSENT (model download in browser — Transformers.js)
        if (this.mode !== 'settings' && provider === 'browser' && !this.hasConsent) {
            this.renderConsent();
            return;
        }

        if (this.mode === 'settings') {
            this.renderSettings();
        } else if (this.mode === 'menu') {
            this.renderMenu();
        } else {
            if (provider === 'browser' && ai.status === 'loading') {
                this.renderLoadingScreen(ai.progress);
            } else {
                this.renderChat();
            }
        }
    }
    
    renderLoadingScreen(progressText) {
        // Match the displayed "(NN%)" from the worker (per-file progress). Do not use a
        // monotonic max across files — that kept the bar at 100% while the label moved to the next shard.
        let parsed = null;
        if (progressText) {
            const match = progressText.match(/(\d+)%/);
            if (match) parsed = Math.min(100, parseInt(match[1], 10));
        }

        const existingBar = this.querySelector('.js-progress-bar');
        const existingText = this.querySelector('.js-progress-text');
        const container = this.querySelector('#loading-container');

        if (existingBar && existingText && container) {
            if (parsed !== null) existingBar.style.width = `${parsed}%`;
            existingText.textContent = progressText || 'Starting...';
            return;
        }

        const percent = parsed !== null ? parsed : 0;

        // Full Render (Initial)
        const mob = shouldShowMobileUI();
        const hideDismiss = sageHideDismissButton();
        this.className = mob
            ? `${SAGE_OPEN} fixed z-[135] arborito-sage-mob-frame flex flex-col pointer-events-none items-stretch bg-slate-100 dark:bg-slate-950`
            : `${SAGE_OPEN} fixed inset-x-0 bottom-0 z-[135] flex flex-col items-end pointer-events-none md:bottom-6 md:right-6 md:w-auto`;
        const ui = store.ui;
        const shellMob = mob
            ? 'h-full max-h-full min-h-0 w-full max-w-[100vw] rounded-none border-0 shadow-none'
            : 'rounded-2xl w-[min(420px,calc(100vw-2rem))] h-auto max-h-[calc(100vh-2.5rem)] rounded-t-2xl md:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800';
        const loadingHeadMob = hideDismiss
            ? ''
            : `<div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2 items-center gap-2">
                ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0', { tagClass: 'btn-sage-loading-back btn-close' })}
                <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${ui.sageTitle || 'Sage'}</h2>
                ${modalWindowCloseXHtml(ui, 'btn-close')}
            </div>`;
        this.innerHTML = mob
            ? `
            <div class="pointer-events-auto flex flex-col h-full min-h-0 w-full overflow-hidden animate-in slide-in-from-bottom-10 fade-in">
                <div class="arborito-modal-dock-panel flex flex-col flex-1 min-h-0 h-full overflow-hidden">
                ${loadingHeadMob}
                <div id="loading-container" class="flex flex-col flex-1 min-h-0 justify-center p-8 text-center ${shellMob}">
                <div class="w-16 h-16 bg-green-50 dark:bg-green-900/20 rounded-full mx-auto flex items-center justify-center text-3xl mb-4" aria-hidden="true">
                    🧠
                </div>
                <h3 class="text-lg font-black text-slate-800 dark:text-slate-100 mb-2">Initializing Brain</h3>
                <p class="text-xs text-slate-600 dark:text-slate-400 mb-6">Downloading AI Model to your browser. This only happens once.</p>
                
                <div class="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 mb-2 overflow-hidden border border-slate-200 dark:border-slate-700">
                    <div class="js-progress-bar bg-green-500 h-full min-w-0 transition-[width] duration-300 ease-out" style="width: ${percent}%"></div>
                </div>
                <p class="js-progress-text text-xs font-mono font-bold text-green-600 dark:text-green-400">${progressText || 'Starting...'}</p>
                
                ${hideDismiss ? '' : '<button type="button" id="btn-sage-loading-cancel" class="mt-6 px-6 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold text-slate-600 hover:text-slate-800 dark:text-slate-300 dark:hover:text-slate-100 transition-colors active:scale-95">Cancel</button>'}
                </div>
                </div>
            </div>
        `
            : `
            <div id="loading-container" class="pointer-events-auto transition-all duration-300 origin-bottom-right ${shellMob} bg-white dark:bg-slate-900 flex flex-col animate-in slide-in-from-bottom-10 fade-in p-8 text-center">
                <div class="w-16 h-16 bg-green-50 dark:bg-green-900/20 rounded-full mx-auto flex items-center justify-center text-3xl mb-4" aria-hidden="true">
                    🧠
                </div>
                <h3 class="text-lg font-black text-slate-800 dark:text-white mb-2">Initializing Brain</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 mb-6">Downloading AI Model to your browser. This only happens once.</p>
                
                <div class="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 mb-2 overflow-hidden border border-slate-200 dark:border-slate-700">
                    <div class="js-progress-bar bg-green-500 h-full min-w-0 transition-[width] duration-300 ease-out" style="width: ${percent}%"></div>
                </div>
                <p class="js-progress-text text-xs font-mono font-bold text-green-600 dark:text-green-400">${progressText || 'Starting...'}</p>
                
                ${hideDismiss ? '' : '<button type="button" id="btn-sage-loading-cancel" class="mt-6 px-6 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors active:scale-95">Cancel</button>'}
            </div>
        `;
        
        const cancelBtn = this.querySelector('#btn-sage-loading-cancel');
        if (cancelBtn) cancelBtn.onclick = () => {
            // store.abortSage(); // Optional: Implement abort logic in store
            this.close();
        };
        const loadBack = this.querySelector('.btn-sage-loading-back');
        if (loadBack) loadBack.onclick = () => this.close();
        const loadX = this.querySelector('.arborito-modal-dock-panel .arborito-modal-window-x');
        if (loadX) loadX.onclick = () => this.close();
    }
    
    renderConsent() {
        const ui = store.ui;
        const mob = shouldShowMobileUI();
        const hideDismiss = sageHideDismissButton();
        const deskBackdrop = mob ? 'bg-slate-100 dark:bg-slate-950' : 'arborito-sage-desk-scrim';
        this.className = `${SAGE_OPEN} fixed ${mob ? 'z-[135] arborito-sage-mob-frame' : 'inset-0 z-[135]'} flex pointer-events-none ${mob ? 'flex-col items-stretch p-0' : 'items-center justify-center p-4'} ${deskBackdrop}`;
        this.innerHTML = mob ? `
            <div class="pointer-events-auto flex flex-col h-full max-h-full min-h-0 w-full max-w-[100vw] overflow-hidden animate-in fade-in duration-200">
                <div class="arborito-modal-dock-panel flex flex-col flex-1 min-h-0 h-full max-h-full overflow-hidden">
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2">
                    ${hideDismiss ? '' : modalNavBackHtml(ui, 'arborito-mmenu-back w-11 h-11 shrink-0', { tagClass: 'btn-close' })}
                    <span class="text-2xl shrink-0" aria-hidden="true">📡</span>
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">External Download</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>
                <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6">
                    <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800 mb-6">
                        <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                            To run the AI locally in your browser, Arborito needs to download model files (~200MB+) from the <strong>Hugging Face CDN</strong>.
                        </p>
                    </div>
                    <div class="mb-6 p-3 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800/30 rounded-xl">
                        <p class="text-xs text-yellow-700 dark:text-yellow-400 leading-tight font-bold">
                            Privacy Note: This connects to a third-party server (jsdelivr/huggingface) to fetch the files. Once downloaded, the AI runs entirely offline on your device.
                        </p>
                    </div>
                    <button id="btn-accept-consent" class="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-transform">
                        I Accept & Download
                    </button>
                    <div class="mt-4 text-center">
                        <button type="button" id="btn-config-local" class="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline">
                            Switch to Local AI (Ollama)
                        </button>
                    </div>
                </div>
                </div>
            </div>
        `             : `
            <div class="pointer-events-auto arborito-float-modal-card arborito-float-modal-card--auto-h arborito-sage-external-download-card bg-white dark:bg-slate-900 rounded-3xl shadow-2xl relative overflow-hidden flex flex-col animate-in zoom-in duration-200 border border-slate-200 dark:border-slate-800">
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2 items-center gap-2">
                    <span class="text-2xl shrink-0" aria-hidden="true">📡</span>
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">External Download</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>
                <div class="p-6 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800 mb-6">
                        <p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                            To run the AI locally in your browser, Arborito needs to download model files (~200MB+) from the <strong>Hugging Face CDN</strong>.
                        </p>
                    </div>
                    <div class="mb-6 p-3 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800/30 rounded-xl">
                        <p class="text-xs text-yellow-700 dark:text-yellow-400 leading-tight font-bold">
                            Privacy Note: This connects to a third-party server (jsdelivr/huggingface) to fetch the files. Once downloaded, the AI runs entirely offline on your device.
                        </p>
                    </div>
                    <button id="btn-accept-consent" class="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-transform">
                        I Accept & Download
                    </button>
                    <div class="mt-4 text-center">
                        <button type="button" id="btn-config-local" class="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline">
                            Switch to Local AI (Ollama)
                        </button>
                    </div>
                </div>
            </div>
        `;
        this.querySelectorAll('.btn-close').forEach((b) => {
            b.onclick = () => this.close();
        });
        this.querySelector('#btn-accept-consent').onclick = () => this.acceptConsent();
        this.querySelector('#btn-config-local').onclick = () => {
            this.mode = 'settings';
            this.render();
        };
    }

    renderMenu() {
        const ui = store.ui;
        const mob = shouldShowMobileUI();
        const hideDismiss = sageHideDismissButton();
        const deskBackdropMenu = mob ? 'bg-slate-100 dark:bg-slate-950' : 'arborito-sage-desk-scrim';
        this.className = `${SAGE_OPEN} fixed ${mob ? 'z-[135] arborito-sage-mob-frame' : 'inset-0 z-[135]'} flex pointer-events-none ${mob ? 'flex-col items-stretch p-0' : 'items-center justify-center p-4'} ${deskBackdropMenu}`;
        const body = `
                <div class="p-6 space-y-4">
                    <button type="button" id="btn-menu-chat" class="w-full text-left p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all group">
                         <div class="flex items-center gap-4">
                            <div class="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/40 text-purple-600 flex items-center justify-center text-xl">💬</div>
                            <div>
                                <h4 class="font-bold text-slate-800 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">Chat</h4>
                                <p class="text-xs text-slate-500 dark:text-slate-400">Ask the Sage</p>
                            </div>
                         </div>
                    </button>
                    <button type="button" id="btn-menu-settings" class="w-full text-left p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all group">
                         <div class="flex items-center gap-4">
                            <div class="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 flex items-center justify-center text-xl">⚙️</div>
                            <div>
                                <h4 class="font-bold text-slate-800 dark:text-white group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">${ui.sageSettings}</h4>
                                <p class="text-xs text-slate-500 dark:text-slate-400">${ui.sageConfigDesc}</p>
                            </div>
                         </div>
                    </button>
                </div>`;
        this.innerHTML = mob ? `
            <div class="pointer-events-auto flex flex-col h-full max-h-full min-h-0 w-full max-w-[100vw] overflow-hidden animate-in fade-in duration-200">
                <div class="arborito-modal-dock-panel flex flex-col flex-1 min-h-0 h-full overflow-hidden">
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2">
                    ${hideDismiss ? '' : modalNavBackHtml(ui, 'arborito-mmenu-back w-11 h-11 shrink-0', { tagClass: 'btn-close' })}
                    <span class="text-2xl shrink-0" aria-hidden="true">🦉</span>
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${ui.sageMenuTitle}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>
                <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar">${body}
                </div>
                </div>
            </div>
        ` : `
            <div class="pointer-events-auto arborito-float-modal-card arborito-float-modal-card--auto-h arborito-float-modal-card--narrow bg-white dark:bg-slate-900 rounded-3xl shadow-2xl relative overflow-hidden flex flex-col animate-in zoom-in duration-200 border border-slate-200 dark:border-slate-800">
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2 items-center gap-2">
                    <span class="text-2xl shrink-0" aria-hidden="true">🦉</span>
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${ui.sageMenuTitle}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>
                <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar">${body}</div>
            </div>
        `;
        this.querySelectorAll('.btn-close').forEach((b) => {
            b.onclick = () => this.close();
        });
        this.querySelector('#btn-menu-chat').onclick = () => { this.mode = 'chat'; this.render(); };
        this.querySelector('#btn-menu-settings').onclick = () => { this.mode = 'settings'; this.render(); };
    }

}
