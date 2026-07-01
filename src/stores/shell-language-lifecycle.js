import { normalizeAppLangCode } from '../core/i18n.js';
import { fetchLocalePack } from '../core/i18n-runtime.js';
import { ES_UI_BOOT_STUB, EN_UI_BOOT_STUB, bootStubForLang } from './shell-boot-stubs.js';

/** @param {import('./shell-store.js').ShellStore} store */
export async function loadLanguageOnStore(store, langCode) {
    const lang = normalizeAppLangCode(langCode);
    const stub = lang === 'ES' ? ES_UI_BOOT_STUB : EN_UI_BOOT_STUB;
    if (!store.state.i18nData) {
        store.update({ i18nData: { ...stub } });
    }
    try {
        const boot = await fetchLocalePack(lang);
        if (normalizeAppLangCode(store.state.lang) !== lang) return;
        store.update({ i18nData: boot });
    } catch (e) {
        console.error(`Language load failed for ${lang}`, e);
        if (lang !== 'EN') await loadLanguageOnStore(store, 'EN');
        else {
            store.update({
                i18nData: {
                    appTitle: 'Arborito (Recovery)',
                    loading: 'Loading...',
                    errorTitle: 'Error',
                    errorNoTrees: 'Language Error',
                },
            });
        }
    }
}

/**
 * Change UI language and optionally reload the active tree.
 * Do not dismiss the language / onboarding modal before this promise settles.
 * @param {import('./shell-store.js').ShellStore} store
 */
export async function setLanguageOnStore(store, lang, opts = {}) {
    const uiOnly = !!(opts && opts.uiOnly);
    const target = normalizeAppLangCode(lang);
    if (normalizeAppLangCode(store.state.lang) === target && store.state.i18nData) return;

    const modalSnap = store.state.modal;
    const modalType = typeof modalSnap === 'string' ? modalSnap : modalSnap && modalSnap.type;
    const deferNavigation = modalType === 'language' || modalType === 'onboarding';

    if (uiOnly && modalType === 'onboarding') {
        store.update({
            lang: target,
            i18nData: bootStubForLang(target),
            loading: false,
        });
        void fetchLocalePack(target)
            .then((pack) => {
                const stillOnboarding = (() => {
                    const m = store.state.modal;
                    return typeof m === 'object' && m && m.type === 'onboarding';
                })();
                if (!stillOnboarding) return;
                if (normalizeAppLangCode(store.state.lang) !== target) return;
                store.update({ i18nData: pack });
            })
            .catch(() => {});
        return;
    }

    if (!uiOnly) {
        store.update({ loading: true, error: null });
    }

    let appliedLang = target;
    /** @type {object | null} */
    let pack = null;
    try {
        pack = await fetchLocalePack(target);
    } catch (e) {
        console.error('[Arborito] setLanguage: pack load failed', target, e);
        if (target !== 'EN') {
            try {
                appliedLang = 'EN';
                pack = await fetchLocalePack('EN', { bypassCache: true });
            } catch (e2) {
                console.error('[Arborito] setLanguage: EN fallback failed', e2);
                store.update({ loading: false, error: String((e && e.message) || e) });
                return;
            }
        } else {
            store.update({ loading: false, error: String((e && e.message) || e) });
            return;
        }
    }

    store.update({
        lang: appliedLang,
        i18nData: pack,
        searchCache: {},
        ...(uiOnly ? { loading: false } : {}),
    });

    if (uiOnly) return;

    try {
        if (store.state.activeSource) await store.loadData(store.state.activeSource, false);
        else store.update({ loading: false });
    } catch (e) {
        console.error('[Arborito] setLanguage: curriculum reload failed', e);
        store.update({ loading: false, error: String((e && e.message) || e) });
    }

    if (!deferNavigation) store.goHome();
}
