#!/usr/bin/env node
/**
 * Guard mobile WebKit trunk / lesson pan-y.
 *
 * preventDefault on touchend (or a non-passive touchend listener that does)
 * poisons the nearest overflow scroller: the next 1–2 finger-drags fail until
 * a later gesture wakes pan-y. See shell-dialog-lifecycle.js + mobile-tap.js.
 *
 * Fails when:
 * 1. src/shared/ui/mobile-tap.js onTouchEnd calls event.preventDefault()
 * 2. shell-dialog post-close guard listens for touchend/pointerup
 * 3. tree-graph / shared/ui register touchend with passive: false
 * 4. trunk CSS drops pan-y !important on hit targets
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = new URL('../../..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

/** @param {string} dir @param {(name: string) => boolean} pred */
async function walk(dir, pred) {
    /** @type {string[]} */
    const out = [];
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const ent of entries) {
        const p = join(dir, ent.name);
        if (ent.isDirectory()) {
            if (ent.name === 'node_modules' || ent.name === 'dist' || ent.name === 'www') continue;
            out.push(...(await walk(p, pred)));
        } else if (pred(ent.name)) {
            out.push(p);
        }
    }
    return out;
}

/**
 * Bodies of every `const name = (…) => { … }` in src (handles nesting).
 * @param {string} src
 * @param {string} name
 */
function arrowFnBodies(src, name) {
    /** @type {string[]} */
    const bodies = [];
    const re = new RegExp(`const ${name}\\s*=\\s*\\([^)]*\\)\\s*=>\\s*\\{`, 'g');
    let m;
    while ((m = re.exec(src))) {
        let i = m.index + m[0].length;
        let depth = 1;
        const start = i;
        while (i < src.length && depth > 0) {
            const ch = src[i++];
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
        }
        bodies.push(src.slice(start, i - 1));
    }
    return bodies;
}

/** @param {string} text @param {RegExp} re */
function lineHits(text, re) {
    /** @type {{ line: number, text: string }[]} */
    const hits = [];
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) hits.push({ line: i + 1, text: lines[i].trim() });
    }
    return hits;
}

/** @type {string[]} */
const errors = [];

const mobileTapPath = join(SRC, 'shared/ui/mobile-tap.js');
const mobileTap = await readFile(mobileTapPath, 'utf8');
{
    const bodies = arrowFnBodies(mobileTap, 'onTouchEnd');
    if (!bodies.length) {
        errors.push(`${relative(ROOT, mobileTapPath)}: expected onTouchEnd handlers`);
    }
    for (const body of bodies) {
        if (/\b(?:e|ev|event)\.preventDefault\s*\(/.test(body)) {
            errors.push(
                `${relative(ROOT, mobileTapPath)}: onTouchEnd must not call preventDefault (WebKit trunk pan poison)`
            );
        }
    }
    if (/addEventListener\(\s*['"]touchend['"][^)]*passive:\s*false/.test(mobileTap)) {
        errors.push(
            `${relative(ROOT, mobileTapPath)}: touchend must be passive:true (never preventDefault)`
        );
    }
}

const shellPath = join(SRC, 'stores/shell-dialog-lifecycle.js');
const shell = await readFile(shellPath, 'utf8');
{
    const start = shell.indexOf('function postClosePointerGuard');
    const end = shell.indexOf('function teardownPostClosePointerGuard');
    const guardBlock = start >= 0 && end > start ? shell.slice(start, end) : '';
    if (!guardBlock) {
        errors.push(`${relative(ROOT, shellPath)}: postClosePointerGuard missing`);
    } else {
        if (
            /addEventListener\(\s*['"]touchend['"]/.test(guardBlock) ||
            /addEventListener\(\s*['"]pointerup['"]/.test(guardBlock)
        ) {
            errors.push(
                `${relative(ROOT, shellPath)}: post-close guard must not listen for touchend/pointerup`
            );
        }
        if (!/type\s*!==\s*['"]click['"]/.test(guardBlock)) {
            errors.push(
                `${relative(ROOT, shellPath)}: postClosePointerGuard must ignore non-click events`
            );
        }
    }
    if (
        /document\.addEventListener\(\s*['"]touchend['"]/.test(shell) ||
        /document\.addEventListener\(\s*['"]pointerup['"]/.test(shell)
    ) {
        errors.push(
            `${relative(ROOT, shellPath)}: must not register document touchend/pointerup listeners`
        );
    }
}

const scanRoots = [join(SRC, 'features/tree-graph'), join(SRC, 'shared/ui')];
const filePred = (name) => /\.(js|jsx|mjs|cjs)$/.test(name);
for (const root of scanRoots) {
    const files = await walk(root, filePred);
    for (const file of files) {
        if (file.endsWith('mobile-tap.js')) continue;
        const text = await readFile(file, 'utf8');
        const oneLine = lineHits(text, /addEventListener\(\s*['"]touchend['"].*passive:\s*false/);
        for (const h of oneLine) {
            errors.push(
                `${relative(ROOT, file)}:${h.line}: touchend passive:false is forbidden in tree-graph/shared ui (WebKit pan poison)`
            );
        }
    }
}

const trunkCss = await readFile(join(SRC, 'features/tree-graph/logic/graph-dom-inline.css'), 'utf8');
if (!/\.mobile-trunk-container[\s\S]{0,800}?touch-action:\s*pan-y\s*!important/.test(trunkCss)) {
    errors.push(
        'src/features/tree-graph/logic/graph-dom-inline.css: .mobile-trunk-container must set touch-action: pan-y !important on hit targets'
    );
}

if (errors.length) {
    console.error('touch-scroll-safety failed:\n');
    for (const e of errors) console.error(`  ✖ ${e}`);
    console.error(
        '\nDo not preventDefault on touchend over scroll surfaces. Suppress ghost clicks via click guards only.\n'
    );
    process.exit(1);
}

console.log('touch-scroll-safety: ok');
