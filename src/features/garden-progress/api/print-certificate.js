import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { sanitizeLocaleRichHtml } from '../../../shared/lib/locale-rich-html.js';
import { generateCertificatePdfBlob } from './certificate-pdf.js';
import { resolvePdfSourceMeta } from '../../backup-export/api/export/resolve-pdf-source-meta.js';
import { EXPORT_FILTERS, sanitizeExportFileName, saveExportFile } from '../../backup-export/api/export/save-export-file.js';
import { alertExportFailed, notifyExportSaved } from '../../backup-export/api/export/export-result-ui.js';

/** Download a certificate as PDF (jsPDF vector layout, no print / no html2canvas). */
export async function printCertificate(payload) {
    const ui = store.ui || {};
    const moduleName = String(payload.moduleName || 'diploma').trim() || 'diploma';
    const safeName = moduleName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60);
    const meta = resolvePdfSourceMeta(store, ui);

    const disclaimerText = sanitizeLocaleRichHtml(
        String(ui.pdfDisclaimerText || '')
            .replaceAll('{treeName}', meta.treeName)
            .replaceAll('{author}', meta.author)
            .replaceAll('{source}', meta.source)
    );

    const localHint = String(ui.sourcesShareLocalOnly || '').split('.')[0].trim();

    try {
        const pdfData = await generateCertificatePdfBlob({
            ...payload,
            disclaimerTitle: ui.pdfDisclaimerTitle,
            disclaimerText,
            treeName: meta.treeNamePlain,
            authorName: meta.authorPlain,
            sourceLabel: meta.sourcePlain,
            courseLink: meta.shareLink || '',
            localSourceNote: meta.isLocal && !meta.shareLink
                ? localHint || meta.sourcePlain
                : '',
            generatedByLabel: 'ARBORITO',
        });
        const result = await saveExportFile({
            data: pdfData,
            filename: sanitizeExportFileName(`${safeName || 'diploma'}.pdf`, 'diploma.pdf'),
            mimeType: 'application/pdf',
            filters: EXPORT_FILTERS.pdf,
        });

        if (result?.canceled) return { ok: false, canceled: true };
        if (result?.ok) {
            notifyExportSaved(result, ui);
            return result;
        }

        alertExportFailed(result, ui, 'certPrintError');
        return result;
    } catch (e) {
        const result = { ok: false, error: e?.message || String(e) };
        alertExportFailed(result, ui, 'certPrintError');
        return result;
    }
}
