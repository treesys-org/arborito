import { getArboritoStore } from '../core/store-singleton.js';
import { DataProcessor } from '../features/tree-graph/api/data-processor.js';
import { buildDefaultLessonMarkdown } from '../features/learning/api/default-lesson-markdown.js';
import { buildDefaultExamMarkdown } from '../features/learning/api/default-exam-markdown.js';
import {
    addChildToAllLanguages,
    findNodeById,
    findNodeByPathHint,
    findParentByFolderPath,
    removeNodeByIdAllLanguages,
    renameNodeByIdAllLanguages,
    reparentNodeByIdAllLanguages
} from '../features/tree-graph/api/raw-graph-mutations.js';
import { syncReadmeFromUniversePresentation } from '../features/learning/api/course-intro-markdown.js';
import { parseFolderReadme } from '../shared/lib/arborito-archive.js';
import { safeStripeSupportUrl } from '../shared/lib/stripe-support-url.js';
import { currentOnlineAccountUsername } from '../features/tree-graph/api/tree-owner-display.js';
import { parseNostrTreeUrl, formatNostrTreeUrl, createNostrPair } from '../features/nostr/api/nostr-refs.js';
import { fileSystem } from '../features/backup-export/api/filesystem.js';
import { isArboritoDemoTree } from '../features/publishing/api/demo-tree-guard.js';
import { isCurriculumPresetCode } from '../features/sources/api/curriculum-locale-presets.js';
import { getPanelRef } from '../app/panel-refs.js';
import { resolveMutableBranchCurriculum } from '../core/user-store/branch-curriculum-target.js';
import { branchIdFromBranchUrl } from '../shared/lib/branch-id.js';

function shell() {
    return getArboritoStore();
}

/** Mixin applied to `Store.prototype`, public graph under construction, curriculum, and user SEA keypair. */

export function canOfferCurriculumLanguageAddAction() {
    const store = shell();
    if (!store) return undefined;

            if (!store.state.constructionMode) return false;
            if (!fileSystem.features.canWrite) return false;
            if (store.getActivePublicTreeRef() && !store.canMutateNostrGraph()) return false;
            const raw = store.state.rawGraphData;
            return !!((raw && raw.languages) && Object.keys(raw.languages).length);

}

/** Same write gates as add; needs at least two curriculum languages to remove one. */
export function canOfferCurriculumLanguageRemoveAction() {
    const store = shell();
    if (!store) return false;
    if (!store.state.constructionMode) return false;
    if (!fileSystem.features.canWrite) return false;
    if (store.getActivePublicTreeRef() && !store.canMutateNostrGraph()) return false;
    const raw = store.state.rawGraphData;
    const keys = raw?.languages && typeof raw.languages === 'object' ? Object.keys(raw.languages) : [];
    return keys.length > 1;
}

