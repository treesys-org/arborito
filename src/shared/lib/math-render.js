/**
 * Lightweight LaTeX-ish renderer for lesson @math blocks (offline, no KaTeX).
 * Handles common patterns; unknown markup is shown as styled source.
 */

const GREEK = {
    alpha: 'α',
    beta: 'β',
    gamma: 'γ',
    delta: 'Δ',
    epsilon: 'ε',
    theta: 'θ',
    lambda: 'λ',
    mu: 'μ',
    pi: 'π',
    sigma: 'σ',
    phi: 'φ',
    omega: 'ω',
    infty: '∞',
    pm: '±',
    times: '×',
    div: '÷',
    leq: '≤',
    geq: '≥',
    neq: '≠',
    approx: '≈',
    sum: '∑',
    int: '∫',
    sqrt: '√',
    partial: '∂',
    nabla: '∇',
};

function escHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function replaceGreekCommands(text) {
    let out = text;
    for (const [cmd, sym] of Object.entries(GREEK)) {
        out = out.replace(new RegExp(`\\\\${cmd}\\b`, 'g'), sym);
    }
    return out;
}

function renderSqrt(inner) {
    return `<span class="arborito-math-sqrt"><span class="arborito-math-sqrt__radic">√</span><span class="arborito-math-sqrt__body">${inner}</span></span>`;
}

function renderFrac(num, den) {
    return `<span class="arborito-math-frac"><span class="arborito-math-frac__num">${num}</span><span class="arborito-math-frac__den">${den}</span></span>`;
}

function renderSupSub(text) {
    let out = text;
    out = out.replace(/\^\{([^}]+)\}/g, '<sup class="arborito-math-sup">$1</sup>');
    out = out.replace(/\^([0-9a-zA-Z])/g, '<sup class="arborito-math-sup">$1</sup>');
    out = out.replace(/_\{([^}]+)\}/g, '<sub class="arborito-math-sub">$1</sub>');
    out = out.replace(/_([0-9a-zA-Z])/g, '<sub class="arborito-math-sub">$1</sub>');
    return out;
}

/**
 * @param {string} latex
 * @returns {string} safe HTML string
 */
export function renderMathLatex(latex) {
    const raw = String(latex || '').trim();
    if (!raw) return '';

    let t = escHtml(raw);
    t = replaceGreekCommands(t);

    for (let pass = 0; pass < 4; pass++) {
        const next = t.replace(/\\sqrt\{([^}]*)\}/g, (_, inner) => renderSqrt(inner));
        if (next === t) break;
        t = next;
    }

    for (let pass = 0; pass < 4; pass++) {
        const next = t.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, (_, num, den) => renderFrac(num, den));
        if (next === t) break;
        t = next;
    }

    t = renderSupSub(t);
    t = t.replace(/\\left\(/g, '(').replace(/\\right\)/g, ')');
    t = t.replace(/\\cdot/g, '·');
    t = t.replace(/\\ldots/g, '…');
    t = t.replace(/\\rightarrow/g, '→');
    t = t.replace(/\\Rightarrow/g, '⇒');

    return t;
}

/** Common symbols for the construction insert picker. */
export const MATH_SYMBOL_GROUPS = [
    {
        labelKey: 'editorMathGroupOps',
        symbols: ['+', '−', '×', '÷', '±', '≠', '≈', '≤', '≥', '∞', '√', '∑', '∫', 'π', 'θ', 'Δ', 'α', 'β', 'λ', 'μ', '°', '²', '³', '½', '¼', '¾'],
    },
    {
        labelKey: 'editorMathGroupSets',
        symbols: ['∈', '∉', '⊂', '⊃', '∪', '∩', '∅', '∀', '∃', '∧', '∨', '¬', '→', '⇒', '↔'],
    },
];
