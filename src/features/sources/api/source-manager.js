import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { parseNostrTreeUrl, formatNostrTreeUrl, isNostrNetworkAvailable } from '../../nostr/api/nostr-refs.js';
import { isNostrTreeMaintainerBlocked } from '../../nostr/api/maintainer-nostr-tree-blocklist.js';
import { migrateLegacyBranchId, normalizeBranchActiveSource } from '../../../shared/lib/branch-id.js';
import { DEFAULT_BOOT_SOURCE } from './official-tree.js';
import { resolveTreeInput } from './tree-aliases.js';
import { getManifestDiscoveryRoots, expandLibraryHttpsAlternates, resolveEditionManifestUrl } from './library-mirrors.js';
import { normalizeReleaseUrl, releaseEditionKey } from '../../version-updates/api/version-switch-logic.js';
import { applyMergedRelaysToService, loadUserNostrRelays, mergeNostrRelayUrls, normalizeNostrRelayUrls, persistUserNostrRelays, SUGGESTED_NOSTR_RELAYS } from '../../nostr/api/nostr-relays-runtime.js';
import { fetchHttpText, fetchHttpTextTryUrls } from '../../../shared/lib/http-fetch.js';
import {
    loadCommunitySources,
    replaceCommunitySources,
} from '../../../shared/lib/arborito-catalog-store.js';
import {
    ensureConnectedNostr,
    hasGdprNetworkConsent,
} from '../../../shared/lib/connected-services/index.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import {
    clearActiveSourcePointer,
    localActiveSourceStillExists,
} from './active-source-pointer.js';
import { bundledDemoBootSource } from '../../../core/demo/seed-arborito-demo.js';

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
            loading: true,
            error: null
        };
    }

    // --- Boot ---

    async init() {
        const shareSource = await this._handleShareParam();
        if (shareSource !== undefined) return shareSource;

        let localSources = await this._loadCommunitySources();
        this.update({ communitySources: localSources });
        this.state.communitySources = localSources;

        let activeSource = this._loadActiveSourceMeta(localSources);

        if (!activeSource) {
            if (this._isLoopback()) {
                const local = await this._checkLocalBoot();
                if (local) return local;
            }
            const demo = bundledDemoBootSource(store.userStore);
            if (demo) return demo;
            return DEFAULT_BOOT_SOURCE;
        }
        return activeSource;
    }

    async getDefaultSource() {
        if (this._isLoopback()) {
            const local = await this._checkLocalBoot();
            if (local) return local;
        }
        const demo = bundledDemoBootSource(store.userStore);
        if (demo) return demo;
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
            /* Post-publish link: ?code=XXXX-XXXX (only the code segment is used). */
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
            let shareCodeLookupFailed = false;
            if (resolved.kind === 'code') {
                try {
                    await ensureConnectedNostr(store, { timeoutMs: 6000 });
                    const ref = await store.nostr?.resolveTreeShareCode(resolved.code);
                    if (ref) {
                        if (ref.recommendedRelays && ref.recommendedRelays.length) {
                            const merged = applyMergedRelaysToService(store.nostr, ref.recommendedRelays);
                            if (merged.length) persistUserNostrRelays(merged);
                        }
                        href = formatNostrTreeUrl(ref.pub, ref.universeId);
                    } else {
                        shareCodeLookupFailed = true;
                    }
                } catch (e) {
                    shareCodeLookupFailed = true;
                    console.warn('Share code lookup failed (Relays may be unavailable).', e);
                }
                if (shareCodeLookupFailed) {
                    const ui = store.ui || {};
                    if (!loadUserNostrRelays().length) {
                        store.notify(
                            ui.nostrRelaysRequired ||
                                'Configure at least one relay in Profile or accept the network during onboarding to use online features.',
                            true
                        );
                    } else {
                        store.notify(
                            (ui.shareCodeLookupFailed || 'Share code "{code}" could not be resolved. Check relays and try again.').replace(
                                /\{code\}/g,
                                resolved.code
                            ),
                            true
                        );
                    }
                    return undefined;
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

    async _loadCommunitySources() {
        try {
            return await loadCommunitySources();
        } catch {
            return [];
        }
    }

    _persistCommunitySources() {
        void replaceCommunitySources(this.state.communitySources || []);
    }

    _loadActiveSourceMeta(localSources) {
        let activeSource = null;
        try {
            const saved = localStorage.getItem('arborito-active-source-meta');
            if (saved) activeSource = normalizeBranchActiveSource(JSON.parse(saved));
        } catch { /* ignore */ }

        if (!activeSource) {
            const savedId = localStorage.getItem('arborito-active-source-id');
            if (savedId) {
                const branchId = migrateLegacyBranchId(savedId);
                activeSource = localSources.find((s) => s.id === branchId);
                if (!activeSource && branchId.startsWith('branch-')) {
                    activeSource = { id: branchId, name: 'My Private Garden', url: `branch://${branchId}`, type: 'branch' };
                }
            }
        } else {
            activeSource = normalizeBranchActiveSource(activeSource);
        }

        if (!activeSource) return null;

        if (!localActiveSourceStillExists(activeSource, store.userStore)) {
            clearActiveSourcePointer();
            return null;
        }

        if (!activeSource.url) {
            clearActiveSourcePointer();
            try {
                store.notify(
                    store.ui?.activeSourceMetaCorrupt ||
                        'Saved tree pointer was invalid and has been cleared.',
                    true
                );
            } catch { /* ignore */ }
            return null;
        }

        if (activeSource.type === 'community' && activeSource.id) {
            const byId = localSources.find((s) => s.id === activeSource.id);
            if (!byId) {
                const canon = this._canonicalCommunityUrl(activeSource.url);
                const byUrl = localSources.find(
                    (s) => this._canonicalCommunityUrl(s.url) === canon
                );
                if (byUrl) {
                    activeSource = byUrl;
                }
                /* Keep meta with url when not in catalog, mount can retry (flaky Nostr). */
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
            const iconFromList = lm && String(lm.icon || '').trim().slice(0, 32);
            const titlesFromList =
                lm?.titles && typeof lm.titles === 'object' && !Array.isArray(lm.titles) ? lm.titles : null;
            const descriptionsFromList =
                lm?.descriptions && typeof lm.descriptions === 'object' && !Array.isArray(lm.descriptions)
                    ? lm.descriptions
                    : null;
            const langsFromList = Array.isArray(lm?.languages)
                ? lm.languages.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean)
                : [];
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
                ...(iconFromList ? { icon: iconFromList } : {}),
                ...(titlesFromList ? { titles: titlesFromList } : {}),
                ...(descriptionsFromList ? { descriptions: descriptionsFromList } : {}),
                ...(langsFromList.length ? { languages: langsFromList } : {}),
                ...(String(lm?.contentKind || opts.contentKind || '').trim() ||
                String(treeRef.universeId || '').startsWith('tre-')
                    ? {
                          contentKind:
                              String(lm?.contentKind || opts.contentKind || '').trim() || 'composed-tree',
                      }
                    : {}),
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
        this._persistCommunitySources();
        try { store.publishInstalledSourcesForAccount?.(); } catch { /* ignore */ }
        return { ok: true, source: src };
    }

    removeCommunitySource(id) {
        const newSources = this.state.communitySources.filter((s) => s.id !== id);
        this.update({ communitySources: newSources });
        this.state.communitySources = newSources;
        this._persistCommunitySources();
        try { store.publishInstalledSourcesForAccount?.(); } catch { /* ignore */ }
    }

    /**
     * Merge catalog metadata onto an installed community source (e.g. backfill icon after load).
     * @param {string} id
     * @param {{ icon?: string, name?: string }} patch
     */
    patchCommunitySourceMeta(id, patch = {}) {
        const sid = String(id || '').trim();
        if (!sid || !patch || typeof patch !== 'object') return false;
        const list = Array.isArray(this.state.communitySources) ? this.state.communitySources : [];
        const idx = list.findIndex((s) => String(s?.id) === sid);
        if (idx < 0) return false;
        const cur = list[idx];
        const next = { ...cur };
        let changed = false;
        const icon = String(patch.icon || '').trim().slice(0, 32);
        if (icon && String(cur.icon || '').trim() !== icon) {
            next.icon = icon;
            changed = true;
        }
        const name = String(patch.name || '').trim();
        if (name && String(cur.name || '').trim() !== name) {
            next.name = name;
            changed = true;
        }
        if (!changed) return false;
        const newSources = list.slice();
        newSources[idx] = next;
        this.update({ communitySources: newSources });
        this.state.communitySources = newSources;
        this._persistCommunitySources();
        return true;
    }

    /**
     * Re-render hook so private-synced local trees in the sources
     * modal pick up changes (the trees themselves live in
     * `userStore.state.branches` with a `privateSyncedFromAccount` flag).
     */
    refreshPrivateAccountSources() {
        this.update({});
    }

    // --- Data loading ---

    async discoverManifest(sourceUrl) {
        const manifestUrl = resolveEditionManifestUrl(sourceUrl);
        if (!manifestUrl || manifestUrl.startsWith('branch://') || parseNostrTreeUrl(manifestUrl)) {
            this.update({ availableReleases: [] });
            return [];
        }
        try {
            const roots = getManifestDiscoveryRoots(manifestUrl);
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
                        this.update({ availableReleases: versions });
                        return versions;
                    } catch { /* try next */ }
                }
            }
            this.update({ availableReleases: [] });
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
    readBranchSync(source) {
        if (!(source && source.url) || !String(source.url).startsWith('branch://')) {
            throw new Error('Invalid local tree source.');
        }
        const afterScheme = String(source.url).slice('branch://'.length);
        const id = afterScheme.split('/')[0];
        if (!id) {
            throw new Error('Invalid local tree source.');
        }
        const treeEntry = store.userStore.state.branches.find((t) => t.id === id);
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
        } else {
            /* Detach from userStore — shared refs poison construction undo after in-place CRUD. */
            data = JSON.parse(JSON.stringify(treeEntry.data));
        }
        this.update({ availableReleases: [] });
        const finalSource = { ...source, url: `branch://${id}` };
        if (releaseId) {
            finalSource.type = 'archive';
            finalSource.localArchiveReleaseId = releaseId;
        } else {
            finalSource.type = 'branch';
            delete finalSource.localArchiveReleaseId;
        }
        if (data.universeName && data.universeName !== source.name) finalSource.name = data.universeName;
        const shareCode =
            store.userStore.getBranchPublishedShareCode?.(id) ||
            (data?.meta?.shareCode ? String(data.meta.shareCode).trim() : '') ||
            null;
        if (shareCode) finalSource.shareCode = shareCode;
        return { json: data, finalSource };
    }

    /**
     * Nostr + HTTPS/manifest. No incluye branch:// (va por readBranchSync en el store).
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
            if (!hasGdprNetworkConsent()) {
                const ui = typeof this.getUi === 'function' ? this.getUi() : {};
                throw new Error(
                    ui.nostrGdprConsentRequired ||
                        'Accept the privacy notice to load courses from the network.'
                );
            }
            try {
                const ui = store.ui || {};
                const initTimeoutMs = shouldShowMobileUI() ? 20000 : 12000;
                const nostr = await ensureConnectedNostr(store, { timeoutMs: initTimeoutMs });
                if (!nostr) {
                    throw new Error(
                        ui.nostrNotReadyError ||
                            ui.nostrNotLoadedHint ||
                            'Could not connect to the network. Try again in a moment.'
                    );
                }
                const resolveRelayHints = async () => {
                    let relayHint = normalizeNostrRelayUrls(
                        Array.isArray(source.recommendedRelays) ? source.recommendedRelays : []
                    );
                    if (!relayHint.length && source.shareCode) {
                        try {
                            const ref = await nostr.resolveTreeShareCode(String(source.shareCode).trim());
                            if (ref?.recommendedRelays?.length) {
                                relayHint = normalizeNostrRelayUrls(ref.recommendedRelays);
                            }
                        } catch {
                            /* ignore */
                        }
                    }
                    if (!relayHint.length) {
                        try {
                            const dir = await nostr.loadGlobalTreeDirectoryEntryOnce(treeRef);
                            if (dir?.recommendedRelays?.length) {
                                relayHint = normalizeNostrRelayUrls(dir.recommendedRelays);
                            }
                        } catch {
                            /* ignore */
                        }
                    }
                    if (relayHint.length) {
                        const merged = applyMergedRelaysToService(nostr, relayHint);
                        if (merged.length) persistUserNostrRelays(merged);
                    }
                    return relayHint;
                };
                const hintPromise = resolveRelayHints();
                let relayHint;
                let loadResult;
                if (nostr.hasConfiguredRelays?.()) {
                    /* Relays already known: fetch bundle while directory/share hints resolve. */
                    const [hints, first] = await Promise.all([
                        hintPromise,
                        nostr.loadNostrUniverseBundle(treeRef),
                    ]);
                    relayHint = hints;
                    loadResult = first;
                } else {
                    relayHint = await hintPromise;
                    if (!nostr.hasConfiguredRelays?.()) {
                        throw new Error(
                            ui.nostrRelaysRequired ||
                                'Configure at least one relay in Profile or accept the network during onboarding to use online features.'
                        );
                    }
                    loadResult = await nostr.loadNostrUniverseBundle(treeRef);
                }
                if (!loadResult.bundle && !loadResult.revoked) {
                    const merged = applyMergedRelaysToService(
                        nostr,
                        mergeNostrRelayUrls(
                            relayHint,
                            loadUserNostrRelays(),
                            SUGGESTED_NOSTR_RELAYS,
                            nostr.getPublishRelayUrls?.() || []
                        )
                    );
                    if (merged.length) persistUserNostrRelays(merged);
                    nostr._unpauseAllRelaysIfAllCoolingDown?.();
                    loadResult = await nostr.loadNostrUniverseBundle(treeRef);
                }
                const { revoked, bundle } = loadResult;
                if (revoked) throw new Error(ui.nostrUniverseRevokedError || 'This public tree was retracted by the publisher.');
                if (!bundle) {
                    throw new Error(ui.nostrLoadFailedError || 'Failed to load public tree.');
                }
                const isComposedTreeBundle = bundle.format === 'arborito-tree';
                const fmtOk =
                    (bundle.meta && bundle.meta.nostrBundleFormat === 2) || isComposedTreeBundle;
                if (!fmtOk) {
                    throw new Error(
                        ui.nostrBundleFormatUnsupported ||
                            'This public tree uses an unsupported package format. The author must republish with the current Arborito.'
                    );
                }
                /* Forum: published in chunks.forum.* and live state in forum.*.
                 * Hydrated when opening the modal (`store.hydrateTreeForumIfNeeded`). */
                await store.reconcileNetworkProgress?.(treeRef);
                await store.maybeNotifyNetworkAccountRemoved(treeRef);
                this.update({ availableReleases: [] });
                const shareCode = ((bundle && bundle.meta) ? bundle.meta.shareCode : undefined) || null;
                return {
                    json: bundle,
                    finalSource: { ...source, origin: 'nostr', isTrusted: source.isTrusted === true, shareCode }
                };
            } catch (e) {
                throw e instanceof Error ? e : new Error(String((e && e.message) || e));
            }
        }

        if (source.url && String(source.url).startsWith('branch://')) {
            await store.userStore?.ensureBranchesHydrated?.();
            return this.readBranchSync(source);
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

        const manifestUrl = source.manifestBaseUrl || resolveEditionManifestUrl(source.url);
        const versions = await this.discoverManifest(manifestUrl);
        let urlToFetch = source.url;
        let finalObj = {
            ...source,
            manifestBaseUrl: manifestUrl,
        };

        if (versions && versions.length) {
            const archives = versions.filter((v) => v.type === 'archive');
            const rolling = versions.find((v) => v.type === 'rolling');
            const baseId = String(source.id || '').split('-edition-')[0] || source.id;
            const explicitArchive =
                source.type === 'archive' ||
                source.editionId != null ||
                source.localArchiveReleaseId != null ||
                (source.url && String(source.url).includes('/releases/'));
            const explicitRolling = source.type === 'rolling';

            if (explicitRolling || (!explicitArchive && rolling)) {
                urlToFetch = rolling ? rolling.url : source.url || manifestUrl;
                finalObj = {
                    ...source,
                    manifestBaseUrl: manifestUrl,
                    id: baseId,
                    url: urlToFetch,
                    type: 'rolling',
                    editionId: null,
                };
                delete finalObj.localArchiveReleaseId;
            } else if (explicitArchive) {
                let editionUrl = source.url;
                if (source.editionId && archives.length) {
                    const match = archives.find((a) => releaseEditionKey(a) === String(source.editionId));
                    if (match?.url) editionUrl = match.url;
                }
                const editionId =
                    source.editionId ||
                    releaseEditionKey(archives.find((a) => normalizeReleaseUrl(a.url) === normalizeReleaseUrl(editionUrl)));
                const releaseInfo = archives.find(
                    (a) =>
                        normalizeReleaseUrl(a.url) === normalizeReleaseUrl(editionUrl) ||
                        releaseEditionKey(a) === String(editionId || '')
                );
                urlToFetch = editionUrl;
                finalObj = {
                    ...source,
                    manifestBaseUrl: manifestUrl,
                    id: editionId ? `${baseId}-edition-${editionId}` : baseId,
                    name:
                        releaseInfo?.name ||
                        (editionId ? `${String(source.name || '').split(' (')[0]} (${editionId})` : source.name),
                    url: editionUrl,
                    type: 'archive',
                    editionId: editionId || null,
                };
            } else {
                urlToFetch = rolling?.url || source.url || manifestUrl;
                finalObj = {
                    ...source,
                    manifestBaseUrl: manifestUrl,
                    id: baseId,
                    url: urlToFetch,
                    type: rolling ? 'rolling' : source.type || 'rolling',
                    editionId: null,
                };
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
                this.state.communitySources = updated;
                this._persistCommunitySources();
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
                if (ui.fetchFileProtocolHint) msg += ` ${ui.fetchFileProtocolHint}`;
            } else if (/SSL|TLS|protocol|ERR_SSL|certificate|ssl|secure connection/i.test(msg)) {
                msg += ` ${ui.fetchSslTlsHint || ''}`;
            }
            throw new Error(msg.trim());
        }
    }
}
