
import { TreeUtils } from './tree-utils.js';
import { fileSystem } from '../services/filesystem.js';
import { restoreTreeUiStateAfterLoad } from './tree-ui-persist.js';
import { shouldOfferReadmeIntro } from './readme-intro.js';
import { consumePendingCurriculumSwitcher } from './curriculum-switcher-pending.js';
import { scheduleSearchIndexRebuild } from './search-index-service.js';

export const DataProcessor = {
    /**
     * Processes the raw JSON tree into the application state.
     * Handles language fallback, exam prefixes, empty states, and hydration.
     * @param {{ suppressReadmeAutoOpen?: boolean, carryOverSelection?: boolean }} [options] — set true for in-place graph refreshes (save, graph CRUD) so the readme intro does not reopen. `carryOverSelection`: re-bind open lesson; default true; `mountCurriculum` passes false when switching source.
     */
    process(store, json, finalSource, options = {}) {
        const { suppressReadmeAutoOpen = false, carryOverSelection: carryOverride } = options;
        const carryOverSelection = carryOverride !== undefined ? !!carryOverride : true;
        const ui = store.ui; // Access UI strings via store proxy (loadData must have loaded i18n first).

        /** Legacy trees: root JSON without a `languages` wrapper that has entries (root node only). */
        const langsBefore = json && typeof json === 'object' ? json.languages : null;
        const hadLanguageMap =
            langsBefore &&
            typeof langsBefore === 'object' &&
            !Array.isArray(langsBefore) &&
            Object.keys(langsBefore).length > 0;
        if (json && typeof json === 'object' && !hadLanguageMap) {
            const t = json.type;
            const looksLikeRoot =
                t === 'root' ||
                (t === 'branch' && json.id != null) ||
                (Array.isArray(json.children) && json.id != null);
            if (looksLikeRoot) {
                const code =
                    store.state.lang && String(store.state.lang).length >= 2
                        ? String(store.state.lang).toUpperCase().slice(0, 8)
                        : 'EN';
                json = { languages: { [code]: json } };
            }
        }

        const langsAfter = json && typeof json === 'object' ? json.languages : null;
        const hasLanguageMap =
            langsAfter &&
            typeof langsAfter === 'object' &&
            !Array.isArray(langsAfter) &&
            Object.keys(langsAfter).length > 0;

        let langData = null;
        if (json && hasLanguageMap) {
            const availableLangs = Object.keys(json.languages);
            const norm = (c) => String(c || '').toUpperCase();
            const keyByUpper = new Map(availableLangs.map((k) => [norm(k), k]));
            let resolvedKey = null;
            if (
                store.state.constructionMode &&
                store.state.curriculumEditLang &&
                keyByUpper.has(norm(store.state.curriculumEditLang))
            ) {
                resolvedKey = keyByUpper.get(norm(store.state.curriculumEditLang));
            } else if (keyByUpper.has(norm(store.state.lang))) {
                resolvedKey = keyByUpper.get(norm(store.state.lang));
            } else if (availableLangs.length > 0) {
                resolvedKey = availableLangs[0];
            }
            langData = resolvedKey ? json.languages[resolvedKey] : null;
            if (!langData && availableLangs.length > 0) {
                langData = json.languages[availableLangs[0]];
            }
        }

        if (!langData) {
            store.update({ loading: false, error: ui.errorNoContent || "No valid content found in this tree." });
            return;
        }
        
        // Post-processing: Exam Prefixes & Empty State Detection
        const examPrefix = ui.examLabelPrefix || "Exam: ";
        
        const processNode = (node) => {
            // 1. Exam Prefix (name may be missing or non-string in bad data)
            if (node.type === 'exam') {
                const rawName = node.name == null ? '' : String(node.name);
                node.name = rawName.startsWith(examPrefix) ? rawName : examPrefix + rawName;
            }
            
            // 2. Empty State Detection (Fix for immediate visual feedback)
            // If it is a container (branch/root), has no children, and is not waiting for network (unloaded)
            if ((node.type === 'branch' || node.type === 'root') && 
                (!node.children || node.children.length === 0) && 
                !node.hasUnloadedChildren) {
                node.isEmpty = true;
            }

            if (node.children) node.children.forEach(processNode);
        };
        
        processNode(langData);
        
        // SMART HYDRATION: Expand completed branches into leaves in memory
        this.hydrateCompletionState(store, langData);

        /**
         * Only re-bind lesson/preview when refreshing the SAME source (e.g. save to local).
         * After `mountCurriculum`, `activeSource` already points at the destination; comparing ids alone
         * would false-positive when switching local garden → network tree with different ids — the flag comes from mount.
         */
        const prevSel = store.state.selectedNode;
        const prevPreview = store.state.previewNode;
        let nextSelected = null;
        let nextPreview = null;
        if (carryOverSelection) {
            if ((prevSel && prevSel.id) != null) {
                const resolved = TreeUtils.findNode(prevSel.id, langData);
                if (resolved && (resolved.type === 'leaf' || resolved.type === 'exam')) {
                    nextSelected = resolved;
                }
            }
            if (!nextSelected && (prevPreview && prevPreview.id) != null) {
                const resolved = TreeUtils.findNode(prevPreview.id, langData);
                if (resolved && (resolved.type === 'leaf' || resolved.type === 'exam')) {
                    nextPreview = resolved;
                }
            }
        }

        store.update({ 
            activeSource: finalSource,
            data: langData, 
            rawGraphData: json,
            loading: false, 
            path: [langData], 
            lastActionMessage: ui.sourceSwitchSuccess,
            // Same curriculum: re-resolve node ids so lesson/preview stay valid after load (local CRUD, etc.).
            // Different source: drop refs so stale pointers cannot survive a version switch.
            selectedNode: nextSelected,
            previewNode: nextPreview
        });

        if (store.state.constructionMode && !fileSystem.features.canWrite) {
            store.update({ constructionMode: false });
        }

        try {
            try {
                localStorage.setItem('arborito-active-source-id', finalSource.id);
                localStorage.setItem('arborito-active-source-meta', JSON.stringify(finalSource));
            } catch {
                /* quota / private mode — do not block graph load */
            }
            restoreTreeUiStateAfterLoad(store);
        } finally {
            store.dispatchEvent(new CustomEvent('graph-update'));
            queueMicrotask(() => {
                try {
                    scheduleSearchIndexRebuild(store);
                } catch (e) {
                    console.warn('search-index: schedule failed', e);
                }
            });
            setTimeout(() => store.dispatchEvent(new CustomEvent('reset-zoom')), 100);
        }

        setTimeout(() => store.update({ lastActionMessage: null }), 3000);

        // Modals: only on full loadData (not internal refresh). Priority: versions after snapshot change > readme intro.
        if (!suppressReadmeAutoOpen && store.state.activeSource && !store.state.modal) {
            const pendingSwitch = consumePendingCurriculumSwitcher();
            if (pendingSwitch) {
                // Do not open version timeline after HTTPS snapshot change when destination is local garden / network (author);
                // constructionMode used to be required, but during plant/load it is still false → ghost modal.
                const skipReleasesAuto =
                    fileSystem.isLocal ||
                    fileSystem.isNostrTreeSource() ||
                    (finalSource && finalSource.type) === 'local' ||
                    ((finalSource && finalSource.url) && String(finalSource.url).startsWith('local://'));
                if (!skipReleasesAuto) {
                    setTimeout(() => {
                        if (!store.state.modal)
                            store.dispatchEvent(new CustomEvent('open-curriculum-switcher', { detail: { preferTab: 'version' } }));
                    }, 450);
                }
            } else if (shouldOfferReadmeIntro(suppressReadmeAutoOpen)) {
                setTimeout(() => {
                    if (!store.state.modal && !store.state.constructionMode) store.setModal('readme');
                }, 500);
            }
        }
    },

    /**
     * SMART HYDRATION (THE COMPRESSION HACK)
     * If a branch ID is in `completedNodes`, automatically add all its children to the Set in memory.
     */
    hydrateCompletionState(store, rootNode) {
        const completedSet = store.userStore.state.completedNodes;
        let hydratedCount = 0;

        const traverse = (node) => {
            // If parent is complete, ensure children are complete in memory
            if (completedSet.has(node.id)) {
                // If it has loaded children, mark them
                if (node.children) {
                    node.children.forEach(child => {
                        if (!completedSet.has(child.id)) {
                            completedSet.add(child.id);
                            hydratedCount++;
                        }
                        // Recurse down to ensure deep leaves are marked
                        traverse(child);
                    });
                } 
                // If children are unloaded but we have leafIds metadata
                else if (node.leafIds && Array.isArray(node.leafIds)) {
                    node.leafIds.forEach(id => {
                        if (!completedSet.has(id)) {
                            completedSet.add(id);
                            hydratedCount++;
                        }
                    });
                }
            } else {
                // Continue searching down
                if (node.children) node.children.forEach(traverse);
            }
        };
        
        traverse(rootNode);
        if (hydratedCount > 0) {
            console.log(`Arborito hydration: expanded ${hydratedCount} implicit completions from compressed save.`);
        }
    }
};
