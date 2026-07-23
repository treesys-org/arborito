import { DockModalShell, ModalCenteredShell } from '../../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { DockHubShell } from '../../../app/components/DockHubShell.jsx';
import { DockHubSheet } from '../../../shared/ui/DockHubSheet.jsx';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { contributorModalTitle, CONTRIBUTOR_HUB_SHELL, CONTRIBUTOR_COMPACT_SHELL } from '../api/contributor-hub-chrome.js';
import {
    CONSTRUCTION_HUB_COMPACT_SHEET_CLASS,
    constructionHubSheetClassName,
} from '../../editor/api/construction-hub-sheet.js';
import { CONSTRUCTION_DESKTOP_SHELL_OPTS } from '../../editor/api/construction-hub-chrome.js';

/** Shared shell for team/governance hub (loaded modal + chunk fallback). */
export function ContributorHubShell({
    ui,
    mobile: mobileProp,
    onClose,
    children,
    footer,
    showClose = true,
    dockHost = false,
    compact = false,
    contributorView,
    instantReveal = false,
}) {
    const mobile = mobileProp == null ? shouldShowMobileUI() : !!mobileProp;
    const instantShellOpts = instantReveal
        ? { instantOpen: true, enter: 'instant' }
        : {};
    const title = contributorModalTitle(ui);
    const shell = compact ? CONTRIBUTOR_COMPACT_SHELL : CONTRIBUTOR_HUB_SHELL;
    const sheetClass = dockHost
        ? compact
            ? CONSTRUCTION_HUB_COMPACT_SHEET_CLASS
            : constructionHubSheetClassName('contributor', { contributorView })
        : '';
    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={title}
            subtitle={ui.contributorHubSheetTagline || ui.conGovTooltip || undefined}
            titleId="contributor-modal-title"
            leadingIcon="👥"
            tagClass="btn-contributor-close"
            onClose={showClose ? onClose : undefined}
            showClose={showClose}
        />
    );

    const body = (
        <div
            className={
                compact
                    ? 'overflow-y-auto custom-scrollbar min-h-0 px-4 py-4 md:px-6 md:py-5'
                    : 'flex flex-col flex-1 min-h-0 overflow-y-auto custom-scrollbar'
            }
        >
            {children}
        </div>
    );

    if (dockHost && mobile) {
        return (
            <DockHubSheet
                backdropId="construction-dock-hub-backdrop"
                sheetId="construction-dock-hub-sheet"
                ariaLabel={title}
                instantReveal={instantReveal}
                onBackdropClose={onClose}
                sheetClassName={sheetClass}
            >
                <DockHubShell mobile={mobile} hero={hero} skipBodyWrap compact={compact} footer={footer}>
                    {body}
                </DockHubShell>
            </DockHubSheet>
        );
    }

    if (mobile) {
        return (
            <DockModalShell
                mobile={mobile}
                sizeTier={shell.sizeTier}
                panelClass={shell.panelClass}
                skipBodyWrap
                shellOpts={{ ...shell.shellOpts, ...instantShellOpts }}
                onBackdropClick={onClose}
                hero={hero}
                footer={footer}
            >
                {body}
            </DockModalShell>
        );
    }

    if (!mobile) {
        if (!compact) {
        return (
            <DockModalShell
                mobile={false}
                sizeTier={shell.sizeTier}
                panelClass={shell.panelClass}
                skipBodyWrap
                shellOpts={{ ...shell.shellOpts, ...instantShellOpts }}
                onBackdropClick={onClose}
                hero={hero}
                footer={footer}
            >
                {body}
            </DockModalShell>
        );
        }

        return (
            <ModalCenteredShell
                mobile={false}
                layout="centered"
                sizeTier="CONTENT"
                hero={hero}
                footer={footer}
                panelRadius="2xl"
                shellOpts={{ ...CONSTRUCTION_DESKTOP_SHELL_OPTS, ...instantShellOpts }}
                onBackdropClick={onClose}
            >
                {body}
            </ModalCenteredShell>
        );
    }
}
