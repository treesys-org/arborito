/**
 * Fixed curriculum language codes (tree `languages` keys). Authors pick from this list only.
 * Flag + short label for UI; code is stored as shown (e.g. PT_BR).
 */
export const CURRICULUM_LOCALE_PRESETS = [
    { code: 'EN', flag: '🇺🇸', label: 'English' },
    { code: 'ES', flag: '🇪🇸', label: 'Español' },
    { code: 'DE', flag: '🇩🇪', label: 'Deutsch' },
    { code: 'FR', flag: '🇫🇷', label: 'Français' },
    { code: 'IT', flag: '🇮🇹', label: 'Italiano' },
    { code: 'PT', flag: '🇵🇹', label: 'Português' },
    { code: 'PT_BR', flag: '🇧🇷', label: 'Português (Brasil)' },
    { code: 'NL', flag: '🇳🇱', label: 'Nederlands' },
    { code: 'PL', flag: '🇵🇱', label: 'Polski' },
    { code: 'RU', flag: '🇷🇺', label: 'Русский' },
    { code: 'UA', flag: '🇺🇦', label: 'Українська' },
    { code: 'JA', flag: '🇯🇵', label: '日本語' },
    { code: 'KO', flag: '🇰🇷', label: '한국어' },
    { code: 'ZH', flag: '🇨🇳', label: '中文' },
    { code: 'AR', flag: '🇸🇦', label: 'العربية' },
    { code: 'TR', flag: '🇹🇷', label: 'Türkçe' },
    { code: 'HI', flag: '🇮🇳', label: 'हिन्दी' },
    { code: 'SV', flag: '🇸🇪', label: 'Svenska' },
    { code: 'DA', flag: '🇩🇰', label: 'Dansk' },
    { code: 'CS', flag: '🇨🇿', label: 'Čeština' }
];

/** @type {Record<string, { code: string, flag: string, label: string }>} */
export const CURRICULUM_LOCALE_BY_CODE = Object.fromEntries(
    CURRICULUM_LOCALE_PRESETS.map((p) => [p.code, p])
);

export function isCurriculumPresetCode(code) {
    return Object.prototype.hasOwnProperty.call(CURRICULUM_LOCALE_BY_CODE, String(code));
}

/** Label for `<select>` options: flag + code (and name if space). */
export function curriculumLangOptionText(code) {
    const p = CURRICULUM_LOCALE_BY_CODE[String(code)];
    if (p) return `${p.flag} ${p.code}`;
    return String(code);
}
