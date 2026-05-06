
import { store } from '../../store.js';
import { aiService } from '../../services/ai.js';
import { storageManager } from '../../stores/storage-manager.js';
import { shouldShowMobileUI, clearArboritoGameImmersiveOpen } from '../../utils/breakpoints.js';
import { modalWindowCloseXHtml } from '../../utils/dock-sheet-chrome.js';
import { buildGameSdkInjection } from '../../utils/inject-game-sdk.js';
import { formatUserHandle } from '../../utils/user-handle.js';

class ArboritoModalGamePlayer extends HTMLElement {
    constructor() {
        super();
        this.cursorIndex = 0;
        this.activeNodeId = null;
        this.playlist = []; 
        this.isPreparing = true;
        this.needsConsent = false;
        this.checkingAI = false;
        this.aiError = null;
        this.error = null;
        this.scriptCache = new Map();
        
        // Tracking for notification
        this.sessionXP = 0;
        this.aiBrowserLoading = false;
        this._aiProgressListener = null;
        this._lastAiProgressRendered = '';
        this._aiProgressRaf = null;
        /** When true, download UI DOM is mounted — update bar/text only (no full innerHTML). */
        this._gameAiDownloadUiReady = false;
    }

    connectedCallback() {
        void this.initializeSession();
    }

    async initializeSession() {
        this.sessionXP = 0;
        this.aiError = null;
        this.error = null;

        const hasConsent = localStorage.getItem('arborito-ai-consent') === 'true';
        const isBrowser = aiService.config.provider === 'browser';

        if (isBrowser && !hasConsent) {
            this.needsConsent = true;
            this.render();
            return;
        }

        this.needsConsent = false;
        this.checkingAI = true;
        this.render();

        const isHealthy = await aiService.checkHealth();
        this.checkingAI = false;

        if (!isHealthy) {
            const provider = aiService.config.provider;
            const ui = store.ui;
            this.aiError =
                provider === 'ollama' ? ui.gameAiErrorOllama : ui.gameAiErrorBrowser;
            this.render();
            return;
        }

        this.render();
        try {
            await this.prepareCurriculum();
            this.setupBridge();
            this.isPreparing = false;
            this.render();
            this.loadGame();
        } catch (e) {
            console.error('Failed to prepare game context', e);
            this.error = e.message;
            this.isPreparing = false;
            this.render();
        }
    }

    disconnectedCallback() {
        this._detachAiProgressListener();
        this._clearGameImmersiveChrome();
        delete window.__ARBORITO_GAME_BRIDGE__;
        this.scriptCache.forEach((url) => URL.revokeObjectURL(url));
        this.scriptCache.clear();
    }

    _immersiveBackdropClassList(layout) {
        const mob = shouldShowMobileUI();
        const root = mob
            ? 'arborito-modal-root arborito-modal--immersive arborito-modal--mobile'
            : 'arborito-modal-root arborito-modal--immersive';
        if (layout === 'center') {
            return `${root} arborito-modal-immersive--center arborito-game-immersive-scrim fixed inset-0 z-[80] flex flex-col animate-in fade-in h-full w-full min-h-0 items-center justify-center p-2 sm:p-4`;
        }
        return `${root} fixed inset-0 z-[80] bg-black flex flex-col animate-in fade-in h-full w-full min-h-0`;
    }

    _syncGameImmersiveChrome() {
        if (typeof document === 'undefined') return;
        document.documentElement.classList.toggle('arborito-game-immersive-open', shouldShowMobileUI());
    }

    _clearGameImmersiveChrome() {
        clearArboritoGameImmersiveOpen();
    }

    close() {
        // Notification Logic
        if (this.sessionXP > 0) {
            const ui = store.ui;
            store.notify(`+${this.sessionXP} ${ui.xpUnit} — ${ui.gameSessionComplete}`);
        }
        store.setModal('arcade'); 
    }
    
    grantConsent() {
        void this.afterGrantConsent();
    }

