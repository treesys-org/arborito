
import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { escHtml } from '../../../shared/lib/html-escape.js';
import {
    resolveAiContextPreset,
} from './ai-context.js';
import { collectTreeRagEvidence, buildSageActiveLessonContext, expandSageRagQuery, preloadRagLessonContent, collectArboritoDemoRagBlock, isCasualSageGreeting, findNodeById } from './sage-tree-rag.js';
import { resolveSageContextPlan, SAGE_INTENT, isSageDemoCurriculum } from './sage-context-resolver.js';
import { resolveDefaultModel, formatModelDisplayName, resolveStoredBrowserModel, loadedModelMatchesConfig, modelFileFromConfig } from './ai-models.js';
import { formatLlamacppUserError } from './llama-error-messages.js';
import { isDesktopLlamacppBridgePresent, llamacppBridge } from './ai-llamacpp-bridge.js';
import { mustUseNativeLlamacpp, isElectronDesktop, pickHostUi } from './electron-bridge.js';
import { hasSageAiConsentForInit } from './sage-ai-consent.js';
import { isExpertAiConfigured, resolveExpertApiModel } from './ai-expert-config.js';
import { expertApiChat, expertApiHealthCheck } from './ai-expert-api.js';
import {
    resolveContextWindowTokens,
    SAGE_CHAT_MAX_TOKENS_OPEN,
    resolveContextPresetBudgets,
    resolveSageContextStrict,
    writeSageContextStrict,
    resetSageContextStrictPref,
    resolveLlamaVulkan,
    resetLlamaVulkanPref,
    writeLlamaVulkan,
} from './sage-ai-prefs.js';
import {
    applyAdaptiveSageDefaultsIfNeeded,
    detectHardwareTier,
    resolveAdaptiveHistoryTurns,
    resolveContextInputShare,
    SAGE_PERF_AUTO_KEY,
} from './sage-hardware-profile.js';
import { stripThinking, stripThinkingStream } from './sage-thinking.js';
import { composeSageSystemContext } from './sage-prompts.js';
import { buildSageRagBrief, summarizeContextPart } from './sage-rag-brief.js';
import {
    shouldRefuseOutsideTreeContext,
    sageOutsideTreeRefusalText,
} from './sage-strict-guard.js';

export { DEFAULT_BROWSER_MODEL, resolveDefaultModel } from './ai-models.js';

export const MAX_BROWSER_NEW_TOKENS = 4096;
const DEFAULT_BROWSER_MAX_NEW_TOKENS = 1024;
const DEFAULT_CONTEXT_PRESET = 'minimal';

function isTrivialGreeting(text) {
    return isCasualSageGreeting(text);
}

function resolveBrowserMaxNewTokens() {
    const raw = localStorage.getItem('arborito_browser_max_new_tokens');
    const n = raw != null ? Number(raw) : NaN;
    if (!Number.isFinite(n)) return DEFAULT_BROWSER_MAX_NEW_TOKENS;
    return Math.max(64, Math.min(MAX_BROWSER_NEW_TOKENS, Math.round(n)));
}

function resolveContextPreset() {
    applyAdaptiveSageDefaultsIfNeeded();
    return resolveAiContextPreset(localStorage.getItem('arborito_ai_context_preset') || DEFAULT_CONTEXT_PRESET);
}

function clipContextToWindow(text, preset) {
    const nCtx = resolveContextWindowTokens(preset);
    const inputShare = resolveContextInputShare(preset);
    const maxChars = Math.floor(nCtx * inputShare * 3.2);
    return clipText(text, maxChars);
}

function resolveChatMaxTokens({ lastMsg, contextBlock, mode, baseMax, preset }) {
    if (isTrivialGreeting(lastMsg)) return Math.min(96, baseMax);
    if (mode === 'architect' || mode === 'game') return baseMax;
    if (!contextBlock) return Math.min(SAGE_CHAT_MAX_TOKENS_OPEN, baseMax);

    const qLen = String(lastMsg || '').trim().length;
    let cap = baseMax;
    if (qLen < 60) cap = Math.min(320, baseMax);
    else if (qLen < 140) cap = Math.min(512, baseMax);
    else if (qLen < 280) cap = Math.min(768, baseMax);

    if (preset === 'micro') cap = Math.min(cap, 640);
    return cap;
}

