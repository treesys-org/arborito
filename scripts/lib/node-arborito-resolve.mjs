/**
 * Node ESM resolver hook — maps @noble/* and @scure/base to vendored deps
 * (same contract as index.html import map / Vite aliases).
 */
import { pathToFileURL } from 'node:url';
import { resolve as pathResolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VENDOR_IMPORT_ALIASES } from '../vendor-import-aliases.mjs';

const ROOT = pathResolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const ALIAS_URLS = Object.fromEntries(
    Object.entries(VENDOR_IMPORT_ALIASES).map(([specifier, rel]) => [
        specifier,
        pathToFileURL(pathResolve(ROOT, rel)).href,
    ])
);

/** @param {string} specifier @param {import('node:module').ResolveHookContext} context @param {import('node:module').ResolveHook} nextResolve */
export async function resolve(specifier, context, nextResolve) {
    const mapped = ALIAS_URLS[specifier];
    if (mapped) {
        return { url: mapped, shortCircuit: true };
    }
    return nextResolve(specifier, context);
}
