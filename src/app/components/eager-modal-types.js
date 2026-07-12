/**
 * Eager modal route keys, bundled with the shell (instant open).
 * All other modal types load lazily via modal-chunk-loaders.js.
 */
export const EAGER_MODAL_TYPE_KEYS = [
    'dialog',
    'profile',
    'about',
    'language',
    'preview',
    'certificate',
    'emptyModule',
    'privacy',
    'celebration-prefs',
    'download-app',
    'accessibility-prefs',
    'security-warning',
    'load-warning',
    'tree-info',
    'move-node',
    'pick-curriculum-lang',
    'sync-login-qr-scanner',
    'account-recovery',
    'change-password',
    'construction-about',
    'arborito-support',
];

export const EAGER_MODAL_TYPE_SET = new Set(EAGER_MODAL_TYPE_KEYS);
