/** Preset scrim/card chrome for {@link NestedSheetShell} in-hub overlays. */
export const NESTED_SHEET_CHROME = {
    /** Centered binary confirm (Biblioteca delete, snapshot delete, …). */
    confirm: {
        scrimClassName:
            'arborito-nested-confirm-scrim absolute inset-0 flex items-center justify-center pointer-events-auto p-4 sm:p-6',
        cardClassName:
            'arborito-nested-confirm-card arborito-surface-panel arborito-surface-panel-border border rounded-2xl shadow-lg',
        cardExtraClass:
            'flex flex-col items-center gap-5 w-full max-w-[min(100%,24rem)] px-7 py-8 sm:px-9 sm:py-9',
    },
    /** Form sheet (forum new topic, default CSS scrim/card tokens). */
    form: {
        scrimClassName: 'forum-nt-scrim',
        cardClassName: 'forum-nt-card',
        cardExtraClass: '',
    },
};

/**
 * @param {'confirm'|'form'|undefined} variant
 * @param {{ scrimClassName?: string, cardClassName?: string, cardExtraClass?: string }} overrides
 */
export function resolveNestedSheetChrome(variant, overrides = {}) {
    const preset = variant ? NESTED_SHEET_CHROME[variant] : null;
    return {
        scrimClassName: overrides.scrimClassName ?? preset?.scrimClassName ?? NESTED_SHEET_CHROME.form.scrimClassName,
        cardClassName: overrides.cardClassName ?? preset?.cardClassName ?? NESTED_SHEET_CHROME.form.cardClassName,
        cardExtraClass: overrides.cardExtraClass ?? preset?.cardExtraClass ?? NESTED_SHEET_CHROME.form.cardExtraClass,
    };
}
