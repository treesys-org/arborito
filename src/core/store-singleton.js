/** Break circular imports, bind once from store.js after the singleton is constructed. */
/** @type {import('./store.js').store | null} */
let _store = null;

export function bindArboritoStore(instance) {
    _store = instance;
}

function getArboritoStoreImpl() {
    return _store;
}

/**
 * Singleton store accessor.
 *
 * Callable as `getArboritoStore()` and also forwards property/method access so legacy
 * `import { getArboritoStore as store }` keeps working (`store.ui`, `store.addEventListener`, …).
 */
export const getArboritoStore = new Proxy(getArboritoStoreImpl, {
    get(target, prop, receiver) {
        if (prop === 'prototype' || prop === '__proto__') {
            return Reflect.get(target, prop, receiver);
        }
        if (Object.prototype.hasOwnProperty.call(target, prop)) {
            return Reflect.get(target, prop, receiver);
        }
        const s = _store;
        if (s == null) return undefined;
        const v = s[prop];
        if (typeof v === 'function') return v.bind(s);
        return v;
    },
    apply() {
        return _store;
    },
});
