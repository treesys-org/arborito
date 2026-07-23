import { renderMathLatex } from '../../../shared/lib/math-render.js';

/** Renders a lesson @math block for students. */
export function MathFormula({ latex, display = 'block' }) {
    const html = renderMathLatex(latex);
    if (!html) return null;

    const inline = display === 'inline';
    const Tag = inline ? 'span' : 'div';
    const className = inline
        ? 'arborito-math arborito-math--inline text-slate-800 dark:text-slate-100'
        : 'arborito-math arborito-math--block my-6 px-5 py-4 rounded-xl border border-indigo-200/70 dark:border-indigo-800/50 bg-indigo-50/80 dark:bg-indigo-950/30 text-center text-lg text-slate-800 dark:text-slate-100 overflow-x-auto';

    return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