function resolveChatTemperature({ contextBlock, mode, isGreeting, contextStrict }) {
    if (isGreeting) return 0.72;
    if (mode === 'architect' || mode === 'game') return 0.35;
    if (contextStrict && contextBlock) return 0.38;
    if (contextBlock) return 0.48;
    return 0.62;
}

function isLessonNode(node) {
    return !!(node && (node.type === 'leaf' || node.type === 'exam'));
}

function clipText(text, maxChars) {
    const s = String(text || '');
    if (!Number.isFinite(maxChars) || maxChars <= 0 || s.length <= maxChars) return s;
    return s.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…';
}

function clipMessagesFromEnd(messages, maxChars) {
    const list = Array.isArray(messages) ? messages : [];
    if (!Number.isFinite(maxChars) || maxChars <= 0 || !list.length) return list;
    const out = [];
    let used = 0;
    for (let i = list.length - 1; i >= 0; i--) {
        const m = list[i];
        const len = String(m?.content || '').length;
        if (used + len > maxChars && out.length) break;
        out.unshift(m);
        used += len;
    }
    return out.length ? out : list.slice(-Math.min(2, list.length));
}

async function buildSageContextBlock({ mode, lang, lastMsg, contextNode, messages, preset }) {
    if (isTrivialGreeting(lastMsg)) {
        return {
            contextBlock: '',
            sessionPatch: null,
            intent: SAGE_INTENT.GREETING,
            grounding: {},
            query: lastMsg,
        };
    }

    const budgets = resolveContextPresetBudgets(preset);
    const emptyGround = {
        hasLesson: false,
        hasModule: false,
        hasMap: false,
        hasRag: false,
        hasDemo: false,
        demoAsAppKnowledge: false,
        ragBestScore: 0,
    };

    if (mode === 'game') {
        const lessonNode =
            contextNode && (contextNode.content || isLessonNode(contextNode))
                ? { ...contextNode, type: contextNode.type || 'leaf' }
                : null;
        if (!lessonNode?.content) {
            return {
                contextBlock: '',
                sessionPatch: null,
                intent: SAGE_INTENT.GENERAL,
                grounding: emptyGround,
                query: lastMsg,
            };
        }
        const activeLesson = buildSageActiveLessonContext(store, lessonNode, lang, budgets.lesson);
        return {
            contextBlock: activeLesson ? clipContextToWindow(activeLesson, preset) : '',
            sessionPatch: null,
            intent: SAGE_INTENT.LESSON_QA,
            grounding: { ...emptyGround, hasLesson: !!activeLesson },
            query: lastMsg,
        };
    }

    if (mode !== 'sage-tree' && mode !== 'architect') {
        return {
            contextBlock: '',
            sessionPatch: null,
            intent: SAGE_INTENT.GENERAL,
            grounding: emptyGround,
            query: lastMsg,
        };
    }

    const treeRoot = store.value.data;
    const rawGraph = store.value.rawGraphData;
    const aiState = store.value.ai || {};
    const activeSource = store.value.activeSource || null;
    const activeSourceId = activeSource?.id != null ? String(activeSource.id) : '';
    const isDemoCurriculum = isSageDemoCurriculum(activeSource, rawGraph);
    let sessionFocus = aiState.sageNavFocus || null;
    if (
        sessionFocus?.sourceId
        && activeSourceId
        && String(sessionFocus.sourceId) !== activeSourceId
    ) {
        sessionFocus = null;
    }

    const plan = resolveSageContextPlan({
        lastMsg,
        messages,
        treeRoot,
        contextNode,
        lang,
        sessionFocus,
        moduleBudget: Math.min(2800, Math.floor(budgets.tree * 0.35)),
        mapBudget: Math.min(1200, Math.floor(budgets.tree * 0.2)),
        activeSourceId,
        isDemoCurriculum,
    });

    const parts = [];
    const briefSources = [];
    const grounding = { ...emptyGround };

    if (plan.includeDemoRag) {
        try {
            const asAppKnowledgeOnly = !isDemoCurriculum;
            const demoRag = await collectArboritoDemoRagBlock(
                lang,
                plan.intentQuery || plan.query || lastMsg,
                preset,
                {
                    force: plan.intent === SAGE_INTENT.APP_HELP,
                    asAppKnowledgeOnly,
                }
            );
            if (demoRag) {
                parts.push(demoRag);
                grounding.hasDemo = true;
                grounding.demoAsAppKnowledge = asAppKnowledgeOnly;
                briefSources.push({
                    kind: 'demo',
                    title: asAppKnowledgeOnly
                        ? lang === 'ES'
                            ? 'Ayuda de la app (no es el curso)'
                            : 'App help (not the course)'
                        : plan.intent === SAGE_INTENT.APP_HELP
                          ? 'Documentación app Arborito'
                          : 'Guía Arborito',
                    snippet: summarizeContextPart(demoRag),
                });
            }
        } catch (err) {
            console.warn('Sage demo RAG failed:', err);
        }
    }

    if (plan.courseMapBlock) {
        parts.push(plan.courseMapBlock);
        grounding.hasMap = true;
        briefSources.push({
            kind: 'module',
            title: lang === 'ES' ? 'Mapa del curso' : 'Course map',
            snippet: summarizeContextPart(plan.courseMapBlock),
        });
    }
    if (plan.moduleBlock) {
        parts.push(plan.moduleBlock);
        grounding.hasModule = true;
        briefSources.push({
            kind: 'module',
            title: plan.moduleBranch?.name || (lang === 'ES' ? 'Módulo' : 'Module'),
            snippet: summarizeContextPart(plan.moduleBlock),
        });
    }

    const focusNode = plan.includeActiveLesson
        ? (plan.focusNode
            || (isLessonNode(contextNode)
                && contextNode.content
                && treeRoot
                && findNodeById(treeRoot, contextNode.id)
                ? contextNode
                : null))
        : plan.focusNode;

    /* Load focus body before building active lesson — RAG preload used to run too late. */
    if (
        focusNode &&
        isLessonNode(focusNode) &&
        !focusNode.content &&
        typeof store.loadNodeContent === 'function' &&
        (focusNode.contentPath || (focusNode.treeLazyContent && focusNode.treeContentKey))
    ) {
        try {
            await store.loadNodeContent(focusNode);
        } catch (err) {
            console.warn('Sage focus lesson preload failed:', err);
        }
    }

    const activeLesson =
        plan.includeActiveLesson && isLessonNode(focusNode) && focusNode.content
            ? buildSageActiveLessonContext(store, focusNode, lang, budgets.lesson)
            : '';
    if (activeLesson) {
        parts.push(activeLesson);
        grounding.hasLesson = true;
        briefSources.push({
            kind: 'lesson',
            title: focusNode?.name || (lang === 'ES' ? 'Lección actual' : 'Current lesson'),
            snippet: summarizeContextPart(activeLesson),
        });
    }

    if (plan.includeCourseRag && (treeRoot || rawGraph)) {
        const ragOpts = {
            treeRoot,
            focusNodeId: focusNode?.id || null,
            excludeNodeId: activeLesson ? focusNode?.id : null,
            focusParentId: plan.focusParentId || focusNode?.parentId || null,
            query: plan.query,
            maxNodes:
                plan.intent === SAGE_INTENT.NAV_OUTLINE
                    ? Math.min(6, budgets.ragNodes)
                    : activeLesson
                      ? budgets.ragNodesWithLesson
                      : budgets.ragNodes,
            maxChars:
                plan.intent === SAGE_INTENT.NAV_OUTLINE
                    ? Math.floor(budgets.tree * 0.45)
                    : activeLesson
                      ? Math.floor(budgets.tree * 0.85)
                      : budgets.tree,
        };
        await preloadRagLessonContent(store, rawGraph, lang, ragOpts, plan.intent === SAGE_INTENT.NAV_OUTLINE ? 1 : 2);
        const rag = collectTreeRagEvidence(rawGraph, lang, {
            ...ragOpts,
            ui: store.ui || store.value?.ui || {},
        });
        grounding.ragBestScore = Number(rag?.bestScore) || 0;
        if (rag?.text && plan.intent !== SAGE_INTENT.NAV_OUTLINE) {
            parts.push(String(rag.text));
            grounding.hasRag = true;
            briefSources.push({
                kind: 'lesson',
                title: lang === 'ES' ? 'Lecciones relacionadas' : 'Related lessons',
                snippet: summarizeContextPart(String(rag.text)),
            });
        } else if (rag?.text && plan.intent === SAGE_INTENT.NAV_OUTLINE && !plan.moduleBlock) {
            parts.push(String(rag.text));
            grounding.hasRag = true;
            briefSources.push({
                kind: 'lesson',
                title: lang === 'ES' ? 'Lecciones del árbol' : 'Tree lessons',
                snippet: summarizeContextPart(String(rag.text)),
            });
        }
    }

    if (!parts.length) {
        return {
            contextBlock: '',
            sessionPatch: plan.sessionPatch,
            intent: plan.intent,
            grounding,
            query: plan.intentQuery || plan.query || lastMsg,
        };
    }

    const brief = buildSageRagBrief({
        lang,
        lastMsg,
        plan,
        sources: briefSources,
        appKnowledgeOnly: !!grounding.demoAsAppKnowledge,
    });
    const merged = brief ? [brief, ...parts] : parts;
    return {
        contextBlock: clipContextToWindow(merged.join('\n\n---\n\n'), preset),
        sessionPatch: plan.sessionPatch,
        intent: plan.intent,
        grounding,
        query: plan.intentQuery || plan.query || lastMsg,
    };
}

