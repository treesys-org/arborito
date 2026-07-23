/**
 * Lesson editor table block: HTML template helpers + row/col controls.
 */

import { escHtml, escAttr } from '../../../../shared/lib/html-escape.js';
import { chromeEmojiHtml } from '../../../../shared/lib/emoji-display.js';
import {
    defaultEmptyTable,
    normalizeTableData,
    serializeGfmTable,
} from '../../../learning/api/lesson-table.js';

const TABLE_ICON_MINUS =
    '<svg class="arborito-table-edit__icon" viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3.5 7.25h9a.75.75 0 0 1 0 1.5h-9a.75.75 0 0 1 0-1.5z"/></svg>';
const TABLE_ICON_PLUS =
    '<svg class="arborito-table-edit__icon" viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 3.25a.75.75 0 0 1 .75.75v3.25H12a.75.75 0 0 1 0 1.5H8.75V12a.75.75 0 0 1-1.5 0V8.75H4a.75.75 0 0 1 0-1.5h3.25V4A.75.75 0 0 1 8 3.25z"/></svg>';

/**
 * @param {string} label
 * @param {{ addAction: string, delAction: string, addTitle: string, delTitle: string }} opts
 */
function tableDimControlsHtml(label, { addAction, delAction, addTitle, delTitle }) {
    return `
        <div class="arborito-table-edit__group" role="group" aria-label="${escAttr(label)}">
            <span class="arborito-table-edit__group-label">${escHtml(label)}</span>
            <div class="arborito-table-edit__segment">
                <button type="button" class="arborito-table-edit__btn arborito-table-edit__btn--del" data-table-action="${escAttr(delAction)}" title="${escAttr(delTitle)}" aria-label="${escAttr(delTitle)}">${TABLE_ICON_MINUS}</button>
                <button type="button" class="arborito-table-edit__btn arborito-table-edit__btn--add" data-table-action="${escAttr(addAction)}" title="${escAttr(addTitle)}" aria-label="${escAttr(addTitle)}">${TABLE_ICON_PLUS}</button>
            </div>
        </div>`;
}

/**
 * @param {{ headers: string[], rows: string[][] }} table
 * @param {(cell: string) => string} [renderCellHtml] — already-safe HTML for cells
 */
