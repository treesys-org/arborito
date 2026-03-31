


import { store } from "../store.js";
import { parseArboritoFile, markdownToVisualHTML } from "../utils/editor-engine.js";

export class PdfGenerator {
    /**
     * Generates a print-ready window for PDF export.
     * @param {Array} nodes - List of nodes to include.
     * @param {Function} onProgress - Callback(percent: number)
     */
    async generate(nodes, onProgress) {
        if (!nodes || nodes.length === 0) return;

        // Get Metadata for Footer
        const source = store.value.activeSource;
        const repoName = source.name;
        const repoUrl = source.url;
        const dateStr = new Date().toLocaleDateString();
        const ui = store.ui;
        
        // LIABILITY DISCLAIMER TEXT (Localized)
        const disclaimerTitle = ui.pdfDisclaimerTitle;
        const disclaimerText = ui.pdfDisclaimerText.replace('{url}', repoUrl);
        const footerText = ui.pdfFooter.replace('{name}', repoName);
        
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
            const bodyHtml = markdownToVisualHTML(parsed.body);
            
            // Add page break only between lessons
            const breakClass = i > 0 ? 'page-break-before' : '';
            
            contentHtml += `
            <article class="lesson-page ${breakClass}">
                <header class="lesson-header">
                    <h1>${n.name}</h1>
                    ${n.path ? `<p class="meta">${n.path}</p>` : ''}
                </header>
                <div class="content">
                    ${bodyHtml}
                </div>
            </article>
            `;
        }

        // Generate Cover Page
        const mainTitle = nodes.length > 1 ? (nodes[0].path ? nodes[0].path.split('/')[nodes[0].path.split('/').length - 2] : 'Module Export') : nodes[0].name;
        
        const coverHtml = `
        <div class="cover-page">
            <div class="cover-content">
                <div class="logo">🌳 ARBORITO</div>
                <h1 class="cover-title">${mainTitle.trim()}</h1>
                <p class="cover-subtitle">${nodes.length} Lesson${nodes.length > 1 ? 's' : ''}</p>
                
                <div class="legal-box">
                    <p class="legal-title">${disclaimerTitle}</p>
                    <p class="legal-text">${disclaimerText}</p>
                </div>

                <div class="cover-footer">
                    <p>Generated on ${dateStr}</p>
                    <p class="small">${repoName}</p>
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

                <script>
                    window.onload = function() { 
                        // Small delay to ensure images render
                        setTimeout(() => {
                            window.print(); 
                        }, 500);
                    }
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    }

    _getStyles() {
        return `
            :root {
                --primary: #333;
                --accent: #555;
            }

            @page {
                size: A4;
                margin: 2.5cm;
                @bottom-center {
                    content: "Page " counter(page);
                    font-family: system-ui, -apple-system, sans-serif;
                    font-size: 9pt;
                    color: #888;
                }
            }

            body { 
                font-family: Georgia, 'Times New Roman', serif; 
                color: #222; 
                line-height: 1.6; 
                font-size: 11pt;
                max-width: 100%;
                margin: 0;
                padding: 0;
                -webkit-print-color-adjust: exact;
            }

            /* --- Typography --- */
            h1, h2, h3, h4 { font-family: system-ui, -apple-system, sans-serif; color: #111; font-weight: 800; }
            
            h1 { font-size: 24pt; border-bottom: 2px solid #eee; padding-bottom: 15px; margin-bottom: 25px; margin-top: 0; }
            h2 { font-size: 16pt; margin-top: 30px; margin-bottom: 15px; color: #333; }
            h3 { font-size: 13pt; margin-top: 20px; color: #555; }
            
            p { margin-bottom: 15px; text-align: justify; }
            
            a { color: #000; text-decoration: underline; }
            
            img { max-width: 100%; height: auto; border-radius: 4px; margin: 20px 0; max-height: 500px; object-fit: contain; }
            
            blockquote { 
                border-left: 3px solid #ccc; 
                padding-left: 15px; 
                font-style: italic; 
                color: #555; 
                margin: 20px 0; 
                background: #f9f9f9;
                padding: 10px 15px;
            }
            
            code { 
                background: #f0f0f0; 
                padding: 2px 5px; 
                border-radius: 3px; 
                font-family: 'Courier New', monospace; 
                font-size: 0.9em;
            }
            pre { 
                background: #f5f5f5; 
                padding: 15px; 
                border-radius: 5px; 
                overflow-x: auto; 
                border: 1px solid #eee;
                font-size: 0.85em;
            }

            /* --- Structural --- */
            .lesson-page { margin-bottom: 50px; }
            .lesson-header { margin-bottom: 30px; }
            .meta { font-size: 9pt; color: #777; text-transform: uppercase; font-family: system-ui, -apple-system, sans-serif; letter-spacing: 1px; margin-top: -20px; }
            
            .page-break-before { page-break-before: always; }
            .page-break-after { page-break-after: always; }

            /* --- Cover Page --- */
            .cover-page {
                height: 90vh; /* Approximate A4 height minus margins */
                display: flex;
                flex-direction: column;
                justify-content: center;
                text-align: center;
                border: 10px double #eee;
                padding: 40px;
                box-sizing: border-box;
                position: relative;
            }
            .cover-content { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; width: 100%; }
            .logo { font-family: system-ui, -apple-system, sans-serif; font-weight: 900; font-size: 20pt; color: #444; margin-bottom: 40px; }
            .cover-title { font-size: 36pt; border: none; margin: 20px 0; line-height: 1.2; }
            .cover-subtitle { font-size: 14pt; color: #666; font-style: italic; margin-bottom: 40px; }
            
            /* --- Legal Disclaimer Box --- */
            .legal-box {
                margin-top: auto;
                margin-bottom: 40px;
                border: 1px solid #ccc;
                background-color: #f9f9f9;
                padding: 15px;
                width: 90%;
                font-family: system-ui, -apple-system, sans-serif;
                text-align: left;
            }
            .legal-title {
                font-weight: 800;
                font-size: 8pt;
                color: #333;
                text-transform: uppercase;
                margin-bottom: 5px;
            }
            .legal-text {
                font-size: 8pt;
                color: #555;
                margin: 0;
                line-height: 1.4;
                text-align: left;
            }

            .cover-footer { margin-top: 20px; font-family: system-ui, -apple-system, sans-serif; color: #888; font-size: 10pt; }
            .small { font-size: 9pt; opacity: 0.7; }

            /* --- Footer (Fixed) --- */
            .print-footer {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                border-top: 1px solid #ddd;
                padding-top: 10px;
                background: white;
                text-align: center;
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 8pt;
                color: #666;
            }
            .print-footer a { color: #666; text-decoration: none; font-weight: bold; }

            /* --- Hiding Elements --- */
            /* Crucial: Hide all quizzes, videos, and interactive elements */
            .arborito-quiz-edit, 
            .quiz-container,
            iframe, 
            .arborito-video-edit,
            .edit-block-wrapper[data-type="video"] { 
                display: none !important; 
            }
            
            /* Hide print UI if any slipped in */
            @media print {
                .no-print { display: none !important; }
                .arborito-quiz-edit { display: none !important; }
            }
        `;
    }
}

export const pdfGenerator = new PdfGenerator();