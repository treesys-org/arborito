
import { store } from "../store.js";
import {
    resolveAiContextPreset,
    extractKeySentences,
    detectQuickAction,
    classifyIntentJS,
    trimHistory
} from './ai-context.js';

// Use dedicated worker file instead of blob to avoid CSP issues
const WORKER_URL = new URL('./ai-worker.js', import.meta.url).href;

// Using wllama with GGUF models from HuggingFace Hub
// Default: Llama 3.2 1B Instruct (GGUF) — fast, capable, no auth required
export const DEFAULT_BROWSER_MODEL =
    'bartowski/Llama-3.2-1B-Instruct-GGUF:Llama-3.2-1B-Instruct-Q4_K_M.gguf';
const DEFAULT_BROWSER_MAX_NEW_TOKENS = 2048;
const DEFAULT_CONTEXT_PRESET = 'minimal';
const STABLE_HORDE_API_URL = 'https://stablehorde.net/api/v2';

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

// Note: wllama uses GGUF models directly from HuggingFace Hub
// No special prefixes needed for thinking control

function lastUserContentAsSent(messages) {
    const u = [...messages].reverse().find((m) => m && m.role === 'user' && typeof m.content === 'string');
    return u ? String(u.content) : '';
}

function normalizeAiProvider(stored) {
    if (stored === 'webllm') {
        localStorage.setItem('arborito_ai_provider', 'browser');
        return 'browser';
    }
    if (stored === 'ollama') {
        localStorage.setItem('arborito_ai_provider', 'stablehorde');
        return 'stablehorde';
    }
    return stored || 'browser';
}

