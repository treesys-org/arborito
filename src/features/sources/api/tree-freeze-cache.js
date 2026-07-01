/**
 * Frozen community trees — desktop files only (~/.config/Arborito/frozen-trees/).
 */
import { isElectronDesktop } from '../../learning/api/electron-bridge.js';

function ud() {
    if (!isElectronDesktop()) return null;
    return typeof window !== 'undefined' ? window.arboritoElectron?.userData : null;
}

/** @param {string} sourceId @param {{ treeJson: object, frozenAt: number, url?: string }} payload */
export async function saveFrozenTreeBundle(sourceId, payload) {
    if (!sourceId || !payload?.treeJson) return false;
    const electron = ud();
    if (!electron?.frozenTreePut) return false;
    return electron.frozenTreePut(sourceId, payload);
}

/** @param {string} sourceId */
export async function getFrozenTreeBundle(sourceId) {
    if (!sourceId) return null;
    const electron = ud();
    if (!electron?.frozenTreeGet) return null;
    return electron.frozenTreeGet(sourceId);
}

/** @param {string} sourceId */
export async function removeFrozenTreeBundle(sourceId) {
    if (!sourceId) return false;
    const electron = ud();
    if (!electron?.frozenTreeRemove) return false;
    return electron.frozenTreeRemove(sourceId);
}
