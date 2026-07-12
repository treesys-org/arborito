#!/usr/bin/env node
/**
 * Move legacy @quiz blocks from file header into the practice (or last) TOC section.
 * Usage: node scripts/migrate-header-quiz-to-body.mjs [--dry-run] [contentRoot]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    parseArboritoFile,
    reconstructArboritoFile,
} from '../src/features/editor/api/logic/editor-serialize.js';
import { bodyMarkdownHasQuizBlock } from '../src/features/learning/api/quiz-status.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const rootArg = args.find((a) => !a.startsWith('--'));
const contentRoot = path.resolve(rootArg || path.join(__dirname, '../../confidencial'));

function walkMdFiles(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const st = fs.statSync(full);
        if (st.isDirectory()) walkMdFiles(full, out);
        else if (name.endsWith('.md')) out.push(full);
    }
    return out;
}

function migrateFile(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split('\n');
    let i = 0;
    while (i < lines.length && lines[i].trim() === '') i++;
    if (i < lines.length && lines[i].trim() === '@info') {
        i++;
        while (i < lines.length && lines[i].trim() !== '@/info') i++;
        if (i < lines.length) i++;
    }
    while (i < lines.length && lines[i].trim() === '') i++;
    const hasHeaderQuiz = i < lines.length && /^@quiz\s*$/i.test(lines[i].trim());
    if (!hasHeaderQuiz) return { changed: false, reason: 'no-header-quiz' };

    const parsed = parseArboritoFile(raw);
    if (bodyMarkdownHasQuizBlock(parsed.body)) {
        return { changed: false, reason: 'body-already-has-quiz' };
    }
    if (!parsed.body.includes('@quiz')) {
        /* parseArboritoFile migrates in memory; reconstructed file drops header quiz. */
    }
    const next = reconstructArboritoFile(parsed.meta, parsed.body);
    if (next.trim() === raw.trim()) return { changed: false, reason: 'unchanged' };
    if (!dryRun) fs.writeFileSync(filePath, `${next.replace(/\s+$/, '')}\n`, 'utf8');
    return { changed: true };
}

let changed = 0;
let scanned = 0;
for (const file of walkMdFiles(contentRoot)) {
    scanned += 1;
    const result = migrateFile(file);
    if (result.changed) {
        changed += 1;
        console.log(`${dryRun ? '[dry-run] ' : ''}migrated: ${file}`);
    }
}
console.log(
    `migrate-header-quiz-to-body: scanned ${scanned}, ${dryRun ? 'would change' : 'changed'} ${changed}${dryRun ? ' (dry-run)' : ''}`
);
