import { DataProcessor } from '../data-processor.js';
import { buildDefaultLessonMarkdown } from '../../learning/default-lesson-markdown.js';
import { buildDefaultExamMarkdown } from '../../learning/default-exam-markdown.js';
import {
    addChildToAllLanguages,
    findNodeById,
    findNodeByPathHint,
    findParentByFolderPath,
    removeNodeByIdAllLanguages,
    renameNodeByIdAllLanguages,
    reparentNodeByIdAllLanguages
} from '../raw-graph-mutations.js';
import { syncReadmeFromUniversePresentation } from '../../learning/course-intro-markdown.js';
import { safeStripeSupportUrl } from '../../../shared/lib/stripe-support-url.js';
import { parseNostrTreeUrl, formatNostrTreeUrl, createNostrPair } from '../../nostr/nostr-refs.js';
import { fileSystem } from '../../backup-export/filesystem.js';
import { isCurriculumPresetCode } from '../../sources/curriculum-locale-presets.js';
/** Mixin applied to `Store.prototype` — public graph under construction, curriculum, and user SEA keypair. */
export const nostrGraphCurriculumMethods = {
    /**
     * Construction mode: can offer “+ language” in the dropdown (avoids a no-op option).
     */
    canOfferCurriculumLanguageAdd() {
        if (!this.state.constructionMode) return false;
        if (!fileSystem.features.canWrite) return false;
        if (this.getActivePublicTreeRef() && !this.canMutateNostrGraph()) return false;
        const raw = this.state.rawGraphData;
        return !!((raw && raw.languages) && Object.keys(raw.languages).length);
    },
    /**
     * Apply editor save to in-memory public tree (or any non-local) graph — updates node content / folder meta.
     */
    applyNodeContentToRawGraph(nodeId, rawFileContent, metaFromEditor) {
        if (this.getActivePublicTreeRef() && !this.canMutateNostrGraph()) return false;
        const raw = JSON.parse(JSON.stringify(this.state.rawGraphData || {}));
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
        this.update({ rawGraphData: raw });
        DataProcessor.process(this, raw, this.state.activeSource, { suppressReadmeAutoOpen: true });
        return true;
    },

    /**
     * Structure CRUD for Nostr-backed rawGraphData (mirrors all languages).
     * @param {string | null} [explicitParentId] — id del padre en el idioma preferido (evita fallos por ruta o nombres duplicados).
     * @returns {string|false} new node id, or false on failure
     */
    nostrCreateChild(parentPath, name, type, explicitParentId = null) {
        if (!this.canMutateNostrGraph()) return false;
        const raw = JSON.parse(JSON.stringify(this.state.rawGraphData || {}));
        if (!raw.languages) return false;
        /* Same rule as DataProcessor: if it does not match the displayed tree, findParent fails when nesting in construction. */
        const preferredLang = this.getCurrentContentLangKey();
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
        const ui = this.ui;
        const isExam = type === 'exam';
        const leafMarkdown =
            type === 'folder' ? undefined : isExam ? buildDefaultExamMarkdown(ui) : buildDefaultLessonMarkdown(ui);
        const { ok, newId } = addChildToAllLanguages(raw, parent.id, {
            name,
            type: type === 'folder' ? 'folder' : isExam ? 'exam' : 'file',
            leafMarkdown
        });
        if (!ok || !newId) return false;
        this.update({ rawGraphData: raw });
        DataProcessor.process(this, raw, this.state.activeSource, { suppressReadmeAutoOpen: true });
        return newId;
    },

    nostrDeleteNodeByPath(nodePath) {
        if (!this.canMutateNostrGraph()) return false;
        const raw = JSON.parse(JSON.stringify(this.state.rawGraphData || {}));
        if (!raw.languages || !this.state.data) return false;
        const node = findNodeByPathHint(this.state.data, nodePath);
        if (!node) return false;
        if (!removeNodeByIdAllLanguages(raw, node.id)) return false;
        this.update({ rawGraphData: raw });
        DataProcessor.process(this, raw, this.state.activeSource, { suppressReadmeAutoOpen: true });
        return true;
    },

    nostrRenameNodeByPath(oldPath, newName) {
        if (!this.canMutateNostrGraph()) return false;
        const raw = JSON.parse(JSON.stringify(this.state.rawGraphData || {}));
        if (!raw.languages || !this.state.data) return false;
        const node = findNodeByPathHint(this.state.data, oldPath);
        if (!node) return false;
        if (!renameNodeByIdAllLanguages(raw, node.id, newName)) return false;
        this.update({ rawGraphData: raw });
        DataProcessor.process(this, raw, this.state.activeSource, { suppressReadmeAutoOpen: true });
        return true;
    },

    nostrMoveNode(nodeId, newParentId) {
        if (!this.canMutateNostrGraph()) return false;
        const raw = JSON.parse(JSON.stringify(this.state.rawGraphData || {}));
        if (!raw.languages) return false;
        if (!reparentNodeByIdAllLanguages(raw, nodeId, newParentId)) return false;
        this.update({ rawGraphData: raw });
        DataProcessor.process(this, raw, this.state.activeSource, { suppressReadmeAutoOpen: true });
        return true;
    },

    /** @param {Record<string, string>} patch */
    updateUniversePresentation(patch) {
        if (this.getActivePublicTreeRef() && !this.canMutateNostrGraph()) return;
        const raw = JSON.parse(JSON.stringify(this.state.rawGraphData || {}));
        const p = { ...patch };
        if (Object.prototype.hasOwnProperty.call(p, 'supportUrl')) {
            const rawIn = String(p.supportUrl ?? '').trim();
            p.supportUrl = rawIn ? safeStripeSupportUrl(rawIn) || '' : '';
        }
        raw.universePresentation = { ...(raw.universePresentation || {}), ...p };
        syncReadmeFromUniversePresentation(raw, this.ui);
        this.update({ rawGraphData: raw });
        DataProcessor.process(this, raw, this.state.activeSource, { suppressReadmeAutoOpen: true });
    },

    /** Language key used for `rawGraphData.languages[…]` (construction override or UI lang). */
    getCurrentContentLangKey() {
        const raw = this.state.rawGraphData;
        const keys = Object.keys((raw && raw.languages) || {});
        if (!keys.length) return this.state.lang;
        if (
            this.state.constructionMode &&
            this.state.curriculumEditLang &&
            keys.includes(this.state.curriculumEditLang)
        ) {
            return this.state.curriculumEditLang;
        }
        if (keys.includes(this.state.lang)) return this.state.lang;
        return keys[0];
    },

    /** Unified about + intro modal (Trees screen, More menu, map). */
    openTreeInfoModal(opts = {}) {
        this.setModal({ type: 'tree-info', ...opts });
    },

    /** Centered modal: curriculum edit language (expanded construction dock). */
    openConstructionCurriculumLangModal() {
        if (!this.state.constructionMode) return;
        this.setModal({ type: 'construction-curriculum-lang' });
    },

    /** Minimum lengths for author + public description (must match “About this tree” UI hints). */
    getPublicationMetadataLimits() {
        return { authorMin: 2, descriptionMin: 5 };
    },

    /** Required before publishing a public Nostr bundle: author + description for transparency. */
    validatePublicationMetadata() {
        const ui = this.ui;
        const { authorMin, descriptionMin } = this.getPublicationMetadataLimits();
        const raw = this.state.rawGraphData;
        const pres =
            (raw && raw.universePresentation) && typeof raw.universePresentation === 'object'
                ? raw.universePresentation
                : {};
        const author = String(pres.authorName || '').trim();
        const desc = String(pres.description || '').trim();
        if (author.length < authorMin) {
            const tpl =
                ui.publishMissingAuthor ||
                'Add an author or organization name in “About this tree” (map view) before publishing.';
            const message = String(tpl).includes('{n}')
                ? String(tpl).replace(/\{n\}/g, String(authorMin))
                : tpl;
            return { ok: false, message };
        }
        if (desc.length < descriptionMin) {
            const tpl =
                ui.publishMissingDescription ||
                'Add a short public description (at least {n} characters) in “About this tree” before publishing.';
            const message = String(tpl).includes('{n}')
                ? String(tpl).replace(/\{n\}/g, String(descriptionMin))
                : tpl;
            return { ok: false, message };
        }
        return { ok: true };
    },

    persistActiveLocalTreeIfNeeded() {
        if (!fileSystem.isLocal || !(this.state.activeSource && this.state.activeSource.url && this.state.activeSource.url.startsWith('local://'))) return;
        const id = this.state.activeSource.url.split('://')[1];
        const entry = this.userStore.state.localTrees.find((t) => t.id === id);
        if (entry && this.state.rawGraphData) {
            entry.data = JSON.parse(JSON.stringify(this.state.rawGraphData));
            entry.updated = Date.now();
            try {
                entry.draftHash = this.userStore.hashJson(entry.data);
            } catch {
                /* ignore */
            }
            this.userStore.state.localTrees = [...this.userStore.state.localTrees];
            this.userStore.persist();
        }
    },

    /**
     * Keep a local mirror in sync with the active Nostr-backed tree so edits survive
     * reloads and feed the publish-diff flow. If no mirror exists (the user opened
     * the public tree directly without having published it themselves), auto-create
     * one — this is the implicit "draft mode" for online trees: every keystroke
     * lands in a per-device staging copy and the user must explicitly press
     * Publish to push it to the network.
     */
    persistLinkedLocalMirrorIfNeeded() {
        if (!(fileSystem.isNostrTreeSource && fileSystem.isNostrTreeSource()) || !this.state.rawGraphData) return;
        if (!this.canMutateNostrGraph()) return;
        const treeRef = parseNostrTreeUrl((this.state.activeSource && this.state.activeSource.url) || '');
        if (!treeRef) return;
        const canonTreeUrl = formatNostrTreeUrl(treeRef.pub, treeRef.universeId);
        let entry = this.userStore.state.localTrees.find((t) => {
            const u = String((t && t.publishedNetworkUrl) || '').trim();
            return u === canonTreeUrl;
        });
        if (!entry) {
            const universeName =
                String(this.state.rawGraphData?.universeName || '').trim() ||
                String(this.state.activeSource?.name || '').trim() ||
                this.ui.defaultGardenName || 'Tree';
            const draftId = 'local-draft-' + treeRef.universeId;
            const dataCopy = JSON.parse(JSON.stringify(this.state.rawGraphData));
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
                entry.publishedSnapshotHash = this.userStore.hashJson(entry.publishedSnapshot);
                entry.draftHash = entry.publishedSnapshotHash;
            } catch { /* ignore */ }
            this.userStore.state.localTrees.push(entry);
        } else {
            entry.data = JSON.parse(JSON.stringify(this.state.rawGraphData));
            entry.updated = Date.now();
            try {
                entry.draftHash = this.userStore.hashJson(entry.data);
            } catch { /* ignore */ }
        }
        this.userStore.state.localTrees = [...this.userStore.state.localTrees];
        this.userStore.persist();
    },

    setCurriculumEditLang(code) {
        if (!this.state.constructionMode) return;
        const raw = this.state.rawGraphData;
        const keys = Object.keys((raw && raw.languages) || {});
        if (!keys.length) return;
        if (code == null || code === '') {
            this.update({ curriculumEditLang: null });
        } else if (keys.includes(String(code))) {
            this.update({ curriculumEditLang: String(code) });
        } else {
            return;
        }
        DataProcessor.process(this, this.state.rawGraphData, this.state.activeSource, { suppressReadmeAutoOpen: true });
    },

    /** @param {{ fromConstructionMore?: boolean; fromConstructionLangModal?: boolean }} [opts] */
    addCurriculumLanguageInteractive(opts = {}) {
        const ui = this.ui;
        if (!this.state.constructionMode) return;
        if (!this.canOfferCurriculumLanguageAdd()) {
            if (!fileSystem.features.canWrite) {
                const role =
                    typeof this.getMyTreeNetworkRole === 'function' ? this.getMyTreeNetworkRole() : null;
                if (role === 'proposer') {
                    this.notify(
                        ui.addCurriculumLangProposerBlocked ||
                            ui.governanceYourRoleProposer ||
                            'Ask the tree owner for the Editor role to add languages.',
                        true
                    );
                    return;
                }
                this.notify(ui.treeReadOnlyHint || 'Read-only.', true);
                return;
            }
            if (this.getActivePublicTreeRef() && !this.canMutateNostrGraph()) {
                this.notify(ui.treeReadOnlyHint || 'Read-only.', true);
                return;
            }
            this.notify(ui.addCurriculumLangNoTree || 'No language data in this tree.', true);
            return;
        }
        const payload = { type: 'pick-curriculum-lang' };
        if (opts.fromConstructionMore) payload.fromConstructionMore = true;
        if (opts.fromConstructionLangModal) payload.fromConstructionLangModal = true;
        this.setModal(payload);
    },

    /**
     * Add a new `languages[code]` from the fixed preset list (chosen in the picker modal).
     * @returns {boolean} true if the language was added
     */
    applyCurriculumPresetLanguage(code) {
        const ui = this.ui;
        if (!this.canOfferCurriculumLanguageAdd()) {
            if (!this.state.constructionMode) return false;
            if (!fileSystem.features.canWrite) {
                const role =
                    typeof this.getMyTreeNetworkRole === 'function' ? this.getMyTreeNetworkRole() : null;
                if (role === 'proposer') {
                    this.notify(
                        ui.addCurriculumLangProposerBlocked ||
                            ui.governanceYourRoleProposer ||
                            'Ask the tree owner for the Editor role to add languages.',
                        true
                    );
                } else {
                    this.notify(ui.treeReadOnlyHint || 'Read-only.', true);
                }
                return false;
            }
            if (this.getActivePublicTreeRef() && !this.canMutateNostrGraph()) {
                this.notify(ui.treeReadOnlyHint || 'Read-only.', true);
                return false;
            }
            this.notify(ui.addCurriculumLangNoTree || 'No language data in this tree.', true);
            return false;
        }
        const nk = String(code || '').trim();
        if (!isCurriculumPresetCode(nk)) {
            this.notify(ui.addCurriculumLangInvalid || 'Pick a language from the list.', true);
            return false;
        }
        const raw = this.state.rawGraphData;
        if (!(raw && raw.languages) || !Object.keys(raw.languages).length) {
            this.notify(ui.addCurriculumLangNoTree || 'No language data in this tree.', true);
            return false;
        }
        if (raw.languages[nk]) {
            this.notify(ui.addCurriculumLangExists || 'That language is already in this tree.', true);
            return false;
        }
        const template = this.getCurrentContentLangKey();
        const newRaw = JSON.parse(JSON.stringify(raw));
        newRaw.languages[nk] = JSON.parse(JSON.stringify(newRaw.languages[template]));
        if (newRaw.readme && typeof newRaw.readme === 'object' && !Array.isArray(newRaw.readme)) {
            const rm = newRaw.readme;
            if (rm[template] != null && rm[nk] == null) rm[nk] = rm[template];
        }
        this.update({ rawGraphData: newRaw, curriculumEditLang: nk });
        DataProcessor.process(this, newRaw, this.state.activeSource, { suppressReadmeAutoOpen: true });
        this.notify(ui.addCurriculumLangDone || 'Language added. Translate content in the editor.');
        return true;
    },

    getActivePublicTreeRef() {
        const u = (this.state.activeSource && this.state.activeSource.url);
        return parseNostrTreeUrl(u);
    },

    getNetworkUserPair() {
        try {
            const raw = localStorage.getItem('arborito-nostr-user-pair');
            if (raw) return JSON.parse(raw);
        } catch {
            /* ignore */
        }
        return null;
    },

    saveNetworkUserPair(pair) {
        if (!(pair && pair.pub)) return;
        localStorage.setItem('arborito-nostr-user-pair', JSON.stringify(pair));
    },

    async ensureNetworkUserPair() {
        const existing = this.getNetworkUserPair();
        if ((existing && existing.pub) && (existing && existing.priv)) return existing;
        try {
            const pair = await createNostrPair();
            this.saveNetworkUserPair(pair);
            return pair;
        } catch (e) {
            console.warn(
                'Nostr writer identity unavailable (use https:// or http://localhost for full online features on some browsers):',
                e
            );
            return null;
        }
    },

    /**
     * Resolve a Nostr version snapshot: if it is a `{ treeSnapshotRef }` placeholder, load the graph from chunks.snapshots.
     * @param {string} snapId
     * @returns {Promise<object|null>}
     */
    async materializeNetworkReleaseSnapshot(snapId) {
        const raw = this.state.rawGraphData;
        if (!(raw && raw.releaseSnapshots)) return null;
        const sid = String(snapId);
        const slot = raw.releaseSnapshots[sid];
        if (!slot || typeof slot !== 'object') return null;
        const snapshotKey = slot.treeSnapshotRef;
        if (!snapshotKey) return slot;
        const treeRef = this.getActivePublicTreeRef();
        if (!treeRef) return null;
        try {
            const data = await this.nostr.loadNostrSnapshotChunk({
                pub: treeRef.pub,
                universeId: treeRef.universeId,
                snapshotKey
            });
            if (!data || typeof data !== 'object') return null;
            const nextRaw = JSON.parse(JSON.stringify(raw));
            nextRaw.releaseSnapshots[sid] = data;
            this.update({ rawGraphData: nextRaw });
            return data;
        } catch (e) {
            console.warn('materializeNetworkReleaseSnapshot', e);
            return null;
        }
    }

};
