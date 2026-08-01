#!/usr/bin/env node
/**
 * Fail when feature modals violate MODAL_STANDARDS hard rules (docs/MODAL_STANDARDS.md §2 + §8b + §8c).
 *
 * Scans src/features modals (*.js, *.jsx under modals/) for:
 * - fixed inset-0 (hand-built backdrop)
 * - shadow-2xl (duplicate modal shadow)
 * - <div class="animate-spin (hand-rolled spinner)
 * - panelClass with max-w-* (width must use panelSize)
 * - Unicode ← / ‹ as back controls (use ModalBackChevronIcon / arborito-mmenu-back)
 * - Cancel/confirm CTAs without footer chrome (ModalBinaryFooter / arborito-modal-footer / footer=)
 * - Shell + binary CTAs without shell `footer=` slot (piso / consolidation)
 *
 * Scans all src/features JS/JSX for raw CTA color contracts.
 *
 * Also verifies the mobile Back ghost-click consolidation contract (§8c) on canonical files.
 *
 * Allowlist: documented §4 / §8b exceptions (see ALLOWLIST_*).
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = new URL('../../..', import.meta.url).pathname;
const FEATURES = join(ROOT, 'src/features');

/** Paths ending with these suffixes skip fixed-inset / shadow-2xl rules (MODAL_STANDARDS §4). */
const ALLOWLIST_SUFFIXES = [
    'learning/components/Content.jsx',
];

/**
 * File-level consolidation exceptions (MODAL_STANDARDS §8b).
 * Keys: rule kind → path suffixes.
 */
const CONSOLIDATION_ALLOWLIST = {
    /** Diff lines show “after ← before”; not a back control. */
    'unicode-back-nav': ['editor/modals/ConstructionHistoryModal.jsx'],
};

const CTA_TONES = '(emerald|blue|amber|rose|purple|green|red|sky|indigo)';
const CALLOUT_TONES = '(amber|red|blue|green|emerald|sky|purple)';

const CLASS_ATTR = String.raw`(?:class|className)`;

const MODAL_RULES = [
    {
        kind: 'fixed-inset-0',
        re: new RegExp(`${CLASS_ATTR}="[^"]*\\bfixed\\s+inset-0\\b`),
        detail: 'Hand-built backdrop : use ModalShell / ModalCenteredShell / DockModalShell',
        allowlist: true,
    },
    {
        kind: 'shadow-2xl',
        re: /\bshadow-2xl\b/,
        detail: 'Duplicate modal shadow : use ModalShell / arborito-float-modal-card',
        allowlist: true,
    },
    {
        kind: 'div-animate-spin',
        re: /<(?:div|span)\s+class(?:Name)?="[^"]*\banimate-spin\b/,
        detail: 'Hand-rolled spinner : use LoadingBrand / LoadingRow',
    },
    {
        kind: 'panelClass-max-w',
        re: /panelClass\s*:\s*['"][^'"]*\bmax-w-/,
        detail: 'panelClass max-w-* forbidden : use panelSize',
    },
    {
        kind: 'callout-tailwind-soup',
        re: new RegExp(
            `\\bbg-${CALLOUT_TONES}-50(?:/[\\d.]+)?\\b[^"'\\n]*\\bdark:bg-`
        ),
        detail: 'Hand-built callout colors : use Callout',
    },
    {
        kind: 'unicode-back-nav',
        re: /(?:^\s*←\s*$|>\s*←\s*<|['"`]←['"`]|←\s*\{[A-Za-z_$]|>\s*‹\s*<|['"`]‹['"`])/,
        detail:
            'Unicode back glyph : use ModalBackChevronIcon / arborito-mmenu-back (modal consolidation)',
        consolidationAllowlist: true,
    },
];

const CTA_COLOR_RULES = [
    {
        kind: 'bg-600',
        re: new RegExp(`\\bbg-${CTA_TONES}-600\\b`),
        detail: 'Raw CTA colors : use arborito-cta-{tone}',
    },
    {
        kind: 'border-bg-600-pair',
        re: new RegExp(
            `\\bborder-${CTA_TONES}-600\\b[^"'\\n]*\\bbg-${CTA_TONES}-600\\b|\\bbg-${CTA_TONES}-600\\b[^"'\\n]*\\bborder-${CTA_TONES}-600\\b`
        ),
        detail: 'Raw CTA border/bg pair : use arborito-cta-{tone}',
    },
    {
        kind: 'cta-600-500',
        re: new RegExp(`\\bbg-${CTA_TONES}-600\\s+hover:bg-\\1-500\\b`),
        detail: 'Raw CTA colors : use arborito-cta-{tone}',
    },
];

function isAllowlisted(relPath, rule) {
    if (rule.allowlist) {
        return ALLOWLIST_SUFFIXES.some((suffix) => relPath.endsWith(suffix));
    }
    if (rule.consolidationAllowlist) {
        const list = CONSOLIDATION_ALLOWLIST[rule.kind] || [];
        return list.some((suffix) => relPath.endsWith(suffix));
    }
    return false;
}

