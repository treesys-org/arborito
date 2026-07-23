#!/usr/bin/env node
/**
 * React architecture rules — fails CI when forbidden patterns appear in the UI layer.
 * Run: npm run check:quality -- --only react-architecture
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const SRC = join(ROOT, 'src');
const FEATURES = join(SRC, 'features');

function walkFiles(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) {
            if (name === 'node_modules') continue;
            walkFiles(p, out);
        } else {
            out.push(p);
        }
    }
    return out;
}

function grepSrc(pattern, { glob = null, jsOnly = false, jsxOnly = false } = {}) {
    const re = new RegExp(pattern);
    const hits = [];
    for (const file of walkFiles(SRC)) {
        const rel = relative(ROOT, file).replace(/\\/g, '/');
        if (glob === 'features' && !rel.includes('/features/')) continue;
        if (jsOnly && !rel.endsWith('.js')) continue;
        if (jsxOnly && !rel.endsWith('.jsx')) continue;
        const text = readFileSync(file, 'utf8');
        text.split('\n').forEach((line, i) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
            if (re.test(line)) hits.push(`${rel}:${i + 1}:${trimmed}`);
        });
    }
    return hits.join('\n');
}

const criticalChecks = [
    {
        name: 'no ArboritoPanel / mountModal / customElements / ArboritoGraph',
        pattern: 'usePanelController|extends ArboritoPanel|customElements\\.define|\\bmountModal\\b|\\bshowModalComponent\\b|mountPanelController|\\bArboritoGraph\\b|applyPanelHost',
        opts: {},
    },
    {
        name: 'no engine.mount in jsx panels',
        pattern: 'engine\\.mount',
        opts: { jsxOnly: true },
    },
    {
        name: 'no panel-host.js',
        pattern: 'panel-host\\.js|from [\'"].*panel-host',
        opts: { glob: 'features' },
    },
    {
        name: 'no Object.assign UI mixins in features',
        pattern: 'Object\\.assign\\(\\s*\\w+\\.prototype',
        opts: { glob: 'features', jsOnly: true },
    },
    {
        name: 'no build*Html / _render*Html exports in features',
        pattern: 'export function (build\\w*Html|_render\\w*Html)',
        opts: { glob: 'features', jsOnly: true },
    },
    {
        name: 'no renderMobilePrototypeTree in features jsx',
        pattern: 'renderMobilePrototypeTree',
        opts: { jsxOnly: true },
    },
    {
        name: 'no createGraphEngine import in features',
        pattern: 'createGraphEngine',
        opts: { glob: 'features' },
    },
    {
        name: 'no getPanelRef graph in production src (allow graph-panel-api)',
        pattern: "getPanelRef\\('graph'\\)",
        opts: {},
    },
    {
        name: 'no store mixin loaders',
        pattern: 'ensurePublishMixins|ensureForumMixins|ensureImportExportMixins|ensureAdminMixins|prefetchDeferredStoreMixins|curriculum-switcher-mixin|nodeActionsMixin',
        opts: {},
    },
    {
        name: 'gamification from userStore not store.state in hooks',
        pattern: '(singleton|shell\\(\\))\\?\\.state\\?\\.gamification',
        opts: { glob: 'features' },
    },
];

let failed = false;

for (const { name, pattern, opts } of criticalChecks) {
    const hits = grepSrc(pattern, opts);
    let filtered =
        name.includes('build*Html')
            ? hits
                  .split('\n')
                  .filter(Boolean)
                  .filter(
                      (line) =>
                          !line.includes('shared/lib/html-escape') &&
                          !line.includes('test/')
                  )
                  .join('\n')
            : hits;
    if (name.includes('getPanelRef graph')) {
        filtered = filtered
            .split('\n')
            .filter(Boolean)
            .filter(
                (line) =>
                    !line.includes('graph-panel-api.js') &&
                    !line.includes('viewport-repaint.js') &&
                    !line.includes('ConstructionCreateFab.jsx') &&
                    !line.includes('replace-panel-queries.py') &&
                    !line.includes('scripts/')
            )
            .join('\n');
    }
    if (filtered) {
        failed = true;
        console.error(`\n[check-react-architecture] FAIL: ${name}`);
        console.error(filtered);
    } else {
        console.log(`[check-react-architecture] OK: ${name}`);
    }
}

const featuresJsOutsideApi = walkFiles(FEATURES).filter((f) => {
    if (!f.endsWith('.js')) return false;
    const rel = relative(FEATURES, f).replace(/\\/g, '/');
    if (rel.includes('/api/')) return false;
    if (rel.endsWith('/index.js') && rel.split('/').length === 2) return false;
    if (rel.startsWith('hooks/') || rel.includes('/hooks/')) return false;
    return true;
});
if (featuresJsOutsideApi.length) {
    failed = true;
    console.error('\n[check-react-architecture] FAIL: .js files outside features/*/api/:');
    for (const f of featuresJsOutsideApi) console.error(`  ${relative(ROOT, f)}`);
} else {
    console.log('[check-react-architecture] OK: features/ .js only under api/');
}

