/**
 * Gen-scoped d-tags and load timeouts for universe bundles (used by bundlesMixin).
 */

import {
    bundleMainChunkDTag,
    bundleSkeletonDTag,
    forumPackChunkDTag,
    forumPackDTag,
    searchPackChunkDTag,
    searchPackDTag,
} from '../nostr-spec.js';
import { shouldShowMobileUI } from '../../../../shared/ui/breakpoints.js';

/** Versioned main-chunk address so mid-republish does not overwrite the live generation. */
export function bundleMainChunkDTagGen(ownerPubHex, universeId, gen, index) {
    const g = String(gen || '').trim();
    if (!g) return bundleMainChunkDTag(ownerPubHex, universeId, index);
    return `arborito:bundle:main:${String(ownerPubHex)}:${String(universeId)}:${g}:${Number(index)}`;
}

export function bundleSkeletonDTagGen(ownerPubHex, universeId, gen) {
    const g = String(gen || '').trim();
    if (!g) return '';
    return bundleSkeletonDTag(ownerPubHex, universeId, g);
}

/** UTF-8 part of a structure skeleton that exceeds one Nostr event. */
export function bundleSkeletonPartDTagGen(ownerPubHex, universeId, gen, index) {
    const g = String(gen || '').trim();
    if (!g) return '';
    const i = Math.max(0, Math.floor(Number(index)) || 0);
    return `arborito:bundle:skel:${String(ownerPubHex)}:${String(universeId)}:${g}:c:${i}`;
}

export function lessonChunkDTag(pub, universeId, key, gen) {
    const g = String(gen || '').trim();
    const ck = String(key || '');
    return g
        ? `arborito:lesson:${String(pub)}:${String(universeId)}:${g}:${ck}`
        : `arborito:lesson:${String(pub)}:${String(universeId)}:${ck}`;
}

export function lessonPartDTag(pub, universeId, key, index, gen) {
    const g = String(gen || '').trim();
    const ck = String(key || '');
    const i = Number(index);
    return g
        ? `arborito:lesson:${String(pub)}:${String(universeId)}:${g}:${ck}:p:${i}`
        : `arborito:lesson:${String(pub)}:${String(universeId)}:${ck}:p:${i}`;
}

export function snapChunkDTag(pub, universeId, key, gen) {
    const g = String(gen || '').trim();
    const sk = String(key || '');
    return g
        ? `arborito:snap:${String(pub)}:${String(universeId)}:${g}:${sk}`
        : `arborito:snap:${String(pub)}:${String(universeId)}:${sk}`;
}

export function snapPartDTag(pub, universeId, key, index, gen) {
    const g = String(gen || '').trim();
    const sk = String(key || '');
    const i = Number(index);
    return g
        ? `arborito:snap:${String(pub)}:${String(universeId)}:${g}:${sk}:c:${i}`
        : `arborito:snap:${String(pub)}:${String(universeId)}:${sk}:c:${i}`;
}

export function searchPackDTagGen(pub, universeId, gen) {
    const g = String(gen || '').trim();
    return g
        ? `arborito:search:${String(pub)}:${String(universeId)}:${g}:v1`
        : searchPackDTag(pub, universeId);
}

export function searchPackChunkDTagGen(pub, universeId, index, gen) {
    const g = String(gen || '').trim();
    const i = Math.max(0, Math.floor(Number(index)) || 0);
    return g
        ? `arborito:search:${String(pub)}:${String(universeId)}:${g}:v1:c:${i}`
        : searchPackChunkDTag(pub, universeId, i);
}

export function forumPackDTagGen(pub, universeId, gen) {
    const g = String(gen || '').trim();
    return g
        ? `arborito:forum:${String(pub)}:${String(universeId)}:${g}:v1`
        : forumPackDTag(pub, universeId);
}

export function forumPackChunkDTagGen(pub, universeId, index, gen) {
    const g = String(gen || '').trim();
    const i = Math.max(0, Math.floor(Number(index)) || 0);
    return g
        ? `arborito:forum:${String(pub)}:${String(universeId)}:${g}:v1:c:${i}`
        : forumPackChunkDTag(pub, universeId, i);
}

export function nostrBundleLoadTimeouts() {
    const mobile = shouldShowMobileUI();
    return {
        /* Desktop previously used 3.5s and treated slow relays as missing courses. */
        headerMs: mobile ? 8000 : 6000,
        headerRetryMs: mobile ? 10000 : 8000,
        headerFinalMs: mobile ? 14000 : 12000,
        chunkMs: mobile ? 8000 : 6000,
        chunkRetryMs: mobile ? 10000 : 8000,
        chunkFinalMs: mobile ? 14000 : 12000,
    };
}
