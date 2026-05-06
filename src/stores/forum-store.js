/**
 * Per-source forum state (local-first). Persisted in localStorage.
 */

const STORAGE_KEY = 'arborito-forum-v1';
const DEFAULT_TTL_DAYS = 30;

function parseIsoMs(iso) {
    try {
        const t = new Date(String(iso || '')).getTime();
        return Number.isFinite(t) ? t : 0;
    } catch {
        return 0;
    }
}

function pruneExpiredMessages(snapshot, ttlDays = DEFAULT_TTL_DAYS) {
    const s = snapshot && typeof snapshot === 'object' ? snapshot : null;
    if (!s) return false;
    const msgs = Array.isArray(s.messages) ? s.messages : [];
    if (!msgs.length) return false;
    const ttlMs = Math.max(1, Number(ttlDays) || DEFAULT_TTL_DAYS) * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - ttlMs;
    const before = msgs.length;
    s.messages = msgs.filter((m) => parseIsoMs((m && m.createdAt)) >= cutoff);
    // Threads: keep even if empty; UI can decide to hide if desired.
    return s.messages.length !== before;
}

function emptyState() {
    return {
        threads: [],
        messages: [],
        moderationLog: []
    };
}

function ensureModerationLog(state) {
    if (!Array.isArray(state.moderationLog)) state.moderationLog = [];
}

export class ForumStore {
    constructor() {
        /** @type {Record<string, { threads: object[], messages: object[], moderationLog?: object[] }>} */
        this.bySourceId = this._load();
    }

