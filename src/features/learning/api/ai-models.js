/**
 * Modelos Sage, defaults y resolución (web + desktop).
 * Local GGUF chat is desktop-only (llama.cpp). Shared default id is LFM2.5.
 */
export const DEFAULT_DESKTOP_MODEL_ID = 'LiquidAI/LFM2.5-1.2B-Instruct-GGUF';
export const DEFAULT_DESKTOP_MODEL_FILE = 'LFM2.5-1.2B-Instruct-Q4_K_M.gguf';
export const DEFAULT_DESKTOP_MODEL = `${DEFAULT_DESKTOP_MODEL_ID}:${DEFAULT_DESKTOP_MODEL_FILE}`;

export const DEFAULT_WEB_MODEL_ID = DEFAULT_DESKTOP_MODEL_ID;
export const DEFAULT_WEB_MODEL_FILE = DEFAULT_DESKTOP_MODEL_FILE;
export const DEFAULT_WEB_MODEL = DEFAULT_DESKTOP_MODEL;

export { DEFAULT_WEB_MODEL as DEFAULT_BROWSER_MODEL };

export function resolveDefaultModel(isDesktop) {
    return isDesktop ? DEFAULT_DESKTOP_MODEL : DEFAULT_WEB_MODEL;
}

export function parseModelShorthand(modelName) {
    const fallback = DEFAULT_WEB_MODEL;
    const raw = String(modelName || '').trim();
    if (!raw) {
        const [id, file] = fallback.split(':');
        return { modelId: id, modelFile: file };
    }
    if (raw.includes(':')) {
        const idx = raw.indexOf(':');
        return { modelId: raw.slice(0, idx), modelFile: raw.slice(idx + 1) };
    }
    if (raw.includes('/') && /\.gguf$/i.test(raw)) {
        const idx = raw.lastIndexOf('/');
        return { modelId: raw.slice(0, idx), modelFile: raw.slice(idx + 1) };
    }
    const [id, file] = fallback.split(':');
    return { modelId: id, modelFile: file };
}

export function modelFileFromConfig(modelName) {
    return parseModelShorthand(modelName).modelFile;
}

export function loadedModelMatchesConfig(loadedPath, configModel) {
    const want = modelFileFromConfig(configModel);
    if (!want || !loadedPath) return false;
    return String(loadedPath).includes(want);
}

export function resolveStoredBrowserModel(isDesktop) {
    const fallback = resolveDefaultModel(isDesktop);
    try {
        const stored = localStorage.getItem('arborito_browser_model') || '';
        return stored || fallback;
    } catch (_) {
        return fallback;
    }
}

export function formatModelDisplayName(modelName) {
    const { modelFile } = parseModelShorthand(modelName);
    if (/lfm2\.5-1\.2b-instruct/i.test(modelFile)) return 'LFM';
    if (/lfm2\.5.*thinking/i.test(modelFile)) return 'LFM2.5 Thinking ⚠';
    if (/gemma-4-e2b/i.test(modelFile)) return 'Superintelligence';
    if (/llama-3\.2-3b/i.test(modelFile)) return 'Llama 3.2 3B';
    if (/llama-3\.2-1b/i.test(modelFile)) return 'Llama 3.2 1B';
    if (/smollm2-360m/i.test(modelFile)) return 'SmolLM2 360M';
    if (/smollm2-135m/i.test(modelFile)) return 'SmolLM2 135M';
    const base = modelFile.replace(/\.gguf$/i, '').replace(/^google_/i, '');
    if (base.length <= 24) return base;
    return `${base.slice(0, 22)}…`;
}

/** Technical / license name shown under the product label. */
export function formatModelTechnicalName(modelName) {
    const { modelFile } = parseModelShorthand(modelName);
    if (/lfm2\.5-1\.2b-instruct/i.test(modelFile)) return 'LFM2.5 Instruct';
    if (/gemma-4-e2b/i.test(modelFile)) return 'Gemma 4 · 2B';
    return formatModelDisplayName(modelName);
}

/**
 * Settings list label: intelligence tier for the desktop presets, else display name.
 * @param {string} modelName
 * @param {Record<string, string>} [ui]
 */
export function formatModelOptionLabel(modelName, ui = {}) {
    const { modelFile } = parseModelShorthand(modelName);
    if (/lfm2\.5-1\.2b-instruct/i.test(modelFile)) {
        return ui.sageModelIntelNormal || 'Fast';
    }
    if (/gemma-4-e2b/i.test(modelFile)) {
        return ui.sageModelIntelHigh || 'Superintelligence';
    }
    return formatModelDisplayName(modelName);
}

/** Approximate GGUF download size (MB) for consent copy, not a runtime measure. */
const MODEL_EST_DOWNLOAD_MB = {
    'LFM2.5-1.2B-Instruct-Q4_K_M.gguf': 731,
    'google_gemma-4-E2B-it-IQ4_XS.gguf': 3170,
    'Llama-3.2-1B-Instruct-Q4_K_M.gguf': 770,
    'Llama-3.2-3B-Instruct-Q4_K_M.gguf': 1900,
    'SmolLM2-360M-Instruct-Q4_K_M.gguf': 220,
    'SmolLM2-135M-Instruct-Q4_K_M.gguf': 90,
};

export function estimateModelDownloadMb(modelName) {
    const { modelFile } = parseModelShorthand(modelName);
    return MODEL_EST_DOWNLOAD_MB[modelFile] || 731;
}

/**
 * Fill `{model}` / `{mb}` in Sage AI consent strings from the active default model.
 * @param {string} template
 * @param {boolean} isDesktop
 * @param {string} [modelOverride]
 */
export function fillSageAiConsentTokens(template, isDesktop, modelOverride) {
    if (!template) return '';
    const model = modelOverride || resolveDefaultModel(isDesktop);
    const shortName = formatModelTechnicalName(model);
    const estMb = estimateModelDownloadMb(model);
    return String(template).replace(/\{model\}/g, shortName).replace(/\{mb\}/g, String(estMb));
}
