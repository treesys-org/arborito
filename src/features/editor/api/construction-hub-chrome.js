/** Construction dock hub modals, sheet above dock (history, publish, team). */

export { CONSTRUCTION_DOCK_HUB_MODAL_TYPES } from '../../../app/modal-surface-routing.js';

export {
    shouldRenderConstructionDockHubInPanel,
    resolveConstructionDockHubChunkType,
} from '../../../app/modal-surface-routing.js';

export {
    CONSTRUCTION_HUB_COMPACT_SHEET_CLASS,
    isConstructionHubCompact,
    constructionHubSheetClassName,
} from './construction-hub-sheet.js';

export const CONSTRUCTION_DESKTOP_SHELL_OPTS = {
    z: 220,
    enter: 'fade-fast',
    scrim: 'translucent',
    panelClass: 'max-h-[min(90vh,720px)]',
};

export const CONSTRUCTION_HISTORY_HUB_SHELL = {
    sizeTier: 'HUB',
    panelClass: 'arborito-modal-dock-panel arborito-construction-history-shell flex flex-col min-h-0',
    shellOpts: {
        z: 220,
        scrim: 'translucent',
        rootFlags: 'arborito-modal--construction-dock-hub arborito-modal--construction-history',
        layout: 'dock',
    },
};

export const PUBLISH_HUB_SHELL = {
    sizeTier: 'HUB',
    panelClass: 'arborito-modal-dock-panel arborito-construction-publish-shell flex flex-col min-h-0',
    shellOpts: {
        z: 220,
        scrim: 'translucent',
        rootFlags: 'arborito-modal--construction-dock-hub arborito-modal--construction-about',
        layout: 'dock',
    },
};

/** Publish hub as content-height sheet (not full viewport hub). */
export const CONSTRUCTION_EDIT_PICK_SHELL = {
    sizeTier: 'COMPACT',
    panelClass: 'arborito-modal-dock-panel arborito-construction-edit-pick-shell flex flex-col min-h-0',
    shellOpts: {
        z: 220,
        scrim: 'translucent',
        rootFlags: 'arborito-modal--construction-dock-hub arborito-modal--construction-edit-pick',
        layout: 'dock-bottom',
    },
};

export const PUBLISH_COMPACT_SHELL = {
    sizeTier: 'CONTENT',
    panelClass: 'arborito-modal-dock-panel arborito-construction-publish-shell flex flex-col min-h-0 max-h-[85vh]',
    shellOpts: {
        z: 220,
        scrim: 'translucent',
        rootFlags: 'arborito-modal--construction-dock-hub arborito-modal--construction-about',
        layout: 'dock-bottom',
    },
};
