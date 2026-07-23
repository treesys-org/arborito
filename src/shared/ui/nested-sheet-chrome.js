/** Preset scrim/card chrome for {@link NestedSheetShell} in-hub overlays.
 * Layout/padding live in dialog-content.css (not Tailwind-in-JS).
 */
export const NESTED_SHEET_CHROME = {
    /** Centered binary confirm (Biblioteca delete, snapshot delete, …). */
    confirm: {
        scrimClassName: 'arborito-nested-confirm-scrim',
        cardClassName:
            'arborito-nested-confirm-card arborito-surface-panel arborito-surface-panel-border border rounded-2xl shadow-lg',
        cardExtraClass: 'w-full',
    },
    /** Compact form prompt (Export branch, forum new topic, arcade add game, …). */
    form: {
        scrimClassName: 'arborito-nested-confirm-scrim',
        cardClassName:
            'arborito-nested-confirm-card arborito-nested-form-card arborito-surface-panel arborito-surface-panel-border border rounded-2xl shadow-lg',
        cardExtraClass: 'w-full',
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
