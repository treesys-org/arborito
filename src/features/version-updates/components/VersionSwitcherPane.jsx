import { useVersionUpdates } from '../hooks/useVersionUpdates.js';
import { fileSystem } from '../../backup-export/api/filesystem.js';
import { getVersionTimelineData, shouldHideVersionTimeline } from '../api/logic/version-timeline-data.js';
import { getVersionPresentation } from '../api/version-switch-logic.js';
import { VersionTimeline } from './VersionTimeline.jsx';
import { SnapshotsAdmin } from './SnapshotsAdmin.jsx';

function VersionEmptyState({ ui, vp, constructionMode }) {
    const emptyLead =
        !constructionMode
            ? ui.releasesSnapshotsExploreHint ||
              ui.releasesCreateFormHint ||
              'Turn on construction mode to save named snapshots of this branch.'
            : !fileSystem.features.canWrite
              ? ui.releasesSnapshotsReadonlyHint ||
                'This copy is read-only. Copy it to My garden to create snapshots.'
              : ui.releasesEmpty || 'No snapshots yet.';

    return (
        <div className="arborito-curriculum-switcher-block arborito-curriculum-switcher-block--empty">
            <div className="arborito-curriculum-switcher-block__head">
                <p className="arborito-curriculum-switcher-block__title">
                    {ui.releasesModalTitle || ui.releasesVersionsChip || 'Versions'}
                </p>
                <span className="arborito-curriculum-switcher-block__sub">
                    {vp.isLocal
                        ? ui.releasesVersionScopeLocal || ui.sourcesPillLocal || 'On this device'
                        : ui.releasesVersionScopeGlobal || 'Public on the network'}
                </span>
            </div>
            <p className="arborito-curriculum-switcher-empty arborito-curriculum-switcher-empty--lead">{emptyLead}</p>
        </div>
    );
}

import { ActiveVersionBanner } from './ActiveVersionBanner.jsx';

/** Version tab body: timeline + snapshot admin, with a visible fallback when both are empty. */
export function VersionSwitcherPane({ engine, onClose }) {
    const version = useVersionUpdates();
    const { ui, constructionMode, activeSource, availableReleases } = version;
    const releases = availableReleases || [];
    const vp = getVersionPresentation(activeSource, releases, ui);
    const graph = engine ?? version;
    const timelineData = getVersionTimelineData(graph, version, ui);
    const timelineHidden = timelineData.mode === 'hidden' || shouldHideVersionTimeline(version, vp);
    const showAdmin = !!constructionMode && !!fileSystem.features.canWrite;
    const showTimeline = !timelineHidden;
    const timelineWillRender = showTimeline && timelineData.mode !== 'hidden';
    const adminWillRender = showAdmin && !!constructionMode && !!fileSystem.features.canWrite;

    return (
        <div className="arborito-version-switcher-pane flex flex-col flex-1 min-h-0 w-full">
            {!(constructionMode && vp.isLocal) ? <ActiveVersionBanner /> : null}
            {timelineWillRender ? <VersionTimeline engine={engine} onClose={onClose} /> : null}
            {adminWillRender ? <SnapshotsAdmin engine={engine} /> : null}
            {!timelineWillRender && !adminWillRender ? (
                <VersionEmptyState ui={ui} vp={vp} constructionMode={constructionMode} />
            ) : null}
        </div>
    );
}
