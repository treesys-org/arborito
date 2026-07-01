import { useCallback, useEffect, useRef } from 'react';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { ensureSageGuideStyles } from '../../../shared/lib/lazy-stylesheet.js';
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
import { SAGE_OPEN } from '../api/modals/logic/sage-ui-helpers.js';
import { writeExpertConfig } from '../api/ai-expert-config.js';

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

    if (!isVisible) {
        return <arborito-sage data-arborito-panel="sage" />;
    }

    const mob = shouldShowMobileUI();
    const isAi = sageAiMode === 'dynamic';
    const settingsOpen = mode === 'settings';
    const deskScrim = screen === 'web-gate' || (settingsOpen && !mob);
    const hostClass = sageHostClassName({
        mob: mob && !deskScrim,
        construction: constructionMode,
        lessonOverlay: sageLessonContext && mob,
        deskScrim,
    });

    let content = null;
    if (screen === 'web-gate') {
        content = (
            <SageWebAiGate
                ui={ui}
                sageEnterAnim={sageEnterAnim}
                onExpertSetup={() => {
                    writeExpertConfig({ enabled: true });
                    openSettings();
                }}
                onStayGuide={() => switchSageAiMode('guide')}
                onClose={close}
            />
        );
    } else if (screen === 'dynamic-consent') {
        content = (
            <SageDynamicConsent
                ui={ui}
                sageEnterAnim={sageEnterAnim}
                constructionMode={constructionMode}
                isAi={isAi}
                onSwitchMode={switchSageAiMode}
                onAccept={acceptDynamicConsent}
                onDecline={declineDynamicConsent}
                onClose={declineDynamicConsent}
            />
        );
    } else if (screen === 'download-consent') {
        content = (
            <SageDownloadConsent
                ui={ui}
                sageEnterAnim={sageEnterAnim}
                constructionMode={constructionMode}
                isAi={isAi}
                onSwitchMode={switchSageAiMode}
                onAccept={acceptDownloadConsent}
                onDecline={() => switchSageAiMode('guide')}
            />
        );
    } else if (screen === 'loading') {
        content = (
            <SageLoadingScreen
                ui={ui}
                progress={ai.progress}
                onCancel={cancelSageLoading}
                onClose={close}
            />
        );
    } else if (screen === 'chat') {
        content = (
            <SageChat
                ui={ui}
                ai={ai}
                sageEnterAnim={sageEnterAnim}
                constructionMode={constructionMode}
                isAi={isAi}
                onSwitchMode={switchSageAiMode}
                onClose={close}
                onOpenSettings={openSettings}
                voice={voice}
                inputRef={inputRef}
                onCancelLoad={cancelSageLoading}
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
            />
        );
    }

    const settingsOverlay = settingsOpen ? (
        <SageSettings
            ui={ui}
            ai={ai}
            sageEnterAnim={sageEnterAnim}
            onExit={exitSettings}
            onSave={saveConfig}
            voice={voice}
        />
    ) : null;

    return (
        <arborito-sage data-arborito-panel="sage" className={hostClass || SAGE_OPEN}>
            {content}
            {settingsOverlay}
        </arborito-sage>
    );
}

export { SageOverlay as Sage };