if (existsSync(join(SRC, 'lib'))) {
    failed = true;
    console.error('\n[check-react-architecture] FAIL: src/lib/ must not exist (use features/*/api/)');
} else {
    console.log('[check-react-architecture] OK: no src/lib/');
}

const mixinDirs = walkFiles(SRC).filter((f) => f.includes('/store-mixins/'));
if (mixinDirs.length) {
    failed = true;
    console.error('\n[check-react-architecture] FAIL: store-mixins/ is not allowed; use stores/*-store-actions.js:');
    for (const f of mixinDirs.slice(0, 10)) console.error(`  ${relative(ROOT, f)}`);
} else {
    console.log('[check-react-architecture] OK: no store-mixins/');
}

if (existsSync(join(SRC, 'core/ui-store.js'))) {
    failed = true;
    console.error('\n[check-react-architecture] FAIL: ui-store.js moved to stores/shell-store.js');
} else {
    console.log('[check-react-architecture] OK: no core/ui-store.js');
}

const jsxStoreImports = grepSrc(
    "from ['\"][^'\"]*core/store\\.js['\"]",
    { jsxOnly: true }
)
    .split('\n')
    .filter(Boolean)
    .filter((line) => {
        if (line.includes('/hooks/')) return false;
        if (line.includes('/api/')) return false;
        if (line.includes('/app/hooks/')) return false;
        if (line.includes('/stores/')) return false;
        return true;
    });
if (jsxStoreImports.length) {
    failed = true;
    console.error('\n[check-react-architecture] FAIL: .jsx imports core/store.js (use features/<x>/hooks/ instead):');
    console.error(jsxStoreImports.slice(0, 15).join('\n'));
} else {
    console.log('[check-react-architecture] OK: no direct core/store in feature .jsx');
}

const allowedStoreImportPaths = new Set(['src/core/store.js', 'src/core/bootstrap.js']);
const directStoreImports = grepSrc("from ['\"][^'\"]*core/store\\.js['\"]", { jsOnly: true })
    .split('\n')
    .filter(Boolean)
    .filter((line) => {
        const file = line.split(':')[0];
        return !allowedStoreImportPaths.has(file);
    });
if (directStoreImports.length) {
    failed = true;
    console.error(
        '\n[check-react-architecture] FAIL: import core/store.js outside bootstrap (use core/store-singleton.js):'
    );
    console.error(directStoreImports.slice(0, 15).join('\n'));
} else {
    console.log('[check-react-architecture] OK: core/store.js only via bootstrap');
}

