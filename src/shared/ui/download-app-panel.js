import { isInstalledAppShell } from '../../features/learning/api/electron-bridge.js';

/** @returns {boolean} Download entry only in a plain browser tab, not Electron or Capacitor. */
export function shouldShowWebDownloadUi() {
    return !isInstalledAppShell();
}
