import { parseArboritoFile } from '../../../editor/api/editor-engine.js';
import { parseContent } from '../../../learning/api/parser.js';
import { htmlToPlainText } from './html-to-plain-text.js';
import { loadJsPdf } from './load-pdf-lib.js';

const PAGE_W = 297;
const PAGE_H = 210;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_Y = PAGE_H - 10;

function stripHtml(html) {
    return htmlToPlainText(html).replace(/\n+/g, ' ').trim();
}

function plainBlockText(block, skippedLabel) {
    switch (block?.type) {
        case 'h1':
        case 'section':
        case 'h2':
        case 'subsection':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
        case 'p':
        case 'blockquote':
            return htmlToPlainText(block.text || '');
        case 'list':
            return (block.items || [])
                .map((item) => `• ${htmlToPlainText(item)}`)
                .filter((line) => line !== '•')
                .join('\n');
        case 'code':
            return String(block.text || '').trim();
        case 'image':
            return String(block.caption || '').trim() || `[${skippedLabel}]`;
        case 'quiz':
        case 'game':
        case 'video':
        case 'audio':
            return skippedLabel;
        default:
            return '';
    }
}

function blockStyle(block) {
    const t = block?.type;
    if (t === 'h1' || t === 'section') return 'section';
    if (t === 'h2' || t === 'subsection' || t === 'h3') return 'subsection';
    if (t === 'code') return 'code';
    if (t === 'blockquote') return 'quote';
    return 'body';
}

function ensureSpace(doc, state, needed = 12) {
    if (state.y + needed <= FOOTER_Y - 4) return;
    doc.addPage();
    state.y = MARGIN;
}

function drawLines(doc, state, lines, { fontSize = 11, fontStyle = 'normal', color = [17, 17, 17], lineHeight = 5.5 } = {}) {
    doc.setFont('helvetica', fontStyle);
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
    for (const line of lines) {
        ensureSpace(doc, state, lineHeight + 2);
        doc.text(line, MARGIN, state.y);
        state.y += lineHeight;
    }
}

function drawCover(doc, { title, lessonCount, treeMeta, disclaimerTitle, disclaimerText, generatedOn, footerName }) {
    const cx = PAGE_W / 2;
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F');

    doc.setDrawColor(212, 212, 216);
    doc.setLineWidth(0.8);
    doc.roundedRect(MARGIN, MARGIN, CONTENT_W, PAGE_H - MARGIN * 2, 4, 4);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(4, 120, 87);
    doc.text('ARBORITO', cx, MARGIN + 18, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(17, 17, 17);
    doc.text(doc.splitTextToSize(title, CONTENT_W - 20), cx, MARGIN + 36, { align: 'center' });

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(12);
    doc.setTextColor(92, 92, 92);
    doc.text(`${lessonCount} lesson${lessonCount === 1 ? '' : 's'}`, cx, MARGIN + 52, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(51, 51, 51);
    doc.text(doc.splitTextToSize(stripHtml(treeMeta), CONTENT_W - 30), cx, MARGIN + 62, { align: 'center' });

    const boxY = MARGIN + 78;
    doc.setDrawColor(212, 212, 216);
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(MARGIN + 10, boxY, CONTENT_W - 20, 58, 3, 3, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 51, 51);
    doc.text(stripHtml(disclaimerTitle).toUpperCase(), MARGIN + 16, boxY + 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(34, 34, 34);
    doc.text(doc.splitTextToSize(stripHtml(disclaimerText), CONTENT_W - 36), MARGIN + 16, boxY + 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(92, 92, 92);
    doc.text(stripHtml(generatedOn), cx, PAGE_H - MARGIN - 14, { align: 'center' });
    doc.text(stripHtml(footerName), cx, PAGE_H - MARGIN - 8, { align: 'center' });
}

function drawLesson(doc, state, { lessonTitle, path, blocks, skippedLabel }) {
    ensureSpace(doc, state, 24);
    doc.setDrawColor(4, 120, 87);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, state.y, PAGE_W - MARGIN, state.y);
    state.y += 8;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(17, 17, 17);
    doc.text(doc.splitTextToSize(lessonTitle, CONTENT_W), MARGIN, state.y);
    state.y += 10;

    if (path) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(110, 110, 110);
        doc.text(String(path).toUpperCase(), MARGIN, state.y);
        state.y += 8;
    }

    for (const block of blocks || []) {
        const text = plainBlockText(block, skippedLabel);
        if (!text) continue;
        const style = blockStyle(block);

        if (style === 'section') {
            state.y += 4;
            drawLines(doc, state, doc.splitTextToSize(text, CONTENT_W), {
                fontSize: 14,
                fontStyle: 'bold',
                color: [34, 34, 34],
                lineHeight: 6,
            });
            continue;
        }
        if (style === 'subsection') {
            state.y += 2;
            drawLines(doc, state, doc.splitTextToSize(text, CONTENT_W), {
                fontSize: 12,
                fontStyle: 'bold',
                color: [51, 51, 51],
                lineHeight: 5.5,
            });
            continue;
        }
        if (style === 'code') {
            ensureSpace(doc, state, 16);
            doc.setFillColor(248, 250, 252);
            const lines = doc.splitTextToSize(text, CONTENT_W - 8);
            const h = lines.length * 4.8 + 6;
            doc.roundedRect(MARGIN, state.y - 4, CONTENT_W, h, 2, 2, 'F');
            drawLines(doc, state, lines, {
                fontSize: 9,
                fontStyle: 'normal',
                color: [30, 30, 30],
                lineHeight: 4.8,
            });
            state.y += 4;
            continue;
        }
        if (style === 'quote') {
            drawLines(doc, state, doc.splitTextToSize(text, CONTENT_W - 8), {
                fontSize: 10,
                fontStyle: 'italic',
                color: [55, 65, 81],
                lineHeight: 5,
            });
            continue;
        }

        const chunks = text.includes('\n') ? text.split('\n') : doc.splitTextToSize(text, CONTENT_W);
        drawLines(doc, state, chunks, { fontSize: 11, color: [17, 17, 17], lineHeight: 5.2 });
        state.y += 2;
    }

    state.y += 6;
}

/**
 * Build a landscape lesson/module PDF with jsPDF (no html2canvas).
 * @returns {Promise<Blob>}
 */
export async function generateLessonPdfBlob({
    nodes = [],
    ui = {},
    mainTitle = 'Export',
    treeMetaHtml = '',
    disclaimerTitleHtml = '',
    disclaimerTextHtml = '',
    generatedOnHtml = '',
    footerNameHtml = '',
}) {
    const jsPDF = await loadJsPdf();
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const skipped = String(ui.pdfSkippedBlock || '[Interactive content omitted from print]');

    drawCover(doc, {
        title: String(mainTitle || 'Export'),
        lessonCount: nodes.length,
        treeMeta: treeMetaHtml,
        disclaimerTitle: disclaimerTitleHtml,
        disclaimerText: disclaimerTextHtml,
        generatedOn: generatedOnHtml,
        footerName: footerNameHtml,
    });

    const state = { y: MARGIN };
    for (const node of nodes) {
        doc.addPage();
        state.y = MARGIN;

        const parsed = parseArboritoFile(node.content || '');
        const blocks = parseContent(parsed.body);
        drawLesson(doc, state, {
            lessonTitle: String(node.name || 'Lesson'),
            path: node.path ? String(node.path) : '',
            blocks,
            skippedLabel: skipped,
        });
    }

    const blob = doc.output('blob');
    if (!(blob instanceof Blob) || blob.size < 800) throw new Error('pdf_empty');
    return blob;
}
