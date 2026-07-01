


import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { parseArboritoFile } from "../../editor/api/editor-engine.js";
import { parseContent } from "../../learning/api/parser.js";
import { renderPrintBlocks } from "./export/print-blocks.js";
import { sanitizeLocaleRichHtml } from "../../../shared/lib/locale-rich-html.js";
import { escAttr as escHtml } from "../../../shared/lib/html-escape.js";
import { injectEmojiImagesInText, ensureEmojiBundleReady } from "../../../shared/lib/emoji-display.js";
import { curriculumTreeDisplayName } from "../../version-updates/api/version-switch-logic.js";
import { parseNostrTreeUrl } from "../../nostr/api/nostr-refs.js";
import { resolveOpenTreeOwnerDisplay, storedTreeAuthorName } from "../../tree-graph/api/tree-owner-display.js";

/** Human-readable tree/author/source labels for PDF (never raw branch:// URLs). */
function resolvePdfSourceMeta(ui) {
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
    const authorDisplay = escHtml(authorName || unknownAuthor);

    let sourceLabel;
    if (isLocal) {
        sourceLabel = escHtml(String(ui.pdfSourceLocal || 'Local'));
    } else if (isGlobal) {
        sourceLabel = escHtml(String(ui.pdfSourceGlobal || 'Red pública'));
    } else if (/^https?:\/\//i.test(url)) {
        sourceLabel = escHtml(String(ui.pdfSourceExternal || 'Repositorio externo'));
    } else {
        sourceLabel = escHtml(String(ui.pdfSourceUnknown || 'Fuente externa'));
    }

    const treeDisplay = escHtml(treeName);
    const footerPlain = authorName && isGlobal
        ? `${treeName} · ${authorName}`
        : treeName;

    return {
        treeName: treeDisplay,
        author: authorDisplay,
        source: sourceLabel,
        footerName: escHtml(footerPlain),
        coverMeta: `${treeDisplay}<br><span class="cover-meta-sub">${authorDisplay} · ${sourceLabel}</span>`
    };
}

class PdfGenerator {
    /**
     * Generates a print-ready window for PDF export.
     * @param {Array} nodes - List of nodes to include.
     * @param {Function} onProgress - Callback(percent: number)
     */
    async generate(nodes, onProgress) {
        if (!nodes || nodes.length === 0) return;

        await ensureEmojiBundleReady();

        const ui = store.ui;
        const meta = resolvePdfSourceMeta(ui);
        const dateStr = new Date().toLocaleDateString();
        const generatedOn = String(ui.pdfGeneratedOn || 'Generated on {date}')
            .replace('{date}', escHtml(dateStr));

        // LIABILITY DISCLAIMER TEXT (Localized; may include <strong>, <br>, …)
        const disclaimerTitle = injectEmojiImagesInText(sanitizeLocaleRichHtml(ui.pdfDisclaimerTitle));
        const disclaimerText = injectEmojiImagesInText(
            sanitizeLocaleRichHtml(
                String(ui.pdfDisclaimerText || '')
                    .replaceAll('{treeName}', meta.treeName)
                    .replaceAll('{author}', meta.author)
                    .replaceAll('{source}', meta.source)
            )
        );
        const footerText = injectEmojiImagesInText(
            sanitizeLocaleRichHtml(String(ui.pdfFooter || '').replaceAll('{name}', meta.footerName))
        );
        
        // Generate Content HTML with Progress
        let contentHtml = '';
        
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            
            // Calculate and report progress
            const percent = Math.round(((i + 1) / nodes.length) * 100);
            if (onProgress) onProgress(percent);
            
            // Yield to main thread to allow UI update
            await new Promise(resolve => setTimeout(resolve, 10));

            const parsed = parseArboritoFile(n.content || '');
            const bodyBlocks = parseContent(parsed.body);
            const bodyHtml = renderPrintBlocks(bodyBlocks, ui);
            const proseChars = bodyBlocks
                .filter((b) => b.type === 'p' || b.type === 'list')
                .reduce((n, b) => n + String(b.text || b.items?.join?.('') || '').length, 0);

            const breakClass = i > 0 && proseChars > 160 ? 'page-break-before' : '';
            
            contentHtml += `
            <article class="lesson-page ${breakClass}">
                <header class="lesson-header">
                    <h1>${escHtml(n.name)}</h1>
                    ${n.path ? `<p class="meta">${escHtml(n.path)}</p>` : ''}
                </header>
                <div class="content">
                    ${bodyHtml}
                </div>
            </article>
            `;
        }

