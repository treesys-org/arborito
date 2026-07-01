/**
 * Attaches all feature store actions to Store.prototype at boot.
 * Bundles por dominio: `attach-action-bundles.js`.
 */
import { applyPrototypeMethods } from '../core/apply-prototype-methods.js';
import { allStoreActionBundles } from './attach-action-bundles.js';

/** @param {import('../core/store.js').Store} StoreClass */
export function attachAllStoreActions(StoreClass) {
    applyPrototypeMethods(StoreClass.prototype, ...allStoreActionBundles);
}
