/**
 * On web load only: if this tab booted from a stale cached shell while a newer
 * Pages deploy exists, do one quiet cache-bust navigation before the user is
 * deep in the session. No mid-use polling, no visibility reloads.
 *
 * Skips Electron / Capacitor / file:// / Vite DEV.
 *
 * Early gate also lives as a classic script in index.html (compares meta
 * build-id to /build-id.json before the module graph runs) so a 404 on the
 * old hashed entry does not leave a blank screen.
 */
import { ARBORITO_BUILD_ID } from '../../core/version.js';

const RELOAD_COOLDOWN_MS = 90_000;
const STORAGE_KEY = 'arborito-shell-reload';
const CHUNK_RELOAD_KEY = 'arborito-chunk-reload';
export const SHELL_BUILD_URL_PARAM = '_ab';

let started = false;
let chunkGuardInstalled = false;

function isInstalledAppShell() {
    if (typeof window === 'undefined') return true;
    try {
        const ua = String(navigator.userAgent || '');
        if (/\bElectron\//i.test(ua) || /\belectron\b/i.test(ua)) return true;
        if (window.arboritoElectron) return true;
        const c = window.Capacitor;
        if (c) {
            if (typeof c.isNativePlatform === 'function' && c.isNativePlatform()) return true;
            const platform = typeof c.getPlatform === 'function' ? c.getPlatform() : c.platform;
            if (platform === 'android' || platform === 'ios') return true;
        }
    } catch {
        /* ignore */
    }
    return false;
}

function isWebHttpShell() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    if (import.meta.env?.DEV) return false;
    if (isInstalledAppShell()) return false;
    const protocol = String(window.location?.protocol || '');
    return protocol === 'http:' || protocol === 'https:';
}

function buildIdUrl() {
    try {
        if (typeof document !== 'undefined' && document.baseURI) {
            return new URL('build-id.json', document.baseURI).href;
        }
    } catch {
        /* fall through */
    }
    return 'build-id.json';
}

/** Drop the one-shot cache-bust query after a successful load. */
function stripShellBuildRefreshParam() {
    if (typeof window === 'undefined' || !window.history?.replaceState) return;
    try {
        const u = new URL(window.location.href);
        if (!u.searchParams.has(SHELL_BUILD_URL_PARAM)) return;
        u.searchParams.delete(SHELL_BUILD_URL_PARAM);
        const next = `${u.pathname}${u.search}${u.hash}`;
        window.history.replaceState(null, '', next || u.pathname);
    } catch {
        /* ignore */
    }
}

function readReloadGuard() {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return {
            at: Number(parsed.at) || 0,
            id: String(parsed.id || ''),
        };
    } catch {
        return null;
    }
}

function writeReloadGuard(remoteId) {
    try {
        sessionStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ at: Date.now(), id: String(remoteId || '') })
        );
    } catch {
        /* ignore */
    }
}

function reloadForNewBuild(remoteId) {
    try {
        const u = new URL(window.location.href);
        let bust = String(remoteId || Date.now()).slice(-16);
        const alreadyBusted = u.searchParams.get(SHELL_BUILD_URL_PARAM) === bust;
        const guard = readReloadGuard();

        if (alreadyBusted) {
            /* First bust still served the old shell — only retry after cooldown, with a fresh token. */
            if (guard && Date.now() - guard.at < RELOAD_COOLDOWN_MS) {
                return false;
            }
            bust = String(Date.now()).slice(-16);
        } else if (
            guard &&
            guard.id === String(remoteId || '') &&
            Date.now() - guard.at < 4_000
        ) {
            /* Early HTML gate likely already navigating — avoid a double replace. */
            return false;
        }

        writeReloadGuard(remoteId);
        u.searchParams.set(SHELL_BUILD_URL_PARAM, bust);
        window.location.replace(`${u.pathname}${u.search}${u.hash}`);
        return true;
    } catch {
        window.location.reload();
        return true;
    }
}

async function fetchRemoteBuildId() {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 6_000);
    try {
        const res = await fetch(buildIdUrl(), {
            cache: 'no-store',
            credentials: 'same-origin',
            signal: ac.signal,
            headers: { Accept: 'application/json' },
        });
        if (!res.ok) return null;
        const data = await res.json();
        const id = String(data?.id || '').trim();
        return id || null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Await before mounting React. Returns false when a navigation was started
 * (caller should stop booting). Idempotent with the early HTML gate.
 */
export async function gateShellBuildOrContinue() {
    if (!isWebHttpShell()) return true;
    stripShellBuildRefreshParam();

    const remoteId = await fetchRemoteBuildId();
    if (!remoteId || remoteId === ARBORITO_BUILD_ID) return true;
    return !reloadForNewBuild(remoteId);
}

/**
 * One check at startup (backup if the HTML gate was skipped). If the opened
 * document is an older deploy than build-id.json, replace once during boot.
 */
export function startShellBuildRefresh() {
    if (started || !isWebHttpShell()) return;
    started = true;
    stripShellBuildRefreshParam();

    void (async () => {
        const remoteId = await fetchRemoteBuildId();
        if (!remoteId || remoteId === ARBORITO_BUILD_ID) return;
        reloadForNewBuild(remoteId);
    })();
}

function isStaleChunkLoadMessage(msg) {
    const s = String(msg || '');
    return /Failed to fetch dynamically imported module|Loading chunk|error loading dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(
        s
    );
}

/**
 * When a deploy deletes old hashed chunks, the cached shell 404s on import.
 * One session reload with a cache-bust query (keeps the boot spinner up).
 */
export function installStaleChunkReloadGuard() {
    if (chunkGuardInstalled || !isWebHttpShell()) return;
    chunkGuardInstalled = true;

    const tryReload = (reason) => {
        try {
            if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1') return false;
            sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
        } catch {
            /* ignore */
        }
        console.warn('[Arborito] stale asset after deploy, reloading', reason);
        try {
            const u = new URL(window.location.href);
            u.searchParams.set(SHELL_BUILD_URL_PARAM, String(Date.now()).slice(-16));
            window.location.replace(`${u.pathname}${u.search}${u.hash}`);
        } catch {
            window.location.reload();
        }
        return true;
    };

    window.addEventListener('vite:preloadError', (event) => {
        try {
            event.preventDefault?.();
        } catch {
            /* ignore */
        }
        tryReload('vite:preloadError');
    });

    window.addEventListener('unhandledrejection', (ev) => {
        const r = ev?.reason;
        const msg = r?.message || String(r || '');
        if (!isStaleChunkLoadMessage(msg)) return;
        if (tryReload(msg)) {
            try {
                ev.preventDefault?.();
            } catch {
                /* ignore */
            }
        }
    });

    /* Clear one-shot flag after a healthy boot so a later deploy can recover again. */
    window.addEventListener(
        'arborito-boot-dismiss',
        () => {
            try {
                sessionStorage.removeItem(CHUNK_RELOAD_KEY);
            } catch {
                /* ignore */
            }
        },
        { once: true }
    );
}
