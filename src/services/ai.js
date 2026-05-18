
import { store } from "../store.js";
import {
    resolveAiContextPreset,
    extractKeySentences,
    detectQuickAction,
    classifyIntentJS,
    trimHistory
} from './ai-context.js';
import { KNOWLEDGE_DB, findBestPredefinedResponse } from './ai-knowledge-tree.js';
import { collectTreeRagEvidence } from '../utils/sage-tree-rag.js';

// Use dedicated worker file instead of blob to avoid CSP issues
const WORKER_URL = new URL('./ai-worker.js', import.meta.url).href;

// Using wllama with GGUF models from HuggingFace Hub
// Recommended: SmolLM2 135M for ultra-fast WASM CPU execution
export const DEFAULT_BROWSER_MODEL =
    'bartowski/SmolLM2-135M-Instruct-GGUF:SmolLM2-135M-Instruct-Q4_K_M.gguf';
const DEFAULT_BROWSER_MAX_NEW_TOKENS = 2048;
const DEFAULT_CONTEXT_PRESET = 'minimal';
const STABLE_HORDE_API_URL = 'https://stablehorde.net/api/v2';

function resolveBrowserModel() {
    const stored = localStorage.getItem('arborito_browser_model');
    // If stored model was the old heavy default, replace it with the new fast default
    if (stored && stored.includes('Llama-3.2-1B-Instruct')) {
        localStorage.removeItem('arborito_browser_model');
        return DEFAULT_BROWSER_MODEL;
    }
    return stored || DEFAULT_BROWSER_MODEL;
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
    if (stored === 'webllm' || stored === 'ollama' || stored === 'stablehorde') {
        if (stored !== 'browser') localStorage.setItem('arborito_ai_provider', 'browser');
        return 'browser';
    }
    return stored || 'browser';
}

const ROUTER_SYSTEM_PROMPT = `You are a strict action classifier and game referee. You MUST output EXACTLY ONE of the following ACTION keys. NEVER output anything else.

ACTION KEYS:
SALUDOS (greetings)
AGRADECIMIENTOS (thanks)
IDENTIDAD (who are you)
ARBORITO_AYUDA (what is arborito)
TECNICAS_ESTUDIO (study tips)
CHISTES (joke)
SUMMARIZE (request summary)
EXPLAIN (request explanation)
QUIZ (request test)
EVALUATE_ANSWER (user is trying to answer a question or solve a challenge)
QUESTION (asking about the content)
UNKNOWN (default)

Example:
User: "Esta bien esto?" -> EVALUATE_ANSWER
User: "La respuesta es B" -> EVALUATE_ANSWER`;

