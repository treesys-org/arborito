/** Pure helpers for the forum modal (HTML escaping, places, threads). */
function esc(s) {
    return String(s != null ? s : '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(s) { return esc(s).replace(/'/g, '&#39;'); }

/** Human-friendly relative time using the UI language (no raw "5m"/"now"). */
function timeAgo(iso, lang) {
    try {
        const then = new Date(iso).getTime();
        const diffSec = (Date.now() - then) / 1000;
        const loc = String(lang || 'en').replace('_', '-').toLowerCase();
        const rtf = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' });
        if (diffSec < 0) return new Date(iso).toLocaleString(loc);
        if (diffSec < 45) return rtf.format(-Math.max(1, Math.round(diffSec)), 'second');
        if (diffSec < 3600) return rtf.format(-Math.floor(diffSec / 60), 'minute');
        if (diffSec < 86400) return rtf.format(-Math.floor(diffSec / 3600), 'hour');
        if (diffSec < 604800) return rtf.format(-Math.floor(diffSec / 86400), 'day');
        if (diffSec < 2592000) return rtf.format(-Math.floor(diffSec / 604800), 'week');
        if (diffSec < 31536000) return rtf.format(-Math.floor(diffSec / 2592000), 'month');
        return rtf.format(-Math.floor(diffSec / 31536000), 'year');
    } catch (e) {
        try { return new Date(iso).toLocaleString(String(lang || 'en').replace('_', '-').toLowerCase()); } catch (e) { return ''; }
    }
}

function fullTime(iso) {
    try { return new Date(iso).toLocaleString(); } catch (e) { return String(iso || ''); }
}

function pseudonym(pub) {
    const p = String(pub || '');
    return p ? `Anon-${p.slice(0, 6)}` : '';
}

function snippetText(s, max) {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    const n = max || 80;
    return t.length > n ? `${t.slice(0, n)}…` : t;
}

function isGeneral(id) { return id === null || id === undefined || id === ''; }

function displayThreadTitle(t, ui) {
    if (!t) return (ui && ui.forumPickThread) || '';
    return t.title || t.id;
}

function threadNode(t) {
    const n = (t && t.nodeId);
    return (n === undefined || n === null || n === '') ? null : String(n);
}

function threadsFor(threads, placeId) {
    return (threads || []).filter((t) => {
        const tn = threadNode(t);
        return isGeneral(placeId) ? tn === null : tn === String(placeId);
    });
}

function countMsgs(messages, tid) { return (messages || []).filter((m) => m.threadId === tid).length; }

function lastMsgTime(messages, tid) {
    let max = '';
    for (const m of messages || []) if (m.threadId === tid && String(m.createdAt) > max) max = m.createdAt;
    return max || null;
}

function sortByActivity(threads, messages) {
    return [...threads].sort((a, b) => {
        const ta = lastMsgTime(messages, a.id) || a.updatedAt || a.createdAt || '';
        const tb = lastMsgTime(messages, b.id) || b.updatedAt || b.createdAt || '';
        return String(tb).localeCompare(String(ta));
    });
}

function placeTypeFallbackIcon(t) {
    return t === 'leaf' ? '📄' : t === 'exam' ? '📝' : t === 'root' ? '🌳' : '📂';
}

function placeIconFromNode(n, t) {
    const raw = n && n.icon != null ? String(n.icon).trim() : '';
    return raw || placeTypeFallbackIcon(t);
}

function buildPlaces(root) {
    const out = [{ id: null, depth: 0, isGeneral: true, parentId: null, hasChildren: false }];
    if (!root) return out;
    const walk = (n, d, parentId) => {
        if (!n || n.id == null) return;
        const t = n.type || 'branch';
        const id = String(n.id);
        const hasChildren = !!(n.children && n.children.length);
        out.push({
            id,
            name: String(n.name || 'Untitled'),
            depth: d,
            type: t,
            icon: placeIconFromNode(n, t),
            isGeneral: false,
            parentId: parentId == null || parentId === '' ? null : String(parentId),
            hasChildren
        });
        if (hasChildren) for (const c of n.children) walk(c, d + 1, id);
    };
    walk(root, 0, null);
    return out;
}