    _attachAiProgressListener() {
        if (this._aiProgressListener) return;
        this._lastAiProgressRendered = '';
        this._aiProgressListener = () => {
            if (!this.aiBrowserLoading) return;
            const p = ((store.value.ai && store.value.ai.progress) != null ? store.value.ai.progress : '');
            if (p === this._lastAiProgressRendered) return;
            this._lastAiProgressRendered = p;
            if (this._gameAiDownloadUiReady) {
                if (this._aiProgressRaf != null) return;
                this._aiProgressRaf = requestAnimationFrame(() => {
                    this._aiProgressRaf = null;
                    if (!this.aiBrowserLoading) return;
                    this._patchGameAiDownloadProgress();
                });
                return;
            }
            if (this._aiProgressRaf != null) return;
            this._aiProgressRaf = requestAnimationFrame(() => {
                this._aiProgressRaf = null;
                if (this.aiBrowserLoading) this.render();
            });
        };
        store.addEventListener('state-change', this._aiProgressListener);
    }

    _detachAiProgressListener() {
        if (this._aiProgressRaf != null) {
            cancelAnimationFrame(this._aiProgressRaf);
            this._aiProgressRaf = null;
        }
        this._lastAiProgressRendered = '';
        this._gameAiDownloadUiReady = false;
        if (this._aiProgressListener) {
            store.removeEventListener('state-change', this._aiProgressListener);
            this._aiProgressListener = null;
        }
    }

    _patchGameAiDownloadProgress() {
        const ai = store.value.ai || {};
        const progressRaw = ai.progress || '';
        const m = String(progressRaw).match(/(\d+)%/);
        const pct = m ? Math.min(100, parseInt(m[1], 10)) : 0;
        const bar = this.querySelector('.js-game-ai-progress-bar');
        const txt = this.querySelector('.js-game-ai-progress-text');
        if (bar) bar.style.width = `${pct}%`;
        if (txt) txt.textContent = progressRaw || '…';
    }

    async afterGrantConsent() {
        localStorage.setItem('arborito-ai-consent', 'true');
        this.needsConsent = false;
        if (aiService.config.provider === 'browser') {
            this.aiBrowserLoading = true;
            this.render();
            this._attachAiProgressListener();
            try {
                await store.initSage();
            } catch (e) {
                console.error(e);
                const ui = store.ui;
                this.aiError =
                    (e && e.message) ||
                    (typeof e === 'string' ? e : ui.gameAiErrorInitFailed) ||
                    ui.gameAiErrorInitFailed;
            }
            this._detachAiProgressListener();
            this.aiBrowserLoading = false;
            if (this.aiError) {
                this.render();
                return;
            }
        }
        await this.initializeSession();
    }

    retryConnection() {
        void this.initializeSession();
    }

    async prepareCurriculum() {
        const { moduleId } = store.value.modal || {};
        if (!moduleId) throw new Error("No context module selected.");
        
        this.activeNodeId = moduleId;
        const rootNode = store.findNode(moduleId);
        
        if (!rootNode) throw new Error("Could not find the selected module in memory.");

        this.playlist = [];
        const collectLeaves = async (node) => {
            if (node.type === 'leaf') {
                this.playlist.push(node);
                return;
            }
            if (node.type === 'exam') return;

            if (node.type === 'branch' || node.type === 'root') {
                if (node.hasUnloadedChildren) await store.loadNodeChildren(node);
                if (node.children) {
                    for (const child of node.children) await collectLeaves(child);
                }
            }
        };

        await collectLeaves(rootNode);
        this.cursorIndex = 0;
        if (this.playlist.length === 0) {
            throw new Error("This module contains no playable lessons. Please select a different module.");
        }

        // Optional topic filtering: the host may pass topics=<id1,id2,...> in the game URL.
        // This does NOT change the injected SDK surface; it only affects lesson.next()/list() content.
        try {
            const { url } = store.value.modal || {};
            if (url) {
                const u = new URL(url, window.location.href);
                const topicsRaw = u.searchParams.get('topics') || '';
                const ids = topicsRaw
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                if (ids.length > 0) {
                    const set = new Set(ids.map(String));
                    const filtered = this.playlist.filter((n) => set.has(String(n.id)));
                    if (filtered.length > 0) {
                        this.playlist = filtered;
                        this.cursorIndex = 0;
                    }
                }
            }
        } catch {
            /* ignore */
        }
    }

