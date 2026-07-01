import { useLearning } from '../hooks/useLearning.js';
import { AuthorInline } from './AuthorInline.jsx';

function alignClass(b) {
    if (b?.align === 'center') return ' text-center';
    if (b?.align === 'right') return ' text-right';
    if (b?.align === 'left') return ' text-left';
    return '';
}

function ExternalMediaPlaceholder({ b, ui }) {
    const kind = b.type === 'video' ? 'video' : b.type === 'audio' ? 'audio' : 'image';
    const label =
        kind === 'video'
            ? ui.mediaPlaceholderVideo || 'Video'
            : kind === 'audio'
              ? ui.mediaPlaceholderAudio || 'Audio'
              : ui.mediaPlaceholderImage || 'Image';
    return (
        <div className="arborito-media-blocked my-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-6 text-center">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                {ui.mediaBlockedTitle || 'External media'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{ui.mediaBlockedHint || ''}</p>
            <span className="inline-block text-2xl mb-2" aria-hidden="true">
                {kind === 'video' ? '▶' : kind === 'audio' ? '🎵' : '🖼'}
            </span>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">{label}</p>
            <button type="button" className="arborito-media-consent-retry arborito-cta-sky btn px-4 py-2 rounded-lg text-sm font-bold">
                {ui.mediaBlockedRetry || 'Load options'}
            </button>
        </div>
    );
}

/** Single parsed lesson prose block as JSX (student read mode). */
export function ContentBlock({ block, isMediaSrcBlocked, onGameLaunch }) {
    const { ui } = useLearning();
    const b = block;
    if (!b) return null;

    const al = alignClass(b);
    const blocked = typeof isMediaSrcBlocked === 'function' ? isMediaSrcBlocked(b.src) : false;

    switch (b.type) {
        case 'h1':
        case 'section':
            return (
                <h1
                    id={b.id}
                    className={`text-3xl md:text-5xl font-black text-slate-900 dark:text-white mb-6 md:mb-8 pb-4 border-b border-slate-200 dark:border-slate-800 tracking-tight${al}`}
                >
                    <AuthorInline text={b.text} />
                </h1>
            );
        case 'h2':
        case 'subsection':
            return (
                <h2
                    id={b.id}
                    className={`text-2xl md:text-3xl font-bold text-slate-800 dark:text-sky-100 mt-10 md:mt-12 mb-6 group flex items-center gap-3${al}`}
                >
                    <AuthorInline text={b.text} />
                </h2>
            );
        case 'h3':
            return (
                <h3
                    id={b.id}
                    className={`text-xl font-bold text-slate-700 dark:text-slate-200 mt-8 mb-4 flex items-center gap-2${al}`}
                >
                    <span className="w-2 h-2 bg-sky-500 rounded-full" />
                    <span>
                        <AuthorInline text={b.text} />
                    </span>
                </h3>
            );
        case 'h4':
            return (
                <h4
                    id={b.id}
                    className={`text-lg font-bold text-slate-700 dark:text-slate-300 mt-6 mb-3 pl-2 border-l-2 border-sky-400/70${al}`}
                >
                    <AuthorInline text={b.text} />
                </h4>
            );
        case 'h5':
            return (
                <h5
                    id={b.id}
                    className={`text-base font-bold text-slate-600 dark:text-slate-400 mt-5 mb-2 pl-2 border-l border-slate-300 dark:border-slate-600${al}`}
                >
                    <AuthorInline text={b.text} />
                </h5>
            );
        case 'h6':
            return (
                <h6
                    id={b.id}
                    className={`text-sm font-bold text-slate-600 dark:text-slate-500 mt-4 mb-2 pl-2${al}`}
                >
                    <AuthorInline text={b.text} />
                </h6>
            );
        case 'p':
            return (
                <p className={`mb-6 text-slate-600 dark:text-slate-300 leading-8 text-base md:text-lg${al}`}>
                    <AuthorInline text={b.text} />
                </p>
            );
        case 'blockquote':
            return (
                <blockquote className="bg-yellow-50 dark:bg-yellow-900/10 border-l-4 border-yellow-400 p-6 my-8 rounded-r-xl italic text-slate-700 dark:text-yellow-100/80">
                    &ldquo;
                    <AuthorInline text={b.text} />
                    &rdquo;
                </blockquote>
            );
        case 'code':
            return (
                <div className="my-6 rounded-2xl bg-[#1e1e1e] border border-slate-700 overflow-hidden shadow-xl text-sm group not-prose">
                    <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] border-b border-black/20">
                        <div className="flex gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-red-500/20" />
                            <div className="w-3 h-3 rounded-full bg-yellow-500/20" />
                            <div className="w-3 h-3 rounded-full bg-green-500/20" />
                        </div>
                        <span className="text-xs text-slate-500 font-mono uppercase">
                            {ui.codeTerminalLabel || 'Terminal'}
                        </span>
                    </div>
                    <pre className="p-6 overflow-x-auto text-slate-300 font-mono leading-relaxed bg-[#1e1e1e] m-0">
                        {b.text}
                    </pre>
                </div>
            );
        case 'image':
            if (blocked) return <ExternalMediaPlaceholder b={b} ui={ui} />;
            return (
                <figure className="my-10">
                    <img src={b.src} className="rounded-xl shadow-lg w-full h-auto" loading="lazy" alt="" />
                    {b.caption ? (
                        <figcaption className="text-center text-sm text-slate-500 mt-2">
                            <AuthorInline text={b.caption} />
                        </figcaption>
                    ) : null}
                </figure>
            );
        case 'video':
            if (blocked) return <ExternalMediaPlaceholder b={b} ui={ui} />;
            return (
                <div className="my-10">
                    <div className="relative w-full pb-[56.25%] h-0 rounded-xl overflow-hidden shadow-lg bg-black">
                        <iframe
                            src={b.src}
                            className="absolute top-0 left-0 w-full h-full"
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            title=""
                        />
                    </div>
                </div>
            );
        case 'audio':
            if (blocked) return <ExternalMediaPlaceholder b={b} ui={ui} />;
            return (
                <div className="my-6 p-4 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center gap-4 shadow-sm">
                    <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-300 rounded-full flex items-center justify-center text-xl">
                        🎵
                    </div>
                    <audio controls className="w-full" src={b.src} />
                </div>
            );
        case 'game': {
            const title = (b.label || ui.gameRecommendedTitle || ui.mobileArcadeCta || ui.navArcade || 'Arcade').trim();
            const prefix = (ui.gameCtaPrefix || ui.gameActivityDefaultLabel || 'Interactive activity').trim();
            const url = (b.url || '').trim();
            const topics = Array.isArray(b.topics) ? b.topics.filter(Boolean) : [];
            return (
                <div className="not-prose my-10 rounded-3xl border border-orange-200/60 dark:border-orange-900/35 bg-gradient-to-br from-orange-50 to-white dark:from-slate-900 dark:to-slate-900/60 p-6 shadow-xl overflow-hidden relative">
                    <div className="absolute -top-10 -right-10 text-[160px] opacity-[0.08] select-none" aria-hidden="true">
                        🎮
                    </div>
                    <div className="relative z-10 flex flex-col gap-4">
                        <div className="flex items-start gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-orange-100 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/40 flex items-center justify-center text-2xl shrink-0" aria-hidden="true">
                                🎮
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center flex-wrap">
                                    <h3 className="m-0 text-lg font-black text-slate-900 dark:text-white tracking-tight">
                                        {prefix}: {title}
                                    </h3>
                                    {b.optional ? (
                                        <span className="arborito-pill arborito-pill--chip arborito-pill--slate arborito-pill--bordered ml-2">
                                            {ui.tagOptional || 'Optional'}
                                        </span>
                                    ) : null}
                                </div>
                                <p className="m-0 mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                    {ui.gameRecommendedHint ||
                                        ui.gameRecommendedHintFallback ||
                                        'Recommended interactive practice for this topic.'}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                            <button
                                type="button"
                                className={`btn-game-launch px-5 py-3 rounded-xl font-black uppercase tracking-wider text-sm bg-slate-900 text-white hover:opacity-90 active:scale-[0.99] transition ${!url ? 'opacity-50 cursor-not-allowed' : ''}`}
                                disabled={!url}
                                aria-disabled={!url || undefined}
                                onClick={() => url && onGameLaunch?.(url, title, topics)}
                            >
                                {ui.gamePlayNow || ui.arcadePlay || 'Play'}
                            </button>
                            {url ? (
                                <div className="flex flex-col gap-1">
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono break-all select-text">
                                        cartridge: <span className="opacity-80">{url}</span>
                                    </div>
                                    {topics.length > 0 ? (
                                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono break-all select-text">
                                            topics: <span className="opacity-80">{topics.join(', ')}</span>
                                        </div>
                                    ) : null}
                                </div>
                            ) : (
                                <div className="text-[11px] text-red-600 dark:text-red-300 font-bold">
                                    {ui.gameMissingUrl || 'Missing game URL'}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            );
        }
        case 'list':
            return (
                <ul className={`space-y-2 my-6 pl-4${al}`}>
                    {b.items.map((item, i) => (
                        <li
                            key={i}
                            className="flex items-start gap-3 text-slate-700 dark:text-slate-300 leading-relaxed"
                        >
                            <span className="mt-2 w-1.5 h-1.5 bg-sky-500 rounded-full flex-shrink-0" />
                            <span>
                                <AuthorInline text={item} />
                            </span>
                        </li>
                    ))}
                </ul>
            );
        default:
            return null;
    }
}
