import { patchLearningSlice } from './learning-store.js';
import { patchTreeGraphSlice } from './tree-graph-store.js';
import { patchSourcesSlice } from './sources-store.js';
import { patchShellUiSlice } from './shell-ui-store.js';
import { patchSearchSlice } from './search-store.js';
import { patchNostrSlice } from './nostr-store.js';

const NOSTR_KEYS = ['treeCollaboratorRoles'];

const LEARNING_KEYS = ['ai', 'selectedNode', 'previewNode', 'path', 'lessonOpenHint'];
const TREE_GRAPH_KEYS = [
    'data',
    'rawGraphData',
    'graphUi',
    'constructionMode',
    'constructionEditFocus',
    'constructionLockedBranchRefId',
    'curriculumEditLang',
    'treeHydrating',
    'treeGrowingOverlay',
    'treeContext',
    'nostrLiveSeeds',
    'webtorrentSeeder',
];
const SOURCES_KEYS = ['communitySources', 'activeSource', 'availableReleases', 'pendingUntrustedSource'];
const SEARCH_KEYS = ['searchIndexStatus', 'searchIndexError', 'searchCache'];
const SHELL_UI_KEYS = [
    'theme',
    'lang',
    'viewMode',
    'modal',
    'modalOverlay',
    'loading',
    'error',
    'cloudSyncBanner',
    'certificatesFromMobileMore',
    'lastErrorMessage',
    'lastActionMessage',
    'publishingTree',
];

function pickKeys(fullState, keys) {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const key of keys) {
        if (key in fullState) out[key] = fullState[key];
    }
    return out;
}

/**
 * Sincroniza slices Zustand de dominio en el mismo tick que `store.update()`.
 * Evita esperar al microtask de `syncReactSnapshot()` en UI interactiva.
 *
 * @param {Record<string, unknown>} partial — claves del patch recién aplicado
 * @param {Record<string, unknown>} fullState — `store.state` tras el merge
 */
export function patchDomainSlicesFromPartial(partial, fullState) {
    if (!partial || typeof partial !== 'object' || !fullState) return;

    const learning = pickKeys(fullState, LEARNING_KEYS.filter((k) => k in partial));
    if (Object.keys(learning).length) patchLearningSlice(learning);

    const tree = pickKeys(fullState, TREE_GRAPH_KEYS.filter((k) => k in partial));
    if (Object.keys(tree).length) patchTreeGraphSlice(tree);

    const sources = pickKeys(fullState, SOURCES_KEYS.filter((k) => k in partial));
    if (Object.keys(sources).length) patchSourcesSlice(sources);

    const search = pickKeys(fullState, SEARCH_KEYS.filter((k) => k in partial));
    if (Object.keys(search).length) patchSearchSlice(search);

    const shell = pickKeys(fullState, SHELL_UI_KEYS.filter((k) => k in partial));
    if (Object.keys(shell).length) patchShellUiSlice(shell);

    const nostr = pickKeys(fullState, NOSTR_KEYS.filter((k) => k in partial));
    if (Object.keys(nostr).length) patchNostrSlice(nostr);
}
