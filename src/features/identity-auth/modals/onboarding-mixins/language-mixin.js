import { store } from '../../../../core/store.js';

/** Language picker step. The buttons themselves are rendered as part of the
 * welcome step (`welcome-mixin._renderStep1`); this mixin owns the actual
 * language-change action so the rendering and the side effect can evolve
 * independently. `uiOnly: true` keeps the change scoped to the UI without
 * touching any tree-content language preference (the user hasn't picked a
 * tree yet at this point in the wizard). */
export const languageMixin = {
    _setLanguage(code) {
        const c = String(code || '').trim();
        if (!c) return;
        void store.setLanguage(c, { uiOnly: true });
    }
};
