/**
 * Load bundled demo branch from demo/arborito-demo/ (same layout as a .arborito ZIP).
 *
 * Lesson images use `./media/<file>.png` (private local media). On seed,
 * `import-demo-media.js` copies demo/arborito-demo/media/* into IndexedDB for
 * branch-arborito-demo — same resolution path as any imported .arborito.
 */

import manifest from '../../../demo/arborito-demo/manifest.json' with { type: 'json' };
import { buildTreeFromFlatLessonFiles, buildTranslationIndex } from '../../shared/lib/arborito-archive.js';
import { DEMO_BRANCH_ID, DEMO_BRANCH_UNIVERSE } from './arborito-demo-ids.js';

/** Vite rewrites glob to a module map; Node CI has no glob — empty map is fine for store smoke. */
const lessonModules = (() => {
    try {
        return import.meta.glob('../../../demo/arborito-demo/lessons/**/*.md', {
            query: '?raw',
            import: 'default',
            eager: true,
        });
    } catch (_) {
        return {};
    }
})();

const fileModules = (() => {
    try {
        return import.meta.glob('../../../demo/arborito-demo/files/**/*.md', {
            query: '?raw',
            import: 'default',
            eager: true,
        });
    } catch (_) {
        return {};
    }
})();

/** Legacy authoring shorthand → ./media/ (ES default; EN lessons already use -en names). */
const DEMO_SCREENSHOT_RE = /demo:\/\/screenshot\/([A-Za-z0-9._-]+)/g;

function rewriteDemoScreenshots(content, langHint = '') {
    const lang = String(langHint).toUpperCase().startsWith('EN') ? 'en' : 'es';
    const map = {
        'sage-ai.png': `01-sage-${lang}.png`,
        'graph-light.png': `02-mapa-claro-${lang}.png`,
        'graph-dark.png': `03-mapa-oscuro-${lang}.png`,
        'lesson-light.png': `05-leccion-${lang}.png`,
        'arcade.png': `07-arcade-${lang}.png`,
        'alonso-duel.png': `08-alonso-${lang}.png`,
        'memory-garden.png': `11-jardin-${lang}.png`,
        'construction.png': `12-construccion-${lang}.png`,
    };
    return String(content || '').replace(DEMO_SCREENSHOT_RE, (_, name) => {
        const file = map[name] || name;
        return `./media/${file}`;
    });
}

function flattenGlob(modules) {
    const out = {};
    for (const [fullPath, content] of Object.entries(modules)) {
        const m = fullPath.match(/demo\/arborito-demo\/(.+\.md)$/);
        if (!m) continue;
        const rel = m[1];
        const langHint = /\/EN\//i.test(rel) || /lessons\/EN\//i.test(fullPath) ? 'EN' : 'ES';
        out[rel] = rewriteDemoScreenshots(content, langHint);
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
    const titles = meta.titles && typeof meta.titles === 'object' ? meta.titles : {};
    const primaryTitle =
        String(titles.ES || titles.EN || Object.values(titles)[0] || 'Arborito demo').trim() ||
        'Arborito demo';
    const tree = buildTreeFromFlatLessonFiles(fileMap, {
        id: DEMO_BRANCH_UNIVERSE,
        titles,
        descriptions: meta.descriptions || {},
        icon: meta.icon || '🌳',
    });
    tree.universeId = DEMO_BRANCH_UNIVERSE;
    tree.universeName = primaryTitle;
    tree.meta = { arboritoBundled: true, demo: true, official: true };
    tree.translationIndex = buildTranslationIndex(tree);
    return tree;
}

export function buildDemoBranchEntry() {
    const meta = manifest.meta || {};
    const titles = meta.titles && typeof meta.titles === 'object' ? meta.titles : {};
    const primaryTitle =
        String(titles.ES || titles.EN || Object.values(titles)[0] || 'Arborito demo').trim() ||
        'Arborito demo';
    return {
        id: DEMO_BRANCH_ID,
        name: primaryTitle,
        /* Fixed publish/seed stamp for the bundled demo (23 Jul 2026). */
        updated: Date.UTC(2026, 6, 23),
        data: buildDemoBranchData(),
        icon: String(meta.icon || '🌳').trim().slice(0, 32) || '🌳',
        meta: { arboritoBundled: true, demo: true, official: true },
    };
}