        // Generate Cover Page
        const mainTitleRaw = nodes.length > 1
            ? (nodes[0].path ? nodes[0].path.split('/')[nodes[0].path.split('/').length - 2] : 'Module Export')
            : nodes[0].name;
        const mainTitle = escHtml(String(mainTitleRaw != null ? mainTitleRaw : '').trim());
        
        const coverHtml = `
        <div class="cover-page">
            <div class="cover-content">
                <div class="logo">${injectEmojiImagesInText('🌳')} ARBORITO</div>
                <h1 class="cover-title">${mainTitle}</h1>
                <p class="cover-subtitle">${nodes.length} Lesson${nodes.length > 1 ? 's' : ''}</p>
                <p class="cover-tree-meta">${meta.coverMeta}</p>
                
                <div class="legal-box">
                    <p class="legal-title">${disclaimerTitle}</p>
                    <p class="legal-text">${disclaimerText}</p>
                </div>

                <div class="cover-footer">
                    <p>${generatedOn}</p>
                    <p class="small">${meta.footerName}</p>
                </div>
            </div>
        </div>
        <div class="page-break-after"></div>
        `;

        const styles = this._getStyles();
        
        this._openPrintWindow(mainTitle, styles, coverHtml, contentHtml, footerText);
    }

    _openPrintWindow(title, styles, coverHtml, contentHtml, footerText) {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            store.alert(store.ui.pdfPopupBlocked || 'Pop-up blocked. Allow pop-ups for PDF generation.');
            return;
        }

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${title}</title>
                <style>${styles}</style>
            </head>
            <body>
                ${coverHtml}
                
                <main>
                    ${contentHtml}
                </main>

                <div class="print-footer">
                    <p>${footerText}</p>
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
        // Trigger printing from the opener context (avoids inline scripts in the print document).
        try {
            printWindow.addEventListener('load', () => {
                setTimeout(() => {
                    try { printWindow.print(); } catch (_) {}
                }, 500);
            }, { once: true });
        } catch (_) {}
    }

    _getStyles() {
        return `
            :root {
                --print-ink: #1a1a1a;
                --print-muted: #5c5c5c;
                --print-accent: #047857;
                --print-rule: #d4d4d8;
            }

            @page {
                size: A4;
                margin: 2.2cm 2.4cm 2.6cm;
            }

            * { box-sizing: border-box; }

            body {
                font-family: "Georgia", "Times New Roman", serif;
                color: var(--print-ink);
                line-height: 1.65;
                font-size: 11pt;
                max-width: 100%;
                margin: 0;
                padding: 0;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }

            h1, h2, h3, h4, h5, h6 {
                font-family: system-ui, sans-serif;
                color: #111;
                font-weight: 800;
                line-height: 1.25;
                page-break-after: avoid;
            }

            h1 { font-size: 22pt; border-bottom: 2px solid var(--print-rule); padding-bottom: 12px; margin: 0 0 20px; }
            h2, .print-section { font-size: 15pt; margin: 28px 0 12px; color: #222; }
            h3, .print-subsection { font-size: 12.5pt; margin: 22px 0 10px; color: #333; }
            h4 { font-size: 11.5pt; margin: 18px 0 8px; }
            h5, h6 { font-size: 10.5pt; margin: 14px 0 6px; color: #444; }

            p { margin: 0 0 12px; orphans: 2; widows: 2; }
            p:last-child { margin-bottom: 0; }

            .print-flow {
                page-break-inside: avoid;
                break-inside: avoid-page;
                margin-bottom: 10px;
            }

            h2, h3, h4, h5, h6, .print-section, .print-subsection {
                page-break-after: avoid;
                break-after: avoid-page;
            }

            .lesson-header {
                page-break-after: avoid;
                break-after: avoid-page;
            }

            ul { margin: 0 0 14px 1.2em; padding: 0; }
            li { margin-bottom: 6px; }

            a { color: var(--print-accent); text-decoration: underline; }

            img { max-width: 100%; height: auto; border-radius: 6px; margin: 16px 0; max-height: 420px; object-fit: contain; }
            .arborito-emoji-img {
                display: inline-block;
                vertical-align: -0.15em;
                width: 1.15em;
                height: 1.15em;
                object-fit: contain;
                margin: 0;
                border-radius: 0;
                max-height: none;
            }

            figure { margin: 18px 0; page-break-inside: avoid; }
            figcaption { font-size: 9pt; color: var(--print-muted); text-align: center; margin-top: 6px; font-style: italic; }

            blockquote {
                border-left: 3px solid var(--print-accent);
                padding: 10px 14px;
                margin: 16px 0;
                background: #f4faf7;
                color: #333;
                font-style: italic;
            }

            code {
                background: #f3f4f6;
                padding: 1px 4px;
                border-radius: 3px;
                font-family: ui-monospace, monospace;
                font-size: 0.92em;
            }
            pre {
                background: #f8fafc;
                padding: 14px;
                border-radius: 6px;
                overflow-x: auto;
                border: 1px solid var(--print-rule);
                font-size: 0.88em;
                line-height: 1.5;
                page-break-inside: avoid;
            }
            pre code { background: none; padding: 0; }

            .print-skipped {
                font-size: 9.5pt;
                color: var(--print-muted);
                border: 1px dashed var(--print-rule);
                padding: 8px 10px;
                border-radius: 6px;
                background: #fafafa;
            }

            .lesson-page { margin-bottom: 36px; }
            .lesson-header { margin-bottom: 22px; page-break-after: avoid; }
            .meta {
                font-size: 8.5pt;
                color: var(--print-muted);
                text-transform: uppercase;
                font-family: system-ui, sans-serif;
                letter-spacing: 0.06em;
                margin: -8px 0 0;
            }

            .page-break-before { page-break-before: always; }
            .page-break-after { page-break-after: always; }

            .cover-page {
                min-height: 72vh;
                display: flex;
                flex-direction: column;
                justify-content: center;
                text-align: center;
                border: 2px solid var(--print-rule);
                border-radius: 8px;
                padding: 48px 40px;
                position: relative;
                page-break-after: always;
            }
            .cover-content {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                width: 100%;
            }
            .logo {
                font-family: system-ui, sans-serif;
                font-weight: 900;
                font-size: 14pt;
                letter-spacing: 0.12em;
                color: var(--print-accent);
                margin-bottom: 32px;
            }
            .cover-title {
                font-size: 30pt;
                border: none;
                margin: 12px 0;
                line-height: 1.15;
                max-width: 92%;
            }
            .cover-subtitle { font-size: 12pt; color: var(--print-muted); font-style: italic; margin-bottom: 10px; }
            .cover-tree-meta {
                font-size: 10.5pt;
                color: #333;
                margin: 0 0 24px;
                font-weight: 600;
                max-width: 90%;
                line-height: 1.45;
            }
            .cover-meta-sub { font-size: 9.5pt; font-weight: 500; color: var(--print-muted); }

            .legal-box {
                margin-top: auto;
                margin-bottom: 28px;
                border: 1px solid var(--print-rule);
                background: #fafafa;
                padding: 14px 16px;
                width: 92%;
                font-family: system-ui, sans-serif;
                text-align: left;
                border-radius: 6px;
            }
            .legal-title {
                font-weight: 800;
                font-size: 8pt;
                color: #333;
                text-transform: uppercase;
                margin: 0 0 6px;
                letter-spacing: 0.04em;
            }
            .legal-text { font-size: 8.5pt; color: #333; margin: 0; line-height: 1.55; }
            .legal-text strong { color: #111; }

            .cover-footer { margin-top: 16px; font-family: system-ui, sans-serif; color: var(--print-muted); font-size: 9pt; }
            .small { font-size: 8.5pt; opacity: 0.85; }

            .print-footer {
                margin-top: 32px;
                padding-top: 12px;
                border-top: 1px solid var(--print-rule);
                text-align: center;
                font-family: system-ui, sans-serif;
                font-size: 8pt;
                color: var(--print-muted);
            }

            .arborito-quiz-edit, iframe, .arborito-video-edit, .arborito-game-edit { display: none !important; }
        `;
    }
}

export const pdfGenerator = new PdfGenerator();