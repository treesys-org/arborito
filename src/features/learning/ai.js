
import { store } from "../../core/store.js";
import {
    resolveAiContextPreset,
    buildTreeBreadcrumb,
} from './ai-context.js';
import { collectTreeRagEvidence } from './sage-tree-rag.js';
import {
    isDesktopLlamacppBridgePresent,
    getLlamacppStatus,
    loadLlamacppModel,
    llamacppChat,
    writeLlamacppSettings
} from './ai-llamacpp-bridge.js';

// Use a dedicated worker file instead of an inline blob to avoid CSP issues.
const WORKER_URL = new URL('./ai-worker.js', import.meta.url).href;

// Default model for BOTH providers (browser/wllama and desktop/llama.cpp).
// Llama-3.2-1B-Instruct GGUF: small, capable, no auth required.
export const DEFAULT_BROWSER_MODEL =
    'bartowski/Llama-3.2-1B-Instruct-GGUF:Llama-3.2-1B-Instruct-Q4_K_M.gguf';
const DEFAULT_BROWSER_MAX_NEW_TOKENS = 2048;
const DEFAULT_CONTEXT_PRESET = 'minimal';

function resolveBrowserModel() {
    return localStorage.getItem('arborito_browser_model') || DEFAULT_BROWSER_MODEL;
}

function resolveBrowserMaxNewTokens() {
    const raw = localStorage.getItem('arborito_browser_max_new_tokens');
    const n = raw != null ? Number(raw) : NaN;
    if (!Number.isFinite(n)) return DEFAULT_BROWSER_MAX_NEW_TOKENS;
    const clipped = Math.max(64, Math.min(1024, Math.round(n)));
    return clipped;
}

function resolveContextPreset() {
    return resolveAiContextPreset(localStorage.getItem('arborito_ai_context_preset') || DEFAULT_CONTEXT_PRESET);
}

function lastUserContentAsSent(messages) {
    const u = [...messages].reverse().find((m) => m && m.role === 'user' && typeof m.content === 'string');
    return u ? String(u.content) : '';
}

/**
 * Provider model:
 *   - 'llamacpp' — Electron desktop build: native llama.cpp via `node-llama-cpp`.
 *   - 'browser'  — anywhere else: wllama (WebAssembly llama.cpp port) in a Web Worker.
 *
 * The provider is determined by the environment, not by user choice: if the Electron
 * preload bridge is present we use the native engine, otherwise we use wllama.
 */
function resolveAiProvider() {
    const stored = localStorage.getItem('arborito_ai_provider');
    if (stored === 'llamacpp' || stored === 'browser') return stored;
    return isDesktopLlamacppBridgePresent() ? 'llamacpp' : 'browser';
}

// Per-preset character budgets for the lesson / tree context block that gets
// injected into the system prompt. Smaller presets help low-VRAM browser
// builds avoid OOM; larger ones give the model more material to ground on.
const CONTEXT_PRESET_BUDGETS = {
    micro:    { lesson: 1200, tree: 1800 },
    minimal:  { lesson: 2400, tree: 3200 },
    balanced: { lesson: 4000, tree: 5000 },
};

function clipText(text, maxChars) {
    const s = String(text || '');
    if (!Number.isFinite(maxChars) || maxChars <= 0 || s.length <= maxChars) return s;
    return s.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…';
}

class HybridAIService {
    constructor() {
        this.onProgress = null;
        this.config = {
            provider: resolveAiProvider(),
            browserModel: resolveBrowserModel(),
            browserMaxNewTokens: resolveBrowserMaxNewTokens(),
            contextPreset: resolveContextPreset(),
        };
        this.currentController = null;

        // Browser (wllama) worker state
        this.worker = null;
        this.workerReady = false;
        this.workerInitializing = false;
        this.workerPromise = null;

        // Desktop (llama.cpp) state
        this.llamacppReady = false;
        this.llamacppInitializing = false;
        this.llamacppPromise = null;
    }

