import { parseFolderReadme } from '../../../shared/lib/arborito-archive.js';
import { BRANCH_CHIP_ICON } from '../../tree-graph/api/node-property-emojis.js';
import { kindEmoji, listingKind } from './sources-kind-ui.js';

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

/** Cap catalog emoji for directory wire / storage (one glyph + variation selectors). */
export function normalizeDirectoryCatalogIcon(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    /* Reject URLs / long blobs — catalog icon is a short emoji/glyph only.
     * Allow ZWJ / skin-tone sequences (often >16 UTF-16 units). */
    if (s.length > 32 || /https?:\/\//i.test(s) || s.includes('/')) return '';
    return s.slice(0, 32);
}

/**
 * Icon for a library branch row in Bosque (catalog), not folder nodes inside the map.
 * @param {{ data?: { languages?: Record<string, { icon?: string, content?: string } }, universePresentation?: { icon?: string } } } | null | undefined} branch
 */
export function resolveBranchCatalogIcon(branch) {
    const fromPres = normalizeDirectoryCatalogIcon(branch?.data?.universePresentation?.icon);
    if (fromPres) return fromPres;

    const langs = branch?.data?.languages;
    if (langs && typeof langs === 'object') {
        for (const key of Object.keys(langs)) {
            const ic = normalizeDirectoryCatalogIcon(iconFromRootNode(langs[key]));
            if (ic) return ic;
        }
    }
    return BRANCH_CHIP_ICON;
}

/**
 * Catalog emoji for a soon-to-publish directory row (from bundle / tree data).
 * @param {{ meta?: { icon?: string }, tree?: object } | null | undefined} bundle
 * @param {object | null | undefined} [extra] composed-tree entry or presentation overlay
 */
export function resolveDirectoryIconForPublish(bundle, extra = null) {
    const fromExtra = normalizeDirectoryCatalogIcon(
        extra?.icon || extra?.data?.universePresentation?.icon || extra?.universePresentation?.icon
    );
    if (fromExtra) return fromExtra;
    const fromMeta = normalizeDirectoryCatalogIcon(bundle?.meta?.icon);
    if (fromMeta) return fromMeta;
    const tree = bundle?.tree;
    if (!tree || typeof tree !== 'object') return '';
    const fromPres = normalizeDirectoryCatalogIcon(tree.universePresentation?.icon || tree.icon);
    if (fromPres) return fromPres;
    const langs = tree.languages;
    if (langs && typeof langs === 'object') {
        for (const key of Object.keys(langs)) {
            const ic = normalizeDirectoryCatalogIcon(iconFromRootNode(langs[key]));
            if (ic) return ic;
        }
    }
    return '';
}

/**
 * Forest emoji for Discover / Saved online rows (directory meta may omit `icon`).
 * Prefer wire icon → local twin / loaded tree → kind glyph.
 *
 * @param {{
 *   icon?: string,
 *   contentKind?: string,
 *   universeId?: string,
 *   localBranch?: object|null,
 *   treeJson?: object|null,
 * }} opts
 */
export function resolveOnlineListingIcon(opts = {}) {
    const wire = normalizeDirectoryCatalogIcon(opts.icon);
    if (wire) return wire;
    if (opts.localBranch) {
        const fromLocal = resolveBranchCatalogIcon(opts.localBranch);
        if (fromLocal) return fromLocal;
    }
    const fromTree = resolveDirectoryIconForPublish(opts.treeJson ? { tree: opts.treeJson } : null);
    if (fromTree) return fromTree;
    return kindEmoji(listingKind(opts.contentKind, opts.universeId));
}
