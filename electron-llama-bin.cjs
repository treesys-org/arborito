'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const LLAMA_RELEASE = 'b9733';

const LLAMA_ASSETS = {
  'linux-x64': {
    name: `llama-${LLAMA_RELEASE}-bin-ubuntu-x64.tar.gz`,
    extract: 'tar',
  },
  'linux-arm64': { name: `llama-${LLAMA_RELEASE}-bin-ubuntu-arm64.tar.gz`, extract: 'tar' },
  'darwin-arm64': { name: `llama-${LLAMA_RELEASE}-bin-macos-arm64.tar.gz`, extract: 'tar' },
  'darwin-x64': { name: `llama-${LLAMA_RELEASE}-bin-macos-x64.tar.gz`, extract: 'tar' },
  'win32-x64': { name: `llama-${LLAMA_RELEASE}-bin-win-cpu-x64.zip`, extract: 'zip' },
};

const DEFAULT_CHAT_MODEL_ID = 'LiquidAI/LFM2.5-1.2B-Instruct-GGUF';
const DEFAULT_CHAT_MODEL_FILE = 'LFM2.5-1.2B-Instruct-Q4_K_M.gguf';
const DEFAULT_CHAT_MODEL = `${DEFAULT_CHAT_MODEL_ID}:${DEFAULT_CHAT_MODEL_FILE}`;

function detectPlatformKey() {
  const arch = process.arch;
  if (process.platform === 'linux' && arch === 'x64') return 'linux-x64';
  if (process.platform === 'linux' && arch === 'arm64') return 'linux-arm64';
  if (process.platform === 'darwin' && arch === 'arm64') return 'darwin-arm64';
  if (process.platform === 'darwin' && arch === 'x64') return 'darwin-x64';
  if (process.platform === 'win32' && arch === 'x64') return 'win32-x64';
  return null;
}

function resolveUserDataDir(appRef) {
  if (process.env.ARBORITO_USER_DATA) return process.env.ARBORITO_USER_DATA;
  if (appRef && typeof appRef.getPath === 'function') {
    try { return appRef.getPath('userData'); } catch (_) {}
  }
  return path.join(os.homedir(), '.config', 'Arborito');
}

function llamaBinRoot(userDataDir) {
  return path.join(userDataDir, 'llama-cpp-bin');
}

function chatModelsDir(userDataDir) {
  return path.join(userDataDir, 'llamacpp-models');
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/** @type {AbortController|null} */
let activeDownloadAbort = null;

function beginDownloadSession() {
  abortActiveDownload();
  activeDownloadAbort = new AbortController();
  return activeDownloadAbort.signal;
}

function abortActiveDownload() {
  if (activeDownloadAbort) {
    try { activeDownloadAbort.abort(); } catch (_) {}
    activeDownloadAbort = null;
  }
}

function clearDownloadSession() {
  activeDownloadAbort = null;
}

async function downloadFile(url, destPath, onProgress, signal) {
  const tmp = destPath + '.part';
  const cleanupPartial = () => {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
  };

  let res;
  try {
    res = await fetch(url, {
      signal: signal || undefined,
      redirect: 'follow',
      headers: { 'User-Agent': 'arborito-llama-bin/1.0' },
    });
  } catch (e) {
    cleanupPartial();
    if (e && e.name === 'AbortError') throw e;
    throw new Error(`Download failed: ${e && e.message ? e.message : e}`);
  }
  if (!res.ok) {
    cleanupPartial();
    throw new Error(`Download failed: HTTP ${res.status} for ${url}`);
  }
  const total = Number(res.headers.get('content-length') || '0');
  const out = fs.createWriteStream(tmp);
  let received = 0;
  const reader = res.body.getReader();
  try {
    while (true) {
      if (signal?.aborted) {
        try { await reader.cancel(); } catch (_) {}
        const err = new Error('Aborted');
        err.name = 'AbortError';
        throw err;
      }
      const { done, value } = await reader.read();
      if (done) break;
      out.write(Buffer.from(value));
      received += value.length;
      if (onProgress && total > 0) onProgress(received / total);
    }
    out.end();
    await new Promise((r) => out.on('close', r));
    fs.renameSync(tmp, destPath);
  } catch (e) {
    cleanupPartial();
    try { out.destroy(); } catch (_) {}
    throw e;
  }
}

function extractArchive(archivePath, destDir, kind) {
  mkdirp(destDir);
  if (kind === 'tar') {
    const r = spawnSync('tar', ['-xzf', archivePath, '-C', destDir], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'tar extract failed').trim());
    return;
  }
  const r = spawnSync('unzip', ['-o', archivePath, '-d', destDir], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'zip extract failed').trim());
}

function findExecutable(rootDir, names) {
  const queue = [rootDir];
  const found = new Map();
  while (queue.length) {
    const dir = queue.shift();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { continue; }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) queue.push(full);
      else if (names.includes(ent.name) && !found.has(ent.name)) found.set(ent.name, full);
    }
  }
  for (const name of names) {
    if (found.has(name)) return found.get(name);
  }
  return null;
}

function libraryPathForBinary(binPath) {
  const dir = path.dirname(binPath);
  const parts = [dir, path.join(dir, 'lib'), path.join(dir, '..', 'lib')].filter((d) => {
    try { return fs.existsSync(d); } catch (_) { return false; }
  });
  return [...parts, process.env.LD_LIBRARY_PATH || ''].filter(Boolean).join(':');
}

