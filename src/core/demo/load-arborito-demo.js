/**
 * Load bundled demo branch from demo/arborito-demo/ (same layout as a .arborito ZIP).
 */

import manifest from '../../../demo/arborito-demo/manifest.json';
import { buildTreeFromFlatLessonFiles, buildTranslationIndex } from '../../shared/lib/arborito-archive.js';
import { DEMO_BRANCH_ID, DEMO_BRANCH_UNIVERSE } from './arborito-demo-ids.js';

const lessonModules = import.meta.glob('../../../demo/arborito-demo/lessons/**/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
});

const fileModules = import.meta.glob('../../../demo/arborito-demo/files/**/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
});

function flattenGlob(modules) {
    const out = {};
    for (const [fullPath, content] of Object.entries(modules)) {
        const m = fullPath.match(/demo\/arborito-demo\/(.+\.md)$/);
        if (m) out[m[1]] = content;
    }
    return out;
}

/** @returns {object} branch graph (treeData) */
export function buildDemoBranchData() {
    const fileMap = {
        ...flattenGlob(lessonModules),
        ...flattenGlob(fileModules),
    };
    const meta = manifest.meta || {};
    const tree = buildTreeFromFlatLessonFiles(fileMap, {
        id: meta.id || DEMO_BRANCH_UNIVERSE,
        name: meta.name || 'Arborito demo',
        description: meta.description || '',
        icon: meta.icon || '🌳',
    });
    tree.universeId = DEMO_BRANCH_UNIVERSE;
    tree.universeName = meta.name || 'Arborito demo';
    tree.meta = { arboritoBundled: true, demo: true };
    tree.translationIndex = buildTranslationIndex(tree);
    return tree;
}

export function buildDemoBranchEntry() {
    return {
        id: DEMO_BRANCH_ID,
        name: manifest.meta?.name || 'Arborito demo',
        updated: 1,
        data: buildDemoBranchData(),
        meta: { arboritoBundled: true, demo: true },
    };
}

