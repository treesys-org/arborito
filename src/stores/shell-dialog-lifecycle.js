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

function dialogUi(store) {
    return store.ui || store.state?.i18nData || {};
}

function resolveDialogButtonLabels(
    store,
    { confirmText, cancelText, selectAllText, selectNoneText, danger = false } = {}
) {
    const ui = dialogUi(store);
    return {
        cancelText: cancelText ?? ui.cancel ?? 'Cancel',
        confirmText:
            confirmText ??
            (danger ? ui.delete || ui.dialogConfirmButton : null) ??
            ui.dialogConfirmButton ??
            ui.dialogOkButton ??
            'OK',
        selectAllText: selectAllText ?? ui.exportSnapshotsSelectAll ?? 'All',
        selectNoneText: selectNoneText ?? ui.exportSnapshotsSelectNone ?? 'None',
    };
}

function modalIsDialog(modal) {
    if (!modal) return false;
    if (modal === 'dialog') return true;
    return typeof modal === 'object' && modal.type === 'dialog';
}

/**
 * Swallow the synthetic *click* that would land on UI under a just-closed overlay
 * (lesson Back, dialog OK, More, Courses). Do NOT intercept touchend/pointerup:
 * preventDefault on those in capture phase leaves mobile WebKit’s trunk scroller
 * needing a second finger-drag (or a full reload) before pan-y works again.
 *
 * Also swallow compatibility mousedown/mouseup (fired after touchend) so chrome
 * under the finger does not flash `:active` scale (“hundimiento”) even when the
 * click handler itself is blocked.
 */
let _postCloseGuardUntil = 0;
let _postCloseGuardOn = false;
let _postCloseGuardTimer = 0;

const POST_CLOSE_GUARD_EVENTS = ['click', 'mousedown', 'mouseup'];
const POST_CLOSE_GUARD_CLASS = 'arborito-post-close-guard';

function postClosePointerGuard(e) {
    if (Date.now() >= _postCloseGuardUntil) {
        teardownPostClosePointerGuard();
        return;
    }
    if (!POST_CLOSE_GUARD_EVENTS.includes(e.type)) return;
    try {
        e.preventDefault();
    } catch {
        /* noop */
    }
    try {
        e.stopPropagation();
    } catch {
        /* noop */
    }
    if (typeof e.stopImmediatePropagation === 'function') {
        try {
            e.stopImmediatePropagation();
        } catch {
            /* noop */
        }
    }
}

function teardownPostClosePointerGuard() {
    if (_postCloseGuardTimer) {
        clearTimeout(_postCloseGuardTimer);
        _postCloseGuardTimer = 0;
    }
    if (!_postCloseGuardOn) return;
    _postCloseGuardOn = false;
    for (const type of POST_CLOSE_GUARD_EVENTS) {
        document.removeEventListener(type, postClosePointerGuard, true);
    }
    try {
        document.documentElement.classList.remove(POST_CLOSE_GUARD_CLASS);
    } catch {
        /* noop */
    }
}

/** Swallow ghost clicks / press under a just-closed overlay (lesson / dialog / sheets). */
export function armPostClosePointerGuard(ms = 400) {
    if (typeof document === 'undefined') return;
    const dur = Math.max(0, Number(ms) || 0);
    _postCloseGuardUntil = Date.now() + dur;
    if (_postCloseGuardTimer) clearTimeout(_postCloseGuardTimer);
    _postCloseGuardTimer = setTimeout(() => {
        _postCloseGuardTimer = 0;
        teardownPostClosePointerGuard();
    }, dur + 32);
    try {
        document.documentElement.classList.add(POST_CLOSE_GUARD_CLASS);
    } catch {
        /* noop */
    }
    if (_postCloseGuardOn) return;
    _postCloseGuardOn = true;
    for (const type of POST_CLOSE_GUARD_EVENTS) {
        document.addEventListener(type, postClosePointerGuard, true);
    }
}

/** @param {import('./shell-store.js').ShellStore} store */
export function showDialog(
    store,
    {
        type = 'alert',
        title = '',
        body = '',
        bodyHtml = false,
        placeholder = '',
        confirmText,
        cancelText,
        danger = false,
        choices = undefined,
        exportSnapshots = undefined,
        selectAllText,
        selectNoneText,
        switchLabel = undefined,
        switchHint = undefined,
        switchDefault = undefined,
        dialogIcon = undefined,
        dialogSpotlight = undefined,
        hideCancel = false,
    } = {}
) {
    /* Never stack confirms: double-tap / duplicate handlers used to open a second dialog
     * on top of the first (dismiss one → the other reappears). */
    if (store._dialogResolver) {
        return Promise.resolve(null);
    }
    if (modalIsDialog(store.state?.modal)) {
        /* Orphan dialog modal (resolver already cleared) — drop it, then open fresh. */
        const previousModal = store._dialogParentStack.pop();
        store.setModal(previousModal !== undefined ? previousModal : null);
    }

    const labels = resolveDialogButtonLabels(store, {
        confirmText,
        cancelText,
        selectAllText,
        selectNoneText,
        danger,
    });
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
            confirmText: labels.confirmText,
            cancelText: labels.cancelText,
            danger,
            choices,
            exportSnapshots,
            selectAllText: labels.selectAllText,
            selectNoneText: labels.selectNoneText,
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
    if (store._dialogSettling) return;

    const hasResolver = !!store._dialogResolver;
    const hasStack = store._dialogParentStack.length > 0;
    if (!hasResolver && !hasStack) {
        if (modalIsDialog(store.state?.modal)) {
            store.setModal(null);
        }
        return;
    }

    store._dialogSettling = true;
    try {
        if (store._dialogResolver) {
            store._dialogResolver(result);
            store._dialogResolver = null;
        }
        const previousModal = store._dialogParentStack.pop();
        store.setModal(previousModal !== undefined ? previousModal : null);
        armPostClosePointerGuard();
    } finally {
        queueMicrotask(() => {
            store._dialogSettling = false;
        });
    }
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
    const ui = dialogUi(store);
    return showDialog(store, {
        type: 'alert',
        title: t,
        body,
        bodyHtml: extra.bodyHtml,
        confirmText: extra.confirmText ?? ui.dialogOkButton,
        dialogIcon: extra.dialogIcon,
        dialogSpotlight: extra.dialogSpotlight,
    });
}

/** @param {import('./shell-store.js').ShellStore} store */
export async function confirm(store, body, title, danger = false, confirmText) {
    const t =
        title !== undefined && title !== null
            ? title
            : store.state.i18nData?.dialogConfirmTitle != null
              ? store.state.i18nData.dialogConfirmTitle
              : 'Confirm';
    return showDialog(store, { type: 'confirm', title: t, body, danger, confirmText });
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
            : dialogUi(store).dialogConfirmButton ?? dialogUi(store).dialogOkButton;
    return showDialog(store, {
        type: 'prompt',
        title: t,
        body,
        placeholder,
        confirmText: ok,
        hideCancel: true,
    });
}
