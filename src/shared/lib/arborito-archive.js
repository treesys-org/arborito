/**
 * .arborito archive I/O.
 *
 * For authors, two rules:
 *
 *   1. Parallel language folders, `lessons/ES/…` and `lessons/EN/…` side by side.
 *      Same position (`01/02`) = same lesson in another language. Nothing to link by hand.
 *   2. Folders and `.md` files, text after `NN -` is the title. `@info` only inside a
 *      lesson file when the filename is not enough (colons, exam, icon, tags).
 *
 * Optional extras (plain and familiar):
 *   `README.md` inside a module folder, short intro for that module
 *   `files/README.md`, intro for the whole course
 *   `files/AUTORIA.md`, full author reference (all `@` tags); bundled on export
 *
 * Typical layout:
 *
 *   manifest.json
 *   lessons/ES/01 - Saludos/01 - Hola.md
 *   lessons/EN/01 - Greetings/01 - Hello.md
 *   files/README.md
 *
 * Optional `@info` keys in lesson files: title, icon, description, exam, discussion, tags
 * Nesting: folders can contain folders or lessons, as deep as the topic needs.
 */

import {
    applyAttributionToTreeData,
    normalizeAttribution,
} from './arborito-attribution.js';
import { validateArboritoTree } from './arborito-archive-validate.js';

const ARCHIVE_VERSION = 1;
const FOLDER_README = 'README.md';
const UNSAFE_FILENAME_CHARS_G = /[<>:"/\\|?*\x00-\x1f]/g;
const UNSAFE_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/;

/* ---------- naming helpers ---------- */

/** Replace filename-unsafe chars with a single dash and clean whitespace. */
function safeSegment(name) {
    let s = String(name == null ? '' : name).trim().replace(UNSAFE_FILENAME_CHARS_G, '-');
    s = s.replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '');
    return s || 'untitled';
}

/** Write `title:` only when the display name differs from the on-disk segment. */
function nameNeedsTitleInInfo(displayName, filenameName) {
    const d = String(displayName == null ? '' : displayName).trim();
    if (!d) return false;
    if (UNSAFE_FILENAME_CHARS.test(d)) return true;
    return d !== String(filenameName == null ? '' : filenameName).trim();
}

function infoTitleFields(displayName, filenameName) {
    const fields = {};
    if (nameNeedsTitleInInfo(displayName, filenameName)) fields.title = displayName;
    return fields;
}

/** Strip `^NN\s*-\s*` from a folder/file name. Returns { order, name }. */
function stripOrderPrefix(raw) {
    const s = String(raw || '');
    const m = s.match(/^\s*(\d+)\s*-\s*(.+)\s*$/);
    if (m) return { order: parseInt(m[1], 10), name: m[2].trim() };
    return { order: null, name: s.trim() };
}

function orderPrefix(order, fallback) {
    const n = parseInt(String(order ?? '').trim(), 10);
    const v = Number.isFinite(n) && n > 0 ? n : Math.max(fallback, 1);
    return String(v).padStart(2, '0');
}

function slugify(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/* ---------- @info block parsing ---------- */

const INFO_OPEN_RE = /^@info\s*$/;
const INFO_CLOSE_RE = /^@\/info\s*$/;
const INFO_KEYS = new Set(['title', 'icon', 'description', 'exam', 'discussion', 'tags', 'certifiable']);
const FLAG_KEYS = new Set(['exam', 'certifiable']);
const TRUTHY = new Set(['yes', 'true', 'on', '1']);
const FALSY = new Set(['no', 'false', 'off', '0']);

/** Split `key: value` into a normalised pair. */
function parseInfoLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return null;
    const colon = trimmed.indexOf(':');
    if (colon === -1) return null;
    const key = trimmed.slice(0, colon).trim().toLowerCase();
    const raw = trimmed.slice(colon + 1).trim();
    if (!INFO_KEYS.has(key)) return null;
    if (key === 'tags') {
        return [key, String(raw || '').split(',').map((s) => s.trim()).filter(Boolean)];
    }
    if (FLAG_KEYS.has(key)) return [key, TRUTHY.has(raw.toLowerCase())];
    return [key, raw];
}

