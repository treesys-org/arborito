import { useLearning, useLearningAi, useLearningStore } from '../../hooks/useLearning.js';
import { useSageAi } from '../../hooks/useSageAi.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRegisterPanel } from '../../../../app/hooks/useRegisterPanel.js';
import { shouldAnimateDockEnter } from '../../../../shared/ui/modal-enter.js';
import { isElectronDesktop } from '../../api/electron-bridge.js';
import {
    getSageAiMode,
    initSageAiModeOnOpen,
    resetSageAiModeSession,
    setSageAiMode,
} from '../../api/sage-contextual.js';
import {
    grantSageDownloadConsent,
    grantSageExperimentalConsent,
    hasSageAiConsentForInit,
    hasSageExperimentalConsent,
    hasSageDownloadConsent,
    needsSageModelDownloadConsent,
    revokeSageDownloadConsent,
} from '../../api/sage-ai-consent.js';
import { defaultSageGuideNav } from '../../api/logic/sage-guide-context.js';
import { armSagePointerGuard, armSageSettingsDismissBlock, isSagePointerGuarded, isSageSettingsDismissBlocked } from '../../api/sage-pointer-guard.js';

function isSageModal(modal) {
    return modal && (modal === 'sage' || modal.type === 'sage');
}

function resolveLessonContext(modal) {
    return !!(modal && modal.sageLessonContext);
}