class HybridAIService {
    constructor() {
        this.onProgress = null;
        this.config = {
            provider: 'unavailable',
            browserModel: resolveDefaultModel(false),
            browserMaxNewTokens: DEFAULT_BROWSER_MAX_NEW_TOKENS,
            contextPreset: DEFAULT_CONTEXT_PRESET,
        };
        this.llamacppReady = false;
        this.llamacppInitializing = false;
        this.llamacppPromise = null;
        this.expertReady = false;
        this.loadedModelFile = null;
        this._llamacppProgressBound = false;
        this._llamacppTokenOff = null;
        this._pendingSageSessionPatch = null;
        this.syncEnvironment();
    }

    consumeSageSessionPatch() {
        const patch = this._pendingSageSessionPatch;
        this._pendingSageSessionPatch = null;
        return patch;
    }

    _clearLlamacppTokenListener() {
        if (typeof this._llamacppTokenOff === 'function') {
            try { this._llamacppTokenOff(); } catch (_) {}
        }
        this._llamacppTokenOff = null;
    }

    resolveProvider() {
        if (mustUseNativeLlamacpp() || isDesktopLlamacppBridgePresent()) return 'llamacpp';
        if (isExpertAiConfigured()) return 'expert-api';
        return 'unavailable';
    }

    isWebAiUnavailable() {
        return !isElectronDesktop() && this.resolveProvider() === 'unavailable';
    }

