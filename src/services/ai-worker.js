// AI Worker - Separate module file to avoid blob worker CSP issues

// Mock document for libraries that expect it (wllama uses it internally)
if (typeof document === 'undefined') {
    self.document = {
        createElement: () => ({}),
        body: { appendChild: () => {}, removeChild: () => {} },
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {},
        removeEventListener: () => {}
    };
}

// Patch OPFS for environments without COOP/COEP headers
(function patchOPFS() {
    if (typeof navigator === 'undefined' || !navigator.storage) return;
    const _orig = navigator.storage.getDirectory.bind(navigator.storage);
    navigator.storage.getDirectory = async function () {
        try { return await _orig(); } catch (_) { return _mockOPFSRoot(); }
    };
})();
function _mockOPFSRoot() {
    const dir = (name) => ({
        kind: 'directory', name: name || '',
        _f: new Map(), _d: new Map(),
        async getDirectoryHandle(n, o) {
            if (!this._d.has(n) && o && o.create) this._d.set(n, dir(n));
            const d = this._d.get(n);
            if (!d) throw new DOMException('Not found', 'NotFoundError');
            return d;
        },
        async getFileHandle(n, o) {
            if (!this._f.has(n) && o && o.create) this._f.set(n, { kind: 'file', name: n, async getFile() { return new File([], n); } });
            const f = this._f.get(n);
            if (!f) throw new DOMException('Not found', 'NotFoundError');
            return f;
        },
        async removeEntry(n) { this._f.delete(n); this._d.delete(n); },
        async *entries() { for (const [n, d] of this._d) yield [n, d]; for (const [n, f] of this._f) yield [n, f]; }
    });
    return dir('');
}

// @wllama/wllama copies weights with blob.stream(); Uint8Array has no stream().
(function ensureBlobStream() {
    if (typeof Blob === 'undefined' || typeof Blob.prototype.stream === 'function') return;
    Blob.prototype.stream = function blobStreamPolyfill() {
        const b = this;
        return new ReadableStream({
            start(controller) {
                return b.arrayBuffer().then((ab) => {
                    controller.enqueue(new Uint8Array(ab));
                    controller.close();
                });
            },
        });
    };
})();

/** Prefer same-origin `vendor/wllama/esm/` (see `vendor/wllama/README.md`); fallback CDN. */
const WLLAMA_CDN_VERSION = '2.2.1';

// Lazy-loaded module references
let Wllama = null;
let WasmFromCDN = null;
let wllamaInstance = null;
let currentModel = '';
let modulesLoaded = false;

async function tryImportWllamaFromBase(baseHref) {
    const base = typeof baseHref === 'string' ? baseHref : String(baseHref);
    const wllamaModule = await import(new URL('index.js', base).href);
    const wasmModule = await import(new URL('wasm-from-cdn.js', base).href);
    Wllama = wllamaModule.Wllama;
    WasmFromCDN = wasmModule.default;
    modulesLoaded = true;
    return true;
}

async function loadModules() {
    if (modulesLoaded) return true;
    const bases = [
        new URL('../../vendor/wllama/esm/', import.meta.url).href,
        `https://cdn.jsdelivr.net/npm/@wllama/wllama@${WLLAMA_CDN_VERSION}/esm/`
    ];
    for (let i = 0; i < bases.length; i++) {
        try {
            await tryImportWllamaFromBase(bases[i]);
            return true;
        } catch (importErr) {
            console.warn('[AI Worker] wllama import failed from', bases[i], importErr);
        }
    }
    console.error('[AI Worker] Failed to import wllama from vendor and CDN.');
    self.postMessage({
        status: 'error',
        message:
            'Failed to load in-browser AI (wllama). Copy vendor/wllama from npm (see vendor/wllama/README.md) or check network/CSP.'
    });
    return false;
}

self.addEventListener('message', async (e) => {
    const { type, data } = e.data;
    if (type === 'init') await initialize(data.model);
    else if (type === 'generate') await generate(data.messages, data.config);
});

