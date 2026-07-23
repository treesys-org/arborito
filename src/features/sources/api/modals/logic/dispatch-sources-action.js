/** Dispatch a sources modal action through the registered hook handler. */
let actionHandler = null;

export function registerSourcesActionHandler(fn) {
    actionHandler = typeof fn === 'function' ? fn : null;
}

export function dispatchSourcesAction(action, fields = {}) {
    if (!actionHandler) return;
    void actionHandler(action, fields);
}
