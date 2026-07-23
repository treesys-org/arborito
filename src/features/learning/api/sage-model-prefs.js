import {
    DEFAULT_DESKTOP_MODEL,
    DEFAULT_WEB_MODEL,
    parseModelShorthand,
    resolveDefaultModel,
    resolveStoredBrowserModel,
} from './ai-models.js';
import { isElectronDesktop } from './electron-bridge.js';

const SAVED_MODELS_KEY = 'arborito_sage_saved_models';

/** Default desktop chat model (LFM). */
export const DESKTOP_NORMAL_MODEL = DEFAULT_DESKTOP_MODEL;

/** Opt-in heavier desktop model (Gemma), shown as Superinteligencia. */
export const DESKTOP_SUPER_MODEL =
    'bartowski/google_gemma-4-E2B-it-GGUF:google_gemma-4-E2B-it-IQ4_XS.gguf';

const DESKTOP_PRESETS = [DESKTOP_NORMAL_MODEL, DESKTOP_SUPER_MODEL];

const WEB_PRESETS = [DEFAULT_WEB_MODEL];

/** Known HF repos → default GGUF file when user omits `:archivo.gguf`. */
const REPO_DEFAULT_FILES = {
    'LiquidAI/LFM2.5-1.2B-Instruct-GGUF': 'LFM2.5-1.2B-Instruct-Q4_K_M.gguf',
    'bartowski/google_gemma-4-E2B-it-GGUF': 'google_gemma-4-E2B-it-IQ4_XS.gguf',
};

export function isDesktopSuperModel(modelName) {
    return /gemma-4-e2b/i.test(parseModelShorthand(modelName).modelFile);
}

/** Map any stored id to the two desktop chat choices (unknown → LFM). */
export function resolveDesktopChatModel(modelName) {
    return isDesktopSuperModel(modelName) ? DESKTOP_SUPER_MODEL : DESKTOP_NORMAL_MODEL;
}

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
    if (isDesktop) {
        /* Desktop product surface: only LFM + Superinteligencia. */
        const active = resolveDesktopChatModel(resolveStoredBrowserModel(true));
        return [...new Set([active, ...presets])];
    }
    const active = resolveStoredBrowserModel(false);
    try {
        const raw = localStorage.getItem(SAVED_MODELS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                const cleaned = parsed.map(normalizeModelId).filter(Boolean);
                return [...new Set([active, resolveDefaultModel(false), ...cleaned, ...presets])].filter(Boolean);
            }
        }
    } catch (_) {}
    return [...new Set([active, resolveDefaultModel(false), ...presets])].filter(Boolean);
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
