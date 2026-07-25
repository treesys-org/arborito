/**
 * On web load only: if this tab booted from a stale cached shell while a newer
 * Pages deploy exists, do one quiet cache-bust navigation before the user is
 * deep in the session. No mid-use polling, no visibility reloads.
 *
 * Skips Electron / Capacitor / file:// / Vite DEV.
 */
import { ARBORITO_BUILD_ID } from '../../core/version.js';

const RELOAD_COOLDOWN_MS = 90_000;
const STORAGE_KEY = 'arborito-shell-reload';
const URL_PARAM = '_ab';

let started = false;

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
        if (!u.searchParams.has(URL_PARAM)) return;
        u.searchParams.delete(URL_PARAM);
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
    const guard = readReloadGuard();
    if (guard && Date.now() - guard.at < RELOAD_COOLDOWN_MS) {
        return;
    }

    writeReloadGuard(remoteId);
    try {
        const u = new URL(window.location.href);
        /* Query busts GitHub Pages HTML cache (same path would stay stale up to max-age). */
        u.searchParams.set(URL_PARAM, String(remoteId).slice(-16));
        window.location.replace(`${u.pathname}${u.search}${u.hash}`);
    } catch {
        window.location.reload();
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
 * One check at startup. If the opened document is an older deploy than
 * build-id.json, replace the navigation once (still during boot).
 * Idempotent. Does not watch the tab afterward.
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
