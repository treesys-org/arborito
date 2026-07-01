#!/usr/bin/env node
/**
 * Fail when hand-written CSS still carries mobile-selector or theme duplication debt.
 *
 * Anti-patterns detected:
 * 1. Two consecutive rule blocks where selector A is `html.arborito-shell-mobile …`
 *    and selector B is `html.force-mobile …` (same suffix) with identical bodies
 *    — should be merged with `:is(html.arborito-shell-mobile, html.force-mobile)`.
 * 2. `html.arborito-construction-mobile:not(.arborito-desktop)` used outside `:is(`
 *    when the file has no matching `html.force-mobile.arborito-construction-mobile:not(.arborito-desktop)`
 *    variant for the same selector suffix.
 * 3. Consecutive light/dark duplicate blocks: rule N is `X` (or `html:not(.dark) X`) and
 *    rule N+1 is `html.dark X` with the same property keys — should use semantic
 *    `--arborito-theme-*` tokens instead unless the rule carries a `@theme-token` allowlist comment.
 *
 * Allowlist (intentional, not flagged):
 * - Any rule inside `@media … { … }` (pre-JS narrow viewport; distinct from force-mobile on wide screens).
 * - `html.force-mobile-only` overrides that intentionally differ from `@media (max-width: 767px)` twins
 *   (e.g. game-player head-spacer width). Those blocks are not consecutive shell-mobile/force-mobile pairs.
 * - Rules immediately preceded by a block comment containing `@theme-token`.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');
const SKIP_FILES = new Set(['src/shared/styles/main.css']);

const SHELL_RE = /^html\.arborito-shell-mobile(\b|[.:#\[:])/u;
const FORCE_RE = /^html\.force-mobile(\b|[.:#\[:])/u;
const CONSTRUCTION_RE =
    /html\.arborito-construction-mobile:not\(\.arborito-desktop\)/u;
const CONSTRUCTION_FORCE_RE =
    /html\.force-mobile\.arborito-construction-mobile:not\(\.arborito-desktop\)/u;
const DARK_RE = /^html\.dark(\b|[.:#\[:])/u;
const NOT_DARK_RE = /^html:not\(\.dark\)(\b|[.:#\[:])/u;

/** @param {string} rawSelector */
function splitSelectors(rawSelector) {
    /** @type {string[]} */
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < rawSelector.length; i++) {
        const ch = rawSelector[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        else if (ch === ',' && depth === 0) {
            parts.push(rawSelector.slice(start, i).trim());
            start = i + 1;
        }
    }
    parts.push(rawSelector.slice(start).trim());
    return parts.filter(Boolean);
}

