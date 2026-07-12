import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { VENDOR_IMPORT_ALIASES } from '../vendor-import-aliases.mjs';

const STORE_GRAPH_ENTRY = 'src/stores/attach-action-bundles.js';

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

function walkFiles(dir) {
    /** @type {string[]} */
    const out = [];
    for (const ent of readdirSync(dir)) {
        const full = join(dir, ent);
        if (statSync(full).isDirectory()) out.push(...walkFiles(full));
        else if (ent.endsWith('.js') || ent.endsWith('.mjs')) out.push(full);
    }
    return out;
}

/**
 * Static: every *Methods object references imported *Action symbols.
 * @param {string} root
 * @returns {string[]}
 */
export function verifyStaticStoreBundleBindings(root) {
    const storesDir = join(root, 'src/stores');
    const bugs = [];

    for (const file of walkFiles(storesDir).filter((f) => f.endsWith('.js'))) {
        const rel = relative(root, file).replace(/\\/g, '/');
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
            bugs.push(`${rel} — re-export used locally without import: ${reexportUsedLocally.join(', ')}`);
        }

        for (const m of text.matchAll(/export const (\w+Methods) = \{([^}]+)\}/gs)) {
            const refs = [...m[2].matchAll(/:\s*(\w+Action)\b/g)].map((x) => x[1]);
            const missing = [...new Set(refs)].filter((name) => !localBindings.has(name));
            if (missing.length) {
                bugs.push(`${rel} [${m[1]}] — undefined: ${missing.join(', ')}`);
            }
        }
    }

    return bugs;
}

function resolveRelativeImport(fromRel, specifier, root) {
    if (specifier.startsWith('node:')) return null;
    if (!specifier.startsWith('.')) {
        if (VENDOR_IMPORT_ALIASES[specifier]) return VENDOR_IMPORT_ALIASES[specifier];
        return null;
    }

    const fromAbs = join(root, fromRel);
    let target = normalize(join(dirname(fromAbs), specifier));
    if (!target.endsWith('.js') && !target.endsWith('.mjs')) {
        if (existsSync(`${target}.js`)) target = `${target}.js`;
        else if (existsSync(join(target, 'index.js'))) target = join(target, 'index.js');
        else return null;
    }
    if (!existsSync(target)) return null;
    return relative(root, target).replace(/\\/g, '/');
}

function isStoreBundleGraphFile(rel) {
    const r = rel.replace(/\\/g, '/');
    if (r.endsWith('.jsx')) return false;
    if (r === 'src/app/components/eager-modals.js') return false;
    if (r.includes('/features/')) return r.includes('/api/');
    return (
        r.startsWith('src/stores/') ||
        r.startsWith('src/core/') ||
        r.startsWith('src/shared/') ||
        r.startsWith('src/app/') ||
        r.startsWith('vendor/')
    );
}

function staticImports(text) {
    const specs = [];
    for (const m of text.matchAll(/^\s*import\s+[^'";]+?\sfrom\s+['"]([^'"]+)['"]/gm)) {
        specs.push(m[1]);
    }
    for (const m of text.matchAll(/^\s*export\s+[^'";]+?\sfrom\s+['"]([^'"]+)['"]/gm)) {
        specs.push(m[1]);
    }
    return specs;
}

/**
 * Static: store bundle import graph must not statically reach .jsx (Node CI cannot load React).
 * @param {string} root
 * @returns {string[]}
 */
export function verifyStoreBundleGraphHasNoJsx(root) {
    const violations = [];
    const queue = [STORE_GRAPH_ENTRY];
    const seen = new Set();

    while (queue.length) {
        const rel = queue.shift();
        if (!rel || seen.has(rel)) continue;
        seen.add(rel);

        if (rel.endsWith('.jsx')) {
            violations.push(rel);
            continue;
        }
        if (!existsSync(join(root, rel))) continue;

        const text = readFileSync(join(root, rel), 'utf8');
        for (const spec of staticImports(text)) {
            if (spec.endsWith('.jsx')) {
                violations.push(`${rel} → ${spec}`);
                continue;
            }
            const next = resolveRelativeImport(rel, spec, root);
            if (!next || seen.has(next)) continue;
            if (isStoreBundleGraphFile(next)) queue.push(next);
        }
    }

    return violations;
}
