#!/usr/bin/env node
/**
 * Categorized UI metrics — render vs logic vs hybrid debt.
 * Run: node scripts/check-migration-metrics.mjs [--fail]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const FEATURES = join(SRC, 'features');

const UI_RENDER_TARGET = 0.75;
const failOnDebt = process.argv.includes('--fail');

function walkFiles(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) {
            if (name === 'node_modules') continue;
            walkFiles(p, out);
        } else if (/\.(js|jsx)$/.test(name)) {
            out.push(p);
        }
    }
    return out;
}

function lineCount(file) {
    return readFileSync(file, 'utf8').split('\n').length;
}

function isFeatureAllowedLogic(rel) {
    const r = rel.replace(/\\/g, '/');
    if (!r.startsWith('src/features/') || !r.endsWith('.js')) return false;
    if (r.includes('/api/')) return true;
    if (r.includes('/hooks/')) return true;
    if (/^src\/features\/[^/]+\/index\.js$/.test(r)) return true;
    return false;
}

function isHybridDebtFile(rel, text) {
    const r = rel.replace(/\\/g, '/');
    const hybridPatterns = [
        /\.innerHTML\s*=/,
        /Object\.assign\s*\(\s*\w+\.prototype/,
        /export function build\w*Html/,
        /export function _render\w*Html/,
        /function build\w*Html/,
    ];
    if (hybridPatterns.some((re) => re.test(text))) return true;
    if (isFeatureAllowedLogic(r)) return false;
    if (r.startsWith('src/features/') && r.endsWith('.js')) return true;
    if (r.endsWith('.jsx') && /querySelectorAll\s*\(/.test(text)) {
        const bridgeHooks = [
            'useContentPanel.jsx',
            'useContentEffects.jsx',
            'useSageState.jsx',
            'LessonConstructDnD.jsx',
            'usePanelHeadBindings',
        ];
        if (bridgeHooks.some((h) => r.includes(h))) return true;
    }
    return false;
}

function categorize(rel) {
    const r = rel.replace(/\\/g, '/');
    if (r.endsWith('.jsx')) {
        const text = readFileSync(join(ROOT, r), 'utf8');
        return isHybridDebtFile(r, text) ? 'hybridDebt' : 'uiRender';
    }
    if (!r.endsWith('.js')) return 'other';

    const text = readFileSync(join(ROOT, r), 'utf8');
    if (isHybridDebtFile(r, text)) return 'hybridDebt';

    const logicPaths = [
        '/lib/',
        '/logic/',
        '/hooks/',
        '/actions/',
        '/store/',
        '/core/',
        '/shared/lib/',
        '/shared/ui/',
        '/nostr/',
        '/ai/',
    ];
    if (
        logicPaths.some((seg) => r.includes(seg)) ||
        r.includes('/editor/') ||
        r.includes('/tree-graph/logic/graph-')
    ) {
        return 'uiLogic';
    }

    return 'uiLogic';
}

function fmt(n) {
    return n.toLocaleString('en-US');
}

function pct(part, total) {
    if (!total) return '0.0%';
    return `${((part / total) * 100).toFixed(1)}%`;
}

const files = walkFiles(SRC);
const buckets = { uiRender: 0, uiLogic: 0, hybridDebt: 0, other: 0 };
const bucketFiles = { uiRender: [], uiLogic: [], hybridDebt: [], other: [] };

for (const file of files) {
    const rel = relative(ROOT, file);
    const cat = categorize(rel);
    const lines = lineCount(file);
    buckets[cat] += lines;
    bucketFiles[cat].push({ rel, lines });
}

const uiRenderDenom = buckets.uiRender + buckets.hybridDebt;
const uiRenderRatio = uiRenderDenom ? buckets.uiRender / uiRenderDenom : 0;
const uiTotal = buckets.uiRender + buckets.uiLogic + buckets.hybridDebt;

const featuresJs = walkFiles(FEATURES).filter((f) => f.endsWith('.js'));
const featuresJsDebt = featuresJs.filter((f) => {
    const rel = relative(ROOT, f).replace(/\\/g, '/');
    return !isFeatureAllowedLogic(rel);
});
const featuresJsAllowed = featuresJs.length - featuresJsDebt.length;

console.log('=== Arborito UI architecture metrics ===\n');
console.log(`UI render (.jsx)     — ${fmt(buckets.uiRender)} lines (${pct(buckets.uiRender, uiTotal)} of UI)`);
console.log(`UI logic (.js ok)    — ${fmt(buckets.uiLogic)} lines (${pct(buckets.uiLogic, uiTotal)} of UI)`);
console.log(`Hybrid debt          — ${fmt(buckets.hybridDebt)} lines (${pct(buckets.hybridDebt, uiTotal)} of UI)`);
console.log(`Other src            — ${fmt(buckets.other)} lines`);
console.log('');
console.log(
    `JSX render ratio    — uiRender / (uiRender + hybridDebt) ≥ ${(UI_RENDER_TARGET * 100).toFixed(0)}% (current: ${(uiRenderRatio * 100).toFixed(1)}%)`
);
console.log(
    'Jr architecture      — run check-react-migration for singleton/store rules in components/modals'
);

const jsFiles = files.filter((f) => f.endsWith('.js')).length;
const jsxFiles = files.filter((f) => f.endsWith('.jsx')).length;
console.log(`\nFiles in src/        — ${jsFiles} .js / ${jsxFiles} .jsx`);
console.log(
    `features logic .js   — ${featuresJsAllowed} allowed (api/, hooks/, index.js) + ${featuresJsDebt.length} debt (target debt: 0)`
);

if (bucketFiles.hybridDebt.length) {
    console.log('\nTop hybrid-debt files:');
    bucketFiles.hybridDebt
        .sort((a, b) => b.lines - a.lines)
        .slice(0, 15)
        .forEach(({ rel, lines }) => console.log(`  ${lines.toString().padStart(5)}  ${rel}`));
}

const targetsMet =
    uiRenderRatio >= UI_RENDER_TARGET &&
    buckets.hybridDebt === 0 &&
    featuresJsDebt.length === 0;
if (targetsMet) {
    console.log('\n[check-migration-metrics] Targets met.');
} else {
    console.log('\n[check-migration-metrics] Targets not met.');
    if (failOnDebt) process.exit(1);
}
