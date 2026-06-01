import { ARBORITO_BUILD_ID } from './core/version.js';

// Some browsers reject loopback IPs (e.g. 127.0.0.1) as "invalid domain" when
// building secure origins for things like camera/QR scanning and clipboard.
// Normalize dev URLs early so those features work consistently.
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
// - releases: bump ARBORITO_BUILD_ID in src/core/version.js
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
css.href = `./src/shared/styles/main.css?v=${v}`;
document.head.appendChild(css);

// Runtime CSS overrides (avoid rebuilding CSS in minimal environments).
const cssRuntime = document.createElement('link');
cssRuntime.rel = 'stylesheet';
cssRuntime.href = `./src/shared/styles/runtime-overrides/index.css?v=${v}`;
document.head.appendChild(cssRuntime);

/* Tell the browser to start fetching the entry module + its biggest static
 * import (`app-entry.js`, which pulls every top-level web component) at the
 * same time as the CSS, instead of waiting for `main.js` to parse to discover
 * the chain. Cuts a round-trip off cold loads without changing what runs. */
const preloadMain = document.createElement('link');
preloadMain.rel = 'modulepreload';
preloadMain.href = `./src/main.js?v=${v}`;
document.head.appendChild(preloadMain);

const preloadAppEntry = document.createElement('link');
preloadAppEntry.rel = 'modulepreload';
preloadAppEntry.href = `./src/app-entry.js?v=${v}`;
document.head.appendChild(preloadAppEntry);

const app = document.createElement('script');
app.type = 'module';
app.src = `./src/main.js?v=${v}`;
document.body.appendChild(app);

