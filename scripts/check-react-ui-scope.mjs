#!/usr/bin/env node
/**
 * Static checks for React architecture footguns — no browser required.
 *
 * Catches:
 * - Components using `ui.` without `ui` in scope
 * - Components using `state.` without `state` in scope
 * - Feature hooks eagerly touching lazy store services (webtorrent, forumStore, …)
 *
 * Run: node scripts/check-react-ui-scope.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

const UI_DOT = /(?<![.\w])ui\./;
const STATE_DOT = /(?<![.\w])state\./;
const LAZY_STORE_PROPS = ['webtorrent', 'forumStore', 'sourceManager', 'graphLogic'];
const HOOK_UI_PATTERN = /const\s*\{[^}]*\bui\b[^}]*\}\s*=\s*\w+/;
const HOOK_STORE_PATTERN = /const\s*\{[^}]*\bstore\b[^}]*\}\s*=\s*\w+/;

function stripStrings(code) {
    return code
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
        .replace(/'([^'\\]|\\.)*'/g, "''")
        .replace(/"([^"\\]|\\.)*"/g, '""')
        .replace(/`([^`\\]|\\.)*`/g, '``');
}

function walkFiles(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
            if (name === 'node_modules') continue;
            walkFiles(p, out);
        } else if (p.endsWith('.jsx') || p.endsWith('.js')) {
            out.push(p);
        }
    }
    return out;
}

function paramListHas(params, name) {
    return params.split(',').some((part) => {
        const t = part.trim();
        if (!t) return false;
        if (t === name) return true;
        if (t.startsWith(`${name} `) || t.startsWith(`${name}=`)) return true;
        if (t.startsWith(`${name}:`)) return true;
        if (t.startsWith('{') && new RegExp(`\\b${name}\\b`).test(t)) return true;
        return false;
    });
}

function hasStateBinding(fn) {
    if (paramListHas(fn.params, 'state')) return true;
    if (/const\s+state\s*=/.test(fn.body)) return true;
    if (/const\s*\[\s*state\b/.test(fn.body)) return true;
    if (/const\s*\{[^}]*\bstate\b[^}]*\}\s*=/.test(fn.body)) return true;
    return false;
}

function hasUiBinding(fn) {
    if (paramListHas(fn.params, 'ui')) return true;
    if (HOOK_UI_PATTERN.test(fn.body)) return true;
    if (/const\s+ui\s*=/.test(fn.body)) return true;
    if (/\bui\s*=\s*\w+\.ui\b/.test(fn.body)) return true;
    return false;
}

function hasStoreBinding(fn) {
    if (paramListHas(fn.params, 'store')) return true;
    if (HOOK_STORE_PATTERN.test(fn.body)) return true;
    if (/getArboritoStore\s*\(/.test(fn.body)) return true;
    if (/const\s+store\s*=/.test(fn.body)) return true;
    return false;
}

/** @returns {{ name: string, params: string, body: string, startLine: number }[]} */
function extractFunctions(source) {
    const fns = [];
    const re = /(?:^|\n)(export\s+)?function\s+(\w+)\s*\(/g;
    let m;
    while ((m = re.exec(source)) !== null) {
        const name = m[2];
        const openParen = m.index + m[0].length - 1;
        let i = openParen;
        let depth = 0;
        while (i < source.length) {
            const ch = source[i];
            if (ch === '(') depth++;
            else if (ch === ')') {
                depth--;
                if (depth === 0) break;
            }
            i++;
        }
        const params = source.slice(openParen + 1, i);
        while (i < source.length && source[i] !== '{') i++;
        if (source[i] !== '{') continue;
        const bodyStart = i;
        depth = 0;
        while (i < source.length) {
            const ch = source[i];
            if (ch === '{') depth++;
            else if (ch === '}') {
                depth--;
                if (depth === 0) {
                    const body = source.slice(bodyStart + 1, i);
                    const startLine = source.slice(0, m.index).split('\n').length;
                    fns.push({ name, params, body, startLine });
                    break;
                }
            }
            i++;
        }
    }
    return fns;
}

function hasSliceBinding(fn, name) {
    if (paramListHas(fn.params, name)) return true;
    if (new RegExp(`const\\s*\\{[^}]*\\b${name}\\b`).test(fn.body)) return true;
    if (new RegExp(`const\\s+${name}\\s*=`).test(fn.body)) return true;
    if (new RegExp(`\\b\\w+\\.${name}\\b`).test(fn.body)) return true;
    if (name === 'constructionMode' && /\bisConstruct\b/.test(fn.body)) return true;
    return false;
}

function usesBareSliceId(body, name) {
    const re = new RegExp(`(?<![.\\w])${name}\\b`, 'g');
    let m;
    while ((m = re.exec(body)) !== null) {
        const after = body.slice(m.index + name.length);
        if (/^\s*:/.test(after)) continue;
        if (/^\s*=\{/.test(after)) continue;
        if (/^\s*[,)]/.test(after)) continue;
        return true;
    }
    return false;
}

const SLICE_IDS = ['graphUi', 'constructionMode', 'findNode', 'userStore', 'rawGraphData', 'activeSource'];
const APP_ACTIONS = ['setModal', 'dismissModal', 'loadData', 'notify', 'confirm', 'toggleConstructionMode', 'setViewMode'];

function hasActionBinding(fn, name) {
    if (paramListHas(fn.params, name)) return true;
    if (new RegExp(`const\\s*\\{[^}]*\\b${name}\\b`).test(fn.body)) return true;
    if (new RegExp(`const\\s+${name}\\s*=`).test(fn.body)) return true;
    if (new RegExp(`\\b\\w+\\.${name}\\b`).test(fn.body)) return true;
    return false;
}

function usesBareActionCall(body, name) {
    return new RegExp(`(?<![.\\w])${name}\\s*\\(`).test(body);
}

function usesBareStoreRef(body) {
    const re = /(?<![.\w])store\b/g;
    let m;
    while ((m = re.exec(body)) !== null) {
        const after = body.slice(m.index + 5);
        if (/^\s*\./.test(after)) continue;
        if (/^\s*:/.test(after)) continue;
        if (/^\s*=\{/.test(after)) continue;
        if (/^\s*[,)]/.test(after)) continue;
        return true;
    }
    return false;
}

let failed = false;
const errors = [];

for (const file of walkFiles(SRC)) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    if (!rel.endsWith('.jsx')) continue;
    const source = readFileSync(file, 'utf8');
    for (const fn of extractFunctions(source)) {
        const body = stripStrings(fn.body);
        if (!UI_DOT.test(body)) continue;
        if (hasUiBinding(fn)) continue;
        const idx = body.search(UI_DOT);
        errors.push(
            `${rel}:${lineOf(fn.body, idx, fn.startLine)}: ${fn.name}() uses ui.* without ui in scope (add useX() hook or ui prop)`
        );
        failed = true;
    }

    for (const fn of extractFunctions(source)) {
        const body = stripStrings(fn.body);
        if (!usesBareSliceId(body, 'state')) continue;
        if (hasStateBinding(fn)) continue;
        const idx = body.search(/(?<![.\w])state\b/);
        errors.push(
            `${rel}:${lineOf(fn.body, idx, fn.startLine)}: ${fn.name}() uses state without binding (add const state = useX() or destructure state prop)`
        );
        failed = true;
    }

    for (const fn of extractFunctions(source)) {
        const body = stripStrings(fn.body);
        if (!STATE_DOT.test(body)) continue;
        if (hasStateBinding(fn)) continue;
        const idx = body.search(STATE_DOT);
        errors.push(
            `${rel}:${lineOf(fn.body, idx, fn.startLine)}: ${fn.name}() uses state.* without state in scope (add useTreeGraph() / useApp() or alias const state = tree)`
        );
        failed = true;
    }

    for (const fn of extractFunctions(source)) {
        if (!/\bstore\./.test(fn.params)) continue;
        if (/=\s*store\./.test(fn.params)) {
            errors.push(
                `${rel}:${fn.startLine}: ${fn.name}() default param uses store.* before hooks (move into function body)`
            );
            failed = true;
        }
    }

    for (const fn of extractFunctions(source)) {
        const body = stripStrings(fn.body);
        for (const id of SLICE_IDS) {
            if (!usesBareSliceId(body, id)) continue;
            if (hasSliceBinding(fn, id)) continue;
            const idx = body.search(new RegExp(`(?<![.\\w])${id}\\b`));
            errors.push(
                `${rel}:${lineOf(fn.body, idx, fn.startLine)}: ${fn.name}() uses ${id} without hook/prop (add useTreeGraph() or pass as prop)`
            );
            failed = true;
        }
    }

    for (const fn of extractFunctions(source)) {
        const body = stripStrings(fn.body);
        for (const action of APP_ACTIONS) {
            if (!usesBareActionCall(body, action)) continue;
            if (hasActionBinding(fn, action)) continue;
            const idx = body.search(new RegExp(`(?<![.\\w])${action}\\s*\\(`));
            errors.push(
                `${rel}:${lineOf(fn.body, idx, fn.startLine)}: ${fn.name}() calls ${action}() without hook (destructure from useX())`
            );
            failed = true;
        }
    }

    for (const fn of extractFunctions(source)) {
        const body = stripStrings(fn.body);
        if (!usesBareStoreRef(body)) continue;
        if (hasStoreBinding(fn)) continue;
        if (/this\.store\b/.test(fn.body)) continue;
        const idx = body.search(/(?<![.\w])store\b/);
        errors.push(
            `${rel}:${lineOf(fn.body, idx, fn.startLine)}: ${fn.name}() uses store without binding (destructure from useX() or pass as prop)`
        );
        failed = true;
    }

    for (const fn of extractFunctions(source)) {
        if (!/\bstore\./.test(fn.body)) continue;
        if (hasStoreBinding(fn)) continue;
        if (/this\.store\./.test(fn.body)) continue;
        const idx = fn.body.search(/\bstore\./);
        errors.push(
            `${rel}:${lineOf(fn.body, idx, fn.startLine)}: ${fn.name}() uses store.* without store in scope`
        );
        failed = true;
    }
}

for (const file of walkFiles(join(SRC, 'features'))) {
    if (!file.includes('/hooks/')) continue;
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    const text = readFileSync(file, 'utf8');
    text.split('\n').forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//')) return;
        for (const prop of LAZY_STORE_PROPS) {
            const eager = new RegExp(`\\bstore\\.${prop}\\b`);
            if (eager.test(line) && !line.includes('?.') && !line.includes('getArboritoStore()?.')) {
                errors.push(
                    `${rel}:${i + 1}: hook eagerly accesses store.${prop} (lazy — use callback or remove from return)`
                );
                failed = true;
            }
        }
    });
}

if (failed) {
    console.error('[check-react-ui-scope] FAIL — fix before manual browser testing:\n');
    for (const e of errors) console.error(`  ${e}`);
    console.error(`\n[check-react-ui-scope] ${errors.length} issue(s). Run: npm run check:react-ui-scope`);
    process.exit(1);
}

console.log('[check-react-ui-scope] OK: no unbound ui/store in components, no eager lazy hooks');
