/** Expert mode: user-provided OpenAI-compatible API (Ollama, OpenAI, etc.) — web only. */

const ENABLED_KEY = 'arborito_expert_ai_enabled';
const BASE_KEY = 'arborito_expert_api_base';
const KEY_KEY = 'arborito_expert_api_key';
const MODEL_KEY = 'arborito_expert_api_model';

export function isExpertAiEnabled() {
    try { return localStorage.getItem(ENABLED_KEY) === 'true'; } catch (_) { return false; }
}

export function resolveExpertApiBase() {
    try {
        const v = String(localStorage.getItem(BASE_KEY) || '').trim();
        if (v) return v.replace(/\/+$/, '');
    } catch (_) {}
    return 'http://127.0.0.1:11434/v1';
}

export function resolveExpertApiKey() {
    try { return String(localStorage.getItem(KEY_KEY) || '').trim(); } catch (_) { return ''; }
}

export function resolveExpertApiModel() {
    try {
        const v = String(localStorage.getItem(MODEL_KEY) || '').trim();
        if (v) return v;
    } catch (_) {}
    return 'llama3.2';
}

export function isExpertAiConfigured() {
    return isExpertAiEnabled() && !!resolveExpertApiBase() && !!resolveExpertApiModel();
}

export function writeExpertConfig({ enabled, baseUrl, apiKey, model } = {}) {
    try {
        if (enabled != null) localStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false');
        if (baseUrl != null) localStorage.setItem(BASE_KEY, String(baseUrl).trim());
        if (apiKey != null) localStorage.setItem(KEY_KEY, String(apiKey).trim());
        if (model != null) localStorage.setItem(MODEL_KEY, String(model).trim());
    } catch (_) {}
}
