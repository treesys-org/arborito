/** @param {import('./shell-store.js').ShellStore} store */
export function setThemeOnStore(store, theme, options = {}) {
    store._persistThemePreference = !!options.persist;
    store.update({ theme });
}

/** @param {import('./shell-store.js').ShellStore} store */
export function toggleThemeOnStore(store) {
    const next = store.state.theme === 'light' ? 'dark' : 'light';
    setThemeOnStore(store, next, { persist: true });
}
