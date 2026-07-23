#!/usr/bin/env node
/**
 * Fail when feature modals violate MODAL_STANDARDS hard rules (docs/MODAL_STANDARDS.md §2).
 *
 * Scans src/features modals (*.js, *.jsx under modals/) for:
 * - fixed inset-0 (hand-built backdrop)
 * - shadow-2xl (duplicate modal shadow)
 * - <div class="animate-spin (hand-rolled spinner)
 * - panelClass with max-w-* (width must use panelSize)
 *
 * Scans all src/features JS/JSX for raw CTA color contracts.
 *
 * Allowlist: documented §4 exceptions (see ALLOWLIST_SUFFIXES).
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = new URL('../../..', import.meta.url).pathname;
const FEATURES = join(ROOT, 'src/features');

/** Paths ending with these suffixes skip fixed-inset / shadow-2xl rules (MODAL_STANDARDS §4). */
const ALLOWLIST_SUFFIXES = [
    'learning/components/Content.jsx',
];

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
    if (!rule.allowlist) return false;
    return ALLOWLIST_SUFFIXES.some((suffix) => relPath.endsWith(suffix));
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

await Promise.all([
    ...modalSources.map((file) => scanFile(file, [...MODAL_RULES, ...CTA_COLOR_RULES])),
    ...allFeatureSources
        .filter((f) => !f.includes('/modals/'))
        .map((file) => scanFile(file, CTA_COLOR_RULES)),
]);

if (violations.length) {
    console.error(`[check-modal-compliance] ${violations.length} violation(s):\n`);
    for (const v of violations) {
        console.error(`  ${v.file}:${v.line} [${v.kind}] ${v.detail}`);
        console.error(`    ${v.excerpt}`);
    }
    process.exit(1);
}

console.log(
    `[check-modal-compliance] OK : ${modalSources.length} modal file(s), ${allFeatureSources.length} feature source file(s) scanned`
);
