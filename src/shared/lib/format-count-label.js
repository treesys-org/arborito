/**
 * Pick singular vs plural locale template for a numeric count.
 * @param {number} count
 * @param {string} oneTpl  e.g. "1 pregunta"
 * @param {string} manyTpl e.g. "{count} preguntas"
 */
export function formatCountLabel(count, oneTpl, manyTpl) {
    const n = Number(count) || 0;
    const tpl = n === 1 ? oneTpl : manyTpl;
    return String(tpl || '').replace('{count}', String(n));
}
