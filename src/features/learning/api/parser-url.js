/** Image hosts with their own moderation (no arbitrary hotlinking). */
const ALLOWED_IMAGE_HOSTS = new Set([
    'i.imgur.com',
    'imgur.com',
    'upload.wikimedia.org',
    'commons.wikimedia.org',
    'images.unsplash.com',
    'cdn.pixabay.com',
    'pixabay.com',
    'live.staticflickr.com',
    'staticflickr.com',
    'media.giphy.com',
    'i.giphy.com',
    'giphy.com',
    'i.redd.it',
    'preview.redd.it',
    'raw.githubusercontent.com',
    'user-images.githubusercontent.com',
    'camo.githubusercontent.com',
    'archive.org',
]);

function hostKey(hostname) {
    return String(hostname || '')
        .replace(/^www\./, '')
        .toLowerCase();
}

/** @param {string} raw */
export function isAllowedLessonImageUrl(raw) {
    const safe = safeHttpUrl(raw);
    if (!safe) return false;
    try {
        const u = new URL(safe);
        if (u.protocol !== 'https:') return false;
        const host = hostKey(u.hostname);
        if (ALLOWED_IMAGE_HOSTS.has(host)) return true;
        if (host.endsWith('.wikimedia.org')) return true;
        if (host.endsWith('.githubusercontent.com')) return true;
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

function isYouTubeHost(host) {
    return (
        host === 'youtu.be' ||
        host === 'youtube.com' ||
        host === 'm.youtube.com' ||
        host === 'youtube-nocookie.com' ||
        host === 'www.youtube-nocookie.com'
    );
}

/** @param {string} raw */
export function isAllowedLessonVideoUrl(raw) {
    const embed = normalizeVideoEmbedUrl(raw);
    if (!embed) return false;
    return isThirdPartyVideoEmbedUrl(embed);
}

/** @param {'image'|'video'|'audio'} type @param {string} raw */
export function validateLessonMediaUrl(type, raw) {
    const kind = String(type || '').toLowerCase();
    if (kind === 'image') {
        return isAllowedLessonImageUrl(raw) ? safeHttpUrl(raw) : '';
    }
    if (kind === 'video') {
        return isAllowedLessonVideoUrl(raw) ? normalizeVideoEmbedUrl(raw) : '';
    }
    if (kind === 'audio') return safeHttpUrl(raw);
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

/** Normalize YouTube or PeerTube links to an embeddable player URL. */
export function normalizeVideoEmbedUrl(raw) {
    const safe = safeHttpUrl(raw);
    if (!safe) return '';
    try {
        const u = new URL(safe);
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
            const id = u.searchParams.get('v');
            if (id) return `https://www.youtube-nocookie.com/embed/${id}`;
        }
        const peertube = tryPeerTubeEmbedUrl(u);
        if (peertube) return peertube;
    } catch {
        /* ignore */
    }
    return '';
}

/** True when src is a YouTube or PeerTube player URL (not a direct .mp4 file). */
export function isThirdPartyVideoEmbedUrl(raw) {
    const embed = normalizeVideoEmbedUrl(raw) || String(raw || '').trim();
    if (!embed) return false;
    if (/youtube(?:-nocookie)?\.com\/embed/i.test(embed)) return true;
    try {
        const u = new URL(embed);
        return u.pathname.startsWith('/videos/embed/');
    } catch {
        return false;
    }
}

/** HTTPS origin/referer simulated for YouTube Error 153 under file:// (see electron-main session hooks). */
export const ELECTRON_YOUTUBE_EMBED_ORIGIN = 'https://arborito.org';

/** Best iframe/webview src for a stored lesson video URL. */
export function resolveVideoEmbedSrc(raw) {
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

/** Extract a YouTube video id from common watch/share/embed URLs. */
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
            return u.searchParams.get('v') || '';
        }
    } catch {
        /* ignore */
    }
    return '';
}
