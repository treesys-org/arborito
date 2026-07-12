/** Team / governance hub, shared title + shell tokens (ModalContributor + chunk fallback). */

export function contributorModalTitle(ui = {}) {
    return (
        ui.conMoreRowGovernance ||
        ui.adminGovModalHeading ||
        ui.adminGovTitle ||
        ui.adminConsole ||
        'Team'
    );
}

/** Scroll host class for team hub body (ContributorPanelBody). */
export const CONTRIBUTOR_HUB_BODY_SCROLL =
    'flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar px-3 py-3 sm:px-4 sm:py-4';

export const CONTRIBUTOR_HUB_SHELL = {
    sizeTier: 'CONTENT',
    panelClass: 'arborito-modal-dock-panel arborito-contributor-modal-shell flex flex-col min-h-0',
    shellOpts: {
        z: 220,
        layout: 'centered',
        rootFlags: 'arborito-modal--construction-dock-hub arborito-modal--contributor',
    },
};

/** Profile-style compact sheet when team hub has little content (gate / local published). */
export const CONTRIBUTOR_COMPACT_SHELL = {
    sizeTier: 'CONTENT',
    panelClass: 'arborito-modal-dock-panel arborito-contributor-modal-shell flex flex-col min-h-0',
    shellOpts: {
        z: 220,
        layout: 'dock-bottom',
        rootFlags: 'arborito-modal--construction-dock-hub arborito-modal--contributor arborito-modal--profile',
    },
};
