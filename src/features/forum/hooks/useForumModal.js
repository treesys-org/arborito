import { useForum } from './useForum.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fileSystem } from '../../backup-export/api/filesystem.js';
import { parseNostrTreeUrl } from '../../nostr/api/nostr-refs.js';
import { useRegisterPanel } from '../../../app/hooks/useRegisterPanel.js';
import {
    buildPlaces,
    forumPlacesById,
    defaultForumCollapsedBranchIds,
    resolveForumNavState,
    forumPlaceLabel,
    isGeneral,
    displayThreadTitle,
} from '../api/modals/logic/forum-modal-utils.js';
import { getPanelRef } from '../../../app/panel-refs.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { isTreeForumEnabled } from '../../../shared/lib/tree-forum-enabled.js';
import { requireSignInDialog } from '../../publishing/api/account-hub-gate.js';
import { getArboritoStore } from '../../../core/store-singleton.js';

function readInitialForumState(consumeForumShellSnapshot) {
    const restored =
        typeof consumeForumShellSnapshot === 'function' ? consumeForumShellSnapshot() : null;
    const out = {
        placeId: null,
        threadId: null,
        mobilePanel: 'threads',
        draft: '',
        replyParentId: null,
    };
    if (restored) {
        if (Object.prototype.hasOwnProperty.call(restored, 'threadId')) out.threadId = restored.threadId;
        if (Object.prototype.hasOwnProperty.call(restored, 'placeId')) out.placeId = restored.placeId;
        if (restored.mobilePanel) out.mobilePanel = restored.mobilePanel;
        if (restored.draft !== undefined) out.draft = restored.draft;
        if (Object.prototype.hasOwnProperty.call(restored, 'replyParentId')) out.replyParentId = restored.replyParentId;
    }
    return out;
}