function spawnEnvForBinary(binPath) {
  const env = { ...process.env };
  if (process.platform === 'linux' || process.platform === 'darwin') {
    env.LD_LIBRARY_PATH = libraryPathForBinary(binPath);
    if (process.platform === 'darwin') env.DYLD_LIBRARY_PATH = libraryPathForBinary(binPath);
  }
  return env;
}

async function ensureBinaryTool({ asset, urlBase, destDir, binaryNames, markerFile, onProgress, signal, archiveName }) {
  const platform = detectPlatformKey();
  if (!platform || !asset) throw new Error('Unsupported platform for llama.cpp binaries');
  const marker = path.join(destDir, markerFile);
  if (fs.existsSync(marker)) {
    try {
      const binPath = fs.readFileSync(marker, 'utf8').trim();
      if (binPath && fs.existsSync(binPath)) return binPath;
    } catch (_) {}
  }
  mkdirp(destDir);
  const fileName = archiveName || asset.name;
  const archivePath = path.join(destDir, fileName);
  const url = `${urlBase}/${fileName}`;
  if (onProgress) onProgress(0, `Downloading ${asset.name}…`);
  await downloadFile(url, archivePath, (p) => { if (onProgress) onProgress(p * 0.85, null); }, signal);
  if (onProgress) onProgress(0.88, 'Extracting…');
  extractArchive(archivePath, destDir, asset.extract);
  const bin = findExecutable(destDir, binaryNames);
  if (!bin) throw new Error(`Binary not found after extract: ${binaryNames.join(', ')}`);
  try { fs.chmodSync(bin, 0o755); } catch (_) {}
  fs.writeFileSync(marker, bin, 'utf8');
  try { fs.unlinkSync(archivePath); } catch (_) {}
  if (onProgress) onProgress(1, 'Ready');
  return bin;
}

function parseModelShorthand(modelName) {
  const raw = String(modelName || '').trim();
  if (!raw) {
    return { modelId: DEFAULT_CHAT_MODEL_ID, modelFile: DEFAULT_CHAT_MODEL_FILE };
  }
  if (raw.includes(':')) {
    const idx = raw.indexOf(':');
    return { modelId: raw.slice(0, idx), modelFile: raw.slice(idx + 1) };
  }
  if (raw.includes('/') && raw.toLowerCase().endsWith('.gguf')) {
    const idx = raw.lastIndexOf('/');
    return { modelId: raw.slice(0, idx), modelFile: raw.slice(idx + 1) };
  }
  return { modelId: DEFAULT_CHAT_MODEL_ID, modelFile: DEFAULT_CHAT_MODEL_FILE };
}

async function ensureChatModel(modelName, userDataDir, onProgress, signal) {
  const { modelId, modelFile } = parseModelShorthand(modelName);
  const dir = chatModelsDir(userDataDir);
  mkdirp(dir);
  const dest = path.join(dir, modelFile);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1024 * 1024) return dest;
  const url = `https://huggingface.co/${modelId}/resolve/main/${modelFile}`;
  if (onProgress) onProgress(0, `Downloading ${modelFile}…`);
  await downloadFile(url, dest, (p) => { if (onProgress) onProgress(p, null); }, signal);
  return dest;
}

async function ensureLlamaServerBinary(userDataDir, onProgress, signal) {
  const platform = detectPlatformKey();
  const asset = LLAMA_ASSETS[platform];
  return ensureBinaryTool({
    asset,
    urlBase: `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_RELEASE}`,
    destDir: llamaBinRoot(userDataDir),
    binaryNames: process.platform === 'win32' ? ['llama-server.exe', 'llama-server'] : ['llama-server'],
    markerFile: '.llama-server-path',
    archiveName: asset.name,
    onProgress,
    signal,
  });
}

function systemMemoryGb() {
  try {
    return os.totalmem() / (1024 ** 3);
  } catch (_) {
    return 8;
  }
}

function defaultThreadCount() {
  const cores = os.cpus().length || 4;
  const memGb = systemMemoryGb();
  /* Scale threads with hardware; leave headroom so Electron UI stays responsive. */
  if (cores <= 4 || memGb < 6) {
    return Math.max(2, Math.min(3, Math.max(1, cores - 1)));
  }
  if (cores <= 8 || memGb < 12) {
    return Math.max(3, Math.min(5, cores - 2));
  }
  return Math.max(4, Math.min(6, cores - 2));
}

function defaultPromptBatchSize() {
  const memGb = systemMemoryGb();
  if (memGb < 6) return 256;
  if (memGb < 12) return 384;
  return 512;
}

function whisperThreadCount() {
  return Math.max(1, Math.min(2, defaultThreadCount() - 1));
}

function isFileReady(filePath, minBytes = 1024 * 1024) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).size >= minBytes;
  } catch (_) {
    return false;
  }
}

module.exports = {
  LLAMA_RELEASE,
  DEFAULT_CHAT_MODEL_ID,
  DEFAULT_CHAT_MODEL_FILE,
  DEFAULT_CHAT_MODEL,
  detectPlatformKey,
  resolveUserDataDir,
  llamaBinRoot,
  chatModelsDir,
  ensureLlamaServerBinary,
  ensureChatModel,
  isFileReady,
  parseModelShorthand,
  findExecutable,
  spawnEnvForBinary,
  defaultThreadCount,
  defaultPromptBatchSize,
  whisperThreadCount,
  beginDownloadSession,
  abortActiveDownload,
  clearDownloadSession,
  downloadFile,
};