const legacyFiles = [
    'src/app/ArboritoPanel.js',
    'src/app/mountModal.jsx',
    'src/app/panel-host.js',
    'src/features/shell-chrome/sidebar.js',
    'src/features/shell-chrome/sidebar-template.js',
    'src/features/sources/modals/sources.js',
    'src/features/sources/modals/CurriculumSwitcher.jsx',
    'src/features/learning/modals/sage.js',
    'src/features/learning/modals/sage-ui-core.js',
    'src/features/search/search-panel.js',
];

const legacyPresent = legacyFiles.filter((f) => existsSync(join(ROOT, f)));
if (legacyPresent.length) {
    failed = true;
    console.error('\n[check-react-architecture] FAIL: forbidden paths (do not reintroduce):');
    for (const f of legacyPresent) console.error(`  ${f}`);
} else {
    console.log('[check-react-architecture] OK: no forbidden stubs');
}

const shellUiImportDebt = grepSrc(
    "from ['\"].*\\/lib\\/(shell-chrome|learning|tree-graph|sources|arcade|garden-progress|editor|forum|nostr|privacy|backup-export|version-updates|search|identity-auth|tour|publishing)\\/.*\\.jsx",
    { glob: 'features' }
)
    .split('\n')
    .filter(Boolean)
    .concat(
        grepSrc(
            "import\\(['\"].*\\/lib\\/(shell-chrome|learning|tree-graph|sources|arcade|garden-progress|editor|forum|nostr|privacy|backup-export|version-updates|search|identity-auth|tour|publishing)\\/.*\\.jsx",
            { glob: 'features' }
        )
            .split('\n')
            .filter(Boolean)
    );
const reactShellImportDebt = grepSrc(
    "from ['\"].*\\/lib\\/(shell-chrome|learning|tree-graph|sources|arcade|garden-progress|editor|forum|nostr|privacy|backup-export|version-updates|search|identity-auth|tour|publishing)\\/.*\\.jsx",
    { jsxOnly: true }
)
    .split('\n')
    .filter(Boolean)
    .filter((line) => line.includes('/react/') || line.includes('/shared/lib/lazy-stylesheet'))
    .concat(
        grepSrc(
            "import\\(['\"].*\\/lib\\/(shell-chrome|learning|tree-graph|sources|arcade|garden-progress|editor|forum|nostr|privacy|backup-export|version-updates|search|identity-auth|tour|publishing)\\/.*\\.jsx",
            { jsxOnly: true }
        )
            .split('\n')
            .filter(Boolean)
            .filter((line) => line.includes('/react/') || line.includes('/shared/lib/lazy-stylesheet'))
    );
const uiImportDebt = [...new Set([...shellUiImportDebt, ...reactShellImportDebt])].join('\n');
if (uiImportDebt) {
    failed = true;
    console.error('\n[check-react-architecture] FAIL: UI .jsx imported from src/lib/ (use src/features/):');
    console.error(uiImportDebt);
} else {
    console.log('[check-react-architecture] OK: shell/modal imports resolve to features/ for UI .jsx');
}

const templateHtmlAllow = [
    '/features/backup-export/api/export/print-blocks.js',
    '/features/editor/api/editor-engine.js',
    '/features/editor/api/quiz-wizard-block.js',
    '/editor/hooks/useQuizWizard.jsx',
    '/features/shell-chrome/api/sidebar-utils.js',
];
const templateHtmlDebt = grepSrc('return\\s*`\\s*<', { glob: 'features', jsOnly: true })
    .split('\n')
    .filter(Boolean)
    .filter((line) => !templateHtmlAllow.some((seg) => line.includes(seg)));
if (templateHtmlDebt.length) {
    failed = true;
    console.error('\n[check-react-architecture] FAIL: template literal HTML (return `<) in features/*.js:');
    console.error(templateHtmlDebt.join('\n'));
} else {
    console.log('[check-react-architecture] OK: no template literal HTML in features/*.js');
}

