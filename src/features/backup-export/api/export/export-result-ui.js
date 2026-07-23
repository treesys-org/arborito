import { getArboritoStore as store } from '../../../../core/store-singleton.js';

/** Show a localized toast after a successful export save. */
export function notifyExportSaved(result, ui = store.ui || {}) {
    if (!result?.ok) return;
    if (result.path) {
        store.notify(
            String(ui.exportSavedTo || ui.certDownloaded || 'Saved to {path}').replace('{path}', result.path)
        );
        return;
    }
    store.notify(ui.exportDownloaded || ui.sourcesShareCopied || 'File downloaded.');
}

/** Show a localized alert when export save fails. */
export function alertExportFailed(result, ui = store.ui || {}, fallbackKey = 'exportPdfError') {
    if (result?.canceled) return;
    const template = ui[fallbackKey] || ui.certPrintError || 'Could not save file: {message}';
    store.alert(
        String(template).replace('{message}', result?.error || ui.exportFailed || 'Save failed')
    );
}