/** Map of tree place id → place row (excludes General). */
function forumPlacesById(places) {
    const m = new Map();
    for (const p of places || []) {
        if (!p.isGeneral) m.set(String(p.id), p);
    }
    return m;
}

/** True if this row is hidden because an ancestor folder is collapsed. */
function forumPlaceHiddenByCollapse(place, collapsed, byId) {
    if (!place || place.isGeneral) return false;
    let pid = place.parentId;
    while (pid != null && pid !== '') {
        if (collapsed.has(String(pid))) return true;
        const par = byId.get(String(pid));
        if (!par) break;
        pid = par.parentId;
    }
    return false;
}

/**
 * When the user types a filter, return the set of place ids to show (name match plus ancestors).
 * @returns {Set<string>|null} null if the query is empty (no filter).
 */
function forumPlaceFilterMatchSet(places, qRaw) {
    const q = String(qRaw || '').trim().toLowerCase();
    if (!q) return null;
    const byId = forumPlacesById(places);
    const matched = new Set();
    for (const p of places || []) {
        if (p.isGeneral) continue;
        if (String(p.name || '').toLowerCase().includes(q)) matched.add(String(p.id));
    }
    const out = new Set(matched);
    for (const id of matched) {
        let node = byId.get(String(id));
        while ((node && node.parentId)) {
            const pid = String(node.parentId);
            out.add(pid);
            node = byId.get(pid);
        }
    }
    return out;
}

/** Desktop course-area list: respects collapse unless a text filter is active. */
function forumPlaceRowShownInDesktopSidebar(p, collapsed, byId, filterSet) {
    if (p.isGeneral) return true;
    if (filterSet) return filterSet.has(String(p.id));
    return !forumPlaceHiddenByCollapse(p, collapsed, byId);
}

/** Branch ids that start collapsed: deeper than the course root’s immediate children (depth > 1). */
function defaultForumCollapsedBranchIds(places) {
    const s = new Set();
    for (const p of places || []) {
        if (!p.isGeneral && p.hasChildren && (p.depth || 0) > 1) {
            s.add(String(p.id));
        }
    }
    return s;
}

/**
 * If the current place sits under a collapsed branch, move selection to the nearest visible ancestor (or General).
 * @returns {string|null|undefined} `undefined` if already General; otherwise new place id or `null` for General.
 */
function snapForumPlaceIdIfCollapsed(placeId, collapsed, byId) {
    if (isGeneral(placeId)) return undefined;
    const cur = byId.get(String(placeId));
    if (!cur) return undefined;
    let node = cur;
    while (node && forumPlaceHiddenByCollapse(node, collapsed, byId)) {
        const pid = node.parentId;
        if (pid == null || pid === '') {
            node = null;
            break;
        }
        node = byId.get(String(pid));
    }
    if (!node || node.isGeneral) return null;
    return String(node.id) === String(placeId) ? undefined : node.id;
}

/** Valid parent id within this message list, or null. */
function normalizedParentId(m, idSet) {
    const p = m.parentId;
    if (p == null || p === '') return null;
    const s = String(p);
    return idSet.has(s) ? s : null;
}

export {
    esc,
    escAttr,
    timeAgo,
    fullTime,
    pseudonym,
    snippetText,
    isGeneral,
    displayThreadTitle,
    threadNode,
    threadsFor,
    countMsgs,
    lastMsgTime,
    sortByActivity,
    placeTypeFallbackIcon,
    placeIconFromNode,
    buildPlaces,
    forumPlacesById,
    forumPlaceHiddenByCollapse,
    forumPlaceFilterMatchSet,
    forumPlaceRowShownInDesktopSidebar,
    defaultForumCollapsedBranchIds,
    snapForumPlaceIdIfCollapsed,
    normalizedParentId
};
