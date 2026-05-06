import { DataProcessor } from '../utils/data-processor.js';
import { buildArboritoBundle, sanitizeCurriculumForArboritoArchive } from '../utils/arborito-bundle.js';
import { syncReadmeFromUniversePresentation } from '../utils/course-intro-markdown.js';

/** Gamification, node/module completion, and building the Arborito bundle. */
export const userProgressBundleMethods = {
    checkStreak() { 
        const msg = this.userStore.settings.checkStreak(); 
        if(msg) this.notify(msg);
        this.update({});
    },

    addXP(amount, silent = false) {
        const msg = this.userStore.settings.addXP(amount);
        if (!silent && msg) this.notify(msg);
        this.update({});
    },

    harvestSeed(moduleId) {
        const msg = this.userStore.settings.harvestSeed(moduleId);
        if(msg) this.notify(msg);
        this.update({});
    },

    updateGamification(updates) {
        this.userStore.settings.updateGamification(updates);
        this.update({});
    },

    updateUserProfile(username, avatar) {
        this.userStore.settings.updateGamification({ username, avatar });
        this.notify(this.ui.profileUpdated);
        this.update({});
    },

    markComplete(nodeId, forceState = null) {
        const xpMsg = this.userStore.markComplete(nodeId, forceState);
        if(xpMsg) this.notify(xpMsg);
        this.update({}); 
        this.checkForModuleCompletion(nodeId);
    },

    /**
     * Al aprobar un examen: marca como completadas todas las hojas (lecciones) en ramas hermanas
     * del examen bajo el mismo padre, sin otorgar XP por cada una (solo persistencia + SRS suave).
     */
    markExamExemptSiblingLeaves(examNodeId) {
        const exam = this.findNode(examNodeId);
        if (!exam || exam.type !== 'exam' || !exam.parentId) return;
        const parent = this.findNode(exam.parentId);
        if (!(parent && parent.children && parent.children.length)) return;

        const leafIds = [];
        const collectLeaves = (n) => {
            if (!n) return;
            if (n.type === 'leaf') {
                leafIds.push(n.id);
                return;
            }
            if (n.type === 'exam') return;
            if (n.children) n.children.forEach(collectLeaves);
        };

        let changed = false;
        const markDone = (id) => {
            if (id == null) return;
            if (!this.userStore.state.completedNodes.has(id)) {
                this.userStore.state.completedNodes.add(id);
                changed = true;
            }
        };

        markDone(parent.id);
        for (const sibling of parent.children) {
            if (String(sibling.id) === String(examNodeId)) continue;
            markDone(sibling.id);
            collectLeaves(sibling);
        }

        for (const id of leafIds) {
            if (!this.userStore.state.completedNodes.has(id)) {
                this.userStore.state.completedNodes.add(id);
                changed = true;
                if (!this.userStore.state.memory[id]) {
                    try {
                        this.userStore.reportMemory(id, 4);
                    } catch (e) {
                        /* ignore */
                    }
                }
            }
        }
        if (changed) {
            this.userStore.persist();
            this.update({});
            this.dispatchEvent(new CustomEvent('graph-update'));
        }
        this.checkForModuleCompletion(examNodeId);
    },

    markBranchComplete(branchId) {
        if (!branchId) return;
        const branchNode = this.findNode(branchId);
        
        if (branchNode) {
            this.userStore.state.completedNodes.add(branchNode.id);
            
            if (branchNode.children) {
                branchNode.children.forEach(child => {
                    this.userStore.state.completedNodes.add(child.id);
                });
            }
            
            if (branchNode.leafIds && Array.isArray(branchNode.leafIds)) {
                branchNode.leafIds.forEach(id => this.userStore.state.completedNodes.add(id));
            }
            
            DataProcessor.hydrateCompletionState(this, branchNode);
        }
        
        this.userStore.persist();
        this.update({});
        this.dispatchEvent(new CustomEvent('graph-update'));
    },

    checkForModuleCompletion(relatedNodeId) {
        const modules = this.getModulesStatus();
        modules.forEach(m => {
            if (m.isComplete) {
                if (!this.userStore.state.completedNodes.has(m.id)) {
                     this.markBranchComplete(m.id);
                }
                this.harvestSeed(m.id);
            }
        });
    },

    getExportJson() { return this.userStore.getExportJson(); },

    buildArboritoBundleObject() {
        const raw = this.state.rawGraphData;
        const src = this.state.activeSource;
        if (!raw || !src) return null;
        const rawCopy = JSON.parse(JSON.stringify(raw));
        syncReadmeFromUniversePresentation(rawCopy, this.ui);
        return buildArboritoBundle({
            rawGraphData: rawCopy,
            activeSource: src,
            persistenceData: this.userStore.getPersistenceData(),
            forumSnapshot: this.forumStore.getSnapshot(src.id),
            instanceId: src.id
        });
    },

    /**
     * Export .arborito: curriculum (map + lessons), no forum or search index.
     * @param {{ releaseSnapshotIds?: string[] | null }} [opts] — `null`/omit = todas las versiones guardadas; `[]` = ninguna; lista = solo esas claves.
     */
    exportLocalTreeArchive(treeId, { releaseSnapshotIds = null } = {}) {
        const entry = this.userStore.state.localTrees.find((t) => t.id === treeId);
        if (!entry) return null;
        const treeCopy = JSON.parse(JSON.stringify(entry.data));
        syncReadmeFromUniversePresentation(treeCopy, this.ui);
        const sanitizeOpts =
            releaseSnapshotIds == null ? {} : { releaseSnapshotIds };
        const curriculumOnly = sanitizeCurriculumForArboritoArchive(treeCopy, sanitizeOpts);
        return this.userStore.serializeArboritoArchive(entry.id, entry.name, curriculumOnly);
    }

};
