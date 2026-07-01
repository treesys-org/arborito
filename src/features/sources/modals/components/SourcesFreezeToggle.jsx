import { useSources } from '../../hooks/useSources.js';
import { isElectronDesktop } from '../../../learning/api/electron-bridge.js';

export function SourcesFreezeToggle({ sourceId, busy, onToggle, ui }) {
    const { userStore } = useSources();
    if (!isElectronDesktop() || !sourceId) return null;
    const frozen = userStore.isTreeFrozen(sourceId);
    const label = busy
        ? ui.freezeDownloading || '…'
        : frozen
          ? ui.freezeToggleOn || ui.freezeToggle || 'Offline'
          : ui.freezeToggle || 'Offline';
    const title = busy
        ? ui.freezeDownloadingHint || 'Saving offline copy…'
        : frozen
          ? ui.freezeOnHint || 'Offline copy saved — no automatic updates'
          : ui.freezeTapHint || 'Save an offline copy on this device';

    return (
        <label className="arborito-sources-freeze-beside-cta cursor-pointer">
            <span className={`arborito-sources-freeze-beside-cta__label${busy ? ' animate-pulse' : ''}`}>
                {label}
            </span>
            <button
                type="button"
                role="switch"
                aria-checked={frozen ? 'true' : 'false'}
                aria-label={title}
                title={title}
                disabled={busy}
                aria-busy={busy ? 'true' : undefined}
                className={`arborito-switch arborito-switch--touch arborito-switch--freeze${busy ? ' opacity-50 pointer-events-none' : ''}`}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggle?.(sourceId);
                }}
            />
        </label>
    );
}
