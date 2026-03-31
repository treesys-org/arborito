
import { store } from "../store.js";
import {
    resolveAiContextPreset,
    extractKeySentences,
    detectQuickAction,
    classifyIntentJS,
    trimHistory
} from './ai-context.js';

const DEFAULT_BROWSER_MODEL = 'onnx-community/Qwen2.5-0.5B-Instruct-ONNX';
const DEFAULT_BROWSER_MAX_NEW_TOKENS = 384;
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

const QWEN_NO_THINK_PREFIX = '/no_think\n';

function browserModelUsesQwenNoThink(model) {
    const m = String(model || '').toLowerCase();
    return m.includes('qwen3');
}

function withQwenNoThinkMessages(messages, browserModel) {
    if (!browserModelUsesQwenNoThink(browserModel) || !Array.isArray(messages)) return messages;
    const out = messages.map((m) => ({ ...m }));
    for (let i = out.length - 1; i >= 0; i--) {
        if (out[i].role === 'user' && typeof out[i].content === 'string') {
            const c = out[i].content;
            if (/^\s*\/no_?think/i.test(c)) break;
            out[i] = { ...out[i], content: QWEN_NO_THINK_PREFIX + c };
            break;
        }
    }
    return out;
}

function lastUserContentAsSent(messages) {
    const u = [...messages].reverse().find((m) => m && m.role === 'user' && typeof m.content === 'string');
    return u ? String(u.content) : '';
}

function normalizeAiProvider(stored) {
    if (stored === 'webllm') {
        localStorage.setItem('arborito_ai_provider', 'browser');
        return 'browser';
    }
    return stored || 'browser';
}

class HybridAIService {
    constructor() {
        this.onProgress = null;
        this.config = {
            provider: normalizeAiProvider(localStorage.getItem('arborito_ai_provider')),
            ollamaModel: localStorage.getItem('arborito_ollama_model') || 'llama3',
            ollamaHost: localStorage.getItem('arborito_ollama_host') || 'http://127.0.0.1:11434',
            browserModel: resolveBrowserModel(),
            browserMaxNewTokens: resolveBrowserMaxNewTokens(),
            contextPreset: resolveContextPreset(),
        };
        this.currentController = null; 
        
        this.worker = null;
        this.workerReady = false;
        this.workerInitializing = false;
        this.workerPromise = null;
    }

    setCallback(cb) {
        this.onProgress = cb;
    }

    setConfig(newConfig) {
        const was = { ...this.config };
        this.config = { ...this.config, ...newConfig };
        
        if (newConfig.provider) {
            const p = newConfig.provider === 'webllm' ? 'browser' : newConfig.provider;
            localStorage.setItem('arborito_ai_provider', p);
            this.config.provider = p;
        }
        if (newConfig.ollamaModel) localStorage.setItem('arborito_ollama_model', newConfig.ollamaModel);
        if (newConfig.ollamaHost) localStorage.setItem('arborito_ollama_host', newConfig.ollamaHost);
        if (newConfig.browserModel) localStorage.setItem('arborito_browser_model', newConfig.browserModel);
        if (newConfig.browserMaxNewTokens != null) {
            const n = Number(newConfig.browserMaxNewTokens);
            if (Number.isFinite(n)) {
                localStorage.setItem('arborito_browser_max_new_tokens', String(Math.max(64, Math.min(1024, Math.round(n)))));
                this.config.browserMaxNewTokens = resolveBrowserMaxNewTokens();
            }
        }
        if (newConfig.contextPreset) {
            const p = resolveAiContextPreset(newConfig.contextPreset);
            localStorage.setItem('arborito_ai_context_preset', p);
            this.config.contextPreset = p;
        }

        delete this.config.webllmModel;

        if (newConfig.provider === 'browser' || newConfig.provider === 'webllm') {
            this.initWorker();
        }
    }

    async initialize() {
        if (this.config.provider === 'browser') {
            await this.initWorker();
        }
        return true;
    }

    // --- WORKER MANAGEMENT ---
    