function expandAncestorsForPlace(nodeId, collapsed, root) {
    const id = String(nodeId || '').trim();
    if (!id || !root) return { placeId: null, collapsed };
    const places = buildPlaces(root);
    const byId = forumPlacesById(places);
    let cur = byId.get(id);
    if (!cur) return { placeId: null, collapsed };
    const next = new Set(collapsed);
    while (cur) {
        next.delete(String(cur.id));
        const pid = cur.parentId;
        if (!pid) break;
        cur = byId.get(String(pid));
    }
    return { placeId: id, collapsed: next };
}
/** Forum modal, state, effects, handlers (jr entry for ModalForum). */
export function useForumModal(embed = false) {
    const {
        ui,
        dismissModal,
        setModal,
        notify,
        update,
        lang,
        data,
        activeSource,
        rawGraphData,
        constructionMode,
        modal,
        confirm,
        isSignedIn,
        getNetworkUserPair,
        forumStore,
        forumActions,
    } = useForum();

    const {
        loadForumBansV3,
        canModerateForum,
        stashForumShellBeforeDialog,
        consumeForumShellSnapshot,
        ensureTreeForumPlaceLoaded,
        ensureTreeForumThreadLoaded,
        hydrateTreeForumIfNeeded,
        searchTreeForumV3,
        addForumThread,
        addForumMessage,
        moderateDeleteForumMessage,
        selfDeleteForumMessage,
        moderateDeleteForumThread,
        setForumBanForActiveTree,
        selfDeleteNostrForumAccount,
        getForumModerationModeForActiveTree,
        listForumPendingSummariesForActiveTree,
        setForumModerationPolicyMode,
        approveForumPendingMessage,
        rejectForumPendingMessage,
        ensureTreeForumThreadWeekLoaded,
        getTreeForumThreadWeeks,
        getLoadedForumThreadWeeks,
    } = forumActions;

    const langLower = (lang || 'en').toLowerCase();
    const mobile = embed ? true : shouldShowMobileUI();
    const embedded = !!embed;

    const initial = useMemo(() => readInitialForumState(consumeForumShellSnapshot), [consumeForumShellSnapshot]);
    const [placeId, setPlaceId] = useState(initial.placeId);
    const [threadId, setThreadId] = useState(initial.threadId);
    const [searchQ, setSearchQ] = useState('');
    const [searching, setSearching] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [draft, setDraft] = useState(initial.draft);
    const [mobilePanel, setMobilePanel] = useState(initial.mobilePanel);
    const [scrollPostsToEnd, setScrollPostsToEnd] = useState(true);
    const [scrollThreadsTop, setScrollThreadsTop] = useState(false);
    const [focusComposeNext, setFocusComposeNext] = useState(false);
    const [posting, setPosting] = useState(false);
    const [newTopicOpen, setNewTopicOpen] = useState(false);
    const [newTopicTitle, setNewTopicTitle] = useState('');
    const [newTopicBody, setNewTopicBody] = useState('');
    const [creatingTopic, setCreatingTopic] = useState(false);
    const [justCreatedThreadId, setJustCreatedThreadId] = useState(null);
    const [replyParentId, setReplyParentId] = useState(initial.replyParentId);
    const [collapsedForumPlaceIds, setCollapsedForumPlaceIds] = useState(() => {
        const places = buildPlaces(data);
        return new Set(defaultForumCollapsedBranchIds(places));
    });
    const [forumPlaceFilterQ, setForumPlaceFilterQ] = useState('');
    const [forumMobNavOpen, setForumMobNavOpen] = useState(false);
    const [forumMobNavStack, setForumMobNavStack] = useState([]);
    const [forumDeskNavStack, setForumDeskNavStack] = useState([]);
    const [modPanelOpen, setModPanelOpen] = useState(false);
    const [modPolicyMode, setModPolicyMode] = useState('free');
    const [modPolicyLoading, setModPolicyLoading] = useState(false);
    const [modPendingList, setModPendingList] = useState([]);
    const [modPendingLoading, setModPendingLoading] = useState(false);

    const searchTimerRef = useRef(null);
    const lastSidRef = useRef(activeSource?.id);
    const filterFocusRef = useRef({ id: null, start: null, end: null });

    const src = activeSource;
    const snap = src ? forumStore.getSnapshot(src.id) : null;
    const allThreads = (snap && snap.threads) || [];
    const allMessages = (snap && snap.messages) || [];
    const isPublicForumTree = !!(src && parseNostrTreeUrl(src.url));
    const forumNavEnabled = isTreeForumEnabled(rawGraphData?.meta, activeSource);
    const isAuthed = typeof isSignedIn === 'function' && isSignedIn();
    const mod = !!constructionMode && canModerateForum();

    const nav = useMemo(
        () =>
            resolveForumNavState({
                placeId,
                threadId,
                mobilePanel,
                replyParentId,
                collapsedForumPlaceIds,
                forumPlaceFilterQ,
                allThreads,
                allMessages,
                root: data,
            }),
        [
            placeId,
            threadId,
            mobilePanel,
            replyParentId,
            collapsedForumPlaceIds,
            forumPlaceFilterQ,
            allThreads,
            allMessages,
            data,
        ]
    );

    useEffect(() => {
        if (!nav.changed) return;
        if (nav.placeId !== placeId) setPlaceId(nav.placeId);
        if (nav.threadId !== threadId) setThreadId(nav.threadId);
        if (nav.mobilePanel !== mobilePanel) setMobilePanel(nav.mobilePanel);
        if (nav.replyParentId !== replyParentId) setReplyParentId(nav.replyParentId);
    }, [nav, placeId, threadId, mobilePanel, replyParentId]);

    const effPlaceId = nav.placeId;
    const effThreadId = nav.threadId;
    const effMobilePanel = nav.mobilePanel;
    const effReplyParentId = nav.replyParentId;
    const { places, placeById, here, msgs } = nav;

    const pLabel = forumPlaceLabel(places, effPlaceId, ui);
    const placeIsGeneral = isGeneral(effPlaceId);
    const activeT = effThreadId ? allThreads.find((t) => t.id === effThreadId) : null;
    const tTitle = activeT ? displayThreadTitle(activeT, ui) : ui.forumPickThread || 'Select a topic';
    const structureHint = String(ui.forumStructureHint || '').trim();

    const shellOpts = useMemo(() => {
        const fromMobileMore = !!(
            modal &&
            typeof modal === 'object' &&
            modal.fromMobileMore
        );
        return fromMobileMore ? { instantOpen: true } : {};
    }, [modal]);

    const myPub = useCallback(() => {
        try {
            return (getNetworkUserPair && getNetworkUserPair() ? getNetworkUserPair().pub : undefined) || '';
        } catch {
            return '';
        }
    }, []);

    const actor = useCallback(() => (fileSystem.isLocal ? 'local-owner' : 'web'), []);

    const close = useCallback(() => {
        if (embedded) return;
        dismissModal();
    }, [embedded]);

    const stashShell = useCallback(() => {
        stashForumShellBeforeDialog({
            threadId: effThreadId,
            placeId: effPlaceId,
            mobilePanel: effMobilePanel,
            draft,
            replyParentId: effReplyParentId,
        });
    }, [effThreadId, effPlaceId, effMobilePanel, draft, effReplyParentId]);

    const resetForumState = useCallback(() => {
        const placesNext = buildPlaces(data);
        setPlaceId(null);
        setThreadId(null);
        setMobilePanel('threads');
        setScrollPostsToEnd(true);
        setJustCreatedThreadId(null);
        setFocusComposeNext(false);
        setReplyParentId(null);
        setSearchQ('');
        setSearching(false);
        setSearchResults([]);
        setCollapsedForumPlaceIds(new Set(defaultForumCollapsedBranchIds(placesNext)));
        setForumPlaceFilterQ('');
        setScrollThreadsTop(false);
        setForumMobNavOpen(false);
        setForumMobNavStack([]);
        setForumDeskNavStack([]);
        setNewTopicOpen(false);
        setNewTopicTitle('');
        setNewTopicBody('');
    }, []);

    useEffect(() => {
        const m = modal;
        if (m && typeof m === 'object' && m.type === 'forum' && m.placeId != null && String(m.placeId).trim() !== '') {
            const { placeId: pid, collapsed } = expandAncestorsForPlace(
                String(m.placeId),
                collapsedForumPlaceIds,
                data
            );
            setCollapsedForumPlaceIds(collapsed);
            if (pid) setPlaceId(pid);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only open-place hint
    }, []);

    useEffect(() => {
        const sid = activeSource?.id;
        if (lastSidRef.current !== sid) {
            lastSidRef.current = sid;
            resetForumState();
        }
    });

    useEffect(() => {
        const u = activeSource?.url;
        if (!u || !parseNostrTreeUrl(String(u)) || !isAuthed) return undefined;
        void ensureTreeForumPlaceLoaded(effPlaceId);
        if (effThreadId) void ensureTreeForumThreadLoaded(effThreadId);
        return undefined;
    }, [effPlaceId, effThreadId, isAuthed, activeSource?.id]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const u = activeSource?.url;
                if (!u || !parseNostrTreeUrl(String(u)) || !isAuthed) return;
                await hydrateTreeForumIfNeeded();
                await ensureTreeForumPlaceLoaded(effPlaceId);
                if (effThreadId) await ensureTreeForumThreadLoaded(effThreadId);
            } catch {
                /* hydrateTreeForumIfNeeded already logs */
            }
            if (!cancelled) {
                /* trigger re-render via store subscription */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isAuthed, activeSource?.id]);

    const scheduleSearch = useCallback((q) => {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        const trimmed = String(q || '').trim();
        if (!trimmed) {
            setSearchResults([]);
            setSearching(false);
            return;
        }
        setSearching(true);
        searchTimerRef.current = setTimeout(async () => {
            try {
                const results = await searchTreeForumV3(trimmed, { maxWeeks: 18, maxResults: 80 });
                setSearchResults(results);
            } catch {
                setSearchResults([]);
            } finally {
                setSearching(false);
            }
        }, 350);
    }, []);

    useEffect(
        () => () => {
            if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        },
        []
    );

    const pickPlace = useCallback(
        (rawId, { scrollTop = false, closeMobNav = false } = {}) => {
            const prev = effPlaceId;
            const next = rawId === '' || rawId == null ? null : rawId;
            const changed = String(next != null ? next : '') !== String(prev != null ? prev : '');
            setPlaceId(next);
            setJustCreatedThreadId(null);
            setThreadId(null);
            setReplyParentId(null);
            setMobilePanel('threads');
            if (closeMobNav) setForumMobNavOpen(false);
            if (changed && scrollTop) setScrollThreadsTop(true);
            setScrollPostsToEnd(true);
        },
        [effPlaceId]
    );

    const showLoginRequiredDialog = useCallback(() => {
        void requireSignInDialog(getArboritoStore(), {
            title: ui.forumLoginRequiredTitle || 'Sign in to participate',
            body: ui.forumLoginRequiredBody || 'Debes estar logueado para escribir en el foro.',
            confirmText: ui.forumLoginGoToProfile || ui.publishNeedLoginTitle || 'Ir a Perfil',
            dialogIcon: '🪪',
        });
    }, [ui]);

    const openNewTopicSheet = useCallback(() => {
        if (!isAuthed) {
            showLoginRequiredDialog();
            return;
        }
        setNewTopicOpen(true);
        setNewTopicTitle('');
        setNewTopicBody('');
    }, [isAuthed, showLoginRequiredDialog]);

    const cancelNewTopicSheet = useCallback(() => {
        setNewTopicOpen(false);
        setNewTopicTitle('');
        setNewTopicBody('');
    }, []);

    const commitNewTopic = useCallback(async () => {
        if (creatingTopic) return;
        const title = String(newTopicTitle || '').trim();
        const body = String(newTopicBody || '').trim();
        if (!title) {
            notify(ui.forumNewTopicNeedsTitle || ui.forumNewThreadPrompt || 'Title required.', true);
            return;
        }
        if (!body) {
            notify(ui.forumNewTopicNeedsBody || 'Write the first message for this topic.', true);
            return;
        }
        const activeSrc = activeSource;
        if (!activeSrc) return;
        setCreatingTopic(true);
        const t = addForumThread(activeSrc.id, {
            title,
            nodeId: isGeneral(effPlaceId) ? null : String(effPlaceId),
        });
        const author = { name: '', avatar: '💬' };
        try {
            await addForumMessage(activeSrc.id, { threadId: t.id, body, author, parentId: null });
        } catch (e) {
            console.warn('Forum first post failed', e);
            try {
                if (forumStore?.deleteThread) {
                    forumStore.deleteThread(activeSrc.id, t.id, { actor: 'self-rollback' });
                }
            } catch {
                /* best-effort */
            }
            notify(ui.forumPostFailed || 'Could not create topic. Try again.', true);
            setCreatingTopic(false);
            return;
        }
        setCreatingTopic(false);
        cancelNewTopicSheet();
        setThreadId(t.id);
        setMobilePanel('posts');
        setJustCreatedThreadId(null);
        setFocusComposeNext(false);
        setReplyParentId(null);
        setDraft('');
        setScrollPostsToEnd(true);
        const openedMsg = ui.forumNewTopicOpened;
        if (openedMsg) notify(openedMsg, false);
        update({});
    }, [creatingTopic, newTopicTitle, newTopicBody, effPlaceId, ui, cancelNewTopicSheet]);

    const onPost = useCallback(async () => {
        if (posting) return;
        const body = String(draft || '').trim();
        if (!body || !effThreadId) return;
        const activeSrc = activeSource;
        if (!activeSrc) return;
        setPosting(true);
        const author = { name: '', avatar: '💬' };
        try {
            await addForumMessage(activeSrc.id, {
                threadId: effThreadId,
                body,
                author,
                parentId: effReplyParentId || null,
            });
            setDraft('');
            setJustCreatedThreadId(null);
            setReplyParentId(null);
            setScrollPostsToEnd(true);
            update({});
        } catch (e) {
            console.warn('Forum post failed', e);
            notify(ui.forumPostFailed || 'Could not send your message. Try again.', true);
        } finally {
            setPosting(false);
        }
    }, [posting, draft, effThreadId, effReplyParentId, ui]);

    const onReplyTo = useCallback((messageId) => {
        if (!effThreadId || !messageId) return;
        setReplyParentId(String(messageId));
        setDraft('');
        setScrollPostsToEnd(false);
        setFocusComposeNext(true);
    }, [effThreadId]);

    const onModDeleteMsg = useCallback(
        async (id) => {
            const activeSrc = activeSource;
            if (!activeSrc || !mod) return;
            stashShell();
            if (!(await confirm(ui.forumModDeleteMessageConfirm || 'Remove this message?', ui.forumModDeleteTitle || 'Remove message', true))) return;
            if (moderateDeleteForumMessage(activeSrc.id, id, { actor: actor() })) {
                notify(ui.forumModRepublishHint || 'Republish the tree so shared links update.', false);
                update({});
            }
        },
        [mod, stashShell, ui, actor]
    );

    const onSelfDeleteMsg = useCallback(
        async (id) => {
            const activeSrc = activeSource;
            if (!activeSrc) return;
            stashShell();
            if (!(await confirm(ui.forumSelfDeleteConfirm || 'Delete your message?', ui.forumSelfDeleteTitle || 'Delete my message', true))) return;
            await selfDeleteForumMessage(activeSrc.id, id);
            update({});
        },
        [stashShell, ui]
    );

    const onModDeleteThread = useCallback(
        async (tid) => {
            const activeSrc = activeSource;
            if (!activeSrc || !mod) return;
            stashShell();
            if (!(await confirm(ui.forumModDeleteThreadConfirm || 'Delete this entire topic?', ui.forumModDeleteThreadTitle || 'Delete topic', true))) return;
            if (moderateDeleteForumThread(activeSrc.id, tid, { actor: actor() })) {
                if (effThreadId === tid) {
                    setThreadId(null);
                    setMobilePanel('threads');
                }
                notify(ui.forumModRepublishHint || 'Republish the tree so shared links update.', false);
                update({});
            }
        },
        [mod, stashShell, ui, actor, effThreadId]
    );

    const onModRemoveUser = useCallback(
        async (pub) => {
            const activeSrc = activeSource;
            if (!activeSrc || !mod || !pub) return;
            stashShell();
            const treeRef = parseNostrTreeUrl(activeSrc.url);
            let isBanned = false;
            try {
                if (treeRef && loadForumBansV3) {
                    const set = await loadForumBansV3({ ownerPub: treeRef.pub, universeId: treeRef.universeId });
                    isBanned = !!(set?.has?.(String(pub)));
                }
            } catch {
                /* ignore */
            }
            if (isBanned) {
                if (!(await confirm(ui.forumModUnbanUserConfirm || 'Unban this user?', ui.forumModUnbanUserTitle || 'Unban user', true))) return;
                await setForumBanForActiveTree({ targetPub: pub, banned: false });
            } else {
                if (!(await confirm(ui.forumModBanUserConfirm || 'Ban this user?', ui.forumModBanUserTitle || 'Ban user and remove messages', true))) return;
                await setForumBanForActiveTree({ targetPub: pub, banned: true });
            }
        },
        [mod, stashShell, ui]
    );

    const onDelAccount = useCallback(async () => {
        const activeSrc = activeSource;
        if (!activeSrc || !parseNostrTreeUrl(activeSrc.url)) return;
        stashShell();
        if (!(await confirm(ui.forumDeleteMyAccountConfirm || 'Remove your online identity?', ui.forumDeleteMyAccountTitle || 'Remove my online identity', true))) return;
        if (!(await confirm(ui.forumDeleteMyAccountConfirmFinal || 'This is your last step. Remove your online identity for this course?', ui.forumDeleteMyAccountTitle || 'Remove my online identity', true))) return;
        await selfDeleteNostrForumAccount(activeSrc.id);
    }, [stashShell, ui]);

    const refreshModPolicyMode = useCallback(async () => {
        const treeRef = parseNostrTreeUrl(activeSource?.url || '');
        if (!treeRef) return;
        try {
            setModPolicyMode(await getForumModerationModeForActiveTree(treeRef));
        } catch {
            setModPolicyMode('free');
        }
    }, []);

    const refreshPendingList = useCallback(async () => {
        if (!mod) {
            setModPendingList([]);
            return;
        }
        setModPendingLoading(true);
        try {
            setModPendingList(await listForumPendingSummariesForActiveTree());
        } catch {
            setModPendingList([]);
        } finally {
            setModPendingLoading(false);
        }
    }, [mod]);

    const toggleModPanel = useCallback(async () => {
        if (!mod) return;
        const next = !modPanelOpen;
        setModPanelOpen(next);
        if (next) {
            await refreshModPolicyMode();
            void refreshPendingList();
        }
    }, [mod, modPanelOpen, refreshModPolicyMode, refreshPendingList]);

    const setModPolicy = useCallback(
        async (mode) => {
            if (!mod) return;
            const next = mode === 'strict' ? 'strict' : 'free';
            if (modPolicyLoading || modPolicyMode === next) return;
            setModPolicyLoading(true);
            const ok = await setForumModerationPolicyMode(next);
            if (ok) setModPolicyMode(next);
            setModPolicyLoading(false);
            if (modPanelOpen) await refreshPendingList();
        },
        [mod, modPolicyLoading, modPolicyMode, modPanelOpen, refreshPendingList]
    );

    const approvePending = useCallback(
        async (messageId) => {
            const activeSrc = activeSource;
            if (!activeSrc || !mod || !messageId) return;
            await approveForumPendingMessage(activeSrc.id, messageId);
            await refreshPendingList();
        },
        [mod, refreshPendingList]
    );

    const rejectPending = useCallback(
        async (messageId) => {
            const activeSrc = activeSource;
            if (!activeSrc || !mod || !messageId) return;
            stashShell();
            if (!(await confirm(ui.forumModRejectConfirm || 'Reject and discard this pending message?', ui.forumModRejectTitle || 'Reject message', true))) return;
            await rejectForumPendingMessage(activeSrc.id, messageId);
            await refreshPendingList();
        },
        [mod, stashShell, ui, refreshPendingList]
    );

    const onMessageAction = useCallback(
        async (act, id) => {
            if (act === 'reply-to') onReplyTo(id);
            else if (act === 'del-thread') await onModDeleteThread(id);
            else if (act === 'mod-del') await onModDeleteMsg(id);
            else if (act === 'self-del') await onSelfDeleteMsg(id);
            else if (act === 'mod-user') await onModRemoveUser(id);
        },
        [onReplyTo, onModDeleteThread, onModDeleteMsg, onSelfDeleteMsg, onModRemoveUser]
    );

    const onFilterChange = useCallback((value, inputId) => {
        setForumPlaceFilterQ(value);
        filterFocusRef.current = { id: inputId, start: null, end: null };
        const el = document.getElementById(inputId);
        if (el) {
            filterFocusRef.current.start = el.selectionStart;
            filterFocusRef.current.end = el.selectionEnd;
        }
        requestAnimationFrame(() => {
            const { id, start, end } = filterFocusRef.current;
            if (!id) return;
            const next = document.getElementById(id);
            if (next) {
                next.focus();
                try {
                    if (typeof start === 'number' && typeof end === 'number') next.setSelectionRange(start, end);
                } catch {
                    /* noop */
                }
            }
        });
    }, []);

    const onSearchHit = useCallback(
        async (r) => {
            setPlaceId(r.placeId ? r.placeId : null);
            setThreadId(r.threadId);
            setMobilePanel('posts');
            setSearchQ('');
            setSearchResults([]);
            await ensureTreeForumPlaceLoaded(r.placeId || null);
            if (r.threadId && r.weekKey) await ensureTreeForumThreadWeekLoaded(r.threadId, r.weekKey);
        },
        []
    );

    const onLoadOlder = useCallback(async () => {
        if (!effThreadId) return;
        const all = await getTreeForumThreadWeeks(effThreadId);
        const loaded = new Set(getLoadedForumThreadWeeks(effThreadId));
        const next = all.find((wk) => !loaded.has(wk));
        if (!next) return;
        await ensureTreeForumThreadWeekLoaded(effThreadId, next);
    }, [effThreadId]);

    const onStackBack = useCallback(() => {
        if (effMobilePanel === 'posts') {
            setMobilePanel('threads');
            return;
        }
        if (!embedded) close();
    }, [effMobilePanel, embedded, close]);

    const onMobNavDismiss = useCallback(() => {
        if (forumMobNavStack.length) {
            setForumMobNavStack((s) => s.slice(0, -1));
        } else {
            setForumMobNavOpen(false);
        }
    }, [forumMobNavStack.length]);

    const handleMoreBack = useCallback(() => {
        if (!embedded) return false;
        if (forumMobNavOpen) {
            onMobNavDismiss();
            return true;
        }
        if (effMobilePanel === 'posts') {
            setMobilePanel('threads');
            return true;
        }
        return false;
    }, [embedded, forumMobNavOpen, onMobNavDismiss, effMobilePanel]);

    useEffect(() => {
        if (!embedded) return undefined;
        // Hide MobMoreSheet hero when forum renders its own (place nav or open thread).
        const hideOuterHero =
            forumMobNavOpen || (effMobilePanel === 'posts' && !!effThreadId);
        getPanelRef('sidebar')?.setForumEmbedSubNavOpen?.(hideOuterHero);
        return () => getPanelRef('sidebar')?.setForumEmbedSubNavOpen?.(false);
    }, [embedded, forumMobNavOpen, effMobilePanel, effThreadId]);

    useRegisterPanel('modal-forum', () => ({
        close,
        handleMoreBack: embedded ? handleMoreBack : undefined,
    }));

    const threadsProps = {
        onSearchChange: (v) => {
            setSearchQ(v);
            scheduleSearch(v);
        },
        onSelectThread: (id) => {
            if (id !== justCreatedThreadId) setJustCreatedThreadId(null);
            setThreadId(id);
            setSearchQ('');
            setSearchResults([]);
            setReplyParentId(null);
            setMobilePanel('posts');
            setScrollPostsToEnd(true);
        },
        onSearchHit,
        onLoadOlder,
        onBackToTopics: () => {
            setThreadId(null);
            setReplyParentId(null);
            setMobilePanel('threads');
            setScrollPostsToEnd(true);
        },
        onOpenNewTopic: openNewTopicSheet,
        onPost,
        onDraftChange: setDraft,
        onCancelReply: () => setReplyParentId(null),
        onMessageAction,
        onDeleteAccount: onDelAccount,
        onNewTopicTitleChange: setNewTopicTitle,
        onNewTopicBodyChange: setNewTopicBody,
        onCancelNewTopic: cancelNewTopicSheet,
        onCreateNewTopic: commitNewTopic,
        onPostsScrolled: () => setScrollPostsToEnd(false),
        onThreadsScrolled: () => setScrollThreadsTop(false),
        onComposeFocused: () => setFocusComposeNext(false),
    };


    return {
        ui,
        lang,
        langLower,
        mobile,
        embedded,
        setModal,
        dismissModal,
        close,
        src,
        rawGraphData,
        forumNavEnabled,
        isPublicForumTree,
        isAuthed,
        shellOpts,
        mod,
        effPlaceId,
        effThreadId,
        effMobilePanel,
        effReplyParentId,
        pLabel,
        placeIsGeneral,
        tTitle,
        places,
        placeById,
        allThreads,
        allMessages,
        here,
        msgs,
        forumPlaceFilterQ,
        forumMobNavOpen,
        forumMobNavStack,
        forumDeskNavStack,
        structureHint,
        modPolicyMode,
        modPolicyLoading,
        modPendingList,
        modPendingLoading,
        modPanelOpen,
        searchQ,
        searching,
        searchResults,
        draft,
        posting,
        justCreatedThreadId,
        newTopicOpen,
        newTopicTitle,
        newTopicBody,
        creatingTopic,
        scrollPostsToEnd,
        scrollThreadsTop,
        focusComposeNext,
        myPub,
        threadsProps,
        openNewTopicSheet,
        onFilterChange,
        onMobNavDismiss,
        pickPlace,
        setForumMobNavOpen,
        setForumMobNavStack,
        setForumDeskNavStack,
        setModPolicy,
        toggleModPanel,
        refreshPendingList,
        approvePending,
        rejectPending,
        onStackBack,
    };
}
