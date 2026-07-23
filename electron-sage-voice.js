/**
 * Desktop Sage voice stack — fully automatic downloads, no manual installs.
 *  - STT: whisper.cpp + ggml-small (~466 MB).
 *  - TTS: Piper neural voices (~20 MB per locale).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { app } = require('electron');
const {
  resolveUserDataDir,
  isFileReady,
  downloadFile,
  spawnEnvForBinary,
} = require('./electron-llama-bin.cjs');
const {
  WHISPER_EST_MB,
  isWhisperReady,
  prefetchWhisperAssets,
  transcribeWithWhisper,
  abortActiveWhisper,
} = require('./electron-whisper-stt.cjs');

/** @type {AbortController|null} */
let voiceDownloadAbort = null;
/** @type {AbortController|null} */
let transcribeAbort = null;
/** @type {AbortController|null} */
let ttsAbort = null;

function beginVoiceDownloadSession() {
  if (voiceDownloadAbort) {
    try { voiceDownloadAbort.abort(); } catch (_) {}
  }
  voiceDownloadAbort = new AbortController();
  return voiceDownloadAbort.signal;
}

function abortVoiceDownload() {
  if (voiceDownloadAbort) {
    try { voiceDownloadAbort.abort(); } catch (_) {}
    voiceDownloadAbort = null;
  }
}

function abortTranscribe() {
  abortActiveWhisper();
  if (transcribeAbort) {
    try { transcribeAbort.abort(); } catch (_) {}
    transcribeAbort = null;
  }
}

function abortTts() {
  if (ttsAbort) {
    try { ttsAbort.abort(); } catch (_) {}
    ttsAbort = null;
  }
}

function beginTtsSession() {
  abortTts();
  ttsAbort = new AbortController();
  return ttsAbort.signal;
}

function abortAllVoiceOperations() {
  abortVoiceDownload();
  abortTranscribe();
  abortTts();
}

function clearVoiceDownloadSession() {
  voiceDownloadAbort = null;
}

const PIPER_RELEASE = '2023.11.14-2';
const PIPER_VOICE_EST_MB = 20;

/** @type {Map<string, { base: string, file: string }>} */
const PIPER_VOICES = new Map([
  ['de', { base: 'de/de_DE/eva_k/x_low', file: 'de_DE-eva_k-x_low' }],
  ['en', { base: 'en/en_US/lessac/low', file: 'en_US-lessac-low' }],
  ['es', { base: 'es/es_ES/carlfm/x_low', file: 'es_ES-carlfm-x_low' }],
]);

function userDataDir() {
  return resolveUserDataDir(app);
}

function binRoot() {
  return path.join(userDataDir(), 'sage-voice-bin');
}

function piperBinDir() {
  return path.join(binRoot(), 'piper');
}

function piperVoicesDir() {
  return path.join(userDataDir(), 'piper-voices');
}

const PIPER_ASSETS = {
  'linux-x64': { name: 'piper_linux_x86_64.tar.gz', extract: 'tar' },
  'linux-arm64': { name: 'piper_linux_aarch64.tar.gz', extract: 'tar' },
  'darwin-arm64': { name: 'piper_macos_aarch64.tar.gz', extract: 'tar' },
  'darwin-x64': { name: 'piper_macos_x64.tar.gz', extract: 'tar' },
  'win32-x64': { name: 'piper_windows_amd64.zip', extract: 'zip' },
};

