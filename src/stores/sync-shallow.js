/**
 * Skip zustand setState when no top-level field changed — cuts re-renders from syncReactSnapshot.
 */
export function patchStoreSlice(store, partial) {
    if (!partial || typeof partial !== 'object') return;
    const cur = store.getState();
    let changed = false;
    for (const key of Object.keys(partial)) {
        if (!Object.is(cur[key], partial[key])) {
            changed = true;
            break;
        }
    }
    if (changed) store.setState(partial);
}
