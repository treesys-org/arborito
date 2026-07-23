import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { sanitizeLocaleRichHtml } from '../../../shared/lib/locale-rich-html.js';
import { escAttr as escHtml } from '../../../shared/lib/html-escape.js';
import { resolvePdfSourceMeta } from './export/resolve-pdf-source-meta.js';
import { generateLessonPdfBlob } from './export/lesson-pdf.js';
import { EXPORT_FILTERS, sanitizeExportFileName, saveExportFile } from './export/save-export-file.js';
import { alertExportFailed, notifyExportSaved } from './export/export-result-ui.js';

class PdfGenerator {
    /**
     * Export lessons/modules as a landscape PDF (jsPDF vector layout).
     * @param {Array} nodes - List of nodes to include.
     * @param {Function} onProgress - Callback(percent: number)
     */
    async generate(nodes, onProgress) {
        if (!nodes || nodes.length === 0) return;

        const ui = store.ui;
        const meta = resolvePdfSourceMeta(store, ui);
        const dateStr = new Date().toLocaleDateString();
        const generatedOn = String(ui.pdfGeneratedOn || 'Generated on {date}')
            .replace('{date}', escHtml(dateStr));

        const disclaimerTitle = sanitizeLocaleRichHtml(ui.pdfDisclaimerTitle);
        const disclaimerText = sanitizeLocaleRichHtml(
            String(ui.pdfDisclaimerText || '')
                .replaceAll('{treeName}', meta.treeName)
                .replaceAll('{author}', meta.author)
                .replaceAll('{source}', meta.source)
        );
        const footerText = sanitizeLocaleRichHtml(String(ui.pdfFooter || '').replaceAll('{name}', meta.footerName));

        for (let i = 0; i < nodes.length; i++) {
            const percent = Math.round(((i + 1) / nodes.length) * 100);
            if (onProgress) onProgress(percent);
            await new Promise((resolve) => setTimeout(resolve, 10));
        }

        const mainTitleRaw = nodes.length > 1
            ? (nodes[0].path ? nodes[0].path.split('/')[nodes[0].path.split('/').length - 2] : 'Module Export')
            : nodes[0].name;
        const mainTitle = String(mainTitleRaw != null ? mainTitleRaw : '').trim();

        const safeName = mainTitle
            .replace(/[^\w\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-')
            .slice(0, 60);

        try {
            const pdfData = await generateLessonPdfBlob({
                nodes,
                ui,
                mainTitle,
                treeMetaHtml: meta.coverMeta,
                disclaimerTitleHtml: disclaimerTitle,
                disclaimerTextHtml: disclaimerText,
                generatedOnHtml: generatedOn,
                footerNameHtml: footerText,
            });

            const result = await saveExportFile({
                data: pdfData,
                filename: sanitizeExportFileName(`${safeName || 'export'}.pdf`, 'export.pdf'),
                mimeType: 'application/pdf',
                filters: EXPORT_FILTERS.pdf,
            });

            if (result?.canceled) return;
            if (result?.ok) {
                notifyExportSaved(result, ui);
                return;
            }

            alertExportFailed(result, ui, 'exportPdfError');
        } catch (e) {
            alertExportFailed({ ok: false, error: e?.message || String(e) }, ui, 'exportPdfError');
        }
    }
}

export const pdfGenerator = new PdfGenerator();