/** @param {string} css */
function stripComments(css) {
    return css.replace(/\/\*[\s\S]*?\*\//gu, '');
}

/**
 * @param {string} originalCss
 * @param {number} selStart
 */
function hasThemeTokenAllowlist(originalCss, selStart) {
    const windowStart = Math.max(0, selStart - 400);
    const before = originalCss.slice(windowStart, selStart);
    return /\/\*[\s\S]*?@theme-token[\s\S]*?\*\//u.test(before);
}

/**
 * @param {string} css
 * @param {string} originalCss
 * @returns {{ selectors: string[], body: string, inMedia: boolean, rawSelector: string, allowlisted: boolean }[]}
 */
function parseRuleGroups(css, originalCss) {
    /** @type {{ selectors: string[], body: string, inMedia: boolean, rawSelector: string, allowlisted: boolean }[]} */
    const groups = [];
    /** @type {string[]} */
    const stack = [''];

    let i = 0;
    while (i < css.length) {
        if (css[i] === '@') {
            const atStart = i;
            while (i < css.length && css[i] !== '{') i++;
            if (i >= css.length) break;
            const prelude = css.slice(atStart, i).trim();
            i++;
            stack.push(prelude.startsWith('@media') ? 'media' : 'at');
            continue;
        }
        if (css[i] === '}') {
            stack.pop();
            i++;
            continue;
        }
        if (css[i] === '{') {
            i++;
            continue;
        }

        const selStart = i;
        while (i < css.length && css[i] !== '{') i++;
        if (i >= css.length) break;
        const rawSelector = css.slice(selStart, i).trim();
        i++;
        const bodyStart = i;
        let depth = 1;
        while (i < css.length && depth > 0) {
            if (css[i] === '{') depth++;
            else if (css[i] === '}') depth--;
            if (depth > 0) i++;
        }
        const body = css.slice(bodyStart, i).trim();
        i++;

        if (!rawSelector || rawSelector.startsWith('@')) continue;

        groups.push({
            selectors: splitSelectors(rawSelector),
            rawSelector,
            body,
            inMedia: stack.includes('media'),
            allowlisted: hasThemeTokenAllowlist(originalCss, selStart)
        });
    }
    return groups;
}

/**
 * @param {string} css
 * @param {string} originalCss
 * @returns {{ selector: string, body: string, inMedia: boolean, rawSelector: string, allowlisted: boolean }[]}
 */
function parseRules(css, originalCss) {
    /** @type {{ selector: string, body: string, inMedia: boolean, rawSelector: string, allowlisted: boolean }[]} */
    const rules = [];
    for (const group of parseRuleGroups(css, originalCss)) {
        for (const selector of group.selectors) {
            rules.push({
                selector,
                rawSelector: group.rawSelector,
                body: group.body,
                inMedia: group.inMedia,
                allowlisted: group.allowlisted
            });
        }
    }
    return rules;
}

/** @param {string} selector */
function shellSuffix(selector) {
    if (!SHELL_RE.test(selector)) return null;
    return selector.replace(/^html\.arborito-shell-mobile/u, '').trim();
}

/** @param {string} selector */
function forceSuffix(selector) {
    if (!FORCE_RE.test(selector)) return null;
    return selector.replace(/^html\.force-mobile/u, '').trim();
}

/** @param {string} body */
function normBody(body) {
    return body.replace(/\s+/gu, ' ').trim();
}

/** @param {string} body */
function propertyKeys(body) {
    /** @type {string[]} */
    const keys = [];
    for (const chunk of body.split(';')) {
        const idx = chunk.indexOf(':');
        if (idx <= 0) continue;
        const key = chunk.slice(0, idx).trim();
        if (key) keys.push(key);
    }
    return keys.sort().join('|');
}

/** @param {string} selector */
function stripDarkPrefix(selector) {
    if (DARK_RE.test(selector)) {
        return selector.replace(/^html\.dark/u, '').trim();
    }
    if (NOT_DARK_RE.test(selector)) {
        return selector.replace(/^html:not\(\.dark\)/u, '').trim();
    }
    return null;
}

/** @param {string[]} selectors */
function isLightRuleGroup(selectors) {
    return selectors.every(
        (selector) =>
            !DARK_RE.test(selector) &&
            !selector.startsWith(':root') &&
            !selector.startsWith('html:not(')
    );
}

/** @param {string[]} lightSelectors @param {string[]} darkSelectors */
function lightDarkGroupMatch(lightSelectors, darkSelectors) {
    if (lightSelectors.length !== darkSelectors.length) return false;
    if (!darkSelectors.every((selector) => DARK_RE.test(selector))) return false;

    const allNotDark = lightSelectors.every((selector) => NOT_DARK_RE.test(selector));
    if (allNotDark) {
        return lightSelectors.every(
            (selector, index) =>
                stripDarkPrefix(selector) === stripDarkPrefix(darkSelectors[index])
        );
    }

    if (!isLightRuleGroup(lightSelectors)) return false;
    return lightSelectors.every(
        (selector, index) => darkSelectors[index] === `html.dark ${selector}`
    );
}

/** @param {string} selector */
function constructionSuffix(selector) {
    if (!CONSTRUCTION_RE.test(selector) || selector.includes(':is(')) return null;
    return selector
        .replace(/html\.(?:dark\.)?arborito-construction-mobile:not\(\.arborito-desktop\)/gu, '')
        .trim();
}

/** @param {string} selector */
function toForceConstruction(selector) {
    return selector.replace(
        CONSTRUCTION_RE,
        'html.force-mobile.arborito-construction-mobile:not(.arborito-desktop)'
    );
}

/** @param {string} dir */
async function walkCss(dir) {
    /** @type {string[]} */
    const out = [];
    const entries = await readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
        const full = join(dir, ent.name);
        if (ent.isDirectory()) out.push(...(await walkCss(full)));
        else if (ent.name.endsWith('.css')) out.push(full);
    }
    return out;
}