function detectPlatformKey() {
  const arch = process.arch;
  if (process.platform === 'linux' && arch === 'x64') return 'linux-x64';
  if (process.platform === 'linux' && arch === 'arm64') return 'linux-arm64';
  if (process.platform === 'darwin' && arch === 'arm64') return 'darwin-arm64';
  if (process.platform === 'darwin' && arch === 'x64') return 'darwin-x64';
  if (process.platform === 'win32' && arch === 'x64') return 'win32-x64';
  return null;
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
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

async function ensureBinaryTool({ asset, urlBase, destDir, binaryNames, markerFile, onProgress, signal }) {
  const platform = detectPlatformKey();
  if (!platform || !asset) throw new Error('Unsupported platform for voice tools');
  const marker = path.join(destDir, markerFile);
  if (fs.existsSync(marker)) {
    try {
      const binPath = fs.readFileSync(marker, 'utf8').trim();
      if (binPath && fs.existsSync(binPath)) return binPath;
    } catch (_) {}
  }
  mkdirp(destDir);
  const archivePath = path.join(destDir, asset.name);
  const url = `${urlBase}/${asset.name}`;
  if (onProgress) onProgress(0, `Descargando ${asset.name}…`);
  await downloadFile(url, archivePath, (p) => {
    if (onProgress) onProgress(p * 0.85, null);
  }, signal);
  if (signal?.aborted) {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    throw err;
  }
  if (onProgress) onProgress(0.88, 'Extrayendo…');
  extractArchive(archivePath, destDir, asset.extract);
  const bin = findExecutable(destDir, binaryNames);
  if (!bin) throw new Error(`Binary not found after extract: ${binaryNames.join(', ')}`);
  try { fs.chmodSync(bin, 0o755); } catch (_) {}
  fs.writeFileSync(marker, bin, 'utf8');
  try { fs.unlinkSync(archivePath); } catch (_) {}
  if (onProgress) onProgress(1, 'Listo');
  return bin;
}

async function ensurePiperCli(onProgress, signal) {
  const platform = detectPlatformKey();
  const asset = PIPER_ASSETS[platform];
  return ensureBinaryTool({
    asset,
    urlBase: `https://github.com/rhasspy/piper/releases/download/${PIPER_RELEASE}`,
    destDir: piperBinDir(),
    binaryNames: process.platform === 'win32' ? ['piper.exe', 'piper'] : ['piper'],
    markerFile: '.piper-cli-path',
    onProgress,
    signal,
  });
}

async function ensurePiperVoice(locale, onProgress, signal) {
  const key = locale === 'de' || locale === 'en' || locale === 'es' ? locale : 'es';
  const voice = PIPER_VOICES.get(key);
  const dir = path.join(piperVoicesDir(), voice.file);
  const onnxPath = path.join(dir, `${voice.file}.onnx`);
  const jsonPath = path.join(dir, `${voice.file}.onnx.json`);
  if (fs.existsSync(onnxPath) && fs.existsSync(jsonPath)) {
    return { onnxPath, jsonPath };
  }
  mkdirp(dir);
  const hfBase = `https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/${voice.base}`;
  if (onProgress) onProgress(0, `Descargando voz ${voice.file}…`);
  await downloadFile(`${hfBase}/${voice.file}.onnx`, onnxPath, (p) => {
    if (onProgress) onProgress(p * 0.5, null);
  }, signal);
  if (signal?.aborted) {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    throw err;
  }
  await downloadFile(`${hfBase}/${voice.file}.onnx.json`, jsonPath, (p) => {
    if (onProgress) onProgress(0.5 + p * 0.5, null);
  }, signal);
  return { onnxPath, jsonPath };
}

function extractArchive(archivePath, destDir, kind) {
  mkdirp(destDir);
  if (kind === 'tar') {
    const r = spawnSync('tar', ['-xzf', archivePath, '-C', destDir], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'tar extract failed').trim());
    return;
  }
  if (kind === 'zip') {
    const r = spawnSync('unzip', ['-o', archivePath, '-d', destDir], { encoding: 'utf8' });
    if (r.status !== 0) {
      const ps = spawnSync('powershell', [
        '-NoProfile', '-Command',
        `Expand-Archive -Path '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
      ], { encoding: 'utf8' });
      if (ps.status !== 0) throw new Error((ps.stderr || ps.stdout || 'zip extract failed').trim());
    }
  }
}

function isValidWavBuffer(buf) {
  if (!buf || buf.length < 1000) return false;
  return buf.slice(0, 4).toString('ascii') === 'RIFF'
    && buf.slice(8, 12).toString('ascii') === 'WAVE';
}

function beginTranscribeSession() {
  abortTranscribe();
  transcribeAbort = new AbortController();
  return transcribeAbort.signal;
}

function filterPiperStderr(stderr) {
  return String(stderr || '')
    .split('\n')
    .filter((line) => /\[(error|warn)\]/i.test(line) || (/error|failed/i.test(line) && !/\[info\]/i.test(line)))
    .join('\n')
    .trim();
}

function runPiperSynth(cli, onnxPath, jsonPath, outPath, text) {
  const plain = String(text || '').trim();
  if (!plain) return { ok: false, error: 'No text' };
  const env = spawnEnvForBinary(cli);
  const cwd = path.dirname(cli);
  const args = ['--model', onnxPath, '--config', jsonPath, '--output_file', outPath];
  const r = spawnSync(cli, args, {
    input: `${plain}\n`,
    env,
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) return { ok: false, error: String(r.error.message || r.error) };
  if (!fs.existsSync(outPath)) {
    return { ok: false, error: filterPiperStderr(r.stderr) || `Piper exit ${r.status}` };
  }
  const wav = fs.readFileSync(outPath);
  if (!isValidWavBuffer(wav)) return { ok: false, error: 'WAV inválido' };
  return { ok: true, wav };
}

async function synthesizeWithPiper(text, locale, onProgress, signal) {
  let plain = String(text || '').trim();
  if (!plain) return { ok: false, error: 'No text' };
  if (plain.length > 2000) {
    plain = plain.slice(0, 2000).replace(/\s+\S*$/, '').trim();
  }
  if (onProgress) onProgress(0, `Descargando voz Piper (~${PIPER_VOICE_EST_MB} MB)…`);
  if (signal?.aborted) return { ok: false, error: 'Aborted' };
  const cli = await ensurePiperCli(onProgress, signal);
  const { onnxPath, jsonPath } = await ensurePiperVoice(locale, onProgress, signal);
  const outPath = path.join(os.tmpdir(), `arborito-tts-${Date.now()}.wav`);
  try {
    if (onProgress) onProgress(0.95, 'Sintetizando voz…');
    const result = await runPiperSynth(cli, onnxPath, jsonPath, outPath, plain);
    if (!result.ok) return { ok: false, error: result.error };
    if (onProgress) onProgress(1, 'Listo');
    return { ok: true, base64: result.wav.toString('base64'), mimeType: 'audio/wav' };
  } finally {
    try { fs.unlinkSync(outPath); } catch (_) {}
  }
}

function readMarkerBin(markerPath) {
  try {
    const p = fs.readFileSync(markerPath, 'utf8').trim();
    return p && fs.existsSync(p) ? p : null;
  } catch (_) {
    return null;
  }
}

function getVoiceAssetStatus(locale = 'es') {
  const ud = userDataDir();
  const key = locale === 'de' || locale === 'en' || locale === 'es' ? locale : 'es';
  const voice = PIPER_VOICES.get(key);
  const whisperReady = isWhisperReady(ud);
  const piperReady = !!readMarkerBin(path.join(piperBinDir(), '.piper-cli-path'));
  const onnxPath = path.join(piperVoicesDir(), voice.file, `${voice.file}.onnx`);
  const jsonPath = path.join(piperVoicesDir(), voice.file, `${voice.file}.onnx.json`);
  const piperVoiceReady = isFileReady(onnxPath, 1024) && fs.existsSync(jsonPath);

  const missingStt = [];
  if (!whisperReady) missingStt.push('whisper');
  const missingTts = [];
  if (!piperReady) missingTts.push('piper');
  if (!piperVoiceReady) missingTts.push('piper_voice');

  const needsSttDownload = !whisperReady;
  const needsTtsDownload = missingTts.length > 0;

  return {
    sttReady: whisperReady,
    ttsReady: piperReady && piperVoiceReady,
    ready: whisperReady,
    missingStt,
    missingTts,
    needsSttDownload,
    needsTtsDownload,
    sttEstMb: WHISPER_EST_MB,
    piperVoiceEstMb: PIPER_VOICE_EST_MB,
    needsDownload: needsSttDownload || needsTtsDownload,
  };
}

async function prefetchPiperAssets(locale = 'es', onProgress, signal) {
  const key = locale === 'de' || locale === 'en' || locale === 'es' ? locale : 'es';
  const voice = PIPER_VOICES.get(key);
  const status = getVoiceAssetStatus(key);
  if (status.ttsReady) return { ok: true, skipped: true };
  if (onProgress) onProgress(0, `Descargando voz Piper (~${PIPER_VOICE_EST_MB} MB)…`);
  await ensurePiperCli((p, msg) => {
    if (onProgress) onProgress(typeof p === 'number' ? p * 0.35 : null, msg || null);
  }, signal);
  if (signal?.aborted) {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    throw err;
  }
  if (onProgress) onProgress(0.4, `Descargando ${voice.file}…`);
  await ensurePiperVoice(key, (p, msg) => {
    if (onProgress) onProgress(0.4 + (typeof p === 'number' ? p * 0.6 : 0), msg || null);
  }, signal);
  return { ok: true };
}

function voiceProgressMessage(phase, progress, message) {
  if (message && typeof message === 'string' && message.trim()) {
    return message.replace(/\s*[\(\[]?\s*\d+\s*%[\)\]]?\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  }
  if (phase === 'tts') return 'Voice synthesis…';
  return 'Transcribing with Whisper…';
}

function registerSageVoiceIpc(ipcMain, isTrustedRenderer) {
  ipcMain.handle('arborito-sage-voice-status', async (event, opts = {}) => {
    if (!isTrustedRenderer(event)) return { ok: false, error: 'Untrusted caller' };
    try {
      const locale = opts && opts.locale ? String(opts.locale) : 'es';
      return { ok: true, ...getVoiceAssetStatus(locale) };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  });

  ipcMain.handle('arborito-sage-voice-abort', async (event) => {
    if (!isTrustedRenderer(event)) return { ok: false };
    abortAllVoiceOperations();
    return { ok: true };
  });

  ipcMain.handle('arborito-sage-voice-abort-tts', async (event) => {
    if (!isTrustedRenderer(event)) return { ok: false };
    abortTts();
    return { ok: true };
  });

  ipcMain.handle('arborito-sage-voice-prefetch-stt', async (event, opts = {}) => {
    if (!isTrustedRenderer(event)) return { ok: false, error: 'Untrusted caller' };
    const sender = event.sender;
    const signal = beginVoiceDownloadSession();
    const onProgress = (progress, message) => {
      try {
        sender.send('arborito-sage-voice-progress', {
          phase: 'stt',
          progress,
          message: voiceProgressMessage('stt', progress, message),
        });
      } catch (_) {}
    };
    try {
      const result = await prefetchWhisperAssets(onProgress, signal);
      clearVoiceDownloadSession();
      return result;
    } catch (e) {
      clearVoiceDownloadSession();
      if (e && e.name === 'AbortError') return { ok: false, error: 'Aborted' };
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  });

  ipcMain.handle('arborito-sage-transcribe-audio', async (event, opts) => {
    if (!isTrustedRenderer(event)) return { ok: false, error: 'Untrusted caller' };
    const base64 = opts && typeof opts.base64 === 'string' ? opts.base64 : '';
    const locale = opts && opts.locale ? String(opts.locale) : 'es';
    if (!base64) return { ok: false, error: 'No audio payload' };
    const tmpPath = path.join(os.tmpdir(), `arborito-voice-${Date.now()}.wav`);
    const sender = event.sender;
    const signal = beginTranscribeSession();
    const onProgress = (progress, message) => {
      try {
        sender.send('arborito-sage-voice-progress', {
          phase: 'stt',
          progress,
          message: voiceProgressMessage('stt', progress, message),
        });
      } catch (_) {}
    };
    try {
      fs.writeFileSync(tmpPath, Buffer.from(base64, 'base64'));
      const result = await transcribeWithWhisper(tmpPath, locale, onProgress, signal);
      transcribeAbort = null;
      return result;
    } catch (e) {
      transcribeAbort = null;
      if (e && e.name === 'AbortError') return { ok: false, error: 'Aborted' };
      return { ok: false, error: String(e && e.message ? e.message : e) };
    } finally {
      try { fs.unlinkSync(tmpPath); } catch (_) {}
    }
  });

  ipcMain.handle('arborito-sage-voice-prefetch-tts', async (event, opts = {}) => {
    if (!isTrustedRenderer(event)) return { ok: false, error: 'Untrusted caller' };
    const locale = opts && opts.locale ? String(opts.locale) : 'es';
    const sender = event.sender;
    const signal = beginVoiceDownloadSession();
    const onProgress = (progress, message) => {
      try {
        sender.send('arborito-sage-voice-progress', {
          phase: 'tts',
          progress,
          message: voiceProgressMessage('tts', progress, message),
        });
      } catch (_) {}
    };
    try {
      const result = await prefetchPiperAssets(locale, onProgress, signal);
      clearVoiceDownloadSession();
      return result;
    } catch (e) {
      clearVoiceDownloadSession();
      if (e && e.name === 'AbortError') return { ok: false, error: 'Aborted' };
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  });

  ipcMain.handle('arborito-sage-synthesize-speech', async (event, opts) => {
    if (!isTrustedRenderer(event)) return { ok: false, error: 'Untrusted caller' };
    const text = opts && typeof opts.text === 'string' ? opts.text : '';
    const locale = opts && opts.locale ? String(opts.locale) : 'es';
    const sender = event.sender;
    const signal = beginTtsSession();
    const onProgress = (progress, message) => {
      try {
        sender.send('arborito-sage-voice-progress', {
          phase: 'tts',
          progress,
          message: voiceProgressMessage('tts', progress, message),
        });
      } catch (_) {}
    };
    try {
      const result = await synthesizeWithPiper(text, locale, onProgress, signal);
      ttsAbort = null;
      return result;
    } catch (e) {
      ttsAbort = null;
      if (e && e.name === 'AbortError') return { ok: false, error: 'Aborted' };
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  });
}

module.exports = {
  registerSageVoiceIpc,
  ensurePiperCli,
  getVoiceAssetStatus,
  prefetchPiperAssets,
  PIPER_VOICE_EST_MB,
};
