import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { DockHubSheet } from '../../../shared/ui/DockHubSheet.jsx';
import { DockHubShell } from '../../../app/components/DockHubShell.jsx';
import { DockModalShell } from '../../../app/components/ModalShell.jsx';
import { useDockSheetHost } from '../../../shared/ui/useDockSheetHost.js';
import { useSageState } from './hooks/useSageState.jsx';
import { useSageVoice } from './hooks/useSageVoice.jsx';
import { SageGuide } from './SageGuide.jsx';
import { SageChat } from './SageChat.jsx';
import { SageSettings } from './SageSettings.jsx';
import {
    SageDynamicConsent,
    SageWebAiGate,
    SageDownloadConsent,
    SageLoadingScreen,
    sageHostClassName,
} from './SageScreens.jsx';
import { SageOutsideDismiss } from './components/SageLayout.jsx';
import { SAGE_OPEN } from '../api/modals/logic/sage-ui-helpers.js';
import { ensureSageGuideStyles } from '../../../shared/lib/lazy-stylesheet.js';

ensureSageGuideStyles();

export function SageOverlay() {
    const sage = useSageState();
    const inputRef = useRef(null);
    const bump = sage.bump;
    const onRerender = useCallback(() => bump(), [bump]);
    const voice = useSageVoice({ mode: sage.mode, onRerender, inputRef });

    const {
        ui,
        isVisible,
        mode,
        screen,
        guideNav,
        setGuideNav,
        sageLessonContext,
        sageDockUi,
        sageEnterAnim,
        sageAiMode,
        ai,
        constructionMode,
        close,
        openSettings,
        exitSettings,
        switchSageAiMode,
        acceptDynamicConsent,
        declineDynamicConsent,
        acceptDownloadConsent,
        saveConfig,
        cancelSageLoading,
    } = sage;

    useEffect(() => {
        if (screen === 'chat' && ai.status === 'loading') {
            voice.patchLoadProgress(ai.progress);
        }
    }, [screen, ai.status, ai.progress, voice]);

    const handleOutsideDismiss = useCallback(() => {
        if (screen === 'dynamic-consent') declineDynamicConsent();
        else if (screen === 'download-consent') switchSageAiMode('guide');
        else close();
    }, [screen, close, declineDynamicConsent, switchSageAiMode]);

    const mob = shouldShowMobileUI();
    const isAi = sageAiMode === 'dynamic';
    const settingsOpen = mode === 'settings';
    const deskScrim = settingsOpen && !mob;
    const lessonOverlay = sageLessonContext && mob && !sageDockUi;
    const dockSheet =
        isVisible && mob && sageDockUi && !lessonOverlay && !deskScrim && !settingsOpen;
    const dockHost = useDockSheetHost(dockSheet, constructionMode);

    const hostClass = sageHostClassName({
        mob: mob && !deskScrim && !dockSheet && !lessonOverlay,
        deskScrim,
    });

    if (!isVisible) {
        return <arborito-sage data-arborito-panel="sage" />;
    }

    const sageEmbedded = !!(mob && (lessonOverlay || dockSheet));

    let content = null;
    if (screen === 'web-gate') {
        content = (
            <SageWebAiGate
                ui={ui}
                sageEnterAnim={sageEnterAnim}
                isAi={isAi}
                onSwitchMode={switchSageAiMode}
                onExpertSetup={openSettings}
                onStayGuide={() => switchSageAiMode('guide')}
                embedded={sageEmbedded}
            />
        );
    } else if (screen === 'dynamic-consent') {
        content = (
            <SageDynamicConsent
                ui={ui}
                sageEnterAnim={sageEnterAnim}
                isAi={isAi}
                onSwitchMode={switchSageAiMode}
                onAccept={acceptDynamicConsent}
                onDecline={declineDynamicConsent}
                embedded={sageEmbedded}
            />
        );
    } else if (screen === 'download-consent') {
        content = (
            <SageDownloadConsent
                ui={ui}
                sageEnterAnim={sageEnterAnim}
                isAi={isAi}
                onSwitchMode={switchSageAiMode}
                onAccept={acceptDownloadConsent}
                onDecline={() => switchSageAiMode('guide')}
                embedded={sageEmbedded}
            />
        );
    } else if (screen === 'loading') {
        content = (
            <SageLoadingScreen
                ui={ui}
                progress={ai.progress}
                onCancel={cancelSageLoading}
                onClose={close}
                embedded={sageEmbedded}
            />
        );
    } else if (screen === 'chat') {
        content = (
            <SageChat
                ui={ui}
                ai={ai}
                sageEnterAnim={sageEnterAnim}
                isAi={isAi}
                constructionMode={constructionMode}
                sageLessonContext={sageLessonContext}
                onSwitchMode={switchSageAiMode}
                onClose={close}
                onOpenSettings={openSettings}
                voice={voice}
                inputRef={inputRef}
                onCancelLoad={cancelSageLoading}
                embedded={sageEmbedded}
            />
        );
    } else if (screen === 'guide') {
        content = (
            <SageGuide
                ui={ui}
                guideNav={guideNav}
                setGuideNav={setGuideNav}
                sageLessonContext={sageLessonContext}
                constructionMode={constructionMode}
                sageEnterAnim={sageEnterAnim}
                isAi={isAi}
                onSwitchMode={switchSageAiMode}
                onClose={close}
                embedded={sageEmbedded}
            />
        );
    }

    const settingsOverlay = settingsOpen ? (
        <SageSettings
            ui={ui}
            ai={ai}
            onExit={exitSettings}
            onSave={saveConfig}
            voice={voice}
        />
    ) : null;

    const dockSheetNode =
        dockSheet && dockHost ? (
            <DockHubSheet
                backdropId="sage-dock-backdrop"
                sheetId="sage-dock-sheet"
                ariaLabel={ui.sageTitle || 'Sage'}
                onBackdropClose={close}
            >
                <DockHubShell mobile skipBodyWrap rootClass="arborito-sage-dock-inner">
                    {content}
                </DockHubShell>
            </DockHubSheet>
        ) : null;

    if (dockSheetNode && dockHost) {
        return (
            <>
                <arborito-sage data-arborito-panel="sage" className="arborito-sage-dock-hub" />
                {createPortal(dockSheetNode, dockHost)}
                {settingsOverlay}
            </>
        );
    }

    const lessonSheetNode =
        lessonOverlay && content && !settingsOpen ? (
            <DockModalShell
                mobile
                skipBodyWrap
                shellOpts={{
                    rootFlags: 'arborito-modal--sage-lesson',
                    backdropId: 'sage-lesson-backdrop',
                    z: 235,
                    bareBackdrop: true,
                }}
                onBackdropClick={close}
            >
                <DockHubShell mobile skipBodyWrap rootClass="arborito-sage-dock-inner">
                    {content}
                </DockHubShell>
            </DockModalShell>
        ) : null;

    if (lessonSheetNode) {
        return (
            <>
                <arborito-sage data-arborito-panel="sage" />
                {createPortal(lessonSheetNode, document.body)}
                {settingsOverlay}
            </>
        );
    }

    return (
        <arborito-sage data-arborito-panel="sage" className={hostClass || SAGE_OPEN}>
            {!mob && !deskScrim ? <SageOutsideDismiss onDismiss={handleOutsideDismiss} /> : null}
            {!settingsOpen ? content : null}
            {settingsOverlay}
        </arborito-sage>
    );
}

export { SageOverlay as Sage };