    async fetchLessonContent(node) {
        if (!node) return null;
        if (
            !node.content &&
            (node.contentPath ||
                (node.treeLazyContent && node.treeContentKey))
        ) {
            await store.loadNodeContent(node);
        }
        const raw = node.content || "";
        // If this node is a "game item" lesson (only used as an optional curriculum item),
        // don't feed it into cartridges via lesson.next()/at().
        // Heuristic: content contains @game: tag and no meaningful non-tag body.
        const rawHead = raw.slice(0, 12000);
        const hasGameTag = /^\s*@game:\s*/m.test(rawHead);
        if (hasGameTag) {
            // Remove common metadata/tag lines, then check if anything substantial remains.
            const stripped = rawHead
                .replace(/^\s*@\w+.*$/gm, '')
                .replace(/^\s*#+\s+.*$/gm, '')
                .replace(/\s+/g, ' ')
                .trim();
            if (!stripped) {
                return null;
            }
        }
        const clean = raw.replace(/<[^>]*>?/gm, '').replace(/@\w+:.*?\n/g, '').replace(/\s+/g, ' ').trim(); 
        return { id: node.id, title: node.name, text: clean, raw: raw };
    }
    
    setupBridge() {
        const gameId = store.value.modal.url;
        let storageId = "unknown_game";
        try {
            const urlObj = new URL(gameId);
            const pathParts = urlObj.pathname.split('/');
            if (pathParts.length >= 2) {
                storageId = pathParts[pathParts.length - 2];
            }
        } catch(e) { storageId = gameId; }

        window.__ARBORITO_GAME_BRIDGE__ = {
            addXP: (amount) => {
                this.sessionXP += amount;
                store.addXP(amount, true); // Silent update
            },
            getCurriculum: () => this.playlist.map(l => ({ id: l.id, title: l.name })),
            
            getNextLesson: async () => {
                if (this.playlist.length === 0) return null;
                // Skip over optional "@game:" lesson-items (not real lessons).
                const max = this.playlist.length;
                for (let attempt = 0; attempt < max; attempt++) {
                    if (this.cursorIndex >= this.playlist.length) this.cursorIndex = 0;
                    const node = this.playlist[this.cursorIndex++];
                    const res = await this.fetchLessonContent(node);
                    if (res) return res;
                }
                return null;
            },
            
            getLessonAt: async (index) => {
                if (index < 0 || index >= this.playlist.length) return null;
                return await this.fetchLessonContent(this.playlist[index]);
            },

            aiChat: async (promptMessages, contextNode) => {
                try {
                    // Calls Parent AI Service (which lazy loads if needed)
                    return await aiService.chat(promptMessages, contextNode);
                } catch(e) {
                    console.error("AI Bridge Error:", e);
                    throw e;
                }
            },
            
            save: (key, value) => {
                try {
                    return storageManager.saveGameData(storageId, key, value);
                } catch(e) {
                    console.error("Game Save Failed:", e);
                    store.notify(
                        '⚠️ ' + store.ui.gameStorageFullWarn
                    );
                    return false;
                }
            },
            load: (key) => storageManager.loadGameData(storageId, key),
            
            getDue: () => store.userStore.getDueNodes(),
            reportMemory: (nodeId, quality) => store.userStore.reportMemory(nodeId, quality),
            
            reportError: (msg) => {
                console.error("Game Crash Reported:", msg);
                this.error = msg;
                this.render();
            },
            
            close: () => this.close()
        };
    }
    
    async resolveScript(url) {
        if (this.scriptCache.has(url)) return this.scriptCache.get(url);

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch script: ${url}`);
        let scriptContent = await response.text();

        const importRegex = /(import\s+.*?\s+from\s+)(['"])(.+?)\2/g;
        const promises = [];
        
        const matches = [...scriptContent.matchAll(importRegex)];

        for(const match of matches) {
            const pre = match[1];
            const quote = match[2];
            const path = match[3];

            if (path.startsWith('./') || path.startsWith('../')) {
                const nestedUrl = new URL(path, url).href;
                promises.push(
                    this.resolveScript(nestedUrl).then(blobUrl => {
                        scriptContent = scriptContent.replace(match[0], `${pre}${quote}${blobUrl}${quote}`);
                    })
                );
            }
        }
        
        await Promise.all(promises);

        const blob = new Blob([scriptContent], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        this.scriptCache.set(url, blobUrl);
        return blobUrl;
    }


    async loadGame() {
        const { url } = store.value.modal || {};
        if (!url) return;

        const iframe = this.querySelector('iframe');
        if (!iframe) return;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Could not load game from ${url} (Status: ${response.status})`);
            let html = await response.text();
            const baseHref = url.substring(0, url.lastIndexOf('/') + 1);

            this.scriptCache.clear();

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // INJECT ERROR TRAP
            const errorTrapScript = doc.createElement('script');
            errorTrapScript.textContent = `
                window.onerror = function(msg, url, line, col, error) {
                    if (window.parent && window.parent.__ARBORITO_GAME_BRIDGE__) {
                        window.parent.__ARBORITO_GAME_BRIDGE__.reportError(msg + " (Line " + line + ")");
                    }
                };
                window.onunhandledrejection = function(e) {
                    if (window.parent && window.parent.__ARBORITO_GAME_BRIDGE__) {
                        window.parent.__ARBORITO_GAME_BRIDGE__.reportError(e.reason ? e.reason.message : "Unknown Promise Error");
                    }
                };
            `;
            doc.head.prepend(errorTrapScript);

            const scripts = doc.querySelectorAll('script[type="module"][src]');
            for (const script of scripts) {
                const src = script.getAttribute('src');
                const scriptUrl = new URL(src, baseHref).href;
                const blobUrl = await this.resolveScript(scriptUrl);
                script.setAttribute('src', blobUrl);
            }

            // INJECTED SDK
            let myPubForTag = '';
            try { myPubForTag = ((store.getNetworkUserPair && store.getNetworkUserPair()) ? store.getNetworkUserPair().pub : undefined) || ''; } catch { myPubForTag = ''; }
            const bridgeUser =
                formatUserHandle(store.value.gamification.username, myPubForTag) ||
                store.value.gamification.username ||
                store.ui.gameDefaultStudentName;
            const bridgeAvatar = store.value.gamification.avatar || '👤';
            const bridgeLang = store.value.lang || 'EN';
            const sdkScriptContent = buildGameSdkInjection({
                bridgeUser,
                bridgeAvatar,
                bridgeLang
            });
            
            const sdkScript = doc.createElement('script');
            sdkScript.textContent = sdkScriptContent;
            doc.body.appendChild(sdkScript);

            const assetTags = doc.querySelectorAll('link[href], img[src], audio[src], video[src]');
            assetTags.forEach(tag => {
                const attr = tag.hasAttribute('href') ? 'href' : 'src';
                const path = tag.getAttribute(attr);
                if (path && !path.startsWith('http') && !path.startsWith('data:') && !path.startsWith('blob:')) {
                    const absolutePath = new URL(path, baseHref).href;
                    tag.setAttribute(attr, absolutePath);
                }
            });

            const finalHtml = doc.documentElement.outerHTML;
            iframe.srcdoc = finalHtml;
            iframe.onload = () => {
                const loader = this.querySelector('#loader');
                if(loader) loader.classList.add('hidden');
                iframe.classList.remove('opacity-0');
            };
        } catch (e) {
            this.error = e.message;
            this.isPreparing = false;
            this.render();
        }
    }

    render() {
        const { url, title } = store.value.modal || {};
        const ui = store.ui;
        if (!url) {
            this._clearGameImmersiveChrome();
            this.close();
            return;
        }

        if (!this.aiBrowserLoading) {
            this._gameAiDownloadUiReady = false;
        }

        if (this.aiBrowserLoading) {
            const mob = shouldShowMobileUI();
            const ai = store.value.ai || {};
            const progressRaw = ai.progress || '';
            let pct = 0;
            const m = String(progressRaw).match(/(\d+)%/);
            if (m) pct = Math.min(100, parseInt(m[1], 10));
            const bar = this.querySelector('.js-game-ai-progress-bar');
            const txt = this.querySelector('.js-game-ai-progress-text');
            if (bar && txt && this.querySelector('#modal-backdrop')) {
                bar.style.width = `${pct}%`;
                txt.textContent = progressRaw || '…';
                this._gameAiDownloadUiReady = true;
                this._syncGameImmersiveChrome();
                return;
            }
            this._gameAiDownloadUiReady = true;
            const headbar = mob
                ? `<div class="arborito-game-player-toolbar border-b border-slate-700 bg-slate-900 flex items-center gap-2 shrink-0">
                        <button type="button" id="btn-game-mob-back-dl" class="arborito-mmenu-back shrink-0 w-9 h-9 flex items-center justify-center rounded-xl border border-slate-600 text-slate-200 hover:bg-white/10 text-lg leading-none" aria-label="${ui.navBack}">←</button>
                        <h3 class="font-black text-xs text-slate-100 flex-1 min-w-0 truncate">${ui.sageDownloading || 'Loading…'}</h3>
                    </div>`
                : '';
            this.innerHTML = `
            <div id="modal-backdrop" class="${this._immersiveBackdropClassList('center')}">
                <div class="bg-slate-900 border border-slate-700 ${mob ? 'p-4' : 'p-6'} rounded-2xl shadow-2xl relative w-full max-w-md text-center max-h-[min(92dvh,92svh)] overflow-hidden flex flex-col">
                    ${headbar}
                    <div class="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-green-500 to-emerald-600"></div>
                    <div class="w-14 h-14 bg-slate-800 rounded-full mx-auto flex items-center justify-center text-3xl mb-4 border border-slate-700 shrink-0" aria-hidden="true">🧠</div>
                    <h2 class="text-lg font-black text-white mb-1">${ui.sageDownloadModel || 'Model'}</h2>
                    <p class="js-game-ai-progress-text text-[11px] text-slate-400 mb-4 font-mono break-words px-1 min-h-[2.5rem]">${progressRaw || '…'}</p>
                    <div class="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden border border-slate-700 mb-2">
                        <div class="js-game-ai-progress-bar bg-green-500 h-full min-w-0 transition-[width] duration-200 ease-out" style="width: ${pct}%"></div>
                    </div>
                </div>
            </div>`;
            const bd = this.querySelector('#btn-game-mob-back-dl');
            if (bd) bd.onclick = () => this.close();
            this._syncGameImmersiveChrome();
            return;
        }

        if (this.needsConsent) {
            const mob = shouldShowMobileUI();
            const consentHeadbar = mob
                ? `<div class="arborito-game-player-toolbar border-b border-slate-700 bg-slate-900 flex items-center gap-2 shrink-0">
                        <button type="button" id="btn-game-mob-back-consent" class="arborito-mmenu-back shrink-0 w-9 h-9 flex items-center justify-center rounded-xl border border-slate-600 text-slate-200 hover:bg-white/10 text-lg leading-none" aria-label="${ui.navBack}">←</button>
                        <h3 class="font-black text-xs text-slate-100 flex-1 min-w-0 truncate">${ui.navBack}</h3>
                        ${modalWindowCloseXHtml(ui, 'btn-game-head-x', { tone: 'inverse' })}
                    </div>`
                : '';
            const cardPad = mob ? 'p-4 sm:p-8' : 'p-6 sm:p-8';
            // Updated Consent Screen with Sage keys and Disclaimer
            this.innerHTML = `
            <div id="modal-backdrop" class="${this._immersiveBackdropClassList('center')}">
                <div class="bg-slate-900 border border-slate-700 ${cardPad} rounded-2xl sm:rounded-3xl max-w-md text-center shadow-2xl relative w-full max-h-[min(92dvh,92svh)] overflow-x-hidden overflow-y-auto">
                    ${consentHeadbar}
                    <div class="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-purple-600"></div>
                    
                    <div class="w-20 h-20 bg-slate-800 rounded-full mx-auto flex items-center justify-center text-5xl mb-6 shadow-xl border border-slate-700">
                        🧠
                    </div>
                    
                    <h2 class="text-xl font-black text-white mb-2 uppercase tracking-wide">${ui.gameAiRequiredTitle}</h2>
                    
                    <div class="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 mb-6 text-left">
                        
                        <!-- Privacy Notice -->
                        <div class="bg-blue-900/20 p-3 rounded-lg border border-blue-800/30 mb-3">
                            <p class="text-xs text-blue-200 leading-relaxed font-medium">
                                ${ui.gameConsentAiNotice}
                            </p>
                        </div>

                        <!-- Legal Disclaimer -->
                        <div class="flex items-start gap-2 p-2 bg-yellow-900/10 rounded border border-yellow-800/20">
                            <span class="text-base">⚠️</span>
                            <div class="text-[10px] text-yellow-200/80 leading-snug">
                                <span class="font-bold uppercase">${ui.gameDisclaimerLabel}</span><br>
                                <span>${ui.gameDisclaimer}</span>
                            </div>
                        </div>
                    </div>

                    <div class="flex flex-col gap-3">
                        <button id="btn-grant-consent" class="w-full py-3.5 bg-white text-slate-900 font-black rounded-xl shadow-lg hover:bg-slate-200 active:scale-95 transition-all text-sm uppercase tracking-wider">
                            ${ui.sageGdprAccept}
                        </button>
                        <button id="btn-cancel-consent" class="text-xs text-slate-500 hover:text-slate-300 font-bold uppercase tracking-wider">
                            ${ui.cancel}
                        </button>
                    </div>
                </div>
            </div>`;
            
            this.querySelector('#btn-grant-consent').onclick = () => this.grantConsent();
            this.querySelector('#btn-cancel-consent').onclick = () => this.close();
            const bc = this.querySelector('#btn-game-mob-back-consent');
            if (bc) bc.onclick = () => this.close();
            this.querySelectorAll('.btn-game-head-x').forEach((b) => (b.onclick = () => this.close()));
            this._syncGameImmersiveChrome();
            return;
        }
        
        // --- AI ERROR SCREEN ---
        if (this.aiError) {
            const mobErr = shouldShowMobileUI();
            const errHeadbar = mobErr
                ? `<div class="arborito-game-player-toolbar border-b border-red-900/40 bg-slate-900 flex items-center gap-2 shrink-0">
                        <button type="button" id="btn-game-mob-back-err" class="arborito-mmenu-back shrink-0 w-9 h-9 flex items-center justify-center rounded-xl border border-red-500/40 text-red-200 hover:bg-white/10 text-lg leading-none" aria-label="${ui.navBack}">←</button>
                        <h3 class="font-semibold text-xs text-slate-200 flex-1 min-w-0 truncate">${ui.gameAiErrorTitle}</h3>
                        ${modalWindowCloseXHtml(ui, 'btn-game-head-x', { tone: 'inverse' })}
                    </div>`
                : '';
            const errPad = mobErr ? 'p-4 sm:p-8' : 'p-8';
            this.innerHTML = `
            <div id="modal-backdrop" class="${this._immersiveBackdropClassList('center')}">
                <div class="bg-slate-900 border border-red-500/50 ${errPad} rounded-2xl sm:rounded-3xl max-w-xl text-center shadow-2xl relative max-h-[min(92dvh,92svh)] overflow-x-hidden overflow-y-auto">
                    ${errHeadbar}
                    <div class="absolute top-0 left-0 w-full h-1 bg-red-500"></div>
                    
                    <div class="w-16 h-16 bg-slate-800/80 rounded-full mx-auto flex items-center justify-center text-3xl mb-5 text-slate-400 shadow-inner border border-slate-700/80" aria-hidden="true">
                        ⚠️
                    </div>
                    
                    <h2 class="text-lg font-semibold text-white mb-2 tracking-tight">${ui.gameAiErrorTitle}</h2>
                    <p class="text-sm text-slate-300 mb-4 max-w-sm mx-auto leading-relaxed">${ui.gameAiErrorLead}</p>
                    <p class="text-xs text-slate-500 mb-6 max-w-sm mx-auto leading-relaxed text-left bg-black/25 rounded-lg px-3 py-2 border border-slate-800/80">
                        <span class="text-slate-400 font-medium">${ui.gameAiErrorDetailsLabel}</span>
                        <span class="block mt-1 font-normal">${this.aiError}</span>
                    </p>
                    
                    <div class="flex flex-col gap-3">
                        <button id="btn-retry" class="w-full py-3.5 bg-red-600 text-white font-black rounded-xl shadow-lg hover:bg-red-500 active:scale-95 transition-all text-sm uppercase tracking-wider">
                            ${store.ui.sageRetryConnection}
                        </button>
                        <button id="btn-cancel-error" class="text-xs text-slate-500 hover:text-slate-300 font-bold uppercase tracking-wider">
                            ${ui.cancel}
                        </button>
                    </div>
                </div>
            </div>`;
            
            this.querySelector('#btn-retry').onclick = () => this.retryConnection();
            this.querySelector('#btn-cancel-error').onclick = () => this.close();
            const be = this.querySelector('#btn-game-mob-back-err');
            if (be) be.onclick = () => this.close();
            this.querySelectorAll('.btn-game-head-x').forEach((b) => (b.onclick = () => this.close()));
            this._syncGameImmersiveChrome();
            return;
        }

        let loadingText = ui.gameLoadingCartridge;
        if (this.checkingAI) {
            loadingText = ui.gameEstablishingUplink;
        } else if (this.isPreparing) {
            loadingText = ui.gameReadingTree.replace('{count}', String(this.playlist.length));
        }

        if (this.error) {
            const mobCrash = shouldShowMobileUI();
            const crashHeadbar = mobCrash
                ? `<div class="arborito-game-player-toolbar border-b border-red-900/40 bg-slate-900 flex items-center gap-2 shrink-0">
                        <button type="button" id="btn-game-mob-back-crash" class="arborito-mmenu-back shrink-0 w-9 h-9 flex items-center justify-center rounded-xl border border-red-500/40 text-red-200 hover:bg-white/10 text-lg leading-none" aria-label="${ui.navBack}">←</button>
                        <h3 class="font-semibold text-xs text-slate-200 flex-1 min-w-0 truncate">${ui.gameCrashedTitle}</h3>
                        ${modalWindowCloseXHtml(ui, 'btn-game-head-x', { tone: 'inverse' })}
                    </div>`
                : '';
            const crashPad = mobCrash ? 'p-4 sm:p-8' : 'p-8';
            this.innerHTML = `
            <div id="modal-backdrop" class="${this._immersiveBackdropClassList('center')}">
                <div class="bg-slate-900 border border-red-500/50 ${crashPad} rounded-2xl max-w-md text-center shadow-2xl relative max-h-[min(92dvh,92svh)] overflow-x-hidden overflow-y-auto">
                    ${crashHeadbar}
                    <div class="text-4xl mb-3 opacity-90" aria-hidden="true">🎮</div>
                    <h2 class="text-lg font-semibold text-white mb-2">${ui.gameCrashedTitle}</h2>
                    <p class="text-sm text-slate-300 mb-4 max-w-sm mx-auto leading-relaxed">${ui.gameCrashedLead}</p>
                    <p class="text-xs text-slate-500 font-mono mb-6 bg-black/30 p-3 rounded break-all text-left border border-slate-800/80">
                        <span class="block text-slate-400 font-sans mb-1">${ui.gameCrashDetailsLabel}</span>${this.error}</p>
                    <button type="button" id="btn-game-error-close" class="px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-colors w-full">
                        ${ui.close}
                    </button>
                </div>
            </div>`;
            this.querySelector('#btn-game-error-close').onclick = () => this.close();
            const bcrash = this.querySelector('#btn-game-mob-back-crash');
            if (bcrash) bcrash.onclick = () => this.close();
            this.querySelectorAll('.btn-game-head-x').forEach((b) => (b.onclick = () => this.close()));
            this._syncGameImmersiveChrome();
            return;
        }

        const mobPlay = shouldShowMobileUI();
        const fillBackdropClass = mobPlay
            ? this._immersiveBackdropClassList('fill')
            : 'arborito-modal-root arborito-modal--immersive arborito-game-player--desktop-widescreen fixed inset-0 z-[80] flex flex-col animate-in fade-in h-full w-full min-h-0 bg-slate-950';

        const mobilePlayHeader = `
            <header class="arborito-game-player-toolbar grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1 sm:gap-x-2 px-2 sm:px-4 py-1 sm:py-3 pt-[max(0.2rem,env(safe-area-inset-top))] sm:pt-[max(0.5rem,env(safe-area-inset-top))] bg-slate-900 border-b border-slate-800 text-white shrink-0 shadow-md shadow-black/30">
                <div class="flex items-center gap-1 sm:gap-4 min-w-0 justify-self-start">
                    <button id="btn-back" type="button" class="arborito-game-player-back flex items-center gap-1 sm:gap-2 text-slate-400 hover:text-white hover:bg-white/10 px-1.5 py-0.5 sm:px-3 sm:py-1.5 rounded-lg transition-colors text-xs sm:text-sm font-bold truncate max-w-[40vw] sm:max-w-[42vw]">
                        <span class="shrink-0">←</span> <span class="truncate">${ui.gameBackButton}</span>
                    </button>
                </div>
                <h2 class="arborito-game-player-title justify-self-center text-center font-bold text-[0.7rem] sm:text-sm md:text-base px-1 sm:px-2 truncate min-w-0 max-w-[85vw] sm:max-w-md [text-shadow:0_1px_8px_rgb(0_0_0_/_0.85)]">
                    <span class="arborito-game-player-emoji mr-0.5 sm:mr-2">🎮</span> ${title || ui.gameDefaultTitle}
                </h2>
                <div class="min-w-0" aria-hidden="true"></div>
            </header>`;

        const desktopPlayHeader = `
            <header class="arborito-game-player-desk-head flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5 bg-slate-900 border-b border-slate-800 text-white shrink-0 shadow-md shadow-black/25">
                <h2 class="arborito-game-player-desk-title flex-1 min-w-0 m-0 font-bold text-sm sm:text-base tracking-tight truncate [text-shadow:0_1px_8px_rgb(0_0_0_/_0.85)]">${title || ui.gameDefaultTitle}</h2>
                ${modalWindowCloseXHtml(ui, 'btn-game-desktop-close', { tone: 'inverse' })}
            </header>`;

        this.innerHTML = `
        <div id="modal-backdrop" class="${fillBackdropClass}">
            ${mobPlay ? mobilePlayHeader : desktopPlayHeader}
            <main class="flex-1 min-h-0 min-w-0 relative bg-black overflow-hidden flex flex-col">
                <div id="loader" class="absolute inset-0 flex flex-col items-center justify-center text-slate-600 z-0">
                    <div class="w-10 h-10 border-4 border-slate-800 border-t-purple-600 rounded-full animate-spin mb-4" aria-hidden="true"></div>
                    <p class="text-xs font-mono uppercase tracking-widest text-slate-400">${loadingText}</p>
                </div>
                ${!this.isPreparing && !this.checkingAI ? `
                <iframe class="arborito-game-player-frame relative z-10 w-full flex-1 min-h-0 border-none bg-white opacity-0 transition-opacity duration-500" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; gamepad" 
                    allowfullscreen sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-pointer-lock allow-modals allow-popups-to-escape-sandbox"></iframe>
                ` : ''}
            </main>
        </div>`;

        const back = this.querySelector('#btn-back');
        if (back) back.onclick = () => this.close();
        this.querySelectorAll('.btn-game-desktop-close').forEach((b) => {
            b.onclick = () => this.close();
        });
        this._syncGameImmersiveChrome();
    }
}
customElements.define('arborito-modal-game-player', ArboritoModalGamePlayer);