/**
 * User-facing llama.cpp error text (from locales via `ui` with English fallbacks).
 */

/** @param {Record<string, string>} ui */
function t(ui, key, fallback) {
    const v = ui && ui[key];
    return v != null && String(v).trim() ? String(v) : fallback;
}

/** Avoid "❌ ❌ …" when messages are formatted more than once. */
export function normalizeErrorPrefix(msg, ui = {}) {
    let s = String(msg || '').trim();
    while (/^❌\s*/.test(s)) {
        s = s.replace(/^❌\s*/, '').trim();
    }
    const unknown = t(ui, 'sageLlamaErrorUnknown', 'Unknown error loading local AI.');
    return s ? `❌ ${s}` : `❌ ${unknown}`;
}

/** @param {string} raw @param {Record<string, string>} [ui] */
export function formatLlamacppUserError(raw, ui = {}) {
    const unknown = t(ui, 'sageLlamaErrorUnknown', 'Unknown error loading local AI.');
    const s = String(raw || '').trim();
    if (!s) return normalizeErrorPrefix(unknown, ui);

    // Already a friendly multi-line message from main process.
    if (s.includes('\n') && !s.includes('phase=')) {
        return normalizeErrorPrefix(s.replace(/^❌\s*/, ''), ui);
    }

    const fields = parseKeyValueBlock(s);
    const err = fields.err || '';
    const phase = fields.phase || '';
    const hint = fields.hint || '';

    if (
        /NoBinaryFoundError/i.test(s) ||
        /No prebuilt llama\.cpp CPU binary/i.test(s) ||
        /Motor nativo no disponible/i.test(s)
    ) {
        const title = t(ui, 'sageLlamaErrorEngineTitle', 'AI engine (llama.cpp) unavailable');
        const body = t(ui, 'sageLlamaErrorEngineBody', 'The model file may be fine on disk; the native engine is missing.');
        const dev = t(ui, 'sageLlamaErrorEngineDevHint', 'Development: cd arborito && npm install && npm start');
        const flatpak = t(ui, 'sageLlamaErrorEngineFlatpakHint', 'Flatpak (Linux): download the latest build from GitHub Releases.');
        return normalizeErrorPrefix(
            `${title}\n\n${body}\n\n• ${dev}\n• ${flatpak}` +
            (hint ? `\n\n💡 ${hint}` : ''),
            ui
        );
    }

    if (phase === 'download' || /Download failed/i.test(err)) {
        const title = t(ui, 'sageLlamaErrorDownloadTitle', 'Could not download the model');
        const body = t(ui, 'sageLlamaErrorDownloadBody', 'Check your internet connection.');
        return normalizeErrorPrefix(
            `${title}\n\n${body}` +
            (fields.file ? `\nFile: ${fields.file}` : ''),
            ui
        );
    }

    if (phase === 'validate' || /invalid magic|too small|incomplete download/i.test(err)) {
        const title = t(ui, 'sageLlamaErrorModelCorruptTitle', 'Model file damaged or incomplete');
        const incomplete = t(ui, 'sageLlamaErrorModelCorruptIncomplete', 'Incomplete download.');
        const action = t(ui, 'sageLlamaErrorModelCorruptAction', 'Delete the .gguf in the models folder and open Sage again.');
        return normalizeErrorPrefix(
            `${title}\n\n${err || incomplete}\n\n${action}`,
            ui
        );
    }

    if (phase === 'loadModel') {
        const title = t(ui, 'sageLlamaErrorLoadModelTitle', 'Could not load the model into memory');
        const unknownGguf = t(ui, 'sageLlamaErrorLoadModelUnknown', 'The engine does not recognize this GGUF.');
        const modelHint = t(
            ui,
            'sageLlamaErrorLoadModelHint',
            'Try the default model: LiquidAI/LFM2.5-1.2B-Instruct-GGUF:LFM2.5-1.2B-Instruct-Q4_K_M.gguf'
        );
        return normalizeErrorPrefix(
            `${title}\n\n${err || unknownGguf}\n\n💡 ${modelHint}`,
            ui
        );
    }

    if (phase === 'getLlama') {
        const title = t(ui, 'sageLlamaErrorGetLlamaTitle', 'Could not start the llama.cpp engine');
        const devHint = t(ui, 'sageLlamaErrorGetLlamaHint', 'cd arborito && npm install && npm start');
        return normalizeErrorPrefix(
            `${title}\n\n${err || s}` +
            (hint ? `\n\n💡 ${hint}` : `\n\n💡 ${devHint}`),
            ui
        );
    }

    if (err) {
        const titleTpl = t(ui, 'sageLlamaErrorGenericTitle', 'AI error ({phase})');
        const titleShort = t(ui, 'sageLlamaErrorGenericTitleShort', 'AI error');
        const title = phase ? titleTpl.replace('{phase}', phase) : titleShort;
        return normalizeErrorPrefix(`${title}\n\n${err}${hint ? `\n\n💡 ${hint}` : ''}`, ui);
    }

    return normalizeErrorPrefix(s.replace(/^❌\s*/, ''), ui);
}

/** @param {string} block */
function parseKeyValueBlock(block) {
    /** @type {Record<string, string>} */
    const out = {};
    for (const line of String(block).split('\n')) {
        const trimmed = line.trim();
        const i = trimmed.indexOf('=');
        if (i > 0) out[trimmed.slice(0, i)] = trimmed.slice(i + 1);
    }
    return out;
}

/** Progress line for Sage loading bar (single line). */
export function formatLlamacppProgressLine(data, ui = {}) {
    const phase = data && data.phase;
    const pr = typeof data?.progress === 'number' ? data.progress : null;
    const msg = data && data.message ? String(data.message) : '';

    if (phase === 'error') {
        return formatLlamacppUserError(msg, ui).split('\n')[0];
    }

    if (phase === 'download' && pr != null) {
        const whole = Math.min(99, Math.max(0, Math.round(pr * 100)));
        const downloading = t(ui, 'sageLlamaProgressDownloadingModel', 'Downloading model…');
        return whole < 1
            ? (ui.sageLoadingProgressStarting || downloading)
            : `${ui.sageStatusDownload || 'Downloading...'} ${whole}%`;
    }

    if (phase === 'prepare' && pr != null) {
        const whole = Math.min(100, Math.max(0, Math.round(pr * 100)));
        const line = data && data.message ? String(data.message) : '';
        if (line && !line.includes('%')) return line;
        return `${ui.sageProgressPreparingModel || 'Preparing model…'} ${whole}%`;
    }

    if (phase === 'ready') return ui.sageProgressNeuralReady || 'Assistant ready.';

    if (msg && !msg.includes('phase=')) return msg.split('\n')[0];

    return ui.sageLoadingProgressStarting || t(ui, 'sageLlamaProgressLoadingLocal', 'Loading local AI…');
}