export function applyNodeContentToRawGraphAction(nodeId, rawFileContent, metaFromEditor) {
    const store = shell();
    if (!store) return undefined;

            if (store.getActivePublicTreeRef() && !store.canMutateNostrGraph()) {
                notifyNostrMutateDenied(store);
                return false;
            }
            const raw = JSON.parse(JSON.stringify(store.state.rawGraphData || {}));
            if (!raw.languages) return false;
            let touched = false;
            let contentLang = null;
            const preferred = store.getCurrentContentLangKey?.() || Object.keys(raw.languages)[0];
            const langKeys = Object.keys(raw.languages);
            const order =
                preferred && raw.languages[preferred]
                    ? [preferred, ...langKeys.filter((k) => k !== preferred)]
                    : langKeys;
            const structuralMeta =
                metaFromEditor && typeof metaFromEditor === 'object'
                    ? {
                          title: metaFromEditor.title,
                          icon: metaFromEditor.icon,
                          description: metaFromEditor.description,
                          order: metaFromEditor.order,
                          isCertifiable:
                              'isCertifiable' in metaFromEditor ? !!metaFromEditor.isCertifiable : undefined,
                      }
                    : null;
            /* Body content is per-language; title/icon/description/diploma mirror where the id exists. */
            for (const lang of order) {
                const root = raw.languages[lang];
                if (!root) continue;
                const hit = findNodeById(root, nodeId);
                if (!hit) continue;
                touched = true;
                if (rawFileContent != null && contentLang == null) {
                    const isFolder = hit.type === 'branch' || hit.type === 'root';
                    if (isFolder) {
                        hit.content = rawFileContent;
                        const folderMeta = parseFolderReadme(rawFileContent);
                        if (folderMeta.icon) hit.icon = folderMeta.icon;
                        if (folderMeta.description != null) hit.description = folderMeta.description;
                        if (folderMeta.certifiable) hit.isCertifiable = true;
                        else if ('certifiable' in folderMeta) hit.isCertifiable = false;
                    } else {
                        hit.content = rawFileContent;
                    }
                    contentLang = lang;
                }
                if (structuralMeta) {
                    if (structuralMeta.title) hit.name = structuralMeta.title;
                    if (structuralMeta.icon) hit.icon = structuralMeta.icon;
                    if (structuralMeta.description != null) hit.description = structuralMeta.description;
                    if (structuralMeta.order != null) hit.order = structuralMeta.order;
                    if (structuralMeta.isCertifiable !== undefined) {
                        hit.isCertifiable = structuralMeta.isCertifiable;
                    }
                    /* Catalog fallback title follows the curriculum language being edited. */
                    if (hit.type === 'root' && structuralMeta.title && lang === preferred) {
                        raw.universeName = structuralMeta.title;
                    }
                }
            }
            if (!touched) return false;
            store.update({ rawGraphData: raw });
            DataProcessor.process(store, raw, store.state.activeSource, { suppressReadmeAutoOpen: true });
            return true;

}

function notifyNostrMutateDenied(store) {
    if (!store) return;
    const ui = store.ui || {};
    const role =
        typeof store.getMyTreeNetworkRole === 'function' ? store.getMyTreeNetworkRole() : null;
    const msg =
        role === 'proposer'
            ? ui.governanceProposerReadOnlyHint ||
              'Proposers cannot edit the curriculum here. Ask an owner or editor, or fork a local copy.'
            : ui.treeReadOnlyHint ||
              'This public tree is read-only. Open a local copy or sign in as an editor.';
    store.notify?.(msg, true);
}

export function nostrCreateChildAction(parentPath, name, type, explicitParentId = null) {
    const store = shell();
    if (!store) return undefined;

            if (!store.canMutateNostrGraph()) {
                notifyNostrMutateDenied(store);
                return false;
            }
            const raw = JSON.parse(JSON.stringify(store.state.rawGraphData || {}));
            if (!raw.languages) return false;
            /* Same rule as DataProcessor: if it does not match the displayed tree, findParent fails when nesting in construction. */
            const preferredLang = store.getCurrentContentLangKey();
            const root =
                raw.languages[preferredLang] || raw.languages[Object.keys(raw.languages)[0]];
            let parent = null;
            if (explicitParentId && root) {
                let hit = findNodeById(root, explicitParentId);
                let climbGuard = 0;
                while (
                    hit &&
                    (hit.type === 'leaf' || hit.type === 'exam') &&
                    hit.parentId &&
                    climbGuard++ < 32
                ) {
                    hit = findNodeById(root, hit.parentId);
                }
                if (hit && (hit.type === 'branch' || hit.type === 'root')) parent = hit;
            }
            if (!parent) {
                parent = findParentByFolderPath(raw, preferredLang, parentPath);
            }
            if (!parent) return false;
            const ui = store.ui;
            const isExam = type === 'exam';
            const leafMarkdown =
                type === 'folder' ? undefined : isExam ? buildDefaultExamMarkdown(ui) : buildDefaultLessonMarkdown(ui);
            const { ok, newId } = addChildToAllLanguages(raw, parent.id, {
                name,
                type: type === 'folder' ? 'folder' : isExam ? 'exam' : 'file',
                leafMarkdown
            });
            if (!ok || !newId) return false;
            store.update({ rawGraphData: raw });
            DataProcessor.process(store, raw, store.state.activeSource, { suppressReadmeAutoOpen: true });
            return newId;

}

