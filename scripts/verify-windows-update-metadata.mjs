#!/usr/bin/env node
/**
 * Ensure electron-updater metadata names match files on disk (and thus GitHub).
 * Default NSIS names with spaces become dots on GitHub but hyphens in latest.yml → 404.
 */
import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve(process.argv[2] || 'dist');
const ymlPath = path.join(distDir, 'latest.yml');

if (!fs.existsSync(ymlPath)) {
  console.error(`Missing ${ymlPath}`);
  process.exit(1);
}

const yml = fs.readFileSync(ymlPath, 'utf8');
const names = new Set();
for (const m of yml.matchAll(/^(?:path| {2}- url):\s*(.+)\s*$/gm)) {
  const name = String(m[1] || '').trim();
  if (name) names.add(name);
}

if (!names.size) {
  console.error('latest.yml has no path/url entries');
  process.exit(1);
}

let failed = false;
for (const name of names) {
  const full = path.join(distDir, name);
  if (!fs.existsSync(full)) {
    console.error(`latest.yml references "${name}" but that file is not in ${distDir}`);
    const exes = fs.readdirSync(distDir).filter((f) => f.endsWith('.exe'));
    if (exes.length) console.error(`Present .exe: ${exes.join(', ')}`);
    failed = true;
  }
}

if (failed) {
  console.error(
    'Fix: set build.nsis.artifactName to a space-free template (e.g. ${productName}.Setup.${version}.${ext}).'
  );
  process.exit(1);
}

console.log(`OK: latest.yml names match dist (${[...names].join(', ')})`);
