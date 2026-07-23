/**
 * Stable Electron profile path — must not change when display name / desktop id changes.
 * Progress (Chromium localStorage) lives under userData.
 *
 * Flatpak: use XDG_CONFIG_HOME (~/.var/app/<id>/config/), not host ~/.config/.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/** Folder name under the config dir (Linux), unchanged since first npm start builds. */
const USER_DATA_BASENAME = 'arborito';

function isFlatpak() {
  return Boolean(process.env.FLATPAK_ID);
}

/** ~/.var/app/org.treesys.arborito/config/arborito when sandboxed. */
function flatpakUserDataDir() {
  const configHome =
    process.env.XDG_CONFIG_HOME ||
    path.join(os.homedir(), '.var', 'app', process.env.FLATPAK_ID, 'config');
  return path.join(configHome, USER_DATA_BASENAME);
}

function userDataCandidates() {
  const home = os.homedir();
  if (process.platform === 'linux' && isFlatpak()) {
    return [flatpakUserDataDir()];
  }
  if (process.platform === 'win32') {
    const roaming = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return [path.join(roaming, USER_DATA_BASENAME), path.join(roaming, 'Arborito')];
  }
  if (process.platform === 'darwin') {
    const base = path.join(home, 'Library', 'Application Support');
    return [path.join(base, USER_DATA_BASENAME), path.join(base, 'Arborito')];
  }
  return [path.join(home, '.config', USER_DATA_BASENAME), path.join(home, '.config', 'Arborito')];
}

function dirLooksLikeProfile(dir) {
  if (!fs.existsSync(dir)) return false;
  try {
    const entries = fs.readdirSync(dir);
    return entries.some((name) =>
      ['Local Storage', 'IndexedDB', 'frozen-trees', 'offline-games', 'Preferences', 'Session Storage'].includes(
        name,
      ),
    );
  } catch {
    return false;
  }
}

/** Pick existing profile dir; default to stable lowercase `arborito`. */
function resolveStableUserDataDir() {
  if (process.env.ARBORITO_USER_DATA) return process.env.ARBORITO_USER_DATA;
  if (process.platform === 'linux' && isFlatpak()) {
    return flatpakUserDataDir();
  }
  const [canonical, ...legacy] = userDataCandidates();
  for (const dir of userDataCandidates()) {
    if (dirLooksLikeProfile(dir)) return dir;
  }
  for (const dir of legacy) {
    if (fs.existsSync(dir)) return dir;
  }
  return canonical;
}

/** Chromium temp under Flatpak cache (~/.var/app/<id>/cache/). */
function resolveChromiumTempDir() {
  if (process.env.ARBORITO_CHROMIUM_TMP) return process.env.ARBORITO_CHROMIUM_TMP;
  if (isFlatpak() && process.env.XDG_CACHE_HOME) {
    return path.join(process.env.XDG_CACHE_HOME, USER_DATA_BASENAME, 'chromium-tmp');
  }
  if (process.env.XDG_CACHE_HOME) {
    return path.join(process.env.XDG_CACHE_HOME, USER_DATA_BASENAME, 'chromium-tmp');
  }
  return path.join(os.homedir(), '.cache', USER_DATA_BASENAME, 'chromium-tmp');
}

module.exports = {
  USER_DATA_BASENAME,
  isFlatpak,
  flatpakUserDataDir,
  userDataCandidates,
  resolveStableUserDataDir,
  resolveChromiumTempDir,
};
