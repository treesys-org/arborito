import { useMemo } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { reactStateStore } from '../../stores/react-state.js';
import { shellUiStore } from '../../stores/shell-ui-store.js';
import { learningStore } from '../../stores/learning-store.js';
import { treeGraphStore } from '../../stores/tree-graph-store.js';
import { sourcesStore } from '../../stores/sources-store.js';
import { searchStore } from '../../stores/search-store.js';
import { nostrStore } from '../../stores/nostr-store.js';

/** Tree fields that change on every tap (graphUi.revision) — kept out of the default merge. */
const treeStableSelector = (s) => ({
    data: s.data,
    rawGraphData: s.rawGraphData,
    constructionMode: s.constructionMode,
    constructionEditFocus: s.constructionEditFocus,
    constructionLockedBranchRefId: s.constructionLockedBranchRefId,
    curriculumEditLang: s.curriculumEditLang,
    treeHydrating: s.treeHydrating,
    treeGrowingOverlay: s.treeGrowingOverlay,
    treeContext: s.treeContext,
    nostrLiveSeeds: s.nostrLiveSeeds,
    webtorrentSeeder: s.webtorrentSeeder,
});

const treeWithGraphUiSelector = (s) => ({
    ...treeStableSelector(s),
    graphUi: s.graphUi,
});

/**
 * Estado React compuesto desde slices de dominio + i18n.
 * Omite `graphUi` para que taps en el árbol no re-rendericen shell/toasts/modales.
 * Componentes del grafo: `useArboritoGraphUiState()` o `useTreeGraph()`.
 */
export function useArboritoStore() {
    const i18n = useStore(reactStateStore);
    const shell = useStore(shellUiStore);
    const learning = useStore(learningStore);
    const treeStable = useStore(treeGraphStore, useShallow(treeStableSelector));
    const sources = useStore(sourcesStore);
    const search = useStore(searchStore);
    const nostr = useStore(nostrStore);

    return useMemo(
        () => ({
            ...i18n,
            ...shell,
            ...learning,
            ...treeStable,
            ...sources,
            ...search,
            ...nostr,
        }),
        [i18n, shell, learning, treeStable, sources, search, nostr]
    );
}

/** Full tree slice including high-churn graphUi — for graph/mobile tree only. */
export function useArboritoGraphUiState() {
    return useStore(treeGraphStore, useShallow(treeWithGraphUiSelector));
}
