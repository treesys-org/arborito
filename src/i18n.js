
export const AVAILABLE_LANGUAGES = [
    { code: 'EN', name: 'English', flag: '🇺🇸', nativeName: 'English' },
    { code: 'ES', name: 'Spanish', flag: '🇪🇸', nativeName: 'Español' }
];

/** Uppercase UI/lang codes (`EN`, `ES`, …) so compares match locale buttons + JSON filenames. */
export function normalizeAppLangCode(code) {
    const c = String(code != null ? code : '').trim().toUpperCase();
    const hit = AVAILABLE_LANGUAGES.find((l) => l.code === c);
    return hit ? hit.code : 'EN';
}