    setCallback(cb) {
        this.onProgress = cb;
    }

    setConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };

        if (newConfig.provider === 'llamacpp' || newConfig.provider === 'browser') {
            try { localStorage.setItem('arborito_ai_provider', newConfig.provider); } catch (_) {}
            this.config.provider = newConfig.provider;
        }
        if (newConfig.browserModel) {
            try { localStorage.setItem('arborito_browser_model', newConfig.browserModel); } catch (_) {}
        }
        if (newConfig.browserMaxNewTokens != null) {
            const n = Number(newConfig.browserMaxNewTokens);
            if (Number.isFinite(n)) {
                try {
                    localStorage.setItem(
                        'arborito_browser_max_new_tokens',
                        String(Math.max(64, Math.min(1024, Math.round(n))))
                    );
                } catch (_) {}
                this.config.browserMaxNewTokens = resolveBrowserMaxNewTokens();
            }
        }
        if (newConfig.contextPreset) {
            const p = resolveAiContextPreset(newConfig.contextPreset);
            try { localStorage.setItem('arborito_ai_context_preset', p); } catch (_) {}
            this.config.contextPreset = p;
        }

        // Reset the active provider so the next call re-initializes with the new config.
        this.workerReady = false;
        this.llamacppReady = false;

        if (this.config.provider === 'browser') {
            setTimeout(() => this.initWorker(), 50);
        } else if (this.config.provider === 'llamacpp') {
            setTimeout(() => this.initLlamacpp(), 50);
        }
    }

    /**
     * Reset Sage settings to factory defaults: clears local preferences (model, tokens,
     * preset, provider) and lets the environment pick the provider on next init.
     * Does not clear chat messages, privacy consent, or downloaded model files.
     */
    resetConfig() {
        try {
            localStorage.removeItem('arborito_browser_model');
            localStorage.removeItem('arborito_browser_max_new_tokens');
            localStorage.removeItem('arborito_ai_context_preset');
            localStorage.removeItem('arborito_ai_provider');
        } catch (_) { /* sandbox / private mode */ }

        this.config = {
            provider: isDesktopLlamacppBridgePresent() ? 'llamacpp' : 'browser',
            browserModel: DEFAULT_BROWSER_MODEL,
            browserMaxNewTokens: DEFAULT_BROWSER_MAX_NEW_TOKENS,
            contextPreset: DEFAULT_CONTEXT_PRESET,
        };
    }

    async initialize() {
        if (this.config.provider === 'llamacpp') {
            const status = await getLlamacppStatus();
            if (!status || !status.available) {
                // Native engine unavailable on this host: degrade to the WebAssembly path.
                this.config.provider = 'browser';
                try { localStorage.setItem('arborito_ai_provider', 'browser'); } catch (_) {}
            }
        }
        if (this.config.provider === 'browser') {
            return new Promise((resolve, reject) => {
                setTimeout(async () => {
                    try { await this.initWorker(); resolve(true); }
                    catch (e) { reject(e); }
                }, 100);
            });
        }
        if (this.config.provider === 'llamacpp') {
            return new Promise((resolve, reject) => {
                setTimeout(async () => {
                    try { await this.initLlamacpp(); resolve(true); }
                    catch (e) { reject(e); }
                }, 100);
            });
        }
        return true;
    }

    // --- WORKER MANAGEMENT (browser / wllama) ---

    _resetBrowserWorkerAfterError() {
        this.workerInitializing = false;
        this.workerReady = false;
        this.workerPromise = null;
        if (this.worker) {
            try { this.worker.terminate(); } catch { /* ignore */ }
            this.worker = null;
        }
    }

    async initWorker() {
        if (this.workerReady) return Promise.resolve();
        if (this.workerPromise) return this.workerPromise;

        this.workerInitializing = true;

        this.workerPromise = new Promise((resolve, reject) => {
            if (!this.worker) {
                try {
                    this.worker = new Worker(WORKER_URL, { type: 'module' });

                    this.worker.addEventListener('message', (e) => {
                        const data = e.data;
                        if (!data || typeof data !== 'object') return;
                        const { status, message, progress } = data;

                        if (status === 'progress') {
                            if (this.onProgress) {
                                const ui = store.ui;
                                const msg = typeof message === 'string' ? message : '';
                                const phase = data.phase;
                                const pr = typeof progress === 'number' && !Number.isNaN(progress) ? progress : null;
                                let line = '';
                                if (phase === 'download' && pr != null) {
                                    const whole = Math.min(99, Math.max(0, Math.round(pr * 100)));
                                    line =
                                        whole < 1
                                            ? ui.sageLoadingProgressStarting || '…'
                                            : `${ui.sageStatusDownload || '…'} ${whole}%`;
                                } else if (phase === 'prepare' && pr != null) {
                                    const whole = Math.min(100, Math.max(0, Math.round(pr * 100)));
                                    line = `${ui.sageProgressPreparingModel || '…'} ${whole}%`;
                                } else {
                                    const msgHasPct = /\d+\s*%/.test(msg);
                                    if (msgHasPct) line = msg;
                                    else if (pr != null && pr >= 0 && pr <= 1) {
                                        const whole = Math.round(pr * 100);
                                        line = msg ? `${msg} (${whole}%)` : `${whole}%`;
                                    } else line = msg || ui.sageLoadingProgressStarting || '…';
                                }
                                this.onProgress({ text: line });
                            }
                        } else if (status === 'ready') {
                            this.workerReady = true;
                            this.workerInitializing = false;
                            if (this.onProgress) {
                                this.onProgress({ text: store.ui.sageProgressNeuralReady || '…' });
                            }
                            resolve();
                        } else if (status === 'error') {
                            const errText = typeof message === 'string' ? message : String(message || 'AI worker error');
                            console.error('Worker Error:', errText);
                            this._resetBrowserWorkerAfterError();
                            if (this.onProgress) this.onProgress({ text: `Error: ${errText}` });
                            reject(new Error(errText));
                        }
                    });

                    this.worker.addEventListener('error', (e) => {
                        console.error('Worker Global Error:', e);
                        console.error('Worker error details:', e.message, e.filename, e.lineno);
                        if (this.onProgress) this.onProgress({ text: `Worker Failed: ${e.message || 'CSP/Security'}` });
                        this._resetBrowserWorkerAfterError();
                        reject(new Error(`Worker Failed to Start: ${e.message || 'Unknown error'}`));
                    });

                    this.worker.addEventListener('messageerror', (e) => {
                        console.error("Worker Message Error:", e);
                    });

                } catch (e) {
                    console.error("Failed to create worker:", e);
                    if (this.onProgress) this.onProgress({ text: "Failed to start AI Worker. Check console." });
                    this.workerInitializing = false;
                    this.workerPromise = null;
                    reject(e);
                    return;
                }
            }

            if (this.onProgress) {
                this.onProgress({ text: store.ui.sageProgressWorkerInit || '…' });
            }

            this.worker.postMessage({
                type: 'init',
                data: { model: this.config.browserModel }
            });
        });

        return this.workerPromise;
    }

    // --- DESKTOP (native llama.cpp) MANAGEMENT ---

    async initLlamacpp() {
        if (this.llamacppReady) return;
        if (this.llamacppPromise) return this.llamacppPromise;

        this.llamacppInitializing = true;
        this.llamacppPromise = (async () => {
            try {
                // Persist last-used config to the JSON file alongside the model files.
                writeLlamacppSettings({
                    model: this.config.browserModel,
                    maxNewTokens: this.config.browserMaxNewTokens,
                    contextPreset: this.config.contextPreset,
                    updatedAt: Date.now()
                }).catch(() => {});

                await loadLlamacppModel(
                    this.config.browserModel,
                    { contextSize: 4096 },
                    (data) => {
                        if (!this.onProgress) return;
                        const ui = store.ui;
                        const phase = data && data.phase;
                        const pr = typeof data?.progress === 'number' ? data.progress : null;
                        let line = '';
                        if (phase === 'download' && pr != null) {
                            const whole = Math.min(99, Math.max(0, Math.round(pr * 100)));
                            line = whole < 1
                                ? (ui.sageLoadingProgressStarting || '…')
                                : `${ui.sageStatusDownload || '…'} ${whole}%`;
                        } else if (phase === 'prepare' && pr != null) {
                            const whole = Math.min(100, Math.max(0, Math.round(pr * 100)));
                            line = `${ui.sageProgressPreparingModel || '…'} ${whole}%`;
                        } else if (phase === 'ready') {
                            line = ui.sageProgressNeuralReady || 'Ready';
                        } else {
                            line = (data && data.message) || ui.sageLoadingProgressStarting || '…';
                        }
                        this.onProgress({ text: line });
                    }
                );
                this.llamacppReady = true;
                this.llamacppInitializing = false;
                if (this.onProgress) this.onProgress({ text: store.ui.sageProgressNeuralReady || 'Ready' });
            } catch (e) {
                this.llamacppInitializing = false;
                this.llamacppPromise = null;
                if (this.onProgress) this.onProgress({ text: `Error: ${e && e.message ? e.message : e}` });
                throw e;
            }
        })();
        return this.llamacppPromise;
    }

    async checkHealth() {
        if (this.config.provider === 'llamacpp') {
            const status = await getLlamacppStatus();
            if (!status || !status.available) {
                this.setConfig({ provider: 'browser' });
            }
        }
        if (this.config.provider === 'browser') {
            if (!this.worker) {
                try { await this.initWorker(); }
                catch (_) { return false; }
            }
            return true;
        }
        if (this.config.provider === 'llamacpp') {
            if (!this.llamacppReady) {
                try { await this.initLlamacpp(); }
                catch (_) { return false; }
            }
            return true;
        }
        return false;
    }

    abort() {
        if (this.currentController) {
            this.currentController.abort();
            this.currentController = null;
        }
    }

    async chat(messages, contextNode = null, onStream = null) {
        this.abort();

        try {
            const lang = store.value.lang || 'EN';

            const cleanMessages = messages.map(m => {
                if (m.role === 'assistant' && typeof m.content === 'string') {
                    return { ...m, content: m.content.split('<br><br>')[0].trim() };
                }
                return m;
            });

            const lastMsgObj = cleanMessages[cleanMessages.length - 1] || { content: '' };
            const lastMsg = typeof lastMsgObj.content === 'string' ? lastMsgObj.content : '';
            const mode = (store.value.ai && store.value.ai.contextMode) || 'normal';

            if (lastMsg.startsWith('LOCAL_ACTION:')) {
                return { text: "Command executed.", rawText: "Command executed." };
            }

            const prompts = {
                EN: {
                    sage: "You are the Sage Owl of Arborito Academy. You are a helpful and precise tutor. Use the provided CONTEXT to answer the user's question. If the answer is not in the context, you may use your general knowledge, but admit if you are unsure. Do not make up facts.",
                    guardrails: "If asked for dangerous real-world advice, refuse.",
                    context: "CONTEXT:",
                    architect: "ROLE: Architect.\nTASK: Generate JSON curriculum."
                },
                ES: {
                    sage: "Eres el Búho Sabio de la Academia Arborito. Eres un tutor útil y preciso. Usa el CONTEXTO proporcionado para responder. Si la respuesta no está en el contexto, usa tu conocimiento general, pero admite si no estás seguro. No inventes hechos.",
                    guardrails: "Si piden consejos peligrosos, rechaza.",
                    context: "CONTEXTO:",
                    architect: "ROL: Arquitecto.\nTAREA: Generar JSON curricular."
                }
            };

            const currentPrompts = prompts[lang] || prompts['EN'];
            const stripThinking = (txt) => {
                let t = String(txt != null ? txt : '');
                if (!t) return t;
                t = t.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                t = t.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '').trim();
                t = t.replace(/^(thought|reasoning|chain of thought)\s*:\s*[\s\S]*?\n(?=\S)/i, '').trim();
                t = t.replace(/^\s+/, '').trim();
                return t;
            };

            // ------- Build the context block injected into the system prompt -------
            // The model itself decides what to do with the user message: there is no
            // regex-based intent router, no keyword summarizer, no canned answers.
            // We only feed it: (1) the role/persona, (2) the relevant lesson/tree
            // text (clipped to the preset's character budget) and (3) the chat
            // history. Anything else is the LLM's job.
            const preset = this.config.contextPreset || DEFAULT_CONTEXT_PRESET;
            const budgets = CONTEXT_PRESET_BUDGETS[preset] || CONTEXT_PRESET_BUDGETS.minimal;

            let contextBlock = '';
            if (mode === 'sage-tree' && store.value.rawGraphData) {
                const rag = collectTreeRagEvidence(store.value.rawGraphData, lang, {
                    focusNodeId: contextNode?.id || null,
                });
                const treeText = rag && rag.text ? String(rag.text) : '';
                if (treeText) contextBlock = clipText(treeText, budgets.tree);
            }
            if (!contextBlock && contextNode && contextNode.content) {
                const breadcrumb = buildTreeBreadcrumb(store, contextNode, { maxChars: 240 });
                const header = breadcrumb ? `[${breadcrumb}]\n` : '';
                contextBlock = clipText(header + String(contextNode.content), budgets.lesson);
            }

            let systemContext;
            if (mode === 'architect') {
                systemContext = currentPrompts.architect;
            } else if (mode === 'sage-tree') {
                systemContext = lang === 'ES'
                    ? `${currentPrompts.sage} Puedes citar la lección o el tema del árbol cuando sea útil.`
                    : `${currentPrompts.sage} You may reference the lesson or tree topic when helpful.`;
            } else {
                systemContext = currentPrompts.sage;
            }
            systemContext = `${systemContext}\n\n${currentPrompts.guardrails}`;
            if (contextBlock) {
                systemContext = `${systemContext}\n\n${currentPrompts.context}\n${contextBlock}`;
            }

            // -------- Provider-agnostic generation --------
            // Both wllama (browser) and llama.cpp (desktop) consume the same
            // `messages + systemPrompt + maxTokens` shape; only the transport differs.
            const provider = this.config.provider;
            const maxTokens = this.config.browserMaxNewTokens;

            const cleanModelOutput = (raw, echoUser) => {
                let t = String(raw || '')
                    .replace(/^User Question:.*$/im, '')
                    .replace(/^Answer:/i, '')
                    .replace(/^Response:/i, '')
                    .replace(/<end_of_turn>/g, '')
                    .replace(/<\|eot_id\|>/g, '')
                    .replace(/<\|im_end\|>/g, '')
                    .trim();
                const helloLine = (store && store.ui) ? store.ui.sageHello : '';
                if (helloLine && t.startsWith(helloLine)) t = t.slice(helloLine.length).trim();
                if (echoUser && t.startsWith(echoUser)) t = t.slice(echoUser.length).trim();
                return t;
            };

            let generateOnce;
            if (provider === 'llamacpp') {
                if (!this.llamacppReady) await this.initLlamacpp();
                generateOnce = async (msgs, onToken = null) => {
                    const echoUser = lastUserContentAsSent(msgs);
                    let accumulated = '';
                    const bridgeOnToken = onToken
                        ? (delta) => {
                            accumulated += String(delta || '');
                            try { onToken(accumulated); } catch (_) {}
                          }
                        : null;
                    const { text } = await llamacppChat({
                        messages: msgs,
                        systemPrompt: systemContext,
                        maxTokens,
                        temperature: 0.2,
                    }, bridgeOnToken);
                    return cleanModelOutput(text, echoUser);
                };
            } else {
                if (!this.workerReady) await this.initWorker();
                generateOnce = (msgs, onToken = null) => {
                    return new Promise((resolve, reject) => {
                        const echoUser = lastUserContentAsSent(msgs);
                        const handler = (e) => {
                            if (!e.data || typeof e.data !== 'object') return;
                            const { status, text, message, partial } = e.data;
                            if (status === 'token' && partial && onToken) {
                                onToken(text);
                                return;
                            }
                            if (status === 'complete') {
                                this.worker.removeEventListener('message', handler);
                                resolve(cleanModelOutput(text, echoUser));
                            }
                            if (status === 'error') {
                                this.worker.removeEventListener('message', handler);
                                reject(new Error(message));
                            }
                        };
                        this.worker.addEventListener('message', handler);
                        this.worker.postMessage({
                            type: 'generate',
                            data: {
                                messages: msgs,
                                config: {
                                    systemPrompt: systemContext,
                                    contextStr: '',
                                    maxNewTokens: maxTokens,
                                    microMode: preset === 'micro',
                                },
                            },
                        });
                    });
                };
            }

            const _badgeUi = store.ui;
            const providerLabel = provider === 'llamacpp'
                ? (_badgeUi.sageProviderDesktopNative || 'Native (desktop)')
                : (_badgeUi.sageProviderInBrowserCpu || 'In-browser (WebAssembly)');
            const providerBadgeColor = provider === 'llamacpp'
                ? 'text-emerald-600 dark:text-emerald-400 opacity-80'
                : 'text-green-600 dark:text-green-400 opacity-75';
            const providerBadge = `<span class='text-[10px] ${providerBadgeColor} font-bold'>⚡ ${this.config.browserModel} · ${providerLabel}</span>`;

            // Architect mode keeps a tight window — JSON generation does not need a long history.
            const msgsForModel = mode === 'architect'
                ? cleanMessages.slice(Math.max(0, cleanMessages.length - 6))
                : cleanMessages;

            const result = stripThinking(await generateOnce(msgsForModel, onStream || null));
            return { text: result + `<br><br>${providerBadge}`, rawText: result };

        } catch (e) {
            console.error("Sage Chat Error:", e);

            let msg = "An unexpected error occurred.";
            let hint = "";

            if (e instanceof Error) {
                msg = e.message;
            } else if (typeof e === 'string') {
                msg = e;
            } else if (typeof e === 'object') {
                if (e.message) msg = e.message;
                else if (e.statusText) msg = `Network Error: ${e.status || ''} ${e.statusText}`;
                else if (e.status) msg = `Network Error: Status ${e.status}`;
                else {
                    try {
                        const json = JSON.stringify(e);
                        if (json !== '{}') msg = json;
                        else msg = "Connection Error (Empty Response)";
                    } catch (_) {
                        msg = "Critical Connection Error";
                    }
                }
            }

            if (msg.includes('[object XMLHttpRequest]') || msg.includes('[object Object]')) {
                msg = "Network Error: Could not connect to AI service.";
            }

            if (msg.includes('Failed to fetch') || msg.includes('Cross-Origin') || msg.includes('NetworkError')) {
                if (this.config.provider === 'browser' || this.config.provider === 'llamacpp') {
                    hint = "<br><br><b>Hint:</b> Could not download the model. Check your internet connection.";
                }
            }

            if (msg.includes('401') || msg.includes('403')) {
                hint = "<br><br><b>🚨 ACCESS DENIED</b><br>The model you selected is gated (requires a license).<br>Please switch to a public GGUF on Hugging Face (for example <b>bartowski/Llama-3.2-1B-Instruct-GGUF</b> with a <b>.gguf</b> file name) in Settings.";
            }

            return { text: `🦉 <span class="text-red-500 font-bold">ERROR:</span> ${msg}${hint}`, rawText: "Error" };
        }
    }
}

export const aiService = new HybridAIService();