    syncEnvironment() {
        this.config.provider = this.resolveProvider();
        const isDesktop = mustUseNativeLlamacpp() || isDesktopLlamacppBridgePresent();
        this.config.browserModel = resolveStoredBrowserModel(isDesktop);
        this.config.browserMaxNewTokens = resolveBrowserMaxNewTokens();
        this.config.contextPreset = resolveContextPreset();
    }

    setCallback(cb) {
        this.onProgress = cb;
    }

    setConfig(newConfig) {
        this.syncEnvironment();
        const { contextStrict, ...configPatch } = newConfig || {};
        this.config = { ...this.config, ...configPatch, provider: this.resolveProvider() };
        if (newConfig.browserModel) {
            try { localStorage.setItem('arborito_browser_model', newConfig.browserModel); } catch (_) {}
        }
        if (newConfig.browserMaxNewTokens != null) {
            const n = Number(newConfig.browserMaxNewTokens);
            if (Number.isFinite(n)) {
                try {
                    localStorage.setItem(
                        'arborito_browser_max_new_tokens',
                        String(Math.max(64, Math.min(MAX_BROWSER_NEW_TOKENS, Math.round(n))))
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
        if (contextStrict != null) {
            writeSageContextStrict(!!contextStrict);
        }
        this.llamacppReady = false;
        this.llamacppPromise = null;
        this.loadedModelFile = null;
        this.expertReady = false;
        if (this.config.provider === 'llamacpp' && hasSageAiConsentForInit()) {
            const starting = store.ui?.sageLoadingProgressStarting || 'Starting…';
            store.update({ ai: { ...store.value.ai, status: 'loading', progress: starting } });
            this._bindLlamacppProgressOnce();
            setTimeout(() => {
                this.initLlamacpp()
                    .then(() => {
                        if (store.value.ai.status === 'loading') {
                            store.update({ ai: { ...store.value.ai, status: 'ready', progress: null } });
                        }
                    })
                    .catch((e) => {
                        if (e && (e.name === 'AbortError' || e.message === 'Aborted')) return;
                        if (store.value.ai.status === 'loading') {
                            store.update({ ai: { ...store.value.ai, status: 'ready', progress: null } });
                        }
                    });
            }, 50);
        }
    }

    resetConfig() {
        try {
            localStorage.removeItem('arborito_browser_model');
            localStorage.removeItem('arborito_browser_max_new_tokens');
            localStorage.removeItem('arborito_ai_context_preset');
            localStorage.removeItem(SAGE_PERF_AUTO_KEY);
            resetSageContextStrictPref();
            resetLlamaVulkanPref();
        } catch (_) {}
        applyAdaptiveSageDefaultsIfNeeded();
        const isDesktop = mustUseNativeLlamacpp() || isDesktopLlamacppBridgePresent();
        this.config = {
            provider: this.resolveProvider(),
            browserModel: resolveDefaultModel(isDesktop),
            browserMaxNewTokens: resolveBrowserMaxNewTokens(),
            contextPreset: resolveContextPreset(),
        };
        this.llamacppReady = false;
        this.expertReady = false;
    }

    async initialize() {
        this.syncEnvironment();
        if (!hasSageAiConsentForInit()) {
            throw new Error('Sage AI consent required before loading models.');
        }
        if (this.config.provider === 'unavailable') {
            throw new Error(this._unavailableMessage());
        }
        if (this.config.provider === 'llamacpp') {
            return this.initLlamacpp();
        }
        if (this.config.provider === 'expert-api') {
            return this.initExpertApi();
        }
        throw new Error('AI provider not configured');
    }

    _unavailableMessage() {
        const ui = store.ui;
        return (
            pickHostUi(
                ui,
                'sageWebAiUnavailableShort',
                'sageWebAiUnavailableShortApp',
                'Local tutor requires Arborito Desktop or Expert mode with an API key.'
            )
        );
    }

    _bindLlamacppProgressOnce() {
        if (this._llamacppProgressBound) return;
        const bridge = llamacppBridge();
        if (!bridge || typeof bridge.onProgress !== 'function') return;
        bridge.onProgress((data) => {
            if (!data) return;
            const msg = data.message || data.text || '';
            const pr = typeof data.progress === 'number' ? data.progress : null;
            let line = msg;
            if (pr != null) {
                const pct = Math.round(pr * 100);
                line = line ? `${line} (${pct}%)` : `${pct}%`;
            }
            const text = line || store.ui.sageLoadingProgressStarting || '…';
            if (this.onProgress) {
                this.onProgress({ text });
            } else if (store.value.ai.status === 'loading' || store.value.ai.status === 'streaming') {
                store.update({ ai: { ...store.value.ai, progress: text } });
            }
        });
        this._llamacppProgressBound = true;
    }

    async initLlamacpp() {
        if (!hasSageAiConsentForInit()) {
            throw new Error('Sage AI download consent required.');
        }
        const bridge = llamacppBridge();
        if (!bridge) {
            throw new Error('[llama.cpp] Native bridge not available in this build.');
        }
        if (this.llamacppReady) {
            try {
                const st = await bridge.status();
                if (st?.ready && loadedModelMatchesConfig(st.modelPath, this.config.browserModel)) {
                    return;
                }
            } catch (_) {}
            this.llamacppReady = false;
            this.llamacppPromise = null;
        }
        if (this.llamacppPromise) return this.llamacppPromise;

        this.llamacppInitializing = true;
        this._bindLlamacppProgressOnce();
        this.llamacppPromise = (async () => {
            const status = await bridge.status();
            if (!status || !status.available) {
                throw new Error(status?.error || '[llama.cpp] Native engine unavailable on this platform.');
            }
            if (this.onProgress) {
                this.onProgress({ text: store.ui.sageProgressWorkerInit || 'Starting native AI…' });
            }
            const load = await bridge.load({
                model: this.config.browserModel || resolveDefaultModel(true),
                nCtx: resolveContextWindowTokens(this.config.contextPreset),
                vulkan: resolveLlamaVulkan(),
            });
            if (!load || !load.ok) {
                if (load?.error === 'Aborted') {
                    const err = new Error('Aborted');
                    err.name = 'AbortError';
                    throw err;
                }
                throw new Error(load?.error || '[llama.cpp] Failed to load model.');
            }
            /* Keep the Vulkan switch honest: store what the server actually runs. */
            if (typeof load.vulkanActive === 'boolean') {
                writeLlamaVulkan(!!load.vulkanActive);
            }
            this.llamacppReady = true;
            this.llamacppInitializing = false;
            this.loadedModelFile = load.modelFile || modelFileFromConfig(this.config.browserModel);
            if (this.onProgress) {
                this.onProgress({ text: store.ui.sageProgressNeuralReady || 'Assistant ready.' });
            }
        })();

        try {
            await this.llamacppPromise;
        } catch (e) {
            this.llamacppInitializing = false;
            this.llamacppPromise = null;
            throw e;
        }
        return this.llamacppPromise;
    }

    async initExpertApi() {
        if (this.expertReady) return;
        if (this.onProgress) {
            this.onProgress({ text: store.ui.sageExpertConnecting || 'Connecting to your API…' });
        }
        await expertApiHealthCheck();
        this.expertReady = true;
        if (this.onProgress) {
            this.onProgress({ text: store.ui.sageProgressNeuralReady || 'Assistant ready.' });
        }
    }

    async checkHealth() {
        if (this.config.provider === 'unavailable') return false;
        if (this.config.provider === 'llamacpp') {
            try { await this.initLlamacpp(); return true; }
            catch (_) { return false; }
        }
        if (this.config.provider === 'expert-api') {
            try { await this.initExpertApi(); return true; }
            catch (_) { return false; }
        }
        return false;
    }

    abortGeneration() {
        this._pendingSageSessionPatch = null;
        this._clearLlamacppTokenListener();
        if (this.config.provider === 'llamacpp') {
            const bridge = llamacppBridge();
            if (bridge && typeof bridge.abort === 'function') {
                try { bridge.abort(); } catch (_) {}
            }
        }
    }

    async abort() {
        this.abortGeneration();
        this.llamacppInitializing = false;
        this.llamacppPromise = null;
        this.onProgress = null;
    }

    async _syncLlamacppServerReady() {
        if (this.config.provider !== 'llamacpp') return;
        const bridge = llamacppBridge();
        if (!bridge || typeof bridge.status !== 'function') return;
        try {
            const st = await bridge.status();
            if (!st || !st.available) {
                this.llamacppReady = false;
                this.llamacppPromise = null;
                return;
            }
            if (!st.ready) {
                this.llamacppReady = false;
                this.llamacppPromise = null;
                return;
            }
            if (!loadedModelMatchesConfig(st.modelPath, this.config.browserModel)) {
                this.llamacppReady = false;
                this.llamacppPromise = null;
            }
        } catch (_) {}
    }

    async chat(messages, contextNode = null, onStream = null) {
        this.syncEnvironment();
        this.abortGeneration();

        if (this.config.provider === 'unavailable') {
            throw new Error(this._unavailableMessage());
        }

        try {
            const lang = store.value.lang || 'EN';
            const cleanMessages = messages.map(m => {
                if (m.role === 'assistant' && typeof m.content === 'string') {
                    const base = stripThinking(m.content.split('<br><br>')[0].trim());
                    return { ...m, content: base };
                }
                return m;
            });

            const lastMsgObj = cleanMessages[cleanMessages.length - 1] || { content: '' };
            const lastMsg = typeof lastMsgObj.content === 'string' ? lastMsgObj.content : '';
            const rawMode = store.value.ai?.contextMode;
            const mode =
                rawMode === 'architect' || rawMode === 'game' ? rawMode : 'sage-tree';

            if (lastMsg.startsWith('LOCAL_ACTION:')) {
                return { text: "Command executed.", rawText: "Command executed." };
            }

            const contextStrict = resolveSageContextStrict();
            const preset = this.config.contextPreset || DEFAULT_CONTEXT_PRESET;
            const tier = detectHardwareTier();
            const modelLabel = formatModelDisplayName(this.config.browserModel);

            const built = await buildSageContextBlock({
                mode,
                lang,
                lastMsg,
                contextNode,
                messages: cleanMessages,
                preset,
            });
            const contextBlock = built?.contextBlock || '';
            this._pendingSageSessionPatch = built?.sessionPatch || null;

            const greeting = isTrivialGreeting(lastMsg);
            if (
                shouldRefuseOutsideTreeContext({
                    contextStrict,
                    mode,
                    isGreeting: greeting,
                    intent: built?.intent,
                    grounding: built?.grounding,
                })
            ) {
                const refuse = sageOutsideTreeRefusalText(lang, store.ui || {});
                if (onStream) onStream(refuse);
                return { text: refuse, rawText: refuse, providerLabel: this._providerLabel() };
            }

            const systemForModel = composeSageSystemContext({
                lang,
                contextStrict,
                mode,
                contextBlock,
                lastMsg,
                messages: cleanMessages,
                modelLabel,
                preset,
                isTrivialGreeting,
                intent: built?.intent || null,
                appKnowledgeOnly: !!built?.grounding?.demoAsAppKnowledge,
            });
            const maxTokens = resolveChatMaxTokens({
                lastMsg,
                contextBlock,
                mode,
                baseMax: this.config.browserMaxNewTokens,
                preset,
            });
            const temperature = resolveChatTemperature({
                contextBlock,
                mode,
                isGreeting: greeting,
                contextStrict,
            });
            const historyLimit = mode === 'architect' ? 6 : resolveAdaptiveHistoryTurns(preset, tier);
            const nCtx = resolveContextWindowTokens(preset);
            const totalInputBudget = Math.floor(nCtx * resolveContextInputShare(preset) * 3.2);
            const historyBudget = Math.max(
                600,
                totalInputBudget -
                    systemForModel.length -
                    contextBlock.length -
                    maxTokens * 4 -
                    256
            );
            const historySlice = cleanMessages.slice(Math.max(0, cleanMessages.length - historyLimit));
            const msgsForModel = clipMessagesFromEnd(historySlice, historyBudget);

            if (this.config.provider === 'llamacpp') {
                await this._syncLlamacppServerReady();
                if (!this.llamacppReady) await this.initLlamacpp();
                const bridge = llamacppBridge();
                if (!bridge) throw new Error('[llama.cpp] Bridge missing');
                let streamed = '';
                this._clearLlamacppTokenListener();
                if (typeof bridge.onToken === 'function') {
                    this._llamacppTokenOff = bridge.onToken((payload) => {
                        const t = payload && payload.text ? String(payload.text) : '';
                        if (t) {
                            streamed = t;
                            if (onStream) onStream(streamed);
                        }
                    });
                }
                const chatOpts = {
                    messages: msgsForModel,
                    systemPrompt: systemForModel,
                    maxTokens,
                    temperature,
                    topP: 0.92,
                    stream: !!onStream,
                };
                try {
                    let chatRes = await bridge.chat(chatOpts);
                    if ((!chatRes || !chatRes.ok) && String(chatRes?.error || '').includes('Model not loaded')) {
                        this.llamacppReady = false;
                        this.llamacppPromise = null;
                        await this.initLlamacpp();
                        chatRes = await bridge.chat(chatOpts);
                    }
                    if (!chatRes || !chatRes.ok) {
                        const errText = String(chatRes?.error || '');
                        if (errText === 'Aborted' || errText.includes('Aborted')) {
                            const err = new Error('Aborted');
                            err.name = 'AbortError';
                            throw err;
                        }
                        throw new Error(errText || '[llama.cpp] Chat failed');
                    }
                    const result = stripThinking(String(chatRes.text || streamed || ''), {
                        keepConstruct: true,
                    });
                    return { text: result, rawText: result, providerLabel: this._providerLabel() };
                } finally {
                    this._clearLlamacppTokenListener();
                }
            }

            if (this.config.provider === 'expert-api') {
                if (!this.expertReady) await this.initExpertApi();
                const onExpertStream = onStream
                    ? (partial) => { if (onStream) onStream(stripThinkingStream(partial)); }
                    : null;
                const result = stripThinking(
                    await expertApiChat({
                        messages: msgsForModel,
                        systemPrompt: systemForModel,
                        maxTokens,
                        temperature,
                        onStream: onExpertStream,
                    }),
                    { keepConstruct: true }
                );
                return { text: result, rawText: result, providerLabel: this._providerLabel() };
            }

            throw new Error(this._unavailableMessage());
        } catch (e) {
            if (e && (e.name === 'AbortError' || e.message === 'Aborted')) throw e;
            console.error('Sage Chat Error:', e);
            let msg = e instanceof Error ? formatLlamacppUserError(e.message, store.ui) : String(e);
            let hint = '';
            if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
                hint = '<br><br><b>Hint:</b> Could not reach the API. Check URL and CORS.';
            }
            const body = escHtml(msg.replace(/^❌\s*/, ''));
            return {
                text: `<span class="text-red-500 font-bold">ERROR</span><br><pre class="whitespace-pre-wrap text-sm mt-2 arborito-sage-error">${body}</pre>${hint}`,
                rawText: 'Error',
            };
        }
    }

    _providerLabel() {
        const ui = store.ui;
        if (this.config.provider === 'llamacpp') {
            const configId = this.config.browserModel || resolveDefaultModel(true);
            const loaded = this.loadedModelFile || modelFileFromConfig(configId);
            const name = formatModelDisplayName(
                this.loadedModelFile ? `${configId.split(':')[0] || 'local'}:${loaded}` : configId
            );
            const native = ui.sageProviderDesktopShort || ui.sageProviderDesktopNative || 'Nativo';
            return `${name} · ${native}`;
        }
        if (this.config.provider === 'expert-api') {
            const model = resolveExpertApiModel() || '';
            const short = model ? `${model} · ` : '';
            return `${short}${ui.sageProviderExpertShort || ui.sageProviderExpertApi || 'API'}`;
        }
        return ui.sageProviderNotConfigured || 'Not configured';
    }
}

export const aiService = new HybridAIService();
