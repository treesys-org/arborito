/**
 * Moderated + local media providers for lesson embeds.
 * Network hosts stay allowlisted; Local uses ./media/ (private .arborito only).
 * Brand labels stay untranslated; UX copy lives in locales.
 */

/** @typedef {{
 *   id: string,
 *   kinds: Array<'image'|'video'|'audio'>,
 *   label: string,
 *   example?: string,
 *   exampleByKind?: Partial<Record<'image'|'video'|'audio', string>>,
 *   hosts?: string[],
 *   local?: boolean,
 *   match: (host: string, url: URL | null, raw: string) => boolean
 * }} MediaProvider */

function hostKey(hostname) {
    return String(hostname || '')
        .replace(/^www\./, '')
        .toLowerCase();
}

function isLocalMediaRaw(raw) {
    const s = String(raw || '').trim();
    if (/^local:\/\/media\//i.test(s)) return true;
    const path = s.replace(/^\.\//, '').replace(/^\//, '');
    return /^media\/[A-Za-z0-9._-]+\.[A-Za-z0-9]+$/i.test(path);
}

/** Network providers first; Local always last in the picker. */
/** @type {MediaProvider[]} */
export const LESSON_MEDIA_PROVIDERS = [
    {
        id: 'youtube',
        kinds: ['video'],
        label: 'YouTube',
        example: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
        hosts: ['youtube.com', 'youtu.be', 'm.youtube.com', 'youtube-nocookie.com'],
        match: (host) =>
            host === 'youtu.be' ||
            host === 'youtube.com' ||
            host === 'm.youtube.com' ||
            host === 'youtube-nocookie.com',
    },
    {
        id: 'peertube',
        kinds: ['video'],
        label: 'PeerTube',
        example: 'https://framatube.org/w/…',
        match: (_host, url) => {
            if (!url) return false;
            const path = url.pathname || '';
            return (
                path.startsWith('/videos/embed/') ||
                path.startsWith('/videos/watch/') ||
                path.startsWith('/w/')
            );
        },
    },
    {
        id: 'vimeo',
        kinds: ['video'],
        label: 'Vimeo',
        example: 'https://vimeo.com/…',
        hosts: ['vimeo.com', 'player.vimeo.com'],
        match: (host) => host === 'vimeo.com' || host === 'player.vimeo.com',
    },
    {
        id: 'imgur',
        kinds: ['image'],
        label: 'Imgur',
        example: 'https://imgur.com/gallery/… or https://i.imgur.com/….gif',
        hosts: ['imgur.com', 'i.imgur.com'],
        match: (host) => host === 'imgur.com' || host === 'i.imgur.com',
    },
    {
        id: 'wikimedia',
        kinds: ['image', 'audio'],
        label: 'Wikimedia',
        example: 'https://upload.wikimedia.org/…',
        hosts: ['upload.wikimedia.org', 'commons.wikimedia.org'],
        match: (host) =>
            host === 'upload.wikimedia.org' ||
            host === 'commons.wikimedia.org' ||
            host.endsWith('.wikimedia.org'),
    },
    {
        id: 'unsplash',
        kinds: ['image'],
        label: 'Unsplash',
        example: 'https://images.unsplash.com/…',
        hosts: ['images.unsplash.com'],
        match: (host) => host === 'images.unsplash.com',
    },
    {
        id: 'archive',
        kinds: ['audio'],
        label: 'Internet Archive',
        example: 'https://archive.org/download/…/file.mp3',
        hosts: ['archive.org'],
        match: (host) => host === 'archive.org',
    },
    {
        id: 'local',
        kinds: ['image', 'video', 'audio'],
        label: 'Local',
        local: true,
        exampleByKind: {
            image: './media/foto.png',
            video: './media/clip.mp4',
            audio: './media/pista.mp3',
        },
        match: (_host, _url, raw) => isLocalMediaRaw(raw),
    },
];

function hostsForKinds(kinds) {
    const want = new Set(kinds);
    const out = new Set();
    for (const p of LESSON_MEDIA_PROVIDERS) {
        if (p.local || !p.hosts) continue;
        if (!p.kinds.some((k) => want.has(k))) continue;
        for (const h of p.hosts) out.add(h);
    }
    return out;
}

export const ALLOWED_LESSON_IMAGE_HOSTS = hostsForKinds(['image']);
export const ALLOWED_LESSON_AUDIO_HOSTS = hostsForKinds(['audio']);

/** Default network provider when inserting a new media block (never Local). */
export function defaultMediaProviderId(type) {
    const kind = String(type || '').toLowerCase();
    if (kind === 'video') return 'youtube';
    if (kind === 'audio') return 'archive';
    return 'imgur';
}

/** @param {'image'|'video'|'audio'} type */
export function providersForMediaType(type) {
    const kind = String(type || '').toLowerCase();
    const list = LESSON_MEDIA_PROVIDERS.filter((p) =>
        p.kinds.includes(/** @type {'image'|'video'|'audio'} */ (kind))
    );
    return [...list.filter((p) => !p.local), ...list.filter((p) => p.local)];
}

/** @param {string} raw @returns {string} */
export function detectMediaProviderId(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (isLocalMediaRaw(s)) return 'local';
    try {
        const u = new URL(s);
        if (u.protocol !== 'https:') return '';
        const host = hostKey(u.hostname);
        for (const p of LESSON_MEDIA_PROVIDERS) {
            if (p.local) continue;
            if (p.match(host, u, s)) return p.id;
        }
    } catch {
        /* ignore */
    }
    return '';
}

/** @param {string} id */
export function mediaProviderById(id) {
    return LESSON_MEDIA_PROVIDERS.find((p) => p.id === id) || null;
}

/** @param {MediaProvider} provider @param {'image'|'video'|'audio'} type */
export function mediaProviderExample(provider, type) {
    if (!provider) return '';
    if (provider.exampleByKind && provider.exampleByKind[type]) return provider.exampleByKind[type];
    return provider.example || '';
}
