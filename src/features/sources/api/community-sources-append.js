import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { canonicalCommunityUrl } from './source-url-helpers.js';

export function normalizeInstallOrigin(raw) {
    return String(raw || '').trim() === 'playlist-member' ? 'playlist-member' : 'user';
}

/** Promote a playlist-dep install to a first-class user install (Discover / share). */
export function promoteCommunitySourceInstallOrigin(sm, id, origin = 'user') {
    const sid = String(id || '').trim();
    const nextOrigin = normalizeInstallOrigin(origin);
    if (!sid || !sm) return false;
    const list = Array.isArray(sm.state.communitySources) ? sm.state.communitySources : [];
    const idx = list.findIndex((s) => String(s?.id) === sid);
    if (idx < 0) return false;
    const cur = list[idx];
    if (String(cur?.installOrigin || '') === nextOrigin) return false;
    const next = { ...cur, installOrigin: nextOrigin };
    const newSources = list.slice();
    newSources[idx] = next;
    sm.update({ communitySources: newSources });
    sm.state.communitySources = newSources;
    sm._persistCommunitySources();
    try {
        store.publishInstalledSourcesForAccount?.();
    } catch {
        /* ignore */
    }
    return true;
}

export function appendCommunitySource(sm, src, opts = {}) {
    const canon = canonicalCommunityUrl(src.url);
    const dup = sm.state.communitySources.find((s) => canonicalCommunityUrl(s.url) === canon);
    if (dup) {
        /* User install wins over a silent playlist dependency. */
        if (
            String(src?.installOrigin || '') === 'user' &&
            String(dup?.installOrigin || '') !== 'user'
        ) {
            promoteCommunitySourceInstallOrigin(sm, dup.id, 'user');
            const updated =
                (sm.state.communitySources || []).find((s) => String(s?.id) === String(dup.id)) || dup;
            return { ok: false, reason: 'duplicate', existing: updated };
        }
        return { ok: false, reason: 'duplicate', existing: dup };
    }
    const newSources = [...sm.state.communitySources, src];
    sm.update({ communitySources: newSources });
    sm.state.communitySources = newSources;
    sm._persistCommunitySources();
    try {
        if (canon && store._installedSourcesRemoved?.size) {
            store._installedSourcesRemoved.delete(canon);
        }
    } catch {
        /* ignore */
    }
    if (!opts.skipAccountPublish) {
        try {
            store.publishInstalledSourcesForAccount?.();
        } catch {
            /* ignore */
        }
    }
    return { ok: true, source: src };
}
