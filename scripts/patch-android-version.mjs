#!/usr/bin/env node
/**
 * After `cap sync`, pin versionName / versionCode from package.json.
 * Usage: node scripts/patch-android-version.mjs <versionName> <versionCode>
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ANDROID = join(dirname(__dirname), 'android');
const gradle = join(ANDROID, 'app', 'build.gradle');

const versionName = process.argv[2] || '0.0.0';
const versionCode = Number(process.argv[3]) || 1;

if (!existsSync(gradle)) {
    console.log('[patch-android-version] skip (no app/build.gradle)');
    process.exit(0);
}

let s = readFileSync(gradle, 'utf8');
const before = s;
if (/versionCode\s+\d+/.test(s)) {
    s = s.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
} else if (/defaultConfig\s*\{/.test(s)) {
    s = s.replace(/defaultConfig\s*\{/, `defaultConfig {\n        versionCode ${versionCode}`);
}
if (/versionName\s+"[^"]*"/.test(s)) {
    s = s.replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);
} else if (/defaultConfig\s*\{/.test(s)) {
    s = s.replace(/defaultConfig\s*\{/, `defaultConfig {\n        versionName "${versionName}"`);
}

if (s !== before) {
    writeFileSync(gradle, s);
    console.log(`[patch-android-version] versionName=${versionName} versionCode=${versionCode}`);
} else {
    console.log('[patch-android-version] no change');
}
