
/**
 * Carga Transformers.js solo desde CDN (jsDelivr). No se empaqueta el runtime en el repo.
 * @see https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js
 */
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

let generator = null;
let currentTask = 'text-generation';
let currentModel = '';

self.addEventListener('message', async (e) => {
    const { type, data } = e.data;

    if (type === 'init') {
        await initialize(data.model);
    } else if (type === 'generate') {
        await generate(data.messages, data.config);
    }
});

async function initialize(modelName) {
    if (generator && currentModel === modelName) {
        self.postMessage({ status: 'ready', message: 'Model already loaded in worker.' });
        return;
    }

    try {
        currentModel = modelName;

        const lower = modelName.toLowerCase();
        currentTask = (lower.includes('t5') || lower.includes('bart') || lower.includes('flan'))
            ? 'text2text-generation'
            : 'text-generation';

        self.postMessage({ status: 'progress', message: 'Initiating Engine...', progress: 0 });

        generator = await pipeline(currentTask, modelName, {
            progress_callback: (progress) => {
                if (progress.status === 'progress') {
                    const p = typeof progress.progress === 'number' ? progress.progress : undefined;
                    self.postMessage({
                        status: 'progress',
                        message: `Downloading ${progress.file}`,
                        progress: p
                    });
                } else if (progress.status === 'initiate') {
                    self.postMessage({ status: 'progress', message: `Downloading ${progress.file}...`, progress: 0 });
                }
            }
        });

        self.postMessage({ status: 'ready', message: 'AI Engine Ready.' });
    } catch (err) {
        generator = null;
        self.postMessage({ status: 'error', message: err.message || String(err) });
    }
}

async function generate(messages, config) {
    if (!generator) {
        self.postMessage({ status: 'error', message: 'Model not initialized.' });
        return;
    }

    const systemPrompt = config.systemPrompt || '';
    const contextStr = config.contextStr || '';
    const microMode = !!config.microMode;

    let fullPrompt = '';

    try {
        if (microMode) {
            // Micro mode: ultra-simple prompt format that wastes zero tokens on
            // ChatML markup. A dumb model only sees plain text instructions + data.
            if (systemPrompt) fullPrompt += systemPrompt + '\n\n';
            const nonSystem = messages.filter(m => m.role !== 'system');
            for (const m of nonSystem) {
                if (m.role === 'assistant') {
                    fullPrompt += m.content + '\n\n';
                } else {
                    fullPrompt += m.content + '\n\n';
                }
            }
            fullPrompt += 'Response:';
        } else if (currentTask === 'text-generation') {
            fullPrompt += `<|im_start|>system\n${systemPrompt}\n`;
            if (contextStr) {
                fullPrompt += `CONTEXT DATA:\n${contextStr}\n`;
            }
            fullPrompt += `<|im_end|>\n`;

            const history = messages.filter(m => m.role !== 'system');

            for (const m of history) {
                fullPrompt += `<|im_start|>${m.role}\n${m.content}<|im_end|>\n`;
            }

            fullPrompt += `<|im_start|>assistant\n`;
        } else {
            const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
            fullPrompt = `Question: ${lastUserMsg}\nContext: ${contextStr}\n\nAnswer:`;
        }

        const requestedMax =
            config && config.maxNewTokens != null ? Number(config.maxNewTokens) : NaN;
        const maxNewTokens = Number.isFinite(requestedMax)
            ? Math.max(32, Math.min(2048, Math.round(requestedMax)))
            : 512;

        const genOpts = microMode
            ? {
                max_new_tokens: maxNewTokens,
                temperature: 0.05,
                do_sample: true,
                repetition_penalty: 1.2,
                top_k: 20,
                return_full_text: false
            }
            : {
                max_new_tokens: maxNewTokens,
                temperature: 0.1,
                do_sample: true,
                repetition_penalty: 1.15,
                top_k: 40,
                return_full_text: false
            };

        const output = await generator(fullPrompt, genOpts);

        let text = '';

        if (Array.isArray(output) && output.length > 0) {
            text = output[0].generated_text;
        } else if (typeof output === 'string') {
            text = output;
        } else if (output && output.generated_text) {
            text = output.generated_text;
        }

        if (text.startsWith(fullPrompt)) {
            text = text.substring(fullPrompt.length);
        }

        const lastUserMarker = '<|im_start|>assistant';
        const lastIndex = text.lastIndexOf(lastUserMarker);
        if (lastIndex !== -1) {
            text = text.substring(lastIndex + lastUserMarker.length);
        }

        text = text.replace(/<\|im_end\|>/g, '');
        text = text.replace(/<\|im_start\|>/g, '');
        text = text.replace(/^assistant\n/i, '');
        text = text.replace(/^User:/i, '');
        text = text.replace(/^Response:/i, '');

        self.postMessage({ status: 'complete', text: text.trim() });
    } catch (err) {
        self.postMessage({ status: 'error', message: err.message || String(err) });
    }
}
