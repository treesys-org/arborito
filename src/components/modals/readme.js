import { store } from '../../store.js';
import { parseContent } from '../../utils/parser.js';
import { ContentRenderer } from '../../utils/renderer.js';
import { shouldShowMobileUI } from '../../utils/breakpoints.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';
import {
    getMediaConsentModalMarkup,
    getPendingExternalMediaDetails,
    isMediaSrcBlocked,
    persistMediaOriginsConsent
} from '../../utils/third-party-media.js';

class ArboritoModalReadme extends HTMLElement {
    constructor() {
        super();
        this.sourceId = null;
        this.readmeContent = null;
        this.loading = true;
        this._introQuizStates = {};
        /** User declined media consent for this intro view; placeholders + retry until accepted */
        this._mediaDeclinedReadme = false;
    }

    connectedCallback() {
        this.renderSkeleton();
        this.loadContent();
    }

    /** Footer and loading text live outside #readme-body; refresh when UI strings update. */
    syncReadmeChromeStrings() {
        const ui = store.ui;
        const loadingEl = this.querySelector('#readme-loading-text');
        if (loadingEl) loadingEl.textContent = ui.readmeLoadingIntro || 'Loading introduction…';

        const btnStart = this.querySelector('#btn-start');
        if (btnStart) {
            btnStart.innerHTML = `<span aria-hidden="true">🚀</span> ${ui.readmeStartExploring || 'Start exploring'}`;
        }
        const btnRepo = this.querySelector('#btn-view-repo');
        if (btnRepo) {
            btnRepo.innerHTML = `<span aria-hidden="true">🐙</span> ${ui.readmeViewSource || 'View author / source'}`;
        }
        const skipSpan = this.querySelector('#readme-dont-show-label');
        if (skipSpan) skipSpan.textContent = ui.readmeDontShowAgain || "Don't show again";
    }

    close(skipFuture = false) {
        if (skipFuture && this.sourceId) {
            localStorage.setItem(`arborito-skip-readme-${this.sourceId}`, 'true');
        }
        store.dismissModal();
    }

    getRepoUrl() {
        const sourceUrl = store.value.activeSource?.url;
        if (!sourceUrl || !sourceUrl.startsWith('http')) return null;

        try {
            if (sourceUrl.includes('raw.githubusercontent.com')) {
                const parts = new URL(sourceUrl).pathname.split('/');
                if (parts.length >= 3) {
                    return `https://github.com/${parts[1]}/${parts[2]}`;
                }
            } else if (sourceUrl.includes('github.io')) {
                const url = new URL(sourceUrl);
                const owner = url.hostname.split('.')[0];
                const repo = url.pathname.split('/')[1];
                if (owner && repo) {
                    return `https://github.com/${owner}/${repo}`;
                }
            }
        } catch (e) {
            console.warn("Could not parse repo URL", e);
            return null;
        }
        return null;
    }

    async loadContent() {
        const rootNode = store.value.data;
        const activeSource = store.value.activeSource;
        const rawData = store.value.rawGraphData;
        
        if (!activeSource || !rootNode) return;

        // Base ID for preferences (strip version)
        this.sourceId = activeSource.id.split('-')[0];

        // 1. PRIORITY: Embedded Intro (Standard V3.7+) — string or per-language map
        if (rawData && rawData.readme) {
            const r = rawData.readme;
            const lang = (store.value.lang || 'EN').toUpperCase();
            const langLower = lang.toLowerCase();
            if (typeof r === 'string') {
                this.readmeContent = r;
            } else if (r && typeof r === 'object') {
                this.readmeContent =
                    r[lang] ||
                    r[langLower] ||
                    r.EN ||
                    r.en ||
                    r.ES ||
                    r.es ||
                    Object.values(r).find((v) => typeof v === 'string') ||
                    '';
            } else {
                this.readmeContent = '';
            }
            if (this.readmeContent) {
                this.loading = false;
                this.renderContent();
                return;
            }
        }

        // 2. FALLBACK: Sibling File Fetch (Dev / Legacy) — language-specific names first
        if (activeSource.url && activeSource.url.startsWith('http')) {
            try {
                const baseFolder = activeSource.url.substring(0, activeSource.url.lastIndexOf('/') + 1);
                const fileName = activeSource.url.split('/').pop() || '';
                const stem = fileName.replace(/\.json$/i, '');
                const subFolder = stem && stem !== 'data' ? `${stem}/` : '';
                const lang = (store.value.lang || 'EN').toUpperCase();
                const langLower = lang.toLowerCase();

                const buildBases = () => {
                    const out = [baseFolder];
                    if (subFolder) {
                        try {
                            out.push(new URL(subFolder, baseFolder).href);
                        } catch {
                            /* keep base only */
                        }
                    }
                    return out;
                };

                const langFirst = [
                    `INTRO_${lang}.md`,
                    `intro_${lang}.md`,
                    `INTRO.${langLower}.md`,
                    `intro.${langLower}.md`,
                    `${langLower}/INTRO.md`,
                    `${langLower}/intro.md`
                ];
                const generic = ['INTRO.md', 'README.md', 'intro.md', 'readme.md'];
                const candidates = [...langFirst, ...generic];

                for (const folder of buildBases()) {
                    for (const filename of candidates) {
                        const url = new URL(filename, folder).href;
                        const res = await fetch(`${url}?t=${Date.now()}`);
                        if (res.ok) {
                            const text = await res.text();
                            this.readmeContent = text.replace(/^---\n[\s\S]*?\n---\n/, '');
                            this.loading = false;
                            this.renderContent();
                            return;
                        }
                    }
                }
            } catch (e) {
                // Ignore network errors, fall to description
            }
        }

        // 3. FINAL FALLBACK: Node Description
        this.readmeContent = rootNode.description || store.ui.readmeFallbackWelcome || 'Welcome to Arborito.';
        this.loading = false;
        this.renderContent();
    }

