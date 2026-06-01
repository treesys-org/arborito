/**
 * Collect lesson evidence from the active curriculum tree for Sage dynamic (RAG) mode.
 */

import { parseArboritoFile } from '../editor/editor-engine.js';
import { TreeUtils } from '../tree-graph/tree-utils.js';

/**
 * @param {object|null|undefined} rawGraph
 * @param {string} [lang]
 * @param {{ maxNodes?: number, maxChars?: number, focusNodeId?: string|null }} [opts]
 */
export function collectTreeRagEvidence(rawGraph, lang = 'EN', opts = {}) {
    const maxNodes = opts.maxNodes != null ? opts.maxNodes : 24;
    const maxChars = opts.maxChars != null ? opts.maxChars : 12000;
    const focusNodeId = opts.focusNodeId || null;

    if (!rawGraph || !rawGraph.languages) return { blocks: [], text: '' };

    const root = rawGraph.languages[lang] || rawGraph.languages[Object.keys(rawGraph.languages)[0]];
    if (!root) return { blocks: [], text: '' };

    const leaves = [];
    const walk = (n) => {
        if (!n) return;
        if (n.type === 'leaf') leaves.push(n);
        if (n.children) n.children.forEach(walk);
    };
    walk(root);

    const scored = leaves.map((node) => {
        let score = 0;
        if (focusNodeId && String(node.id) === String(focusNodeId)) score += 100;
        const path = String(node.path || '');
        if (path) score += Math.min(20, path.split(' / ').length);
        return { node, score };
    });
    scored.sort((a, b) => b.score - a.score);

    const blocks = [];
    let used = 0;
    for (const { node } of scored) {
        if (blocks.length >= maxNodes) break;
        const parsed = parseArboritoFile(node.content || '');
        const body = String(parsed.body || '')
            .replace(/^>.*$/gm, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 900);
        const desc = String(node.description || parsed.meta.description || '').trim();
        const title = String(parsed.meta.title || node.name || '').trim();
        const snippet = [title && `**${title}**`, desc && `_${desc}_`, body].filter(Boolean).join('\n');
        if (!snippet) continue;
        const block = `[${pathLabel(node)}]\n${snippet}`;
        if (used + block.length > maxChars && blocks.length > 0) break;
        blocks.push(block);
        used += block.length;
    }

    return { blocks, text: blocks.join('\n\n---\n\n') };
}

function pathLabel(node) {
    return String(node.path || node.name || node.id || 'Lesson');
}

