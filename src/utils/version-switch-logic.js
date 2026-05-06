import { store } from '../store.js';
import { inferBundleTitle } from './arborito-bundle.js';
import { markPendingCurriculumSwitcher } from './curriculum-switcher-pending.js';

/** Display name without trailing " (snapshot)" suffix from versioned loads */
export function curriculumBaseName(activeSource) {
    if (!(activeSource && activeSource.name)) return '';
    return activeSource.name.split(' (')[0].trim();
}

/**
 * Human-facing tree title: prefers bundle/universe + root node names over `activeSource.name`
 * (Public Nostr sources often label the source as `Public · …`).
 * @param {{ navHome?: string }} [ui]
 */
export function curriculumTreeDisplayName(ui = {}) {
    const src = store.value.activeSource;
    const raw = store.value.rawGraphData;
    if (raw && typeof raw === 'object') {
        const t = String(inferBundleTitle(raw, src) || '').trim();
        if (t && t !== 'Arborito') return t;
    }
    const base = curriculumBaseName(src) || '';
    if (base) return base;
    return String(src?.name || ui.navHome || 'Home').trim() || 'Home';
}

export function getVersionPresentation(activeSource, releases, ui = {}) {
    const r = releases || [];
    const isArchive = (activeSource && activeSource.type) === 'archive';
    const isLocal = (activeSource && activeSource.type) === 'local';
    const isRolling = !isArchive && !isLocal;
    const t = (key, en) => (ui && ui[key]) || en;
    const versionTitle = t('releasesVersionUiTitle', t('releasesStateVersion', 'Version'));
    const scopeGlobal = t('releasesVersionScopeGlobal', 'Public on the network');
    const scopeLocal = t('releasesVersionScopeLocal', 'Local tree (this device)');
    /** rolling | archive | local — solid styles in CSS (.arborito-timeline-chip--btn) */
    let versionKind = 'rolling';
    let chipLabel = versionTitle;
    let chipSub = t('releasesStateRolling', 'Rolling');
    let icon = '🌊';
    if (isArchive) {
        versionKind = 'archive';
        chipLabel = versionTitle;
        const releaseInfo = r.find((rel) => rel.url === activeSource.url);
        if (releaseInfo) chipSub = releaseInfo.year || releaseInfo.name;
        else {
            const match = activeSource.name.match(/\((.*?)\)/);
            chipSub = match ? match[1] : activeSource.year || t('releasesStateArchive', 'Archive');
        }
        chipSub = `${chipSub} · ${scopeGlobal}`;
        icon = '🏛️';
    } else if (isLocal) {
        versionKind = 'local';
        chipLabel = versionTitle;
        chipSub = scopeLocal;
        /* 🏡 avoid confusion with the inline “seeds” chip (🌱) on Nostr trees. */
        icon = '🏡';
    } else {
        chipSub = `${t('releasesStateLive', 'Live')} · ${scopeGlobal}`;
    }
    return { chipLabel, chipSub, icon, versionKind, isArchive, isLocal, isRolling };
}

export function applyReleaseSwitch(release) {
    const activeSource = store.value.activeSource;
    const newSource = {
        ...activeSource,
        id: `${activeSource.id}-${release.id}`,
        name: release.name || `${activeSource.name} (${release.id})`,
        url: release.url,
        type: release.type || 'archive'
    };
    markPendingCurriculumSwitcher();
    store.loadData(newSource);
}

export function applyLiveSwitch() {
    const activeSource = store.value.activeSource;
    const releases = store.value.availableReleases || [];
    const rolling = releases.find((r) => r.type === 'rolling');
    let newUrl = rolling ? rolling.url : activeSource.url;
    if (!rolling && activeSource.type === 'archive') {
        if (activeSource.url.includes('/releases/')) {
            newUrl = activeSource.url.split('/releases/')[0] + '/data.json';
        }
    }
    const newSource = {
        ...activeSource,
        id: `live-${Date.now()}`,
        name: activeSource.name.split(' (')[0],
        url: newUrl,
        type: 'rolling'
    };
    markPendingCurriculumSwitcher();
    store.loadData(newSource);
}
