import { store } from '../../store.js';
import { aiService } from '../../services/ai.js';
import { shouldShowMobileUI } from '../../utils/breakpoints.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';
import { SAGE_OPEN, sageHideDismissButton, ArboritoSageUICore } from './sage-ui-core.js';
import { escHtml } from '../graph/graph-mobile.js';
export class ArboritoSageUIChat extends ArboritoSageUICore {
    renderSettings() {
        const ui = store.ui;
        const mob = shouldShowMobileUI();
        const hideDismiss = sageHideDismissButton();
        const deskBackdrop = mob ? 'bg-slate-100 dark:bg-slate-950' : 'arborito-sage-desk-scrim';
        this.className = `${SAGE_OPEN} fixed ${mob ? 'z-[160] arborito-sage-mob-frame' : 'inset-0 z-[160]'} flex pointer-events-none ${mob ? 'flex-col items-stretch p-0' : 'items-center justify-center p-4'} ${deskBackdrop}`;

        const isBrowserActive = aiService.config.provider === 'browser';
        const progress = store.value.ai.progress || '';
        let browserPullPct = 0;
        const browserPullMatch = progress.match(/(\d+)%/);
        if (browserPullMatch) browserPullPct = Math.min(100, parseInt(browserPullMatch[1], 10));

        const activeBadge = `<span class="text-[10px] font-black bg-green-200 text-green-800 dark:bg-green-900/50 dark:text-green-300 px-2 py-1 rounded">${ui.sageBadgeActive}</span>`;
        const browserModelSuggestions = [
            // GGUF models — wllama compatible
            'bartowski/SmolLM2-135M-Instruct-GGUF:SmolLM2-135M-Instruct-Q4_K_M.gguf',
            'bartowski/SmolLM2-360M-Instruct-GGUF:SmolLM2-360M-Instruct-Q4_K_M.gguf',
            'bartowski/Llama-3.2-1B-Instruct-GGUF:Llama-3.2-1B-Instruct-Q4_K_M.gguf'
        ];
        const settingsBody = `
                <div class="p-6 space-y-6 ${mob ? 'pb-[max(1.5rem,env(safe-area-inset-bottom))]' : ''}">
                    <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed m-0">${ui.sageGamesAiSettingsNote || ui.sageConfigDesc || ''}</p>
                    <div class="bg-green-50 dark:bg-green-900/10 p-4 rounded-xl border border-green-100 dark:border-green-800/30">
                        <div class="flex items-center justify-between mb-2"><div class="flex items-center gap-2"><span class="text-2xl">🧠</span><p class="text-sm font-bold text-green-700 dark:text-green-400">${ui.sageSettingsBrowserTitle}</p></div>${isBrowserActive ? activeBadge : ''}</div>
                        <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">${ui.sageSettingsBrowserDesc}</p>
                        <label class="text-[10px] font-bold text-slate-400 uppercase mb-2 block">${ui.sageSettingsHfModelLabel}</label>
                        <input id="inp-browser-model" list="sage-browser-model-suggestions" type="text" class="w-full text-xs p-2 border rounded mb-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100" value="${aiService.config.browserModel}">
                        <datalist id="sage-browser-model-suggestions">
                            ${browserModelSuggestions.map((m) => `<option value="${m}"></option>`).join('')}
                        </datalist>
                        <p class="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed mb-4">${ui.sageBrowserModelHint}</p>
                        <p class="text-[10px] text-amber-600 dark:text-amber-400 leading-relaxed mb-4">${ui.sageBrowserModelPublicHint || 'Models starting with "onnx-community/" work without login. Models like "Qwen/..." require HuggingFace authentication.'}</p>

                        <div class="grid grid-cols-2 gap-3 mb-4">
                            <div>
                                <label class="text-[10px] font-bold text-slate-400 uppercase mb-2 block">${ui.sageContextPresetLabel || 'Context preset'}</label>
                                <select id="sel-context-preset" class="w-full text-xs p-2 border rounded bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100">
                                    <option value="micro" ${aiService.config.contextPreset === 'micro' ? 'selected' : ''}>${ui.sageContextPresetMicro || 'Micro (dumb model)'}</option>
                                    <option value="minimal" ${aiService.config.contextPreset === 'minimal' ? 'selected' : ''}>${ui.sageContextPresetMinimal || 'Minimal'}</option>
                                    <option value="balanced" ${aiService.config.contextPreset === 'balanced' ? 'selected' : ''}>${ui.sageContextPresetBalanced || 'Balanced'}</option>
                                </select>
                                <p class="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed mt-1">${ui.sageContextPresetHint || 'Controls how much history/evidence is sent to the model.'}</p>
                            </div>
                            <div>
                                <label class="text-[10px] font-bold text-slate-400 uppercase mb-2 block">${ui.sageMaxNewTokensLabel || 'Max new tokens'}</label>
                                <input id="inp-browser-max-tokens" type="number" min="64" max="1024" step="32" class="w-full text-xs p-2 border rounded bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100" value="${aiService.config.browserMaxNewTokens || 384}">
                                <p class="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed mt-1">${ui.sageMaxNewTokensHint || 'Lower = faster and cheaper, but shorter answers.'}</p>
                            </div>
                        </div>

                        ${progress && isBrowserActive ? `<div class="mb-4"><p class="text-[10px] font-bold text-green-600 dark:text-green-400 mb-1">${progress}</p><div class="w-full bg-green-200 dark:bg-green-900/40 rounded-full h-1.5 overflow-hidden"><div class="bg-green-600 dark:bg-green-500 h-full min-w-0 transition-[width] duration-300 ease-out" style="width:${browserPullPct}%"></div></div></div>` : ''}
                        <button type="button" id="btn-use-browser" class="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg text-xs shadow transition-colors transition-transform active:scale-[0.98]">${ui.sageSettingsActivateBrowser}</button>
                    </div>
                </div>`;

        this.innerHTML = mob ? `
            <div class="pointer-events-auto flex flex-col h-full max-h-full min-h-0 w-full max-w-[100vw] overflow-hidden animate-in fade-in duration-200">
                <div class="arborito-modal-dock-panel flex flex-col flex-1 min-h-0 h-full overflow-hidden">
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2">
                    ${hideDismiss ? '' : modalNavBackHtml(ui, 'arborito-mmenu-back w-11 h-11 shrink-0', { tagClass: 'btn-close' })}
                    <span class="text-2xl shrink-0" aria-hidden="true">⚙️</span>
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${ui.sageConfigTitle}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>
                <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar">${settingsBody}</div>
                </div>
            </div>
        ` : `
            <div class="pointer-events-auto arborito-sage-settings-shell bg-white dark:bg-slate-900 rounded-3xl shadow-2xl relative overflow-hidden flex flex-col animate-in zoom-in duration-200 border border-slate-200 dark:border-slate-800">
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2 items-center gap-2">
                    <span class="text-2xl shrink-0" aria-hidden="true">⚙️</span>
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${ui.sageConfigTitle}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>
                <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar">${settingsBody}</div>
            </div>
        `;
        this.querySelectorAll('.btn-close').forEach((b) => {
            b.onclick = () => this.close();
        });
        this.querySelector('#btn-use-browser').onclick = () => this.saveConfig();
    }

