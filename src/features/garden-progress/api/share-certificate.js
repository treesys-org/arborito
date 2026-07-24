import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { copyTextToClipboard } from '../../../shared/lib/copy-text.js';
import { buildActiveTreeShareLink } from '../../sources/api/share-tree-link.js';
import { buildPublicShareAppUrl } from '../../../shared/lib/public-app-url.js';
import { resolveCertificateDisplayNode } from './certificate-entries.js';

function fillTemplate(template, vars) {
    return String(template || '').replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

/**
 * Public URL that loads the active course (when shareable) and opens this certificate.
 * @param {{ moduleId?: string, studentName?: string }} [opts]
 * @returns {string|null}
 */
export function buildCertificateShareLink(opts = {}) {
    const moduleId = String(opts.moduleId || '').trim();
    if (!moduleId) return null;

    const treeLink = buildActiveTreeShareLink();
    const base = treeLink || buildPublicShareAppUrl('');
    let url;
    try {
        url = new URL(base);
    } catch {
        return null;
    }
    url.searchParams.set('cert', moduleId);
    const student = String(opts.studentName || '').trim();
    if (student) url.searchParams.set('certStudent', student);
    return url.toString();
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
export async function shareCertificate({ moduleId, moduleName, studentName } = {}) {
    const ui = store.ui;
    const module = String(moduleName || '').trim() || ui.certStudentFallback || 'Module';
    const student = String(studentName || '').trim() || ui.certStudentFallback || 'Student';
    const link = buildCertificateShareLink({ moduleId, studentName: student });
    const text = fillTemplate(ui.certShareText || '{student} completed {module} on Arborito!', {
        student,
        module,
        name: module,
    });
    const title = fillTemplate(ui.certShareTitle || '{module}', { student, module, name: module });
    await deliverCertificateShare({ text, url: link, title });
}

function stripCertificateShareParams() {
    if (typeof window === 'undefined') return;
    try {
        const url = new URL(window.location.href);
        if (!url.searchParams.has('cert') && !url.searchParams.has('certStudent')) return;
        url.searchParams.delete('cert');
        url.searchParams.delete('certStudent');
        const qs = url.searchParams.toString();
        const next = `${url.pathname}${qs ? `?${qs}` : ''}${url.hash || ''}`;
        window.history.replaceState({}, '', next);
    } catch {
        /* ignore */
    }
}

/**
 * After a curriculum mounts: if `?cert=` is present, open that certificate view once.
 * @param {import('../../../core/store-singleton.js').ArboritoStore} arboritoStore
 * @returns {boolean}
 */
export function consumeCertificateShareParam(arboritoStore) {
    if (typeof window === 'undefined') return false;
    const s = arboritoStore || store;
    let moduleId = '';
    let sharedStudent = '';
    try {
        const params = new URLSearchParams(window.location.search);
        moduleId = String(params.get('cert') || '').trim();
        sharedStudent = String(params.get('certStudent') || '').trim();
    } catch {
        return false;
    }
    if (!moduleId) return false;

    const findNode = typeof s.findNode === 'function' ? (id) => s.findNode(id) : null;
    const node = resolveCertificateDisplayNode(s, moduleId, findNode);
    stripCertificateShareParams();
    if (!node) return false;

    try {
        s.setModal({
            type: 'certificate',
            moduleId: String(node.id || moduleId),
            ...(sharedStudent ? { sharedStudentName: sharedStudent } : {}),
        });
        return true;
    } catch {
        return false;
    }
}
