import { getArboritoStore as store } from '../../core/store-singleton.js';
import { escHtml, escAttr } from '../lib/html-escape.js';
import { emojiHtml } from '../lib/emoji-display.js';
import { getReleaseDownloadPlatforms, GITHUB_RELEASES } from '../lib/release-downloads.js';
import { isElectronDesktop } from '../../features/learning/api/electron-bridge.js';

function resolveVersion() {
    try {
        const v = store.value?.appVersion || store.value?.version;
        if (v) return String(v);
    } catch (_) { /* ignore */ }
    return '0.1.0-alpha';
}

/** @returns {boolean} Download entry only in the browser — hidden in the Electron app. */
export function shouldShowWebDownloadUi() {
    return !isElectronDesktop();
}

/**
 * Optional lead copy — clarifies web already works; install is optional.
 * @param {Record<string, string>} ui
 */
export function renderDownloadAppLeadHtml(ui) {
    const lead = isElectronDesktop()
        ? (ui.downloadModalLeadDesktop || ui.downloadModalLead || '')
        : (ui.downloadModalLead || '');
    if (!lead) return '';
    return `<p class="arborito-download-app-lead">${escHtml(lead)}</p>`;
}

/** Web vs installed app — brief comparison for the download modal. */
export function renderDownloadAppCompareHtml(ui) {
    if (isElectronDesktop()) return '';
    const webTitle = ui.downloadCompareWeb || 'Browser (now)';
    const appTitle = ui.downloadCompareApp || 'Installed app';
    const rows = [
        { ok: true, web: true, app: true, label: ui.downloadCompareTrees || 'Same trees & progress' },
        { ok: true, web: false, app: true, label: ui.downloadCompareSage || 'Private AI + read-aloud' },
        { ok: true, web: false, app: true, label: ui.downloadCompareFreeze || ui.downloadCompareOffline || 'Freeze games & trees offline' },
    ];
    const rowHtml = rows
        .map(
            (r) => `<tr>
                <th scope="row" class="arborito-download-compare__feature">${escHtml(r.label)}</th>
                <td class="arborito-download-compare__cell">${r.web ? '✓' : '—'}</td>
                <td class="arborito-download-compare__cell arborito-download-compare__cell--app">${r.app ? '✓' : '—'}</td>
            </tr>`
        )
        .join('');
    return `<div class="arborito-download-compare" role="table" aria-label="${escAttr(ui.downloadCompareCaption || 'Web vs app')}">
        <div class="arborito-download-compare__head" role="row">
            <span role="columnheader"></span>
            <span role="columnheader" class="arborito-download-compare__col">${escHtml(webTitle)}</span>
            <span role="columnheader" class="arborito-download-compare__col arborito-download-compare__col--app">${escHtml(appTitle)}</span>
        </div>
        <table class="arborito-download-compare__table">
            <thead>
                <tr>
                    <th scope="col"></th>
                    <th scope="col" class="arborito-download-compare__cell">${escHtml(webTitle)}</th>
                    <th scope="col" class="arborito-download-compare__cell arborito-download-compare__cell--app">${escHtml(appTitle)}</th>
                </tr>
            </thead>
            <tbody>${rowHtml}</tbody>
        </table>
    </div>`;
}

/**
 * Platform download buttons (no accordion).
 * @param {Record<string, string>} ui
 * @param {{ className?: string, showHint?: boolean }} [opts]
 */
export function renderDownloadAppPanelHtml(ui, opts = {}) {
    const version = resolveVersion();
    const platforms = getReleaseDownloadPlatforms(version);
    const title = ui.downloadVignetteTitle || ui.downloadAppChip || 'Get the app';
    const hint = opts.showHint !== false ? (ui.downloadVignetteHint || ui.downloadAppChipHint || '') : '';
    const allLabel = ui.downloadVignetteAll || 'All releases';
    const panelClass = ['arborito-download-app-panel', opts.className].filter(Boolean).join(' ');

    const platformBtns = platforms
        .map((p) => {
            const label = ui[p.labelKey] || p.fallbackLabel;
            const sub = ui[p.subKey] || p.fallbackSub;
            return `<a class="arborito-download-app-panel__platform" href="${escAttr(p.url)}" target="_blank" rel="noopener noreferrer"
                title="${escAttr(`${label} — ${sub}`)}" aria-label="${escAttr(`${label} (${sub})`)}">
                <span class="arborito-download-app-panel__platform-ic" aria-hidden="true">${emojiHtml(p.emoji, { className: 'arborito-emoji-glyph', size: 22 })}</span>
                <span class="arborito-download-app-panel__platform-txt">
                    <span class="arborito-download-app-panel__platform-label">${escHtml(label)}</span>
                    <span class="arborito-download-app-panel__platform-sub">${escHtml(sub)}</span>
                </span>
            </a>`;
        })
        .join('');

    return `
        <div class="${panelClass}" role="region" aria-label="${escAttr(title)}">
            ${hint ? `<p class="arborito-download-app-panel__hint">${escHtml(hint)}</p>` : ''}
            <div class="arborito-download-app-panel__grid">${platformBtns}</div>
            <a class="arborito-download-app-panel__all" href="${escAttr(GITHUB_RELEASES)}" target="_blank" rel="noopener noreferrer">${escHtml(allLabel)} ↗</a>
        </div>`;
}

/** Subtle text link — welcome / inline (opens download modal via caller). */
export function renderDownloadAppLinkHtml(ui, { extraClass = '' } = {}) {
    const label = ui.onboardingOptionalAppLink || ui.downloadAppOptionalLink || 'Desktop app (optional) ›';
    const cls = ['arborito-onboarding-privacy__link', 'js-open-download-app', extraClass].filter(Boolean).join(' ');
    return `<button type="button" class="${cls}">${escHtml(label)}</button>`;
}