export function nostrDeleteNodeByPathAction(nodePath) {
    const store = shell();
    if (!store) return undefined;

            if (!store.canMutateNostrGraph()) {
                notifyNostrMutateDenied(store);
                return false;
            }
            const raw = JSON.parse(JSON.stringify(store.state.rawGraphData || {}));
            if (!raw.languages) return false;
            let nodeId = null;
            if (store.state.data) {
                const node = findNodeByPathHint(store.state.data, nodePath);
                if (node) nodeId = node.id;
            }
            if (!nodeId) {
                const preferred = store.getCurrentContentLangKey?.() || Object.keys(raw.languages)[0];
                const root = raw.languages[preferred] || raw.languages[Object.keys(raw.languages)[0]];
                const node = root ? findNodeByPathHint(root, nodePath) : null;
                if (node) nodeId = node.id;
            }
            if (!nodeId) return false;
            if (!removeNodeByIdAllLanguages(raw, nodeId)) return false;
            store.update({ rawGraphData: raw });
            DataProcessor.process(store, raw, store.state.activeSource, { suppressReadmeAutoOpen: true });
            return true;

}

export function nostrDeleteNodeByIdAction(nodeId) {
    const store = shell();
    if (!store) return undefined;

            if (!store.canMutateNostrGraph()) {
                notifyNostrMutateDenied(store);
                return false;
            }
            const id = String(nodeId || '').trim();
            if (!id) return false;
            const raw = JSON.parse(JSON.stringify(store.state.rawGraphData || {}));
            if (!raw.languages) return false;
            if (!removeNodeByIdAllLanguages(raw, id)) return false;
            store.update({ rawGraphData: raw });
            DataProcessor.process(store, raw, store.state.activeSource, { suppressReadmeAutoOpen: true });
            return true;

}

export function nostrRenameNodeByPathAction(oldPath, newName) {
    const store = shell();
    if (!store) return undefined;

            if (!store.canMutateNostrGraph()) {
                notifyNostrMutateDenied(store);
                return false;
            }
            const raw = JSON.parse(JSON.stringify(store.state.rawGraphData || {}));
            if (!raw.languages || !store.state.data) return false;
            const node = findNodeByPathHint(store.state.data, oldPath);
            if (!node) return false;
            if (!renameNodeByIdAllLanguages(raw, node.id, newName)) return false;
            store.update({ rawGraphData: raw });
            DataProcessor.process(store, raw, store.state.activeSource, { suppressReadmeAutoOpen: true });
            return true;

}

export function nostrMoveNodeAction(nodeId, newParentId) {
    const store = shell();
    if (!store) return undefined;

            if (!store.canMutateNostrGraph()) {
                notifyNostrMutateDenied(store);
                return false;
            }
            const raw = JSON.parse(JSON.stringify(store.state.rawGraphData || {}));
            if (!raw.languages) return false;
            let movingId = String(nodeId || '').trim();
            let parentId = String(newParentId || '').trim();
            const preferredLang = store.getCurrentContentLangKey?.() || Object.keys(raw.languages)[0];
            const root =
                raw.languages[preferredLang] || raw.languages[Object.keys(raw.languages)[0]];
            if (root && parentId) {
                let hit = findNodeById(root, parentId);
                let climbGuard = 0;
                while (
                    hit &&
                    (hit.type === 'leaf' || hit.type === 'exam') &&
                    hit.parentId &&
                    climbGuard++ < 32
                ) {
                    parentId = String(hit.parentId);
                    hit = findNodeById(root, parentId);
                }
            }
            if (!reparentNodeByIdAllLanguages(raw, movingId, parentId)) return false;
            store.update({ rawGraphData: raw });
            DataProcessor.process(store, raw, store.state.activeSource, { suppressReadmeAutoOpen: true });
            store.persistLinkedLocalMirrorIfNeeded?.();
            return true;

}