function isConsolidationAllowlisted(relPath, kind) {
    const list = CONSOLIDATION_ALLOWLIST[kind] || [];
    return list.some((suffix) => relPath.endsWith(suffix));
}

/** @param {string} dir */
async function walkSources(dir) {
    /** @type {string[]} */
    const out = [];
    const entries = await readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
        const full = join(dir, ent.name);
        if (ent.isDirectory()) out.push(...(await walkSources(full)));
        else if (ent.name.endsWith('.js') || ent.name.endsWith('.jsx')) out.push(full);
    }
    return out;
}

/** @type {{ file: string, kind: string, detail: string, line: number, excerpt: string }[]} */
const violations = [];

const allFeatureSources = await walkSources(FEATURES);
const modalSources = allFeatureSources.filter((f) => f.includes('/modals/'));
const modalJsxSources = modalSources.filter((f) => f.endsWith('.jsx'));

function scanFile(file, rules) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    const raw = readFile(file, 'utf8');
    return raw.then((content) => {
        const stripped = content
            .replace(/\/\*[\s\S]*?\*\//gu, '')
            .replace(/\/\/[^\n]*/gu, '');
        const lines = stripped.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            for (const rule of rules) {
                if (!rule.re.test(line)) continue;
                if (isAllowlisted(rel, rule)) continue;
                violations.push({
                    file: rel,
                    kind: rule.kind,
                    detail: rule.detail,
                    line: i + 1,
                    excerpt: content.split('\n')[i]?.trim().slice(0, 120) || line.slice(0, 120),
                });
            }
        }
    });
}

/**
 * File-level consolidation: binary CTAs must live in shared footer chrome / shell footer slot.
 * @param {string} file
 */
async function scanModalConsolidation(file) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    const content = await readFile(file, 'utf8');
    const hasBinaryCancel = /\bMODAL_CTA_CANCEL\b/.test(content);
    const hasFooterChrome =
        /\bModalBinaryFooter\b/.test(content) || /arborito-modal-footer/.test(content);
    const hasFooterProp = /\bfooter\s*=/.test(content);
    const hasShell = /\b(DockModalShell|ModalCenteredShell|DockHubShell)\b/.test(content);

    if (
        hasBinaryCancel &&
        !hasFooterChrome &&
        !isConsolidationAllowlisted(rel, 'cta-without-footer-chrome')
    ) {
        violations.push({
            file: rel,
            kind: 'cta-without-footer-chrome',
            detail:
                'MODAL_CTA_CANCEL without ModalBinaryFooter / arborito-modal-footer (modal consolidation / piso)',
            line: 0,
            excerpt: 'file uses MODAL_CTA_CANCEL without shared footer chrome',
        });
    }

    if (
        hasShell &&
        hasBinaryCancel &&
        hasFooterChrome &&
        !hasFooterProp &&
        !isConsolidationAllowlisted(rel, 'shell-without-footer-slot')
    ) {
        violations.push({
            file: rel,
            kind: 'shell-without-footer-slot',
            detail:
                'Shell + Cancel CTA must pass footer={…} (sticky piso). Do not leave confirm actions only in the scroll body.',
            line: 0,
            excerpt: 'DockModalShell / ModalCenteredShell / DockHubShell missing footer= prop',
        });
    }
}

/**
 * MODAL_STANDARDS §8c — mobile Back ghost click consolidation (canonical files only).
 * Keeps every sheet reinforced via the shared guard instead of per-modal forks.
 */