/**
 * Parse the optional leading `@info … @/info` block of a leaf .md and return
 * `{ meta, body }`. The block must come first (only blank lines may precede
 * it). When the block is absent, `meta` is empty and the whole file is body.
 */
function parseLeafMd(text) {
    const src = String(text || '');
    const lines = src.split('\n');
    let i = 0;
    while (i < lines.length && lines[i].trim() === '') i++;

    const meta = {};
    if (i < lines.length && INFO_OPEN_RE.test(lines[i].trim())) {
        i++;
        while (i < lines.length && !INFO_CLOSE_RE.test(lines[i].trim())) {
            const pair = parseInfoLine(lines[i]);
            if (pair) meta[pair[0]] = pair[1];
            i++;
        }
        if (i < lines.length) i++; // consume the closing `@/info`
    }
    while (i < lines.length && lines[i].trim() === '') i++;
    return { meta, body: lines.slice(i).join('\n') };
}

/** Optional `README.md` in a module folder, `@info` block optional, then plain markdown. */
function parseModuleReadme(text) {
    return parseLeafMd(text);
}

/* ---------- CRC-32 ---------- */

const CRC32_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

/* ---------- minimal ZIP reader / writer ---------- */

function isZipBytes(u8) {
    return u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 0x03 && u8[3] === 0x04;
}

