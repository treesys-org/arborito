import { parseFolderReadme } from '../../../shared/lib/arborito-archive.js';
import { BRANCH_CHIP_ICON } from '../../tree-graph/api/node-property-emojis.js';

function iconFromRootNode(root) {
    if (!root || typeof root !== 'object') return '';
    const direct = root.icon;
    if (direct && String(direct).trim()) return String(direct).trim();
    if (root.content) {
        try {
            const meta = parseFolderReadme(String(root.content));
            if (meta.icon && String(meta.icon).trim()) return String(meta.icon).trim();
        } catch {
            /* ignore */
        }
    }
    return '';
}

/**
 * Icon for a library branch row in Bosque (catalog), not folder nodes inside the map.
 * @param {{ data?: { languages?: Record<string, { icon?: string, content?: string }>, universePresentation?: { icon?: string } } } | null | undefined} branch
 */
export function resolveBranchCatalogIcon(branch) {
    const pres = branch?.data?.universePresentation;
    if (pres?.icon && String(pres.icon).trim()) return String(pres.icon).trim();

    const langs = branch?.data?.languages;
    if (langs && typeof langs === 'object') {
        for (const key of Object.keys(langs)) {
            const ic = iconFromRootNode(langs[key]);
            if (ic) return ic;
        }
    }
    return BRANCH_CHIP_ICON;
}
