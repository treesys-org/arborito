import { LoadingBrand } from '../../../shared/ui/Loading.jsx';

export function GamePlayerCanvas({
    iframeRef,
    loadingText,
    showIframe,
    frameVisible,
    showLoader,
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
        </main>
    );
}
