import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { copyTextToClipboard } from '../../../shared/lib/copy-text.js';
import { buildActiveTreeShareLink } from '../../sources/api/share-tree-link.js';
import { buildPublicShareAppUrl } from '../../../shared/lib/public-app-url.js';

function fillTemplate(template, vars) {
    return String(template || '').replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

async function deliverCertificateShare({ text, url, title }) {
    const ui = store.ui;
    const link = String(url || '').trim();

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
            await navigator.share({
                title: String(title || 'Arborito').trim(),
                text: String(text || '').trim(),
                url: link || undefined,
            });
            return;
        } catch (e) {
            if (e && e.name === 'AbortError') return;
        }
    }

    const payload = link ? `${text}\n${link}` : String(text || '');
    if (await copyTextToClipboard(payload)) {
        store.notify(ui.certShareCopied || ui.sourcesShareCopied || 'Share link copied to clipboard.');
        return;
    }

    store.notify(payload);
}

/** Share an earned certificate (Web Share API or clipboard). */
export async function shareCertificate({ moduleName, studentName } = {}) {
    const ui = store.ui;
    const module = String(moduleName || '').trim() || ui.certStudentFallback || 'Module';
    const student = String(studentName || '').trim() || ui.certStudentFallback || 'Student';
    const treeLink = buildActiveTreeShareLink() || buildPublicShareAppUrl('');
    const text = fillTemplate(ui.certShareText || '{student} completed {module} on Arborito!', {
        student,
        module,
        name: module,
    });
    const title = fillTemplate(ui.certShareTitle || '{module}', { student, module, name: module });
    await deliverCertificateShare({ text, url: treeLink, title });
}
