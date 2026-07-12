/** Sage AI prefs stored in localStorage (desktop + web expert). */

/**
 * Mapa rápido (editar IA / Sage):
 *  - Preferencias aquí: sage-ai-prefs.js
 *  - Perfil hardware: sage-hardware-profile.js
 *  - Modelos default: ai-models.js, sage-model-prefs.js
 *  - Prompt + tokens + historial: ai.js, sage-prompts.js
 *  - Quitar “thinking” del texto: sage-thinking.js
 *  - Servidor llama.cpp: electron-llama-chat.cjs, electron-llama-bin.cjs
 *  - UI chat + micrófono: modals/sage-ui-chat.js
 *  - Flujo enviar mensaje: ai-logic.js → ai.js
 *  - Voz STT/TTS: sage-voice.js, electron-whisper-stt.cjs
 */

/** Max tokens per reply when no lesson/tree context is loaded. */
export const SAGE_CHAT_MAX_TOKENS_OPEN = 512;

/** Default chat turns when no adaptive preset is active. */
export const SAGE_CHAT_HISTORY_TURNS = 6;

/** llama-server context window (-c) per preset. */
export function resolveContextWindowTokens(preset) {
    const p = String(preset || 'minimal');
    if (p === 'micro') return 4096;
    if (p === 'balanced') return 8192;
    return 6144;
}

const SAGE_CONTEXT_STRICT_KEY = 'arborito_sage_context_strict';

/** Default ON: answer only from retrieved lesson/tree context; admit when unknown. */
export function resolveSageContextStrict() {
    try {
        const raw = localStorage.getItem(SAGE_CONTEXT_STRICT_KEY);
        if (raw === '0' || raw === 'false') return false;
        if (raw === '1' || raw === 'true') return true;
    } catch (_) {}
    return true;
}

export function writeSageContextStrict(enabled) {
    try {
        localStorage.setItem(SAGE_CONTEXT_STRICT_KEY, enabled ? '1' : '0');
    } catch (_) {}
}

export function resetSageContextStrictPref() {
    try {
        localStorage.removeItem(SAGE_CONTEXT_STRICT_KEY);
    } catch (_) {}
}

/** RAG / lesson char budgets and node caps per preset. */
export function resolveContextPresetBudgets(preset) {
    const p = String(preset || 'minimal');
    if (p === 'micro') {
        return { lesson: 2400, tree: 3200, ragNodes: 8, ragNodesWithLesson: 10 };
    }
    if (p === 'balanced') {
        return { lesson: 9000, tree: 11000, ragNodes: 28, ragNodesWithLesson: 16 };
    }
    return { lesson: 6000, tree: 8000, ragNodes: 22, ragNodesWithLesson: 14 };
}
