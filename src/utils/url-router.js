/**
 * URL Router for Arborito
 * Handles URL updates with tree codes and location codes
 * Format: #/tree/{tree-code}/{open-tree-code}/{location-code}
 * Example: #/tree/MATH-101/OPEN-A1B2/LOC-NYC
 * Uses hash-based routing to avoid 404 errors on page reload
 */

import { generateTreeShareCode, normalizeTreeShareCode } from '../config/share-code.js';

const URL_PREFIX = '#/tree/';

/**
 * Update the browser URL hash to reflect the current tree state
 * Uses hash-based routing to avoid 404 errors on page reload
 * @param {Object} source - The active source object
 * @param {Object} options - Additional options for the URL
 */
export function updateTreeUrl(source, options = {}) {
    if (!source || typeof window === 'undefined') return;
    
    try {
        const treeCode = generateTreeCodeFromSource(source);
        const openCode = options.openCode || 'PUBLIC';
        const locationCode = options.locationCode || getLocationCode();
        
        const hash = `${URL_PREFIX}${encodeURIComponent(treeCode)}/${encodeURIComponent(openCode)}/${encodeURIComponent(locationCode)}`;
        
        // Only update if different from current to avoid history spam
        if (window.location.hash !== hash) {
            // Store state in localStorage since hash changes don't preserve complex state
            const stateKey = `arborito_tree_state_${treeCode}`;
            localStorage.setItem(stateKey, JSON.stringify({
                treeCode, 
                openCode, 
                locationCode,
                sourceId: source.id,
                timestamp: Date.now()
            }));
            window.location.hash = hash;
        }
    } catch (e) {
        console.warn('Failed to update URL:', e);
    }
}

/**
 * Generate a tree code from a source object
 */
function generateTreeCodeFromSource(source) {
    if (!source) return 'UNKNOWN';
    
    // Use existing share code if available
    if (source.shareCode) return source.shareCode;
    if (source.code) return source.code;
    
    // Generate from name or URL
    const base = source.name || source.id || 'TREE';
    const sanitized = base.replace(/[^a-zA-Z0-9]/g, '-').toUpperCase().slice(0, 10);
    const shortId = generateTreeShareCode().split('-')[0];
    return `${sanitized}-${shortId}`;
}

/**
 * Get location code from current context
 */
function getLocationCode() {
    try {
        // Could be enhanced with geolocation in the future
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const shortTz = timezone.split('/').pop().slice(0, 5).toUpperCase();
        return shortTz || 'LOCAL';
    } catch {
        return 'LOCAL';
    }
}

/**
 * Parse URL hash to get tree information
 */
export function parseTreeUrl() {
    if (typeof window === 'undefined') return null;
    
    const hash = window.location.hash;
    if (!hash || !hash.startsWith(URL_PREFIX)) return null;
    
    const parts = hash.slice(URL_PREFIX.length).split('/').filter(Boolean);
    if (parts.length < 1) return null;
    
    return {
        treeCode: decodeURIComponent(parts[0]),
        openCode: parts[1] ? decodeURIComponent(parts[1]) : 'PUBLIC',
        locationCode: parts[2] ? decodeURIComponent(parts[2]) : 'LOCAL'
    };
}

/**
 * Restore tree from URL on page load
 */
export function restoreTreeFromUrl() {
    const urlData = parseTreeUrl();
    if (!urlData) return null;
    
    // Try to find matching source by code
    try {
        const savedSources = JSON.parse(localStorage.getItem('arborito-community-sources') || '[]');
        const match = savedSources.find(s => 
            s.code === urlData.treeCode || 
            s.shareCode === urlData.treeCode ||
            generateTreeCodeFromSource(s) === urlData.treeCode
        );
        
        if (match) {
            return {
                ...match,
                _fromUrl: true,
                urlCodes: urlData
            };
        }
    } catch (e) {
        console.warn('Could not restore tree from URL:', e);
    }
    
    return null;
}

/**
 * Clear tree URL hash (reset to empty)
 */
export function clearTreeUrl() {
    if (typeof window === 'undefined') return;
    
    try {
        window.location.hash = '';
    } catch (e) {
        console.warn('Failed to clear URL:', e);
    }
}

/**
 * Initialize URL router - should be called on app startup
 */
export function initUrlRouter(store) {
    if (typeof window === 'undefined') return;
    
    // Listen for tree changes and update URL
    let lastSourceId = null;
    
    const checkAndUpdateUrl = () => {
        const state = (store && store.value);
        if (!state) return;
        
        const activeSource = state.activeSource;
        if (activeSource && activeSource.id !== lastSourceId) {
            lastSourceId = activeSource.id;
            updateTreeUrl(activeSource, {
                openCode: state.constructionMode ? 'EDIT' : 'OPEN',
                locationCode: getLocationCode()
            });
        }
    };
    
    // Check periodically for changes
    setInterval(checkAndUpdateUrl, 1000);
    
    // Handle hash changes (back/forward navigation)
    window.addEventListener('hashchange', (e) => {
        // Restore the tree from hash
        const restored = restoreTreeFromUrl();
        if (restored && (store && store.loadData)) {
            store.loadData(restored);
        }
    });
}

export default {
    updateTreeUrl,
    parseTreeUrl,
    restoreTreeFromUrl,
    clearTreeUrl,
    initUrlRouter
};
