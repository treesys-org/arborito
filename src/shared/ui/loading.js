/**
 * loadingHtml — single source of truth for the "loading…" placeholder.
 *
 * Replaces the 30+ ad-hoc snippets scattered across modals and views that
 * combine `animate-spin` + ⏳ emoji + local text inconsistently. Use it
 * in any pending state (network fetch, torrent build, etc.).
 *
 * Variants:
 *   - `'inline'`   small chip in a row (default)
 *   - `'block'`    block centered vertically/horizontally (~96px tall)
 *   - `'fullbleed'` block that fills the container (`flex-1`)
 *
 * @param {object} opts
 * @param {string} [opts.label]      text next to the spinner (default: empty)
 * @param {'inline'|'block'|'fullbleed'} [opts.variant='inline']
 * @param {'sm'|'md'|'lg'} [opts.size='md']         spinner size
 * @param {'sage'|'sky'|'slate'} [opts.tone='slate'] text color
 * @param {string} [opts.extraClass]                extra classes for the wrapper
 * @returns {string}                                HTML ready to inject
 */
export function loadingHtml(opts = {}) {
    const o = opts || {};
    const variant = o.variant || 'inline';
    const size = o.size || 'md';
    const tone = o.tone || 'slate';
    const label = o.label != null ? String(o.label) : '';
    const extra = o.extraClass ? ' ' + o.extraClass : '';

    const spinSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-3xl' : 'text-xl';
    const textCls = (tone === 'sage'
        ? 'text-emerald-700 dark:text-emerald-300'
        : tone === 'sky'
        ? 'text-sky-700 dark:text-sky-300'
        : 'text-slate-600 dark:text-slate-400')
        + (size === 'sm' ? ' text-xs' : size === 'lg' ? ' text-sm' : ' text-xs');

    const wrapperCls = variant === 'block'
        ? 'flex items-center justify-center gap-2 py-6 min-h-[96px]' + extra
        : variant === 'fullbleed'
        ? 'flex flex-1 items-center justify-center gap-2 min-h-0' + extra
        : 'inline-flex items-center gap-2' + extra;

    return `<div class="${wrapperCls}" role="status" aria-live="polite">
        <span class="animate-spin ${spinSize}" aria-hidden="true">⏳</span>
        ${label ? `<span class="${textCls} font-medium">${label}</span>` : ''}
    </div>`;
}
