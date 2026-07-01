import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { Callout } from '../../../shared/ui/Callout.jsx';
import { fillSageAiConsentTokens } from '../../learning/api/ai-models.js';
import { isElectronDesktop } from '../../learning/api/electron-bridge.js';
import { ModalCenteredShell } from '../../../app/components/ModalShell.jsx';

const MODAL_WIN_X_SVG = (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        aria-hidden="true"
        className="w-[1.125rem] h-[1.125rem]"
    >
        <path d="M18 6 6 18M6 6l12 12" />
    </svg>
);

export function GamePlayerCloseButton({ ui, className = '', onClick }) {
    if (shouldShowMobileUI()) return null;
    return (
        <button
            type="button"
            className={`arborito-modal-window-x shrink-0 arborito-modal-window-x--inverse ${className}`.trim()}
            aria-label={ui.close || 'Close'}
            onClick={onClick}
        >
            {MODAL_WIN_X_SVG}
        </button>
    );
}

function MobToolbar({ ui, title, tone = 'default', onBack, onClose, showCloseX }) {
    const danger = tone === 'danger';
    return (
        <div
            className={`arborito-game-player-toolbar border-b ${danger ? 'border-red-900/40' : 'border-slate-700'} bg-slate-900 flex items-center gap-2 shrink-0`}
        >
            <button
                type="button"
                className={`arborito-icon-btn arborito-icon-btn--sm ${danger ? 'arborito-icon-btn--on-dark-danger' : 'arborito-icon-btn--on-dark'}`}
                aria-label={ui.navBack}
                onClick={onBack}
            >
                ←
            </button>
            <h3
                className={`${danger ? 'font-semibold text-xs text-slate-200' : 'font-black text-xs text-slate-100'} flex-1 min-w-0 truncate`}
            >
                {title}
            </h3>
            {showCloseX ? <GamePlayerCloseButton ui={ui} onClick={onClose} showOnMobile /> : null}
        </div>
    );
}

function darkShellProps(panelClass, tone, size = 'compact auto-h') {
    return {
        layout: 'centered',
        shellOpts: {
            scrim: 'black',
            enter: 'fade',
            z: 80,
            panelSize: size,
            panelTone: tone,
            panelClass: `${panelClass} relative`.trim(),
            rootFlags: 'arborito-modal--immersive arborito-modal-immersive--center arborito-game-immersive-scrim',
        },
    };
}

export function GamePlayerAiDownloadScreen({ ui, progressRaw, pct, onClose }) {
    const mob = shouldShowMobileUI();
    const headbar = mob ? (
        <MobToolbar ui={ui} title={ui.sageDownloading || 'Loading…'} onBack={onClose} />
    ) : null;

    return (
        <ModalCenteredShell
            {...darkShellProps(`text-center ${mob ? 'p-4' : 'p-6'}`, 'dark')}
            onBackdropClick={onClose}
        >
            {headbar}
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-green-500 to-emerald-600" />
            <div
                className="w-14 h-14 bg-slate-800 rounded-full mx-auto flex items-center justify-center text-3xl mb-4 border border-slate-700 shrink-0"
                aria-hidden="true"
            >
                🧠
            </div>
            <h2 className="text-lg font-black text-white mb-1">{ui.sageDownloadModel || 'Model'}</h2>
            <p className="js-game-ai-progress-text text-[11px] text-slate-400 mb-4 font-mono break-words px-1 min-h-[2.5rem]">
                {progressRaw || '…'}
            </p>
            <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden border border-slate-700 mb-2">
                <div
                    className="js-game-ai-progress-bar bg-green-500 h-full min-w-0 transition-[width] duration-200 ease-out"
                    style={{ width: `${pct}%` }}
                />
            </div>
        </ModalCenteredShell>
    );
}

