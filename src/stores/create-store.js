import { createStore as zustandCreate } from 'zustand/vanilla';
import { useStore } from 'zustand';

/**
 * Thin wrapper so feature stores share the same factory and devtools hook later.
 * Usage in features/<name>/hooks/useNameStore.js:
 *
 *   import { createArboritoStore } from '../../../stores/create-store.js';
 *   export const nameStore = createArboritoStore((set, get) => ({ ... }));
 *   export const useNameStore = (selector) => useStore(nameStore, selector);
 */
export function createArboritoStore(initializer) {
    return zustandCreate(initializer);
}

export { useStore };
