/**
 * Desktop STT via whisper.cpp — auto-downloads binary + ggml-small (~466 MB).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync, spawn } = require('child_process');
const {
  resolveUserDataDir,
  detectPlatformKey,
  findExecutable,
  spawnEnvForBinary,
  whisperThreadCount,
  isFileReady,
  downloadFile,
} = require('./electron-llama-bin.cjs');

const WHISPER_RELEASE = 'v1.9.1';
const WHISPER_MODEL_FILE = 'ggml-small.bin';
const WHISPER_MODEL_MIN_BYTES = 400 * 1024 * 1024;
const WHISPER_EST_MB = 466;
const WHISPER_MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${WHISPER_MODEL_FILE}`;

const WHISPER_ASSETS = {
  'linux-x64': { name: 'whisper-bin-ubuntu-x64.tar.gz', extract: 'tar' },
  'linux-arm64': { name: 'whisper-bin-ubuntu-arm64.tar.gz', extract: 'tar' },
  'win32-x64': { name: 'whisper-bin-x64.zip', extract: 'zip' },
};

const DARWIN_CLI_CANDIDATES = [
  '/opt/homebrew/bin/whisper-cli',
  '/usr/local/bin/whisper-cli',
  '/opt/homebrew/bin/whisper-cpp',
  '/usr/local/bin/whisper-cpp',
];

function getAppRef() {
  try { return require('electron').app; } catch (_) { return null; }
}

function userDataDir() {
  return resolveUserDataDir(getAppRef());
}

function whisperBinDir() {
  return path.join(userDataDir(), 'sage-voice-bin', 'whisper');
}

function whisperModelsDir() {
  return path.join(userDataDir(), 'whisper-models');
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function isDeprecatedWhisperBin(binPath) {
  if (!binPath) return true;
  const base = path.basename(String(binPath)).toLowerCase();
  return base === 'main';
}

function readMarkerBin(markerPath) {
  try {
    const p = fs.readFileSync(markerPath, 'utf8').trim();
    if (!p || !fs.existsSync(p) || isDeprecatedWhisperBin(p)) return null;
    return p;
  } catch (_) {
    return null;
  }
}

function filterWhisperStderr(stderr) {
  return String(stderr || '')
    .split('\n')
    .filter((line) => !/deprecated|whisper-cli instead/i.test(line))
    .join('\n')
    .trim();
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

function resolveDarwinWhisperCli() {
  for (const p of DARWIN_CLI_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function ensureWhisperCli(onProgress, signal) {
  const marker = path.join(whisperBinDir(), '.whisper-cli-path');
  let cached = readMarkerBin(marker);
  if (cached) return cached;
  if (fs.existsSync(marker)) {
    try { fs.unlinkSync(marker); } catch (_) {}
  }

  if (process.platform === 'darwin') {
    const brewCli = resolveDarwinWhisperCli();
    if (brewCli) {
      mkdirp(whisperBinDir());
      fs.writeFileSync(marker, brewCli, 'utf8');
      return brewCli;
    }
    throw new Error('Whisper STT on macOS requires whisper-cli (brew install whisper-cpp) until a bundled binary is available');
  }

  const platform = detectPlatformKey();
  const asset = WHISPER_ASSETS[platform];
  if (!platform || !asset) throw new Error('Unsupported platform for Whisper STT');

  mkdirp(whisperBinDir());
  const archivePath = path.join(whisperBinDir(), asset.name);
  const url = `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_RELEASE}/${asset.name}`;
  if (onProgress) onProgress(0, `Descargando whisper.cpp…`);
  await downloadFile(url, archivePath, (p) => {
    if (onProgress) onProgress(p * 0.85, null);
  }, signal);
  if (signal?.aborted) {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    throw err;
  }
  if (onProgress) onProgress(0.88, 'Extrayendo whisper.cpp…');
  extractArchive(archivePath, whisperBinDir(), asset.extract);
  const bin = findExecutable(whisperBinDir(), ['whisper-cli', 'whisper-cli.exe', 'whisper.exe']);
  if (!bin || isDeprecatedWhisperBin(bin)) throw new Error('whisper-cli not found after extract');
  try { fs.chmodSync(bin, 0o755); } catch (_) {}
  fs.writeFileSync(marker, bin, 'utf8');
  try { fs.unlinkSync(archivePath); } catch (_) {}
  if (onProgress) onProgress(1, 'Listo');
  return bin;
}

async function ensureWhisperModel(onProgress, signal) {
  const dir = whisperModelsDir();
  const modelPath = path.join(dir, WHISPER_MODEL_FILE);
  if (isFileReady(modelPath, WHISPER_MODEL_MIN_BYTES)) return modelPath;
  mkdirp(dir);
  if (onProgress) onProgress(0, `Descargando Whisper small (~${WHISPER_EST_MB} MB)…`);
  await downloadFile(WHISPER_MODEL_URL, modelPath, (p) => {
    if (onProgress) onProgress(p, null);
  }, signal);
  return modelPath;
}

function cleanWhisperText(raw) {
  let t = String(raw || '').trim();
  t = t.replace(/\[[^\]]*\]/g, '').trim();
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t;
}

function isWhisperReady(ud = userDataDir()) {
  const cliMarker = path.join(ud, 'sage-voice-bin', 'whisper', '.whisper-cli-path');
  const cli = readMarkerBin(cliMarker) || (process.platform === 'darwin' ? resolveDarwinWhisperCli() : null);
  const modelPath = path.join(ud, 'whisper-models', WHISPER_MODEL_FILE);
  return !!cli && isFileReady(modelPath, WHISPER_MODEL_MIN_BYTES);
}

async function prefetchWhisperAssets(onProgress, signal) {
  if (isWhisperReady()) return { ok: true, skipped: true };
  await ensureWhisperCli((p, msg) => {
    if (onProgress) onProgress(typeof p === 'number' ? p * 0.35 : null, msg || null);
  }, signal);
  if (signal?.aborted) {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    throw err;
  }
  await ensureWhisperModel((p, msg) => {
    if (onProgress) onProgress(0.35 + (typeof p === 'number' ? p * 0.65 : 0), msg || null);
  }, signal);
  return { ok: true };
}

/** @type {import('child_process').ChildProcess|null} */
let activeWhisperProc = null;