export function GamePlayerConsentScreen({ ui, onGrant, onClose }) {
    const mob = shouldShowMobileUI();
    const headbar = mob ? (
        <MobToolbar ui={ui} title={ui.navBack} onBack={onClose} onClose={onClose} showCloseX />
    ) : null;

    return (
        <ModalCenteredShell
            {...darkShellProps(`text-center ${mob ? 'p-4 sm:p-8' : 'p-6 sm:p-8'} overflow-x-hidden overflow-y-auto`, 'dark')}
            onBackdropClick={onClose}
        >
            {headbar}
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-purple-600" />
            <div className="w-20 h-20 bg-slate-800 rounded-full mx-auto flex items-center justify-center text-5xl mb-6 shadow-xl border border-slate-700">
                🧠
            </div>
            <h2 className="text-xl font-black text-white mb-2 uppercase tracking-wide">{ui.gameAiRequiredTitle}</h2>
            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 mb-6 text-left">
                <Callout tone="blue" size="sm" layout="stack" extraClass="mb-3">
                    <p className="text-xs leading-relaxed font-medium m-0">
                        {fillSageAiConsentTokens(ui.gameConsentAiNotice || '', isElectronDesktop())}
                    </p>
                </Callout>
                {ui.sageAiThirdPartyLicenses ? (
                    <p className="text-[10px] text-slate-400 leading-snug mb-3">
                        {fillSageAiConsentTokens(ui.sageAiThirdPartyLicenses, isElectronDesktop())}
                    </p>
                ) : null}
                <Callout tone="amber" size="sm" icon="⚠️" layout="stack">
                    <p className="text-[10px] leading-snug m-0">
                        <span className="font-bold uppercase">{ui.gameDisclaimerLabel}</span>
                        <br />
                        <span>{ui.gameDisclaimer}</span>
                    </p>
                </Callout>
            </div>
            <div className="flex flex-col gap-3">
                <button
                    type="button"
                    id="btn-grant-consent"
                    className="w-full py-3.5 bg-white text-slate-900 font-black rounded-xl shadow-lg hover:bg-slate-200 active:scale-95 transition-all text-sm uppercase tracking-wider"
                    onClick={onGrant}
                >
                    {ui.sageGdprAccept}
                </button>
                {!mob ? (
                    <button
                        type="button"
                        className="text-xs text-slate-500 hover:text-slate-300 font-bold uppercase tracking-wider"
                        onClick={onClose}
                    >
                        {ui.cancel}
                    </button>
                ) : null}
            </div>
        </ModalCenteredShell>
    );
}

export function GamePlayerAiErrorScreen({ ui, aiError, onRetry, onClose }) {
    const mob = shouldShowMobileUI();
    const headbar = mob ? (
        <MobToolbar
            ui={ui}
            title={ui.gameAiErrorTitle}
            tone="danger"
            onBack={onClose}
            onClose={onClose}
            showCloseX
        />
    ) : null;

    return (
        <ModalCenteredShell
            {...darkShellProps(
                `text-center ${mob ? 'p-4 sm:p-8' : 'p-8'} overflow-x-hidden overflow-y-auto`,
                'danger-dark',
                'standard auto-h'
            )}
            onBackdropClick={onClose}
        >
            {headbar}
            <div className="absolute top-0 left-0 w-full h-1 bg-red-500" />
            <div
                className="w-16 h-16 bg-slate-800/80 rounded-full mx-auto flex items-center justify-center text-3xl mb-5 text-slate-400 shadow-inner border border-slate-700/80"
                aria-hidden="true"
            >
                ⚠️
            </div>
            <h2 className="text-lg font-semibold text-white mb-2 tracking-tight">{ui.gameAiErrorTitle}</h2>
            <p className="text-sm text-slate-300 mb-4 max-w-sm mx-auto leading-relaxed">{ui.gameAiErrorLead}</p>
            <p className="text-xs text-slate-500 mb-6 max-w-sm mx-auto leading-relaxed text-left bg-black/25 rounded-lg px-3 py-2 border border-slate-800/80">
                <span className="text-slate-400 font-medium">{ui.gameAiErrorDetailsLabel}</span>
                <span className="block mt-1 font-normal">{aiError}</span>
            </p>
            <div className="flex flex-col gap-3">
                <button
                    type="button"
                    className="w-full py-3.5 arborito-cta-red font-black rounded-xl shadow-lg active:scale-95 transition-all text-sm uppercase tracking-wider"
                    onClick={onRetry}
                >
                    {ui.sageRetryConnection}
                </button>
                {!mob ? (
                    <button
                        type="button"
                        className="text-xs text-slate-500 hover:text-slate-300 font-bold uppercase tracking-wider"
                        onClick={onClose}
                    >
                        {ui.cancel}
                    </button>
                ) : null}
            </div>
        </ModalCenteredShell>
    );
}