export function tableInnerHtml(table, renderCellHtml) {
    const { headers, rows } = normalizeTableData(table, { minCols: 1, minBodyRows: 0 });
    const cellHtml = typeof renderCellHtml === 'function' ? renderCellHtml : (c) => escHtml(c);
    const head = headers
        .map(
            (h) =>
                `<th class="arborito-table-edit__cell" contenteditable="true" spellcheck="true">${cellHtml(h)}</th>`
        )
        .join('');
    const body = rows
        .map((row) => {
            const cells = row
                .map(
                    (c) =>
                        `<td class="arborito-table-edit__cell" contenteditable="true" spellcheck="true">${cellHtml(c)}</td>`
                )
                .join('');
            return `<tr>${cells}</tr>`;
        })
        .join('');
    return `<div class="arborito-table-edit__scroll"><table class="arborito-table-edit__table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/**
 * @param {object} ui
 * @param {{ headers?: string[], rows?: string[][], htmlCells?: boolean }} [data]
 * @param {(cell: string) => string} [renderCellHtml]
 */
export function buildTableBlockHtml(ui, data = {}, renderCellHtml) {
    const headerLabel = (i) => {
        const base = ui.editorBlockTableColumn || 'Column {n}';
        return String(base).replace('{n}', String(i + 1));
    };
    const table =
        data.headers || data.rows
            ? normalizeTableData(
                  { headers: data.headers || [], rows: data.rows || [] },
                  { minCols: 1, minBodyRows: 0 }
              )
            : defaultEmptyTable({ headerLabel });
    const removeTitle = escAttr(ui.delete || ui.editorBlockRemove || 'Remove');
    const badge = escHtml(ui.editorBlockTable || 'Table');
    const rowLabel = ui.editorBlockTableRowLabel || 'Row';
    const colLabel = ui.editorBlockTableColLabel || 'Column';
    const addRow = ui.editorBlockTableAddRow || 'Add row';
    const addCol = ui.editorBlockTableAddCol || 'Add column';
    const delRow = ui.editorBlockTableDelRow || 'Remove row';
    const delCol = ui.editorBlockTableDelCol || 'Remove column';
    const hint = escHtml(
        ui.editorBlockTableHint ||
            'Saved in the .md as a pipe table (| col |). Easy to edit by hand.'
    );
    const render =
        data.htmlCells && typeof renderCellHtml === 'function'
            ? renderCellHtml
            : (c) => escHtml(c);
    const removeIcon = chromeEmojiHtml('🗑️', 14);
    return `
        <div class="edit-block-wrapper arborito-table-edit my-6 p-3 sm:p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl relative group flex flex-col gap-2 max-w-full" data-arborito-table="1" contenteditable="false">
            <div class="remove-btn absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center cursor-pointer shadow opacity-100 transition-opacity z-10" data-editor-action="remove-block" role="button" tabindex="-1" title="${removeTitle}" aria-label="${removeTitle}">${removeIcon}</div>
            <div class="flex items-center justify-between gap-2 flex-wrap">
                <span class="text-slate-500 dark:text-slate-400 font-black text-[10px] uppercase tracking-wider">${badge}</span>
                <div class="arborito-table-edit__actions">
                    ${tableDimControlsHtml(rowLabel, {
                        addAction: 'add-row',
                        delAction: 'del-row',
                        addTitle: addRow,
                        delTitle: delRow,
                    })}
                    ${tableDimControlsHtml(colLabel, {
                        addAction: 'add-col',
                        delAction: 'del-col',
                        addTitle: addCol,
                        delTitle: delCol,
                    })}
                </div>
            </div>
            ${tableInnerHtml(table, render)}
            <p class="arborito-table-edit__hint m-0 text-[10px] leading-snug text-slate-500 dark:text-slate-400">${hint}</p>
        </div>
        <p><br></p>`;
}

/**
 * @param {HTMLElement} block
 * @param {(el: Element) => string} inlineHtmlToMarkdown
 */
export function readTableBlockData(block, inlineHtmlToMarkdown) {
    const table = block.querySelector('table.arborito-table-edit__table');
    if (!table) return { headers: [''], rows: [['']] };
    const cellText = (el) => {
        if (typeof inlineHtmlToMarkdown === 'function') {
            return String(inlineHtmlToMarkdown(el) || '').trim();
        }
        return String(el.textContent || '').trim();
    };
    const headers = Array.from(table.querySelectorAll('thead th')).map(cellText);
    const rows = Array.from(table.querySelectorAll('tbody tr')).map((tr) =>
        Array.from(tr.querySelectorAll('td')).map(cellText)
    );
    return normalizeTableData({ headers, rows }, { minCols: 1, minBodyRows: 0 });
}

/**
 * @param {HTMLElement} block
 * @param {(el: Element) => string} inlineHtmlToMarkdown
 */
export function serializeTableBlockMarkdown(block, inlineHtmlToMarkdown) {
    return serializeGfmTable(readTableBlockData(block, inlineHtmlToMarkdown));
}

function rebuildTableBody(block, data) {
    const scroll = block.querySelector('.arborito-table-edit__scroll');
    if (!scroll) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = tableInnerHtml(data);
    const next = tmp.firstElementChild;
    if (next) scroll.replaceWith(next);
}

/**
 * @param {HTMLElement} block
 * @param {string} action
 */
export function applyTableBlockAction(block, action) {
    if (!(block instanceof HTMLElement) || !block.classList.contains('arborito-table-edit')) return;
    const data = readTableBlockData(block, (el) => String(el.textContent || ''));
    let { headers, rows, colCount } = data;

    if (action === 'add-row') {
        rows = [...rows, Array.from({ length: colCount }, () => '')];
    } else if (action === 'del-row') {
        if (rows.length <= 1) return;
        rows = rows.slice(0, -1);
    } else if (action === 'add-col') {
        headers = [...headers, ''];
        rows = rows.map((r) => [...r, '']);
        colCount += 1;
    } else if (action === 'del-col') {
        if (colCount <= 1) return;
        headers = headers.slice(0, -1);
        rows = rows.map((r) => r.slice(0, -1));
        colCount -= 1;
    } else {
        return;
    }

    rebuildTableBody(block, { headers, rows });
    block.dispatchEvent(new Event('input', { bubbles: true }));
}

export function bindTableBlockControls(block) {
    if (!(block instanceof HTMLElement) || !block.classList.contains('arborito-table-edit')) return;
    if (block.dataset.tableControlsBound === '1') return;
    block.dataset.tableControlsBound = '1';
    block.addEventListener('click', (ev) => {
        const btn = ev.target instanceof Element ? ev.target.closest('[data-table-action]') : null;
        if (!btn || !block.contains(btn)) return;
        ev.preventDefault();
        ev.stopPropagation();
        applyTableBlockAction(block, btn.getAttribute('data-table-action') || '');
    });
}
