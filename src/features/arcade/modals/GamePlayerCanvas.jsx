import { LoadingBrand } from '../../../shared/ui/Loading.jsx';

export function GamePlayerCanvas({
    iframeRef,
    loadingText,
    showIframe,
    frameVisible,
    showLoader,
    aiBusy = false,
    aiBusyLabel = '',
}) {
    return (
        <main className="flex-1 min-h-0 min-w-0 relative bg-black overflow-hidden flex flex-col">
            {showLoader ? (
                <div id="loader" className="absolute inset-0 z-0">
                    <div
                        className="flex flex-1 flex-col items-center justify-center gap-3 min-h-0 h-full"
                        role="status"
                        aria-live="polite"
                        aria-busy="true"
                    >
                        <LoadingBrand
                            label=""
                            size="boot"
                            tone="sage"
                            extraClass="arborito-loading-brand--compact"
                        />
                        {loadingText ? (
                            <span className="text-emerald-700 dark:text-emerald-300 text-sm font-medium">
                                {loadingText}
                            </span>
                        ) : null}
                    </div>
                </div>
            ) : null}
            <iframe
                ref={iframeRef}
                hidden={!showIframe}
                className={`arborito-game-player-frame relative z-10 w-full flex-1 min-h-0 border-none bg-white transition-opacity duration-500${frameVisible ? '' : ' opacity-0'}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; gamepad"
                allowFullScreen
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-pointer-lock allow-modals allow-popups-to-escape-sandbox"
                title=""
            />
            {aiBusy ? (
                <div
                    className="arborito-game-ai-busy absolute inset-0 z-20 flex flex-col items-center justify-end pb-[max(1.25rem,env(safe-area-inset-bottom))] px-4 pointer-events-auto"
                    role="status"
                    aria-live="polite"
                    aria-busy="true"
                >
                    <div className="arborito-game-ai-busy__scrim absolute inset-0" aria-hidden="true" />
                    <div className="arborito-game-ai-busy__panel relative flex flex-col items-center gap-2 max-w-sm w-full">
                        <LoadingBrand
                            label=""
                            size="md"
                            tone="sage"
                            extraClass="arborito-loading-brand--compact"
                        />
                        {aiBusyLabel ? (
                            <p className="arborito-game-ai-busy__label m-0 text-center text-sm font-semibold">
                                {aiBusyLabel}
                            </p>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </main>
    );
}
