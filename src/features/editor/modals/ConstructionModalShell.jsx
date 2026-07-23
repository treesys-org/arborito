import { DockModalShell, ModalCenteredShell } from '../../../app/components/ModalShell.jsx';
import { DockHubShell } from '../../../app/components/DockHubShell.jsx';
import { DockHubSheet } from '../../../shared/ui/DockHubSheet.jsx';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';

import { CONSTRUCTION_DESKTOP_SHELL_OPTS } from '../api/construction-hub-chrome.js';

export { CONSTRUCTION_DESKTOP_SHELL_OPTS };

function isHubSizeTier(sizeTier) {
    return String(sizeTier || '').toUpperCase() === 'HUB';
}

/**
 * Construction hub shell, mobile dock sheet above construction bar;
 * desktop: full hubs use `DockModalShell` HUB (Arcade family), compact cards use centered shell.
 */
export function ConstructionModalShell({
    dockHost = false,
    mobile: mobileProp,
    compact = false,
    sizeTier = 'CONTENT',
    hero,
    children,
    footer,
    onClose,
    ariaLabel,
    sheetClassName = '',
    instantReveal = false,
    panelDataAttr,
    shellOpts = {},
    panelClass = '',
    skipBodyWrap = false,
}) {
    const mobile = mobileProp == null ? shouldShowMobileUI() : !!mobileProp;
    const instantShellOpts = instantReveal
        ? { ...shellOpts, instantOpen: true, enter: 'instant' }
        : shellOpts;

    if (dockHost && mobile) {
        return (
            <DockHubSheet
                backdropId="construction-dock-hub-backdrop"
                sheetId="construction-dock-hub-sheet"
                ariaLabel={ariaLabel}
                instantReveal={instantReveal}
                onBackdropClose={onClose}
                sheetClassName={sheetClassName}
            >
                <DockHubShell mobile={mobile} hero={hero} skipBodyWrap={skipBodyWrap} footer={footer} compact={compact}>
                    {children}
                </DockHubShell>
            </DockHubSheet>
        );
    }

    if (mobile) {
        return (
            <div data-arborito-panel={panelDataAttr || undefined}>
                <DockModalShell
                    mobile={mobile}
                    sizeTier={sizeTier}
                    panelClass={panelClass || undefined}
                    skipBodyWrap={skipBodyWrap}
                    shellOpts={instantShellOpts}
                    onBackdropClick={onClose}
                    hero={hero}
                    footer={footer}
                >
                    {children}
                </DockModalShell>
            </div>
        );
    }

    if (isHubSizeTier(sizeTier)) {
        return (
            <div data-arborito-panel={panelDataAttr || undefined}>
                <DockModalShell
                    mobile={false}
                    sizeTier="HUB"
                    panelClass={panelClass || undefined}
                    skipBodyWrap={skipBodyWrap}
                    shellOpts={instantShellOpts}
                    onBackdropClick={onClose}
                    hero={hero}
                    footer={footer}
                >
                    {children}
                </DockModalShell>
            </div>
        );
    }

    const desktopShellOpts = {
        ...CONSTRUCTION_DESKTOP_SHELL_OPTS,
        ...instantShellOpts,
        ...shellOpts,
        panelClass: [CONSTRUCTION_DESKTOP_SHELL_OPTS.panelClass, shellOpts.panelClass, panelClass]
            .filter(Boolean)
            .join(' '),
        layout: undefined,
    };

    return (
        <div data-arborito-panel={panelDataAttr || undefined}>
            <ModalCenteredShell
                mobile={false}
                layout="centered"
                sizeTier={sizeTier}
                hero={hero}
                footer={footer}
                panelRadius="2xl"
                shellOpts={desktopShellOpts}
                onBackdropClick={onClose}
            >
                {children}
            </ModalCenteredShell>
        </div>
    );
}
