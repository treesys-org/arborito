/**
 * Global dialog queue, pushes previous `modal` on a stack and restores on close.
 * Used by ShellStore.prototype and shell-ui-store-actions (via store.showDialog).
 *
 * API surface (prefer these over raw `showDialog` when possible):
 * - `alert(body, title?, opts?)`, single OK notice
 * - `acknowledge({ title, body, dialogIcon?, dialogSpotlight?, … })`, single OK with hero + optional mobile spotlight
 * - `confirm(body, title?, danger?)`, binary choice (Cancel + OK; danger keeps Cancel on mobile)
 * - `showDialog({…})`, choice, prompt, exportSnapshots, or custom bodyHtml confirms
 */

/** @param {import('./shell-store.js').ShellStore} store */
export function showDialog(
    store,
    {
        type = 'alert',
        title = '',
        body = '',
        bodyHtml = false,
        placeholder = '',
        confirmText = 'OK',
        cancelText = 'Cancel',
        danger = false,
        choices = undefined,
        exportSnapshots = undefined,
        selectAllText = undefined,
        selectNoneText = undefined,
        switchLabel = undefined,
        switchHint = undefined,
        switchDefault = undefined,
        dialogIcon = undefined,
        dialogSpotlight = undefined,
        hideCancel = false,
    } = {}
) {
    return new Promise((resolve) => {
        store._dialogResolver = resolve;
        store._dialogParentStack.push(store.state.modal);
        store.setModal({
            type: 'dialog',
            dialogType: type,
            title,
            body,
            bodyHtml,
            placeholder,
            confirmText,
            cancelText,
            danger,
            choices,
            exportSnapshots,
            selectAllText,
            selectNoneText,
            switchLabel,
            switchHint,
            switchDefault,
            dialogIcon,
            dialogSpotlight,
            hideCancel: hideCancel || type === 'prompt',
        });
    });
}

/**
 * Pick list for multi-select (tap rows, no native checkboxes).
 * Close with X / backdrop / “Back” → `null`. Confirm → `string[]` of checked ids (may be `[]`).
 * @param {import('./shell-store.js').ShellStore} store
 */
export function showExportSnapshotsPickDialog(
    store,
    {
        title = '',
        body = '',
        snapshots = [],
        confirmText = 'Export',
        selectAllText = 'All',
        selectNoneText = 'None',
    } = {}
) {
    return showDialog(store, {
        type: 'exportSnapshots',
        title,
        body,
        confirmText,
        exportSnapshots: snapshots,
        selectAllText,
        selectNoneText,
        danger: false,
        hideCancel: true,
    });
}

/** @param {import('./shell-store.js').ShellStore} store */
export function closeDialog(store, result) {
    if (store._dialogResolver) {
        store._dialogResolver(result);
        store._dialogResolver = null;
    }
    const previousModal = store._dialogParentStack.pop();
    store.setModal(previousModal !== undefined ? previousModal : null);
}

/** @param {import('./shell-store.js').ShellStore} store */
export async function alert(store, body, title, opts = {}) {
    const t =
        title !== undefined && title !== null
            ? title
            : store.state.i18nData?.dialogNoticeTitle != null
              ? store.state.i18nData.dialogNoticeTitle
              : 'Notice';
    const extra = opts && typeof opts === 'object' ? opts : {};
    return showDialog(store, {
        type: 'alert',
        title: t,
        body,
        bodyHtml: extra.bodyHtml,
        confirmText: extra.confirmText,
        dialogIcon: extra.dialogIcon,
        dialogSpotlight: extra.dialogSpotlight,
    });
}

/** @param {import('./shell-store.js').ShellStore} store */
export async function confirm(store, body, title, danger = false) {
    const t =
        title !== undefined && title !== null
            ? title
            : store.state.i18nData?.dialogConfirmTitle != null
              ? store.state.i18nData.dialogConfirmTitle
              : 'Confirm';
    return showDialog(store, { type: 'confirm', title: t, body, danger });
}

/**
 * Informational confirm: one primary action (OK / Done). No Cancel button.
 * @param {import('./shell-store.js').ShellStore} store
 */
export async function acknowledge(
    store,
    {
        title = '',
        body = '',
        bodyHtml = false,
        confirmText,
        dialogIcon,
        dialogSpotlight,
        switchLabel,
        switchDefault = true,
    } = {}
) {
    const ui = store.ui;
    return showDialog(store, {
        type: 'confirm',
        title,
        body,
        bodyHtml,
        confirmText: confirmText ?? ui.dialogOkButton ?? 'OK',
        hideCancel: true,
        dialogIcon,
        dialogSpotlight,
        switchLabel,
        switchDefault,
    });
}

/** @param {import('./shell-store.js').ShellStore} store */
export async function prompt(store, body, placeholder = '', title, confirmText) {
    const t =
        title !== undefined && title !== null
            ? title
            : store.state.i18nData?.dialogInputTitle != null
              ? store.state.i18nData.dialogInputTitle
              : 'Input';
    const ok =
        confirmText !== undefined && confirmText !== null
            ? confirmText
            : store.state.i18nData?.dialogConfirmTitle != null
              ? store.state.i18nData.dialogConfirmTitle
              : 'OK';
    return showDialog(store, {
        type: 'prompt',
        title: t,
        body,
        placeholder,
        confirmText: ok,
        hideCancel: true,
    });
}
