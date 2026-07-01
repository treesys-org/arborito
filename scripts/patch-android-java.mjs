#!/usr/bin/env node
/**
 * Capacitor 7 / Android Gradle may target Java 21 while CI or dev machines use JDK 17.
 * Ensures app + root Gradle use a consistent toolchain after `cap sync`.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ANDROID = join(dirname(__dirname), 'android');
const JAVA = '21';

function patchFile(path, mutator) {
    if (!existsSync(path)) return false;
    const before = readFileSync(path, 'utf8');
    const after = mutator(before);
    if (after !== before) {
        writeFileSync(path, after);
        return true;
    }
    return false;
}

if (!existsSync(ANDROID)) {
    console.log('[patch-android-java] android/ missing — skip');
    process.exit(0);
}

let touched = 0;

if (
    patchFile(join(ANDROID, 'variables.gradle'), (s) => {
        if (/compileSdkVersion\s*=/.test(s)) {
            return s.replace(
                /(compileSdkVersion\s*=\s*)\d+/,
                `$1${Math.max(Number(s.match(/compileSdkVersion\s*=\s*(\d+)/)?.[1] || 0), 35)}`
            );
        }
        return s;
    })
) {
    touched += 1;
}

if (
    patchFile(join(ANDROID, 'app', 'build.gradle'), (s) => {
        let out = s;
        if (/compileOptions\s*\{/.test(out)) {
            out = out.replace(
                /sourceCompatibility\s+JavaVersion\.VERSION_\d+/g,
                `sourceCompatibility JavaVersion.VERSION_${JAVA}`
            );
            out = out.replace(
                /targetCompatibility\s+JavaVersion\.VERSION_\d+/g,
                `targetCompatibility JavaVersion.VERSION_${JAVA}`
            );
        } else if (/android\s*\{/.test(out)) {
            out = out.replace(
                /(android\s*\{[\s\S]*?)(\n\s*\})/,
                `$1\n    compileOptions {\n        sourceCompatibility JavaVersion.VERSION_${JAVA}\n        targetCompatibility JavaVersion.VERSION_${JAVA}\n    }$2`
            );
        }
        return out;
    })
) {
    touched += 1;
}

if (
    patchFile(join(ANDROID, 'build.gradle'), (s) => {
        if (/JavaVersion\.VERSION_\d+/.test(s)) {
            return s.replace(/JavaVersion\.VERSION_\d+/g, `JavaVersion.VERSION_${JAVA}`);
        }
        return s;
    })
) {
    touched += 1;
}

console.log(
    touched
        ? `[patch-android-java] aligned Gradle Java toolchain to ${JAVA}`
        : '[patch-android-java] no Gradle patches needed'
);
