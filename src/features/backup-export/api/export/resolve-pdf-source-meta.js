import { escAttr as escHtml } from '../../../../shared/lib/html-escape.js';
import { curriculumTreeDisplayName } from '../../../version-updates/api/version-switch-logic.js';
import { parseNostrTreeUrl } from '../../../nostr/api/nostr-refs.js';
import { resolveOpenTreeOwnerDisplay, storedTreeAuthorName } from '../../../tree-graph/api/tree-owner-display.js';
import { buildActiveTreeShareLink } from '../../../sources/api/share-tree-link.js';

/** Human-readable tree/author/source labels for PDF exports. */
export function resolvePdfSourceMeta(store, ui) {
    const source = store.value.activeSource || {};
    const treeName = curriculumTreeDisplayName(ui);
    const url = String(source.url || '').trim();
    const isLocal = url.startsWith('branch://');
    const treeRef = parseNostrTreeUrl(url);
    const isGlobal = !!treeRef;

    let authorName = '';
    if (treeRef) {
        authorName = resolveOpenTreeOwnerDisplay(store, treeRef.pub).label?.trim() || '';
    } else if (isLocal) {
        authorName = resolveOpenTreeOwnerDisplay(store, '').label?.trim() || '';
    } else {
        authorName = storedTreeAuthorName(store) || '';
    }

    const unknownAuthor = String(ui.pdfAuthorUnknown || 'Autor desconocido').trim();
    const authorDisplay = authorName || unknownAuthor;

    let sourceLabel;
    if (isLocal) {
        sourceLabel = String(ui.pdfSourceLocal || 'Fuente local');
    } else if (isGlobal) {
        sourceLabel = String(ui.pdfSourceGlobal || 'Red pública');
    } else if (/^https?:\/\//i.test(url)) {
        sourceLabel = String(ui.pdfSourceExternal || 'Repositorio externo');
    } else {
        sourceLabel = String(ui.pdfSourceUnknown || 'Fuente externa');
    }

    const treeDisplay = escHtml(treeName);
    const authorEsc = escHtml(authorDisplay);
    const sourceEsc = escHtml(sourceLabel);
    const footerPlain = authorName && isGlobal ? `${treeName} · ${authorName}` : treeName;
    const shareLink = buildActiveTreeShareLink();

    return {
        treeName: treeDisplay,
        author: authorEsc,
        source: sourceEsc,
        footerName: escHtml(footerPlain),
        coverMeta: `${treeDisplay}<br><span class="cover-meta-sub">${authorEsc} · ${sourceEsc}</span>`,
        treeNamePlain: treeName,
        authorPlain: authorDisplay,
        sourcePlain: sourceLabel,
        isLocal,
        shareLink,
    };
}
