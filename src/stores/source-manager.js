

import { store } from '../store.js'; // Need reference to main store to access userStore

const OFFICIAL_DOMAINS = [
    'treesys-org.github.io',
    'localhost',
    '127.0.0.1',
    'raw.githubusercontent.com'
];

// Fallback if everything fails
const DEFAULT_SOURCES = [
    {
        id: 'default-arborito',
        name: 'Arborito Library (Official)',
        url: 'https://raw.githubusercontent.com/treesys-org/arborito-library/main/data/data.json',
        isDefault: true,
        isTrusted: true,
        year: 'Rolling'
    }
];

export class SourceManager {
    constructor(updateStateCallback, uiCallback) {
        this.update = updateStateCallback; // Function to update main store state
        this.getUi = uiCallback; // Function to get current UI strings
        this.state = {
            communitySources: [],
            activeSource: null,
            availableReleases: [],
            manifestUrlAttempted: null,
            loading: true,
            error: null
        };
    }

    async init() {
        // --- VIRAL SHARING INTERCEPTOR ---
        const urlParams = new URLSearchParams(window.location.search);
        const sourceUrlFromParam = urlParams.get('source');
        if (sourceUrlFromParam) {
            try {
                const url = new URL(sourceUrlFromParam);
                const isTrusted = this.isUrlTrusted(url.href);
                const sourceObject = {
                    id: `shared-${Date.now()}`,
                    name: url.hostname,
                    url: url.href,
                    isTrusted: isTrusted,
                    type: 'shared'
                };

                if (isTrusted) {
                    return sourceObject;
                } else {
                    // It's not trusted, so we trigger a warning modal
                    // The main store will handle this state update
                    this.update({ 
                        pendingUntrustedSource: sourceObject, 
                        modal: { type: 'load-warning' }
                    });
                    return null; // Halt initial load
                }
            } catch (e) {
                console.warn("Invalid source URL parameter", e);
            }
        }
        // ---------------------------------
        
        // 1. Load Community Sources (Local)
        let localSources = [];
        try { localSources = JSON.parse(localStorage.getItem('arborito-sources')) || []; } catch(e) {}
        
        this.update({ communitySources: localSources });
        this.state.communitySources = localSources;

        // 2. Determine Active Source
        let activeSource = null;
        try {
            const savedMeta = localStorage.getItem('arborito-active-source-meta');
            if (savedMeta) {
                activeSource = JSON.parse(savedMeta);
            }
        } catch(e) { console.warn("Failed to parse saved source meta"); }

        // Fallback for legacy ID storage (migration path)
        if (!activeSource) {
             const savedActiveId = localStorage.getItem('arborito-active-source-id');
             if (savedActiveId) {
                 activeSource = localSources.find(s => s.id === savedActiveId);
                 
                 // Check local
                 if (!activeSource && savedActiveId.startsWith('local-')) {
                     activeSource = {
                         id: savedActiveId,
                         name: 'My Private Garden',
                         url: `local://${savedActiveId}`,
                         type: 'local'
                     };
                 }
             }
        }

        if (!activeSource) {
            activeSource = { ...DEFAULT_SOURCES[0] };
            // Optimization: If running locally, prefer local relative URL
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                 const localSrc = await this._checkLocalBoot();
                 if (localSrc) return localSrc;
            }
        }

