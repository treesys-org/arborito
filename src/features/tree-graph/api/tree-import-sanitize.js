import { validateLessonMediaUrl } from '../../learning/api/parser-url.js';
import { treeHasLocalMediaRefs } from '../../learning/api/lesson-local-media-store.js';

const NODE_TYPES = new Set(['root', 'branch', 'leaf', 'exam']);

/**
 * @param {string} md
 * @param {{ allowLocal?: boolean }} [opts]
 */
export function sanitizeLessonMarkdown(md, opts = {}) {
    let text = String(md || '');
    if (!text.trim()) return text;
    const allowLocal = opts.allowLocal !== false;

    text = text.replace(/```(image|video|audio)\n([\s\S]*?)```/gi, (block, kind, body) => {
        const urlMatch = String(body || '').match(/^\s*url:\s*(.+)$/im);
        const rawUrl = urlMatch ? urlMatch[1].trim() : '';
        const safe = validateLessonMediaUrl(kind.toLowerCase(), rawUrl, { allowLocal });
        if (!safe) {
            return `\`\`\`${kind}\nurl:\n\`\`\``;
        }
        return `\`\`\`${kind}\nurl: ${safe}\n\`\`\``;
    });

    text = text.replace(/@(image|video|audio)\n([\s\S]*?)@\/\1/gi, (block, kind, body) => {
        const urlMatch = String(body || '').match(/^\s*url:\s*(.+)$/im);
        const rawUrl = urlMatch ? urlMatch[1].trim() : '';
        const safe = validateLessonMediaUrl(kind.toLowerCase(), rawUrl, { allowLocal });
        if (!safe) {
            return `@${kind}\nurl:\n@/${kind}`;
        }
        const captionMatch = String(body || '').match(/^\s*caption:\s*(.+)$/im);
        const caption = captionMatch ? captionMatch[1].trim() : '';
        const captionLine = caption ? `caption: ${caption}\n` : '';
        return `@${kind}\nurl: ${safe}\n${captionLine}@/${kind}`;
    });

    return text;
}

function walkNode(node, issues, opts) {
    if (!node || typeof node !== 'object') {
        issues.push('invalid-node');
        return;
    }
    const type = String(node.type || '').trim();
    if (type && !NODE_TYPES.has(type)) {
        issues.push(`unknown-type:${type}`);
    }
    if (node.content != null && typeof node.content === 'string') {
        node.content = sanitizeLessonMarkdown(node.content, opts);
    }
    if (Array.isArray(node.children)) {
        for (const child of node.children) walkNode(child, issues, opts);
    }
}

/**
 * Validate + normalize tree JSON media URLs.
 * @param {unknown} json
 * @param {{ allowLocal?: boolean }} [opts] — `allowLocal: false` for network publish
 * @returns {{ tree: object | null, issues: string[] }}
 */
export function sanitizeImportedTreeJson(json, opts = {}) {
    const issues = [];
    if (!json || typeof json !== 'object') {
        return { tree: null, issues: ['empty'] };
    }

    let tree = json;
    if (tree.languages && typeof tree.languages === 'object' && !Array.isArray(tree.languages)) {
        for (const lang of Object.keys(tree.languages)) {
            walkNode(tree.languages[lang], issues, opts);
        }
    } else {
        walkNode(tree, issues, opts);
    }

    return { tree, issues };
}

/** True when curriculum still references user-local ./media/ (must not publish to Nostr). */
export function curriculumHasLocalMedia(treeData) {
    return treeHasLocalMediaRefs(treeData);
}
