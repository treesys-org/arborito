'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function spawnOk(command, args) {
  const r = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 180000,
  });
  if (!r.error && r.status === 0) return { ok: true };
  const detail = (r.stderr || r.stdout || (r.error && r.error.message) || '').trim();
  return { ok: false, detail };
}

function winSystem32(rel) {
  const root = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  return path.join(root, 'System32', rel);
}

function psQuote(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

function moveExtractedTree(fromDir, destDir) {
  mkdirp(destDir);
  for (const name of fs.readdirSync(fromDir)) {
    const from = path.join(fromDir, name);
    const to = path.join(destDir, name);
    try {
      if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true });
    } catch (_) {}
    fs.renameSync(from, to);
  }
}

function extractZipWindows(archivePath, destDir) {
  const tarPath = winSystem32('tar.exe');
  if (fs.existsSync(tarPath)) {
    const tar = spawnOk(tarPath, ['--force-local', '-xf', archivePath, '-C', destDir]);
    if (tar.ok) return;
  }

  const tmp = `${destDir}.extract-${process.pid}-${Date.now()}`;
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  mkdirp(tmp);

  const psPath = path.join(
    process.env.SystemRoot || process.env.windir || 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe'
  );
  const ps = spawnOk(fs.existsSync(psPath) ? psPath : 'powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-Command',
    [
      '$ErrorActionPreference = "Stop"',
      'Add-Type -AssemblyName System.IO.Compression.FileSystem',
      `[System.IO.Compression.ZipFile]::ExtractToDirectory(${psQuote(archivePath)}, ${psQuote(tmp)})`,
    ].join('; '),
  ]);
  if (ps.ok) {
    moveExtractedTree(tmp, destDir);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
    return;
  }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  throw new Error((ps.detail || 'zip extract failed').trim());
}

function extractArchive(archivePath, destDir, kind) {
  mkdirp(destDir);
  if (kind === 'tar') {
    const r = spawnOk('tar', ['-xzf', archivePath, '-C', destDir]);
    if (!r.ok) throw new Error((r.detail || 'tar extract failed').trim());
    return;
  }
  const unzip = spawnOk('unzip', ['-o', archivePath, '-d', destDir]);
  if (unzip.ok) return;
  if (process.platform === 'win32') {
    extractZipWindows(archivePath, destDir);
    return;
  }
  const tar = spawnOk('tar', ['-xf', archivePath, '-C', destDir]);
  if (tar.ok) return;
  throw new Error((unzip.detail || tar.detail || 'zip extract failed').trim());
}

module.exports = { extractArchive };
