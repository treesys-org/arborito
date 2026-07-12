import { useVersionUpdates } from '../hooks/useVersionUpdates.js';
import { resolveActiveSourceVersionLabel, getVersionPresentation } from '../api/version-switch-logic.js';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';

/** Construction / version tab: shows which edition or snapshot is loaded in the graph. */
export function ActiveVersionBanner() {
    const version = useVersionUpdates();
    const { ui, activeSource, availableReleases, constructionMode } = version;
    if (!activeSource) return null;

    const releases = availableReleases || [];
    const vp = getVersionPresentation(activeSource, releases, ui);
    const label =
        resolveActiveSourceVersionLabel(ui, version) ||
        vp.chipSub ||
        ui.releasesStateLiveShort ||
        ui.releasesStateLive ||
        'Current';

    const eyebrow =
        constructionMode && vp.isLocal
            ? ui.constructionActiveVersionEyebrow || ui.releasesVersionsChip || 'Version'
            : ui.treeSwitcherContextVersionEyebrow || ui.releasesVersionUiTitle || 'Edition';

    const hint =
        vp.isArchive || activeSource.localArchiveReleaseId != null
            ? ui.constructionActiveVersionSnapshotHint ||
              ui.treeSwitcherContextVersionHint ||
              'You are editing this saved copy.'
            : ui.constructionActiveVersionLiveHint ||
              (vp.isLocal
                  ? ui.releasesLocalDraftShort || 'Current draft'
                  : ui.releasesStateLiveShort || 'Latest online');

    const icon =
        vp.isArchive || activeSource.localArchiveReleaseId != null
            ? '📦'
            : vp.isLocal
              ? '🌿'
              : '🌊';

    return (
        <div className="arborito-active-version-banner" role="status">
            <span className="arborito-active-version-banner__icon" aria-hidden="true">
                <ChromeEmoji emoji={icon} size={22} />
            </span>
            <div className="arborito-active-version-banner__copy min-w-0">
                <p className="arborito-active-version-banner__eyebrow">{eyebrow}</p>
                <p className="arborito-active-version-banner__value">{label}</p>
                <p className="arborito-active-version-banner__hint">{hint}</p>
            </div>
        </div>
    );
}
