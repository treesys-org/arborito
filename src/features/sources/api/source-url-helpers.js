import { parseNostrTreeUrl, formatNostrTreeUrl } from '../../nostr/api/nostr-refs.js';
import { fetchHttpTextTryUrls } from '../../../shared/lib/http-fetch.js';

const OFFICIAL_DOMAINS = ['localhost', '127.0.0.1'];

export function expandIpfsAlternates(url) {
    const u = String(url || '').trim();
    if (!u) return [];
    const m = u.match(/^(ipfs|ipns):\/\/(.+)$/i);
    if (!m) return [u];
    const proto = m[1].toLowerCase();
    const rest = m[2].replace(/^\/+/, '');
    const parts = rest.split('/');
    const root = parts[0];
    const path = parts.slice(1).join('/');
    const suffix = path ? `/${path}` : '';
    const gateways = [
        `https://ipfs.io/${proto}/${root}${suffix}`,
        `https://cloudflare-ipfs.com/${proto}/${root}${suffix}`,
        `https://dweb.link/${proto}/${root}${suffix}`,
        // Subdomain gateway only for ipfs (CID); keep it as a last try.
        ...(proto === 'ipfs' ? [`https://${root}.ipfs.dweb.link${suffix}`] : [])
    ];
    return gateways;
}

/** Official / local hosts only (never treat nostr:// as trusted HTTPS). */
export function isUrlTrusted(urlStr) {
    if (parseNostrTreeUrl(urlStr)) return false;
    try {
        const url = new URL(urlStr, window.location.href);
        return OFFICIAL_DOMAINS.includes(url.hostname);
    } catch {
        return false;
    }
}

/** Same canonical URL (normalized nostr:// or absolute HTTPS) for duplicate detection. */
export function canonicalCommunityUrl(urlStr) {
    const g = parseNostrTreeUrl(urlStr);
    if (g) return formatNostrTreeUrl(g.pub, g.universeId);
    try {
        return new URL(urlStr, window.location.href).href;
    } catch {
        return String(urlStr || '').trim();
    }
}

/**
 * Try IPFS/IPNS gateways; return null to fall through to HTTPS/manifest.
 * @param {{ url?: string }} source
 * @returns {Promise<{ json: object, finalSource: object }|null>}
 */
export async function tryLoadIpfsSourceJson(source) {
    const ipfsExpanded = expandIpfsAlternates(source?.url);
    if (!ipfsExpanded.length || ipfsExpanded[0] === String(source?.url || '')) return null;
    try {
        const text = await fetchHttpTextTryUrls(ipfsExpanded, { timeoutMs: 20000 });
        const json = JSON.parse(text);
        return { json, finalSource: { ...source, url: String(source.url), origin: 'ipfs' } };
    } catch (e) {
        console.warn('IPFS gateway load failed; falling back to HTTPS/manifest', e);
        return null;
    }
}
