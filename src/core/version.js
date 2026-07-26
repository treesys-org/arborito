// Stamped by CI before Pages build. Compared once at web load to /build-id.json
// so a stale cached shell can pick up the current deploy during boot (not mid-session).
export const ARBORITO_BUILD_ID = '2026-06-19d';

/** App semver from package.json — bump together with package.json on each release tag. */
export const ARBORITO_APP_VERSION = '0.1.1-alpha';

/** Semver without prerelease suffix, e.g. `0.1.1-alpha` → `0.1.1`. */
export function arboritoVersionDisplayCore() {
    const raw = String(ARBORITO_APP_VERSION || '')
        .trim()
        .replace(/^v/i, '');
    const core = raw.replace(/-(alpha|beta|rc)(\.\d+)?$/i, '');
    return core || raw || '0.1.1';
}

/**
 * UI badge / About line. Template may include `{version}`.
 * @param {string} [template]
 */
export function formatArboritoVersionLabel(template = 'Alpha {version}') {
    const ver = arboritoVersionDisplayCore();
    const tpl = String(template || 'Alpha {version}').trim();
    const withSlot = tpl.includes('{version}') ? tpl : 'Alpha {version}';
    return withSlot.replace(/\{version\}/g, ver).trim();
}
