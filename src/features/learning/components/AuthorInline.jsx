import { normalizeAuthorMarkupArtifacts } from '../../../shared/lib/author-markup-normalize.js';

const TOKEN_RE =
    /(<br\s*\/?>|<\/?strong>|<\/?em>|<code class="bg-slate-200 dark:bg-slate-700 px-1 rounded font-mono text-sm text-pink-600 dark:text-pink-400">[\s\S]*?<\/code>)/gi;

function parseAuthorInline(text, keyRef) {
    const raw = normalizeAuthorMarkupArtifacts(String(text ?? ''));
    if (!raw) return [];

    const parts = raw.split(TOKEN_RE).filter((p) => p !== '');
    const nodes = [];

    for (const part of parts) {
        const lower = part.toLowerCase();
        if (lower === '<br>' || lower === '<br/>' || lower === '<br />') {
            nodes.push(<br key={keyRef.current++} />);
            continue;
        }

        const codeMatch = part.match(
            /^<code class="bg-slate-200 dark:bg-slate-700 px-1 rounded font-mono text-sm text-pink-600 dark:text-pink-400">([\s\S]*?)<\/code>$/i
        );
        if (codeMatch) {
            nodes.push(
                <code
                    key={keyRef.current++}
                    className="bg-slate-200 dark:bg-slate-700 px-1 rounded font-mono text-sm text-pink-600 dark:text-pink-400"
                >
                    {codeMatch[1]}
                </code>
            );
            continue;
        }

        let chunk = part;
        chunk = chunk.replace(/<\/?strong>/gi, '\0STRONG\0');
        chunk = chunk.replace(/<\/?em>/gi, '\0EM\0');
        const segs = chunk.split(/\0/);
        for (let i = 0; i < segs.length; i++) {
            const seg = segs[i];
            if (seg === 'STRONG') {
                const inner = segs[++i] ?? '';
                nodes.push(<strong key={keyRef.current++}>{inner}</strong>);
            } else if (seg === 'EM') {
                const inner = segs[++i] ?? '';
                nodes.push(<em key={keyRef.current++}>{inner}</em>);
            } else if (seg) {
                nodes.push(<span key={keyRef.current++}>{seg}</span>);
            }
        }
    }

    return nodes;
}

/** Trusted author inline markup: strong, em, br, code spans. */
export function AuthorInline({ text }) {
    const keyRef = { current: 0 };
    const nodes = parseAuthorInline(text, keyRef);
    if (!nodes.length) return null;
    return nodes.length === 1 ? nodes[0] : <>{nodes}</>;
}
