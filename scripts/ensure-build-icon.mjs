#!/usr/bin/env node
/**
 * Writes build/icon.png (256×256) for electron-builder.
 * Regenerates if missing or if the file is the old broken placeholder (< 2 KiB).
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'build', 'icon.png');

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
    }
    return table;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
}

/** Solid RGB PNG — emerald #10b981 (Arborito brand). */
function solidPng(width, height, r, g, b) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0;
    for (let x = 0; x < width; x++) {
        const o = 1 + x * 3;
        row[o] = r;
        row[o + 1] = g;
        row[o + 2] = b;
    }
    const raw = Buffer.concat(Array.from({ length: height }, () => row));
    const compressed = zlib.deflateSync(raw, { level: 9 });

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', compressed),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
}

function needsRegenerate() {
    if (!existsSync(OUT)) return true;
    try {
        const buf = readFileSync(OUT);
        if (buf.length < 2048) return true;
        const sig = buf.subarray(0, 8);
        const ok =
            sig[0] === 0x89 &&
            sig[1] === 0x50 &&
            sig[2] === 0x4e &&
            sig[3] === 0x47;
        return !ok;
    } catch {
        return true;
    }
}

mkdirSync(join(ROOT, 'build'), { recursive: true });
if (needsRegenerate()) {
    writeFileSync(OUT, solidPng(256, 256, 16, 185, 129));
    console.log('[ensure-build-icon] wrote build/icon.png (256×256)');
} else {
    console.log('[ensure-build-icon] build/icon.png OK — delete it to force regenerate');
}