/** @type {{ file: string, kind: string, detail: string }[]} */
const violations = [];

const files = await walkCss(SRC);
let scanned = 0;

for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    if (SKIP_FILES.has(rel)) continue;
    scanned++;
    const original = await readFile(file, 'utf8');
    const rules = parseRules(stripComments(original), original);
    const groups = parseRuleGroups(stripComments(original), original);

    /** @type {Map<string, string>} suffix → normalized body for force-mobile construction rules */
    const forceConstructionBodies = new Map();
    for (const rule of rules) {
        if (!CONSTRUCTION_FORCE_RE.test(rule.selector)) continue;
        const suffix = constructionSuffix(
            rule.selector.replace(
                /html\.force-mobile\.arborito-construction-mobile:not\(\.arborito-desktop\)/u,
                'html.arborito-construction-mobile:not(.arborito-desktop)'
            )
        );
        if (suffix === null) continue;
        forceConstructionBodies.set(`${suffix}::${normBody(rule.body)}`, rule.selector);
    }

    for (let r = 0; r < rules.length - 1; r++) {
        const a = rules[r];
        const b = rules[r + 1];
        if (a.inMedia || b.inMedia) continue;
        const sufA = shellSuffix(a.selector);
        const sufB = forceSuffix(b.selector);
        if (sufA === null || sufB === null || sufA !== sufB) continue;
        if (normBody(a.body) !== normBody(b.body)) continue;
        violations.push({
            file: rel,
            kind: 'consecutive-shell-force-duplicate',
            detail: `Merge with :is(html.arborito-shell-mobile, html.force-mobile)${sufA || ''}`
        });
    }

    for (let r = 0; r < groups.length - 1; r++) {
        const a = groups[r];
        const b = groups[r + 1];
        if (a.inMedia || b.inMedia) continue;
        if (a.allowlisted || b.allowlisted) continue;
        if (!lightDarkGroupMatch(a.selectors, b.selectors)) continue;
        if (propertyKeys(a.body) !== propertyKeys(b.body)) continue;

        violations.push({
            file: rel,
            kind: 'consecutive-light-dark-duplicate',
            detail: `Use semantic theme tokens instead of light/dark pair starting with \`${a.selectors[0]}\``
        });
    }

    for (const rule of rules) {
        if (rule.inMedia) continue;
        if (!CONSTRUCTION_RE.test(rule.selector)) continue;
        if (rule.rawSelector.includes(':is(')) continue;

        const suffix = constructionSuffix(rule.selector);
        if (suffix === null) continue;

        const forceSelector = toForceConstruction(rule.selector);
        const hasForceTwin =
            rules.some(
                (other) =>
                    !other.inMedia &&
                    (other.selector === forceSelector ||
                        (other.rawSelector.includes(':is(') &&
                            other.rawSelector.includes(forceSelector.split(' ')[0])))
            ) || forceConstructionBodies.has(`${suffix}::${normBody(rule.body)}`);

        if (!hasForceTwin) {
            violations.push({
                file: rel,
                kind: 'construction-mobile-without-force-twin',
                detail: rule.selector.slice(0, 120)
            });
        }
    }
}

if (violations.length) {
    console.error(`[check-css-debt] ${violations.length} issue(s):\n`);
    for (const v of violations) {
        console.error(`  ${v.file} [${v.kind}] ${v.detail}`);
    }
    process.exit(1);
}

console.log(`[check-css-debt] OK — ${scanned} CSS file(s) scanned`);
