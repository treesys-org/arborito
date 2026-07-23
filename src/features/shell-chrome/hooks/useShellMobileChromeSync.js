import { useEffect } from 'react';
import { getArboritoStore } from '../../../core/store-singleton.js';
import { syncLessonReaderChromeClass } from '../../../shared/ui/lesson-reader-open.js';
import { syncMobileTreeShellClass } from '../../../shared/ui/mobile-tree-shell-class.js';

/**
 * Keeps `<html>` mobile/lesson chrome classes in sync when local sidebar UI
 * (e.g. More menu) or shell slices change. Singleton access stays in hooks/.
 */
export function useShellMobileChromeSync({
    mobileMoreOpen,
    modal,
    viewMode,
    selectedNode,
    previewNode,
    treeHydrating,
    data,
}) {
    useEffect(() => {
        const store = getArboritoStore();
        syncMobileTreeShellClass(store, { mobileMoreOpen });
        syncLessonReaderChromeClass(store);
    }, [mobileMoreOpen, modal, viewMode, selectedNode, previewNode, treeHydrating, data]);
}
