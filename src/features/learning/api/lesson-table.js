/**
 * GFM pipe tables for lesson markdown (editor + reading parser).
 *
 * Hand-editable format (columns padded when saved from the app):
 *
 *   | Concepto   | Ejemplo   |
 *   | ---------- | --------- |
 *   | Saludo     | Hello     |
 *   | Despedida  | Goodbye   |
 *
 * Rules authors can rely on:
 * - First row = headers, second row = dashes (`---`), then data rows.
 * - Cells separated by `|`; spaces around cells are optional but clearer.
 * - A literal `|` inside a cell is written as `\|`.
 * - Blank line ends the table.
 */

/** @param {string} line */
export function splitGfmTableRow(line) {
    let s = String(line || '').trim();
    if (!s) return [];
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);

    /** @type {string[]} */
    const cells = [];
    let cur = '';
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch === '\\' && s[i + 1] === '|') {
            cur += '|';
            i += 1;
            continue;
        }
        if (ch === '|') {
            cells.push(cur.trim());
            cur = '';
            continue;
        }
        cur += ch;
    }
    cells.push(cur.trim());
    return cells;
}

/** @param {string} cell */
export function escapeTableCell(cell) {
    return String(cell ?? '')
        .replace(/\r?\n/g, ' ')
        .replace(/\|/g, '\\|')
        .trim();
}

/** @param {string} line */
export function isGfmTableSeparatorLine(line) {
    const cells = splitGfmTableRow(line);
    if (!cells.length) return false;
    return cells.every((c) => /^:?-{3,}:?$/.test(String(c).trim()));
}

/** @param {string} line */
export function looksLikeGfmTableRow(line) {
    const s = String(line || '').trim();
    if (!s.includes('|')) return false;
    if (isGfmTableSeparatorLine(s)) return false;
    return splitGfmTableRow(s).length >= 1;
}

/**
 * @param {string[]} lines
 * @param {number} startIndex
 * @returns {{ headers: string[], rows: string[][], nextIndex: number } | null}
 */
export function tryParseGfmTable(lines, startIndex) {
    const i = startIndex;
    if (i < 0 || i >= lines.length) return null;
    const headerLine = String(lines[i] || '').trim();
    if (!looksLikeGfmTableRow(headerLine)) return null;
    const sepLine = String(lines[i + 1] || '').trim();
    if (!isGfmTableSeparatorLine(sepLine)) return null;

    const headers = splitGfmTableRow(headerLine);
    if (!headers.length) return null;
    const colCount = Math.max(headers.length, splitGfmTableRow(sepLine).length);

    /** @type {string[][]} */
    const rows = [];
    let j = i + 2;
    while (j < lines.length) {
        const raw = String(lines[j] || '').trim();
        if (!raw) break;
        if (!looksLikeGfmTableRow(raw)) break;
        rows.push(padRow(splitGfmTableRow(raw), colCount));
        j++;
    }

    return {
        headers: padRow(headers, colCount),
        rows,
        nextIndex: j - 1,
    };
}

/**
 * @param {string[]} row
 * @param {number} cols
 */
function padRow(row, cols) {
    const out = Array.isArray(row) ? row.slice(0, cols) : [];
    while (out.length < cols) out.push('');
    return out;
}

/**
 * @param {{ headers?: string[], rows?: string[][] }} table
 * @param {{ minCols?: number, minBodyRows?: number }} [opts]
 */
export function normalizeTableData(table, opts = {}) {
    const minCols = Math.max(1, opts.minCols ?? 2);
    const minBodyRows = Math.max(0, opts.minBodyRows ?? 1);
    let headers = Array.isArray(table?.headers) ? table.headers.map((c) => String(c ?? '')) : [];
    let rows = Array.isArray(table?.rows)
        ? table.rows.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '')) : []))
        : [];
    const colCount = Math.max(
        minCols,
        headers.length,
        ...rows.map((r) => r.length),
        1
    );
    headers = padRow(headers, colCount);
    rows = rows.map((r) => padRow(r, colCount));
    while (rows.length < minBodyRows) rows.push(padRow([], colCount));
    return { headers, rows, colCount };
}

/**
 * Column widths so the saved `.md` reads as a grid in any text editor.
 * @param {string[]} headers
 * @param {string[][]} rows
 * @param {number} colCount
 */
function columnWidths(headers, rows, colCount) {
    /** @type {number[]} */
    const widths = [];
    for (let i = 0; i < colCount; i++) {
        let w = 3; /* enough for `---` */
        const h = headers[i] || '';
        if (h.length > w) w = h.length;
        for (const row of rows) {
            const cell = row[i] || '';
            if (cell.length > w) w = cell.length;
        }
        widths.push(w);
    }
    return widths;
}

/**
 * @param {string} text
 * @param {number} width
 */
function padCellText(text, width) {
    const t = text || '';
    if (t.length >= width) return t;
    return t + ' '.repeat(width - t.length);
}

/**
 * Serialize as an aligned pipe table (easy to read/edit by hand in `.md`).
 * @param {{ headers: string[], rows: string[][] }} table
 */
export function serializeGfmTable(table) {
    const { headers, rows, colCount } = normalizeTableData(table, { minCols: 1, minBodyRows: 0 });
    const escHeaders = headers.map(escapeTableCell);
    const escRows = rows.map((r) => r.map(escapeTableCell));
    const widths = columnWidths(escHeaders, escRows, colCount);

    const formatRow = (cells) =>
        `| ${cells.map((c, i) => padCellText(c, widths[i])).join(' | ')} |`;
    const sep = `| ${widths.map((w) => '-'.repeat(w)).join(' | ')} |`;

    return [formatRow(escHeaders), sep, ...escRows.map(formatRow)].join('\n');
}

/**
 * Empty starter table for insert menu (3 columns × 2 body rows).
 * @param {{ headerLabel?: (i: number) => string }} [opts]
 */
export function defaultEmptyTable(opts = {}) {
    const label = opts.headerLabel || ((i) => `Column ${i + 1}`);
    return {
        headers: [label(0), label(1), label(2)],
        rows: [
            ['', '', ''],
            ['', '', ''],
        ],
    };
}