const engineAssignDebt = grepSrc('Object\\.assign\\(\\s*engine', {
    glob: 'features/tree-graph',
    jsOnly: true,
});
if (engineAssignDebt) {
    failed = true;
    console.error('\n[check-react-architecture] FAIL: Object.assign(engine in tree-graph:');
    console.error(engineAssignDebt);
} else {
    console.log('[check-react-architecture] OK: no Object.assign(engine in tree-graph');
}

const modalHeroImportDebt = grepSrc("from ['\"].*modal-hero", { glob: 'features', jsOnly: true });
if (modalHeroImportDebt) {
    failed = true;
    console.error('\n[check-react-architecture] FAIL: modal-hero.js imports from features:');
    console.error(modalHeroImportDebt);
} else {
    console.log('[check-react-architecture] OK: no modal-hero.js imports in features');
}

const bindingDebtFiles = [
    'src/features/learning/useContentEffects.jsx',
    'src/features/learning/useContentPanel.jsx',
    'src/features/editor/LessonConstructDnD.jsx',
    'src/features/learning/modals/hooks/useSageState.jsx',
    'src/features/tree-graph/components/mobile/MobileInlineTools.jsx',
];
const bindingAllowPatterns = [/#lesson-visual-editor/, /getElementsByClassName\('arborito-quiz-edit'\)/];
let bindingDebtOk = true;
for (const rel of bindingDebtFiles) {
    const file = join(ROOT, rel);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    const hits = [];
    text.split('\n').forEach((line, i) => {
        if (!/querySelectorAll\s*\(/.test(line) && !/bindMobileTap/.test(line)) return;
        if (bindingAllowPatterns.some((re) => re.test(line))) return;
        hits.push(`${rel}:${i + 1}:${line.trim()}`);
    });
    if (hits.length) {
        bindingDebtOk = false;
        failed = true;
        console.error(`\n[check-react-architecture] FAIL: forbidden bindings in ${rel}:`);
        console.error(hits.join('\n'));
    }
}
if (bindingDebtOk) {
    console.log('[check-react-architecture] OK: no querySelectorAll / bindMobileTap forbidden bindings in panel hooks');
}

const storeMixinFiles = walkFiles(FEATURES).filter(
    (f) => f.endsWith('.js') && /store-.*-methods\.js$/.test(f.replace(/\\/g, '/'))
);
if (storeMixinFiles.length) {
    failed = true;
    console.error('\n[check-react-architecture] FAIL: store-*-methods.js in features/ (use stores/*-store-actions.js):');
    for (const f of storeMixinFiles) console.error(`  ${relative(ROOT, f)}`);
} else {
    console.log('[check-react-architecture] OK: no store-*-methods.js in features/');
}

const attachBundlesPath = join(SRC, 'stores/attach-action-bundles.js');
if (existsSync(attachBundlesPath)) {
    const attachText = readFileSync(attachBundlesPath, 'utf8');
    const badAttachImports = attachText
        .split('\n')
        .map((line, i) => ({ line: line.trim(), i: i + 1 }))
        .filter(
            ({ line }) =>
                line.startsWith('import ') &&
                line.includes('/features/') &&
                line.includes('store-') &&
                line.includes('-methods')
        );
    if (badAttachImports.length) {
        failed = true;
        console.error(
            '\n[check-react-architecture] FAIL: attach-action-bundles.js imports store mixins from features/:'
        );
        for (const { line, i } of badAttachImports) console.error(`  attach-action-bundles.js:${i}: ${line}`);
    } else {
        console.log('[check-react-architecture] OK: attach-action-bundles imports only from stores/');
    }
}

const storeActionBindDebt = walkFiles(join(SRC, 'stores'))
    .filter((f) => f.endsWith('-store-actions.js'))
    .map((f) => relative(ROOT, f).replace(/\\/g, '/'))
    .filter((rel) => {
        const text = readFileSync(join(ROOT, rel), 'utf8');
        return /\bbindStoreContext\s*\(/.test(text) || /\bconst\s+_raw[A-Z]/.test(text);
    });
if (storeActionBindDebt.length) {
    failed = true;
    console.error(
        '\n[check-react-architecture] FAIL: *-store-actions.js still uses bindStoreContext (convert to getArboritoStore() actions):'
    );
    for (const rel of storeActionBindDebt) console.error(`  ${rel}`);
} else {
    console.log('[check-react-architecture] OK: no bindStoreContext wrappers in *-store-actions.js');
}

function parseNamedImports(block) {
    const names = new Set();
    for (const part of block.split(',')) {
        const p = part.trim();
        if (!p) continue;
        if (/\s+as\s+/.test(p)) names.add(p.split(/\s+as\s+/).pop().trim());
        else names.add(p);
    }
    return names;
}

const storeBindingBugs = [];
for (const file of walkFiles(join(SRC, 'stores')).filter((f) => f.endsWith('.js'))) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    const text = readFileSync(file, 'utf8');

    const reexports = new Set();
    for (const m of text.matchAll(/^export\s*\{([^}]+)\}\s*from\s*['"]/gm)) {
        for (const n of parseNamedImports(m[1])) reexports.add(n);
    }

    const imported = new Set();
    for (const m of text.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]/gm)) {
        for (const n of parseNamedImports(m[1])) imported.add(n);
    }

    const defined = new Set([
        ...text.matchAll(/^export (?:async )?function (\w+)/gm).map((m) => m[1]),
        ...text.matchAll(/^export const (\w+)\s*=/gm).map((m) => m[1]),
    ]);

    const localBindings = new Set([...imported, ...defined]);
    const usedInBundles = [...text.matchAll(/:\s*(\w+Action)\b/g)].map((m) => m[1]);
    const reexportUsedLocally = [...reexports].filter(
        (name) => usedInBundles.includes(name) && !localBindings.has(name)
    );
    if (reexportUsedLocally.length) {
        storeBindingBugs.push(
            `${rel} : re-export used locally without import: ${reexportUsedLocally.join(', ')}`
        );
    }

    for (const m of text.matchAll(/export const (\w+Methods) = \{([^}]+)\}/gs)) {
        const refs = [...m[2].matchAll(/:\s*(\w+Action)\b/g)].map((x) => x[1]);
        const missing = [...new Set(refs)].filter((name) => !localBindings.has(name));
        if (missing.length) {
            storeBindingBugs.push(`${rel} [${m[1]}] : undefined: ${missing.join(', ')}`);
        }
    }
}
if (storeBindingBugs.length) {
    failed = true;
    console.error(
        '\n[check-react-architecture] FAIL: store action bundles reference undefined bindings (import before use in *Methods / *Actions objects):'
    );
    for (const line of storeBindingBugs) console.error(`  ${line}`);
} else {
    console.log('[check-react-architecture] OK: store action bundle bindings resolve');
}

