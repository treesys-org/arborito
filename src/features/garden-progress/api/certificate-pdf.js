import { loadJsPdf } from '../../backup-export/api/export/load-pdf-lib.js';
import { htmlToPlainText } from '../../backup-export/api/export/html-to-plain-text.js';

function cleanLine(value, fallback = '') {
    return String(value ?? fallback).replace(/\s+/g, ' ').trim() || fallback;
}

/**
 * Draw a certificate PDF directly with jsPDF (landscape A4).
 * @returns {Promise<Blob>}
 */
export async function generateCertificatePdfBlob({
    studentName,
    moduleName,
    isTreeCertificate = false,
    certTitle,
    certBody,
    certTreeBody,
    certDateLabel,
    certVersionLabel,
    certAuthorityLabel,
    authorityName,
    dateText,
    versionId,
    disclaimerTitle = '',
    disclaimerText = '',
    treeName = '',
    authorName = '',
    sourceLabel = '',
    courseLink = '',
    localSourceNote = '',
    generatedByLabel = 'ARBORITO',
} = {}) {
    const jsPDF = await loadJsPdf();
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    const pageW = 297;
    const pageH = 210;
    const margin = 14;
    const frameX = margin;
    const frameY = margin;
    const frameW = pageW - margin * 2;
    const frameH = pageH - margin * 2;
    const cx = pageW / 2;

    const title = cleanLine(certTitle, 'CERTIFICATE OF COMPLETION').toUpperCase();
    const body = cleanLine(
        isTreeCertificate
            ? certTreeBody || 'This certifies that the student has successfully completed:'
            : certBody || 'This certifies that the student has successfully completed the module:'
    );
    const student = cleanLine(studentName, 'Student');
    const module = cleanLine(moduleName, 'Module');
    const dateLbl = cleanLine(certDateLabel, 'Date').toUpperCase();
    const versionLbl = cleanLine(certVersionLabel, 'Version').toUpperCase();
    const authorityLbl = cleanLine(certAuthorityLabel, 'Issued by');
    const authority = cleanLine(authorityName, 'Treesys Certification');
    const dateVal = cleanLine(dateText, '');
    const versionVal = cleanLine(versionId, 'UNVERSIONED');
    const disclaimerTitlePlain = htmlToPlainText(disclaimerTitle).toUpperCase();
    const disclaimerBodyPlain = htmlToPlainText(disclaimerText);
    const treePlain = cleanLine(treeName);
    const authorPlain = cleanLine(authorName);
    const sourcePlain = cleanLine(sourceLabel);
    const linkPlain = cleanLine(courseLink);
    const localNotePlain = cleanLine(localSourceNote);
    const brand = cleanLine(generatedByLabel, 'ARBORITO').toUpperCase();

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageW, pageH, 'F');

    doc.setDrawColor(234, 179, 8);
    doc.setLineWidth(1.2);
    doc.roundedRect(frameX, frameY, frameW, frameH, 5, 5);

    doc.setFillColor(248, 250, 252);
    doc.roundedRect(frameX + 4, frameY + 4, frameW - 8, frameH - 8, 4, 4, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(4, 120, 87);
    doc.text(brand, cx, frameY + 14, { align: 'center' });

    doc.setFillColor(250, 204, 21);
    doc.roundedRect(cx - 18, frameY + 18, 36, 2, 1, 1, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(202, 138, 4);
    doc.text(title, cx, frameY + 28, { align: 'center' });

    const medallionChar = (module.replace(/[^A-Za-zÀ-ÿ0-9]/g, '').charAt(0) || 'A').toUpperCase();
    doc.setFillColor(250, 204, 21);
    doc.circle(cx, frameY + 44, 9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(120, 53, 15);
    doc.text(medallionChar, cx, frameY + 47, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(doc.splitTextToSize(body, frameW - 50), cx, frameY + 58, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42);
    doc.text(student, cx, frameY + 76, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(161, 98, 7);
    doc.text(doc.splitTextToSize(module, frameW - 40), cx, frameY + 88, { align: 'center' });

    let courseY = frameY + 98;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    if (treePlain) {
        doc.text(doc.splitTextToSize(`${treePlain} · ${authorPlain} · ${sourcePlain}`, frameW - 36), cx, courseY, {
            align: 'center',
        });
        courseY += 5;
    }
    if (linkPlain) {
        doc.setTextColor(4, 120, 87);
        doc.text(doc.splitTextToSize(linkPlain, frameW - 36), cx, courseY, { align: 'center' });
        courseY += 5;
    } else if (localNotePlain) {
        doc.setTextColor(100, 116, 139);
        doc.text(doc.splitTextToSize(localNotePlain, frameW - 36), cx, courseY, { align: 'center' });
        courseY += 5;
    }

    const disclaimerY = frameY + frameH - 44;
    doc.setDrawColor(212, 212, 216);
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(frameX + 10, disclaimerY, frameW - 20, 28, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(51, 51, 51);
    doc.text(disclaimerTitlePlain || 'DISCLAIMER', frameX + 14, disclaimerY + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(55, 65, 81);
    doc.text(doc.splitTextToSize(disclaimerBodyPlain, frameW - 32), frameX + 14, disclaimerY + 9);

    const metaY = disclaimerY - 12;
    const leftX = frameX + frameW * 0.28;
    const rightX = frameX + frameW * 0.72;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(dateLbl, leftX, metaY, { align: 'center' });
    doc.text(versionLbl, rightX, metaY, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text(dateVal, leftX, metaY + 5, { align: 'center' });
    doc.text(versionVal, rightX, metaY + 5, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    const authorityLine = `${authorityLbl}: ${authority}`;
    doc.text(doc.splitTextToSize(authorityLine, frameW - 30), cx, frameY + frameH - 8, { align: 'center' });

    const blob = doc.output('blob');
    if (!(blob instanceof Blob) || blob.size < 800) throw new Error('pdf_empty');
    return blob;
}
