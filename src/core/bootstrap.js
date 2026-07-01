/**
 * Boot-time entry — import store singleton and secondary prefetch without pulling store in app code.
 */
export { store } from './store.js';
export { prefetchSecondaryServices } from './store-lazy-modules.js';
export { getArboritoStore, bindArboritoStore } from './store-singleton.js';
