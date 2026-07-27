import { getArboritoStore } from '../core/store-singleton.js';
import { isCapacitorNative } from '../features/learning/api/electron-bridge.js';
import {
    hasGdprNetworkConsent,
    onGdprNetworkConsentGranted,
} from '../shared/lib/connected-services/index.js';
import { ARBORITO_APP_VERSION } from '../core/version.js';
import {
    GITHUB_RELEASES_LATEST_API,
    GITHUB_RELEASES_LIST_API,
    getReleaseDownloadPlatforms,
} from '../shared/lib/release-downloads.js';

const CHECK_DELAY_MS = 2_500;

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareSemverLike(a, b) {
    const norm = (s) =>
        String(s || '')
            .trim()
            .replace(/^v/i, '')
            .split(/[-+]/)
            .map((part, idx) => {
                if (idx === 0) {
                    return part.split('.').map((n) => {
                        const x = parseInt(n, 10);
                        return Number.isFinite(x) ? x : 0;
                    });
                }
                return part;
            });
    const [aCore, aPre] = norm(a);
    const [bCore, bPre] = norm(b);
    const len = Math.max(aCore.length, bCore.length);
    for (let i = 0; i < len; i++) {
        const av = aCore[i] || 0;
        const bv = bCore[i] || 0;
        if (av !== bv) return av - bv;
    }
    if (aPre == null && bPre == null) return 0;
    if (aPre == null) return 1;
    if (bPre == null) return -1;
    return String(aPre).localeCompare(String(bPre));
}

async function fetchLatestRelease() {
    const headers = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Arborito',
    };
    try {
        const res = await fetch(GITHUB_RELEASES_LATEST_API, { headers });
        if (res.ok) {
            const data = await res.json();
            if (data?.tag_name || data?.name) return data;
        }
        /* 404 when every release is a prerelease — continue to list. */
    } catch {
        /* network / CORS — try list */
    }
    const listRes = await fetch(GITHUB_RELEASES_LIST_API, { headers });
    if (!listRes.ok) throw new Error(`HTTP ${listRes.status}`);
    const list = await listRes.json();
    const rows = Array.isArray(list) ? list : [];
    const usable = rows.filter((r) => r && !r.draft && (r.tag_name || r.name));
    if (!usable.length) throw new Error('No GitHub releases found');
    usable.sort((a, b) =>
        compareSemverLike(String(b.tag_name || b.name || ''), String(a.tag_name || a.name || ''))
    );
    return usable[0];
}

/**
 * Prefer the real APK asset on the release; fall back to the conventional name.
 * @param {object} release
 * @param {string} version
 */
function resolveAndroidApkUrl(release, version) {
    const assets = Array.isArray(release?.assets) ? release.assets : [];
    const want = `arborito-${String(version || '').replace(/^v/i, '')}.apk`.toLowerCase();
    const exact = assets.find((a) => String(a?.name || '').toLowerCase() === want);
    const anyApk = assets.find((a) => /\.apk$/i.test(String(a?.name || '')));
    const fromAsset = String(exact?.browser_download_url || anyApk?.browser_download_url || '').trim();
    if (fromAsset) return fromAsset;
    const platforms = getReleaseDownloadPlatforms(version);
    return platforms.find((p) => p.id === 'android')?.url || '';
}

function openApkUrl(url) {
    try {
        const App = window.Capacitor?.Plugins?.App;
        if (App && typeof App.openUrl === 'function') {
            void App.openUrl({ url });
            return true;
        }
    } catch {
        /* fall through */
    }
    try {
        const Browser = window.Capacitor?.Plugins?.Browser;
        if (Browser && typeof Browser.open === 'function') {
            void Browser.open({ url });
            return true;
        }
    } catch {
        /* fall through */
    }
    try {
        window.open(url, '_blank', 'noopener,noreferrer');
        return true;
    } catch {
        return false;
    }
}

/**
 * Capacitor Android: after privacy consent, check GitHub Releases and offer APK install.
 */
export function initCapacitorAppUpdatePrompt() {
    if (!isCapacitorNative()) return;
    try {
        const platform =
            typeof window.Capacitor?.getPlatform === 'function'
                ? window.Capacitor.getPlatform()
                : window.Capacitor?.platform;
        if (platform && platform !== 'android') return;
    } catch {
        /* continue — treat as android-capable native shell */
    }

    let sessionHandled = false;
    let checkRequested = false;

    const runCheck = async () => {
        if (sessionHandled) return;
        if (!hasGdprNetworkConsent()) return;
        try {
            const data = await fetchLatestRelease();
            const tag = String(data?.tag_name || data?.name || '').trim();
            const remote = tag.replace(/^v/i, '');
            const local = String(ARBORITO_APP_VERSION || '').trim();
            if (!remote || !local) return;
            if (compareSemverLike(remote, local) <= 0) return;

            sessionHandled = true;
            const store = getArboritoStore();
            if (!store?.showDialog) return;

            const ui = store.ui || store.state?.i18nData || {};
            const title = ui.appUpdateTitle || 'Update available';
            const body = String(
                ui.appUpdateBodyAndroid ||
                    ui.appUpdateBody ||
                    'Arborito {version} is available. Update now? Your browser or downloads will open the APK so you can install it (Android will ask you to confirm).'
            ).replace(/\{version\}/g, remote);

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
            if (!accepted) return;

            try {
                store.notify?.(ui.appUpdateOpeningInstaller || 'Opening system installer…', false);
            } catch {
                /* ignore */
            }

            const platforms = getReleaseDownloadPlatforms(remote);
            const android = platforms.find((p) => p.id === 'android');
            const url = resolveAndroidApkUrl(data, remote) || android?.url || '';
            if (!url || !openApkUrl(url)) {
                const err =
                    ui.appUpdateFailedAndroid ||
                    ui.appUpdateFailed ||
                    'Could not open the APK download. Try again from arborito.org (Download → Android).';
                try {
                    await store.alert?.(err, title);
                } catch {
                    /* ignore */
                }
            }
        } catch (e) {
            console.warn('[Arborito] android update check:', e && e.message ? e.message : e);
        }
    };

    const requestCheck = () => {
        if (checkRequested) return;
        if (!hasGdprNetworkConsent()) return;
        checkRequested = true;
        setTimeout(() => {
            void runCheck();
        }, CHECK_DELAY_MS);
    };

    if (hasGdprNetworkConsent()) {
        requestCheck();
    } else {
        onGdprNetworkConsentGranted(requestCheck);
    }
}
