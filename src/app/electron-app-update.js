import { getArboritoStore } from '../core/store-singleton.js';
import { getAppUpdateBridge } from '../features/learning/api/electron-bridge.js';
import {
    hasGdprNetworkConsent,
    onGdprNetworkConsentGranted,
} from '../shared/lib/connected-services/index.js';

/**
 * Packaged desktop: after privacy consent, ask main to check for updates,
 * then prompt before install (Windows quiet install, Linux system installer).
 */
export function initElectronAppUpdatePrompt() {
    const bridge = getAppUpdateBridge();
    if (!bridge?.onAvailable || typeof bridge.check !== 'function') return;

    let sessionHandled = false;
    let checkRequested = false;

    const requestCheck = () => {
        if (checkRequested) return;
        if (!hasGdprNetworkConsent()) return;
        checkRequested = true;
        try {
            void bridge.check();
        } catch {
            checkRequested = false;
        }
    };

    bridge.onAvailable(async (payload) => {
        if (sessionHandled) return;
        if (!hasGdprNetworkConsent()) return;
        sessionHandled = true;

        const store = getArboritoStore();
        if (!store?.showDialog) return;

        const ui = store.ui || store.state?.i18nData || {};
        const version = String(payload?.version || '').trim() || '?';
        const kind = String(payload?.kind || '').trim();
        const isLinuxRef = kind === 'linux-ref';
        const title = ui.appUpdateTitle || 'Update available';
        const bodyTemplate = isLinuxRef
            ? ui.appUpdateBodyLinux ||
              ui.appUpdateBody ||
              'Arborito {version} is available. Update now? Your system installer will open so you can install this version.'
            : ui.appUpdateBody ||
              'Arborito {version} is available. Update now? The app will download the installer, install quietly, and restart.';
        const body = String(bodyTemplate).replace(/\{version\}/g, version);

        let accepted = false;
        try {
            accepted = !!(await store.showDialog({
                type: 'confirm',
                title,
                body,
                confirmText: ui.appUpdateConfirm || 'Update now',
                cancelText: ui.appUpdateLater || 'Later',
                dialogIcon: '⬇️',
            }));
        } catch {
            accepted = false;
        }

        if (!accepted) {
            try {
                await bridge.dismiss?.();
            } catch {
                /* ignore */
            }
            return;
        }

        try {
            const progress = isLinuxRef
                ? ui.appUpdateOpeningInstaller || 'Opening system installer…'
                : ui.appUpdateDownloading || 'Downloading update…';
            store.notify?.(progress, false);
        } catch {
            /* ignore */
        }

        let result = null;
        try {
            result = await bridge.confirm();
        } catch (e) {
            result = { ok: false, error: e && e.message ? e.message : String(e) };
        }

        if (!result?.ok) {
            const err =
                String(result?.error || '').trim() ||
                (isLinuxRef
                    ? ui.appUpdateFailedLinux || ui.appUpdateFailed
                    : ui.appUpdateFailed) ||
                'Could not download the update. Try again later from GitHub Releases.';
            try {
                await store.alert?.(err, title);
            } catch {
                /* ignore */
            }
        }
    });

    if (typeof bridge.onError === 'function') {
        bridge.onError((payload) => {
            const msg = String(payload?.error || '').trim();
            if (!msg) return;
            console.warn('[Arborito] app update:', msg);
        });
    }

    if (hasGdprNetworkConsent()) {
        requestCheck();
    } else {
        onGdprNetworkConsentGranted(requestCheck);
    }
}