export function updateUniversePresentationAction(patch) {
    const store = shell();
    if (!store) return undefined;

            if (store.getActivePublicTreeRef() && !store.canMutateNostrGraph()) {
                notifyNostrMutateDenied(store);
                return;
            }
            const raw = JSON.parse(JSON.stringify(store.state.rawGraphData || {}));
            const p = { ...patch };
            if (Object.prototype.hasOwnProperty.call(p, 'supportUrl')) {
                const rawIn = String(p.supportUrl ?? '').trim();
                p.supportUrl = rawIn ? safeStripeSupportUrl(rawIn) || '' : '';
            }
            raw.universePresentation = {
                ...(raw.universePresentation || {}),
                ...p,
                license: p.license || raw.universePresentation?.license || 'CC-BY-SA-4.0',
                licenseUrl:
                    p.licenseUrl ||
                    raw.universePresentation?.licenseUrl ||
                    'https://creativecommons.org/licenses/by-sa/4.0/',
            };
            syncReadmeFromUniversePresentation(raw, store.ui);
            store.update({ rawGraphData: raw });
            DataProcessor.process(store, raw, store.state.activeSource, { suppressReadmeAutoOpen: true });

}

export function getCurrentContentLangKeyAction() {
    const store = shell();
    if (!store) return undefined;

            const raw = store.state.rawGraphData;
            const keys = Object.keys((raw && raw.languages) || {});
            if (!keys.length) return store.state.lang;
            const norm = (c) => String(c || '').trim().toUpperCase().replace(/[-_]/g, '');
            const base = (c) => norm(c).slice(0, 2);
            const keyByNorm = new Map(keys.map((k) => [norm(k), k]));
            const keyByBase = new Map();
            for (const k of keys) {
                const b = base(k);
                if (b && !keyByBase.has(b)) keyByBase.set(b, k);
            }
            const pick = (code) => {
                if (!code) return null;
                if (keys.includes(code)) return code;
                if (keyByNorm.has(norm(code))) return keyByNorm.get(norm(code));
                if (keyByBase.has(base(code))) return keyByBase.get(base(code));
                return null;
            };
            if (store.state.constructionMode) {
                const edit = pick(store.state.curriculumEditLang);
                if (edit) return edit;
            }
            return pick(store.state.lang) || keys[0];

}

export function openTreeInfoModalAction(opts = {}) {
    const store = shell();
    if (!store) return undefined;

            store.setModal({ type: 'tree-info', ...opts });

}

export function openConstructionCurriculumLangModalAction() {
    const store = shell();
    if (!store) return undefined;

            if (!store.state.constructionMode) return;
            store.setModal({ type: 'construction-curriculum-lang' });

}

export function getPublicationMetadataLimitsAction() {
    const store = shell();
    if (!store) return undefined;

            return { authorMin: 2, descriptionMin: 5 };

}

export function validatePublicationMetadataAction() {
    const store = shell();
    if (!store) return undefined;

            const ui = store.ui;
            const { authorMin, descriptionMin } = store.getPublicationMetadataLimits();
            const raw = store.state.rawGraphData;
            const pres =
                (raw && raw.universePresentation) && typeof raw.universePresentation === 'object'
                    ? raw.universePresentation
                    : {};
            const author = String(pres.authorName || currentOnlineAccountUsername(store) || '').trim();
            const desc = String(pres.description || '').trim();
            if (isArboritoDemoTree(store)) {
                return {
                    ok: false,
                    message:
                        ui.publishDemoTreeBlocked ||
                        'The Arborito demo is a shared showcase tree. Duplicate it as your own branch before publishing.',
                };
            }
            if (author.length < authorMin) {
                const tpl =
                    ui.publishMissingAuthor ||
                    'Add an author or organization name in “About store tree” (map view) before publishing.';
                const message = String(tpl).includes('{n}')
                    ? String(tpl).replace(/\{n\}/g, String(authorMin))
                    : tpl;
                return { ok: false, message };
            }
            if (desc.length < descriptionMin) {
                const tpl =
                    ui.publishMissingDescription ||
                    'Add a short public description (at least {n} characters) in “About store tree” before publishing.';
                const message = String(tpl).includes('{n}')
                    ? String(tpl).replace(/\{n\}/g, String(descriptionMin))
                    : tpl;
                return { ok: false, message };
            }
            return { ok: true };

}