    async initWorker() {
        if (this.workerReady) return Promise.resolve();
        if (this.workerPromise) return this.workerPromise;
        
        this.workerInitializing = true;

        this.workerPromise = new Promise((resolve, reject) => {
            if (!this.worker) {
                try {
                    this.worker = new Worker(new URL('../workers/ai-worker.js', import.meta.url), { type: 'module' });
                    
                    this.worker.addEventListener('message', (e) => {
                        const { status, message, progress, text } = e.data;
                        
                        if (status === 'progress') {
                            if (this.onProgress) {
                                let p = progress;
                                if (typeof p === 'number' && p > 0 && p <= 1) p = Math.round(p * 100);
                                const pct =
                                    typeof p === 'number' && !Number.isNaN(p) ? `${Math.round(p)}%` : '';
                                const line = pct ? `${message} (${pct})` : `${message}…`;
                                this.onProgress({ text: line });
                            }
                        } else if (status === 'ready') {
                            this.workerReady = true;
                            this.workerInitializing = false;
                            if (this.onProgress) this.onProgress({ text: 'Neural Engine Ready (CPU).' });
                            resolve();
                        } else if (status === 'error') {
                            console.error("Worker Error:", message);
                            this.workerInitializing = false;
                            this.workerPromise = null;
                            if (this.onProgress) this.onProgress({ text: `Error: ${message}` });
                            reject(new Error(message));
                        }
                    });
                    
                    this.worker.addEventListener('error', (e) => {
                        console.error("Worker Global Error:", e);
                        if (this.onProgress) this.onProgress({ text: "Worker Initialization Failed (CSP/Security)" });
                        this.workerInitializing = false;
                        this.workerPromise = null;
                        reject(new Error("Worker Failed to Start"));
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

            if (this.onProgress) this.onProgress({ text: 'Initializing Worker...' });
            
            this.worker.postMessage({ 
                type: 'init', 
                data: { model: this.config.browserModel } 
            });
        });
        
        return this.workerPromise;
    }
    
    async checkHealth() {
        if (this.config.provider === 'ollama') {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000);
                
                const response = await fetch(`${this.config.ollamaHost}/api/tags`, { 
                    method: 'GET',
                    signal: controller.signal 
                });
                
                clearTimeout(timeoutId);
                return response.ok;
            } catch (e) {
                return false;
            }
        } else if (this.config.provider === 'browser') {
            if (!this.worker) {
                try { await this.initWorker(); } catch(e) { return false; }
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

    async listOllamaModels() {
        try {
            const response = await fetch(`${this.config.ollamaHost}/api/tags`);
            if (!response.ok) return null;
            const data = await response.json();
            return data.models || [];
        } catch (e) {
            console.warn("Could not list Ollama models", e);
            return null;
        }
    }

    async deleteOllamaModel(name) {
        try {
            const response = await fetch(`${this.config.ollamaHost}/api/delete`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            return response.ok;
        } catch (e) {
            console.error("Delete failed", e);
            return false;
        }
    }

    async pullOllamaModel(name, progressCallback) {
        try {
            const response = await fetch(`${this.config.ollamaHost}/api/pull`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });

            if (!response.ok) throw new Error(store.ui.aiErrorPull || "Pull failed");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(l => l.trim());
                
                for (const line of lines) {
                    try {
                        const json = JSON.parse(line);
                        if (json.status) {
                            let msg = json.status;
                            if (json.completed && json.total) {
                                const percent = Math.round((json.completed / json.total) * 100);
                                msg += ` (${percent}%)`;
                            }
                            if (progressCallback) progressCallback(msg);
                        }
                    } catch (e) {}
                }
            }
            return true;
        } catch (e) {
            console.error("Pull failed", e);
            if (progressCallback) progressCallback((store.ui.aiErrorPull || "Error: ") + e.message);
            return false;
        }
    }

    retrieveRelevantContext(userQuery, fullContent) {
        if (!fullContent) return "";

        const paragraphs = fullContent.split(/\n\s*\n/);
        const queryTokens = userQuery.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 3);
        
        if (queryTokens.length === 0) return fullContent.substring(0, 2000); 

        const scored = paragraphs.map(p => {
            const lowerP = p.toLowerCase();
            let score = 0;
            queryTokens.forEach(token => {
                if (lowerP.includes(token)) score += 1;
            });
            return { text: p, score };
        });

        scored.sort((a, b) => b.score - a.score);
        
        const contextChunks = [paragraphs[0]]; 
        let currentLength = paragraphs[0].length;
        
        for (const item of scored) {
            if (item.score > 0 && !contextChunks.includes(item.text)) {
                if (currentLength + item.text.length < 3000) {
                    contextChunks.push(item.text);
                    currentLength += item.text.length;
                }
            }
        }

        return contextChunks.join('\n\n---\n\n');
    }

    async chat(messages, contextNode = null) {
        this.abort(); 
        
        try {
            const lang = store.value.lang || 'EN';
            
            const cleanMessages = messages.map(m => {
                if (m.role === 'assistant' && typeof m.content === 'string') {
                    return { ...m, content: m.content.split('<br><br>')[0].trim() };
                }
                return m;
            });

            const lastMsgObj = cleanMessages[cleanMessages.length - 1];
            const lastMsg = lastMsgObj.content;
            const mode = store.value.ai?.contextMode || 'normal';

            if (lastMsg.startsWith('LOCAL_ACTION:')) {
                return { text: "Command executed.", rawText: "Command executed." };
            }

            let systemContext = "";
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
                let t = String(txt ?? '');
                if (!t) return t;
                t = t.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                t = t.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '').trim();
                t = t.replace(/^(thought|reasoning|chain of thought)\s*:\s*[\s\S]*?\n(?=\S)/i, '').trim();
                t = t.replace(/^\s+/, '').trim();
                return t;
            };

            if (mode === 'architect') {
                systemContext = currentPrompts.architect;
            } else {
                systemContext = currentPrompts.sage;
            }

            // --- IN-BROWSER (WORKER) ---
            if (this.config.provider === 'browser') {
                if (!this.workerReady) await this.initWorker();

                const preset = this.config.contextPreset || DEFAULT_CONTEXT_PRESET;
                const isMicro = preset === 'micro';

                const generateOnce = (pack, override = null) => {
                    return new Promise((resolve, reject) => {
                        const msgsForWorker = isMicro
                            ? pack.trimmedMessages
                            : withQwenNoThinkMessages(pack.trimmedMessages, this.config.browserModel);
                        const echoUser = lastUserContentAsSent(msgsForWorker);
                        const handler = (e) => {
                            const { status, text, message } = e.data;
                            if (status === 'complete') {
                                this.worker.removeEventListener('message', handler);
                                const stripEcho = (out, userMsg, assistantHello) => {
                                    let t = String(out || '').trim();
                                    const u = String(userMsg || '').trim();
                                    const h = String(assistantHello || '').trim();
                                    if (!t) return t;
                                    if (h && t.startsWith(h)) t = t.slice(h.length).trim();
                                    if (u && t.startsWith(u)) t = t.slice(u.length).trim();
                                    if (u) {
                                        const idx = t.indexOf(u);
                                        if (idx >= 0 && idx < 120) t = (t.slice(0, idx) + t.slice(idx + u.length)).trim();
                                    }
                                    return t;
                                };
                                let cleanText = text
                                    .replace(/^User Question:.*$/im, '')
                                    .replace(/^Answer:/i, '')
                                    .replace(/^Response:/i, '')
                                    .trim();
                                cleanText = cleanText.replace(/<end_of_turn>/g, '').trim();
                                cleanText = cleanText.replace(/<\|im_end\|>/g, '').trim();
                                cleanText = stripEcho(cleanText, echoUser, store?.ui?.sageHello);
                                resolve(cleanText);
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
                                messages: msgsForWorker,
                                config: {
                                    systemPrompt: override?.systemPrompt ?? systemContext,
                                    contextStr: override?.contextStr ?? pack.contextStr,
                                    maxNewTokens: override?.maxNewTokens ?? this.config.browserMaxNewTokens,
                                    microMode: isMicro
                                }
                            }
                        });
                    });
                };

                // Architect mode: bypass scripted pipeline
                if (mode === 'architect') {
                    const archPack = {
                        trimmedMessages: cleanMessages.slice(Math.max(0, cleanMessages.length - 6)),
                        contextStr: ''
                    };
                    const result = stripThinking(await generateOnce(archPack));
                    const footer = `<br><br><span class='text-[10px] text-green-600 dark:text-green-400 font-bold opacity-75'>⚡ ${this.config.browserModel} (CPU/Worker)</span>`;
                    return { text: result + footer, rawText: result };
                }

                // ==============================================================
                // SCRIPTED INTELLIGENCE – JS reasons, AI just presents/formats
                // ==============================================================

                // 1. Intent classification (pure JS – zero AI calls)
                const intent = classifyIntentJS(lastMsg, contextNode, lang);

                // 2. Quick-action detection (summarize / explain / quiz)
                const quickAction = detectQuickAction(lastMsg, lang);

                // 3. Extract key facts from lesson via JS sentence scoring
                let facts = [];
                const nodeTitle = String(contextNode?.name || '').trim();
                if (intent === 'LESSON' && contextNode?.content) {
                    facts = extractKeySentences(contextNode.content, lastMsg, {
                        maxSentences: isMicro ? 4 : 6,
                        maxChars: isMicro ? 400 : 700
                    });
                }

                // 4. Build ultra-minimal prompt (pre-digested for dumb model)
                let scriptedSystem, scriptedUserMsg;

                if (facts.length > 0) {
                    const factsBlock = facts.map((f, i) => `${i + 1}. ${f}`).join('\n');

                    scriptedSystem = lang === 'ES'
                        ? 'Usa solo los datos para responder. Sé breve. No inventes.'
                        : 'Use only the data to answer. Be brief. Do not make things up.';

                    if (quickAction === 'summarize') {
                        scriptedUserMsg = lang === 'ES'
                            ? `Resume en 3 puntos breves:\n${factsBlock}`
                            : `Summarize in 3 brief points:\n${factsBlock}`;
                    } else if (quickAction === 'explain') {
                        scriptedUserMsg = lang === 'ES'
                            ? `Explica de forma simple y corta:\n${factsBlock}`
                            : `Explain simply and briefly:\n${factsBlock}`;
                    } else if (quickAction === 'quiz') {
                        scriptedUserMsg = lang === 'ES'
                            ? `Escribe 1 pregunta de examen con 4 opciones (marca la correcta) sobre:\n${factsBlock}`
                            : `Write 1 quiz question with 4 options (mark the correct one) about:\n${factsBlock}`;
                    } else {
                        scriptedUserMsg = lang === 'ES'
                            ? `DATOS:\n${factsBlock}\n\nPREGUNTA: ${lastMsg}`
                            : `DATA:\n${factsBlock}\n\nQUESTION: ${lastMsg}`;
                    }
                } else {
                    scriptedSystem = lang === 'ES'
                        ? 'Eres un tutor. Responde breve y útil. No inventes.'
                        : 'You are a tutor. Answer briefly and helpfully. Do not make things up.';
                    scriptedUserMsg = lastMsg;
                }

                // 5. Build minimal message pack (tight history for dumb models)
                const histBudget = isMicro
                    ? { maxTurns: 1, maxChars: 200 }
                    : { maxTurns: 3, maxChars: 600 };
                const prevTurns = trimHistory(cleanMessages.slice(0, -1), histBudget);
                const trimmedMsgs = [...prevTurns, { role: 'user', content: scriptedUserMsg }];

                const pack = { trimmedMessages: trimmedMsgs, contextStr: '' };

                // 6. Single generation – no retry, no classifier AI call
                let final = stripThinking(await generateOnce(pack, {
                    systemPrompt: scriptedSystem,
                    contextStr: '',
                    maxNewTokens: isMicro ? 256 : this.config.browserMaxNewTokens
                }));

                // 7. Offer to use lesson context for general questions
                if (intent === 'GENERAL' && contextNode?.content && final) {
                    const offer = lang === 'ES'
                        ? `Si querés, puedo usar la lección${nodeTitle ? ` ("${nodeTitle}")` : ''} como contexto.`
                        : `I can also use the lesson${nodeTitle ? ` ("${nodeTitle}")` : ''} as context if you want.`;
                    final = final.trim() + '\n\n' + offer;
                }

                // 8. Footer
                const usedLessonCtx = facts.length > 0;
                const ctxBadge = usedLessonCtx
                    ? `<span class='text-[10px] text-blue-700 dark:text-blue-300 font-bold opacity-80'>📚 Lección: contexto activado</span>`
                    : `<span class='text-[10px] text-slate-500 dark:text-slate-400 font-bold opacity-70'>📚 Lección: sin contexto</span>`;
                const footer = `<br><br><span class='text-[10px] text-green-600 dark:text-green-400 font-bold opacity-75'>⚡ ${this.config.browserModel} (CPU/Worker)</span><br>${ctxBadge}`;
                return { text: final + footer, rawText: final };
            }

            // --- OLLAMA (LOCAL) ---
            if (this.config.provider === 'ollama') {
                // Same scripted pre-digestion as browser path
                const ollamaIntent = classifyIntentJS(lastMsg, contextNode, lang);
                const ollamaQA = detectQuickAction(lastMsg, lang);

                let ollamaFacts = [];
                if (ollamaIntent === 'LESSON' && contextNode?.content) {
                    ollamaFacts = extractKeySentences(contextNode.content, lastMsg, {
                        maxSentences: 6, maxChars: 800
                    });
                }

                let ollamaSystem, ollamaUserMsg;
                if (ollamaFacts.length > 0) {
                    const factsBlock = ollamaFacts.map((f, i) => `${i + 1}. ${f}`).join('\n');
                    ollamaSystem = lang === 'ES'
                        ? 'Usa los datos proporcionados para responder. Sé directo y breve. No inventes hechos.'
                        : 'Use the provided data to answer. Be direct and brief. Do not make up facts.';

                    if (ollamaQA === 'summarize') {
                        ollamaUserMsg = (lang === 'ES' ? 'Resume en 3 puntos:\n' : 'Summarize in 3 points:\n') + factsBlock;
                    } else if (ollamaQA === 'explain') {
                        ollamaUserMsg = (lang === 'ES' ? 'Explica de forma simple:\n' : 'Explain simply:\n') + factsBlock;
                    } else if (ollamaQA === 'quiz') {
                        ollamaUserMsg = (lang === 'ES' ? 'Haz una pregunta de examen con 4 opciones sobre:\n' : 'Write a quiz question with 4 options about:\n') + factsBlock;
                    } else {
                        ollamaUserMsg = (lang === 'ES' ? `DATOS:\n${factsBlock}\n\nPREGUNTA: ` : `DATA:\n${factsBlock}\n\nQUESTION: `) + lastMsg;
                    }
                } else {
                    ollamaSystem = mode === 'architect' ? currentPrompts.architect : currentPrompts.sage;
                    ollamaUserMsg = lastMsg;
                }

                const ollamaMessages = [
                    { role: 'system', content: ollamaSystem },
                    ...cleanMessages.slice(Math.max(0, cleanMessages.length - 6), -1),
                    { role: 'user', content: ollamaUserMsg }
                ];

                this.currentController = new AbortController();
                const timeoutId = setTimeout(() => {
                    if (this.currentController) this.currentController.abort();
                }, 300000); 

                const lastMsgLower = lastMsg.toLowerCase();
                const isJsonRequest = lastMsgLower.includes('json') || lastMsgLower.includes('output format');

                const body = {
                    model: this.config.ollamaModel,
                    messages: ollamaMessages,
                    stream: false,
                    options: { num_predict: 2048, temperature: 0.3, repeat_penalty: 1.15 }
                };

                if (isJsonRequest) {
                    body.format = 'json';
                }

                const response = await fetch(`${this.config.ollamaHost}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                    signal: this.currentController.signal
                });
                
                clearTimeout(timeoutId);
                this.currentController = null;

                if (!response.ok) throw new Error(`Ollama responded with Status ${response.status}`);

                const data = await response.json();
                const txt = stripThinking(data.message.content);
                
                const usedLessonContext = ollamaFacts.length > 0;
                const ctxBadge = usedLessonContext
                    ? "<span class='text-[10px] text-blue-700 dark:text-blue-300 font-bold opacity-80'>📚 Lección: contexto activado</span>"
                    : "<span class='text-[10px] text-slate-500 dark:text-slate-400 font-bold opacity-70'>📚 Lección: sin contexto</span>";
                const footer =
                    "<br><br><span class='text-[10px] text-orange-600 dark:text-orange-400 font-bold opacity-75'>⚡ Local (Ollama)</span><br>" +
                    ctxBadge;
                return { text: txt + footer, rawText: txt };
            }

            throw new Error("No AI provider configured.");

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
                    } catch(z) {
                        msg = "Critical Connection Error";
                    }
                }
            }

            if (msg.includes('[object XMLHttpRequest]') || msg.includes('[object Object]')) {
                msg = "Network Error: Could not connect to AI service.";
            }
            
            if (msg.includes('Failed to fetch') || msg.includes('Cross-Origin') || msg.includes('NetworkError')) {
                if (this.config.provider === 'ollama') {
                    hint = "<br><br><b>🚨 CORS ERROR DETECTED</b><br>Your browser blocked the connection to Ollama.<br>To fix this, restart Ollama with this command:<br><code class='bg-black text-white p-1 rounded'>OLLAMA_ORIGINS=\"*\" ollama serve</code>";
                } else if (this.config.provider === 'browser') {
                    hint = "<br><br><b>Hint:</b> The browser could not download the model. Check your internet connection.";
                }
            }
            
            if (msg.includes('401') || msg.includes('403')) {
                hint = "<br><br><b>🚨 ACCESS DENIED</b><br>The model you selected is Gated (Requires License).<br>Please switch to a public model like <b>Xenova/Llama-3.2-1B-Instruct</b> in Settings.";
            }
            
            return { text: `🦉 <span class="text-red-500 font-bold">ERROR:</span> ${msg}${hint}`, rawText: "Error" };
        }
    }
}

export const aiService = new HybridAIService();