    renderSkeleton() {
        const rootNode = store.value.data;
        const activeSource = store.value.activeSource;
        
        if (!activeSource || !rootNode) {
            this.close();
            return;
        }

        const title = activeSource.name;
        const icon = rootNode.icon || "🌳";
        const repoUrl = this.getRepoUrl();
        const mobile = shouldShowMobileUI();
        const ui = store.ui;
        const loadIntro = ui.readmeLoadingIntro || 'Loading introduction…';
        const startLbl = ui.readmeStartExploring || 'Start exploring';
        const viewSrc = ui.readmeViewSource || 'View author / source';
        const skipLbl = ui.readmeDontShowAgain || "Don't show again";
        const topbarCls = mobile
            ? 'readme-intro-topbar arborito-float-modal-head flex px-2 pt-1 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900 items-center gap-2'
            : 'readme-intro-topbar arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2 flex items-center gap-2';
        const backExtra = mobile
            ? 'arborito-mmenu-back arborito-about-inline-back shrink-0 self-center border-r border-slate-100 dark:border-slate-800 pr-2 mr-1 -ml-1'
            : 'arborito-mmenu-back shrink-0';
        const backdropCls = mobile
            ? 'arborito-readme-intro-full fixed inset-0 z-[80] flex flex-col p-0 m-0 bg-slate-950 h-[100dvh] min-h-[100dvh] animate-in fade-in duration-500'
            : 'fixed inset-0 z-[80] flex items-center justify-center bg-slate-950 p-4 animate-in fade-in duration-500 arborito-modal-root';
        const panelCls = mobile
            ? 'readme-panel readme-panel--mobile bg-white dark:bg-slate-900 w-full flex-1 min-h-0 h-full relative overflow-hidden flex flex-col border-0 shadow-none rounded-none cursor-auto'
            : 'readme-panel arborito-float-modal-card arborito-float-modal-card--readme bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl w-full relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto transition-all duration-300';
        const panelStyle = mobile ? '' : '';

        this.innerHTML = `
        <div id="readme-backdrop" class="${backdropCls}">
            <div class="${panelCls}" style="${panelStyle}">
                <div class="${topbarCls}">
                    ${modalNavBackHtml(ui, backExtra, { tagClass: 'btn-readme-back' })}
                    <span class="text-2xl shrink-0 leading-none" aria-hidden="true">${icon}</span>
                    <h2 id="readme-intro-title" class="${mobile ? 'flex-1 min-w-0 m-0 text-lg font-black tracking-tight text-slate-800 dark:text-white truncate' : 'arborito-mmenu-subtitle m-0 flex-1 min-w-0 truncate'}">${title}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-readme-back')}
                </div>

                <div id="readme-body" class="${mobile ? 'px-5 py-4' : 'px-8 pb-8 pt-2'} flex-1 overflow-y-auto custom-scrollbar min-h-0">
                    <div class="flex flex-col items-center justify-center min-h-[8rem] space-y-4 py-8">
                        <div class="w-8 h-8 border-4 border-slate-200 dark:border-slate-600 border-t-blue-500 rounded-full animate-spin"></div>
                        <p id="readme-loading-text" class="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">${loadIntro}</p>
                    </div>
                </div>

                <div class="${mobile ? 'p-4' : 'px-8 py-6'} border-t border-slate-100 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-900/80" style="padding-bottom: max(${mobile ? '1rem' : '1.5rem'}, env(safe-area-inset-bottom, 0px));">
                    <button type="button" id="btn-start" class="w-full py-4 rounded-xl font-bold text-base shadow-md flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white">
                        <span aria-hidden="true">🚀</span> ${startLbl}
                    </button>
                    
                    ${repoUrl ? `
                        <button type="button" id="btn-view-repo" class="mt-3 w-full py-3 bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors border border-slate-300 dark:border-slate-700">
                            <span aria-hidden="true">🐙</span> ${viewSrc}
                        </button>
                    ` : ''}

                    <div class="mt-4 flex justify-center">
                        <label class="flex items-center gap-2 cursor-pointer text-sm text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100 transition-colors select-none">
                            <input type="checkbox" id="chk-skip" class="w-4 h-4 rounded border-slate-400 dark:border-slate-500 cursor-pointer">
                            <span id="readme-dont-show-label">${skipLbl}</span>
                        </label>
                    </div>
                </div>
            </div>
        </div>`;

        this.querySelector('#btn-start').onclick = () => {
            const skip = this.querySelector('#chk-skip').checked;
            this.close(skip);
        };
        
        this.querySelectorAll('.btn-readme-back').forEach(b => b.onclick = () => this.close(false));
        
        this.querySelector('#readme-backdrop').onclick = (e) => {
            if (e.target === e.currentTarget) this.close(false);
        };
        
        const repoBtn = this.querySelector('#btn-view-repo');
        if (repoBtn && repoUrl) {
            repoBtn.onclick = () => window.open(repoUrl, '_blank', 'noopener,noreferrer');
        }
    }

