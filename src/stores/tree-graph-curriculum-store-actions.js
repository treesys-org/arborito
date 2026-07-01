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
import { safeStripeSupportUrl } from '../shared/lib/stripe-support-url.js';
import { parseNostrTreeUrl, formatNostrTreeUrl, createNostrPair } from '../features/nostr/api/nostr-refs.js';
import { fileSystem } from '../features/backup-export/api/filesystem.js';
import { isCurriculumPresetCode } from '../features/sources/api/curriculum-locale-presets.js';

function shell() {
    return getArboritoStore();
}

/** Mixin applied to `Store.prototype` — public graph under construction, curriculum, and user SEA keypair. */

export function canOfferCurriculumLanguageAddAction() {
    const store = shell();
    if (!store) return undefined;

            if (!store.state.constructionMode) return false;
            if (!fileSystem.features.canWrite) return false;
            if (store.getActivePublicTreeRef() && !store.canMutateNostrGraph()) return false;
            const raw = store.state.rawGraphData;
            return !!((raw && raw.languages) && Object.keys(raw.languages).length);

}

export function applyNodeContentToRawGraphAction(nodeId, rawFileContent, metaFromEditor) {
    const store = shell();
    if (!store) return undefined;

            if (store.getActivePublicTreeRef() && !store.canMutateNostrGraph()) return false;
            const raw = JSON.parse(JSON.stringify(store.state.rawGraphData || {}));
            if (!raw.languages) return false;
            const applyToNode = (n) => {
                if (!n) return false;
                if (n.id === nodeId) {
                    if (n.type === 'branch' || n.type === 'root') {
                        try {
                            const j = JSON.parse(rawFileContent);
                            if (j.name != null) n.name = j.name;
                            if (j.icon != null) n.icon = j.icon;
                            if (j.description != null) n.description = j.description;
                            if (j.order != null) n.order = j.order;
                        } catch {
                            /* ignore */
                        }
                    } else {
                        n.content = rawFileContent;
                        if (metaFromEditor && typeof metaFromEditor === 'object') {
                            if (metaFromEditor.title) n.name = metaFromEditor.title;
                            if (metaFromEditor.icon) n.icon = metaFromEditor.icon;
                            if (metaFromEditor.description != null) n.description = metaFromEditor.description;
                            if (metaFromEditor.order != null) n.order = metaFromEditor.order;
                            if (metaFromEditor.isExam != null) n.isExam = metaFromEditor.isExam;
                        }
                    }
                    return true;
                }
                if (n.children) {
                    for (const c of n.children) {
                        if (applyToNode(c)) return true;
                    }
                }
                return false;
            };
            let touched = false;
            for (const lang of Object.keys(raw.languages)) {
                if (applyToNode(raw.languages[lang])) touched = true;
            }
            if (!touched) return false;
            store.update({ rawGraphData: raw });
            DataProcessor.process(store, raw, store.state.activeSource, { suppressReadmeAutoOpen: true });
            return true;

}