export function persistActiveBranchIfNeededAction() {
    const store = shell();
    if (!store) return undefined;

            if (!fileSystem.isLocal || !(store.state.activeSource && store.state.activeSource.url && store.state.activeSource.url.startsWith('branch://'))) return;
            const id = branchIdFromBranchUrl(store.state.activeSource.url);
            if (!id) return;
            const entry = store.userStore.state.branches.find((t) => t.id === id);
            if (entry && store.state.rawGraphData) {
                const rawCopy = JSON.parse(JSON.stringify(store.state.rawGraphData));
                const target = resolveMutableBranchCurriculum(entry);
                if (target?.isSnapshot && target.snapshotId) {
                    if (!entry.releaseSnapshots) entry.releaseSnapshots = {};
                    entry.releaseSnapshots[target.snapshotId] = rawCopy;
                } else {
                    entry.data = rawCopy;
                    try {
                        entry.draftHash = store.userStore.hashJson(entry.data);
                    } catch {
                        /* ignore */
                    }
                }
                entry.updated = Date.now();
                store.userStore.state.branches = [...store.userStore.state.branches];
                store.userStore.markBranchDirty(id);
                store.userStore.persist();
            }

}

export function persistLinkedLocalMirrorIfNeededAction() {
    const store = shell();
    if (!store) return undefined;

            if (!(fileSystem.isNostrTreeSource && fileSystem.isNostrTreeSource()) || !store.state.rawGraphData) return;
            if (!store.canMutateNostrGraph()) return;
            if (store.state.treeHydrating) return;
            const treeRef = parseNostrTreeUrl((store.state.activeSource && store.state.activeSource.url) || '');
            if (!treeRef) return;
            const canonTreeUrl = formatNostrTreeUrl(treeRef.pub, treeRef.universeId);
            const draftId = 'local-draft-' + treeRef.universeId;
            /* Never write into a real garden branch that shares publishedNetworkUrl — only the draft mirror. */
            let entry = store.userStore.state.branches.find((t) => String(t?.id) === draftId);
            const dataCopy = JSON.parse(JSON.stringify(store.state.rawGraphData));
            let liveHash = '';
            try {
                liveHash = store.userStore.hashJson(dataCopy);
            } catch {
                /* ignore */
            }

            if (!entry) {
                const universeName =
                    String(store.state.rawGraphData?.universeName || '').trim() ||
                    String(store.state.activeSource?.name || '').trim() ||
                    store.ui.defaultGardenName ||
                    'Tree';
                entry = {
                    id: draftId,
                    name: universeName,
                    updated: Date.now(),
                    data: dataCopy,
                    publishedNetworkUrl: canonTreeUrl,
                    publishedSnapshot: JSON.parse(JSON.stringify(dataCopy)),
                    publishedSnapshotAt: Date.now(),
                };
                try {
                    entry.publishedSnapshotHash = liveHash || store.userStore.hashJson(entry.publishedSnapshot);
                    entry.draftHash = entry.publishedSnapshotHash;
                } catch {
                    /* ignore */
                }
                store.userStore.state.branches.push(entry);
            } else {
                const pubHash = String(entry.publishedSnapshotHash || '').trim();
                const draftHash = String(entry.draftHash || '').trim();
                const dirty = !!(pubHash && draftHash && draftHash !== pubHash);
                /*
                 * Remount of network graph: live hash matches published baseline.
                 * Do not wipe a dirty draft mirror with the remounted network tree.
                 */
                if (dirty && liveHash && pubHash && liveHash === pubHash) {
                    return;
                }
                entry.data = dataCopy;
                entry.updated = Date.now();
                entry.publishedNetworkUrl = canonTreeUrl;
                try {
                    entry.draftHash = liveHash || store.userStore.hashJson(entry.data);
                } catch {
                    /* ignore */
                }
            }
            store.userStore.state.branches = [...store.userStore.state.branches];
            store.userStore.markBranchDirty(entry.id);
            store.userStore.persist();

}

