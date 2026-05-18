import { ARBORITO_BUILD_ID } from './version.js';

// WebAuthn/passkeys are much more reliable on `localhost` than on loopback IPs.
// Some browsers reject RP IDs derived from IPs (e.g. 127.0.0.1) as "invalid domain".
// Normalize dev URLs early so passkeys work consistently.
try {
    const h = (window.location && window.location.hostname) || '';
    if ((h === '127.0.0.1' || h === '::1') && window.location.protocol !== 'file:') {
        const u = new URL(window.location.href);
        u.hostname = 'localhost';
        window.location.replace(u.toString());
    }
} catch {
    /* ignore */
}

// Cache busting:
// - releases: bump ARBORITO_BUILD_ID in src/version.js
// - localhost/dev: always add a runtime nonce so refresh picks up changes without manual cache clears
let build = String(ARBORITO_BUILD_ID || 'dev');
try {
    const host = String((window.location && window.location.hostname) || '');
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    const isHttp = (window.location && window.location.protocol) === 'http:' || (window.location && window.location.protocol) === 'https:';
    if (isHttp && isLocalHost) {
        build = `${build}-${Date.now()}`;
    }
} catch {
    /* ignore */
}
const v = encodeURIComponent(build);

const css = document.createElement('link');
css.rel = 'stylesheet';
css.href = `./src/styles/main.css?v=${v}`;
document.head.appendChild(css);

// Runtime CSS overrides (avoid rebuilding CSS in minimal environments).
const cssRuntime = document.createElement('link');
cssRuntime.rel = 'stylesheet';
cssRuntime.href = `./src/styles/runtime-overrides.css?v=${v}`;
document.head.appendChild(cssRuntime);

const app = document.createElement('script');
app.type = 'module';
app.src = `./src/main.js?v=${v}`;
document.body.appendChild(app);