        return activeSource;
    }

    async getDefaultSource() {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            const localSrc = await this._checkLocalBoot();
            if (localSrc) return localSrc;
        }
        return { ...DEFAULT_SOURCES[0] };
    }

    async _checkLocalBoot() {
        try {
            const check = await fetch('./data/data.json', { method: 'HEAD' });
            if (check.ok) {
                return {
                    id: 'local-boot',
                    name: 'Local Workspace',
                    url: './data/data.json',
                    isTrusted: true,
                    type: 'rolling'
                };
            }
        } catch(e) {}
        return null;
    }

    isUrlTrusted(urlStr) {
        try {
            const url = new URL(urlStr, window.location.href);
            return OFFICIAL_DOMAINS.includes(url.hostname);
        } catch { return false; }
    }

    addCommunitySource(url) {
        if (!url) return;
        let name = 'New Tree';
        try { name = new URL(url, window.location.href).hostname; } catch (e) {}
        
        const newSource = { 
            id: crypto.randomUUID(), 
            name, 
            url, 
            isTrusted: this.isUrlTrusted(url),
            isOfficial: false,
            type: 'community'
        };
        
        const newSources = [...this.state.communitySources, newSource];
        this.update({ communitySources: newSources });
        this.state.communitySources = newSources;
        localStorage.setItem('arborito-sources', JSON.stringify(newSources));
    }

    removeCommunitySource(id) {
        const newSources = this.state.communitySources.filter(s => s.id !== id);
        this.update({ communitySources: newSources });
        this.state.communitySources = newSources;
        localStorage.setItem('arborito-sources', JSON.stringify(newSources));
    }

    async discoverManifest(sourceUrl) {
        if (!sourceUrl || sourceUrl.startsWith('local://')) return null;

        try {
            const absoluteSource = new URL(sourceUrl, window.location.href).href;
            const candidates = [];

            // STRATEGY 1: Check Sibling
            candidates.push(new URL('arborito-index.json', absoluteSource).href);
            // STRATEGY 2: Check Parent
            candidates.push(new URL('../arborito-index.json', absoluteSource).href);
            // STRATEGY 3: Explicit /data/ root detection
            const lower = absoluteSource.toLowerCase();
            if (lower.includes('/data/')) {
                 const idx = lower.lastIndexOf('/data/'); 
                 const rootBase = absoluteSource.substring(0, idx);
                 candidates.push(`${rootBase}/data/arborito-index.json`);
            }

            const uniqueCandidates = [...new Set(candidates)];

            for (const url of uniqueCandidates) {
                 try {
                     const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-cache' });
                     if (res.ok) {
                         const manifest = await res.json();
                         const manifestBase = new URL('./', url).href;
                         const rebase = (u) => {
                            if (u && u.startsWith('./')) return new URL(u, manifestBase).href;
                            return u;
                         };

                         const versions = [];
                         if (manifest.rolling) {
                            versions.push({ ...manifest.rolling, url: rebase(manifest.rolling.url), type: 'rolling' });
                         }
                         if (manifest.releases && Array.isArray(manifest.releases)) {
                            versions.push(...manifest.releases.map(r => ({ ...r, url: rebase(r.url), type: 'archive' })));
                         }
                         
                         this.update({ availableReleases: versions, manifestUrlAttempted: url });
                         
                         // Return sorted versions to allow smarter loading
                         return versions; 
                     }
                 } catch(e) { }
            }
            this.update({ availableReleases: [], manifestUrlAttempted: uniqueCandidates.join(' | ') });
            return [];

        } catch (e) {
            this.update({ availableReleases: [] });
            return [];
        }
    }

    async loadData(source, currentLang = 'EN', forceRefresh = true, existingRawData = null) {
        if (!source) return { json: null, finalSource: source };
        
        this.update({ loading: true, error: null });

        // --- LOCAL INTERCEPTOR ---
        if (source.url && source.url.startsWith('local://')) {
            try {
                const id = source.url.split('://')[1];
                const data = store.userStore.getLocalTreeData(id);
                
                if (!data) throw new Error("Local tree not found.");
                
                await new Promise(r => setTimeout(r, 300));
                
                this.update({ availableReleases: [] });
                
                let finalSource = { ...source };
                if (data.universeName && data.universeName !== source.name) {
                    finalSource.name = data.universeName;
                }
                
                return { json: data, finalSource: finalSource };
            } catch(e) {
                this.update({ loading: false, error: "Failed to load local garden." });
                throw e;
            }
        }
        // -------------------------

        // --- MANIFEST DISCOVERY & RELEASE PRIORITY ---
        const discoveredVersions = await this.discoverManifest(source.url);
        let urlToFetch = source.url;
        let finalSourceObj = { ...source };

        // Logic: If we found releases, and the current source is generic (not a specific archive ID),
        // we should try to upgrade to the latest stable release.
        if (discoveredVersions && discoveredVersions.length > 0) {
            const archives = discoveredVersions.filter(v => v.type === 'archive');
            
            // Check if user is explicitly on a specific version (archive OR rolling)
            // If the user manually selected "Rolling", source.type will be 'rolling'.
            // If it's a default boot, source.type is usually undefined/null or 'community'.
            const isSpecificVersion = source.type === 'archive' || source.type === 'rolling';
            
            if (!isSpecificVersion && archives.length > 0) {
                // Sort by ID descending (assuming date-based or semver-ish ID)
                archives.sort((a, b) => b.id.localeCompare(a.id));
                const latest = archives[0];
                
                console.log(`[Arborito] Upgrading to latest stable release: ${latest.id}`);
                urlToFetch = latest.url;
                
                // Update the active source in state to reflect the redirect
                finalSourceObj = {
                    ...source,
                    id: `${source.id}-${latest.id}`,
                    name: latest.name || `${source.name} (${latest.id})`,
                    url: latest.url,
                    type: 'archive'
                };
            }
        }

        try {
            let json;
            
            if (!forceRefresh && existingRawData && this.state.activeSource?.id === source.id) {
                json = existingRawData;
            } else {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 20000); 

                const res = await fetch(urlToFetch, { signal: controller.signal, cache: 'no-cache' });
                clearTimeout(timeoutId);

                if (!res.ok) throw new Error(`Failed to fetch data from ${finalSourceObj.name} (Status ${res.status}).`);
                json = await res.json();
            }
            
            // Name Refresh Logic
            if (json.universeName && json.universeName !== finalSourceObj.name) {
                // Only update base name if it wasn't a release redirect
                if (finalSourceObj.type !== 'archive') {
                    const updatedCommunity = this.state.communitySources.map(s => s.id === source.id ? {...s, name: json.universeName} : s);
                    this.update({ communitySources: updatedCommunity });
                    localStorage.setItem('arborito-sources', JSON.stringify(updatedCommunity));
                    finalSourceObj.name = json.universeName;
                }
            }

            return { json: json, finalSource: finalSourceObj };

        } catch (e) {
            console.error(e);
            this.update({ loading: false, error: e.message });
            throw e;
        }
    }
}