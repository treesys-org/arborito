/**
 * calloutHtml — renders an `.arborito-callout` with consistent contract:
 * icon, optional title, body, and a tone.
 *
 * `opts` = { tone, icon?, title?, body?, htmlBody?, solid?, size?, layout?,
 *            inline?, extraClass?, titleClass?, bodyClass?, role? }
 *   - tone: 'amber' | 'yellow' | 'sky' | 'blue' | 'emerald' | 'green' |
 *           'rose' | 'red' | 'purple' | 'violet' | 'slate'  (default = slate)
 *   - solid: true → saturated bg + white text
 *   - size: 'sm' | 'md' (default) | 'lg'
 *   - layout: 'row' (default) | 'stack' | 'centered'
 *   - inline: true → render as a single `<p>` (no inner `<div>`). When true,
 *             callers should pass either `body` OR `htmlBody` (text only —
 *             title/icon are ignored).
 *   - htmlBody: raw HTML used in place of the auto-wrapped `body` paragraph.
 *               Use when callers need a custom `<p>`/`<div>` or non-default
 *               Tailwind classes inside the callout.
 *   - extraClass: extra classes on the wrapper.
 *   - titleClass / bodyClass: override the default `arborito-callout__title` /
 *                             `arborito-callout__body` classes.
 */
export function calloutHtml(opts) {
    const o = opts || {};
    const tone = o.tone || 'slate';
    const cls = [
        'arborito-callout',
        `arborito-callout--${tone}`,
        o.size === 'sm' ? 'arborito-callout--sm' : o.size === 'lg' ? 'arborito-callout--lg' : '',
        o.solid ? 'arborito-callout--solid' : '',
        o.layout === 'stack' ? 'arborito-callout--stack' : o.layout === 'centered' ? 'arborito-callout--centered' : '',
        o.extraClass || '',
    ].filter(Boolean).join(' ');
    const role = o.role || 'note';
    if (o.inline) {
        const inner = o.htmlBody != null ? o.htmlBody : (o.body || '');
        return `<p class="${cls}" role="${role}">${inner}</p>`;
    }
    const icon = o.icon ? `<span class="arborito-callout__icon" aria-hidden="true">${o.icon}</span>` : '';
    const titleCls = o.titleClass || 'arborito-callout__title';
    const bodyCls = o.bodyClass || 'arborito-callout__body';
    const title = o.title ? `<p class="${titleCls}">${o.title}</p>` : '';
    const body = o.htmlBody != null ? o.htmlBody : (o.body ? `<p class="${bodyCls}">${o.body}</p>` : '');
    const inner = (title || body) ? `<div class="min-w-0 flex-1">${title}${body}</div>` : '';
    return `<div class="${cls}" role="${role}">${icon}${inner}</div>`;
}