function abortActiveWhisper() {
  if (activeWhisperProc) {
    try { activeWhisperProc.kill('SIGTERM'); } catch (_) {}
    activeWhisperProc = null;
  }
}

async function transcribeWithWhisper(wavPath, locale, onProgress, signal) {
  if (onProgress) onProgress(0, `Descargando Whisper (~${WHISPER_EST_MB} MB)…`);
  const cli = await ensureWhisperCli(onProgress, signal);
  const modelPath = await ensureWhisperModel(onProgress, signal);
  if (signal?.aborted) {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    throw err;
  }

  const lang = locale === 'de' ? 'de' : (locale === 'en' ? 'en' : 'es');
  const outPrefix = path.join(os.tmpdir(), `arborito-whisper-${Date.now()}`);
  const outTxt = `${outPrefix}.txt`;
  if (onProgress) onProgress(0.92, 'Transcribiendo audio…');

  const env = spawnEnvForBinary(cli);
  const args = [
    '-m', modelPath,
    '-f', wavPath,
    '-l', lang,
    '-nt',
    '-np',
    '-sns',
    '-otxt',
    '-of', outPrefix,
    '-t', String(whisperThreadCount()),
  ];

  return new Promise((resolve) => {
    let stderr = '';
    const onAbort = () => abortActiveWhisper();
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    activeWhisperProc = spawn(cli, args, {
      env,
      cwd: path.dirname(cli),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    activeWhisperProc.stderr.on('data', (d) => { stderr += String(d); });
    activeWhisperProc.on('error', (err) => {
      activeWhisperProc = null;
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve({ ok: false, error: String(err && err.message ? err.message : err) });
    });
    activeWhisperProc.on('close', (code) => {
      activeWhisperProc = null;
      if (signal) signal.removeEventListener('abort', onAbort);
      if (signal?.aborted) {
        resolve({ ok: false, error: 'Aborted' });
        return;
      }
      try {
        if (code !== 0 || !fs.existsSync(outTxt)) {
          const err = filterWhisperStderr(stderr || 'Whisper failed');
          resolve({ ok: false, error: err || 'Whisper produced no text' });
          return;
        }
        const text = cleanWhisperText(fs.readFileSync(outTxt, 'utf8'));
        if (onProgress) onProgress(1, 'Listo');
        resolve(text ? { ok: true, text } : { ok: false, error: 'Empty transcription' });
      } finally {
        try { fs.unlinkSync(outTxt); } catch (_) {}
        try { fs.unlinkSync(`${outPrefix}.srt`); } catch (_) {}
        try { fs.unlinkSync(`${outPrefix}.vtt`); } catch (_) {}
        try { fs.unlinkSync(`${outPrefix}.json`); } catch (_) {}
      }
    });
  });
}

module.exports = {
  WHISPER_EST_MB,
  WHISPER_MODEL_FILE,
  isWhisperReady,
  ensureWhisperCli,
  ensureWhisperModel,
  prefetchWhisperAssets,
  transcribeWithWhisper,
  abortActiveWhisper,
};