export function nostrCreateChildAction(parentPath, name, type, explicitParentId = null) {
    const store = shell();
    if (!store) return undefined;

            if (!store.canMutateNostrGraph()) return false;
            const raw = JSON.parse(JSON.stringify(store.state.rawGraphData || {}));
            if (!raw.languages) return false;
            /* Same rule as DataProcessor: if it does not match the displayed tree, findParent fails when nesting in construction. */
            const preferredLang = store.getCurrentContentLangKey();
            const root =
                raw.languages[preferredLang] || raw.languages[Object.keys(raw.languages)[0]];
            let parent = null;
            if (explicitParentId && root) {
                const hit = findNodeById(root, explicitParentId);
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

            if (!store.canMutateNostrGraph()) return false;
            const raw = JSON.parse(JSON.stringify(store.state.rawGraphData || {}));
            if (!raw.languages || !store.state.data) return false;
            const node = findNodeByPathHint(store.state.data, nodePath);
            if (!node) return false;
            if (!removeNodeByIdAllLanguages(raw, node.id)) return false;
            store.update({ rawGraphData: raw });
            DataProcessor.process(store, raw, store.state.activeSource, { suppressReadmeAutoOpen: true });
            return true;

}

export function nostrRenameNodeByPathAction(oldPath, newName) {
    const store = shell();
    if (!store) return undefined;

            if (!store.canMutateNostrGraph()) return false;
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

            if (!store.canMutateNostrGraph()) return false;
            const raw = JSON.parse(JSON.stringify(store.state.rawGraphData || {}));
            if (!raw.languages) return false;
            if (!reparentNodeByIdAllLanguages(raw, nodeId, newParentId)) return false;
            store.update({ rawGraphData: raw });
            DataProcessor.process(store, raw, store.state.activeSource, { suppressReadmeAutoOpen: true });
            return true;

}

export function updateUniversePresentationAction(patch) {
    const store = shell();
    if (!store) return undefined;

            if (store.getActivePublicTreeRef() && !store.canMutateNostrGraph()) return;
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
            if (
                store.state.constructionMode &&
                store.state.curriculumEditLang &&
                keys.includes(store.state.curriculumEditLang)
            ) {
                return store.state.curriculumEditLang;
            }
            if (keys.includes(store.state.lang)) return store.state.lang;
            return keys[0];

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
            const author = String(pres.authorName || '').trim();
            const desc = String(pres.description || '').trim();
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
            const id = store.state.activeSource.url.split('://')[1];
            const entry = store.userStore.state.branches.find((t) => t.id === id);
            if (entry && store.state.rawGraphData) {
                entry.data = JSON.parse(JSON.stringify(store.state.rawGraphData));
                entry.updated = Date.now();
                try {
                    entry.draftHash = store.userStore.hashJson(entry.data);
                } catch {
                    /* ignore */
                }
                store.userStore.state.branches = [...store.userStore.state.branches];
                store.userStore.persist();
            }

}

export function persistLinkedLocalMirrorIfNeededAction() {
    const store = shell();
    if (!store) return undefined;

            if (!(fileSystem.isNostrTreeSource && fileSystem.isNostrTreeSource()) || !store.state.rawGraphData) return;
            if (!store.canMutateNostrGraph()) return;
            const treeRef = parseNostrTreeUrl((store.state.activeSource && store.state.activeSource.url) || '');
            if (!treeRef) return;
            const canonTreeUrl = formatNostrTreeUrl(treeRef.pub, treeRef.universeId);
            let entry = store.userStore.state.branches.find((t) => {
                const u = String((t && t.publishedNetworkUrl) || '').trim();
                return u === canonTreeUrl;
            });
            if (!entry) {
                const universeName =
                    String(store.state.rawGraphData?.universeName || '').trim() ||
                    String(store.state.activeSource?.name || '').trim() ||
                    store.ui.defaultGardenName || 'Tree';
                const draftId = 'local-draft-' + treeRef.universeId;
                const dataCopy = JSON.parse(JSON.stringify(store.state.rawGraphData));
                entry = {
                    id: draftId,
                    name: universeName,
                    updated: Date.now(),
                    data: dataCopy,
                    publishedNetworkUrl: canonTreeUrl,
                    /* Treat the current network state as the "published baseline" — so a freshly
                     * mirrored online tree is NOT shown as having pending changes until the user
                     * actually edits something. */
                    publishedSnapshot: JSON.parse(JSON.stringify(dataCopy)),
                    publishedSnapshotAt: Date.now()
                };
                try {
                    entry.publishedSnapshotHash = store.userStore.hashJson(entry.publishedSnapshot);
                    entry.draftHash = entry.publishedSnapshotHash;
                } catch { /* ignore */ }
                store.userStore.state.branches.push(entry);
            } else {
                entry.data = JSON.parse(JSON.stringify(store.state.rawGraphData));
                entry.updated = Date.now();
                try {
                    entry.draftHash = store.userStore.hashJson(entry.data);
                } catch { /* ignore */ }
            }
            store.userStore.state.branches = [...store.userStore.state.branches];
            store.userStore.persist();

}

export function setCurriculumEditLangAction(code) {
    const store = shell();
    if (!store) return undefined;

            if (!store.state.constructionMode) return;
            const raw = store.state.rawGraphData;
            const keys = Object.keys((raw && raw.languages) || {});
            if (!keys.length) return;
            if (code == null || code === '') {
                store.update({ curriculumEditLang: null });
            } else if (keys.includes(String(code))) {
                store.update({ curriculumEditLang: String(code) });
            } else {
                return;
            }
            DataProcessor.process(store, store.state.rawGraphData, store.state.activeSource, { suppressReadmeAutoOpen: true });

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

export function applyCurriculumPresetLanguageAction(code) {
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
            const template = store.getCurrentContentLangKey();
            const newRaw = JSON.parse(JSON.stringify(raw));
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

export function getActivePublicTreeRefAction() {
    const store = shell();
    if (!store) return undefined;

            const u = (store.state.activeSource && store.state.activeSource.url);
            return parseNostrTreeUrl(u);

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

/** Store.prototype — explicit actions (no bindStoreContext). */
export const nostrGraphCurriculumMethods = {
    canOfferCurriculumLanguageAdd: canOfferCurriculumLanguageAddAction,
    applyNodeContentToRawGraph: applyNodeContentToRawGraphAction,
    nostrCreateChild: nostrCreateChildAction,
    nostrDeleteNodeByPath: nostrDeleteNodeByPathAction,
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
    getActivePublicTreeRef: getActivePublicTreeRefAction,
    getNetworkUserPair: getNetworkUserPairAction,
    saveNetworkUserPair: saveNetworkUserPairAction,
    ensureNetworkUserPair: ensureNetworkUserPairAction,
    materializeNetworkReleaseSnapshot: materializeNetworkReleaseSnapshotAction,
};
