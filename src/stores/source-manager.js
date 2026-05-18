import { store } from '../store.js';
import { parseNostrTreeUrl, formatNostrTreeUrl, isNostrNetworkAvailable } from '../services/nostr-refs.js';
import { isNostrTreeMaintainerBlocked } from '../config/maintainer-nostr-tree-blocklist.js';
import { DEFAULT_BOOT_SOURCE } from '../config/official-tree.js';
import { resolveTreeInput } from '../config/tree-aliases.js';
import { getManifestDiscoveryRoots, expandLibraryHttpsAlternates } from '../config/library-mirrors.js';
import { DEFAULT_NOSTR_RELAYS, normalizeNostrRelayUrls } from '../config/nostr-relays-runtime.js';
import { fetchHttpText, fetchHttpTextTryUrls } from '../utils/http-fetch.js';

const OFFICIAL_DOMAINS = ['localhost', '127.0.0.1'];

function expandIpfsAlternates(url) {
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

export class SourceManager {
    constructor(updateStateCallback, uiCallback) {
        this.update = updateStateCallback;
        this.getUi = uiCallback;
        this.state = {
            communitySources: [],
            activeSource: null,
            availableReleases: [],
            manifestUrlAttempted: null,
            loading: true,
            error: null
        };
    }

    // --- Boot ---

    async init() {
        const shareSource = await this._handleShareParam();
        if (shareSource !== undefined) return shareSource;

        let localSources = this._loadAndMigrateSources();
        this.update({ communitySources: localSources });
        this.state.communitySources = localSources;

        let activeSource = this._loadActiveSourceMeta(localSources);

        if (!activeSource) {
            try {
                const { restoreTreeFromUrl } = await import('../utils/url-router.js');
                const fromHash = restoreTreeFromUrl();
                if (fromHash) activeSource = fromHash;
            } catch {
                /* ignore */
            }
        }

        if (!activeSource) {
            if (this._isLoopback()) {
                const local = await this._checkLocalBoot();
                if (local) return local;
            }
            return DEFAULT_BOOT_SOURCE;
        }
        return activeSource;
    }

    async getDefaultSource() {
        if (this._isLoopback()) {
            const local = await this._checkLocalBoot();
            if (local) return local;
        }
        return DEFAULT_BOOT_SOURCE;
    }

    _isLoopback() {
        const h = window.location.hostname;
        if (h !== 'localhost' && h !== '127.0.0.1') return false;
        try {
            const params = new URLSearchParams(window.location.search);
            if (params.get('localBoot') === '1') return true;
            return localStorage.getItem('arborito-local-boot') === 'true';
        } catch {
            return false;
        }
    }

    async _checkLocalBoot() {
        try {
            const check = await fetch('./data/data.json', { method: 'HEAD' });
            if (check.ok) {
                return { id: 'local-boot', name: 'Local Workspace', url: './data/data.json', isTrusted: true, type: 'rolling' };
            }
        } catch { /* no local data */ }
        return null;
    }

    // --- Share param (?source= or ?code= from publish short link) ---

    async _handleShareParam() {
        const params = new URLSearchParams(window.location.search);
        let raw = params.get('source');
        if (!raw) {
            const c = params.get('code');
            /* Post-publish link: ?code=XXXX-XXXX/tree=name/location=arb-xxxx (only the code segment matters). */
            if (c) raw = String(c).trim().split('/')[0];
        }
        if (!raw) return undefined;
        try {
            const decoded = decodeURIComponent(raw);
            const resolved = resolveTreeInput(decoded);
            if (resolved.kind === 'unknown_alias') {
                console.warn('Unknown tree alias in ?source=', resolved.tried);
                return undefined;
            }
            if (resolved.kind === 'empty') return undefined;

            let href = null;
            if (resolved.kind === 'code') {
                try {
                    const ref = await store.nostr.resolveTreeShareCode(resolved.code);
                    if (ref) {
                        if (ref.recommendedRelays && ref.recommendedRelays.length) {
                            // Transparent P2P: prefer relays recommended by the publisher (signed via share-code).
                            const n = normalizeNostrRelayUrls(ref.recommendedRelays);
                            if (n.length) store.nostr.setPeers(n);
                        }
                        href = formatNostrTreeUrl(ref.pub, ref.universeId);
                    }
                } catch (e) {
                    console.warn('Share code lookup failed (Relays may be unavailable).', e);
                }
            } else {
                href = resolved.kind === 'resolved' ? resolved.url
                     : resolved.kind === 'raw' ? resolved.value
                     : null;
            }
            if (!href) return undefined;

            const treeRef = parseNostrTreeUrl(href);
            if (treeRef && isNostrTreeMaintainerBlocked(treeRef.pub, treeRef.universeId)) {
                try {
                    store.notify(
                        store.ui.maintainerBlocklistLoadRefused ||
                            'This tree is blocked in this app build (maintainer list).',
                        true
                    );
                } catch {
                    /* ignore */
                }
                return undefined;
            }
            const normalizedUrl = treeRef ? formatNostrTreeUrl(treeRef.pub, treeRef.universeId) : href;
            const name = resolved.kind === 'code' ? `Code ${resolved.code}`
                       : resolved.kind === 'resolved' ? resolved.displayName
                       : treeRef ? `Public · ${String(treeRef.pub).slice(0, 10)}…`
                       : new URL(href, window.location.href).hostname;

            const sourceObject = {
                id: `shared-${Date.now()}`,
                name,
                url: normalizedUrl,
                isTrusted: this.isUrlTrusted(normalizedUrl),
                type: 'shared',
                _fromShareParam: true
            };

            if (sourceObject.isTrusted) return sourceObject;
            this.update({ pendingUntrustedSource: sourceObject, modal: { type: 'load-warning' } });
            return null;
        } catch (e) {
            console.warn('Invalid source URL parameter', e);
            return undefined;
        }
    }

    // --- Source persistence ---

    _loadAndMigrateSources() {
        let sources = [];
        try { sources = JSON.parse(localStorage.getItem('arborito-sources')) || []; } catch { /* ignore */ }
        return sources;
    }

    _loadActiveSourceMeta(localSources) {
        let activeSource = null;
        try {
            const saved = localStorage.getItem('arborito-active-source-meta');
            if (saved) activeSource = JSON.parse(saved);
        } catch { /* ignore */ }

        if (!activeSource) {
            const savedId = localStorage.getItem('arborito-active-source-id');
            if (savedId) {
                activeSource = localSources.find((s) => s.id === savedId);
                if (!activeSource && savedId.startsWith('local-')) {
                    activeSource = { id: savedId, name: 'My Private Garden', url: `local://${savedId}`, type: 'local' };
                }
            }
        }
        return activeSource;
    }

    // --- Trust ---

    isUrlTrusted(urlStr) {
        if (parseNostrTreeUrl(urlStr)) return false;
        try {
            const url = new URL(urlStr, window.location.href);
            return OFFICIAL_DOMAINS.includes(url.hostname);
        } catch {
            return false;
        }
    }

    // --- Community source CRUD ---

    /** Same canonical URL (normalized nostr:// or absolute HTTPS) for duplicate detection. */
    _canonicalCommunityUrl(urlStr) {
        const g = parseNostrTreeUrl(urlStr);
        if (g) return formatNostrTreeUrl(g.pub, g.universeId);
        try {
            return new URL(urlStr, window.location.href).href;
        } catch {
            return String(urlStr || '').trim();
        }
    }

    addCommunitySource(rawInput, opts = {}) {
        if (opts.resolvedNostrTreeUrl) {
            const treeRef = parseNostrTreeUrl(opts.resolvedNostrTreeUrl);
            if (!treeRef) return { ok: false, reason: 'bad_url' };
            if (isNostrTreeMaintainerBlocked(treeRef.pub, treeRef.universeId)) return { ok: false, reason: 'maintainer_blocklist' };
            const url = formatNostrTreeUrl(treeRef.pub, treeRef.universeId);
            const lm = opts.listMeta && typeof opts.listMeta === 'object' ? opts.listMeta : null;
            const titleFromList = lm && String(lm.title || '').trim();
            const authorFromList = lm && String(lm.authorName || '').trim();
            const descFromList = lm && String(lm.description || '').trim();
            const relayHint = normalizeNostrRelayUrls(
                Array.isArray(opts.recommendedRelays) ? opts.recommendedRelays : []
            );
            const newSource = {
                id: crypto.randomUUID(),
                name:
                    titleFromList ||
                    (opts.codeLabel ? `Code ${opts.codeLabel}` : `Public · ${String(treeRef.pub).slice(0, 10)}…`),
                url,
                isTrusted: this.isUrlTrusted(url),
                isOfficial: false,
                type: 'community',
                origin: 'nostr',
                shareCode: opts.codeLabel || null,
                listAuthorName: authorFromList || '',
                listDescription: descFromList || '',
                ...(relayHint.length ? { recommendedRelays: relayHint } : {})
            };
            return this._appendSource(newSource);
        }

        const trimmed = String(rawInput || '').trim();
        if (!trimmed) return null;
        const resolved = resolveTreeInput(trimmed);
        if (resolved.kind === 'unknown_alias') return { ok: false, reason: 'unknown_alias', tried: resolved.tried };
        if (resolved.kind === 'empty') return null;
        if (resolved.kind === 'code') return { ok: false, reason: 'code' };

        const effective = resolved.kind === 'resolved' ? resolved.url : resolved.kind === 'raw' ? resolved.value : trimmed;
        const parsedNostr = parseNostrTreeUrl(effective);
        let url, name, origin;
        if (parsedNostr) {
            if (isNostrTreeMaintainerBlocked(parsedNostr.pub, parsedNostr.universeId)) return { ok: false, reason: 'maintainer_blocklist' };
            url = formatNostrTreeUrl(parsedNostr.pub, parsedNostr.universeId);
            origin = 'nostr';
            name = resolved.kind === 'resolved' ? resolved.displayName : `Public · ${String(parsedNostr.pub).slice(0, 10)}…`;
        } else {
            try {
                url = new URL(effective, window.location.href).href;
                name = new URL(url, window.location.href).hostname;
                origin = 'https';
            } catch {
                return { ok: false, reason: 'bad_url' };
            }
        }

        const relayHintPaste = normalizeNostrRelayUrls(
            Array.isArray(opts.recommendedRelays) ? opts.recommendedRelays : []
        );
        const nostrRelays = parsedNostr && relayHintPaste.length ? { recommendedRelays: relayHintPaste } : {};
        return this._appendSource({
            id: crypto.randomUUID(),
            name,
            url,
            isTrusted: this.isUrlTrusted(url),
            isOfficial: false,
            type: 'community',
            origin,
            ...nostrRelays
        });
    }

    _appendSource(src) {
        const canon = this._canonicalCommunityUrl(src.url);
        const dup = this.state.communitySources.find((s) => this._canonicalCommunityUrl(s.url) === canon);
        if (dup) {
            return { ok: false, reason: 'duplicate', existing: dup };
        }
        const newSources = [...this.state.communitySources, src];
        this.update({ communitySources: newSources });
        this.state.communitySources = newSources;
        localStorage.setItem('arborito-sources', JSON.stringify(newSources));
        return { ok: true, source: src };
    }

    removeCommunitySource(id) {
        const newSources = this.state.communitySources.filter((s) => s.id !== id);
        this.update({ communitySources: newSources });
        this.state.communitySources = newSources;
        localStorage.setItem('arborito-sources', JSON.stringify(newSources));
    }

    // --- Data loading ---

    async discoverManifest(sourceUrl) {
        if (!sourceUrl || sourceUrl.startsWith('local://') || parseNostrTreeUrl(sourceUrl)) {
            this.update({ availableReleases: [], manifestUrlAttempted: null });
            return [];
        }
        try {
            const roots = getManifestDiscoveryRoots(sourceUrl);
            for (const abs of roots) {
                const candidates = [...new Set([
                    new URL('arborito-index.json', abs).href,
                    new URL('../arborito-index.json', abs).href,
                    ...(abs.toLowerCase().includes('/data/')
                        ? [`${abs.substring(0, abs.toLowerCase().lastIndexOf('/data/'))}/data/arborito-index.json`]
                        : [])
                ])];
                for (const url of candidates) {
                    try {
                        const text = await fetchHttpText(`${url}?t=${Date.now()}`, { timeoutMs: 15000 });
                        const manifest = JSON.parse(text);
                        const base = new URL('./', url).href;
                        const rebase = (u) => (u && u.startsWith('./') ? new URL(u, base).href : u);
                        const versions = [];
                        if (manifest.rolling) versions.push({ ...manifest.rolling, url: rebase(manifest.rolling.url), type: 'rolling' });
                        if (Array.isArray(manifest.releases)) versions.push(...manifest.releases.map((r) => ({ ...r, url: rebase(r.url), type: 'archive' })));
                        this.update({ availableReleases: versions, manifestUrlAttempted: url });
                        return versions;
                    } catch { /* try next */ }
                }
            }
            this.update({ availableReleases: [], manifestUrlAttempted: roots.join(' | ') });
            return [];
        } catch {
            this.update({ availableReleases: [] });
            return [];
        }
    }

    /**
     * Synchronous read of local garden (no await → another loadData cannot interleave between steps).
     * @returns {{ json: object, finalSource: object }}
     */
    readLocalTreeSync(source) {
        if (!(source && source.url) || !String(source.url).startsWith('local://')) {
            throw new Error('Invalid local tree source.');
        }
        const afterScheme = String(source.url).slice('local://'.length);
        const id = afterScheme.split('/')[0];
        if (!id) {
            throw new Error('Invalid local tree source.');
        }
        const treeEntry = store.userStore.state.localTrees.find((t) => t.id === id);
        if (!(treeEntry && treeEntry.data)) {
            throw new Error('Local tree not found.');
        }
        const releaseId =
            source.type === 'archive' && source.localArchiveReleaseId != null
                ? String(source.localArchiveReleaseId)
                : '';
        let data = treeEntry.data;
        if (releaseId) {
            const snap = (treeEntry.releaseSnapshots ? treeEntry.releaseSnapshots[releaseId] : undefined);
            if (!snap) {
                const ui = store.ui || {};
                throw new Error(
                    ui.releasesLocalSnapshotMissing ||
                        'That version has no saved snapshot in this garden yet.'
                );
            }
            data = JSON.parse(JSON.stringify(snap));
        }
        this.update({ availableReleases: [] });
        const finalSource = { ...source, url: `local://${id}` };
        if (releaseId) {
            finalSource.type = 'archive';
            finalSource.localArchiveReleaseId = releaseId;
        } else {
            finalSource.type = 'local';
            delete finalSource.localArchiveReleaseId;
        }
        if (data.universeName && data.universeName !== source.name) finalSource.name = data.universeName;
        return { json: data, finalSource };
    }

    /**
     * Nostr + HTTPS/manifest. No incluye local:// (va por readLocalTreeSync en el store).
     */
    async loadData(source, currentLang = 'EN', forceRefresh = true, existingRawData = null) {
        if (!source) return { json: null, finalSource: source };

        // --- public universe ---
        const treeRef = parseNostrTreeUrl(source.url);
        if (treeRef) {
            if (
                !forceRefresh &&
                existingRawData &&
                store.state.activeSource &&
                store.state.activeSource.id === source.id
            ) {
                const shareCode = (((existingRawData && existingRawData.meta) ? existingRawData.meta.shareCode : undefined) != null ? ((existingRawData && existingRawData.meta) ? existingRawData.meta.shareCode : undefined) : (source.shareCode != null ? source.shareCode : null));
                return {
                    json: existingRawData,
                    finalSource: { ...source, origin: 'nostr', isTrusted: source.isTrusted === true, shareCode }
                };
            }
            if (!isNostrNetworkAvailable()) {
                const ui = typeof this.getUi === 'function' ? this.getUi() : {};
                const msg =
                    ui.nostrNotLoadedHint ||
                    'Nostr client is not loaded (Nostr client missing or failed to load). Check network and CSP.';
                throw new Error(msg);
            }
            try {
                const ui = store.ui || {};
                const relayHint = normalizeNostrRelayUrls(
                    Array.isArray(source.recommendedRelays) ? source.recommendedRelays : []
                );
                if (relayHint.length) {
                    store.nostr.setPeers(
                        normalizeNostrRelayUrls([
                            ...relayHint,
                            ...(Array.isArray(store.nostr.peers) ? store.nostr.peers : []),
                            ...DEFAULT_NOSTR_RELAYS
                        ])
                    );
                }
                const { revoked, bundle } = await store.nostr.loadNostrUniverseBundle(treeRef);
                if (revoked) throw new Error(ui.nostrUniverseRevokedError || 'This public tree was retracted by the publisher.');
                if (!bundle) throw new Error(ui.nostrLoadFailedError || 'Failed to load public tree.');
                const fmtOk =
                    (bundle.meta && bundle.meta.nostrBundleFormat === 2) ||
                    (bundle.meta && bundle.meta.nostrBundleFormat === 2);
                if (!fmtOk) {
                    throw new Error(
                        ui.nostrBundleFormatUnsupported ||
                            'This public tree uses an unsupported package format. The author must republish with the current Arborito.'
                    );
                }
                /* Forum: bundle carries empty stub; published snapshot in chunks.forum.* and live state in forum.*.
                 * Hydrated when opening the modal (`store.hydrateTreeForumIfNeeded`). */
                await store.loadNetworkProgressIntoUserStore(treeRef);
                await store.maybeNotifyNetworkAccountRemoved(treeRef);
                this.update({ availableReleases: [], manifestUrlAttempted: null });
                const shareCode = ((bundle && bundle.meta) ? bundle.meta.shareCode : undefined) || null;
                return {
                    json: bundle,
                    finalSource: { ...source, origin: 'nostr', isTrusted: source.isTrusted === true, shareCode }
                };
            } catch (e) {
                throw e instanceof Error ? e : new Error(String((e && e.message) || e));
            }
        }

        if (source.url && String(source.url).startsWith('local://')) {
            return this.readLocalTreeSync(source);
        }

        // --- HTTPS / manifest ---
        const ipfsExpanded = expandIpfsAlternates(source.url);
        if (ipfsExpanded.length && ipfsExpanded[0] !== String(source.url || '')) {
            try {
                const text = await fetchHttpTextTryUrls(ipfsExpanded, { timeoutMs: 20000 });
                const json = JSON.parse(text);
                return { json, finalSource: { ...source, url: String(source.url), origin: 'ipfs' } };
            } catch (e) {
                // Fall through to regular HTTPS logic.
                console.warn('IPFS gateway load failed; falling back to HTTPS/manifest', e);
            }
        }

        const versions = await this.discoverManifest(source.url);
        let urlToFetch = source.url;
        let finalObj = { ...source };

        if ((versions && versions.length)) {
            const archives = versions.filter((v) => v.type === 'archive');
            const isExplicit = source.type === 'archive' || source.type === 'rolling';
            if (!isExplicit && archives.length) {
                archives.sort((a, b) => b.id.localeCompare(a.id));
                const latest = archives[0];
                urlToFetch = latest.url;
                finalObj = { ...source, id: `${source.id}-${latest.id}`, name: latest.name || `${source.name} (${latest.id})`, url: latest.url, type: 'archive' };
            }
        }

        try {
            let json;
            if (!forceRefresh && existingRawData && (store.state.activeSource && store.state.activeSource.id) === source.id) {
                json = existingRawData;
            } else {
                const text = await fetchHttpTextTryUrls(expandLibraryHttpsAlternates(urlToFetch), { timeoutMs: 20000 });
                try {
                    json = JSON.parse(text);
                } catch {
                    throw new Error(`Response from ${finalObj.name} is not valid JSON.`);
                }
            }
            if (json.universeName && json.universeName !== finalObj.name && finalObj.type !== 'archive') {
                const updated = this.state.communitySources.map((s) => s.id === source.id ? { ...s, name: json.universeName } : s);
                this.update({ communitySources: updated });
                localStorage.setItem('arborito-sources', JSON.stringify(updated));
                finalObj.name = json.universeName;
            }
            return { json, finalSource: finalObj };
        } catch (e) {
            console.error(e);
            const ui = typeof this.getUi === 'function' ? this.getUi() : {};
            let msg = e && e.message ? e.message : String(e);
            if (
                /Failed to fetch|NetworkError|Load failed|CORS/i.test(msg)
                && typeof window !== 'undefined'
                && (window.location && window.location.protocol) === 'file:'
                && !window.arboritoElectron
            ) {
                msg += ' Abre la app con un servidor local (p. ej. http://localhost:8000) en lugar de abrir el HTML a archivo suelto; el navegador bloquea muchas peticiones HTTPS desde file://.';
            } else if (/SSL|TLS|protocol|ERR_SSL|certificate|ssl|secure connection/i.test(msg)) {
                msg += ` ${ui.fetchSslTlsHint || ''}`;
            }
            throw new Error(msg.trim());
        }
    }
}