export async function setCurriculumEditLangAction(code) {
    const store = shell();
    if (!store) return false;

            if (!store.state.constructionMode) return false;
            const raw = store.state.rawGraphData;
            const keys = Object.keys((raw && raw.languages) || {});
            if (!keys.length) return false;
            const norm = (c) => String(c || '').trim().toUpperCase().replace(/[-_]/g, '');
            const keyByNorm = new Map(keys.map((k) => [norm(k), k]));
            let nextLang = null;
            if (code == null || code === '') {
                nextLang = null;
            } else {
                const rawCode = String(code);
                nextLang =
                    (keys.includes(rawCode) && rawCode) ||
                    keyByNorm.get(norm(rawCode)) ||
                    null;
                if (!nextLang) return false;
            }
            const prev = store.state.curriculumEditLang || null;
            if (prev === nextLang) return true;
            const contentApi = getPanelRef('content');
            if (typeof contentApi?.confirmLeaveIfNeeded === 'function') {
                const ok = await contentApi.confirmLeaveIfNeeded();
                if (!ok) {
                    /* Bump so pickers remount with the store language after cancel. */
                    store.update({ curriculumLangPickerEpoch: (store.state.curriculumLangPickerEpoch || 0) + 1 });
                    return false;
                }
            }
            store.update({ curriculumEditLang: nextLang });
            DataProcessor.process(store, store.state.rawGraphData, store.state.activeSource, { suppressReadmeAutoOpen: true });
            return true;

}

export function addCurriculumLanguageInteractiveAction(opts = {}) {
    const store = shell();
    if (!store) return undefined;

            const ui = store.ui;
            if (!store.state.constructionMode) return;
            if (!store.canOfferCurriculumLanguageAdd()) {
                if (!fileSystem.features.canWrite) {
                    const role =
                        typeof store.getMyTreeNetworkRole === 'function' ? store.getMyTreeNetworkRole() : null;
                    if (role === 'proposer') {
                        store.notify(
                            ui.addCurriculumLangProposerBlocked ||
                                ui.governanceYourRoleProposer ||
                                'Ask the tree owner for the Editor role to add languages.',
                            true
                        );
                        return;
                    }
                    store.notify(ui.treeReadOnlyHint || 'Read-only.', true);
                    return;
                }
                if (store.getActivePublicTreeRef() && !store.canMutateNostrGraph()) {
                    store.notify(ui.treeReadOnlyHint || 'Read-only.', true);
                    return;
                }
                store.notify(ui.addCurriculumLangNoTree || 'No language data in store tree.', true);
                return;
            }
            const payload = { type: 'pick-curriculum-lang' };
            if (opts.fromConstructionMore) payload.fromConstructionMore = true;
            if (opts.fromConstructionLangModal) payload.fromConstructionLangModal = true;
            store.setModal(payload);

}

export async function applyCurriculumPresetLanguageAction(code) {
    const store = shell();
    if (!store) return undefined;

            const ui = store.ui;
            if (!store.canOfferCurriculumLanguageAdd()) {
                if (!store.state.constructionMode) return false;
                if (!fileSystem.features.canWrite) {
                    const role =
                        typeof store.getMyTreeNetworkRole === 'function' ? store.getMyTreeNetworkRole() : null;
                    if (role === 'proposer') {
                        store.notify(
                            ui.addCurriculumLangProposerBlocked ||
                                ui.governanceYourRoleProposer ||
                                'Ask the tree owner for the Editor role to add languages.',
                            true
                        );
                    } else {
                        store.notify(ui.treeReadOnlyHint || 'Read-only.', true);
                    }
                    return false;
                }
                if (store.getActivePublicTreeRef() && !store.canMutateNostrGraph()) {
                    store.notify(ui.treeReadOnlyHint || 'Read-only.', true);
                    return false;
                }
                store.notify(ui.addCurriculumLangNoTree || 'No language data in store tree.', true);
                return false;
            }
            const nk = String(code || '').trim();
            if (!isCurriculumPresetCode(nk)) {
                store.notify(ui.addCurriculumLangInvalid || 'Pick a language from the list.', true);
                return false;
            }
            const raw = store.state.rawGraphData;
            if (!(raw && raw.languages) || !Object.keys(raw.languages).length) {
                store.notify(ui.addCurriculumLangNoTree || 'No language data in store tree.', true);
                return false;
            }
            if (raw.languages[nk]) {
                store.notify(ui.addCurriculumLangExists || 'That language is already in store tree.', true);
                return false;
            }
            const contentApi = getPanelRef('content');
            if (typeof contentApi?.confirmLeaveIfNeeded === 'function') {
                const ok = await contentApi.confirmLeaveIfNeeded();
                if (!ok) return false;
            }
            const template = store.getCurrentContentLangKey();
            const newRaw = JSON.parse(JSON.stringify(store.state.rawGraphData || raw));
            newRaw.languages[nk] = JSON.parse(JSON.stringify(newRaw.languages[template]));
            if (newRaw.readme && typeof newRaw.readme === 'object' && !Array.isArray(newRaw.readme)) {
                const rm = newRaw.readme;
                if (rm[template] != null && rm[nk] == null) rm[nk] = rm[template];
            }
            store.update({ rawGraphData: newRaw, curriculumEditLang: nk });
            DataProcessor.process(store, newRaw, store.state.activeSource, { suppressReadmeAutoOpen: true });
            store.notify(ui.addCurriculumLangDone || 'Language added. Translate content in the editor.');
            return true;

}