const hookActionSpreadDebt = walkFiles(join(FEATURES, ''))
    .filter((f) => f.includes('/hooks/') && f.endsWith('.js'))
    .map((f) => relative(ROOT, f).replace(/\\/g, '/'))
    .filter((rel) => {
        const text = readFileSync(join(ROOT, rel), 'utf8');
        return /\.\.\.\s*\w+Actions\b/.test(text);
    });
if (hookActionSpreadDebt.length) {
    failed = true;
    console.error(
        '\n[check-react-architecture] FAIL: feature hooks must expose *Actions as a namespace, not spread (...forumActions):'
    );
    for (const rel of hookActionSpreadDebt) console.error(`  ${rel}`);
} else {
    console.log('[check-react-architecture] OK: hooks expose *Actions namespaces (no spread)');
}

const htmlDebtJs = grepSrc('\\.innerHTML\\s*=', {
    glob: 'features',
    jsOnly: true,
});
if (htmlDebtJs) {
    failed = true;
    console.error('\n[check-react-architecture] FAIL: imperative innerHTML in features/*.js:');
    console.error(htmlDebtJs);
} else {
    console.log('[check-react-architecture] OK: no imperative innerHTML in features/*.js');
}

const htmlDebtJsx = grepSrc('dangerouslySetInnerHTML', {
    glob: 'features',
    jsxOnly: true,
});
const allowedJsxHtml = htmlDebtJsx
    .split('\n')
    .filter(Boolean)
    .filter((line) => !line.includes('ModalShell.jsx') && !line.includes('<ModalHtml'));