    renderContent() {
        const bodyEl = this.querySelector('#readme-body');
        if (!bodyEl) return;

        const ui = store.ui;
        const getQuizState = (id) =>
            this._introQuizStates[id] || {
                started: false,
                finished: false,
                currentIdx: 0,
                score: 0,
                results: []
            };
        const blocks = parseContent(this.readmeContent || '');
        const pendingMediaDetails = getPendingExternalMediaDetails(blocks);
        const showMediaConsentModal = pendingMediaDetails.length > 0 && !this._mediaDeclinedReadme;

        const htmlContent = blocks
            .map((b) =>
                ContentRenderer.renderBlock(b, ui, {
                    getQuizState,
                    isCompleted: () => false,
                    isExam: false,
                    isMediaSrcBlocked
                })
            )
            .join('');

        bodyEl.innerHTML = `
            <div class="readme-markdown prose prose-slate dark:prose-invert mx-auto w-full max-w-3xl text-left select-text">
                ${htmlContent}
            </div>
        `;

        const backdrop = this.querySelector('#readme-backdrop');
        backdrop?.querySelector('#arborito-media-consent-root')?.remove();
        if (showMediaConsentModal && backdrop) {
            backdrop.insertAdjacentHTML('beforeend', getMediaConsentModalMarkup(ui, pendingMediaDetails));
            const btnAccept = this.querySelector('#btn-media-consent-accept');
            const chkRemember = this.querySelector('#chk-media-consent-remember');
            const btnDecline = this.querySelector('#btn-media-consent-decline');
            if (btnAccept) {
                btnAccept.onclick = () => {
                    const remember = !!(chkRemember && chkRemember.checked);
                    const rootEl = this.querySelector('#arborito-media-consent-root');
                    let origins = [];
                    const raw = rootEl?.dataset?.pendingOrigins;
                    if (raw) {
                        try {
                            origins = JSON.parse(decodeURIComponent(raw));
                        } catch {
                            origins = [];
                        }
                    }
                    persistMediaOriginsConsent(origins, remember);
                    this.renderContent();
                };
            }
            if (btnDecline) {
                btnDecline.onclick = () => {
                    this._mediaDeclinedReadme = true;
                    this.renderContent();
                };
            }
        }

        bodyEl.querySelectorAll('.arborito-media-consent-retry').forEach((btn) => {
            btn.onclick = () => {
                this._mediaDeclinedReadme = false;
                this.renderContent();
            };
        });

        this.syncReadmeChromeStrings();
    }
}

customElements.define('arborito-modal-readme', ArboritoModalReadme);
