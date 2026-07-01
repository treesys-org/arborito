import { DEFAULT_WEB_MODEL, resolveDefaultModel, resolveStoredBrowserModel } from './ai-models.js';
import { isElectronDesktop } from './electron-bridge.js';

const SAVED_MODELS_KEY = 'arborito_sage_saved_models';

const DESKTOP_PRESETS = [
    'LiquidAI/LFM2.5-1.2B-Instruct-GGUF:LFM2.5-1.2B-Instruct-Q4_K_M.gguf',
    'bartowski/Llama-3.2-3B-Instruct-GGUF:Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    'bartowski/SmolLM2-360M-Instruct-GGUF:SmolLM2-360M-Instruct-Q4_K_M.gguf',
];

const WEB_PRESETS = [
    DEFAULT_WEB_MODEL,
    'bartowski/Llama-3.2-3B-Instruct-GGUF:Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    'bartowski/SmolLM2-360M-Instruct-GGUF:SmolLM2-360M-Instruct-Q4_K_M.gguf',
    'bartowski/SmolLM2-135M-Instruct-GGUF:SmolLM2-135M-Instruct-Q4_K_M.gguf',
];

/** Known HF repos → default GGUF file when user omits `:archivo.gguf`. */
const REPO_DEFAULT_FILES = {
    'LiquidAI/LFM2.5-1.2B-Instruct-GGUF': 'LFM2.5-1.2B-Instruct-Q4_K_M.gguf',
};

function defaultPresets(isDesktop) {
    return isDesktop ? DESKTOP_PRESETS : WEB_PRESETS;
}

function normalizeModelId(raw) {
    const parsed = parseModelInput(raw);
    return parsed.ok ? parsed.id : '';
}

/**
 * Accepts:
 *  - org/repo:archivo.gguf
 *  - org/repo/archivo.gguf
 *  - org/repo  (uses REPO_DEFAULT_FILES when known)
 */
export function parseModelInput(raw) {
    const t = String(raw || '').trim();
    if (!t) return { ok: false, error: 'empty' };

    if (t.includes(':')) {
        const idx = t.indexOf(':');
        const repo = t.slice(0, idx).trim();
        const file = t.slice(idx + 1).trim();
        if (repo && file && /\.gguf$/i.test(file)) {
            return { ok: true, id: `${repo}:${file}` };
        }
        return { ok: false, error: 'format' };
    }

    if (t.includes('/') && /\.gguf$/i.test(t)) {
        return { ok: true, id: t };
    }

    if (/^[\w.-]+\/[\w\-.]+$/i.test(t)) {
        const file = REPO_DEFAULT_FILES[t];
        if (file) {
            return { ok: true, id: `${t}:${file}`, guessed: true };
        }
        return { ok: false, error: 'repo_only' };
    }

    return { ok: false, error: 'format' };
}

export function resolveSavedModels(isDesktop = isElectronDesktop()) {
    const presets = defaultPresets(isDesktop);
    const active = resolveStoredBrowserModel(isDesktop);
    try {
        const raw = localStorage.getItem(SAVED_MODELS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                const cleaned = parsed.map(normalizeModelId).filter(Boolean);
                return [...new Set([active, resolveDefaultModel(isDesktop), ...cleaned, ...presets])].filter(Boolean);
            }
        }
    } catch (_) {}
    return [...new Set([active, resolveDefaultModel(isDesktop), ...presets])].filter(Boolean);
}

export function writeSavedModels(models) {
    const cleaned = [...new Set((models || []).map(normalizeModelId).filter(Boolean))];
    try {
        localStorage.setItem(SAVED_MODELS_KEY, JSON.stringify(cleaned));
    } catch (_) {}
    return cleaned;
}

export function addSavedModel(modelId, isDesktop = isElectronDesktop()) {
    const id = normalizeModelId(modelId);
    if (!id) return resolveSavedModels(isDesktop);
    const next = [...new Set([...resolveSavedModels(isDesktop), id])];
    writeSavedModels(next);
    return next;
}

export function removeSavedModel(modelId, isDesktop = isElectronDesktop()) {
    const id = normalizeModelId(modelId);
    const fallback = resolveDefaultModel(isDesktop);
    let next = resolveSavedModels(isDesktop).filter((m) => m !== id);
    if (!next.includes(fallback)) next.unshift(fallback);
    if (!next.length) next.push(fallback);
    writeSavedModels(next);
    return next;
}

export { normalizeModelId };
