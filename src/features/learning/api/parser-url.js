/**
 * Lesson media URL allowlist — keep in sync with lesson-media-providers.js.
 * Reader, editor, import sanitize, and serialize all go through validateLessonMediaUrl.
 * Use `{ allowLocal: false }` for network publish / public trees.
 */

import {
    ALLOWED_LESSON_AUDIO_HOSTS,
    ALLOWED_LESSON_IMAGE_HOSTS,
} from './lesson-media-providers.js';

function hostKey(hostname) {
    return String(hostname || '')
        .replace(/^www\./, '')
        .toLowerCase();
}

const LOCAL_IMAGE_EXT = 'png|jpe?g|webp|gif|svg';
const LOCAL_AUDIO_EXT = 'mp3|ogg|wav|m4a|aac|flac|opus';
const LOCAL_VIDEO_EXT = 'mp4|webm|ogv|mov|m4v';

/** Authoring shorthand → same-origin relative path under ./media/. */
export function normalizeLocalMediaUrl(raw) {
    const s = String(raw != null ? raw : '').trim();
    if (!s) return '';
    const localScheme = s.match(/^local:\/\/media\/([A-Za-z0-9._-]+\.[A-Za-z0-9]+)$/i);
    if (localScheme) return `./media/${localScheme[1]}`;
    return s;
}