class HybridAIService {
    constructor() {
        this.onProgress = null;
        this.config = {
            provider: normalizeAiProvider(localStorage.getItem('arborito_ai_provider')),
            stableHordeModel: localStorage.getItem('arborito_stablehorde_model') || '', // Empty = auto-select first available
            stableHordeApiKey: localStorage.getItem('arborito_stablehorde_api_key') || '0000000000',
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
        if (newConfig.stableHordeModel) localStorage.setItem('arborito_stablehorde_model', newConfig.stableHordeModel);
        if (newConfig.stableHordeApiKey) localStorage.setItem('arborito_stablehorde_api_key', newConfig.stableHordeApiKey);
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
        delete this.config.ollamaModel;
        delete this.config.ollamaHost;

        if (newConfig.provider === 'browser' || newConfig.provider === 'webllm') {
            // Delay worker init to let UI render first
            setTimeout(() => this.initWorker(), 50);
        }
    }

    async initialize() {
        if (this.config.provider === 'browser') {
            // Use setTimeout to make initialization non-blocking
            // This allows the UI to render before the heavy worker loads
            return new Promise((resolve, reject) => {
                setTimeout(async () => {
                    try {
                        await this.initWorker();
                        resolve(true);
                    } catch (e) {
                        reject(e);
                    }
                }, 100); // Small delay to let UI render
            });
        }
        return true;
    }

    // --- WORKER MANAGEMENT ---

    _resetBrowserWorkerAfterError() {
        this.workerInitializing = false;
        this.workerReady = false;
        this.workerPromise = null;
        if (this.worker) {
            try {
                this.worker.terminate();
            } catch {
                /* ignore */
            }
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
                    
                    // Handle unhandled errors in worker (like module loading failures)
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
    
    async checkHealth() {
        if (this.config.provider === 'stablehorde') {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);
                
                const response = await fetch(`${STABLE_HORDE_API_URL}/status/heartbeat`, { 
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

    async listStableHordeModels() {
        try {
            const response = await fetch(`${STABLE_HORDE_API_URL}/models/text`);
            if (!response.ok) return null;
            const data = await response.json();
            return data || [];
        } catch (e) {
            console.warn("Could not list Stable Horde models", e);
            return null;
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

            const lastMsgObj = cleanMessages[cleanMessages.length - 1];
            const lastMsg = lastMsgObj.content;
            const mode = (store.value.ai && store.value.ai.contextMode) || 'normal';

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
                let t = String(txt != null ? txt : '');
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

                const generateOnce = (pack, override = null, onToken = null) => {
                    return new Promise((resolve, reject) => {
                        const msgsForWorker = pack.trimmedMessages;
                        const echoUser = lastUserContentAsSent(msgsForWorker);
                        let accumulatedPartial = '';
                        const handler = (e) => {
                            if (!e.data || typeof e.data !== 'object') return;
                            const { status, text, message, partial } = e.data;
                            
                            // Streaming: recibir tokens parciales
                            if (status === 'token' && partial && onToken) {
                                accumulatedPartial = text;
                                onToken(text);
                                return;
                            }
                            
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
                                cleanText = cleanText.replace(/<\|eot_id\|>/g, '').trim();
                                cleanText = cleanText.replace(/<\|im_end\|>/g, '').trim();
                                cleanText = stripEcho(cleanText, echoUser, ((store && store.ui) ? store.ui.sageHello : undefined));
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
                                    systemPrompt: ((override && override.systemPrompt) != null ? override.systemPrompt : systemContext),
                                    contextStr: ((override && override.contextStr) != null ? override.contextStr : pack.contextStr),
                                    maxNewTokens: ((override && override.maxNewTokens) != null ? override.maxNewTokens : this.config.browserMaxNewTokens),
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
                const nodeTitle = String((contextNode && contextNode.name) || '').trim();
                if (intent === 'LESSON' && (contextNode && contextNode.content)) {
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

                // 6. Single generation with streaming
                let final = stripThinking(await generateOnce(pack, {
                    systemPrompt: scriptedSystem,
                    contextStr: '',
                    maxNewTokens: isMicro ? 256 : this.config.browserMaxNewTokens
                }, onStream));

                // 7. Offer to use lesson context for general questions
                if (intent === 'GENERAL' && (contextNode && contextNode.content) && final) {
                    const offer = lang === 'ES'
                        ? `Si querés, puedo usar la lección${nodeTitle ? ` ("${nodeTitle}")` : ''} como contexto.`
                        : `I can also use the lesson${nodeTitle ? ` ("${nodeTitle}")` : ''} as context if you want.`;
                    final = final.trim() + '\n\n' + offer;
                }

                // 8. Footer
                const usedLessonCtx = facts.length > 0;
                const _ui = store.ui;
                const ctxBadge = usedLessonCtx
                    ? `<span class='text-[10px] text-blue-700 dark:text-blue-300 font-bold opacity-80'>📚 ${_ui.sageLessonContextOn || ''}</span>`
                    : `<span class='text-[10px] text-slate-500 dark:text-slate-400 font-bold opacity-70'>📚 ${_ui.sageLessonContextOff || ''}</span>`;
                const footer = `<br><br><span class='text-[10px] text-green-600 dark:text-green-400 font-bold opacity-75'>⚡ ${this.config.browserModel} (CPU/Worker)</span><br>${ctxBadge}`;
                return { text: final + footer, rawText: final };
            }

            // --- STABLE HORDE (CLOUD) ---
            if (this.config.provider === 'stablehorde') {
                // Same scripted pre-digestion as browser path
                const shIntent = classifyIntentJS(lastMsg, contextNode, lang);
                const shQA = detectQuickAction(lastMsg, lang);

                let shFacts = [];
                if (shIntent === 'LESSON' && (contextNode && contextNode.content)) {
                    shFacts = extractKeySentences(contextNode.content, lastMsg, {
                        maxSentences: 6, maxChars: 800
                    });
                }

                let shSystem, shUserMsg;
                if (shFacts.length > 0) {
                    const factsBlock = shFacts.map((f, i) => `${i + 1}. ${f}`).join('\n');
                    shSystem = lang === 'ES'
                        ? 'Usa los datos proporcionados para responder. Sé directo y breve. No inventes hechos.'
                        : 'Use the provided data to answer. Be direct and brief. Do not make up facts.';

                    if (shQA === 'summarize') {
                        shUserMsg = (lang === 'ES' ? 'Resume en 3 puntos:\n' : 'Summarize in 3 points:\n') + factsBlock;
                    } else if (shQA === 'explain') {
                        shUserMsg = (lang === 'ES' ? 'Explica de forma simple:\n' : 'Explain simply:\n') + factsBlock;
                    } else if (shQA === 'quiz') {
                        shUserMsg = (lang === 'ES' ? 'Haz una pregunta de examen con 4 opciones sobre:\n' : 'Write a quiz question with 4 options about:\n') + factsBlock;
                    } else {
                        shUserMsg = (lang === 'ES' ? `DATOS:\n${factsBlock}\n\nPREGUNTA: ` : `DATA:\n${factsBlock}\n\nQUESTION: `) + lastMsg;
                    }
                } else {
                    shSystem = mode === 'architect' ? currentPrompts.architect : currentPrompts.sage;
                    shUserMsg = lastMsg;
                }

                const shMessages = [
                    { role: 'system', content: shSystem },
                    ...cleanMessages.slice(Math.max(0, cleanMessages.length - 6), -1),
                    { role: 'user', content: shUserMsg }
                ];

                this.currentController = new AbortController();
                const timeoutId = setTimeout(() => {
                    if (this.currentController) this.currentController.abort();
                }, 300000); 

                const lastMsgLower = lastMsg.toLowerCase();
                const isJsonRequest = lastMsgLower.includes('json') || lastMsgLower.includes('output format');

                // Stable Horde API - Async mode (like hordetest.html)
                // Uses async endpoint with polling for better reliability
                const promptText = shMessages.map(m => `${m.role}: ${m.content}`).join('\n');
                const body = {
                    prompt: `### User: ${promptText}\n### Assistant:`,
                    params: {
                        max_context_length: 512,
                        max_length: 120,
                        temperature: 0,
                        top_p: 0.9
                    },
                    // Use ANY available model (empty array = auto-select)
                    models: [],
                    // Identify app to avoid spam filters
                    client_agent: "ArboritoSage:1.0:CommunityBrowser"
                };

                // Step 1: Submit async request
                const submitResponse = await fetch(`${STABLE_HORDE_API_URL}/generate/text/async`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'apikey': this.config.stableHordeApiKey || '0000000000'
                    },
                    body: JSON.stringify(body),
                    signal: this.currentController.signal
                });
                
                if (!submitResponse.ok) throw new Error(`Stable Horde submit failed: ${submitResponse.status}`);
                
                const submitData = await submitResponse.json();
                if (!submitData.id) throw new Error('No job ID from Stable Horde');
                
                // Step 2: Poll for completion (max 5 min)
                const jobId = submitData.id;
                let pollCount = 0;
                const maxPolls = 150; // 5 min at 2s intervals
                let txt = '';
                
                while (pollCount < maxPolls) {
                    if (this.currentController.signal.aborted) {
                        throw new Error('Request aborted');
                    }
                    
                    await new Promise(r => setTimeout(r, 2000));
                    
                    const statusResponse = await fetch(`${STABLE_HORDE_API_URL}/generate/text/status/${jobId}`, {
                        signal: this.currentController.signal
                    });
                    
                    if (!statusResponse.ok) continue;
                    
                    const statusData = await statusResponse.json();
                    
                    if (statusData.done) {
                        txt = stripThinking((statusData.generations && statusData.generations[0] ? statusData.generations[0].text : undefined) || '');
                        break;
                    }
                    
                    // Update progress via onProgress callback
                    if (this.onProgress && statusData.wait_time) {
                        const w = statusData.wait_time;
                        const tpl = store.ui.sageStableHordeWait || 'Cloud: ~{s}s…';
                        this.onProgress({ text: String(tpl).replace('{s}', String(w)) });
                    }
                    
                    pollCount++;
                }
                
                if (!txt) throw new Error('Stable Horde timeout - try again later');
                
                clearTimeout(timeoutId);
                this.currentController = null;
                
                const usedLessonContext = shFacts.length > 0;
                const _u = store.ui;
                const ctxBadge = usedLessonContext
                    ? `<span class='text-[10px] text-blue-700 dark:text-blue-300 font-bold opacity-80'>📚 ${_u.sageLessonContextOn || ''}</span>`
                    : `<span class='text-[10px] text-slate-500 dark:text-slate-400 font-bold opacity-70'>📚 ${_u.sageLessonContextOff || ''}</span>`;
                const footer =
                    "<br><br><span class='text-[10px] text-purple-600 dark:text-purple-400 font-bold opacity-75'>⚡ Stable Horde (Cloud)</span><br>" +
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
                if (this.config.provider === 'stablehorde') {
                    hint = "<br><br><b>🚨 NETWORK ERROR</b><br>Could not connect to Stable Horde. Check your internet connection and API key.";
                } else if (this.config.provider === 'browser') {
                    hint = "<br><br><b>Hint:</b> The browser could not download the model. Check your internet connection.";
                }
            }
            
            if (msg.includes('401') || msg.includes('403')) {
                hint = "<br><br><b>🚨 ACCESS DENIED</b><br>The model you selected is Gated (Requires License).<br>Please switch to a public GGUF on Hugging Face (for example <b>bartowski/Llama-3.2-1B-Instruct-GGUF</b> with a <b>.gguf</b> file name) in Settings.";
            }
            
            return { text: `🦉 <span class="text-red-500 font-bold">ERROR:</span> ${msg}${hint}`, rawText: "Error" };
        }
    }
}

export const aiService = new HybridAIService();
