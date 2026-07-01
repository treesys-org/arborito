import { LocaleRichText } from './LocaleRichText.jsx';

function calloutClassName({ tone = 'slate', solid, size, layout, extraClass }) {
    return [
        'arborito-callout',
        `arborito-callout--${tone}`,
        size === 'sm' ? 'arborito-callout--sm' : size === 'lg' ? 'arborito-callout--lg' : '',
        solid ? 'arborito-callout--solid' : '',
        layout === 'stack' ? 'arborito-callout--stack' : layout === 'centered' ? 'arborito-callout--centered' : '',
        extraClass || '',
    ]
        .filter(Boolean)
        .join(' ');
}

/**
 * JSX callout — mirrors `calloutHtml` contract without innerHTML.
 * Pass `body` for plain text, `richHtml` for trusted locale HTML, or `children`.
 */
export function Callout({
    tone = 'slate',
    icon,
    title,
    body,
    richHtml,
    children,
    solid,
    size,
    layout,
    inline,
    extraClass,
    titleClass,
    bodyClass,
    role = 'note',
}) {
    const cls = calloutClassName({ tone, solid, size, layout, extraClass });
    const bodyCls = bodyClass || 'arborito-callout__body';
    const titleCls = titleClass || 'arborito-callout__title';

    if (inline) {
        const inner = children ?? (richHtml ? <LocaleRichText html={richHtml} /> : body);
        return (
            <p className={cls} role={role}>
                {inner}
            </p>
        );
    }

    const bodyNode =
        children ??
        (richHtml ? (
            <div className={bodyCls}>
                <LocaleRichText html={richHtml} />
            </div>
        ) : body ? (
            <p className={bodyCls}>{body}</p>
        ) : null);

    const iconNode = icon ? (
        <span className="arborito-callout__icon" aria-hidden="true">
            {icon}
        </span>
    ) : null;
    const titleNode = title ? <p className={titleCls}>{title}</p> : null;
    const inner = titleNode || bodyNode ? (
        <div className="min-w-0 flex-1">
            {titleNode}
            {bodyNode}
        </div>
    ) : null;

    return (
        <div className={cls} role={role}>
            {iconNode}
            {inner}
        </div>
    );
}
