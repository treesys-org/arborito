
import { TreeUtils } from './tree-utils.js';
import { restoreTreeUiStateAfterLoad } from './tree-ui-persist.js';

export const DataProcessor = {
    /**
     * Processes the raw JSON tree into the application state.
     * Handles language fallback, exam prefixes, empty states, and hydration.
     */
    process(store, json, finalSource) {
        const ui = store.ui; // Access UI strings via store proxy
        
        // Fallback for lang
        if (!store.state.i18nData) store.loadLanguage(store.state.lang);

        let langData = null;
        if (json && json.languages) {
            langData = json.languages[store.state.lang];
            if (!langData) {
                const availableLangs = Object.keys(json.languages);
                if (availableLangs.length > 0) langData = json.languages[availableLangs[0]];
            }
        }

        if (!langData) {
            store.update({ loading: false, error: ui.errorNoContent || "No valid content found in this tree." });
            return;
        }
        
        // Post-processing: Exam Prefixes & Empty State Detection
        const examPrefix = ui.examLabelPrefix || "Exam: ";
        
        const processNode = (node) => {
            // 1. Exam Prefix
            if (node.type === 'exam' && !node.name.startsWith(examPrefix)) {
                node.name = examPrefix + node.name;
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

        store.update({ 
            activeSource: finalSource,
            data: langData, 
            rawGraphData: json,
            loading: false, 
            path: [langData], 
            lastActionMessage: ui.sourceSwitchSuccess,
            // Must drop old graph node refs or taps / content panel keep stale objects after version switch
            selectedNode: null,
            previewNode: null
        });
        
        localStorage.setItem('arborito-active-source-id', finalSource.id);
        localStorage.setItem('arborito-active-source-meta', JSON.stringify(finalSource));
        
        store.dispatchEvent(new CustomEvent('graph-update'));
        setTimeout(() => {
            restoreTreeUiStateAfterLoad(store);
            store.dispatchEvent(new CustomEvent('graph-update'));
        }, 0);
        setTimeout(() => store.dispatchEvent(new CustomEvent('reset-zoom')), 100);

        setTimeout(() => store.update({ lastActionMessage: null }), 3000);
        
        // --- README MODAL TRIGGER ---
        if (store.state.activeSource && !store.state.modal) {
            const sourceId = store.state.activeSource.id.split('-')[0];
            const skipKey = `arborito-skip-readme-${sourceId}`;
            
            if (localStorage.getItem(skipKey) !== 'true') {
                setTimeout(() => {
                    if (!store.state.modal) store.setModal('readme');
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
