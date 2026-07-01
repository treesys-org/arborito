/**
 * Portable CC attribution for .arborito archives (branches + composed trees).
 */

import { parseNostrTreeUrl } from '../../features/nostr/api/nostr-refs.js';

export const ARBORITO_LICENSE = 'CC-BY-SA-4.0';
export const ARBORITO_LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';

/**
 * @typedef {object} ArboritoAttribution
 * @property {string} [description]
 * @property {string} [authorName]
 * @property {string} [authorAbout]
 * @property {string} [supportUrl]
 * @property {string} license
 * @property {string} [licenseUrl]
 * @property {string} [ownerPub]
 * @property {{ pub: string, role?: string, displayName?: string }[]} [collaborators]
 * @property {{ treeUrl?: string, ownerPub?: string, universeId?: string, name?: string, treeId?: string }} [forkOf]
 * @property {string} [exportedAt]
 * @property {string} [contentKind]
 */

/** @param {unknown} raw */
export function normalizeAttribution(raw) {
    const a = raw && typeof raw === 'object' ? raw : {};
    const collaborators = Array.isArray(a.collaborators)
        ? a.collaborators
              .map((c) => ({
                  pub: String(c?.pub || '').trim(),
                  role: String(c?.role || '').trim() || undefined,
                  displayName: String(c?.displayName || c?.label || '').trim() || undefined,
              }))
              .filter((c) => c.pub || c.displayName)
        : undefined;
    const forkRaw = a.forkOf && typeof a.forkOf === 'object' ? a.forkOf : null;
    const forkOf = forkRaw
        ? {
              treeUrl: String(forkRaw.treeUrl || '').trim() || undefined,
              ownerPub: String(forkRaw.ownerPub || '').trim() || undefined,
              universeId: String(forkRaw.universeId || '').trim() || undefined,
              name: String(forkRaw.name || '').trim() || undefined,
              treeId: String(forkRaw.treeId || '').trim() || undefined,
          }
        : undefined;
    const out = {
        license: String(a.license || ARBORITO_LICENSE).trim() || ARBORITO_LICENSE,
        licenseUrl: String(a.licenseUrl || ARBORITO_LICENSE_URL).trim() || ARBORITO_LICENSE_URL,
    };
    const desc = String(a.description || '').trim();
    const authorName = String(a.authorName || '').trim();
    const authorAbout = String(a.authorAbout || '').trim();
    const supportUrl = String(a.supportUrl || '').trim();
    const ownerPub = String(a.ownerPub || '').trim();
    const exportedAt = String(a.exportedAt || '').trim();
    const contentKind = String(a.contentKind || '').trim();
    if (desc) out.description = desc;
    if (authorName) out.authorName = authorName;
    if (authorAbout) out.authorAbout = authorAbout;
    if (supportUrl) out.supportUrl = supportUrl;
    if (ownerPub) out.ownerPub = ownerPub;
    if (collaborators?.length) out.collaborators = collaborators;
    if (forkOf && (forkOf.treeUrl || forkOf.ownerPub || forkOf.name)) out.forkOf = forkOf;
    if (exportedAt) out.exportedAt = exportedAt;
    if (contentKind) out.contentKind = contentKind;
    return out;
}

/** @param {object} pres universePresentation or presentation blob */
export function attributionFromPresentation(pres, extras = {}) {
    const p = pres && typeof pres === 'object' ? pres : {};
    return normalizeAttribution({
        description: p.description,
        authorName: p.authorName,
        authorAbout: p.authorAbout,
        supportUrl: p.supportUrl,
        license: p.license,
        licenseUrl: p.licenseUrl,
        ownerPub: p.ownerPub,
        collaborators: p.collaborators,
        forkOf: p.forkOf,
        ...extras,
    });
}

/**
 * @param {import('../../core/store.js').Store} store
 * @param {{ treeData: object, branchId?: string }} opts
 */
export function buildBranchExportAttribution(store, { treeData, branchId } = {}) {
    const pres =
        treeData?.universePresentation && typeof treeData.universePresentation === 'object'
            ? treeData.universePresentation
            : {};
    let ownerPub = String(pres.ownerPub || '').trim();
    let collaborators = Array.isArray(pres.collaborators) ? [...pres.collaborators] : [];
    const active = store?.value?.activeSource;
    const bid = String(branchId || '').trim();
    if (active && bid && String(active.id) === bid) {
        const ref = parseNostrTreeUrl(String(active.url || ''));
        if (ref?.pub) ownerPub = ref.pub;
        const roles = store.value?.treeCollaboratorRoles || {};
        if (!collaborators.length && roles && typeof roles === 'object') {
            collaborators = Object.entries(roles)
                .filter(([, role]) => role === 'editor' || role === 'proposer')
                .map(([pub, role]) => ({ pub: String(pub), role: String(role) }));
        }
    }
    return normalizeAttribution({
        ...pres,
        ownerPub: ownerPub || undefined,
        collaborators: collaborators.length ? collaborators : undefined,
        contentKind: 'branch',
        exportedAt: new Date().toISOString(),
    });
}

