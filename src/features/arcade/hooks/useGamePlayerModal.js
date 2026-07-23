import { useArcade } from './useArcade.js';
import { useSageAi } from '../../learning/hooks/useSageAi.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { shouldShowMobileUI, clearArboritoGameImmersiveOpen } from '../../../shared/ui/breakpoints.js';
import { setMainAppInert } from '../../../shared/ui/focus-trap.js';
import { storageManager } from '../../backup-export/api/storage-manager.js';
import { fileSystem } from '../../backup-export/api/filesystem.js';
import { buildGameSdkInjection } from '../api/inject-game-sdk.js';
import { formatUserHandle, computePublicTag } from '../../../shared/lib/user-handle.js';
import {
    lessonBodyHasPlayableQuiz,
    parseAllChallengesFromLessonContent,
} from '../../learning/api/quiz-status.js';
import { parseLessonMetaTagsFromContent } from '../../learning/api/lesson-meta-tags.js';
import { parseLessonFrontmatter, parseLessonProgressDetails } from '../../../shared/lib/lesson-frontmatter.js';
import { lessonPlainTextForGames, lessonPlainTextFromLesson } from '../../learning/api/lesson-plain-text.js';
import { buildGameSrcdoc } from '../api/game-bundle.js';
import { buildQuizModesBridge } from '../api/game-quiz-cards.js';
import { fetchGameBundleForPlay } from '../api/game-offline-cache.js';
import { buildGameIframeEmojiInjection } from '../../../shared/lib/emoji-display.js';
import { isElectronDesktop, pickHostUi } from '../../learning/api/electron-bridge.js';
import {
    grantSageExperimentalConsent,
    grantSageDownloadConsent,
    hasSageAiConsentForInit,
} from '../../learning/api/sage-ai-consent.js';
import { resolveArcadeReturnModal } from '../api/arcade-modal-nav.js';

const GAME_XP_SCALE =
    typeof globalThis.GAME_XP_SCALE === 'number' ? globalThis.GAME_XP_SCALE : 1;

function syncGameImmersiveChrome() {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('arborito-game-immersive-open', shouldShowMobileUI());
}

