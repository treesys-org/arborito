import { getArboritoStore } from '../core/store-singleton.js';
import { DataProcessor } from '../features/tree-graph/api/data-processor.js';
import { buildArboritoBundle, sanitizeCurriculumForArboritoArchive } from '../features/publishing/api/arborito-bundle.js';
import { syncReadmeFromUniversePresentation } from '../features/learning/api/course-intro-markdown.js';
import { updateCareOnLessonCompleteFallback } from '../features/garden-progress/api/care-schedule.js';
import { celebrate } from '../features/garden-progress/api/celebration.js';

function shell() {
    return getArboritoStore();
}

export function checkStreakAction() {
    const store = shell();
    if (!store) return undefined;
 
        const gBefore = store.userStore.state.gamification.streakShields;
        const msg = store.userStore.settings.checkStreak(); 
        const gAfter = store.userStore.state.gamification;
        if (msg) {
            const usedShield = gAfter.streakShields < gBefore;
            celebrate(usedShield ? 'streak-shield' : 'streak');
            store.notify(msg);
        }
        store.update({});
        if (msg) store._scheduleRankingPublish?.();
    
}

export function addXPAction(amount, silent = false) {
    const store = shell();
    if (!store) return undefined;

        const result = store.userStore.settings.addXP(amount);
        if (!result) return;
        const msg = typeof result === 'string' ? result : result.msg;
        if (!silent && msg) store.notify(msg);
        if (!silent) {
            celebrate(result.hitGoal ? 'daily-goal' : 'leaf-done');
        }
        store.update({});
        store._scheduleRankingPublish?.();
    
}

export function harvestSeedAction(moduleId) {
    const store = shell();
    if (!store) return undefined;

        const msg = store.userStore.settings.harvestSeed(moduleId);
        if (msg) {
            celebrate('seed-collected');
            store.notify(msg);
        }
        store.update({});
        store.dispatchEvent(new CustomEvent('graph-update'));
    
}

export function updateGamificationAction(updates) {
    const store = shell();
    if (!store) return undefined;

        store.userStore.settings.updateGamification(updates);
        store.update({});
    
}

export function updateUserProfileAction(username, avatar) {
    const store = shell();
    if (!store) return undefined;

        store.userStore.settings.updateGamification({ username, avatar });
        store.notify(store.ui.profileUpdated);
        store.update({});
        void store._scheduleRankingPublish?.();
        try {
            store.publishInstalledSourcesForAccount?.({ immediate: true });
        } catch { /* ignore */ }
    
}

export function markCompleteAction(nodeId, forceState = null, options = {}) {
    const store = shell();
    if (!store) return undefined;

    const xpResult = store.userStore.markComplete(nodeId, forceState, options);
    if (xpResult) {
        const msg = xpResult.msg || xpResult;
        if (msg) store.notify(typeof msg === 'string' ? msg : xpResult.msg);
        celebrate(xpResult.hitGoal ? 'daily-goal' : 'leaf-done');
        store._scheduleRankingPublish?.();
    }
    if (store.userStore.isCompleted(nodeId)) {
        updateCareOnLessonCompleteFallback(store, nodeId);
    }
    store.update({});
    store.dispatchEvent(new CustomEvent('graph-update'));
    checkForModuleCompletionAction(nodeId);
}

export function markExamExemptSiblingLeavesAction(examNodeId) {
    const store = shell();
    if (!store) return undefined;

        const exam = store.findNode?.(examNodeId);
        if (!exam || exam.type !== 'exam' || !exam.parentId) return;
        const parent = store.findNode?.(exam.parentId);
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
            if (!store.userStore.state.completedNodes.has(id)) {
                store.userStore.state.completedNodes.add(id);
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
            if (!store.userStore.state.completedNodes.has(id)) {
                store.userStore.state.completedNodes.add(id);
                changed = true;
                updateCareOnLessonCompleteFallback(store, id);
            }
        }
        if (changed) {
            store.userStore.persist();
            store.update({});
            store.dispatchEvent(new CustomEvent('graph-update'));
        }
        checkForModuleCompletionAction(examNodeId);
    
}