export async function removeCurriculumLanguageAction(code) {
    const store = shell();
    if (!store) return false;

    const ui = store.ui;
    if (!store.state.constructionMode) return false;
    if (!canOfferCurriculumLanguageRemoveAction()) {
        if (!fileSystem.features.canWrite) {
            store.notify(ui.treeReadOnlyHint || 'Read-only.', true);
            return false;
        }
        const keys =
            store.state.rawGraphData?.languages && typeof store.state.rawGraphData.languages === 'object'
                ? Object.keys(store.state.rawGraphData.languages)
                : [];
        if (keys.length <= 1) {
            store.notify(
                ui.removeCurriculumLangLastBlocked ||
                    'Keep at least one content language on this branch.',
                true
            );
            return false;
        }
        store.notify(ui.treeReadOnlyHint || 'Read-only.', true);
        return false;
    }

    const nk = String(code || '').trim();
    const raw = store.state.rawGraphData;
    if (!nk || !(raw?.languages && raw.languages[nk])) {
        store.notify(ui.removeCurriculumLangMissing || 'That language is not in this tree.', true);
        return false;
    }

    const label = nk;
    const ok = await store.confirm(
        (ui.removeCurriculumLangBody || 'Remove content language {code}? Lessons in that language will be deleted from this branch.')
            .replace('{code}', label),
        ui.removeCurriculumLangTitle || 'Remove language',
        true,
        ui.removeCurriculumLangConfirm || ui.delete || 'Remove'
    );
    if (!ok) return false;

    const contentApi = getPanelRef('content');
    if (typeof contentApi?.confirmLeaveIfNeeded === 'function') {
        const leaveOk = await contentApi.confirmLeaveIfNeeded();
        if (!leaveOk) return false;
    }

    const newRaw = JSON.parse(JSON.stringify(raw));
    delete newRaw.languages[nk];
    if (newRaw.readme && typeof newRaw.readme === 'object' && !Array.isArray(newRaw.readme)) {
        delete newRaw.readme[nk];
    }
    const remaining = Object.keys(newRaw.languages || {});
    if (!remaining.length) {
        store.notify(
            ui.removeCurriculumLangLastBlocked ||
                'Keep at least one content language on this branch.',
            true
        );
        return false;
    }
    let nextEdit = store.state.curriculumEditLang || null;
    if (!nextEdit || nextEdit === nk || !newRaw.languages[nextEdit]) {
        const appLang = String(store.state.lang || '').trim();
        nextEdit =
            (appLang && newRaw.languages[appLang] && appLang) ||
            remaining[0];
    }
    store.update({ rawGraphData: newRaw, curriculumEditLang: nextEdit });
    DataProcessor.process(store, newRaw, store.state.activeSource, { suppressReadmeAutoOpen: true });
    store.notify(
        (ui.removeCurriculumLangDone || 'Removed language {code}.').replace('{code}', label)
    );
    return true;
}

export function getActivePublicTreeRefAction() {
    const store = shell();
    if (!store) return undefined;

    const src = store.state.activeSource;
    const u = (src && src.url) || '';
    const direct = parseNostrTreeUrl(u);
    if (direct) return direct;

    if (src?.type === 'composed-tree' && src.treeId) {
        const entry = store.userStore?.getTree?.(String(src.treeId));
        const pub = String(entry?.publishedNetworkUrl || '').trim();
        if (pub) return parseNostrTreeUrl(pub);
    }
    if (String(u).startsWith('branch://')) {
        const id = branchIdFromBranchUrl(u);
        const entry = id ? store.userStore?.state?.branches?.find((t) => t.id === id) : null;
        const pub = String(entry?.publishedNetworkUrl || '').trim();
        if (pub) return parseNostrTreeUrl(pub);
    }
    return null;
}

