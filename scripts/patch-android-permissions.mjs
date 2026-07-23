#!/usr/bin/env node
/**
 * After `cap sync`, ensure AndroidManifest declares runtime permissions for
 * QR camera + mic (WebView getUserMedia). Capacitor template only ships INTERNET.
 *
 * Also marks camera/mic hardware as optional so install is not blocked on
 * devices without those sensors.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

const PERMS = [
    'android.permission.CAMERA',
    'android.permission.RECORD_AUDIO',
    'android.permission.MODIFY_AUDIO_SETTINGS',
];

const FEATURES = [
    { name: 'android.hardware.camera', required: false },
    { name: 'android.hardware.camera.autofocus', required: false },
    { name: 'android.hardware.microphone', required: false },
];

if (!existsSync(MANIFEST)) {
    console.log('[patch-android-permissions] AndroidManifest missing : skip');
    process.exit(0);
}

let xml = readFileSync(MANIFEST, 'utf8');
const added = [];

const missingPerms = PERMS.filter((p) => !xml.includes(`android:name="${p}"`));
if (missingPerms.length) {
    const block = missingPerms.map((p) => `    <uses-permission android:name="${p}" />`).join('\n');
    if (/<!--\s*Permissions\s*-->/.test(xml)) {
        xml = xml.replace(/(<!--\s*Permissions\s*-->\s*\n?)/, `$1${block}\n`);
    } else if (/<uses-permission\s/.test(xml)) {
        xml = xml.replace(/(<uses-permission\s)/, `${block}\n    $1`);
    } else if (/<\/manifest>\s*$/.test(xml)) {
        xml = xml.replace(/<\/manifest>\s*$/, `\n${block}\n</manifest>\n`);
    } else {
        console.error('[patch-android-permissions] could not locate permission insertion point');
        process.exit(1);
    }
    added.push(...missingPerms.map((p) => p.split('.').pop()));
}

const missingFeatures = FEATURES.filter((f) => !xml.includes(`android:name="${f.name}"`));
if (missingFeatures.length) {
    const block = missingFeatures
        .map(
            (f) =>
                `    <uses-feature android:name="${f.name}" android:required="${f.required ? 'true' : 'false'}" />`
        )
        .join('\n');
    if (/<uses-permission[\s\S]*?\/>/.test(xml)) {
        // After the last uses-permission block.
        xml = xml.replace(
            /((?:[ \t]*<uses-permission\b[^>]*\/>\s*)+)/,
            (m) => `${m}${block}\n`
        );
    } else if (/<\/manifest>\s*$/.test(xml)) {
        xml = xml.replace(/<\/manifest>\s*$/, `\n${block}\n</manifest>\n`);
    } else {
        console.error('[patch-android-permissions] could not locate feature insertion point');
        process.exit(1);
    }
    added.push(...missingFeatures.map((f) => f.name.split('.').pop()));
}

if (!added.length) {
    console.log('[patch-android-permissions] CAMERA / RECORD_AUDIO already present');
    process.exit(0);
}

writeFileSync(MANIFEST, xml);
console.log(`[patch-android-permissions] added ${added.join(', ')}`);
