import { DataProcessor } from '../utils/data-processor.js';
import { buildDefaultLessonMarkdown } from '../utils/default-lesson-markdown.js';
import {
    addChildToAllLanguages,
    findNodeById,
    findNodeByPathHint,
    findParentByFolderPath,
    removeNodeByIdAllLanguages,
    renameNodeByIdAllLanguages,
    reparentNodeByIdAllLanguages
} from '../utils/raw-graph-mutations.js';
import { syncReadmeFromUniversePresentation } from '../utils/course-intro-markdown.js';
import { safeStripeDonationUrl } from '../utils/stripe-donation-url.js';
import { parseNostrTreeUrl, formatNostrTreeUrl, createNostrPair } from '../services/nostr-refs.js';
import { fileSystem } from '../services/filesystem.js';
import { isCurriculumPresetCode } from '../config/curriculum-locale-presets.js';
import { resolveTreeReportEmail } from '../config/default-operator-email.js';

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
        const leafMarkdown = type === 'folder' ? undefined : buildDefaultLessonMarkdown(ui);
        const { ok, newId } = addChildToAllLanguages(raw, parent.id, {
            name,
            type: type === 'folder' ? 'folder' : 'file',
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
        if (Object.prototype.hasOwnProperty.call(p, 'donationUrl')) {
            const rawDon = String(p.donationUrl ?? '').trim();
            p.donationUrl = rawDon ? safeStripeDonationUrl(rawDon) || '' : '';
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

    /** Unified about + intro (Trees screen, More menu, map). Tree intro may open the `readme` modal. */
    openTreeInfoModal(opts = {}) {
        this.setModal({ type: 'tree-info', ...opts });
    },

    openTreeIntroModal(opts = {}) {
        this.openTreeInfoModal(opts);
    },

    /** @param {{ fromConstructionMore?: boolean }} [opts] */
    openReleasesModalFromConstruction(opts = {}) {
        // Construction should use the unified curriculum switcher (versions + snapshots) overlay.
        // The legacy Releases modal is kept for non-construction flows.
        this.dispatchEvent(new CustomEvent('open-curriculum-switcher', { detail: { preferTab: 'version' } }));
    },

    /** Centered modal: curriculum edit language (expanded construction dock). */
    openConstructionCurriculumLangModal() {
        if (!this.state.constructionMode) return;
        this.setModal({ type: 'construction-curriculum-lang' });
    },

    getTreeReportMailtoHref() {
        const ui = this.ui;
        const email = resolveTreeReportEmail(ui);
        const subject = encodeURIComponent(ui.treeReportEmailSubject || 'Arborito tree report');
        const lines = [
            (ui.treeReportEmailBodyHint ||
                'Describe the problem (e.g. illegal content, impersonation). Include screenshots if useful.') + '\n',
            '---',
            `Tree name: ${(this.state.activeSource && this.state.activeSource.name) || '(unknown)'}`,
            `Tree URL / source: ${(this.state.activeSource && this.state.activeSource.url) || '(none)'}`,
            `App page: ${typeof window !== 'undefined' ? window.location.href : ''}`
        ];
        const body = encodeURIComponent(lines.join('\n'));
        return `mailto:${email}?subject=${subject}&body=${body}`;
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
     * If the active source is a public universe that was published from a local garden,
     * keep a local mirror updated for offline access/backups.
     */
    persistLinkedLocalMirrorIfNeeded() {
        if (!(fileSystem.isNostrTreeSource && fileSystem.isNostrTreeSource()) || !this.state.rawGraphData) return;
        const treeRef = parseNostrTreeUrl((this.state.activeSource && this.state.activeSource.url) || '');
        if (!treeRef) return;
        const canonTreeUrl = formatNostrTreeUrl(treeRef.pub, treeRef.universeId);
        const entry = this.userStore.state.localTrees.find((t) => {
            const u = String((t && t.publishedNetworkUrl) || '').trim();
            return u === canonTreeUrl;
        });
        if (!entry) return;
        entry.data = JSON.parse(JSON.stringify(this.state.rawGraphData));
        entry.updated = Date.now();
        try {
            entry.draftHash = this.userStore.hashJson(entry.data);
        } catch {
            /* ignore */
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
    }

};