async function initialize(modelName) {
    if (wllamaInstance && currentModel === modelName) {
        self.postMessage({ status: 'ready', message: 'Model already loaded.' });
        return;
    }
    
    // Load modules first
    const modulesOk = await loadModules();
    if (!modulesOk || !Wllama || !WasmFromCDN) {
        self.postMessage({ status: 'error', message: 'Wllama modules not available.' });
        return;
    }
    
    try {
        currentModel = modelName;
        self.postMessage({ status: 'progress', phase: 'download', progress: 0 });
        wllamaInstance = new Wllama(WasmFromCDN, { parallelDownloads: 3 });
        // Parse model ID and file path - format: "modelId:filePath" or auto-detect
        let modelId, modelFile;
        if (modelName && modelName.includes(':')) {
            const parts = modelName.split(':');
            modelId = parts[0];
            modelFile = parts[1];
        } else if (modelName && modelName.includes('/') && modelName.includes('.gguf')) {
            const slashCount = (modelName.match(/\//g) || []).length;
            if (slashCount === 1) {
                modelId = modelName;
                modelFile = 'model.gguf';
            } else {
                const secondSlash = modelName.indexOf('/', modelName.indexOf('/') + 1);
                modelId = modelName.substring(0, secondSlash);
                modelFile = modelName.substring(secondSlash + 1);
            }
        } else {
            // Default: Llama 3.2 1B Instruct GGUF (fast, capable, no auth required)
            modelId = 'bartowski/Llama-3.2-1B-Instruct-GGUF';
            modelFile = 'Llama-3.2-1B-Instruct-Q4_K_M.gguf';
        }
        const modelUrl = 'https://huggingface.co/' + modelId + '/resolve/main/' + modelFile;
        // Manual download bypassing CacheManager OPFS
        const response = await fetch(modelUrl);
        if (!response.ok) throw new Error('Failed to download model: ' + response.status);
        const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
        const reader = response.body.getReader();
        const chunks = [];
        let receivedLength = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            receivedLength += value.length;
            if (contentLength > 0) {
                const ratio = Math.min(1, receivedLength / contentLength);
                self.postMessage({ status: 'progress', phase: 'download', progress: ratio * 0.99 });
            }
        }
        if (contentLength <= 0 && receivedLength > 0) {
            self.postMessage({ status: 'progress', phase: 'download', progress: 0.99 });
        }
        const modelBlob = new Blob(chunks);
        if (!modelBlob.size) throw new Error('Downloaded model is empty');

        let prepMono = 0.99;
        const loadModelProgress = ({ loaded, total }) => {
            if (!total || total <= 0) return;
            const t = Math.min(1, loaded / total);
            const next = 0.99 + t * 0.01;
            prepMono = Math.max(prepMono, next);
            self.postMessage({ status: 'progress', phase: 'prepare', progress: prepMono });
        };

        // Detect available threads (uses full CPU on i3+)
        const nThreads = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) 
            ? navigator.hardwareConcurrency 
            : 4;
        
        // Check SharedArrayBuffer (required for multi-threading)
        const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
        console.log(`[AI Worker] Threads: ${nThreads}, SharedArrayBuffer: ${hasSharedArrayBuffer}`);
        
        await wllamaInstance.loadModel([modelBlob], { 
            progressCallback: loadModelProgress, 
            n_ctx: 4096,
            n_threads: nThreads,
            n_batch: 512  // Required for parallelization
        });
        
        console.log(`[AI Worker] Model loaded with ${nThreads} threads`);
        self.postMessage({ status: 'ready', message: 'AI Ready (WASM).' });
    } catch (err) {
        wllamaInstance = null;
        self.postMessage({ status: 'error', message: err.message || String(err) });
    }
}

