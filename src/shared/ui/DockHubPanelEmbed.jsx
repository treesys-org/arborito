import { DockHubShell } from '../../app/components/DockHubShell.jsx';

/**
 * Inner dock hub chrome without sheet/backdrop, parent `DockHubPanelLayer` owns the sheet.
 */
export function DockHubPanelEmbed({ panelId, hero, toolbar, children, skipBodyWrap, overlay = null }) {
    return (
        <div data-arborito-panel={panelId} className="flex flex-col flex-1 min-h-0 h-full min-w-0">
            <DockHubShell
                mobile
                hero={hero}
                toolbar={toolbar}
                skipBodyWrap={skipBodyWrap}
                overlay={overlay}
            >
                {children}
            </DockHubShell>
        </div>
    );
}
