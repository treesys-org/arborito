import { useGamePlayerModal } from '../hooks/useGamePlayerModal.js';
import { ModalShell } from '../../../app/components/ModalShell.jsx';
import {
    GamePlayerAiDownloadScreen,
    GamePlayerAiErrorScreen,
    GamePlayerConsentScreen,
    GamePlayerCrashScreen,
    GamePlayerPlayHeader,
} from './GamePlayerChrome.jsx';
import { GamePlayerCanvas } from './GamePlayerCanvas.jsx';

export function ModalGamePlayer({ embed }) {
    const g = useGamePlayerModal(embed);

    if (!g.url) {
        return null;
    }

    if (g.aiBrowserLoading) {
        const m = String(g.aiProgress).match(/(\d+)%/);
        const pct = m ? Math.min(100, parseInt(m[1], 10)) : 0;
        return (
            <div data-arborito-panel="modal-game-player" data-embed={embed ? '1' : undefined}>
                <GamePlayerAiDownloadScreen
                    ui={g.ui}
                    progressRaw={g.aiProgress}
                    pct={pct}
                    onClose={g.close}
                />
            </div>
        );
    }

    if (g.needsConsent) {
        return (
            <div data-arborito-panel="modal-game-player" data-embed={embed ? '1' : undefined}>
                <GamePlayerConsentScreen
                    ui={g.ui}
                    onGrant={() => void g.afterGrantConsent()}
                    onClose={g.close}
                />
            </div>
        );
    }

    if (g.aiError) {
        return (
            <div data-arborito-panel="modal-game-player" data-embed={embed ? '1' : undefined}>
                <GamePlayerAiErrorScreen
                    ui={g.ui}
                    aiError={g.aiError}
                    onRetry={() => void g.initializeSession()}
                    onClose={g.close}
                />
            </div>
        );
    }

    if (g.error) {
        return (
            <div data-arborito-panel="modal-game-player" data-embed={embed ? '1' : undefined}>
                <GamePlayerCrashScreen ui={g.ui} error={g.error} onClose={g.close} />
            </div>
        );
    }

    const loadingText = g.getLoadingText();

    return (
        <div data-arborito-panel="modal-game-player" data-embed={embed ? '1' : undefined}>
            <ModalShell
                layout="immersive"
                mobile={g.mob}
                scrim={g.mob ? 'black' : 'opaque'}
                bareBackdrop
                z={80}
                shellOpts={{
                    enter: 'fade',
                    rootFlags: 'arborito-game-player--desktop-widescreen',
                }}
            >
                <div className="arborito-float-modal-card relative overflow-hidden flex flex-col cursor-auto w-full h-full rounded-none flex-1 min-h-0">
                    <GamePlayerPlayHeader
                        ui={g.ui}
                        title={g.title}
                        aiMode={g.aiModeRef.current}
                        staticQuizLessonCount={g.staticQuizLessonCount}
                        onClose={g.close}
                    />
                    <GamePlayerCanvas
                        iframeRef={g.iframeRef}
                        loadingText={loadingText}
                        showIframe={g.showIframe && !g.checkingAI}
                        frameVisible={g.frameVisible}
                        showLoader={g.isPreparing || g.checkingAI || !g.frameVisible}
                    />
                </div>
            </ModalShell>
        </div>
    );
}
