import { Fragment } from 'react';

function stripEmojisForChat(text) {
    return String(text || '')
        .replace(/\p{Extended_Pictographic}(\uFE0F|\uFE0E)?/gu, '')
        .replace(/\u200D/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function parseInline(text, keyPrefix) {
    if (!text) return [];
    const nodes = [];
    let rest = text;
    let partKey = 0;

    while (rest.length) {
        const rules = [
            {
                re: /^`([^`\n]+)`/,
                render: (m) => (
                    <code
                        key={`${keyPrefix}-c${partKey++}`}
                        className="sage-md-code px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-900/60 text-[0.92em] font-mono"
                    >
                        {m[1]}
                    </code>
                ),
            },
            {
                re: /^\*\*([^*]+)\*\*/,
                render: (m) => (
                    <strong key={`${keyPrefix}-b${partKey++}`} className="font-bold">
                        {m[1]}
                    </strong>
                ),
            },
            {
                re: /^(?<!\*)\*([^*\n]+)\*(?!\*)/,
                render: (m) => (
                    <em key={`${keyPrefix}-e${partKey++}`} className="italic">
                        {m[1]}
                    </em>
                ),
            },
            {
                re: /^__(.+?)__/,
                render: (m) => (
                    <strong key={`${keyPrefix}-b2${partKey++}`} className="font-bold">
                        {m[1]}
                    </strong>
                ),
            },
            {
                re: /^_([^_\n]+)_/,
                render: (m) => (
                    <em key={`${keyPrefix}-e2${partKey++}`} className="italic">
                        {m[1]}
                    </em>
                ),
            },
            {
                re: /^\[(.*?)\]\((.*?)\)/,
                render: (m) => (
                    <a
                        key={`${keyPrefix}-a${partKey++}`}
                        href={m[2]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                    >
                        {m[1]}
                    </a>
                ),
            },
        ];

        let matched = false;
        for (const { re, render } of rules) {
            const m = rest.match(re);
            if (m) {
                nodes.push(render(m));
                rest = rest.slice(m[0].length);
                matched = true;
                break;
            }
        }
        if (!matched) {
            const nextSpecial = rest.search(/[`*\[_]/);
            if (nextSpecial === -1) {
                if (rest) nodes.push(rest);
                break;
            }
            if (nextSpecial > 0) nodes.push(rest.slice(0, nextSpecial));
            rest = rest.slice(nextSpecial);
        }
    }
    return nodes;
}

function formatBlockNodes(text, blockKey) {
    const lines = text.split('\n');
    const out = [];
    let listItems = [];
    let lineKey = 0;

    const flushList = () => {
        if (!listItems.length) return;
        out.push(
            <ul key={`${blockKey}-ul${lineKey++}`} className="sage-md-list my-1 pl-4 list-disc space-y-0.5">
                {listItems}
            </ul>
        );
        listItems = [];
    };

    for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        const bullet = line.match(/^[-*•]\s+(.+)$/);
        const numbered = line.match(/^\d+[.)]\s+(.+)$/);
        const heading = line.match(/^#{1,3}\s+(.+)$/);
        if (bullet) {
            listItems.push(
                <li key={`${blockKey}-li${lineKey++}`}>{parseInline(bullet[1], `${blockKey}-li${lineKey}`)}</li>
            );
            continue;
        }
        if (numbered) {
            listItems.push(
                <li key={`${blockKey}-li${lineKey++}`}>{parseInline(numbered[1], `${blockKey}-li${lineKey}`)}</li>
            );
            continue;
        }
        flushList();
        if (heading) {
            out.push(
                <p key={`${blockKey}-h${lineKey++}`} className="sage-md-heading font-bold mt-2 mb-1">
                    {parseInline(heading[1], `${blockKey}-h${lineKey}`)}
                </p>
            );
        } else if (line === '') {
            out.push(<br key={`${blockKey}-br${lineKey++}`} />);
        } else {
            out.push(
                <Fragment key={`${blockKey}-ln${lineKey++}`}>
                    <span className="sage-md-line">{parseInline(line, `${blockKey}-ln${lineKey}`)}</span>
                    <br />
                </Fragment>
            );
        }
    }
    flushList();

    if (out.length) {
        const last = out[out.length - 1];
        if (last?.type === Fragment && last.props?.children?.[1]?.type === 'br') {
            out[out.length - 1] = last.props.children[0];
        }
    }
    return out;
}

/** JSX renderer mirroring `formatSageMessage` (safe markdown-ish subset). */
export function renderSageMessage(text) {
    if (text == null || text === '') return null;
    const src = stripEmojisForChat(String(text));
    const parts = src.split(/(```[\s\S]*?```)/g);
    const chunks = [];
    let chunkKey = 0;

    for (const part of parts) {
        if (part.startsWith('```') && part.endsWith('```')) {
            const inner = part.slice(3, -3).replace(/^\w*\n?/, '').trim();
            chunks.push(
                <pre
                    key={`chunk-${chunkKey++}`}
                    className="sage-md-pre my-2 p-2 rounded-lg bg-slate-100 dark:bg-slate-900/70 text-xs font-mono whitespace-pre-wrap overflow-x-auto border border-slate-200 dark:border-slate-700"
                >
                    {inner}
                </pre>
            );
        } else if (part) {
            chunks.push(...formatBlockNodes(part, `chunk-${chunkKey++}`));
        }
    }

    if (!chunks.length) return null;
    if (chunks.length === 1) return chunks[0];
    return <>{chunks}</>;
}