function buildPredefinedAnswer(rawAction, facts, lang, userMsg) {
    let action = "UNKNOWN";
    const validActions = [
        'SALUDOS', 'AGRADECIMIENTOS', 'IDENTIDAD', 'ARBORITO_AYUDA', 
        'TECNICAS_ESTUDIO', 'RESOLUCION_PROBLEMAS', 'LECCIONES_USO', 
        'CHISTES', 'SUMMARIZE', 'EXPLAIN', 'QUIZ', 'EVALUATE_ANSWER', 'QUESTION'
    ];
    
    for (const v of validActions) {
        if (rawAction.includes(v)) {
            action = v;
            break;
        }
    }

    if (facts.length === 0 && ['SUMMARIZE', 'EXPLAIN', 'QUIZ', 'QUESTION', 'EVALUATE_ANSWER'].includes(action)) {
         action = 'UNKNOWN';
    }

    const kMatch = KNOWLEDGE_DB.find(k => k.category === action.toLowerCase());
    if (kMatch) return kMatch.response;

    // --- GAME MECHANICS / DYNAMIC ACTIONS ---
    if (action === 'SUMMARIZE') {
        return (lang === 'ES' ? "💡 **Resumen Heurístico:**\n\n" : "💡 **Heuristic Summary:**\n\n") + facts.map(f => `• ${f}`).join('\n');
    }
    if (action === 'EXPLAIN') {
        return (lang === 'ES' ? "🧠 **Puntos Importantes:**\n\n" : "🧠 **Key Points:**\n\n") + facts.map(f => `• ${f}`).join('\n');
    }
    if (action === 'QUIZ') {
        return (lang === 'ES' ? "📝 **Desafío:**\n\n¿Cómo podrías aplicar esto?\n" : "📝 **Challenge:**\n\nHow could you apply this?\n") + facts.map(f => `• "${f.substring(0,80)}..."`).join('\n');
    }
    if (action === 'EVALUATE_ANSWER') {
        // Here we could use another micro-call to judge if Correct/Incorrect, 
        // but for now we follow the "no talking" rule with a template.
        const prefix = lang === 'ES' ? '🎯 **Evaluación del Tutor:**\n\n' : '🎯 **Tutor Evaluation:**\n\n';
        const feedback = lang === 'ES' 
            ? 'He analizado tu respuesta comparándola con los datos de la lección. Si coincide con estos puntos, ¡vas por buen camino!:' 
            : 'I have analyzed your answer against the lesson data. If it matches these points, you are on the right track!:';
        return `${prefix}${feedback}\n\n` + facts.map(f => `• ${f}`).join('\n');
    }
    if (action === 'QUESTION') {
        return (lang === 'ES' ? "🔍 **Datos de la Lección:**\n\n" : "🔍 **Lesson Data:**\n\n") + facts.map(f => `• ${f}`).join('\n');
    }

    return lang === 'ES' 
        ? 'Soy tu tutor. Por favor concéntrate en la lección actual o pregúntame algo sobre el texto.' 
        : 'I am your tutor. Please focus on the current lesson or ask about the text.';
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
        if (this.config.provider !== 'browser') {
            this.setConfig({ provider: 'browser' });
        }
        if (!this.worker) {
            try {
                await this.initWorker();
            } catch (e) {
                return false;
            }
        }
        return true;
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

            const quickActionGlobal = detectQuickAction(lastMsg, lang);
            const intentGlobal = classifyIntentJS(lastMsg, contextNode, lang);

            // --- TOMODACHI LIFE: ALGORITHMIC BYPASS ---
            const msgNorm = lastMsg.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
            // We removed the hardcoded bypasses because the new knowledge tree handles it.

            // Summary bypass (heuristics instead of LLM)
            if (quickActionGlobal === 'summarize' && lastMsg.length > 150) {
                // Try to isolate the pasted text from the prompt command
                const textToSummarize = lastMsg.replace(/^.*?(resum|summary|summarize)[^:\n]*[:\n]\s*/i, '');
                if (textToSummarize.length > 100) {
                    const extracted = extractKeySentences(textToSummarize, textToSummarize, { maxSentences: 3, maxChars: 800 });
                    if (extracted.length > 0) {
                        const bulletPoints = extracted.map(s => `• ${s}`).join('\n');
                        const prefix = lang === 'ES' 
                            ? '¡Resumen instantáneo! (Procesamiento heurístico local):\n\n' 
                            : 'Instant summary! (Local heuristic processing):\n\n';
                        const footerAlg = `<br><br><span class='text-[10px] text-orange-600 dark:text-orange-400 font-bold opacity-75'>⚡ Tomodachi (Heuristic Bypass)</span>`;
                        return { text: prefix + bulletPoints + footerAlg, rawText: prefix + bulletPoints };
                    }
                }
            }
            // ------------------------------------------

            // Extract facts globally first to determine if we have any lesson context to work with
            const presetGlobal = this.config.contextPreset || DEFAULT_CONTEXT_PRESET;
            const isMicroGlobal = presetGlobal === 'micro';
            let treeRagText = '';
            if (mode === 'sage-tree' && store.value.rawGraphData) {
                const rag = collectTreeRagEvidence(store.value.rawGraphData, lang, {
                    focusNodeId: contextNode?.id || null
                });
                treeRagText = rag.text || '';
            }
            let globalFacts = [];
            if (treeRagText) {
                globalFacts = extractKeySentences(treeRagText, lastMsg, {
                    maxSentences: isMicroGlobal ? 8 : 12,
                    maxChars: isMicroGlobal ? 600 : 1400
                });
            }
            if (globalFacts.length === 0 && contextNode && contextNode.content) {
                globalFacts = extractKeySentences(contextNode.content, lastMsg, {
                    maxSentences: isMicroGlobal ? 4 : 6,
                    maxChars: isMicroGlobal ? 400 : 700
                });
            }

            // --- BANNED LLM FOR NO-FACT CONTEXTS: FORCED ALGORITHMIC RESPONSE ---
            // If we are not an architect, and we have ZERO facts from the lesson, we absolutely MUST NOT
            // send the query to the LLM. It will just start chatting with its own weights. We must return a predefined response.
            if (mode !== 'architect' && globalFacts.length === 0 && !treeRagText) {
                let fallbackAnswer = "";
                const matchedResponse = findBestPredefinedResponse(lastMsg);
                if (matchedResponse) {
                    fallbackAnswer = matchedResponse;
                } else {
                    fallbackAnswer = lang === 'ES' 
                        ? 'Por favor, haz una pregunta sobre el contenido de la lección actual.'
                        : 'Please ask a question about the current lesson content.';
                }
                const nodeTitle = String((contextNode && contextNode.name) || '').trim();
                // Append general help if context exists (though it shouldn't have content if globalFacts is 0, but just in case)
                if (contextNode && contextNode.name) {
                    const offer = lang === 'ES'
                        ? `\n\n(Abre una lección con contenido para que pueda ayudarte.)`
                        : `\n\n(Open a lesson with content so I can help you.)`;
                    fallbackAnswer += offer;
                }
                const footerAlg = `<br><br><span class='text-[10px] text-orange-600 dark:text-orange-400 font-bold opacity-80'>📂 Respuestas Predefinidas (Motor Rápido)</span>`;
                return { text: fallbackAnswer + footerAlg, rawText: fallbackAnswer };
            }

            if (mode === 'architect') {
                systemContext = currentPrompts.architect;
            } else if (mode === 'sage-tree') {
                systemContext = lang === 'ES'
                    ? `${currentPrompts.sage} Puedes navegar por todo el árbol curricular usando el CONTEXTO del árbol. Cita la lección o tema cuando sea útil. No inventes contenido fuera del contexto.`
                    : `${currentPrompts.sage} You may navigate the full curriculum tree using the tree CONTEXT. Reference the lesson or topic when helpful. Do not invent content outside the context.`;
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
                            
                            // Streaming
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
                // SCRIPTED INTELLIGENCE (LLM AS PURE ROUTER)
                // ==============================================================
                
                let usedLessonCtx = false;
                let finalAnswer = null;

                const nodeTitle = String((contextNode && contextNode.name) || '').trim();

                let facts = [];
                if (mode === 'sage-tree' && treeRagText) {
                    facts = extractKeySentences(treeRagText, lastMsg, {
                        maxSentences: isMicro ? 8 : 12,
                        maxChars: isMicro ? 600 : 1400
                    });
                } else if (contextNode && contextNode.content) {
                    facts = extractKeySentences(contextNode.content, lastMsg, {
                        maxSentences: isMicro ? 4 : 6,
                        maxChars: isMicro ? 400 : 700
                    });
                }
                
                let scriptedUserMsg;
                if (facts.length > 0) {
                    usedLessonCtx = true;
                    const factsBlock = facts.map((f, i) => `${i + 1}. ${f}`).join('\n');
                    scriptedUserMsg = `FACTS:\n${factsBlock}\n\nUSER MESSAGE: ${lastMsg}`;
                } else {
                    scriptedUserMsg = lastMsg;
                }
                
                if (onStream) {
                    onStream(lang === 'ES' ? 'Evaluando...' : 'Evaluating...');
                }

                const rawAction = stripThinking(await generateOnce({ 
                    trimmedMessages: [{ role: 'user', content: scriptedUserMsg }], 
                    contextStr: '' 
                }, {
                    systemPrompt: ROUTER_SYSTEM_PROMPT,
                    contextStr: '',
                    maxNewTokens: 16
                }, null)).trim().toUpperCase();

                finalAnswer = buildPredefinedAnswer(rawAction, facts, lang, lastMsg);

                // 8. Footer
                const _ui = store.ui;
                let ctxBadge = "";
                ctxBadge = usedLessonCtx
                    ? `<span class='text-[10px] text-blue-700 dark:text-blue-300 font-bold opacity-80'>📚 ${_ui.sageLessonContextOn || ''}</span>`
                    : `<span class='text-[10px] text-slate-500 dark:text-slate-400 font-bold opacity-70'>📚 ${_ui.sageLessonContextOff || ''}</span>`;

                const footer = `<br><br><span class='text-[10px] text-green-600 dark:text-green-400 font-bold opacity-75'>⚡ ${this.config.browserModel} (CPU/Worker)</span><br>${ctxBadge}`;
                return { text: finalAnswer + footer, rawText: finalAnswer };
            }

            // Legacy cloud provider removed — wllama (browser) only.
            if (false && this.config.provider === 'stablehorde') {
                // SCRIPTED INTELLIGENCE (LLM AS PURE ROUTER)
                
                let usedLessonContext = false;
                let finalAnswer = null;

                let shFacts = [];
                if (contextNode && contextNode.content) {
                    shFacts = extractKeySentences(contextNode.content, lastMsg, {
                        maxSentences: 6, maxChars: 800
                    });
                }

                let shUserMsg;
                if (shFacts.length > 0) {
                    usedLessonContext = true;
                    const factsBlock = shFacts.map((f, i) => `${i + 1}. ${f}`).join('\n');
                    shUserMsg = `FACTS:\n${factsBlock}\n\nUSER MESSAGE: ${lastMsg}`;
                } else {
                    shUserMsg = lastMsg;
                }

                let shMessages;
                if (mode === 'architect') {
                    shMessages = [
                        { role: 'system', content: currentPrompts.architect },
                        ...cleanMessages.slice(Math.max(0, cleanMessages.length - 6), -1),
                        { role: 'user', content: shUserMsg }
                    ];
                } else {
                    shMessages = [
                        { role: 'system', content: ROUTER_SYSTEM_PROMPT },
                        { role: 'user', content: shUserMsg }
                    ];
                }

                this.currentController = new AbortController();
                const timeoutId = setTimeout(() => {
                    if (this.currentController) this.currentController.abort();
                }, 300000); 

                const promptText = shMessages.map(m => `${m.role}: ${m.content}`).join('\n');
                const body = {
                    prompt: `### User: ${promptText}\n### Assistant:`,
                    params: {
                        max_context_length: 512,
                        max_length: mode === 'architect' ? 1024 : 16,
                        temperature: 0,
                        top_p: 0.9
                    },
                    models: [],
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

                if (mode === 'architect') {
                    finalAnswer = txt;
                } else {
                    finalAnswer = buildPredefinedAnswer(txt.trim().toUpperCase(), shFacts, lang, lastMsg);
                }
                
                const _u = store.ui;
                const ctxBadge = usedLessonContext
                    ? `<span class='text-[10px] text-blue-700 dark:text-blue-300 font-bold opacity-80'>📚 ${_u.sageLessonContextOn || ''}</span>`
                    : `<span class='text-[10px] text-slate-500 dark:text-slate-400 font-bold opacity-70'>📚 ${_u.sageLessonContextOff || ''}</span>`;
                const footer =
                    "<br><br><span class='text-[10px] text-purple-600 dark:text-purple-400 font-bold opacity-75'>⚡ Stable Horde (Cloud)</span><br>" +
                    ctxBadge;
                return { text: finalAnswer + footer, rawText: finalAnswer };
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
                if (this.config.provider === 'browser') {
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

