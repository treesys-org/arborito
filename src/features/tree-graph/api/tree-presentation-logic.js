import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { fileSystem } from '../../backup-export/api/filesystem.js';
import { parseNostrTreeUrl } from '../../nostr/api/nostr-refs.js';
import { safeStripeSupportUrl } from '../../../shared/lib/stripe-support-url.js';
import {
    anonOwnerLabel,
    currentOnlineAccountUsername,
    forumDisplayNameForPub,
    resolveOpenTreeOwnerDisplay,
} from './tree-owner-display.js';
import { resolvePresentationAboutKind } from '../../editor/api/construction-enter-flow.js';

export function constructionSheetTitle(ui, aboutKind) {
    if (aboutKind === 'tree') {
        return ui.constructionScopeTreeInfoLabel || ui.treePresentationTitle || 'About this tree';
    }
    return ui.constructionScopeBranchInfoLabel || ui.constructionPresentationTitle || 'Branch description';
}

export function collectTreeIdentities() {
    const v = store.value;
    const ui = store.ui;
    const treeRef = parseNostrTreeUrl((v.activeSource && v.activeSource.url) || '');
    const out = { owner: null, collaborators: [] };

    const labelForCollaborator = (pub) => {
        const p = String(pub || '');
        if (!p) return { label: '', sub: '' };
        const forumName = forumDisplayNameForPub(store, p);
        const short = `${p.slice(0, 6)}…${p.slice(-4)}`;
        if (forumName) return { label: forumName, sub: short };
        return { label: anonOwnerLabel(p), sub: short };
    };

    if (treeRef) {
        const ownerInfo = resolveOpenTreeOwnerDisplay(store, treeRef.pub);
        out.owner = {
            pub: treeRef.pub,
            label: ownerInfo.label || (ui.treeMetaCollaboratorOwner || 'Owner'),
            sub: ownerInfo.sub,
            role: ui.treeMetaCollaboratorOwner || 'Owner',
        };
        const roles = (v && v.treeCollaboratorRoles) || {};
        for (const pub of Object.keys(roles)) {
            if (pub === treeRef.pub) continue;
            const r = roles[pub];
            if (r !== 'editor' && r !== 'proposer') continue;
            const info = labelForCollaborator(pub);
            out.collaborators.push({
                pub,
                label: info.label || anonOwnerLabel(pub),
                sub: info.sub,
                role:
                    r === 'editor'
                        ? ui.treeMetaCollaboratorEditor || 'Editor'
                        : ui.treeMetaCollaboratorProposer || 'Proposes changes',
            });
        }
    } else {
        const ownerInfo = resolveOpenTreeOwnerDisplay(store, '');
        if (ownerInfo.label) {
            out.owner = {
                pub: '',
                label: ownerInfo.label,
                sub: '',
                role: ui.treeMetaCollaboratorOwner || 'Owner',
            };
        }
    }
    return out;
}

export function currentIdentityNameForSave(previousAuthorName) {
    const session = currentOnlineAccountUsername(store);
    if (session) return session;
    return String(previousAuthorName || '').trim();
}

export function resolvePresentationState({ isModalHost }) {
    const v = store.value;
    const ui = store.ui;

    if (!isModalHost) return { visible: false, reason: 'graph-host-removed' };
    if (!v.constructionMode) return { visible: false, reason: 'not-construction' };
    const raw = v.rawGraphData;
    if (!raw) return { visible: false, reason: 'no-data' };

    const canEdit =
        fileSystem.features.canWrite &&
        (!!fileSystem.isLocal || !!parseNostrTreeUrl((v.activeSource && v.activeSource.url) || ''));
    if (!canEdit) return { visible: false, reason: 'no-edit' };

    const aboutKind = resolvePresentationAboutKind();
    if (!aboutKind) return { visible: false, reason: 'no-about-scope' };

    let pres =
        aboutKind === 'tree'
            ? (() => {
                  const treeId = fileSystem.composedTreeId();
                  const entry = treeId ? store.userStore?.getTree?.(treeId) : null;
                  return entry?.presentation && typeof entry.presentation === 'object' ? entry.presentation : {};
              })()
            : raw.universePresentation && typeof raw.universePresentation === 'object'
              ? raw.universePresentation
              : {};

    const desc = String(pres.description || '').trim();
    const authorName = String(pres.authorName || '').trim();
    const supportRaw = String(pres.supportUrl || '').trim();
    const supportUrl = safeStripeSupportUrl(supportRaw);
    const supportInputValue = supportUrl || supportRaw;

    return {
        visible: true,
        placement: 'modal',
        aboutKind,
        ui,
        desc,
        authorName,
        supportInputValue,
        supportUrl,
        pres,
        title: constructionSheetTitle(ui, aboutKind),
    };
}

export function savePresentationMetadata({ aboutKind, description, authorName, authorAbout, supportUrl }) {
    if (aboutKind === 'tree') {
        const treeId = fileSystem.composedTreeId();
        const entry = treeId ? store.userStore?.getTree?.(treeId) : null;
        if (!entry || !treeId) return false;
        const prev = entry.presentation && typeof entry.presentation === 'object' ? entry.presentation : {};
        store.userStore.updateTree(treeId, {
            presentation: {
                ...prev,
                description,
                authorName,
                authorAbout,
                supportUrl,
            },
        });
        return true;
    }
    store.updateUniversePresentation({ description, authorName, authorAbout, supportUrl });
    if (typeof store.persistActiveBranchIfNeeded === 'function') {
        store.persistActiveBranchIfNeeded();
    }
    return true;
}