    _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return {};
            for (const sid of Object.keys(parsed)) {
                const st = parsed[sid];
                if (st && typeof st === 'object' && !Array.isArray(st.moderationLog)) {
                    st.moderationLog = [];
                }
                try {
                    pruneExpiredMessages(st);
                } catch {
                    /* ignore */
                }
            }
            return parsed;
        } catch {
            return {};
        }
    }

    _save() {
        try {
            // Enforce TTL on persisted snapshot (GDPR / minimization).
            for (const sid of Object.keys(this.bySourceId || {})) {
                try {
                    pruneExpiredMessages(this.bySourceId[sid]);
                } catch {
                    /* ignore */
                }
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bySourceId));
        } catch (e) {
            console.warn('ForumStore persist failed', e);
        }
    }

    /**
     * @param {string} sourceId
     */
    getSnapshot(sourceId) {
        const sid = String(sourceId || '');
        if (!this.bySourceId[sid]) {
            this.bySourceId[sid] = emptyState();
            this._save();
        }
        const s = this.bySourceId[sid];
        if (!Array.isArray(s.threads)) s.threads = [];
        ensureModerationLog(s);
        try {
            // Keep in-memory view TTL-clean too.
            if (pruneExpiredMessages(s)) this._save();
        } catch {
            /* ignore */
        }
        return {
            threads: JSON.parse(JSON.stringify(s.threads)),
            messages: JSON.parse(JSON.stringify(s.messages || [])),
            moderationLog: JSON.parse(JSON.stringify(s.moderationLog))
        };
    }

    /**
     * @param {string} sourceId
     * @param {{ title?: string, nodeId?: string|null }} [opts]
     */
    addThread(sourceId, opts = {}) {
        const sid = String(sourceId || '');
        if (!this.bySourceId[sid]) this.bySourceId[sid] = emptyState();
        ensureModerationLog(this.bySourceId[sid]);
        const now = new Date().toISOString();
        const id = `thr-${crypto.randomUUID()}`;
        const thread = {
            id,
            nodeId: opts.nodeId != null ? String(opts.nodeId) : null,
            title: (opts.title && String(opts.title).trim()) || 'Thread',
            createdAt: now,
            updatedAt: now
        };
        this.bySourceId[sid].threads.push(thread);
        this._save();
        return thread;
    }

    /**
     * @param {string} sourceId
     * @param {{ threadId: string, body: string, parentId?: string|null, author?: { name?: string, avatar?: string } }} payload
     */
    addMessage(sourceId, payload) {
        const sid = String(sourceId || '');
        if (!this.bySourceId[sid]) this.bySourceId[sid] = emptyState();
        ensureModerationLog(this.bySourceId[sid]);
        const body = String(payload.body || '').trim();
        if (!body) return null;
        const threadId = String(payload.threadId || '').trim();
        if (!threadId) return null;
        const threads = this.bySourceId[sid].threads;
        if (!threads.some((t) => t.id === threadId)) {
            this.bySourceId[sid].threads.push({
                id: threadId,
                nodeId: null,
                title: threadId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        }
        const arr = this.bySourceId[sid].messages;
        if (!Array.isArray(arr)) this.bySourceId[sid].messages = [];

        let parentId =
            payload.parentId != null && String(payload.parentId).trim() !== ''
                ? String(payload.parentId).trim()
                : null;
        if (parentId) {
            const parentOk = arr.some((m) => m.id === parentId && String(m.threadId) === threadId);
            if (!parentOk) parentId = null;
        }

        const now = new Date().toISOString();
        const msg = {
            id: `msg-${crypto.randomUUID()}`,
            threadId,
            parentId,
            author: {
                name: (payload.author && payload.author.name) || 'Guest',
                avatar: (payload.author && payload.author.avatar) || '💬',
                ...((payload.author && payload.author.pub) ? { pub: String(payload.author.pub) } : {})
            },
            body,
            createdAt: now,
            ...(payload.pendingApproval ? { pendingApproval: true } : {})
        };
        this.bySourceId[sid].messages.push(msg);
        const th = threads.find((t) => t.id === threadId);
        if (th) th.updatedAt = now;
        this._save();
        return msg;
    }

    /**
     * Remove a message (next public bundle export omits it — GDPR “new version” model).
     * @param {string} sourceId
     * @param {string} messageId
     * @param {{ actor?: string }} [meta]
     * @returns {boolean}
     */
    /** All message ids to remove: root + every descendant reply in the same source. */
    _collectDescendantMessageIds(allMsgs, rootId) {
        const out = new Set([String(rootId)]);
        let changed = true;
        while (changed) {
            changed = false;
            for (const m of allMsgs) {
                const pid = String(m.parentId || '');
                if (pid && out.has(pid) && !out.has(m.id)) {
                    out.add(m.id);
                    changed = true;
                }
            }
        }
        return out;
    }

    deleteMessage(sourceId, messageId, meta = {}) {
        const sid = String(sourceId || '');
        if (!this.bySourceId[sid]) return false;
        ensureModerationLog(this.bySourceId[sid]);
        const mid = String(messageId || '');
        const arr = this.bySourceId[sid].messages;
        if (!Array.isArray(arr)) return false;
        if (!arr.some((m) => m.id === mid)) return false;
        const removeIds = this._collectDescendantMessageIds(arr, mid);
        this.bySourceId[sid].messages = arr.filter((m) => !removeIds.has(m.id));
        this.bySourceId[sid].moderationLog.push({
            type: 'delete_message',
            targetId: mid,
            at: new Date().toISOString(),
            actor: meta.actor || 'unknown'
        });
        this._save();
        return true;
    }

    /**
     * Remove thread and its messages.
     * @param {string} sourceId
     * @param {string} threadId
     * @param {{ actor?: string }} [meta]
     * @returns {boolean}
     */
    deleteThread(sourceId, threadId, meta = {}) {
        const sid = String(sourceId || '');
        const tid = String(threadId || '');
        if (!this.bySourceId[sid]) return false;
        ensureModerationLog(this.bySourceId[sid]);
        const threads = this.bySourceId[sid].threads;
        if (!Array.isArray(threads)) return false;
        const ti = threads.findIndex((t) => t.id === tid);
        if (ti === -1) return false;
        threads.splice(ti, 1);
        const msgs = this.bySourceId[sid].messages;
        if (Array.isArray(msgs)) {
            this.bySourceId[sid].messages = msgs.filter((m) => m.threadId !== tid);
        }
        this.bySourceId[sid].moderationLog.push({
            type: 'delete_thread',
            targetId: tid,
            at: new Date().toISOString(),
            actor: meta.actor || 'unknown'
        });
        this._save();
        return true;
    }

    /**
     * Remove all posts by a cryptographic identity (moderation / account removal).
     * @returns {number} messages removed
     */
    deleteMessagesByAuthorPub(sourceId, authorPub) {
        const sid = String(sourceId || '');
        const ap = String(authorPub || '');
        if (!ap || !this.bySourceId[sid]) return 0;
        ensureModerationLog(this.bySourceId[sid]);
        const arr = this.bySourceId[sid].messages;
        if (!Array.isArray(arr)) return 0;
        const before = arr.length;
        this.bySourceId[sid].messages = arr.filter((m) => String((m.author && m.author.pub) || '') !== ap);
        const n = before - this.bySourceId[sid].messages.length;
        if (n)
            this.bySourceId[sid].moderationLog.push({
                type: 'delete_account_messages',
                targetPub: ap,
                at: new Date().toISOString(),
                actor: 'system'
            });
        this._save();
        return n;
    }

    /**
     * Replace forum state for a source (e.g. after loading an arborito-bundle from IPFS).
     * @param {string} sourceId
     * @param {{ threads?: object[], messages?: object[], moderationLog?: object[] }} snapshot
     */
    replaceSnapshot(sourceId, snapshot) {
        const sid = String(sourceId || '');
        const threads =
            Array.isArray((snapshot && snapshot.threads)) && snapshot.threads.length
                ? JSON.parse(JSON.stringify(snapshot.threads))
                : emptyState().threads;
        const messages = Array.isArray((snapshot && snapshot.messages))
            ? JSON.parse(JSON.stringify(snapshot.messages))
            : [];
        const moderationLog = Array.isArray((snapshot && snapshot.moderationLog))
            ? JSON.parse(JSON.stringify(snapshot.moderationLog))
            : [];
        const next = { threads, messages, moderationLog };
        try { pruneExpiredMessages(next); } catch { /* ignore */ }
        this.bySourceId[sid] = next;
        this._save();
    }

    /**
     * Nostr: merges published snapshot (`chunks.forum`) + live map (`forum.*`) and keeps local-only threads/messages.
     * Order: base (published) → live (wins by id) → previous local (only ids not present after live).
     */
    mergeNostrForumSnapshots(sourceId, baseSnap, liveSnap) {
        const sid = String(sourceId || '');
        const base = baseSnap && typeof baseSnap === 'object' ? baseSnap : {};
        const live = liveSnap && typeof liveSnap === 'object' ? liveSnap : {};
        const baseThreads = Array.isArray(base.threads) ? base.threads : [];
        const baseMsgs = Array.isArray(base.messages) ? base.messages : [];
        const baseMod = Array.isArray(base.moderationLog) ? base.moderationLog : [];
        const liveThreads = Array.isArray(live.threads) ? live.threads : [];
        const liveMsgs = Array.isArray(live.messages) ? live.messages : [];

        const threadById = new Map();
        for (const t of baseThreads) {
            if (t && t.id != null) threadById.set(String(t.id), t);
        }
        for (const t of liveThreads) {
            if (t && t.id != null) threadById.set(String(t.id), t);
        }
        const afterLiveThreadIds = new Set(threadById.keys());

        const msgById = new Map();
        for (const m of baseMsgs) {
            if (m && m.id != null) msgById.set(String(m.id), m);
        }
        for (const m of liveMsgs) {
            if (m && m.id != null) msgById.set(String(m.id), m);
        }
        const afterLiveMsgIds = new Set(msgById.keys());

        const prev = this.getSnapshot(sid);
        for (const t of prev.threads) {
            if (t && t.id != null) {
                const id = String(t.id);
                if (!afterLiveThreadIds.has(id)) threadById.set(id, t);
            }
        }
        for (const m of prev.messages) {
            if (m && m.id != null) {
                const id = String(m.id);
                if (!afterLiveMsgIds.has(id)) msgById.set(id, m);
            }
        }

        const modSeen = new Set();
        const moderationLog = [];
        const pushMod = (e) => {
            if (!e || typeof e !== 'object') return;
            const key = `${e.type || ''}:${e.targetId || e.targetPub || ''}:${e.at || ''}`;
            if (modSeen.has(key)) return;
            modSeen.add(key);
            moderationLog.push(e);
        };
        for (const e of baseMod) pushMod(e);
        for (const e of prev.moderationLog || []) pushMod(e);

        this.bySourceId[sid] = {
            threads: [...threadById.values()],
            messages: [...msgById.values()],
            moderationLog
        };
        try { pruneExpiredMessages(this.bySourceId[sid]); } catch { /* ignore */ }
        this._save();
    }

    /**
     * Nostr: after initial hydration, refresh from live map without re-reading chunks.
     * Live wins by id; local-only threads/messages not in live are kept.
     * Note: a message deleted on the network may still show until the next full forum reload.
     */
    mergeNostrForumOverlayLive(sourceId, liveSnap) {
        const sid = String(sourceId || '');
        const live = liveSnap && typeof liveSnap === 'object' ? liveSnap : {};
        const liveThreads = Array.isArray(live.threads) ? live.threads : [];
        const liveMsgs = Array.isArray(live.messages) ? live.messages : [];
        const prev = this.getSnapshot(sid);

        const threadById = new Map();
        for (const t of prev.threads) {
            if (t && t.id != null) threadById.set(String(t.id), t);
        }
        for (const t of liveThreads) {
            if (t && t.id != null) threadById.set(String(t.id), t);
        }

        const msgById = new Map();
        for (const m of prev.messages) {
            if (m && m.id != null) msgById.set(String(m.id), m);
        }
        for (const m of liveMsgs) {
            if (m && m.id != null) msgById.set(String(m.id), m);
        }

        this.bySourceId[sid] = {
            threads: [...threadById.values()],
            messages: [...msgById.values()],
            moderationLog: JSON.parse(JSON.stringify(prev.moderationLog || []))
        };
        try { pruneExpiredMessages(this.bySourceId[sid]); } catch { /* ignore */ }
        this._save();
    }

    /** Merge/Upsert threads by id (does not delete). */
    mergeThreads(sourceId, threads) {
        const sid = String(sourceId || '');
        if (!this.bySourceId[sid]) this.bySourceId[sid] = emptyState();
        ensureModerationLog(this.bySourceId[sid]);
        const cur = Array.isArray(this.bySourceId[sid].threads) ? this.bySourceId[sid].threads : [];
        const byId = new Map(cur.map((t) => [String(t.id), t]));
        for (const t of Array.isArray(threads) ? threads : []) {
            if (!t || t.id == null) continue;
            byId.set(String(t.id), t);
        }
        this.bySourceId[sid].threads = [...byId.values()];
        this._save();
    }

    /** Merge/Upsert messages by id (does not delete). */
    mergeMessages(sourceId, messages) {
        const sid = String(sourceId || '');
        if (!this.bySourceId[sid]) this.bySourceId[sid] = emptyState();
        ensureModerationLog(this.bySourceId[sid]);
        const cur = Array.isArray(this.bySourceId[sid].messages) ? this.bySourceId[sid].messages : [];
        const byId = new Map(cur.map((m) => [String(m.id), m]));
        for (const m of Array.isArray(messages) ? messages : []) {
            if (!m || m.id == null) continue;
            byId.set(String(m.id), m);
        }
        this.bySourceId[sid].messages = [...byId.values()];
        try { pruneExpiredMessages(this.bySourceId[sid]); } catch { /* ignore */ }
        this._save();
    }

    /**
     * @param {string} sourceId
     * @param {string} messageId
     * @param {boolean} pending
     */
    setMessagePendingApproval(sourceId, messageId, pending) {
        const sid = String(sourceId || '');
        const mid = String(messageId || '');
        if (!this.bySourceId[sid]) return false;
        const arr = this.bySourceId[sid].messages;
        if (!Array.isArray(arr)) return false;
        const m = arr.find((x) => String(x.id) === mid);
        if (!m) return false;
        if (pending) m.pendingApproval = true;
        else delete m.pendingApproval;
        this._save();
        return true;
    }
}
