
import { store } from '../../store.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';

class ArboritoModalPrivacy extends HTMLElement {
    connectedCallback() {
        this.render();
        this._storeListener = () => this.render();
        store.addEventListener('state-change', this._storeListener);
    }

    disconnectedCallback() {
        if (this._storeListener) {
            store.removeEventListener('state-change', this._storeListener);
        }
    }

    close() {
        store.dismissModal();
    }

    openImpressum() {
        // Redirect to the About Modal, specifically the Legal tab
        store.setModal({ type: 'about', tab: 'legal' });
    }

    render() {
        const ui = store.ui;
        
        let privacyHtml = ui.privacyText || "Legal text not loaded.";
        
        // REPLACEMENT LOGIC:
        const controllerReference = `
            <div class="mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                <p class="text-sm text-slate-600 dark:text-slate-300 mb-2 font-medium">
                    ${ui.impressumText || "The data controller is the publisher of this application."}
                </p>
                <button id="btn-link-impressum" class="text-blue-600 dark:text-blue-400 hover:underline text-xs font-bold flex items-center gap-2 transition-colors">
                    <span>⚖️</span> <span>Go to Legal Notice (Impressum)</span> ➜
                </button>
            </div>
        `;

        // Replace the placeholder {impressum} with the link button
        privacyHtml = privacyHtml.replace('{impressum}', controllerReference);

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950 p-4 animate-in arborito-modal-root">
            <div class="arborito-float-modal-card arborito-float-modal-card--xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto">
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2 items-center gap-2">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0', { tagClass: 'btn-privacy-mob-back' })}
                    <span class="text-2xl shrink-0" aria-hidden="true">🛡️</span>
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${ui.privacyTitle || "Privacy & Data Protection"}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-privacy-x')}
                </div>

                <div class="p-8 pt-6 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                    <div class="prose prose-sm prose-slate dark:prose-invert max-w-none">
                        
                        <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800 mb-6 not-prose">
                            <p class="text-xs text-blue-800 dark:text-blue-300 font-bold leading-relaxed">
                                <strong>Data Sovereignty:</strong> This application runs "Local-First". Your educational progress is stored in your browser's LocalStorage. No data is sent to a central server for storage.
                            </p>
                        </div>

                        ${privacyHtml}
                        
                        <hr class="my-6 border-slate-200 dark:border-slate-700">
                        
                        <h3>AI & Third Parties</h3>
                        <div class="bg-slate-100 dark:bg-slate-800 p-4 rounded-xl text-xs space-y-2">
                            <p><strong>Local AI (Ollama):</strong> Runs on your machine. Traffic stays on your network (or localhost).</p>
                            <p><strong>In-Browser AI (Transformers.js):</strong> Only after you accept the download prompt in Sage: the runtime loads from <strong>jsDelivr</strong> and model weights from <strong>Hugging Face</strong> (and related CDNs such as AWS/CloudFront). Then inference runs locally in your browser. Until you consent, the app does not open connections to those hosts for AI.</p>
                        </div>

                        <hr class="my-6 border-slate-200 dark:border-slate-700">
                        
                        <h3>Technical Stack (Transparency)</h3>
                        <ul class="text-xs font-mono bg-slate-100 dark:bg-slate-800 p-4 rounded-lg list-none space-y-2">
                            <li><strong>Hosting:</strong> GitHub Pages (static files only)</li>
                            <li><strong>Default content:</strong> JSON map from <code>raw.githubusercontent.com</code> (GitHub sees a normal HTTPS request; no extra trackers added by Arborito)</li>
                            <li><strong>Fonts:</strong> System fonts only (no Google Fonts or font CDNs)</li>
                            <li><strong>Styling / graph:</strong> Bundled CSS and custom canvas/SVG (no style CDNs)</li>
                            <li><strong>Analytics / ads:</strong> None (no pixels, tag managers, or social embeds in the app shell)</li>
                        </ul>

                    </div>
                </div>
                
                <div class="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-center shrink-0">
                    <button type="button" class="btn-privacy-done w-full py-3 bg-slate-900 dark:bg-slate-700 text-white font-bold rounded-xl hover:opacity-90 transition-opacity">
                        ${ui.close || "Close"}
                    </button>
                </div>
            </div>
        </div>`;

        this.querySelectorAll('.btn-privacy-mob-back').forEach((b) => (b.onclick = () => this.close()));
        this.querySelectorAll('.btn-privacy-x').forEach((b) => (b.onclick = () => this.close()));
        const pd = this.querySelector('.btn-privacy-done');
        if (pd) pd.onclick = () => this.close();
        
        const btnLink = this.querySelector('#btn-link-impressum');
        if (btnLink) btnLink.onclick = () => this.openImpressum();
    }
}
customElements.define('arborito-modal-privacy', ArboritoModalPrivacy);