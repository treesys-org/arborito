import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';

/** React loading veil for the mobile graph trunk (replaces engine innerHTML). */
export function GraphLoadingOverlay({ state }) {
    if (!state?.visible) return null;

    const toneMod = state.constructionTone ? ' arborito-mobile-graph-loading-overlay--construct' : '';
    const label = state.message || 'Loading…';
    const tone = state.constructionTone ? 'text-slate-600 dark:text-slate-300' : 'text-emerald-800 dark:text-emerald-200';

    return (
        <div
            className={`flex flex-col items-center justify-center text-center text-sm font-semibold gap-3${toneMod}`}
            aria-live="polite"
        >
            <ChromeEmoji emoji="🌲" size={48} className="arborito-emoji-glyph animate-pulse" />
            <p className={`m-0 ${tone}`}>{label}</p>
        </div>
    );
}