async function waitForGameFrame(iframeRef, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (!iframeRef.current) {
        if (Date.now() >= deadline) return false;
        await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return true;
}
/** Game player modal, session prep, AI consent, iframe bridge (jr entry for ModalGamePlayer). */
export function useGamePlayerModal(embed) {
    const {
        ui,
        dismissModal,
        setModal,
        notify,
        update,
        modal: modalState,
        ai,
        lang,
        gamification,
        userStore,
        arcadeActions,
    } = useArcade();

    const {
        loadNodeContent,
        loadNodeChildren,
        findNode,
        initSage,
        addXP,
        getNetworkUserPair,
        addEventListener,
        removeEventListener,
    } = arcadeActions;
    const sageAi = useSageAi();
    const modal = modalState || {};
    const { url, title } = modal;

    const iframeRef = useRef(null);
    const cursorIndexRef = useRef(0);
    const playlistRef = useRef([]);
    const sessionXPRef = useRef(0);
    const aiModeRef = useRef('static');
    const scriptCacheRef = useRef(new Map());
    const initRunRef = useRef(0);
    const aiRef = useRef(ai);

    useEffect(() => {
        aiRef.current = ai;
    }, [ai]);

    const [isPreparing, setIsPreparing] = useState(true);
    const [needsConsent, setNeedsConsent] = useState(false);
    const [checkingAI, setCheckingAI] = useState(false);
    const [aiBrowserLoading, setAiBrowserLoading] = useState(false);
    const [aiError, setAiError] = useState(null);
    const [error, setError] = useState(null);
    const [staticQuizLessonCount, setStaticQuizLessonCount] = useState(0);
    const [frameVisible, setFrameVisible] = useState(false);
    const [showIframe, setShowIframe] = useState(false);
    const [aiProgress, setAiProgress] = useState('');
    const [gameAiBusy, setGameAiBusy] = useState(false);
    const [gameAiBusyLabel, setGameAiBusyLabel] = useState('');

    const close = useCallback(() => {
        try {
            const iframe = iframeRef.current;
            if (iframe) {
                iframe.onload = null;
                iframe.removeAttribute('srcdoc');
            }
            if (document.pointerLockElement) {
                document.exitPointerLock();
            }
        } catch {
            /* ignore */
        }
        if (sessionXPRef.current > 0) {
            notify(
                `+${sessionXPRef.current} ${ui.arcadeScoreUnit || ui.xpUnit || 'pts'}, ${ui.gameSessionComplete}`
            );
        }
        clearArboritoGameImmersiveOpen();
        setMainAppInert(false);
        setModal(resolveArcadeReturnModal(modalState));
    }, [ui, notify, setModal, modalState]);

    const fetchLessonContent = useCallback(async (node) => {
        if (!node) return null;
        if (
            !node.content &&
            (fileSystem.isLocal || node.contentPath || (node.treeLazyContent && node.treeContentKey))
        ) {
            await loadNodeContent(node);
        }
        const raw = node.content || '';
        const rawHead = raw.slice(0, 12000);
        const hasGameTag = /^\s*@game\s*$/m.test(rawHead);
        if (hasGameTag) {
            const stripped = rawHead
                .replace(/^\s*@\w+.*$/gm, '')
                .replace(/^\s*#+\s+.*$/gm, '')
                .replace(/\s+/g, ' ')
                .trim();
            if (!stripped) return null;
        }

        const clean = lessonPlainTextForGames(raw);
        const meta = parseLessonMetaTagsFromContent(raw);
        const frontmatter = parseLessonFrontmatter(raw);
        const progress_details = parseLessonProgressDetails(raw);
        /* Canonical questionnaire source: fenced @quiz blocks (header + body),
         * already normalized by quiz-schema.js. */
        const challenges = parseAllChallengesFromLessonContent(raw).map((b) => ({
            id: b.id,
            core_concept: b.core_concept,
            short_definition: b.short_definition,
            main_question: b.main_question,
            correct_answer: b.correct_answer,
            traps: Array.isArray(b.traps) ? [...b.traps] : [],
            cloze_indices: Array.isArray(b.cloze_indices) ? [...b.cloze_indices] : [],
            steps: Array.isArray(b.steps) ? [...b.steps] : [],
            modes: Array.isArray(b.modes) ? [...b.modes] : [],
            answer_mode: b.answer_mode === 'steps' ? 'steps' : 'chips',
            skip_multiple: !!b.skip_multiple,
            skip_ordering: !!b.skip_ordering,
        }));
        const memSt = userStore.getMemoryStatus(node.id);
        return {
            id: node.id,
            title: node.name,
            text: clean,
            raw,
            challenge: challenges[0] || null,
            challenges,
            meta,
            frontmatter,
            progress_details,
            memoryHealth: memSt.health,
            memoryDue: memSt.isDue,
            memoryInterval: memSt.interval,
        };
    }, []);

    const setupBridge = useCallback(() => {
        const gameId = modalState?.url;
        let storageId = 'unknown_game';
        try {
            const urlObj = new URL(gameId);
            const pathParts = urlObj.pathname.split('/');
            if (pathParts.length >= 2) storageId = pathParts[pathParts.length - 2];
        } catch {
            storageId = gameId;
        }

        window.__ARBORITO_GAME_BRIDGE__ = {
            getAIMode: () => aiModeRef.current,
            /* Canonical quiz mode rules + card building (quiz-schema.js via
             * game-quiz-cards.js). The injected SDK delegates here so the
             * logic is never duplicated inside iframes. */
            quizModes: buildQuizModesBridge(),
            addXP: (amount) => {
                const n = Math.max(0, Math.floor(Number(amount) || 0));
                if (n <= 0) return;
                const scaled = Math.max(1, Math.floor(n * GAME_XP_SCALE));
                sessionXPRef.current += scaled;
                addXP(scaled, { fromArcade: true, silent: true });
            },
            getCurriculum: () => playlistRef.current.map((l) => ({ id: l.id, title: l.name })),
            getNextLesson: async () => {
                const playlist = playlistRef.current;
                if (playlist.length === 0) return null;
                const max = playlist.length;
                for (let attempt = 0; attempt < max; attempt++) {
                    if (cursorIndexRef.current >= playlist.length) cursorIndexRef.current = 0;
                    const node = playlist[cursorIndexRef.current++];
                    const res = await fetchLessonContent(node);
                    if (res) return res;
                }
                return null;
            },
            getLessonAt: async (index) => {
                const playlist = playlistRef.current;
                if (index < 0 || index >= playlist.length) return null;
                return fetchLessonContent(playlist[index]);
            },
            getLessonPlainText: (lessonOrRaw) => lessonPlainTextFromLesson(lessonOrRaw),
            aiChat: async (promptMessages, lessonCtx) => {
                if (aiModeRef.current === 'static') {
                    throw new Error('AI not available in static mode');
                }
                let ctxNode = null;
                if (lessonCtx && typeof lessonCtx === 'object') {
                    const raw = lessonCtx.raw || lessonCtx.text || '';
                    ctxNode = {
                        id: lessonCtx.id,
                        type: 'leaf',
                        name: lessonCtx.title || lessonCtx.name || '',
                        content: raw,
                    };
                } else {
                    const idx = Math.max(0, (cursorIndexRef.current || 1) - 1);
                    const node = playlistRef.current[idx];
                    if (node) {
                        const lesson = await fetchLessonContent(node);
                        if (lesson) {
                            ctxNode = {
                                id: lesson.id,
                                name: lesson.title || '',
                                content: lesson.raw || lesson.text || '',
                            };
                        }
                    }
                }
                const prevMode = (aiRef.current && aiRef.current.contextMode) || 'sage-tree';
                update({ ai: { ...aiRef.current, contextMode: 'game' } });
                try {
                    return await sageAi.chat(promptMessages, ctxNode);
                } finally {
                    update({ ai: { ...aiRef.current, contextMode: prevMode } });
                }
            },
            save: (key, value) => {
                try {
                    const ok = storageManager.saveGameData(storageId, key, value);
                    /* Mirror into userStore so encrypted Nostr progress sync carries arcade saves. */
                    try {
                        userStore?.saveGameData?.(storageId, key, value);
                    } catch {
                        /* local mirror is best-effort */
                    }
                    return ok;
                } catch (e) {
                    console.error('Game Save Failed:', e);
                    notify(`⚠️ ${ui.gameStorageFullWarn}`);
                    return false;
                }
            },
            load: (key) => {
                const fromArcade = storageManager.loadGameData(storageId, key);
                if (fromArcade != null) return fromArcade;
                try {
                    return userStore?.loadGameData?.(storageId, key) ?? null;
                } catch {
                    return null;
                }
            },
            getDue: () => userStore.getDueNodes(),
            getMemoryStatus: (nodeId) => userStore.getMemoryStatus(nodeId),
            isMemoryDue: (nodeId) => userStore.getMemoryStatus(nodeId).isDue,
            reportMemory: (nodeId, quality) => userStore.reportMemory(nodeId, quality),
            reportError: (msg) => {
                console.error('Game Crash Reported:', msg);
                setError(msg);
            },
            setAiBusy: (busy, label) => {
                setGameAiBusy(!!busy);
                setGameAiBusyLabel(label ? String(label) : '');
            },
            close: () => close(),
        };
    }, [close, fetchLessonContent]);

    const loadGame = useCallback(
        async (bundlePromise = null) => {
            const m = modalState || {};
            const gameUrl = m.url;
            if (!gameUrl) return;

            const iframe = iframeRef.current;
            if (!iframe) {
                throw new Error(
                    ui.gameIframeMissing || 'No se pudo abrir el marco del juego. Vuelve a intentarlo.'
                );
            }

            const entryUrl = m.gameEntryUrl || gameUrl.split('?')[0];
            const gameId = m.offlineGameId || entryUrl;

            try {
                const bundle =
                    bundlePromise ||
                    fetchGameBundleForPlay(gameId, entryUrl, {
                        playOffline: !!m.playOffline,
                        gameVersion: m.gameVersion || '',
                        offlineMissingMessage:
                            ui.gameOfflineMissing ||
                            'No offline copy of this game. Play online once first.',
                    });
                const resolvedBundle = await bundle;
                scriptCacheRef.current.clear();

                let myPubForTag = '';
                try {
                    myPubForTag =
                        (getNetworkUserPair?.() ? getNetworkUserPair().pub : undefined) ||
                        '';
                } catch {
                    myPubForTag = '';
                }
                const g = gamification ?? userStore?.state?.gamification ?? {};
                const rawName = String(g.username || '').trim();
                const bridgeUser =
                    formatUserHandle(rawName, myPubForTag) ||
                    rawName ||
                    (myPubForTag ? `Player#${computePublicTag(myPubForTag)}` : '') ||
                    ui.gameDefaultStudentName;
                const bridgeAvatar = g.avatar || '👤';
                const bridgeLang = lang || 'EN';
                const sdkScriptContent = buildGameSdkInjection({
                    bridgeUser,
                    bridgeAvatar,
                    bridgeLang,
                });

                const gameSrcdocOpts = { sdkScriptContent };
                if (isElectronDesktop()) {
                    gameSrcdocOpts.emojiInjection = buildGameIframeEmojiInjection();
                }
                const finalHtml = await buildGameSrcdoc(entryUrl, resolvedBundle, gameSrcdocOpts);

                let revealed = false;
                const reveal = () => {
                    if (revealed) return;
                    revealed = true;
                    setFrameVisible(true);
                };
                const watchdog = window.setTimeout(reveal, 12000);
                iframe.onload = () => {
                    window.clearTimeout(watchdog);
                    reveal();
                };
                iframe.srcdoc = finalHtml;
                if (iframe.contentDocument?.readyState === 'complete') {
                    window.clearTimeout(watchdog);
                    reveal();
                }
            } catch (e) {
                setError(e.message);
                setIsPreparing(false);
            }
        },
        [ui]
    );

    const prepareCurriculum = useCallback(async () => {
        const { moduleId } = modalState || {};
        if (!moduleId) throw new Error('No context module selected.');

        const rootNode = findNode(moduleId);
        if (!rootNode) throw new Error('Could not find the selected module in memory.');

        const playlist = [];
        const collectLeaves = async (node) => {
            if (node.type === 'leaf' || node.type === 'exam') {
                playlist.push(node);
                return;
            }
            if (node.type === 'branch' || node.type === 'root') {
                if (node.hasUnloadedChildren) await loadNodeChildren(node);
                if (node.children && node.children.length) {
                    for (const child of node.children) await collectLeaves(child);
                } else if (Array.isArray(node.leafIds) && node.leafIds.length) {
                    for (const id of node.leafIds) {
                        const resolved = findNode(id);
                        if (resolved) await collectLeaves(resolved);
                    }
                }
            }
        };
        await collectLeaves(rootNode);
        cursorIndexRef.current = 0;

        if (playlist.length === 0) {
            throw new Error(
                'This module contains no playable lessons. Please select a different module.'
            );
        }

        if (aiModeRef.current === 'static') {
            let quizReady = 0;
            const SNIFF_BUDGET = Math.min(8, playlist.length);
            for (let i = 0; i < SNIFF_BUDGET; i++) {
                const body = playlist[i]?.content || '';
                if (body && lessonBodyHasPlayableQuiz(body)) quizReady += 1;
            }
            setStaticQuizLessonCount(quizReady);
        }

        try {
            const gameUrl = modalState?.url;
            if (gameUrl) {
                const u = new URL(gameUrl, window.location.href);
                const topicsRaw = u.searchParams.get('topics') || '';
                const ids = topicsRaw
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                if (ids.length > 0) {
                    const set = new Set(ids.map(String));
                    const filtered = playlist.filter((n) => set.has(String(n.id)));
                    if (filtered.length > 0) {
                        playlist.splice(0, playlist.length, ...filtered);
                        cursorIndexRef.current = 0;
                    }
                }
            }
        } catch {
            /* ignore */
        }

        if (modalState?.careDueOnly) {
            const dueSet = new Set(userStore.getDueNodes().map(String));
            const filtered = playlist.filter((n) => dueSet.has(String(n.id)));
            if (filtered.length === 0) {
                throw new Error(
                    ui.carePlaylistEmpty || 'No care reviews pending in this module.'
                );
            }
            playlist.splice(0, playlist.length, ...filtered);
            cursorIndexRef.current = 0;
        }

        if (fileSystem.isLocal) {
            const BATCH = 6;
            for (let i = 0; i < playlist.length; i += BATCH) {
                const slice = playlist.slice(i, i + BATCH);
                await Promise.all(
                    slice.map((n) => (n.content ? Promise.resolve() : loadNodeContent(n)))
                );
            }
        }

        playlistRef.current = playlist;
    }, [ui]);

    const startBundlePrefetch = useCallback(() => {
        const m = modalState || {};
        const gameUrl = m.url;
        if (!gameUrl) return null;
        const entryUrl = m.gameEntryUrl || gameUrl.split('?')[0];
        const gameId = m.offlineGameId || entryUrl;
        return fetchGameBundleForPlay(gameId, entryUrl, {
            playOffline: !!m.playOffline,
            gameVersion: m.gameVersion || '',
            offlineMissingMessage:
                ui.gameOfflineMissing || 'No offline copy of this game. Play online once first.',
        }).catch((e) => {
            console.error('Game bundle prefetch failed', e);
            throw e;
        });
    }, [ui]);

    const runPlaySession = useCallback(async () => {
        const bundlePromise = startBundlePrefetch();
        await prepareCurriculum();
        setupBridge();
        setIsPreparing(false);
        setShowIframe(true);
        const frameReady = await waitForGameFrame(iframeRef);
        if (!frameReady) {
            throw new Error(
                ui.gameIframeMissing || 'No se pudo abrir el marco del juego. Vuelve a intentarlo.'
            );
        }
        await loadGame(bundlePromise);
    }, [startBundlePrefetch, prepareCurriculum, setupBridge, loadGame, ui]);

    const initializeSession = useCallback(async () => {
        const runId = ++initRunRef.current;
        sessionXPRef.current = 0;
        setAiError(null);
        setError(null);
        setFrameVisible(false);
        setShowIframe(false);
        setIsPreparing(true);

        const m = modalState || {};
        const mode = m.aiMode || 'static';
        aiModeRef.current = mode;

        if (mode === 'static') {
            setNeedsConsent(false);
            setCheckingAI(false);
            try {
                await runPlaySession();
            } catch (e) {
                if (runId !== initRunRef.current) return;
                console.error('Failed to prepare game context', e);
                setError(e.message);
                notify(e.message, true);
                setIsPreparing(false);
            }
            return;
        }

        const hasConsent = hasSageAiConsentForInit();
        const webUnavailable = sageAi.isWebAiUnavailable();

        if (webUnavailable) {
            setNeedsConsent(false);
            setAiError(
                ui.gameAiWebUnavailable ||
                    pickHostUi(
                        ui,
                        'sageWebAiUnavailableShort',
                        'sageWebAiUnavailableShortApp',
                        ui.sageWebAiUnavailableShort
                    )
            );
            setIsPreparing(false);
            return;
        }

        if (!hasConsent) {
            setNeedsConsent(true);
            setIsPreparing(false);
            return;
        }

        setNeedsConsent(false);
        setCheckingAI(true);
        const isHealthy = await sageAi.checkHealth();
        if (runId !== initRunRef.current) return;
        setCheckingAI(false);

        if (!isHealthy) {
            setAiError(ui.gameAiErrorBrowser);
            setIsPreparing(false);
            return;
        }

        try {
            await runPlaySession();
        } catch (e) {
            if (runId !== initRunRef.current) return;
            console.error('Failed to prepare game context', e);
            setError(e.message);
            notify(e.message, true);
            setIsPreparing(false);
        }
    }, [runPlaySession, ui]);

    const afterGrantConsent = useCallback(async () => {
        grantSageExperimentalConsent();
        grantSageDownloadConsent();
        setNeedsConsent(false);
        let initFailed = false;
        if (sageAi.provider === 'expert-api' || sageAi.provider === 'llamacpp') {
            setAiBrowserLoading(true);
            try {
                await initSage();
            } catch (e) {
                console.error(e);
                initFailed = true;
                setAiError(
                    (e && e.message) ||
                        (typeof e === 'string' ? e : ui.gameAiErrorInitFailed) ||
                        ui.gameAiErrorInitFailed
                );
            }
            setAiBrowserLoading(false);
            if (initFailed) return;
        }
        await initializeSession();
    }, [initializeSession, ui]);

    const initializeSessionRef = useRef(initializeSession);
    initializeSessionRef.current = initializeSession;

    useEffect(() => {
        void initializeSessionRef.current();
        return () => {
            initRunRef.current += 1;
            clearArboritoGameImmersiveOpen();
            delete window.__ARBORITO_GAME_BRIDGE__;
            scriptCacheRef.current.forEach((blobUrl) => URL.revokeObjectURL(blobUrl));
            scriptCacheRef.current.clear();
            try {
                const iframe = iframeRef.current;
                if (iframe) {
                    iframe.onload = null;
                    iframe.removeAttribute('srcdoc');
                }
                if (document.pointerLockElement) {
                    document.exitPointerLock();
                }
            } catch {
                /* ignore */
            }
        };
    }, [url]);

    useEffect(() => {
        if (!aiBrowserLoading) return;
        const handler = () => {
            const p = ai?.progress ?? '';
            setAiProgress(String(p));
        };
        addEventListener('state-change', handler);
        return () => removeEventListener('state-change', handler);
    }, [aiBrowserLoading]);

    useEffect(() => {
        syncGameImmersiveChrome();
        return () => clearArboritoGameImmersiveOpen();
    });


    const getLoadingText = () => {
        let loadingText = ui.gameLoadingCartridge || 'Loading cartridge…';
        if (checkingAI) loadingText = ui.gameEstablishingUplink || 'Establishing neural uplink…';
        else if (isPreparing) {
            const baseText = (
                ui.gameReadingTree || 'Reading knowledge tree… ({count} lessons found)'
            ).replace('{count}', String(playlistRef.current.length));
            loadingText =
                aiModeRef.current === 'dynamic'
                    ? `${baseText} (${ui.arcadeAiModeDynamic || 'Dynamic mode'})`
                    : `${baseText} (${ui.arcadeAiModeStatic || 'Static'})`;
        }
        return loadingText;
    };

    return {
        ui,
        embed,
        url,
        title,
        close,
        aiBrowserLoading,
        aiProgress,
        needsConsent,
        afterGrantConsent,
        aiError,
        initializeSession,
        error,
        checkingAI,
        isPreparing,
        iframeRef,
        frameVisible,
        showIframe,
        staticQuizLessonCount,
        aiModeRef,
        getLoadingText,
        mob: shouldShowMobileUI(),
        gameAiBusy,
        gameAiBusyLabel,
    };
}