export function useSageState() {
    const store = useLearningStore();
    const state = useLearning();
    const ai = useLearningAi();
    const sageAi = useSageAi();
    const { modal, selectedNode, constructionMode } = state;

    const [isVisible, setIsVisible] = useState(false);
    const [sageAiMode, setSageAiModeState] = useState(() => getSageAiMode());
    const [mode, setMode] = useState('context');
    const [guideNav, setGuideNav] = useState(() => defaultSageGuideNav());
    const [sageLessonContext, setSageLessonContext] = useState(false);
    const [sageEnterAnim, setSageEnterAnim] = useState(false);
    const sageModelInitStartedRef = useRef(false);
    const sageModelInitDeclinedRef = useRef(false);
    const lastLessonNodeIdRef = useRef(null);
    const [forceTick, setForceTick] = useState(0);

    const bump = useCallback(() => setForceTick((n) => n + 1), []);

    const hide = useCallback(() => {
        if (isSagePointerGuarded()) return;
        if (hasSageAiConsentForInit()) {
            setSageAiMode(getSageAiMode());
        }
        resetSageAiModeSession();
        setIsVisible(false);
        setGuideNav(defaultSageGuideNav());
        setSageEnterAnim(false);
        sageModelInitStartedRef.current = false;
        sageModelInitDeclinedRef.current = false;
        setMode('context');
        setSageLessonContext(false);
        if (typeof document !== 'undefined') {
            document.documentElement.classList.remove('arborito-sage-open');
        }
    }, []);

    const close = useCallback(() => {
        if (isSagePointerGuarded()) return;
        hide();
        store.dismissModal();
    }, [hide]);

    const openSettings = useCallback((e) => {
        e?.stopPropagation?.();
        e?.preventDefault?.();
        armSagePointerGuard(1000);
        armSageSettingsDismissBlock(700);
        setMode('settings');
        bump();
    }, [bump]);

    const exitSettings = useCallback((e) => {
        e?.stopPropagation?.();
        if (isSagePointerGuarded() || isSageSettingsDismissBlocked()) return;
        sageAi.syncEnvironment();
        setMode('context');
        bump();
    }, [bump, sageAi]);

    const maybeStartModelInit = useCallback((force = false) => {
        const aiNow = store.value.ai || {};
        if (aiNow.status === 'loading' || aiNow.status === 'streaming' || aiNow.status === 'thinking') {
            return;
        }
        if (!sageAi.needsModelInit()) return;
        if (sageModelInitDeclinedRef.current && !force) return;
        if (!force && sageModelInitStartedRef.current) return;
        sageModelInitStartedRef.current = true;
        void store.initSage();
    }, [sageAi]);

    const switchSageAiMode = useCallback(
        (nextMode) => {
            armSagePointerGuard(800);
            setSageAiMode(nextMode);
            setSageAiModeState(nextMode);
            setMode('context');
            if (nextMode === 'guide') {
                setGuideNav(defaultSageGuideNav());
            } else if (!isElectronDesktop() && sageAi.isWebAiUnavailable()) {
                /* web gate shown via screen routing */
            } else if (!hasSageExperimentalConsent()) {
                /* dynamic consent */
            } else if (needsSageModelDownloadConsent() && !hasSageDownloadConsent()) {
                /* download consent */
            } else {
                maybeStartModelInit(true);
            }
            bump();
        },
        [bump, maybeStartModelInit, sageAi]
    );

    const acceptDynamicConsent = useCallback(() => {
        grantSageExperimentalConsent();
        if (needsSageModelDownloadConsent()) {
            grantSageDownloadConsent();
        }
        setSageAiMode('dynamic');
        setSageAiModeState('dynamic');
        store.update({
            ai: {
                ...store.value.ai,
                contextMode: constructionMode ? 'architect' : 'sage-tree',
            },
        });
        sageModelInitDeclinedRef.current = false;
        sageModelInitStartedRef.current = true;
        void store.initSage();
        bump();
    }, [bump, store, constructionMode]);

    const declineDynamicConsent = useCallback(() => {
        setSageAiMode('guide');
        setSageAiModeState('guide');
        setGuideNav(defaultSageGuideNav());
        bump();
    }, [bump]);

    const acceptDownloadConsent = useCallback(() => {
        grantSageDownloadConsent();
        setSageAiMode('dynamic');
        setSageAiModeState('dynamic');
        store.update({ ai: { ...store.value.ai, contextMode: 'sage-tree' } });
        sageModelInitDeclinedRef.current = false;
        sageModelInitStartedRef.current = true;
        void store.initSage();
        bump();
    }, [bump]);

    const saveConfig = useCallback(() => {
        setMode('context');
        sageAi.syncEnvironment();
        if (getSageAiMode() === 'dynamic') {
            maybeStartModelInit(true);
        }
        bump();
    }, [bump, maybeStartModelInit, sageAi]);

    const cancelSageLoading = useCallback(() => {
        store.abortSage();
        revokeSageDownloadConsent();
        sageModelInitStartedRef.current = false;
        sageModelInitDeclinedRef.current = false;
        store.update({
            ai: { ...store.value.ai, status: 'ready', progress: null },
        });
        bump();
    }, [bump]);

    const syncFromStore = useCallback(() => {
        const m = store.value.modal;
        const sageReq = isSageModal(m);

        if (sageReq) {
            const lessonCtx = resolveLessonContext(m);
            const lessonNode = lessonCtx ? store.value.selectedNode : null;
            const lessonNodeId = lessonNode?.id || null;

            setSageLessonContext(lessonCtx);
            setIsVisible((was) => {
                if (!was) {
                    setSageEnterAnim(shouldAnimateDockEnter(store._prevModal, m));
                    setGuideNav(defaultSageGuideNav());
                    initSageAiModeOnOpen();
                    setSageAiModeState(getSageAiMode());
                    if (typeof m === 'object' && m.mode === 'settings') setMode('settings');
                    else setMode('context');
                    if (!lessonCtx) setGuideNav(defaultSageGuideNav());
                }
                return true;
            });

            if (lessonCtx && lessonNodeId && lessonNodeId !== lastLessonNodeIdRef.current) {
                setGuideNav(defaultSageGuideNav());
            }
            lastLessonNodeIdRef.current = lessonNodeId;

            if (typeof document !== 'undefined') {
                document.documentElement.classList.add('arborito-sage-open');
            }

            if (sageAiMode === 'dynamic' && mode !== 'settings') {
                if (!isElectronDesktop() && sageAi.isWebAiUnavailable()) {
                    /* web gate */
                } else if (hasSageExperimentalConsent()) {
                    if (!(needsSageModelDownloadConsent() && !hasSageDownloadConsent())) {
                        maybeStartModelInit();
                    }
                }
            }
        } else if (isVisible && mode !== 'settings') {
            hide();
        }
    }, [hide, isVisible, maybeStartModelInit, mode, sageAiMode]);

    const checkState = useCallback(() => {
        syncFromStore();
        bump();
    }, [syncFromStore, bump]);

    useEffect(() => {
        syncFromStore();
    }, [modal, selectedNode?.id, constructionMode, sageAiMode, ai.status, ai.progress, ai.messages?.length, syncFromStore]);

    useEffect(() => {
        const onStoreModal = () => syncFromStore();
        store.addEventListener('arborito-modal-change', onStoreModal);
        store.addEventListener('state-change', onStoreModal);
        return () => {
            store.removeEventListener('arborito-modal-change', onStoreModal);
            store.removeEventListener('state-change', onStoreModal);
        };
    }, [syncFromStore]);

    useEffect(() => {
        if (!isVisible) return undefined;
        const onEmoji = () => bump();
        const onSageReady = () => bump();
        window.addEventListener('arborito-emoji-ready', onEmoji);
        window.addEventListener('arborito-sage-ready', onSageReady);
        return () => {
            window.removeEventListener('arborito-emoji-ready', onEmoji);
            window.removeEventListener('arborito-sage-ready', onSageReady);
        };
    }, [isVisible, bump]);

    const screen = useMemo(() => {
        if (!isVisible) return 'hidden';
        if (sageAiMode === 'dynamic') {
            if (!isElectronDesktop() && sageAi.isWebAiUnavailable()) return 'web-gate';
            if (!hasSageExperimentalConsent()) return 'dynamic-consent';
            if (needsSageModelDownloadConsent() && !hasSageDownloadConsent()) return 'download-consent';
            if (ai.status === 'loading') return 'loading';
            return 'chat';
        }
        return 'guide';
    }, [isVisible, mode, sageAiMode, ai.status, forceTick]);

    const panelApi = useMemo(
        () => ({
            get isVisible() {
                return isVisible;
            },
            hide,
            checkState,
            close,
        }),
        [isVisible, hide, checkState, close]
    );

    useRegisterPanel('sage', () => panelApi);

    return {
        ui: store.ui,
        isVisible,
        mode,
        screen,
        guideNav,
        setGuideNav,
        sageLessonContext,
        sageDockUi: !!(modal && typeof modal === 'object' && modal.dockUi),
        sageEnterAnim,
        sageAiMode,
        ai,
        constructionMode,
        selectedNode,
        hide,
        close,
        openSettings,
        exitSettings,
        switchSageAiMode,
        acceptDynamicConsent,
        declineDynamicConsent,
        acceptDownloadConsent,
        saveConfig,
        cancelSageLoading,
        maybeStartModelInit,
        bump,
        sageModelInitDeclinedRef,
    };
}
