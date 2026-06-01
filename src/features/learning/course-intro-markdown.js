import { safeStripeSupportUrl } from '../../shared/lib/stripe-support-url.js';

function readSupportUrl(pres) {
    if (!pres || typeof pres !== 'object') return '';
    return safeStripeSupportUrl(pres.supportUrl);
}

/**
 * @param {object|null|undefined} raw — rawGraphData
 * @returns {boolean}
 */
export function hasAboutCourseCard(raw) {
    const pres =
        (raw && raw.universePresentation) && typeof raw.universePresentation === 'object'
            ? raw.universePresentation
            : {};
    const desc = String(pres.description || '').trim();
    const authorName = String(pres.authorName || '').trim();
    const authorAbout = String(pres.authorAbout || '').trim();
    const supportUrl = readSupportUrl(pres);
    return !!(desc || authorName || authorAbout || supportUrl);
}

/**
 * @param {object|null|undefined} pres — universePresentation
 * @param {object} [ui]
 * @returns {string}
 */
function courseIntroMarkdownFromUniversePresentation(pres, ui = {}) {
    if (!pres || typeof pres !== 'object') return '';
    const desc = String(pres.description || '').trim();
    const authorName = String(pres.authorName || '').trim();
    const authorAbout = String(pres.authorAbout || '').trim();
    const supportUrl = readSupportUrl(pres);
    if (!desc && !authorName && !authorAbout && !supportUrl) return '';
    const lines = [];
    if (desc) lines.push(desc);
    if (authorName || authorAbout) {
        if (lines.length) lines.push('');
        if (authorName) lines.push(`## ${authorName}`);
        if (authorAbout) lines.push(authorAbout);
    }
    if (supportUrl) {
        const label = ui.treeSupportCta || 'Support the creator';
        lines.push('');
        lines.push(`[${label}](${supportUrl})`);
    }
    return lines.join('\n').trim();
}

/**
 * @param {object|null|undefined} raw — muta raw.readme
 * @param {object} ui
 */
export function syncReadmeFromUniversePresentation(raw, ui) {
    if (!raw || typeof raw !== 'object') return;
    const pres =
        raw.universePresentation && typeof raw.universePresentation === 'object'
            ? raw.universePresentation
            : {};
    const md = courseIntroMarkdownFromUniversePresentation(pres, ui);
    const langKeys = Object.keys(raw.languages || {});
    if (!md) {
        delete raw.readme;
        return;
    }
    if (langKeys.length <= 1) {
        raw.readme = md;
    } else {
        raw.readme = {};
        for (const k of langKeys) raw.readme[k] = md;
    }
}

/**
 * Primer texto legible de raw.readme (string o mapa por idioma).
 * @param {object|null|undefined} raw
 * @returns {string}
 */
export function readmeAsString(raw) {
    const r = (raw && raw.readme);
    if (r == null) return '';
    if (typeof r === 'string') return r;
    if (typeof r === 'object' && !Array.isArray(r)) {
        const v = Object.values(r).find((x) => typeof x === 'string' && String(x).trim());
        return v ? String(v) : '';
    }
    return '';
}
