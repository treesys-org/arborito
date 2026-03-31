import { store } from '../store.js';

/** Display name without trailing " (snapshot)" suffix from versioned loads */
export function curriculumBaseName(activeSource) {
    if (!activeSource?.name) return '';
    return activeSource.name.split(' (')[0].trim();
}

export function getVersionPresentation(activeSource, releases, ui = {}) {
    const r = releases || [];
    const isArchive = activeSource?.type === 'archive';
    const isLocal = activeSource?.type === 'local';
    const isRolling = !isArchive && !isLocal;
    const t = (key, en) => (ui && ui[key]) || en;
    /** rolling | archive | local — estilos sólidos en CSS (.arborito-timeline-chip--btn) */
    let versionKind = 'rolling';
    let chipLabel = t('releasesStateLive', 'Live');
    let chipSub = t('releasesStateRolling', 'Rolling');
    let icon = '🌊';
    if (isArchive) {
        versionKind = 'archive';
        chipLabel = t('releasesStateVersion', 'Version');
        const releaseInfo = r.find((rel) => rel.url === activeSource.url);
        if (releaseInfo) chipSub = releaseInfo.year || releaseInfo.name;
        else {
            const match = activeSource.name.match(/\((.*?)\)/);
            chipSub = match ? match[1] : activeSource.year || t('releasesStateArchive', 'Archive');
        }
        icon = '🏛️';
    } else if (isLocal) {
        versionKind = 'local';
        chipLabel = t('releasesStateLocal', 'Local');
        chipSub = t('releasesStateWorkspace', 'Workspace');
        icon = '🌱';
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
    store.loadData(newSource);
}
