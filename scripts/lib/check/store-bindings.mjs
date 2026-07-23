#!/usr/bin/env node
/**
 * Load-time smoke: every Store.prototype bundle must bind real functions.
 */
import { register } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    verifyStaticStoreBundleBindings,
    verifyStoreBundleGraphHasNoJsx,
} from '../verify-store-bundle-bindings.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const staticBugs = verifyStaticStoreBundleBindings(ROOT);
if (staticBugs.length) {
    console.error('[check-store-bindings] FAIL: static bundle binding errors:');
    for (const line of staticBugs) console.error(`  ${line}`);
    process.exit(1);
}

const jsxLeaks = verifyStoreBundleGraphHasNoJsx(ROOT);
if (jsxLeaks.length) {
    console.error('[check-store-bindings] FAIL: store bundle graph reaches .jsx (breaks Node CI):');
    for (const line of jsxLeaks) console.error(`  ${line}`);
    process.exit(1);
}

register('../node-arborito-resolve.mjs', import.meta.url);

const { allStoreActionBundles } = await import('../../../src/stores/attach-action-bundles.js');

let failed = false;

for (const bundle of allStoreActionBundles) {
    for (const [key, fn] of Object.entries(bundle)) {
        if (typeof fn !== 'function') {
            console.error(`[check-store-bindings] FAIL: ${key} is ${String(fn)} (expected function)`);
            failed = true;
        }
    }
}

if (failed) {
    console.error('\n[check-store-bindings] Store bundles have undefined bindings : fix imports in *-store-actions.js');
    process.exit(1);
}

console.log(
    `[check-store-bindings] OK: ${allStoreActionBundles.length} bundles, static graph clean, all methods are functions`
);