    runQuickAction(action) {
        const ui = store.ui;
        const node = store.value.selectedNode || store.value.previewNode;
        const title = node?.name || '';
        let msg = '';
        if (action === 'summarize') {
            msg = (ui.sageQuickSummarize || 'Summarize this lesson: {title}').replace('{title}', title);
        } else if (action === 'explain') {
            msg = (ui.sageQuickExplain || 'Explain this topic clearly: {title}').replace('{title}', title);
        } else if (action === 'quiz') {
            msg = ui.sageQuickQuiz || 'Ask me a practice question from this lesson.';
        }
        if (!msg) return;
        store.update({ ai: { ...store.value.ai, contextMode: 'sage-tree' } });
        store.chatWithSage(msg);
    }

    renderChat() {
        const ui = store.ui;
        const chatArea = this.querySelector('#sage-chat-area');
        
        const aiState = store.value.ai;
        
        const displayMessages = aiState.messages.length > 0 ? aiState.messages : [{ 
            role: 'assistant', 
            content: ui.sageDynamicHello || ui.sageHello 
        }];
        
        const displayStatus = aiState.status;
        const isStableHorde = aiService.config.provider === 'stablehorde';
        const isBrowser = aiService.config.provider === 'browser';
        const isThinking = displayStatus === 'thinking' || displayStatus === 'loading';
        const isStreaming = displayStatus === 'streaming';
        
        let sendBtnColor = isBrowser ? 'bg-purple-600' : 'bg-slate-500';
        let btnIcon = `<svg class="w-5 h-5 translate-x-0.5 -translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>`;
        let btnClass = `w-11 h-11 ${sendBtnColor} text-white rounded-xl hover:opacity-90 transition-all flex items-center justify-center shadow-lg active:scale-95`;

        if (isThinking) {
            btnClass = "w-11 h-11 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-all flex items-center justify-center shadow-lg active:scale-95 animate-pulse";
            btnIcon = `<div class="w-4 h-4 bg-white rounded-sm"></div>`; 
        } else if (isStreaming) {
            btnClass = "w-11 h-11 bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-all flex items-center justify-center shadow-lg active:scale-95";
            btnIcon = `<div class="flex gap-0.5"><div class="w-1.5 h-1.5 bg-white rounded-full animate-bounce"></div><div class="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style="animation-delay:0.1s"></div></div>`; 
        }

        const getMessagesHTML = () => {
             return displayMessages.map(m => {
                let displayContent = m.content;
                // Manejar cursor de streaming
                let hasCursor = false;
                let contentForFormat = displayContent;
                if (isStreaming && m.role === 'assistant' && displayContent.endsWith('▌')) {
                    hasCursor = true;
                    contentForFormat = displayContent.slice(0, -1);
                }
                let contentHtml = this.formatMessage(contentForFormat);
                if (hasCursor) {
                    contentHtml += '<span class="inline-block w-2 h-4 bg-current ml-0.5 animate-pulse"></span>';
                }
                return `
                <div class="flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 fade-in duration-300">
                    <div class="max-w-[85%] relative group text-left">
                        <div class="p-3 rounded-2xl text-sm leading-relaxed shadow-sm select-text ${m.role === 'user' ? (sendBtnColor + ' text-white rounded-br-none') : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-bl-none'}">
                            ${contentHtml}
                        </div>
                    </div>
                </div>
             `;
             }).join('') + (isThinking ? 
                `<div class="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div class="bg-white dark:bg-slate-800 p-4 rounded-2xl rounded-bl-none border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-3">
                        <div class="flex gap-1.5">
                            <div class="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></div>
                            <div class="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style="animation-delay:0.15s"></div>
                            <div class="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style="animation-delay:0.3s"></div>
                        </div>
                        <span class="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">${escHtml(ui.sageThinking)}</span>
                    </div>
                </div>` : '');
        };

        if (chatArea) {
            chatArea.innerHTML = getMessagesHTML();
            chatArea.scrollTop = chatArea.scrollHeight;
            this.bindMessageEvents(chatArea);
            
            const btnSubmit = this.querySelector('button[type="submit"]');
            if(btnSubmit) {
                btnSubmit.className = btnClass;
                btnSubmit.innerHTML = btnIcon;
            }
            const inp = this.querySelector('#sage-input');
            if(inp) {
                const isBusy = isThinking || isStreaming;
                inp.disabled = isBusy;
                inp.style.opacity = isBusy ? '0.5' : '1';
                inp.style.cursor = isBusy ? 'not-allowed' : 'text';
                if(!isBusy) inp.focus();
            }
            return;
        }

        const mob = shouldShowMobileUI();
        const hideDismiss = sageHideDismissButton();
        this.className = mob
            ? `${SAGE_OPEN} fixed z-[160] arborito-sage-mob-frame flex flex-col items-stretch pointer-events-none bg-slate-100 dark:bg-slate-950`
            : `${SAGE_OPEN} fixed inset-x-0 bottom-0 z-[160] flex flex-col items-end md:bottom-6 md:right-6 md:w-auto pointer-events-none`;

        let providerName = isBrowser
            ? ui.sageProviderInBrowserCpu
            : isStableHorde
              ? ui.sageProviderStableHorde
              : ui.sageProviderNotConfigured;
        const sageTitleText = ui.sageTitle;
        const sageHeaderMob = `
                <div class="shrink-0 z-10 bg-white/90 dark:bg-slate-900/95 border-b border-slate-200/80 dark:border-slate-700/80">
                    <div class="arborito-sheet__hero arborito-sheet__hero--mmenu-sub arborito-dock-modal-hero shrink-0 flex items-center gap-2">
                        ${hideDismiss ? '' : modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0', { tagClass: 'btn-close' })}
                        <span class="text-2xl shrink-0 leading-none relative inline-flex" aria-hidden="true">🦉</span>
                        <div class="min-w-0 flex-1">
                            <h2 class="arborito-mmenu-subtitle m-0 leading-tight">${sageTitleText}</h2>
                            <p class="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1 truncate"><span class="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" aria-hidden="true"></span>${ui.sageExperimentalBadge || providerName}</p>
                        </div>
                        ${this._sageModeToggleHtml(ui)}
                        ${hideDismiss ? '' : modalWindowCloseXHtml(ui, 'btn-close')}
                    </div>
                    <div class="flex items-center justify-end gap-1.5 px-4 pb-2.5 pt-1">
                        <button type="button" id="btn-clear" class="arborito-mmenu-back w-10 h-10 !rounded-xl" title="${ui.sageClearChat}">🗑️</button>
                        <button type="button" id="btn-settings" class="arborito-mmenu-back w-10 h-10 !rounded-xl" title="${ui.sageSettings}">⚙️</button>
                    </div>
                </div>`;
        const sageHeaderDesk = `
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2 z-10 flex flex-wrap items-center gap-2">
                    <span class="text-2xl shrink-0 leading-none" aria-hidden="true">🦉</span>
                    <div class="min-w-0 flex-1 basis-[min(100%,12rem)]">
                        <h2 class="arborito-mmenu-subtitle m-0 leading-tight">${sageTitleText}</h2>
                        <p class="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1 truncate"><span class="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" aria-hidden="true"></span>${ui.sageExperimentalBadge || providerName}</p>
                    </div>
                    ${this._sageModeToggleHtml(ui)}
                    <div class="flex items-center gap-1 shrink-0 ml-auto">
                        <button type="button" id="btn-clear" class="arborito-mmenu-back w-10 h-10 !rounded-xl" title="${ui.sageClearChat}">🗑️</button>
                        <button type="button" id="btn-settings" class="arborito-mmenu-back w-10 h-10 !rounded-xl" title="${ui.sageSettings}">⚙️</button>
                        ${hideDismiss ? '' : modalWindowCloseXHtml(ui, 'btn-close')}
                    </div>
                </div>`;

        const sageChatBody = `
                ${mob ? sageHeaderMob : sageHeaderDesk}
                <p class="text-[9px] text-amber-700/90 dark:text-amber-300/90 px-3 py-1.5 m-0 border-t border-amber-100 dark:border-amber-900/30 bg-amber-50/80 dark:bg-amber-950/20 leading-snug">${escHtml(ui.sageExperimentalChatNote || "")}</p>
                <div id="sage-chat-area" class="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 ${mob ? 'bg-slate-50/90 dark:bg-slate-950' : 'bg-slate-50 dark:bg-slate-950/30'} custom-scrollbar scroll-smooth">
                     ${getMessagesHTML()}
                </div>
                
                ${!isStableHorde && !isBrowser ? `<div class="px-4 py-1 text-center bg-white/90 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0"><p class="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-widest">${ui.sageAiNotConfigured}</p></div>` : ''}

                <div class="px-3 py-2 flex gap-2 overflow-x-auto custom-scrollbar bg-white/95 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0"><button class="btn-qa whitespace-nowrap px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded-lg text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors border border-blue-100 dark:border-blue-800" data-action="summarize">📝 ${ui.sageBtnSummarize}</button><button class="btn-qa whitespace-nowrap px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded-lg text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors border border-blue-100 dark:border-blue-800" data-action="explain">🎓 ${ui.sageBtnExplain}</button><button class="btn-qa whitespace-nowrap px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded-lg text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors border border-blue-100 dark:border-blue-800" data-action="quiz">❓ ${ui.sageBtnQuiz}</button></div>

                <form id="sage-form" class="p-3 bg-white/95 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex gap-2 shrink-0 ${mob ? 'pb-[calc(0.75rem+env(safe-area-inset-bottom,20px))]' : 'pb-3'}">
                    <input id="sage-input" type="text" class="flex-1 bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-purple-500 placeholder:text-slate-500 dark:placeholder:text-slate-400 disabled:opacity-50" placeholder="${ui.sageInputPlaceholder}" autocomplete="off" ${(isThinking || isStreaming) ? 'disabled style="cursor:not-allowed; opacity:0.5"' : ''}>
                    <button type="submit" class="${btnClass}">${btnIcon}</button>
                </form>
`;

        this.innerHTML = mob
            ? `
            <div class="pointer-events-auto arborito-sage-chat-shell-mob flex flex-col h-full min-h-0 w-full overflow-hidden animate-in slide-in-from-bottom-10 fade-in">
                <div class="arborito-modal-dock-panel flex flex-col flex-1 min-h-0 h-full max-h-full overflow-hidden">
                    ${sageChatBody}
                </div>
            </div>
        `
            : `
            <div class="pointer-events-auto arborito-sage-chat-shell flex flex-col animate-in slide-in-from-bottom-10 fade-in overflow-hidden">
                ${sageChatBody}
            </div>
        `;

        this.querySelectorAll('.btn-close').forEach((b) => {
            b.onclick = () => this.close();
        });
        this.querySelector('#btn-settings').onclick = () => { this.mode = 'settings'; this.render(); };
        this.querySelector('#btn-clear').onclick = () => store.clearSageChat();

        const form = this.querySelector('#sage-form');
        form.onsubmit = (e) => {
             e.preventDefault();
             if (isThinking || isStreaming) { store.abortSage(); return; }
             const inp = this.querySelector('#sage-input');
             if (inp.value.trim()) {
                 store.update({ ai: { ...store.value.ai, contextMode: 'sage-tree' } });
                 store.chatWithSage(inp.value.trim());
                 inp.value = '';
             }
        };

        this.querySelectorAll('.btn-qa').forEach(btn => {
            btn.onclick = () => this.runQuickAction(btn.dataset.action);
        });

        const area = this.querySelector('#sage-chat-area');
        if(area) {
            area.scrollTop = area.scrollHeight;
            this.bindMessageEvents(area);
        }
        this._wireSageModeToggle();
    }
    
    bindMessageEvents(container) {
        container.querySelectorAll('.btn-sage-privacy').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                const cur = store.value.modal;
                const fromMobileMore = !!(cur && typeof cur === 'object' && cur.fromMobileMore);
                store.setModal(fromMobileMore ? { type: 'privacy', fromMobileMore: true } : 'privacy');
            }
        });
    }

    formatMessage(text) {
        let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
        formatted = formatted.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" class="text-blue-500 hover:underline inline-flex items-center gap-1 font-bold"><svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>$1</a>');
        return formatted;
    }
}
