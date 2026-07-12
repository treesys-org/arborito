/**
 * .arborito archives for composed trees (árboles): manifest + composed-tree.json + embedded branch zips.
 */

import {
    readArboritoArchive,
    writeArboritoArchive,
    readZipArchive,
    writeZipArchive,
    isZipArchiveBytes,
} from '../../../shared/lib/arborito-archive.js';
import { buildArboritoTreeBundleObject, parseArboritoTreeBundle } from './arborito-tree-bundle.js';
import { normalizeAttribution, attributionJsonBytes } from '../../../shared/lib/arborito-attribution.js';

const COMPOSED_TREE_JSON = 'composed-tree.json';
const EMBEDDED_BRANCH_PREFIX = 'branches/';
const CONTENT_KIND_TREE = 'composed-tree';

function u8ToBuffer(input) {
    const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
    return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

async function readZipEntries(input) {
    const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (!isZipArchiveBytes(u8)) throw new Error('Not a valid .arborito archive (expected a ZIP file)');
    return readZipArchive(u8ToBuffer(u8));
}

/** @param {Map<string, Uint8Array>} entries */
function readManifest(entries) {
    const manifestRaw = entries.get('manifest.json');
    if (!manifestRaw) throw new Error('Archive missing manifest.json');
    const manifest = JSON.parse(new TextDecoder('utf-8').decode(manifestRaw));
    if (manifest.magic !== 'ARBORITO_ARCHIVE') throw new Error('Archive manifest has wrong magic');
    return manifest;
}

/** @param {Map<string, Uint8Array>} entries */
function readComposedTreeBundleFromEntries(entries) {
    const raw = entries.get(COMPOSED_TREE_JSON);
    if (!raw) return null;
    try {
        const bundle = JSON.parse(new TextDecoder('utf-8').decode(raw));
        return parseArboritoTreeBundle(bundle) ? bundle : null;
    } catch {
        return null;
    }
}

/** @param {Map<string, Uint8Array>} entries */
function listEmbeddedBranchIds(entries) {
    const ids = [];
    for (const name of entries.keys()) {
        if (!name.startsWith(EMBEDDED_BRANCH_PREFIX) || !name.endsWith('.arborito')) continue;
        const id = name.slice(EMBEDDED_BRANCH_PREFIX.length, -'.arborito'.length);
        if (id) ids.push(id);
    }
    return ids.sort();
}

function countLessonsInZipEntries(entries) {
    let n = 0;
    for (const name of entries.keys()) {
        if (name.startsWith('lessons/') && name.endsWith('.md')) n++;
    }
    return n;
}

function countLangRoots(tree) {
    const langs = tree?.languages && typeof tree.languages === 'object' ? Object.keys(tree.languages) : [];
    return langs.length;
}

/**
 * Inspect a .arborito file before import (no mutations).
 * @param {ArrayBuffer | Uint8Array} input
 * @returns {Promise<object>}
 */
export async function analyzeArboritoImport(input) {
    const entries = await readZipEntries(input);
    const manifest = readManifest(entries);
    const treeBundle = readComposedTreeBundleFromEntries(entries);
    const contentKind = String(manifest.contentKind || '').trim();
    const isTree =
        contentKind === CONTENT_KIND_TREE ||
        (!!treeBundle && contentKind !== 'branch');

    if (isTree && treeBundle) {
        const parsed = parseArboritoTreeBundle(treeBundle);
        const embeddedIds = new Set(listEmbeddedBranchIds(entries));
        const refs = (parsed?.branchRefs || []).map((ref) => {
            const bid = String(ref.branchId || ref.refId || '').trim();
            const displayName = String(ref.displayName || bid || '').trim();
            const networkUrl = String(ref.networkUrl || ref.sourceUrl || '').trim();
            return {
                branchId: bid,
                displayName: displayName || bid,
                embedded: bid ? embeddedIds.has(bid) : false,
                networkUrl: networkUrl || '',
            };
        });
        const embeddedCount = refs.filter((r) => r.embedded).length;
        const externalCount = refs.length - embeddedCount;
        return {
            kind: 'composed-tree',
            title: String(parsed?.title || manifest.meta?.name || treeBundle.meta?.title || 'Tree').trim(),
            branchRefs: refs,
            branchCount: refs.length,
            embeddedBranchCount: embeddedCount,
            externalBranchCount: externalCount,
            manifest,
            treeBundle,
        };
    }

    const archive = await readArboritoArchive(input);
    const tree = archive.tree || {};
    const lessonCount = countLessonsInZipEntries(entries);
    const langCount = countLangRoots(tree);
    return {
        kind: 'branch',
        title: String(tree.universeName || manifest.meta?.name || 'Branch').trim(),
        language: String(manifest.meta?.language || tree.meta?.language || '').trim(),
        lessonCount: lessonCount || null,
        languageCount: langCount || null,
        authorWarnings: Array.isArray(archive.authorWarnings) ? archive.authorWarnings : [],
        manifest,
        archive,
    };
}

/**
 * @param {ArrayBuffer | Uint8Array} input
 */
export async function readComposedTreeArchive(input) {
    const entries = await readZipEntries(input);
    const manifest = readManifest(entries);
    const treeBundle = readComposedTreeBundleFromEntries(entries);
    if (!treeBundle) {
        throw new Error('Missing or invalid composed-tree.json');
    }
    const embedded = new Map();
    for (const name of entries.keys()) {
        if (!name.startsWith(EMBEDDED_BRANCH_PREFIX) || !name.endsWith('.arborito')) continue;
        const id = name.slice(EMBEDDED_BRANCH_PREFIX.length, -'.arborito'.length);
        const bytes = entries.get(name);
        if (id && bytes) embedded.set(id, bytes);
    }
    return { manifest, bundle: treeBundle, embedded };
}

/**
 * @param {object} treeEntry
 * @param {Record<string, Uint8Array>} embeddedBranchZips branchId → .arborito bytes
 */
export async function writeComposedTreeArchive(treeEntry, embeddedBranchZips = {}, attribution = null) {
    const enc = new TextEncoder();
    const treeBundle = buildArboritoTreeBundleObject(treeEntry, {}, attribution);
    const attr = normalizeAttribution(attribution || treeBundle.meta?.attribution || {});
    const manifest = {
        magic: 'ARBORITO_ARCHIVE',
        version: 2,
        contentKind: CONTENT_KIND_TREE,
        meta: {
            id: String(treeEntry.id || ''),
            name: String(treeEntry.name || ''),
            exportedAt: new Date().toISOString(),
            attribution: attr,
        },
    };
    const allEntries = [
        { name: 'manifest.json', data: enc.encode(JSON.stringify(manifest, null, 2) + '\n') },
        { name: COMPOSED_TREE_JSON, data: enc.encode(JSON.stringify(treeBundle, null, 2) + '\n') },
        { name: 'files/ATTRIBUTION.json', data: attributionJsonBytes(attr) },
    ];
    for (const [branchId, zipBytes] of Object.entries(embeddedBranchZips || {})) {
        const bid = String(branchId || '').trim();
        if (!bid || !zipBytes) continue;
        allEntries.push({ name: `${EMBEDDED_BRANCH_PREFIX}${bid}.arborito`, data: zipBytes });
    }
    allEntries.sort((a, b) => a.name.localeCompare(b.name));
    return writeZipArchive(allEntries);
}

export { readArboritoArchive, writeArboritoArchive };