/**
 * @param {import('../../core/store.js').Store} store
 * @param {object} treeEntry
 */
export function buildComposedTreeExportAttribution(store, treeEntry) {
    const pres =
        treeEntry?.presentation && typeof treeEntry.presentation === 'object'
            ? treeEntry.presentation
            : {};
    const accountName =
        (typeof store?.getAccountUsername === 'function' && store.getAccountUsername()) ||
        (typeof store?.currentUsername === 'function' && store.currentUsername()) ||
        '';
    let ownerPub = String(pres.ownerPub || '').trim();
    if (!ownerPub && treeEntry?.publishedNetworkUrl) {
        try {
            const ref = parseNostrTreeUrl(String(treeEntry.publishedNetworkUrl));
            if (ref?.pub) ownerPub = ref.pub;
        } catch {
            /* ignore */
        }
    }
    return normalizeAttribution({
        description: pres.description || '',
        authorName: String(pres.authorName || accountName || '').trim() || undefined,
        authorAbout: pres.authorAbout || '',
        supportUrl: pres.supportUrl || '',
        ownerPub: ownerPub || undefined,
        collaborators: pres.collaborators,
        forkOf: treeEntry?.forkOf || pres.forkOf || null,
        contentKind: 'composed-tree',
        exportedAt: new Date().toISOString(),
    });
}

/** Merge attribution into branch `tree.universePresentation`. */
export function applyAttributionToTreeData(treeData, attribution) {
    if (!treeData || typeof treeData !== 'object' || !attribution) return treeData;
    const a = normalizeAttribution(attribution);
    const cur =
        treeData.universePresentation && typeof treeData.universePresentation === 'object'
            ? { ...treeData.universePresentation }
            : {};
    treeData.universePresentation = {
        ...cur,
        description: a.description ?? cur.description,
        authorName: a.authorName ?? cur.authorName,
        authorAbout: a.authorAbout ?? cur.authorAbout,
        supportUrl: a.supportUrl ?? cur.supportUrl,
        license: a.license,
        licenseUrl: a.licenseUrl,
        ownerPub: a.ownerPub ?? cur.ownerPub,
        collaborators: a.collaborators ?? cur.collaborators,
        forkOf: a.forkOf ?? cur.forkOf,
    };
    return treeData;
}

/** @param {object} treeEntry */
export function applyAttributionToComposedTreeEntry(treeEntry, attribution) {
    if (!treeEntry || !attribution) return treeEntry;
    const a = normalizeAttribution(attribution);
    treeEntry.presentation = {
        ...(treeEntry.presentation && typeof treeEntry.presentation === 'object' ? treeEntry.presentation : {}),
        description: a.description,
        authorName: a.authorName,
        authorAbout: a.authorAbout,
        supportUrl: a.supportUrl,
        license: a.license,
        licenseUrl: a.licenseUrl,
        ownerPub: a.ownerPub,
        collaborators: a.collaborators,
    };
    if (a.forkOf) treeEntry.forkOf = a.forkOf;
    return treeEntry;
}

/**
 * Human-readable summary for info dialogs.
 * @param {object} ui
 * @param {ArboritoAttribution} attribution
 */
export function formatAttributionSummary(ui, attribution) {
    const a = normalizeAttribution(attribution);
    const lines = [];
    if (a.authorName) {
        lines.push(
            String(ui.attributionAuthorLine || 'Author: {name}').replace(/\{name\}/g, a.authorName)
        );
    }
    if (a.description) lines.push(a.description);
    if (a.collaborators?.length) {
        lines.push(ui.attributionCollaboratorsHead || 'Collaborators:');
        for (const c of a.collaborators.slice(0, 12)) {
            const name = c.displayName || c.pub || '';
            const role = c.role ? ` (${c.role})` : '';
            if (name) lines.push(`  • ${name}${role}`);
        }
        const extra = a.collaborators.length - 12;
        if (extra > 0) {
            lines.push(
                String(ui.attributionCollaboratorsMore || '  …and {n} more').replace(/\{n\}/g, String(extra))
            );
        }
    }
    if (a.forkOf?.name || a.forkOf?.treeUrl) {
        const forkLabel = a.forkOf.name || a.forkOf.treeUrl || '';
        lines.push(
            String(ui.attributionForkOfLine || 'Remix of: {name}').replace(/\{name\}/g, forkLabel)
        );
    }
    lines.push(
        String(ui.attributionLicenseLine || 'License: {license}').replace(/\{license\}/g, a.license)
    );
    return lines.filter(Boolean).join('\n');
}

export function attributionJsonBytes(attribution) {
    const enc = new TextEncoder();
    return enc.encode(JSON.stringify(normalizeAttribution(attribution), null, 2) + '\n');
}
