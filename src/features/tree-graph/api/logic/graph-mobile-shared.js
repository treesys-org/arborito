import { getArboritoStore as store } from '../../../../core/store-singleton.js';
import { escHtml, escAttr } from '../../../../shared/lib/html-escape.js';

// Re-exported so existing consumers (modals, search-panel, sibling files) can
// continue importing the escape helpers through the graph-mobile family.
export { escHtml, escAttr };

// --- Tree switcher (installed sources) ---
export const TREE_SWITCHER_BTN_ID = 'arborito-tree-switcher-btn';
export const TREE_SWITCHER_BACKDROP_ID = 'arborito-tree-switcher-backdrop';
export const TREE_SWITCHER_PANEL_ID = 'arborito-tree-switcher-panel';
export const TREE_SWITCHER_SEARCH_ID = 'arborito-tree-switcher-search';
export const TREE_SWITCHER_LIST_ID = 'arborito-tree-switcher-list';
export const TREE_SWITCHER_MORE_ID = 'arborito-tree-switcher-more';
export const TREE_SWITCHER_ITEM_CLASS = 'arborito-tree-switcher-item';

// --- Unified curriculum switcher (Version + Tree) ---
export const CURRICULUM_SWITCHER_BTN_ID = 'arborito-curriculum-switcher-btn';
export const CURRICULUM_SWITCHER_VERSION_LIVE_ID = 'arborito-curriculum-switcher-version-live';
export const CURRICULUM_SWITCHER_VERSION_ITEM_CLASS = 'arborito-curriculum-switcher-version-item';
export const CURRICULUM_SWITCHER_VERSION_LOCAL_ID = 'arborito-curriculum-switcher-version-local';
export const CURRICULUM_SWITCHER_SNAP_INP_ID = 'arborito-curriculum-switcher-snap-inp';
export const CURRICULUM_SWITCHER_SNAP_CREATE_ID = 'arborito-curriculum-switcher-snap-create';
export const CURRICULUM_SWITCHER_SNAP_ITEM_CLASS = 'arborito-curriculum-switcher-snap-item';
export const CURRICULUM_SWITCHER_SNAP_DEL_CLASS = 'arborito-curriculum-switcher-snap-del';
export const CURRICULUM_SWITCHER_VERSION_SEARCH_ID = 'arborito-curriculum-switcher-version-search';
export const CURRICULUM_SWITCHER_SNAP_SEARCH_ID = 'arborito-curriculum-switcher-snap-search';