export function markBranchCompleteAction(branchId) {
    const store = shell();
    if (!store) return undefined;

        if (!branchId) return;
        const branchNode = store.findNode?.(branchId);
        
        if (branchNode) {
            store.userStore.state.completedNodes.add(branchNode.id);
            
            if (branchNode.children) {
                branchNode.children.forEach(child => {
                    store.userStore.state.completedNodes.add(child.id);
                });
            }
            
            if (branchNode.leafIds && Array.isArray(branchNode.leafIds)) {
                branchNode.leafIds.forEach(id => store.userStore.state.completedNodes.add(id));
            }
            
            DataProcessor.hydrateCompletionState(store, branchNode);
        }
        
        store.userStore.persist();
        store.update({});
        store.dispatchEvent(new CustomEvent('graph-update'));
    
}

export function checkForModuleCompletionAction(relatedNodeId) {
    const store = shell();
    if (!store) return undefined;

        const modules = store.getModulesStatus?.() ?? [];
        modules.forEach(m => {
            if (m.isComplete) {
                if (!store.userStore.state.completedNodes.has(m.id)) {
                     store.markBranchComplete?.(m.id);
                }
                store.harvestSeed?.(m.id);
            }
        });
    
}

export function getExportJsonAction() {
    const store = shell();
    if (!store) return undefined;
 return store.userStore.getExportJson(); 
}

export function buildArboritoBundleObjectAction() {
    const store = shell();
    if (!store) return undefined;

        const raw = store.state.rawGraphData;
        const src = store.state.activeSource;
        if (!raw || !src) return null;
        const rawCopy = JSON.parse(JSON.stringify(raw));
        syncReadmeFromUniversePresentation(rawCopy, store.ui);
        return buildArboritoBundle({
            rawGraphData: rawCopy,
            activeSource: src,
            persistenceData: store.userStore.getPersistenceData(),
            forumSnapshot: store.forumStore.getSnapshot(src.id),
            instanceId: src.id,
            collaboratorRoles: store.value?.treeCollaboratorRoles || null,
        });
    
}

export async function exportBranchArchiveAction(treeId, { releaseSnapshotIds = null } = {}) {
    const store = shell();
    if (!store) return undefined;

        const entry = store.userStore.state.branches.find((t) => t.id === treeId);
        if (!entry) return null;
        const treeCopy = JSON.parse(JSON.stringify(entry.data));
        syncReadmeFromUniversePresentation(treeCopy, store.ui);
        const sanitizeOpts =
            releaseSnapshotIds == null ? {} : { releaseSnapshotIds };
        const curriculumOnly = sanitizeCurriculumForArboritoArchive(treeCopy, sanitizeOpts);
        const { buildBranchExportAttribution } = await import('../shared/lib/arborito-attribution.js');
        const attribution = buildBranchExportAttribution(store, {
            treeData: curriculumOnly,
            branchId: entry.id,
        });
        return store.userStore.serializeArboritoArchive(entry.id, entry.name, curriculumOnly, { attribution });
    
}

/** Store.prototype — explicit actions. */
export const userProgressBundleMethods = {
    checkStreak: checkStreakAction,
    addXP: addXPAction,
    harvestSeed: harvestSeedAction,
    updateGamification: updateGamificationAction,
    updateUserProfile: updateUserProfileAction,
    markComplete: markCompleteAction,
    markExamExemptSiblingLeaves: markExamExemptSiblingLeavesAction,
    markBranchComplete: markBranchCompleteAction,
    checkForModuleCompletion: checkForModuleCompletionAction,
    getExportJson: getExportJsonAction,
    buildArboritoBundleObject: buildArboritoBundleObjectAction,
    exportBranchArchive: exportBranchArchiveAction,
};
