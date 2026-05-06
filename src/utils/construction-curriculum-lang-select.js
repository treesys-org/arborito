import { store } from '../store.js';
import { curriculumLangOptionText } from '../config/curriculum-locale-presets.js';

/** Sentinel value in curriculum language `<select>`: opens the “add language” flow. */
export const CURRICULUM_LANG_SELECT_ADD = '__arborito_add_lang__';

/** Language shown in the `<select>` when `curriculumEditLang` is null (same logic as `getCurrentContentLangKey`). */
export function resolveCurriculumSelectDisplayKey(curriculumEditLang, langKeys, appLang) {
    if (!langKeys.length) return '';
    if (curriculumEditLang && langKeys.includes(curriculumEditLang)) return curriculumEditLang;
    const al = appLang && String(appLang);
    if (al && langKeys.includes(al)) return al;
    return langKeys[0];
}

export function curriculumLangSelectOptionsHtml(ui, langKeys, curriculumEditLang, escHtml, appLang) {
    const displayKey = resolveCurriculumSelectDisplayKey(curriculumEditLang, langKeys, appLang);
    const opts = langKeys
        .map((k) => {
            const sel = displayKey === k;
            const lab = curriculumLangOptionText(k);
            return `<option value="${escHtml(k)}"${sel ? ' selected' : ''}>${escHtml(lab)}</option>`;
        })
        .join('');
    const canAdd =
        store.state.constructionMode &&
        typeof store.canOfferCurriculumLanguageAdd === 'function' &&
        store.canOfferCurriculumLanguageAdd();
    if (!canAdd) return opts;
    const addLab = escHtml(ui.conCurriculumLangAddOption || ui.conMoreRowAddLang || '+ Add language…');
    const addOpt = `<option value="${CURRICULUM_LANG_SELECT_ADD}">${addLab}</option>`;
    return `${opts}${addOpt}`;
}

/**
 * @param {HTMLSelectElement | null} sel
 * @param {{ onPickAdd?: () => void; addLangOpts?: Record<string, unknown> }} [opts]
 */
export function bindCurriculumLangSelect(sel, opts = {}) {
    const { onPickAdd, addLangOpts } = opts;
    if (!sel) return;
    sel.onchange = () => {
        const v = sel.value;
        if (v === CURRICULUM_LANG_SELECT_ADD) {
            const keys = Object.keys((store.state.rawGraphData && store.state.rawGraphData.languages) || {}).sort();
            const disp = resolveCurriculumSelectDisplayKey(
                store.state.curriculumEditLang,
                keys,
                store.state.lang || ''
            );
            sel.value = store.state.curriculumEditLang || disp || keys[0] || '';
            (onPickAdd && onPickAdd());
            store.addCurriculumLanguageInteractive(addLangOpts || {});
            return;
        }
        store.setCurriculumEditLang(v || null);
    };
}
