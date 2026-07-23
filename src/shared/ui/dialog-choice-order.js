/** Primary accept ids render on the right in consolidated binary footers. */
const CHOICE_PRIMARY_IDS = new Set(['save', 'confirm', 'accept', 'ok', 'yes', 'continue', 'proceed']);

/** Dismiss / neutral ids render on the left; cancel is not shown when these exist. */
const CHOICE_DISMISS_IDS = new Set(['discard', 'dismiss', 'skip', 'decline', 'no', 'dontsave', 'dont_save']);

function choiceSortRank(id) {
    const key = String(id || '').toLowerCase();
    if (CHOICE_DISMISS_IDS.has(key)) return 0;
    if (CHOICE_PRIMARY_IDS.has(key)) return 2;
    return 1;
}

/** Binary choice dialogs: neutral left, accept right. */
export function sortConsolidatedDialogChoices(choices) {
    if (!Array.isArray(choices) || choices.length !== 2) return choices;
    return [...choices].sort((a, b) => choiceSortRank(a.id) - choiceSortRank(b.id));
}

export function dialogChoiceHasDismissOption(choices) {
    if (!Array.isArray(choices)) return false;
    return choices.some((c) => CHOICE_DISMISS_IDS.has(String(c?.id || '').toLowerCase()));
}

export function dialogChoiceButtonTone(id, confirmTone) {
    const key = String(id || '').toLowerCase();
    if (key === 'save' || CHOICE_PRIMARY_IDS.has(key)) return 'emerald';
    if (key === 'discard' || CHOICE_DISMISS_IDS.has(key)) return 'slate';
    return confirmTone;
}
