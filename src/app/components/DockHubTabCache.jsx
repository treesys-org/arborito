import { prefetchModal } from '../modal-open.js';

/** Heavy dock tabs kept alive (LRU 2) inside the shared browse sheet. */
export const DOCK_HUB_CACHEABLE_TYPES = new Set(['search', 'arcade', 'forum']);

const CACHE_MAX = 2;

let _lruTabs = [];

function touchLru(type) {
    if (!DOCK_HUB_CACHEABLE_TYPES.has(type)) return [type];
    _lruTabs = [type, ..._lruTabs.filter((t) => t !== type)].slice(0, CACHE_MAX);
    return [..._lruTabs];
}

export function getDockHubCachedTypes(activeType) {
    if (!activeType) return [];
    if (!DOCK_HUB_CACHEABLE_TYPES.has(activeType)) return [activeType];
    return touchLru(activeType);
}

export function isDockHubCacheableType(type) {
    return !!(type && DOCK_HUB_CACHEABLE_TYPES.has(type));
}

/** Prefetch dock tab chunk on intent or tab switch. */
export function recordDockHubTabVisit(type) {
    if (!type || !DOCK_HUB_CACHEABLE_TYPES.has(type)) return;
    prefetchModal(type);
}

/** Hide inactive cached tabs without unmounting. */
export function DockHubTabCacheSlot({ type, visible, children }) {
    if (!children) return null;
    return (
        <div
            data-dock-hub-tab={type}
            className="flex flex-col flex-1 min-h-0 w-full h-full"
            style={visible ? undefined : { display: 'none' }}
            aria-hidden={visible ? undefined : true}
        >
            {children}
        </div>
    );
}