async function inflateRaw(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function deflateRaw(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZip(arrayBuffer) {
    const u8 = new Uint8Array(arrayBuffer);
    const dv = new DataView(arrayBuffer);
    let eocd = -1;
    const scanStart = Math.max(0, u8.length - 65557);
    for (let i = u8.length - 22; i >= scanStart; i--) {
        if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Not a ZIP file');
    const cdEntries = dv.getUint16(eocd + 10, true);
    const cdOffset = dv.getUint32(eocd + 16, true);
    const out = new Map();
    let cur = cdOffset;
    const dec = new TextDecoder('utf-8');
    for (let i = 0; i < cdEntries; i++) {
        if (dv.getUint32(cur, true) !== 0x02014b50) throw new Error('Corrupt ZIP central directory');
        const method = dv.getUint16(cur + 10, true);
        const compSize = dv.getUint32(cur + 20, true);
        const nameLen = dv.getUint16(cur + 28, true);
        const extraLen = dv.getUint16(cur + 30, true);
        const commLen = dv.getUint16(cur + 32, true);
        const localOffset = dv.getUint32(cur + 42, true);
        const name = dec.decode(u8.subarray(cur + 46, cur + 46 + nameLen));
        cur += 46 + nameLen + extraLen + commLen;
        if (name.endsWith('/')) continue;
        const localNameLen = dv.getUint16(localOffset + 26, true);
        const localExtraLen = dv.getUint16(localOffset + 28, true);
        const dataStart = localOffset + 30 + localNameLen + localExtraLen;
        const compData = u8.subarray(dataStart, dataStart + compSize);
        let raw;
        if (method === 0) raw = compData.slice();
        else if (method === 8) raw = await inflateRaw(compData);
        else throw new Error(`Unsupported ZIP compression method ${method}`);
        out.set(name, raw);
    }
    return out;
}

async function writeZip(entries) {
    const enc = new TextEncoder();
    const local = [];
    const central = [];
    let offset = 0;
    for (const { name, data } of entries) {
        const nameBytes = enc.encode(name);
        const crc = crc32(data);
        let stored = await deflateRaw(data);
        let method = 8;
        if (stored.length >= data.length) { stored = data; method = 0; }
        const lfh = new Uint8Array(30 + nameBytes.length);
        const ldv = new DataView(lfh.buffer);
        ldv.setUint32(0, 0x04034b50, true);
        ldv.setUint16(4, 20, true);
        ldv.setUint16(6, 0, true);
        ldv.setUint16(8, method, true);
        ldv.setUint16(10, 0, true);
        ldv.setUint16(12, 0, true);
        ldv.setUint32(14, crc, true);
        ldv.setUint32(18, stored.length, true);
        ldv.setUint32(22, data.length, true);
        ldv.setUint16(26, nameBytes.length, true);
        ldv.setUint16(28, 0, true);
        lfh.set(nameBytes, 30);
        local.push(lfh, stored);
        const cdh = new Uint8Array(46 + nameBytes.length);
        const cdv = new DataView(cdh.buffer);
        cdv.setUint32(0, 0x02014b50, true);
        cdv.setUint16(4, 20, true);
        cdv.setUint16(6, 20, true);
        cdv.setUint16(8, 0, true);
        cdv.setUint16(10, method, true);
        cdv.setUint16(12, 0, true);
        cdv.setUint16(14, 0, true);
        cdv.setUint32(16, crc, true);
        cdv.setUint32(20, stored.length, true);
        cdv.setUint32(24, data.length, true);
        cdv.setUint16(28, nameBytes.length, true);
        cdv.setUint32(42, offset, true);
        cdh.set(nameBytes, 46);
        central.push(cdh);
        offset += lfh.length + stored.length;
    }
    const cdSize = central.reduce((a, c) => a + c.length, 0);
    const eocd = new Uint8Array(22);
    const edv = new DataView(eocd.buffer);
    edv.setUint32(0, 0x06054b50, true);
    edv.setUint16(8, central.length, true);
    edv.setUint16(10, central.length, true);
    edv.setUint32(12, cdSize, true);
    edv.setUint32(16, offset, true);
    let total = offset + cdSize + 22;
    const outBuf = new Uint8Array(total);
    let p = 0;
    for (const c of local) { outBuf.set(c, p); p += c.length; }
    for (const c of central) { outBuf.set(c, p); p += c.length; }
    outBuf.set(eocd, p);
    return outBuf;
}

export function isZipArchiveBytes(u8) {
    return isZipBytes(u8);
}

export async function readZipArchive(arrayBuffer) {
    return readZip(arrayBuffer);
}

export async function writeZipArchive(entries) {
    return writeZip(entries);
}

/* ---------- tree reconstruction (filesystem -> in-memory shape) ---------- */

function naturalCompare(a, b) {
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/** Build the in-memory tree shape from the flat ZIP entries map. */
function reconstructTree(entries, manifestMeta) {
    const dec = new TextDecoder('utf-8');
    const universeId = manifestMeta.id || 'tree';
    const courseName = manifestMeta.name || 'Course';
    const courseDescription = manifestMeta.description || '';
    const courseIcon = manifestMeta.icon || '🌳';

    /* Group every file path under lessons/<LANG>/ by its language code. */
    const byLang = new Map();
    for (const [path] of entries) {
        const m = path.match(/^lessons\/([^/]+)\/(.*)$/);
        if (!m) continue;
        const [, lang, rest] = m;
        if (!byLang.has(lang)) byLang.set(lang, new Map());
        byLang.get(lang).set(rest, path);
    }

    const languages = {};
    for (const [lang, langEntries] of byLang) {
        languages[lang] = buildLangRoot(lang, langEntries, entries, dec, {
            universeId,
            courseName,
            courseDescription,
            courseIcon
        });
    }

    const tree = {
        generatedAt: new Date().toISOString(),
        universeId,
        universeName: courseName,
        languages
    };
    if (manifestMeta?.description) tree.description = manifestMeta.description;
    if (manifestMeta?.icon) tree.icon = manifestMeta.icon;
    return tree;
}

/**
 * Build in-memory branch tree from flat path → markdown (bundled demo, tests).
 * @param {Record<string, string>} fileMap keys like `lessons/ES/01 - Mod/01 - Lesson.md`
 * @param {{ id?: string, name?: string, description?: string, icon?: string }} manifestMeta
 */
export function buildTreeFromFlatLessonFiles(fileMap, manifestMeta = {}) {
    const enc = new TextEncoder();
    const entries = new Map();
    for (const [path, text] of Object.entries(fileMap || {})) {
        if (typeof text !== 'string' || !text.trim()) continue;
        const key = String(path).replace(/^\/+/, '');
        entries.set(key, enc.encode(text));
    }
    return reconstructTree(entries, manifestMeta);
}

function buildLangRoot(lang, langEntries, allEntries, dec, ctx) {
    const rootName = ctx.courseName;
    const rootIcon = ctx.courseIcon;
    const rootDescription = ctx.courseDescription;
    const rootId = `${ctx.universeId}-${lang.toLowerCase()}-root`;

    const children = collectChildren('', langEntries, allEntries, dec, lang, rootId, rootName);

    return {
        id: rootId,
        name: rootName,
        type: 'root',
        expanded: true,
        icon: rootIcon,
        description: rootDescription,
        path: rootName,
        children
    };
}

/**
 * For a folder relative to `lessons/<LANG>/`, return its child branch + leaf
 * nodes in natural order. `relPrefix` ends with '/' or is empty for the root.
 */
function collectChildren(relPrefix, langEntries, allEntries, dec, lang, parentId, parentPath) {
    const directChildren = new Map(); // key -> { kind: 'dir'|'file', name, fullPath? }
    for (const [rest, fullPath] of langEntries) {
        if (relPrefix && !rest.startsWith(relPrefix)) continue;
        const tail = rest.slice(relPrefix.length);
        if (!tail) continue;
        const slashIdx = tail.indexOf('/');
        if (slashIdx === -1) {
            const lower = tail.toLowerCase();
            if (tail.startsWith('_')) continue;
            if (lower === 'readme.md') continue;
            if (!tail.toLowerCase().endsWith('.md')) continue;
            directChildren.set(tail, { kind: 'file', name: tail, fullPath });
        } else {
            const dirName = tail.slice(0, slashIdx);
            if (dirName.startsWith('_')) continue;
            if (!directChildren.has(dirName)) {
                directChildren.set(dirName, { kind: 'dir', name: dirName });
            }
        }
    }

    const sorted = [...directChildren.values()].sort((a, b) => naturalCompare(a.name, b.name));
    const out = [];
    for (const child of sorted) {
        if (child.kind === 'dir') {
            out.push(buildBranch(`${relPrefix}${child.name}/`, langEntries, allEntries, dec, lang, parentId, parentPath));
        } else {
            out.push(buildLeaf(child.fullPath, allEntries, dec, lang, parentId, parentPath));
        }
    }
    return out;
}

function buildBranch(relPrefix, langEntries, allEntries, dec, lang, parentId, parentPath) {
    const folderName = relPrefix.replace(/\/$/, '').split('/').pop();
    const { order, name: filenameName } = stripOrderPrefix(folderName);

    const readmePath = `lessons/${lang}/${relPrefix}${FOLDER_README}`;
    const readmeRaw = (() => {
        const bytes = allEntries.get(readmePath);
        return bytes ? dec.decode(bytes) : '';
    })();
    const { meta: readmeMeta, body: readmeBody } = readmeRaw ? parseModuleReadme(readmeRaw) : { meta: {}, body: '' };

    const display = filenameName;
    const branchId = `branch-${slugify(`${lang}/${relPrefix}`)}`;
    const branchPath = `${parentPath} / ${display}`;
    const intro = String(readmeMeta.description || readmeBody || '').trim();

    const children = collectChildren(relPrefix, langEntries, allEntries, dec, lang, branchId, branchPath);

    const branchNode = {
        id: branchId,
        parentId,
        name: display,
        type: 'branch',
        icon: readmeMeta.icon || '📁',
        path: branchPath,
        order: order != null ? String(order) : '',
        description: intro,
        expanded: true,
        children
    };
    if (readmeRaw) branchNode.content = readmeRaw;
    if ('certifiable' in readmeMeta) branchNode.isCertifiable = !!readmeMeta.certifiable;
    return branchNode;
}

function buildLeaf(fullPath, allEntries, dec, lang, parentId, parentPath) {
    const fileName = fullPath.split('/').pop().replace(/\.md$/i, '');
    const { order, name: filenameName } = stripOrderPrefix(fileName);
    const text = dec.decode(allEntries.get(fullPath));
    const { meta } = parseLeafMd(text);

    const type = meta.exam ? 'exam' : 'leaf';
    const display = meta.title || filenameName;

    const leafNode = {
        id: `leaf-${slugify(`${lang}/${fullPath}`)}`,
        parentId,
        name: display,
        type,
        icon: meta.icon || (type === 'exam' ? '📝' : '📄'),
        path: `${parentPath} / ${display}`,
        order: order != null ? String(order) : '',
        description: meta.description || '',
        content: text
    };
    return leafNode;
}

/* ---------- tree serialisation (in-memory -> filesystem) ---------- */

/** Walk an in-memory tree and yield ZIP entries (`name`, `data`) for it. */
function* serializeTreeEntries(tree, manifestMeta) {
    const enc = new TextEncoder();
    for (const [lang, langRoot] of Object.entries(tree?.languages || {})) {
        yield* serializeBranchChildren(langRoot.children || [], `lessons/${lang}/`, enc);
    }
}

function* serializeBranchChildren(children, prefix, enc) {
    /* Re-pad order prefixes so on-disk names sort consistently. */
    const branches = [];
    const leaves = [];
    children.forEach((c, idx) => {
        if (c.type === 'branch') branches.push({ node: c, idx });
        else leaves.push({ node: c, idx });
    });
    branches.sort(sortByOrderThenIdx);
    leaves.sort(sortByOrderThenIdx);

    for (let i = 0; i < branches.length; i++) {
        const { node } = branches[i];
        const folderSeg = `${orderPrefix(node.order, i + 1)} - ${safeSegment(node.name)}`;
        const branchPrefix = `${prefix}${folderSeg}/`;
        const readme = folderReadmeFromNode(node);
        if (readme.trim()) {
            yield { name: `${branchPrefix}${FOLDER_README}`, data: enc.encode(readme) };
        }
        yield* serializeBranchChildren(node.children || [], branchPrefix, enc);
    }

    for (let i = 0; i < leaves.length; i++) {
        const { node } = leaves[i];
        const fileSeg = `${orderPrefix(node.order, i + 1)} - ${safeSegment(node.name)}.md`;
        yield { name: `${prefix}${fileSeg}`, data: enc.encode(serializeLeafMd(node)) };
    }
}

function folderInfoFields(node) {
    const fields = {};
    if (node.icon && node.icon !== '📁') fields.icon = node.icon;
    if (node.description) fields.description = node.description;
    if ('isCertifiable' in node) fields.certifiable = !!node.isCertifiable;
    else if (node.isCertifiable) fields.certifiable = true;
    return fields;
}

function sortByOrderThenIdx(a, b) {
    const ao = parseInt(String(a.node.order ?? ''), 10);
    const bo = parseInt(String(b.node.order ?? ''), 10);
    const av = Number.isFinite(ao) ? ao : a.idx;
    const bv = Number.isFinite(bo) ? bo : b.idx;
    return av - bv;
}

/* ---------- @info block rendering ---------- */

const INFO_FIELD_ORDER = ['title', 'icon', 'description', 'certifiable', 'exam', 'discussion', 'tags'];

/** Render a `{ key: value }` map to a fenced `@info … @/info` block. */
function renderInfoBlock(fields) {
    const lines = [];
    for (const key of INFO_FIELD_ORDER) {
        if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
        const v = fields[key];
        if (v == null || v === '') continue;
        if (FLAG_KEYS.has(key)) {
            if (v === true || TRUTHY.has(String(v).toLowerCase())) lines.push(`${key}: yes`);
            else if (v === false || FALSY.has(String(v).toLowerCase())) lines.push(`${key}: no`);
            continue;
        } else if (Array.isArray(v)) {
            if (v.length) lines.push(`${key}: ${v.join(', ')}`);
        } else {
            lines.push(`${key}: ${v}`);
        }
    }
    if (!lines.length) return '';
    return `@info\n${lines.join('\n')}\n@/info\n`;
}

/**
 * Render a leaf node back to .md, fronted by an `@info` block when the node
 * carries any non-default property. The body is preserved verbatim, so any
 * `@quiz` block keeps its original position (top, middle, bottom).
 */
function serializeLeafMd(node) {
    const { meta: oldMeta, body } = parseLeafMd(String(node.content ?? ''));
    const isExam = node.type === 'exam';
    const defaultIcon = isExam ? '📝' : '📄';
    const filenameName = safeSegment(node.name);

    const fields = infoTitleFields(node.name, filenameName);
    if (node.icon && node.icon !== defaultIcon) fields.icon = node.icon;
    if (node.description) fields.description = node.description;
    if (isExam) fields.exam = true;
    if (oldMeta.discussion) fields.discussion = oldMeta.discussion;
    if (Array.isArray(oldMeta.tags) && oldMeta.tags.length) fields.tags = oldMeta.tags;

    const block = renderInfoBlock(fields);
    const trimmedBody = body.replace(/^\s+/, '').replace(/\s+$/, '');
    if (!block) return trimmedBody + '\n';
    return block + (trimmedBody ? '\n' + trimmedBody + '\n' : '');
}

/** Render optional module `README.md` (plain markdown, or `@info` + body when icon is set). */
export function folderReadmeFromNode(node) {
    const { meta: oldMeta, body: oldBody } = parseLeafMd(String(node?.content ?? ''));
    const fields = folderInfoFields(node || {});
    if (oldMeta.icon && !fields.icon) fields.icon = oldMeta.icon;
    if (oldMeta.description && !fields.description) fields.description = oldMeta.description;
    if (!('certifiable' in fields) && 'certifiable' in oldMeta) fields.certifiable = !!oldMeta.certifiable;

    const body = oldBody.trim();
    const block = renderInfoBlock(fields);
    if (!block && !body) {
        const plain = String(node?.description || '').trim();
        return plain ? `${plain}\n` : '';
    }
    if (!block) return body ? `${body}\n` : '';
    return block + (body ? `\n${body}\n` : '');
}

/** Parse optional module `README.md` metadata (`@info` block when present). */
export function parseFolderReadme(text) {
    return parseModuleReadme(text).meta;
}

/**
 * Match parallel language trees by lesson position (`01/02` = module 01, lesson 02).
 * No linking file, just keep the same numbers in ES and EN.
 * @param {object} tree
 */
export function buildTranslationIndex(tree) {
    const index = {};
    const langs = Object.keys(tree?.languages || {});
    if (langs.length < 2) return index;

    const byLang = {};
    for (const lang of langs) {
        byLang[lang] = collectLeavesByOrderPath(tree.languages[lang]);
    }

    const allKeys = new Set();
    for (const leaves of Object.values(byLang)) {
        for (const key of leaves.keys()) allKeys.add(key);
    }

    for (const key of allKeys) {
        const entry = {};
        for (const lang of langs) {
            const leaf = byLang[lang].get(key);
            if (leaf) entry[lang] = { id: leaf.id, name: leaf.name, type: leaf.type };
        }
        if (Object.keys(entry).length >= 2) index[key] = entry;
    }
    return index;
}

/** @returns {Map<string, object>} order path → leaf node */
export function leavesByOrderPath(langRoot) {
    return collectLeavesByOrderPath(langRoot);
}

function collectLeavesByOrderPath(node, parentKey = '', out = new Map()) {
    const children = node?.children || [];
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const order = parseInt(String(child.order ?? ''), 10);
        const seg =
            Number.isFinite(order) && order > 0
                ? String(order).padStart(2, '0')
                : String(i + 1).padStart(2, '0');
        const key = parentKey ? `${parentKey}/${seg}` : seg;
        if (child.type === 'leaf' || child.type === 'exam') {
            out.set(key, child);
        } else if (child.type === 'branch') {
            collectLeavesByOrderPath(child, key, out);
        }
    }
    return out;
}

/**
 * Merge optional `files/README.md` into an in-memory tree.
 * @param {object} tree
 * @param {Record<string, string>} [files]
 */
export function applyFilesToTree(tree, files) {
    if (!tree || !files || typeof files !== 'object') return tree;
    const readme = String(files['README.md'] || files['INTRO.md'] || '').trim();
    if (readme) tree.readme = readme;
    tree.translationIndex = buildTranslationIndex(tree);
    return tree;
}

/* ---------- public API ---------- */

/**
 * Parse a `.arborito` ZIP and return the in-memory shape the rest of the app
 * already uses: `{ magic, version, meta, tree, files? }` with each leaf
 * carrying its lesson body in `content`.
 * @param {ArrayBuffer | Uint8Array} input
 * @returns {Promise<object>}
 */
export async function readArboritoArchive(input) {
    const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (!isZipBytes(u8)) throw new Error('Not a valid .arborito archive (expected a ZIP file)');
    const buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    const entries = await readZip(buf);
    const manifestRaw = entries.get('manifest.json');
    if (!manifestRaw) throw new Error('Archive missing manifest.json');
    const manifest = JSON.parse(new TextDecoder('utf-8').decode(manifestRaw));
    if (manifest.magic !== 'ARBORITO_ARCHIVE') throw new Error('Archive manifest has wrong magic');
    if (!manifest.meta || typeof manifest.meta !== 'object') throw new Error('Archive manifest missing meta');

    const tree = reconstructTree(entries, manifest.meta);

    const dec = new TextDecoder('utf-8');
    const files = {};
    for (const [name, bytes] of entries) {
        if (name.startsWith('files/') && !name.endsWith('/')) {
            files[name.slice('files/'.length)] = dec.decode(bytes);
        }
    }

    applyFilesToTree(tree, files);

    const attributionRaw =
        manifest.meta?.attribution ||
        (files['ATTRIBUTION.json']
            ? (() => {
                  try {
                      return JSON.parse(files['ATTRIBUTION.json']);
                  } catch {
                      return null;
                  }
              })()
            : null);
    if (attributionRaw) {
        applyAttributionToTreeData(tree, attributionRaw);
    }

    const authorWarnings = validateArboritoTree(tree, manifest.meta?.language || 'ES');

    return {
        magic: manifest.magic,
        version: manifest.version || ARCHIVE_VERSION,
        meta: manifest.meta,
        tree,
        ...(authorWarnings.length ? { authorWarnings } : {}),
        ...(Object.keys(files).length ? { files } : {}),
        ...(attributionRaw ? { attribution: attributionRaw } : {})
    };
}

/**
 * Serialise an in-memory tree + course meta into a `.arborito` ZIP buffer,
 * laying every leaf out as its own .md file under `lessons/<LANG>/...`.
 * @param {{ id: string, name: string, description?: string, icon?: string, language?: string }} meta
 * @param {object} treeData
 * @param {Object<string, string>} [bundledFiles]
 * @returns {Promise<Uint8Array>}
 */
export async function writeArboritoArchive(meta, treeData, bundledFiles = {}, opts = {}) {
    const enc = new TextEncoder();
    const attribution = opts.attribution ? normalizeAttribution(opts.attribution) : null;
    const manifest = {
        magic: 'ARBORITO_ARCHIVE',
        version: ARCHIVE_VERSION,
        contentKind: 'branch',
        meta: {
            id: meta?.id || '',
            name: meta?.name || '',
            ...(meta || {}),
            exportedAt: new Date().toISOString(),
            ...(attribution ? { attribution } : {}),
        }
    };

    const files = { ...(bundledFiles || {}) };
    if (attribution) {
        files['ATTRIBUTION.json'] = JSON.stringify(attribution, null, 2) + '\n';
    }

    const allEntries = [
        { name: 'manifest.json', data: enc.encode(JSON.stringify(manifest, null, 2) + '\n') }
    ];
    for (const entry of serializeTreeEntries(treeData || {}, manifest.meta)) {
        allEntries.push(entry);
    }
    for (const [name, body] of Object.entries(files || {})) {
        allEntries.push({ name: `files/${name}`, data: enc.encode(String(body || '').trim() + '\n') });
    }
    allEntries.sort((a, b) => a.name.localeCompare(b.name));
    return writeZip(allEntries);
}