function localMediaPathMatch(raw, extAlt) {
    const s = normalizeLocalMediaUrl(raw);
    if (!s || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) return '';
    const path = s.replace(/^\.\//, '').replace(/^\//, '');
    const re = new RegExp(`^media\\/[A-Za-z0-9._-]+\\.(?:${extAlt})$`, 'i');
    if (!re.test(path)) return '';
    return `./${path}`;
}

export function isLocalMediaPath(raw, kind = 'image') {
    const path = resolveLocalLessonMediaPath(raw, kind);
    return !!(path && path.startsWith('./media/'));
}

export function resolveLocalLessonMediaPath(raw, kind = 'image') {
    if (kind === 'image') return localMediaPathMatch(raw, LOCAL_IMAGE_EXT);
    if (kind === 'audio') {
        const p = localMediaPathMatch(raw, LOCAL_AUDIO_EXT);
        return p && p.startsWith('./media/') ? p : '';
    }
    if (kind === 'video') {
        const p = localMediaPathMatch(raw, LOCAL_VIDEO_EXT);
        return p && p.startsWith('./media/') ? p : '';
    }
    return '';
}

/** @param {string} raw @param {{ allowLocal?: boolean }} [opts] */
export function isAllowedLessonImageUrl(raw, opts = {}) {
    const allowLocal = opts.allowLocal !== false;
    const local = resolveLocalLessonMediaPath(raw, 'image');
    if (local?.startsWith('./media/')) return allowLocal;
    const normalized = normalizeImgurImageUrl(raw) || normalizeLocalMediaUrl(raw);
    const safe = safeHttpUrl(normalized);
    if (!safe) return false;
    try {
        const u = new URL(safe);
        if (u.protocol !== 'https:') return false;
        const host = hostKey(u.hostname);
        if (ALLOWED_LESSON_IMAGE_HOSTS.has(host)) return true;
        if (host.endsWith('.wikimedia.org')) return true;
        return false;
    } catch {
        return false;
    }
}

/** @param {string} raw @param {{ allowLocal?: boolean }} [opts] */
export function isAllowedLessonAudioUrl(raw, opts = {}) {
    const allowLocal = opts.allowLocal !== false;
    if (resolveLocalLessonMediaPath(raw, 'audio')) return allowLocal;
    const safe = safeHttpUrl(normalizeLocalMediaUrl(raw));
    if (!safe) return false;
    try {
        const u = new URL(safe);
        if (u.protocol !== 'https:') return false;
        const host = hostKey(u.hostname);
        const pathAndQuery = `${u.pathname || ''}${u.search || ''}`;
        const hasAudioFile = /\.(mp3|ogg|wav|m4a|aac|flac|opus)(?:\?|$)/i.test(pathAndQuery);
        /* archive.org/details/… is a catalog page; prefer /download/…/file.mp3 */
        if (host === 'archive.org' && /\/details\//i.test(u.pathname || '') && !hasAudioFile) {
            return false;
        }
        if (ALLOWED_LESSON_AUDIO_HOSTS.has(host)) return true;
        if (host.endsWith('.wikimedia.org')) return true;
        return false;
    } catch {
        return false;
    }
}

function tryPeerTubeEmbedUrl(u) {
    const path = u.pathname || '';
    if (path.startsWith('/videos/embed/')) {
        const id = path.replace(/^\/videos\/embed\//, '').split('/')[0];
        return id ? `${u.origin}/videos/embed/${id}${u.search}` : '';
    }
    if (path.startsWith('/videos/watch/')) {
        const id = path.replace(/^\/videos\/watch\//, '').split('/')[0];
        return id ? `${u.origin}/videos/embed/${id}` : '';
    }
    if (path.startsWith('/w/')) {
        const id = path.replace(/^\/w\//, '').split('/')[0];
        return id ? `${u.origin}/videos/embed/${id}` : '';
    }
    return '';
}

function tryVimeoEmbedUrl(u) {
    const host = hostKey(u.hostname);
    if (host === 'player.vimeo.com') {
        const id = (u.pathname || '').replace(/^\/video\//, '').split('/')[0];
        return id ? `https://player.vimeo.com/video/${id}` : '';
    }
    if (host === 'vimeo.com') {
        const parts = (u.pathname || '').split('/').filter(Boolean);
        const id = parts.find((p) => /^\d+$/.test(p));
        return id ? `https://player.vimeo.com/video/${id}` : '';
    }
    return '';
}

function isYouTubeHost(host) {
    return (
        host === 'youtu.be' ||
        host === 'youtube.com' ||
        host === 'm.youtube.com' ||
        host === 'youtube-nocookie.com' ||
        host === 'www.youtube-nocookie.com'
    );
}

/**
 * Accept Imgur page / gallery / album links as direct CDN image URLs.
 * Preserves gif/png/webp when present; bare ids stay extensionless so Imgur
 * can serve the correct type (jpg forced on gifs broke animated images).
 */
export function normalizeImgurImageUrl(raw) {
    const safe = safeHttpUrl(raw);
    if (!safe) return '';
    try {
        const u = new URL(safe);
        if (u.protocol !== 'https:') return '';
        const host = hostKey(u.hostname);
        const parts = (u.pathname || '').split('/').filter(Boolean);
        if (!parts.length) return '';

        const IMG_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4']);

        const cdnFromFile = (file) => {
            const m = String(file || '').match(/^([A-Za-z0-9]{5,10})(?:\.([a-z0-9]+))?$/i);
            if (!m) return '';
            const id = m[1];
            const ext = m[2] ? m[2].toLowerCase() : '';
            if (ext && IMG_EXT.has(ext)) {
                return `https://i.imgur.com/${id}.${ext === 'jpeg' ? 'jpg' : ext}`;
            }
            return `https://i.imgur.com/${id}`;
        };

        if (host === 'i.imgur.com') {
            return cdnFromFile(parts[0]);
        }
        if (host !== 'imgur.com') return '';

        let file = '';
        if (parts[0] === 'gallery' || parts[0] === 'a' || parts[0] === 'r') {
            /* gallery/24-hour-surveillance-JqnFRxC or a/AbCdEfG — trailing hash. */
            const slug = parts[parts[0] === 'r' ? 2 : 1] || '';
            const hash = String(slug).match(/(?:^|-)([A-Za-z0-9]{5,10})$/);
            file = hash ? hash[1] : '';
        } else if (parts[0] === 'user' || parts[0] === 't') {
            return '';
        } else {
            file = parts[0];
        }
        return cdnFromFile(file);
    } catch {
        return '';
    }
}

/** @param {string} raw @param {{ allowLocal?: boolean }} [opts] */
export function isAllowedLessonVideoUrl(raw, opts = {}) {
    const allowLocal = opts.allowLocal !== false;
    if (resolveLocalLessonMediaPath(raw, 'video')) return allowLocal;
    const embed = normalizeVideoEmbedUrl(raw);
    if (!embed) return false;
    return isThirdPartyVideoEmbedUrl(embed);
}

/**
 * @param {'image'|'video'|'audio'} type
 * @param {string} raw
 * @param {{ allowLocal?: boolean }} [opts]
 */
export function validateLessonMediaUrl(type, raw, opts = {}) {
    const kind = String(type || '').toLowerCase();
    const normalized = normalizeLocalMediaUrl(raw);
    const allowLocal = opts.allowLocal !== false;
    if (kind === 'image') {
        const local = resolveLocalLessonMediaPath(normalized, 'image');
        if (local) {
            if (local.startsWith('./media/') && !allowLocal) return '';
            return local;
        }
        const imgur = normalizeImgurImageUrl(normalized);
        if (imgur) return imgur;
        return isAllowedLessonImageUrl(normalized, opts) ? safeHttpUrl(normalized) : '';
    }
    if (kind === 'audio') {
        const local = resolveLocalLessonMediaPath(normalized, 'audio');
        if (local) return allowLocal ? local : '';
        return isAllowedLessonAudioUrl(normalized, opts) ? safeHttpUrl(normalized) : '';
    }
    if (kind === 'video') {
        const local = resolveLocalLessonMediaPath(normalized, 'video');
        if (local) return allowLocal ? local : '';
        return isAllowedLessonVideoUrl(normalized, opts) ? normalizeVideoEmbedUrl(normalized) : '';
    }
    return '';
}

export function safeHttpUrl(raw) {
    const s = String(raw != null ? raw : '').trim();
    if (!s) return '';
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s);
    if (!hasScheme) {
        if (s.startsWith('//')) return '';
        if (/[\u0000-\u001F\u007F]/.test(s)) return '';
        return s;
    }
    try {
        const u = new URL(s);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
        if (u.username || u.password) return '';
        return u.toString();
    } catch {
        return '';
    }
}

export function normalizeVideoEmbedUrl(raw) {
    const safe = safeHttpUrl(normalizeLocalMediaUrl(raw));
    if (!safe) return '';
    try {
        const u = new URL(safe);
        if (u.protocol !== 'https:') return '';
        const host = hostKey(u.hostname);
        if (host === 'youtu.be') {
            const id = u.pathname.replace(/^\//, '').split('/')[0];
            return id ? `https://www.youtube-nocookie.com/embed/${id}` : '';
        }
        if (isYouTubeHost(host)) {
            if (u.pathname.startsWith('/embed/')) {
                const id = u.pathname.replace(/^\/embed\//, '').split('/')[0];
                return id ? `https://www.youtube-nocookie.com/embed/${id}${u.search}` : '';
            }
            if (u.pathname.startsWith('/shorts/')) {
                const id = u.pathname.replace(/^\/shorts\//, '').split('/')[0];
                return id ? `https://www.youtube-nocookie.com/embed/${id}` : '';
            }
            if (u.pathname.startsWith('/live/')) {
                const id = u.pathname.replace(/^\/live\//, '').split('/')[0];
                return id ? `https://www.youtube-nocookie.com/embed/${id}` : '';
            }
            const id = u.searchParams.get('v');
            if (id) return `https://www.youtube-nocookie.com/embed/${id}`;
        }
        const vimeo = tryVimeoEmbedUrl(u);
        if (vimeo) return vimeo;
        const peertube = tryPeerTubeEmbedUrl(u);
        if (peertube) return peertube;
    } catch {
        /* ignore */
    }
    return '';
}

export function isThirdPartyVideoEmbedUrl(raw) {
    const embed = normalizeVideoEmbedUrl(raw) || String(raw || '').trim();
    if (!embed) return false;
    if (/youtube(?:-nocookie)?\.com\/embed/i.test(embed)) return true;
    if (/player\.vimeo\.com\/video\//i.test(embed)) return true;
    try {
        const u = new URL(embed);
        if (u.protocol !== 'https:') return false;
        return u.pathname.startsWith('/videos/embed/');
    } catch {
        return false;
    }
}

export const ELECTRON_YOUTUBE_EMBED_ORIGIN = 'https://arborito.org';

export function resolveVideoEmbedSrc(raw) {
    const local = resolveLocalLessonMediaPath(raw, 'video');
    if (local) return local;
    const embed = normalizeVideoEmbedUrl(raw) || String(raw || '').trim();
    if (!embed) return '';
    const ytId = extractYoutubeVideoId(raw) || extractYoutubeVideoId(embed);
    if (ytId && typeof window !== 'undefined' && window.arboritoElectron) {
        const u = new URL(`https://www.youtube.com/embed/${encodeURIComponent(ytId)}`);
        u.searchParams.set('origin', ELECTRON_YOUTUBE_EMBED_ORIGIN);
        u.searchParams.set('rel', '0');
        u.searchParams.set('modestbranding', '1');
        return u.toString();
    }
    return embed;
}

export function extractYoutubeVideoId(raw) {
    const safe = safeHttpUrl(raw);
    if (!safe) return '';
    try {
        const u = new URL(safe);
        const host = u.hostname.replace(/^www\./, '').toLowerCase();
        if (host === 'youtu.be') return u.pathname.replace(/^\//, '').split('/')[0] || '';
        if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
            if (u.pathname.startsWith('/embed/')) {
                return u.pathname.replace(/^\/embed\//, '').split('/')[0] || '';
            }
            if (u.pathname.startsWith('/shorts/')) {
                return u.pathname.replace(/^\/shorts\//, '').split('/')[0] || '';
            }
            if (u.pathname.startsWith('/live/')) {
                return u.pathname.replace(/^\/live\//, '').split('/')[0] || '';
            }
            return u.searchParams.get('v') || '';
        }
    } catch {
        /* ignore */
    }
    return '';
}
