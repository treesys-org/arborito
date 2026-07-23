function NetworkStatusIcon({ online }) {
    if (online) {
        return (
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
                <path
                    d="M2.5 6.2 5 8.7 9.5 3.8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.85"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        );
    }
    return (
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
            <path
                d="M3.2 3.2 8.8 8.8M8.8 3.2 3.2 8.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.85"
                strokeLinecap="round"
            />
        </svg>
    );
}

/**
 * Read-only network status badge (green check = online, red cross = offline).
 * Use explicit action links beside it to change state — the badge is not clickable.
 *
 * @param {{
 *   ui: Record<string, string>,
 *   online: boolean,
 *   previewPending?: boolean,
 *   id?: string,
 * }} props
 */
export function NetworkOnlineStatus({ ui, online, previewPending = false, id }) {
    const onLbl = ui.profileNetworkModeLabel || 'Online';
    const offLbl = ui.profileNetworkModeOffLabel || 'Offline';
    const label = online ? onLbl : offLbl;

    const ariaLabel = previewPending
        ? ui.privacyOnboardingNetworkPreviewSwitchAria ||
          'Online (enabled when you accept and continue)'
        : online
          ? ui.profileNetworkModeOnHint || onLbl
          : ui.profileNetworkModeOffHint || offLbl;

    const className = [
        'arborito-network-status',
        online ? 'arborito-network-status--on' : 'arborito-network-status--off',
        previewPending ? 'arborito-network-status--pending' : '',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <span
            id={id}
            className={className}
            role="status"
            aria-label={ariaLabel}
            title={ariaLabel}
        >
            <span className="arborito-network-status__glyph">
                <NetworkStatusIcon online={online} />
            </span>
            <span className="arborito-network-status__text">{label}</span>
        </span>
    );
}
