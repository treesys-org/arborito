import { parseFolderReadme } from '../../../shared/lib/arborito-archive.js';
import { BRANCH_CHIP_ICON } from '../../tree-graph/api/node-property-emojis.js';
import { kindEmoji, listingKind } from './sources-kind-ui.js';

/** Session sticky: once we resolve a real catalog emoji for a branch, keep it
 * even if a later catalog pass temporarily lacks `data` (avoids 🐧 → 🌿 flash). */
const BRANCH_ICON_STICKY = new Map();
const ONLINE_ICON_STICKY = new Map();

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

function isGenericCatalogIcon(icon) {
    const s = String(icon || '').trim();
    return !s || s === BRANCH_CHIP_ICON || s === '🌳';
}

function resolveBranchCatalogIconFresh(branch) {
    const fromEntry = normalizeDirectoryCatalogIcon(branch?.icon);
    if (fromEntry && !isGenericCatalogIcon(fromEntry)) return fromEntry;

    const fromData = normalizeDirectoryCatalogIcon(branch?.data?.icon);
    if (fromData && !isGenericCatalogIcon(fromData)) return fromData;

    const fromPres = normalizeDirectoryCatalogIcon(branch?.data?.universePresentation?.icon);
    if (fromPres && !isGenericCatalogIcon(fromPres)) return fromPres;

    const langs = branch?.data?.languages;
    if (langs && typeof langs === 'object') {
        for (const key of Object.keys(langs)) {
            const ic = normalizeDirectoryCatalogIcon(iconFromRootNode(langs[key]));
            if (ic && !isGenericCatalogIcon(ic)) return ic;
        }
    }

    if (fromEntry) return fromEntry;
    if (fromData) return fromData;
    if (fromPres) return fromPres;
    return '';
}

/**
 * Icon for a library branch row in Bosque (catalog), not folder nodes inside the map.
 * @param {{ id?: string, icon?: string, data?: { icon?: string, languages?: Record<string, { icon?: string, content?: string } }, universePresentation?: { icon?: string } } } | null | undefined} branch
 */
export function resolveBranchCatalogIcon(branch) {
    const id = String(branch?.id || '').trim();
    const fresh = resolveBranchCatalogIconFresh(branch);
    if (fresh && !isGenericCatalogIcon(fresh)) {
        if (id) BRANCH_ICON_STICKY.set(id, fresh);
        return fresh;
    }
    if (id && BRANCH_ICON_STICKY.has(id)) return BRANCH_ICON_STICKY.get(id);
    return fresh || BRANCH_CHIP_ICON;
}

/**
 * Persist a resolved non-generic catalog icon onto the branch meta (quiet).
 * Stops future list passes from falling back to 🌿 when `data` is briefly absent.
 * @param {{ state?: { branches?: object[] }, markBranchDirty?: Function } | null | undefined} userStore
 * @param {object | null | undefined} branch
 */
export function backfillBranchCatalogIcon(userStore, branch) {
    const id = String(branch?.id || '').trim();
    if (!id || !userStore) return;
    const ic = resolveBranchCatalogIcon(branch);
    if (!ic || isGenericCatalogIcon(ic)) return;
    const entry = (userStore.state?.branches || []).find((b) => String(b?.id) === id) || branch;
    if (!entry) return;
    if (String(entry.icon || '').trim() === ic) return;
    entry.icon = ic;
    try {
        userStore.markBranchDirty?.(id, { skipAccountSync: true });
    } catch {
        /* ignore */
    }
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

/** Session sticky for composed trees (same idea as BRANCH_ICON_STICKY). */
const COMPOSED_ICON_STICKY = new Map();

/**
 * Catalog emoji for a local composed tree (playlist) row / chip / switcher.
 * @param {object | null | undefined} tree
 * @param {{ communitySources?: object[] } | null | undefined} [opts]
 */
export function resolveComposedTreeCatalogIcon(tree, opts = null) {
    const id = String(tree?.id || '').trim();
    const fromPublish = resolveDirectoryIconForPublish(
        tree?.data ? { tree: tree.data, meta: tree.data?.meta } : null,
        tree
    );
    if (fromPublish && !isGenericCatalogIcon(fromPublish)) {
        if (id) COMPOSED_ICON_STICKY.set(id, fromPublish);
        return fromPublish;
    }
    const direct = normalizeDirectoryCatalogIcon(tree?.icon);
    if (direct && !isGenericCatalogIcon(direct)) {
        if (id) COMPOSED_ICON_STICKY.set(id, direct);
        return direct;
    }

    const community = Array.isArray(opts?.communitySources) ? opts.communitySources : [];
    if (community.length) {
        const share = String(
            tree?.shareCode || tree?.publishedShareCode || tree?.data?.meta?.shareCode || ''
        )
            .trim()
            .toUpperCase();
        const pubUrl = String(tree?.publishedNetworkUrl || '').trim();
        for (const s of community) {
            if (!s) continue;
            const sc = String(s.shareCode || '')
                .trim()
                .toUpperCase();
            const su = String(s.url || '').trim();
            const hit =
                (share && sc && share === sc) ||
                (pubUrl && su && (su === pubUrl || su.includes(String(tree?.id || ''))));
            if (!hit) continue;
            const ic = normalizeDirectoryCatalogIcon(s.icon);
            if (ic && !isGenericCatalogIcon(ic)) {
                if (id) COMPOSED_ICON_STICKY.set(id, ic);
                return ic;
            }
        }
    }

    if (id && COMPOSED_ICON_STICKY.has(id)) return COMPOSED_ICON_STICKY.get(id);
    return direct || kindEmoji('composed-tree');
}

/**
 * Forest emoji for Discover / Saved online rows (directory meta may omit `icon`).
 * Prefer wire icon → local twin / loaded tree → sticky → kind glyph.
 *
 * @param {{
 *   icon?: string,
 *   contentKind?: string,
 *   universeId?: string,
 *   ownerPub?: string,
 *   localBranch?: object|null,
 *   treeJson?: object|null,
 * }} opts
 */
export function resolveOnlineListingIcon(opts = {}) {
    const stickyKey = `${String(opts.ownerPub || '').trim()}/${String(opts.universeId || '').trim()}`;
    const wire = normalizeDirectoryCatalogIcon(opts.icon);
    if (wire && !isGenericCatalogIcon(wire)) {
        if (stickyKey !== '/') ONLINE_ICON_STICKY.set(stickyKey, wire);
        return wire;
    }
    if (opts.localBranch) {
        const fromLocal = resolveBranchCatalogIcon(opts.localBranch);
        if (fromLocal && !isGenericCatalogIcon(fromLocal)) {
            if (stickyKey !== '/') ONLINE_ICON_STICKY.set(stickyKey, fromLocal);
            return fromLocal;
        }
    }
    const fromTree = resolveDirectoryIconForPublish(opts.treeJson ? { tree: opts.treeJson } : null);
    if (fromTree && !isGenericCatalogIcon(fromTree)) {
        if (stickyKey !== '/') ONLINE_ICON_STICKY.set(stickyKey, fromTree);
        return fromTree;
    }
    if (stickyKey !== '/' && ONLINE_ICON_STICKY.has(stickyKey)) {
        return ONLINE_ICON_STICKY.get(stickyKey);
    }
    if (wire) return wire;
    return kindEmoji(listingKind(opts.contentKind, opts.universeId));
}
