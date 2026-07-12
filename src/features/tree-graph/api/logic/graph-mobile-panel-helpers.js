import {
    folderDisplayIcon,
    FOLDER_DISPLAY_ICON,
} from '../node-property-emojis.js';

/** Pure, branch icon for panel head / switcher chip. */
export function resolveBranchPanelIcon(current) {
    if (!current || current.type !== 'branch') return '';
    let ic = current.icon;
    if (!ic) ic = FOLDER_DISPLAY_ICON;
    else ic = folderDisplayIcon(ic);
    return ic;
}

/** Pure, tree root icon from processed `data` root node. */
export function resolvePanelTreeIcon(dataRoot) {
    if (!dataRoot) return FOLDER_DISPLAY_ICON;
    if (dataRoot.icon) return folderDisplayIcon(dataRoot.icon);
    return FOLDER_DISPLAY_ICON;
}

/** Pure, explore mode curriculum chip visibility. */
export function exploreShowsCurriculumChip(
    { constructionMode, viewMode, activeSource },
    current
) {
    if (constructionMode) return false;
    if (viewMode !== 'explore') return false;
    if (!activeSource) return false;
    if (current?.type === 'root') return true;
    if (current?._composedVirtualRoot) return true;
    return false;
}