if (allowedJsxHtml.length) {
    failed = true;
    console.error('\n[check-react-architecture] FAIL: dangerouslySetInnerHTML in features/*.jsx (use ModalHtml/ChromeEmoji):');
    console.error(allowedJsxHtml.join('\n'));
} else {
    console.log('[check-react-architecture] OK: no raw dangerouslySetInnerHTML in features/*.jsx');
}

/** Jr-friendly UI layers: components + modals (not hooks/, not editor/ exception). */
function isJrUiJsx(rel) {
    const r = rel.replace(/\\/g, '/');
    if (!r.startsWith('src/features/') || !r.endsWith('.jsx')) return false;
    if (r.includes('/hooks/')) return false;
    if (r.includes('/features/editor/')) return false;
    if (r.includes('/components/')) return true;
    if (r.includes('/modals/')) return true;
    return false;
}

/** Known singleton-in-JSX violations — must stay empty. */
const SINGLETON_ALLOWLIST = new Set([]);

function scanJrUiJsxFiles() {
    return walkFiles(FEATURES)
        .filter((f) => f.endsWith('.jsx'))
        .map((f) => relative(ROOT, f).replace(/\\/g, '/'))
        .filter(isJrUiJsx);
}

const jrSingletonPatterns = [
    { name: 'store-singleton', re: /from ['"][^'"]*store-singleton\.js['"]/ },
    { name: 'aiService', re: /\baiService\b/ },
    { name: 'sageVoice singleton', re: /\bsageVoice\b/ },
    { name: 'useXStore() in component', re: /\buse(?:Learning|TreeGraph|IdentityAuth|Arborito)Store\s*\(/ },
    { name: 'wireArboritoSwitch', re: /\bwireArboritoSwitch\b/ },
    { name: 'bindMobileTap', re: /\bbindMobileTap\b/ },
    {
        name: 'forbidden panel-tools import',
        re: /from ['"][^'"]*graph-mobile-tree-panel-tools\.js['"]|from ['"][^'"]*curriculum-switcher-actions\.js['"]/,
    },
];

const jrViolations = [];
for (const rel of scanJrUiJsxFiles()) {
    if (SINGLETON_ALLOWLIST.has(rel)) continue;
    const text = readFileSync(join(ROOT, rel), 'utf8');
    for (const { name, re } of jrSingletonPatterns) {
        if (re.test(text)) {
            jrViolations.push(`${rel} : ${name}`);
            break;
        }
    }
}
if (jrViolations.length) {
    failed = true;
    console.error('\n[check-react-architecture] FAIL: UI layer must use hooks, not singletons (see docs/DEVELOPMENT.md):');
    jrViolations.forEach((v) => console.error(`  ${v}`));
} else {
    console.log('[check-react-architecture] OK: UI layer free of store/aiService/sageVoice singletons');
}

const allowlistedDebt = [...SINGLETON_ALLOWLIST].filter((rel) => existsSync(join(ROOT, rel)));
if (allowlistedDebt.length) {
    console.log(
        `[check-react-architecture] NOTE: ${allowlistedDebt.length} UI file(s) on allowlist:`
    );
    allowlistedDebt.forEach((rel) => console.log(`  · ${rel}`));
}

if (failed) {
    console.error('\n[check-react-architecture] Architecture checks failed : see docs/DEVELOPMENT.md');
    process.exit(1);
}

console.log('\n[check-react-architecture] All checks passed.');