export function getNetworkUserPairAction() {
    const store = shell();
    if (!store) return undefined;

            try {
                const raw = localStorage.getItem('arborito-nostr-user-pair');
                if (raw) return JSON.parse(raw);
            } catch {
                /* ignore */
            }
            return null;

}

export function saveNetworkUserPairAction(pair) {
    const store = shell();
    if (!store) return undefined;

            if (!(pair && pair.pub)) return;
            localStorage.setItem('arborito-nostr-user-pair', JSON.stringify(pair));

}

export async function ensureNetworkUserPairAction() {
    const store = shell();
    if (!store) return undefined;

            const existing = store.getNetworkUserPair();
            if ((existing && existing.pub) && (existing && existing.priv)) return existing;
            try {
                const pair = await createNostrPair();
                store.saveNetworkUserPair(pair);
                return pair;
            } catch (e) {
                console.warn(
                    'Nostr writer identity unavailable (use https:// or http://localhost for full online features on some browsers):',
                    e
                );
                return null;
            }

}

export async function materializeNetworkReleaseSnapshotAction(snapId) {
    const store = shell();
    if (!store) return undefined;

            const raw = store.state.rawGraphData;
            if (!(raw && raw.releaseSnapshots)) return null;
            const sid = String(snapId);
            const slot = raw.releaseSnapshots[sid];
            if (!slot || typeof slot !== 'object') return null;
            const snapshotKey = slot.treeSnapshotRef;
            if (!snapshotKey) return slot;
            const treeRef = store.getActivePublicTreeRef();
            if (!treeRef) return null;
            try {
                const data = await store.nostr.loadNostrSnapshotChunk({
                    pub: treeRef.pub,
                    universeId: treeRef.universeId,
                    snapshotKey
                });
                if (!data || typeof data !== 'object') return null;
                const nextRaw = JSON.parse(JSON.stringify(raw));
                nextRaw.releaseSnapshots[sid] = data;
                store.update({ rawGraphData: nextRaw });
                return data;
            } catch (e) {
                console.warn('materializeNetworkReleaseSnapshot', e);
                return null;
            }

}

/** Store.prototype, explicit actions (no bindStoreContext). */
export const nostrGraphCurriculumMethods = {
    canOfferCurriculumLanguageAdd: canOfferCurriculumLanguageAddAction,
    canOfferCurriculumLanguageRemove: canOfferCurriculumLanguageRemoveAction,
    applyNodeContentToRawGraph: applyNodeContentToRawGraphAction,
    nostrCreateChild: nostrCreateChildAction,
    nostrDeleteNodeByPath: nostrDeleteNodeByPathAction,
    nostrDeleteNodeById: nostrDeleteNodeByIdAction,
    nostrRenameNodeByPath: nostrRenameNodeByPathAction,
    nostrMoveNode: nostrMoveNodeAction,
    updateUniversePresentation: updateUniversePresentationAction,
    getCurrentContentLangKey: getCurrentContentLangKeyAction,
    openTreeInfoModal: openTreeInfoModalAction,
    openConstructionCurriculumLangModal: openConstructionCurriculumLangModalAction,
    getPublicationMetadataLimits: getPublicationMetadataLimitsAction,
    validatePublicationMetadata: validatePublicationMetadataAction,
    persistActiveBranchIfNeeded: persistActiveBranchIfNeededAction,
    persistLinkedLocalMirrorIfNeeded: persistLinkedLocalMirrorIfNeededAction,
    setCurriculumEditLang: setCurriculumEditLangAction,
    addCurriculumLanguageInteractive: addCurriculumLanguageInteractiveAction,
    applyCurriculumPresetLanguage: applyCurriculumPresetLanguageAction,
    removeCurriculumLanguage: removeCurriculumLanguageAction,
    getActivePublicTreeRef: getActivePublicTreeRefAction,
    getNetworkUserPair: getNetworkUserPairAction,
    saveNetworkUserPair: saveNetworkUserPairAction,
    ensureNetworkUserPair: ensureNetworkUserPairAction,
    materializeNetworkReleaseSnapshot: materializeNetworkReleaseSnapshotAction,
};
