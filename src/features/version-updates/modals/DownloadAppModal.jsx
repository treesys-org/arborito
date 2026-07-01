import { useVersionUpdates } from '../hooks/useVersionUpdates.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { DockModalShell } from '../../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { isElectronDesktop } from '../../learning/api/electron-bridge.js';
import { getReleaseDownloadPlatforms, GITHUB_RELEASES } from '../../../shared/lib/release-downloads.js';

function resolveVersion(state) {
    try {
        const v = state?.appVersion || state?.version;
        if (v) return String(v);
    } catch {
        /* ignore */
    }
    return '0.1.0-alpha';
}

function DownloadAppCompare({ ui }) {
    if (isElectronDesktop()) return null;
    const webTitle = ui.downloadCompareWeb || 'Browser (now)';
    const appTitle = ui.downloadCompareApp || 'Installed app';
    const rows = [
        { web: true, app: true, label: ui.downloadCompareTrees || 'Same trees & progress' },
        { web: false, app: true, label: ui.downloadCompareSage || 'Private AI + read-aloud' },
        { web: false, app: true, label: ui.downloadCompareFreeze || ui.downloadCompareOffline || 'Freeze games & trees offline' },
    ];
    const caption = ui.downloadCompareCaption || 'Web vs app';

    return (
        <div className="arborito-download-compare" role="table" aria-label={caption}>
            <div className="arborito-download-compare__head" role="row">
                <span role="columnheader" />
                <span role="columnheader" className="arborito-download-compare__col">{webTitle}</span>
                <span role="columnheader" className="arborito-download-compare__col arborito-download-compare__col--app">{appTitle}</span>
            </div>
            <table className="arborito-download-compare__table">
                <thead>
                    <tr>
                        <th scope="col" />
                        <th scope="col" className="arborito-download-compare__cell">{webTitle}</th>
                        <th scope="col" className="arborito-download-compare__cell arborito-download-compare__cell--app">{appTitle}</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r) => (
                        <tr key={r.label}>
                            <th scope="row" className="arborito-download-compare__feature">{r.label}</th>
                            <td className="arborito-download-compare__cell">{r.web ? '✓' : '—'}</td>
                            <td className="arborito-download-compare__cell arborito-download-compare__cell--app">{r.app ? '✓' : '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function DownloadAppPanel({ ui, state }) {
    const version = resolveVersion(state);
    const platforms = getReleaseDownloadPlatforms(version);
    const title = ui.downloadVignetteTitle || ui.downloadAppChip || 'Get the app';
    const hint = ui.downloadVignetteHint || ui.downloadAppChipHint || '';
    const allLabel = ui.downloadVignetteAll || 'All releases';

    return (
        <div className="arborito-download-app-panel arborito-download-app-panel--modal" role="region" aria-label={title}>
            {hint ? <p className="arborito-download-app-panel__hint">{hint}</p> : null}
            <div className="arborito-download-app-panel__grid">
                {platforms.map((p) => {
                    const label = ui[p.labelKey] || p.fallbackLabel;
                    const sub = ui[p.subKey] || p.fallbackSub;
                    return (
                        <a
                            key={p.url}
                            className="arborito-download-app-panel__platform"
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`${label} — ${sub}`}
                            aria-label={`${label} (${sub})`}
                        >
                            <span className="arborito-download-app-panel__platform-ic" aria-hidden="true">
                                <ChromeEmoji emoji={p.emoji} size={22} className="arborito-emoji-glyph" />
                            </span>
                            <span className="arborito-download-app-panel__platform-txt">
                                <span className="arborito-download-app-panel__platform-label">{label}</span>
                                <span className="arborito-download-app-panel__platform-sub">{sub}</span>
                            </span>
                        </a>
                    );
                })}
            </div>
            <a className="arborito-download-app-panel__all" href={GITHUB_RELEASES} target="_blank" rel="noopener noreferrer">
                {allLabel} ↗
            </a>
        </div>
    );
}

export function ModalDownloadApp() {
    const version = useVersionUpdates();
    const { ui, dismissModal, state } = version;

    const mobile = shouldShowMobileUI();
    const close = () => dismissModal();

    const title = ui.downloadModalTitle || ui.downloadAppChip || 'Download Arborito';
    const badge = ui.downloadModalBadge || ui.downloadAppOptionalShort || '';
    const lead = isElectronDesktop()
        ? (ui.downloadModalLeadDesktop || ui.downloadModalLead || '')
        : (ui.downloadModalLead || '');

    return (
        <DockModalShell
            mobile={mobile}
            sizeTier="COMPACT"
            onBackdropClick={close}
            shellOpts={{ panelClass: 'arborito-download-app-modal-shell' }}
            hero={
                <ModalHubHero
                    ui={ui}
                    mobile
                    trailingSpacer
                    title={title}
                    subtitle={badge || undefined}
                    leadingIcon={
                        <span className="arborito-download-modal__hero-icon" aria-hidden="true">
                            <ChromeEmoji emoji="🌳" size={28} />
                        </span>
                    }
                    tagClass="btn-close"
                    onClose={close}
                />
            }
        >
            {lead ? <p className="arborito-download-app-lead">{lead}</p> : null}
            <DownloadAppCompare ui={ui} />
            <p className="arborito-download-modal__platforms-label">{ui.downloadModalPlatformsLabel || 'Choose your platform'}</p>
            <DownloadAppPanel ui={ui} state={state} />
        </DockModalShell>
    );
}
