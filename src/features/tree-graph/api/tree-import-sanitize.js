import { validateLessonMediaUrl } from '../../learning/api/parser-url.js';

const NODE_TYPES = new Set(['root', 'branch', 'leaf', 'exam']);

function sanitizeLessonMarkdown(md) {
    let text = String(md || '');
    if (!text.trim()) return text;

    text = text.replace(/```(image|video)\n([\s\S]*?)```/gi, (block, kind, body) => {
        const urlMatch = String(body || '').match(/^\s*url:\s*(.+)$/im);
        const rawUrl = urlMatch ? urlMatch[1].trim() : '';
        const safe = validateLessonMediaUrl(kind.toLowerCase(), rawUrl);
        if (!safe) {
            return `\`\`\`${kind}\nurl:\n\`\`\``;
        }
        return `\`\`\`${kind}\nurl: ${safe}\n\`\`\``;
    });

    return text;
}

function walkNode(node, issues) {
    if (!node || typeof node !== 'object') {
        issues.push('invalid-node');
        return;
    }
    const type = String(node.type || '').trim();
    if (type && !NODE_TYPES.has(type)) {
        issues.push(`unknown-type:${type}`);
    }
    if (node.content != null && typeof node.content === 'string') {
        node.content = sanitizeLessonMarkdown(node.content);
    }
    if (Array.isArray(node.children)) {
        for (const child of node.children) walkNode(child, issues);
    }
}

/**
 * Validate + normalize imported/manual tree JSON (media URLs, basic node shape).
 * @param {unknown} json
 * @returns {{ tree: object | null, issues: string[] }}
 */
export function sanitizeImportedTreeJson(json) {
    const issues = [];
    if (!json || typeof json !== 'object') {
        return { tree: null, issues: ['empty'] };
    }

    let tree = json;
    if (tree.languages && typeof tree.languages === 'object' && !Array.isArray(tree.languages)) {
        for (const lang of Object.keys(tree.languages)) {
            walkNode(tree.languages[lang], issues);
        }
    } else {
        walkNode(tree, issues);
    }

    return { tree, issues };
}