export function GamePlayerCrashScreen({ ui, error, onClose }) {
    const mob = shouldShowMobileUI();
    const headbar = mob ? (
        <MobToolbar
            ui={ui}
            title={ui.gameCrashedTitle}
            tone="danger"
            onBack={onClose}
            onClose={onClose}
            showCloseX
        />
    ) : null;

    return (
        <ModalCenteredShell
            {...darkShellProps(
                `text-center ${mob ? 'p-4 sm:p-8' : 'p-8'} overflow-x-hidden overflow-y-auto`,
                'danger-dark'
            )}
            onBackdropClick={onClose}
        >
            {headbar}
            <div className="text-4xl mb-3 opacity-90" aria-hidden="true">
                🎮
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">{ui.gameCrashedTitle}</h2>
            <p className="text-sm text-slate-300 mb-4 max-w-sm mx-auto leading-relaxed">{ui.gameCrashedLead}</p>
            <p className="text-xs text-slate-500 font-mono mb-6 bg-black/30 p-3 rounded break-all text-left border border-slate-800/80">
                <span className="block text-slate-400 font-sans mb-1">{ui.gameCrashDetailsLabel}</span>
                {error}
            </p>
            <button
                type="button"
                className="arborito-cta-red px-6 py-3 font-bold rounded-xl transition-colors w-full"
                onClick={onClose}
            >
                {ui.close}
            </button>
        </ModalCenteredShell>
    );
}

export function GamePlayerPlayHeader({ ui, title, aiMode, staticQuizLessonCount, onClose }) {
    const mob = shouldShowMobileUI();
    const staticPlayTip =
        aiMode === 'static' && staticQuizLessonCount > 0
            ? (ui.arcadeStaticPlayHint || 'Static mode: {n} lesson(s) with a complete questionnaire.').replace(
                  '{n}',
                  String(staticQuizLessonCount)
              )
            : ui.arcadeAiModeStaticDesc || '';
    const aiModeBadge =
        aiMode === 'dynamic' ? (
            <span
                className="arborito-pill arborito-pill--xs arborito-pill--solid-purple ml-2"
                title={ui.arcadeAiModeDynamicDesc || ''}
            >
                AI
            </span>
        ) : (
            <span
                className="arborito-pill arborito-pill--xs arborito-pill--solid-orange ml-2 cursor-help"
                title={staticPlayTip}
            >
                Static
            </span>
        );

    if (mob) {
        return (
            <header className="arborito-game-player-toolbar grid grid-cols-[auto_1fr] items-center gap-x-2 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] bg-slate-900 border-b border-slate-800 text-white shrink-0 shadow-md shadow-black/30">
                <button
                    id="btn-back"
                    type="button"
                    className="arborito-game-player-back flex items-center gap-1.5 text-slate-300 hover:text-white hover:bg-white/10 px-2.5 py-2 rounded-lg transition-colors text-sm font-bold shrink-0 min-h-[2.75rem]"
                    onClick={onClose}
                >
                    <span className="shrink-0 text-base leading-none">←</span>{' '}
                    <span className="truncate max-w-[28vw]">{ui.gameBackButton}</span>
                </button>
                <div className="min-w-0 flex items-center justify-center gap-1.5">
                    <h2 className="arborito-game-player-title m-0 text-center font-bold text-base leading-tight truncate max-w-full [text-shadow:0_1px_8px_rgb(0_0_0/_0.85)]">
                        {title || ui.gameDefaultTitle}
                        {aiModeBadge}
                    </h2>
                </div>
            </header>
        );
    }

    return (
        <header className="arborito-game-player-desk-head flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5 bg-slate-900 border-b border-slate-800 text-white shrink-0 shadow-md shadow-black/25">
            <h2 className="arborito-game-player-desk-title flex-1 min-w-0 m-0 font-bold text-sm sm:text-base tracking-tight truncate [text-shadow:0_1px_8px_rgb(0_0_0/_0.85)]">
                {title || ui.gameDefaultTitle}
                {aiModeBadge}
            </h2>
            <GamePlayerCloseButton ui={ui} className="btn-game-desktop-close" onClick={onClose} />
        </header>
    );
}