async function generate(messages, config) {
    if (!wllamaInstance) {
        self.postMessage({ status: 'error', message: 'Model not initialized. Call init first.' });
        return;
    }
    
    // Log configuration being used
    console.log(`[AI Worker] Generating with n_threads=${wllamaInstance.n_threads || '?'}`);
    
    // Ensure modules are loaded
    if (!modulesLoaded || !Wllama) {
        self.postMessage({ status: 'error', message: 'Wllama modules not loaded.' });
        return;
    }
    
    const systemPrompt = config.systemPrompt || '';
    const contextStr = config.contextStr || '';
    const microMode = !!config.microMode;
    try {
        let fullPrompt = '';
        const llama32Style = /llama[-_\s]?3\.[0-9]/i.test(String(currentModel || ''));

        // Gemma 3 chat format - uses <start_of_turn> tokens
        const buildGemmaPrompt = (msgs) => {
            let p = '';
            for (const m of msgs) {
                if (m.role === 'system') {
                    p += `<start_of_turn>user\n${m.content}\n<end_of_turn>\n`;
                } else if (m.role === 'user') {
                    p += `<start_of_turn>user\n${m.content}\n<end_of_turn>\n`;
                } else if (m.role === 'assistant') {
                    p += `<start_of_turn>model\n${m.content}\n<end_of_turn>\n`;
                }
            }
            p += '<start_of_turn>model\n';
            return p;
        };

        // Llama 3.x (incl. 3.2 1B) instruct chat — official header tokens
        const buildLlama3InstructPrompt = (msgs) => {
            let p = '<|begin_of_text|>';
            for (const m of msgs) {
                if (m.role === 'user') {
                    p += `<|start_header_id|>user<|end_header_id|>\n\n${m.content}<|eot_id|>`;
                } else if (m.role === 'assistant') {
                    p += `<|start_header_id|>assistant<|end_header_id|>\n\n${m.content}<|eot_id|>`;
                }
            }
            p += `<|start_header_id|>assistant<|end_header_id|>\n\n`;
            return p;
        };

        if (microMode) {
            if (systemPrompt) fullPrompt += systemPrompt + '\n\n';
            const nonSystem = messages.filter(m => m.role !== 'system');
            for (const m of nonSystem) fullPrompt += m.content + '\n\n';
            fullPrompt += 'Response:';
        } else {
            const chatMessages = [];
            // No separate system role in templates below: fold into first user (same as Gemma path)
            if (systemPrompt) {
                const firstUser = messages.find(m => m.role === 'user');
                if (firstUser) {
                    firstUser.content = `${systemPrompt}\n\n${firstUser.content}`;
                }
            }
            if (contextStr) {
                const firstUser = messages.find(m => m.role === 'user');
                if (firstUser) {
                    firstUser.content = `Context: ${contextStr}\n\n${firstUser.content}`;
                }
            }
            const history = messages.filter(m => m.role !== 'system');
            chatMessages.push(...history);
            fullPrompt = llama32Style ? buildLlama3InstructPrompt(chatMessages) : buildGemmaPrompt(chatMessages);
        }
        const requestedMax = config && config.maxNewTokens != null ? Number(config.maxNewTokens) : NaN;
        // Cap at 512 tokens max for speed - simple greetings don't need 2048 tokens
        const nPredict = Number.isFinite(requestedMax) ? Math.max(32, Math.min(512, Math.round(requestedMax))) : 256;
        const sampling = microMode ? { temp: 0.3, top_k: 1, top_p: 1, repeat_penalty: 1.0 } : { temp: 0.6, top_k: 40, top_p: 0.95, repeat_penalty: 1.05 };
        
        // Streaming: send partial tokens for smoother UX
        let partialText = '';
        const outputText = await wllamaInstance.createCompletion(fullPrompt, { 
            nPredict, 
            sampling,
            onNewToken: (token, piece, currentText) => {
                partialText = currentText;
                // Send partial token to main thread
                self.postMessage({ status: 'token', text: currentText, partial: true });
            }
        });
        
        let text = outputText;
        if (text.startsWith(fullPrompt)) text = text.substring(fullPrompt.length);
        // Clean up chat template markers from output
        text = text
            .replace(/<\|eot_id\|>/g, '')
            .replace(/<\|end_of_text\|>/g, '')
            .replace(/<\|redacted_start_header_id\|>assistant<\|redacted_end_header_id\|>/gi, '')
            .replace(/<end_of_turn>/g, '')
            .replace(/<start_of_turn>/g, '')
            .replace(/<end_of_text>/g, '')
            .replace(/^model\n/i, '')
            .replace(/^assistant\n/i, '')
            .replace(/^User:/i, '')
            .replace(/^Response:/i, '');
        self.postMessage({ status: 'complete', text: text.trim() });
    } catch (err) {
        self.postMessage({ status: 'error', message: err.message || String(err) });
    }
}
