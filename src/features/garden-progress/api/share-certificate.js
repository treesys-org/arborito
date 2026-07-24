import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { copyTextToClipboard } from '../../../shared/lib/copy-text.js';
import { buildActiveTreeShareLink } from '../../sources/api/share-tree-link.js';
import { buildPublicShareAppUrl } from '../../../shared/lib/public-app-url.js';
import { resolveCertificateDisplayNode } from './certificate-entries.js';
import { isOnboardingWizardIncomplete } from '../../../shared/lib/onboarding-boot-gate.js';

const CERT_PARAM_KEYS = [
    'cert',
    'certStudent',
    'certModule',
    'certIcon',
    'certTree',
    'certAuthor',
    'certDate',
    'certVer',
    'certTreeCert',
];

let certificateShareConsumed = false;

function fillTemplate(template, vars) {
    return String(template || '').replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

function clipParam(value, max = 120) {
    const s = String(value || '').trim();
    if (!s) return '';
    return s.length > max ? s.slice(0, max) : s;
}

/**
 * @returns {{
 *   moduleId: string,
 *   student: string,
 *   moduleName: string,
 *   icon: string,
 *   treeName: string,
 *   author: string,
 *   dateText: string,
 *   versionId: string,
 *   isTreeCertificate: boolean,
 * }|null}
 */
export function readCertificateShareParams() {
    if (typeof window === 'undefined') return null;
    try {
        const params = new URLSearchParams(window.location.search);
        const moduleId = clipParam(params.get('cert'), 160);
        const moduleName = clipParam(params.get('certModule'), 160);
        const student = clipParam(params.get('certStudent'), 80);
        if (!moduleId && !moduleName) return null;
        return {
            moduleId,
            student,
            moduleName,
            icon: clipParam(params.get('certIcon'), 16) || '🎓',
            treeName: clipParam(params.get('certTree'), 120),
            author: clipParam(params.get('certAuthor'), 80),
            dateText: clipParam(params.get('certDate'), 48),
            versionId: clipParam(params.get('certVer'), 24),
            isTreeCertificate: params.get('certTreeCert') === '1',
        };
    } catch {
        return null;
    }
}

/**
 * Public URL that shows this diploma to anyone (self-contained snapshot).
 * Prefers a course share link when the active tree is public; otherwise arborito.org.
 * @param {{
 *   moduleId?: string,
 *   moduleName?: string,
 *   studentName?: string,
 *   icon?: string,
 *   treeName?: string,
 *   author?: string,
 *   dateText?: string,
 *   versionId?: string,
 *   isTreeCertificate?: boolean,
 * }} [opts]
 * @returns {string|null}
 */
export function buildCertificateShareLink(opts = {}) {
    const moduleId = clipParam(opts.moduleId, 160);
    const moduleName = clipParam(opts.moduleName, 160);
    if (!moduleId && !moduleName) return null;

    const treeLink = buildActiveTreeShareLink();
    const base = treeLink || buildPublicShareAppUrl('');
    let url;
    try {
        url = new URL(base);
    } catch {
        return null;
    }
    if (moduleId) url.searchParams.set('cert', moduleId);
    const student = clipParam(opts.studentName, 80);
    if (student) url.searchParams.set('certStudent', student);
    if (moduleName) url.searchParams.set('certModule', moduleName);
    const icon = clipParam(opts.icon, 16);
    if (icon) url.searchParams.set('certIcon', icon);
    const treeName = clipParam(opts.treeName, 120);
    if (treeName) url.searchParams.set('certTree', treeName);
    const author = clipParam(opts.author, 80);
    if (author) url.searchParams.set('certAuthor', author);
    const dateText = clipParam(opts.dateText, 48);
    if (dateText) url.searchParams.set('certDate', dateText);
    const versionId = clipParam(opts.versionId, 24);
    if (versionId) url.searchParams.set('certVer', versionId);
    if (opts.isTreeCertificate) url.searchParams.set('certTreeCert', '1');
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
export async function shareCertificate({
    moduleId,
    moduleName,
    studentName,
    icon,
    treeName,
    author,
    dateText,
    versionId,
    isTreeCertificate,
} = {}) {
    const ui = store.ui;
    const module = String(moduleName || '').trim() || ui.certStudentFallback || 'Module';
    const student = String(studentName || '').trim() || ui.certStudentFallback || 'Student';
    const link = buildCertificateShareLink({
        moduleId,
        moduleName: module,
        studentName: student,
        icon,
        treeName,
        author,
        dateText,
        versionId,
        isTreeCertificate,
    });
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
        let touched = false;
        for (const key of CERT_PARAM_KEYS) {
            if (url.searchParams.has(key)) {
                url.searchParams.delete(key);
                touched = true;
            }
        }
        if (!touched) return;
        const qs = url.searchParams.toString();
        const next = `${url.pathname}${qs ? `?${qs}` : ''}${url.hash || ''}`;
        window.history.replaceState({}, '', next);
    } catch {
        /* ignore */
    }
}

/**
 * After boot / curriculum mount: open diploma from `?cert=` (+ snapshot fields).
 * Works for visitors without the course — snapshot params render the diploma.
 * @param {import('../../../core/store-singleton.js').ArboritoStore} arboritoStore
 * @returns {boolean}
 */
export function consumeCertificateShareParam(arboritoStore) {
    if (certificateShareConsumed) return false;
    if (typeof window === 'undefined') return false;
    const s = arboritoStore || store;
    const snap = readCertificateShareParams();
    if (!snap) return false;

    const findNode = typeof s.findNode === 'function' ? (id) => s.findNode(id) : null;
    const node = snap.moduleId ? resolveCertificateDisplayNode(s, snap.moduleId, findNode) : null;
    /* Need either a live node or a self-contained module name for strangers. */
    if (!node && !snap.moduleName) return false;

    try {
        s.setModal({
            type: 'certificate',
            fromShare: true,
            moduleId: String(node?.id || snap.moduleId || 'shared-cert'),
            sharedStudentName: snap.student || undefined,
            sharedCert: {
                moduleName: String(node?.name || snap.moduleName || '').trim(),
                icon: String(node?.icon || snap.icon || '🎓').trim() || '🎓',
                treeName: snap.treeName,
                author: snap.author,
                dateText: snap.dateText,
                versionId: snap.versionId,
                isTreeCertificate: !!(node?.isTreeCertificate || snap.isTreeCertificate),
            },
        });
        certificateShareConsumed = true;
        stripCertificateShareParams();
        return true;
    } catch {
        return false;
    }
}

/** Close shared diploma and restore onboarding when the visitor has not finished it. */
export function dismissSharedCertificate(arboritoStore) {
    const s = arboritoStore || store;
    try {
        s.dismissModal?.();
    } catch {
        /* ignore */
    }
    if (!isOnboardingWizardIncomplete()) return;
    try {
        s.setModal?.({ type: 'onboarding' });
    } catch {
        /* ignore */
    }
}
