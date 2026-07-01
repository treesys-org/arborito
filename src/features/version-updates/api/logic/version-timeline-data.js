import { fileSystem } from '../../../backup-export/api/filesystem.js';
import { getVersionPresentation } from '../version-switch-logic.js';

const LOCAL_CAP = 120;
const RELEASES_CAP = 80;

function matchVersionQuery(label, query) {
    const vq = String(query || '').trim().toLowerCase();
    if (!vq) return true;
    return String(label || '')
        .trim()
        .toLowerCase()
        .includes(vq);
}

/** Construction mode hides the read-only timeline when snapshots admin owns the pane. */
export function shouldHideVersionTimeline(state, vp) {
    return (
        !!state.constructionMode &&
        !!fileSystem.features.canWrite &&
        (vp.isLocal || (vp.isComposed && !!fileSystem.activeComposedBranchId()))
    );
}

/**
 * Pure view-model for VersionTimeline — no DOM or HTML.
 * @returns {{ mode: 'hidden' } | { mode: 'local', ... } | { mode: 'releases', ... }}
 */
export function getVersionTimelineData(graph, state, ui) {
    const src = state.activeSource;
    if (!src) return { mode: 'hidden' };

    const releases = state.availableReleases || [];
    const vp = getVersionPresentation(src, releases, ui);
    if (shouldHideVersionTimeline(state, vp)) return { mode: 'hidden' };

    const query = String(graph?._versionSwitcherQuery || '');

    if (vp.isLocal) {
        const itemsAll = Array.isArray(graph?._localSnapItems) ? graph._localSnapItems : [];
        const filtered = itemsAll.filter((it) => matchVersionQuery(it?.id || it?.name || '', query));
        const truncated = filtered.length > LOCAL_CAP;
        const items = (truncated ? filtered.slice(0, LOCAL_CAP) : filtered).map((it) => ({
            id: String(it.id),
            label: String(it.id),
            isActive:
                src.type === 'archive' && String(src.localArchiveReleaseId || '') === String(it.id),
        }));

        return {
            mode: 'local',
            title: ui.treeSwitcherTabSnapshots || ui.releasesSnapshotsChip || 'Snapshots',
            subtitle: ui.sourcesPillLocal || 'On device',
            query,
            loading: !!graph?._localSnapLoading,
            items,
            truncated,
            truncHint:
                ui.curriculumSwitcherTruncBrowseHint ||
                ui.sourcesUnifiedListTruncBody ||
                'Showing first matches only. Narrow your search.',
            emptyMessage: ui.releasesEmpty || 'No snapshots found.',
            searchPlaceholder: ui.treeSwitcherSearchPh || 'Search…',
        };
    }

    const archivesAll = releases
        .filter((r) => r.type === 'archive')
        .filter((r) => matchVersionQuery(r.year || r.name || '', query))
        .sort((a, b) => b.url.localeCompare(a.url));
    const truncated = archivesAll.length > RELEASES_CAP;
    const archives = archivesAll.slice(0, RELEASES_CAP).map((r) => ({
        release: r,
        label: String(r.year || r.name || ''),
        isActive: vp.isArchive && String(src.url || '') === String(r.url || ''),
    }));

    return {
        mode: 'releases',
        title: ui.treeSwitcherTabEdition || ui.releasesTimeline || ui.releasesVersionUiTitle || 'Edition',
        subtitle: String(vp.chipSub || ''),
        query,
        liveActive: vp.isRolling,
        liveLabel: ui.releasesLiveSimple || ui.releasesLive || 'Latest release',
        archives,
        truncated,
        truncHint:
            ui.curriculumSwitcherTruncVersionsHint ||
            ui.sourcesUnifiedListTruncBody ||
            'Showing first versions only. Narrow your search or open Sources for the full list.',
        hint: ui.releasesSwitchHintShort || ui.releasesSwitchHint || 'Reloads the course.',
        emptyMessage: ui.releasesEmpty || 'No versions found.',
        searchPlaceholder: ui.treeSwitcherSearchPh || 'Search…',
    };
}
