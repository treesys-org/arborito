/**
 * On-disk layout under Electron userData (~/.config/Arborito on Linux).
 * Frozen trees and offline games are plain files users can copy individually.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { resolveUserDataDir } = require('./electron-llama-bin.cjs');

const README = `Arborito — datos en tu equipo
================================

Carpetas que puedes copiar o respaldar por separado:

  frozen-trees/     Árboles de red congelados (un .json por árbol)
  offline-games/    Juegos del Arcade congelados (una carpeta por juego)
  llamacpp-models/  Modelos de chat Sage (IA privada)
  whisper-models/   Modelo de micrófono Sage
  piper-voices/     Voces del lector
  sage-voice-bin/   Binarios de voz (no copiar a mano salvo que sepas)

Progreso, jardín local y ajustes: dentro de la app (Perfil → exportar)
o en el almacenamiento del navegador embebido (no son archivos sueltos aquí).

Más: docs/USER_DATA_LAYOUT.md en el repositorio Arborito.
`;

function sanitizeId(id) {
    return String(id || 'item')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .slice(0, 120) || 'item';
}

function userDataRoot(appRef) {
    return resolveUserDataDir(appRef);
}

function ensureLayout(appRef) {
    const root = userDataRoot(appRef);
    for (const sub of ['frozen-trees', 'offline-games']) {
        fs.mkdirSync(path.join(root, sub), { recursive: true });
    }
    const readmePath = path.join(root, 'README.txt');
    try {
        fs.writeFileSync(readmePath, README, 'utf8');
    } catch {
        /* ignore */
    }
    return root;
}

function frozenTreeFile(root, sourceId) {
    return path.join(root, 'frozen-trees', `${sanitizeId(sourceId)}.json`);
}

function offlineGameDir(root, gameId) {
    return path.join(root, 'offline-games', sanitizeId(gameId));
}

function readJsonFile(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
}

function writeJsonFile(filePath, obj) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
}

function registerUserDataIpc(ipcMain, appRef, isTrusted) {
    ensureLayout(appRef);

    ipcMain.handle('arborito-ud-layout', async (event) => {
        if (!isTrusted(event)) return { ok: false, error: 'Untrusted caller' };
        const root = ensureLayout(appRef);
        return {
            ok: true,
            root,
            frozenTreesDir: path.join(root, 'frozen-trees'),
            offlineGamesDir: path.join(root, 'offline-games'),
        };
    });

    ipcMain.handle('arborito-ud-frozen-tree-get', async (event, sourceId) => {
        if (!isTrusted(event)) return null;
        const root = ensureLayout(appRef);
        try {
            return readJsonFile(frozenTreeFile(root, sourceId));
        } catch {
            return null;
        }
    });

    ipcMain.handle('arborito-ud-frozen-tree-put', async (event, sourceId, payload) => {
        if (!isTrusted(event)) return false;
        const root = ensureLayout(appRef);
        try {
            writeJsonFile(frozenTreeFile(root, sourceId), { sourceId, ...payload });
            return true;
        } catch {
            return false;
        }
    });

    ipcMain.handle('arborito-ud-frozen-tree-remove', async (event, sourceId) => {
        if (!isTrusted(event)) return false;
        const root = ensureLayout(appRef);
        const fp = frozenTreeFile(root, sourceId);
        try {
            if (fs.existsSync(fp)) fs.unlinkSync(fp);
            return true;
        } catch {
            return false;
        }
    });

    ipcMain.handle('arborito-ud-offline-game-get', async (event, gameId) => {
        if (!isTrusted(event)) return null;
        const root = ensureLayout(appRef);
        const fp = path.join(offlineGameDir(root, gameId), 'bundle.json');
        try {
            return readJsonFile(fp);
        } catch {
            return null;
        }
    });

    ipcMain.handle('arborito-ud-offline-game-put', async (event, gameId, bundle) => {
        if (!isTrusted(event)) return false;
        const root = ensureLayout(appRef);
        const dir = offlineGameDir(root, gameId);
        try {
            writeJsonFile(path.join(dir, 'bundle.json'), { gameId, ...bundle });
            return true;
        } catch {
            return false;
        }
    });

    ipcMain.handle('arborito-ud-offline-game-remove', async (event, gameId) => {
        if (!isTrusted(event)) return false;
        const root = ensureLayout(appRef);
        const dir = offlineGameDir(root, gameId);
        try {
            fs.rmSync(dir, { recursive: true, force: true });
            return true;
        } catch {
            return false;
        }
    });
}

module.exports = {
    ensureLayout,
    registerUserDataIpc,
    userDataRoot,
};