async function scanGhostClickConsolidation() {
    const checks = [
        {
            rel: 'src/stores/shell-dialog-lifecycle.js',
            tests: [
                {
                    re: /POST_CLOSE_GUARD_EVENTS\s*=\s*\[[^\]]*click[^\]]*mousedown[^\]]*mouseup[^\]]*\]/,
                    kind: 'ghost-guard-mouse-events',
                    detail:
                        'armPostClosePointerGuard must swallow click + mousedown + mouseup (ghost press / hundimiento)',
                    excerpt: 'POST_CLOSE_GUARD_EVENTS missing click/mousedown/mouseup',
                },
                {
                    re: /arborito-post-close-guard/,
                    kind: 'ghost-guard-html-class',
                    detail: 'armPostClosePointerGuard must toggle html.arborito-post-close-guard',
                    excerpt: 'POST_CLOSE_GUARD_CLASS / arborito-post-close-guard missing',
                },
                {
                    re: /Do NOT intercept touchend\/pointerup/,
                    kind: 'ghost-guard-no-touch-block',
                    detail:
                        'Comment/contract must still forbid preventDefault on touchend/pointerup (trunk pan)',
                    excerpt: 'expected touchend/pointerup warning in ghost-click guard docs',
                },
            ],
        },
        {
            rel: 'src/shared/ui/mobile-tree-shell-class.js',
            tests: [
                {
                    re: /armPostClosePointerGuard\s*\(\s*550\s*\)/,
                    kind: 'ghost-guard-chrome-sync',
                    detail:
                        'syncMobileTreeShellClass must auto-arm armPostClosePointerGuard(550) on chrome reveal (modal consolidation §8c)',
                    excerpt: 'mobile-tree-shell-class missing auto armPostClosePointerGuard',
                },
                {
                    re: /_ghostChromeArmPrimed[\s\S]*moreJustClosed[\s\S]*arborito-construction-more-open|_ghostChromeArmPrimed[\s\S]*arborito-construction-more-open[\s\S]*moreJustClosed/,
                    kind: 'ghost-guard-chrome-transitions',
                    detail:
                        'syncMobileTreeShellClass must prime boot + detect More/construction-more closes for ghost-click guard',
                    excerpt: 'missing primed/moreJustClosed/construction-more-open ghost-arm logic',
                },
            ],
        },
        {
            rel: 'src/shared/ui/dock-sheet-chrome.js',
            tests: [
                {
                    re: /function syncPanelSheetFullbleedClass[\s\S]*armPostClosePointerGuard\s*\(\s*550\s*\)/,
                    kind: 'ghost-guard-fullbleed-sync',
                    detail:
                        'syncPanelSheetFullbleedClass must arm guard when closing Mochila/Cambiar (§8c)',
                    excerpt: 'dock-sheet-chrome missing arm on fullbleed close',
                },
            ],
        },
        {
            rel: 'src/stores/shell-modal-lifecycle.js',
            tests: [
                {
                    re: /armPostClosePointerGuard\s*\(\s*550\s*\)/,
                    kind: 'ghost-guard-dismiss',
                    detail: 'dismissModalOnStore / setModal(null) must arm armPostClosePointerGuard(550)',
                    excerpt: 'shell-modal-lifecycle missing armPostClosePointerGuard(550)',
                },
            ],
        },
        {
            rel: 'src/app/components/ModalHero.jsx',
            tests: [
                {
                    re: /function ModalBackButton[\s\S]*?onClick=\{undefined\}/,
                    kind: 'ghost-back-onclick-undefined',
                    detail:
                        'ModalBackButton mobile must use onClick={undefined} (tap wire only; modal consolidation)',
                    excerpt: 'ModalBackButton missing onClick={undefined}',
                },
            ],
        },
        {
            rel: 'src/features/shell-chrome/styles/dock-versions-curriculum.css',
            tests: [
                {
                    re: /html\.arborito-post-close-guard[\s\S]*?pointer-events:\s*none/,
                    kind: 'ghost-guard-css-pointer',
                    detail:
                        'html.arborito-post-close-guard must disable pointer-events on top-actions/dock chrome',
                    excerpt: 'post-close-guard CSS pointer-events rule missing',
                },
                {
                    re: /html\.arborito-post-close-guard[\s\S]*?:active[\s\S]*?transform:\s*none/,
                    kind: 'ghost-guard-css-active',
                    detail:
                        'html.arborito-post-close-guard must neutralize :active scale (hundimiento)',
                    excerpt: 'post-close-guard CSS :active transform:none missing',
                },
            ],
        },
    ];

    for (const { rel, tests } of checks) {
        const file = join(ROOT, rel);
        let content = '';
        try {
            content = await readFile(file, 'utf8');
        } catch {
            violations.push({
                file: rel,
                kind: 'ghost-guard-missing-file',
                detail: `Canonical §8c file missing: ${rel}`,
                line: 0,
                excerpt: 'file not found',
            });
            continue;
        }
        for (const test of tests) {
            if (test.re.test(content)) continue;
            violations.push({
                file: rel,
                kind: test.kind,
                detail: test.detail,
                line: 0,
                excerpt: test.excerpt,
            });
        }
    }
}

await Promise.all([
    ...modalSources.map((file) => scanFile(file, [...MODAL_RULES, ...CTA_COLOR_RULES])),
    ...allFeatureSources
        .filter((f) => !f.includes('/modals/'))
        .map((file) => scanFile(file, CTA_COLOR_RULES)),
    ...modalJsxSources.map((file) => scanModalConsolidation(file)),
    scanGhostClickConsolidation(),
]);

if (violations.length) {
    console.error(`[check-modal-compliance] ${violations.length} violation(s):\n`);
    for (const v of violations) {
        const loc = v.line ? `${v.file}:${v.line}` : v.file;
        console.error(`  ${loc} [${v.kind}] ${v.detail}`);
        console.error(`    ${v.excerpt}`);
    }
    process.exit(1);
}

console.log(
    `[check-modal-compliance] OK : ${modalSources.length} modal file(s), ${allFeatureSources.length} feature source file(s) scanned (incl. consolidation / piso / ghost-click §8c)`
);
