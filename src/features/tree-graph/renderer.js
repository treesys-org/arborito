
import { BLOCKS } from '../editor/editor-engine.js';
import { escAttr } from '../../shared/lib/html-escape.js';

/* Strict superset of `escHtml` (also escapes `'`) — safe for both inline
 * content and single-quoted attribute values used in the rendered HTML. */
const escHtml = escAttr;

function escInlineHtml(s) {
    // `parseContent` emits a very small trusted subset (<strong>, <em>, <br>, <code class="...">).
    // Everything else should be treated as text.
    const raw = String(s != null ? s : '');
    const placeholders = [];
    const token = (i) => `__ARB_TOK_${i}__`;

    // Preserve <br>
    let t = raw.replace(/<br\s*\/?>/gi, () => {
        const i = placeholders.push('<br>') - 1;
        return token(i);
    });

    // Preserve <strong> / </strong>, <em> / </em>
    t = t.replace(/<\/?(strong|em)>/gi, (m) => {
        const i = placeholders.push(m.toLowerCase()) - 1;
        return token(i);
    });

    // Preserve code spans with the exact class string we generate in parser.js
    t = t.replace(
        /<code class="bg-slate-200 dark:bg-slate-700 px-1 rounded font-mono text-sm text-pink-600 dark:text-pink-400">([\s\S]*?)<\/code>/gi,
        (_m, inner) => {
            const safeInner = escHtml(inner);
            const i = placeholders.push(
                `<code class="bg-slate-200 dark:bg-slate-700 px-1 rounded font-mono text-sm text-pink-600 dark:text-pink-400">${safeInner}</code>`
            ) - 1;
            return token(i);
        }
    );

    // Escape the rest (kills any other tags).
    t = escHtml(t);

    // Restore placeholders (safe tags only).
    for (let i = 0; i < placeholders.length; i++) {
        t = t.replaceAll(escHtml(token(i)), placeholders[i]);
    }
    return t;
}

function renderExternalMediaPlaceholder(b, ui) {
    const kind = b.type === 'video' ? 'video' : b.type === 'audio' ? 'audio' : 'image';
    const label =
        kind === 'video'
            ? ui.mediaPlaceholderVideo || 'Video'
            : kind === 'audio'
              ? ui.mediaPlaceholderAudio || 'Audio'
              : ui.mediaPlaceholderImage || 'Image';
    return `
        <div class="arborito-media-blocked my-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-6 text-center">
            <p class="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">${escHtml(ui.mediaBlockedTitle || 'External media')}</p>
            <p class="text-xs text-slate-500 dark:text-slate-400 mb-4">${escHtml(ui.mediaBlockedHint || '')}</p>
            <span class="inline-block text-2xl mb-2" aria-hidden="true">${kind === 'video' ? '▶' : kind === 'audio' ? '🎵' : '🖼'}</span>
            <p class="text-xs text-slate-400 dark:text-slate-500 mb-4">${escHtml(label)}</p>
            <button type="button" class="arborito-media-consent-retry arborito-cta-sky btn px-4 py-2 rounded-lg text-sm font-bold">
                ${escHtml(ui.mediaBlockedRetry || 'Load options')}
            </button>
        </div>`;
}

import { renderQuizV2Challenge } from '../learning/quiz-v2-player.js';

export const ContentRenderer = {
    renderQuizV2SessionSummary(quizzes, ui, context) {
        const { getQuizState, isExam } = context;
        const ids = quizzes.map((q) => q.id || 'quiz-v2');
        const correct = ids.filter((id) => !!getQuizState(id).v2Correct).length;
        const total = ids.length;
        const rate = total > 0 ? correct / total : 0;
        const didPass = isExam ? rate >= 0.8 : correct === total;
        const icon = didPass ? '🏆' : '📋';
        const title = didPass
            ? ui.quizCorrect || 'Well done!'
            : ui.quizCompleted || 'Session complete';
        const scoreLine = (ui.lessonQuizSessionScore || 'Score: {correct} / {total}')
            .replace('{correct}', String(correct))
            .replace('{total}', String(total));
        const certBtn =
            isExam && didPass
                ? `<button type="button" id="btn-view-certificate" class="arborito-cta-green mt-4 w-full md:w-auto px-6 py-4 font-bold rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2 mx-auto">
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        ${escHtml(ui.viewCert || 'View certificate')}
                   </button>`
                : '';
        const strip = ids
            .map((id) => {
                const ok = !!getQuizState(id).v2Correct;
                return `<div class="h-2 flex-1 min-w-[6px] max-w-10 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}"></div>`;
            })
            .join('');
        return `
        <div class="not-prose my-8 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 p-6 md:p-8 text-center">
            <div class="text-4xl mb-3" aria-hidden="true">${icon}</div>
            <h3 class="text-xl font-black text-slate-800 dark:text-white mb-2">${escHtml(title)}</h3>
            <div class="flex gap-1 mb-4 justify-center max-w-md mx-auto" role="presentation">${strip}</div>
            <p class="text-slate-600 dark:text-slate-300 font-bold mb-2">${escHtml(scoreLine)}</p>
            ${isExam && didPass ? `<p class="text-green-600 dark:text-green-400 font-bold text-sm mb-2">${escHtml(ui.branchMastered || ui.congrats || '')}</p>` : ''}
            ${certBtn}
        </div>`;
    },

    renderQuizV2Session(quizzes, ui, context) {
        const session = context.quizSession;
        if (session?.finished) {
            return ContentRenderer.renderQuizV2SessionSummary(quizzes, ui, context);
        }
        const activeId =
            (typeof context.getActiveSessionQuizId === 'function' && context.getActiveSessionQuizId()) ||
            (quizzes[0] && (quizzes[0].id || 'quiz-v2'));
        const current = quizzes.find((q) => (q.id || 'quiz-v2') === activeId) || quizzes[0];
        if (!current) return '';
        const idx = session ? session.currentIndex : 0;
        const total = quizzes.length;
        const progressLabel = (ui.lessonQuizSessionProgress || 'Question {current} of {total}')
            .replace('{current}', String(idx + 1))
            .replace('{total}', String(total));
        const pct = total > 0 ? Math.round(((idx + (session?.awaitingAdvance ? 1 : 0)) / total) * 100) : 0;
        const progressBar = `
            <div class="mb-6 not-prose">
                <div class="arborito-eyebrow flex justify-between mb-2">
                    <span>${escHtml(ui.lessonQuizV2Label || 'Evaluation')}</span>
                    <span>${escHtml(progressLabel)}</span>
                </div>
                <div class="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div class="h-full rounded-full bg-indigo-500 transition-all duration-300" style="width:${pct}%"></div>
                </div>
            </div>`;
        return `${progressBar}${renderQuizV2Challenge(current, ui, context.getQuizState(activeId), context)}`;
    },

    renderQuizV2Interactive(b, ui, state, context = {}) {
        return renderQuizV2Challenge(b, ui, state, context);
    },

    renderBlock(b, ui, context) {
        const { getQuizState, isCompleted, isMediaSrcBlocked: blockedFn } = context;
        const srcBlocked = typeof blockedFn === 'function' ? blockedFn : () => false;
        const alignClass =
            b && b.align === 'center'
                ? ' text-center'
                : b && b.align === 'right'
                  ? ' text-right'
                  : b && b.align === 'left'
                    ? ' text-left'
                    : '';

        // Standard Headers
        if (b.type === 'h1') return `<h1 id="${escAttr(b.id)}" class="text-3xl md:text-5xl font-black text-slate-900 dark:text-white mb-6 md:mb-8 pb-4 border-b border-slate-200 dark:border-slate-800 tracking-tight${alignClass}">${escHtml(b.text)}</h1>`;
        if (b.type === 'h2') return `<h2 id="${escAttr(b.id)}" class="text-2xl md:text-3xl font-bold text-slate-800 dark:text-sky-100 mt-10 md:mt-12 mb-6 group flex items-center gap-3${alignClass}">${escHtml(b.text)}</h2>`;
        if (b.type === 'h3') return `<h3 id="${escAttr(b.id)}" class="text-xl font-bold text-slate-700 dark:text-slate-200 mt-8 mb-4 flex items-center gap-2${alignClass}"><span class="w-2 h-2 bg-sky-500 rounded-full"></span><span>${escHtml(b.text)}</span></h3>`;
        if (b.type === 'h4') {
            return `<h4 id="${escAttr(b.id)}" class="text-lg font-bold text-slate-700 dark:text-slate-300 mt-6 mb-3 pl-2 border-l-2 border-sky-400/70${alignClass}">${escHtml(b.text)}</h4>`;
        }
        if (b.type === 'h5') {
            return `<h5 id="${escAttr(b.id)}" class="text-base font-bold text-slate-600 dark:text-slate-400 mt-5 mb-2 pl-2 border-l border-slate-300 dark:border-slate-600${alignClass}">${escHtml(b.text)}</h5>`;
        }
        if (b.type === 'h6') {
            return `<h6 id="${escAttr(b.id)}" class="text-sm font-bold text-slate-600 dark:text-slate-500 mt-4 mb-2 pl-2${alignClass}">${escHtml(b.text)}</h6>`;
        }

        // Arborito semantic headers (@section / @subsection)
        // Treated visually as H1 and H2
        if (b.type === 'section') return `<h1 id="${escAttr(b.id)}" class="text-3xl md:text-5xl font-black text-slate-900 dark:text-white mb-6 md:mb-8 pb-4 border-b border-slate-200 dark:border-slate-800 tracking-tight${alignClass}">${escHtml(b.text)}</h1>`;
        if (b.type === 'subsection') return `<h2 id="${escAttr(b.id)}" class="text-2xl md:text-3xl font-bold text-slate-800 dark:text-sky-100 mt-10 md:mt-12 mb-6 group flex items-center gap-3${alignClass}">${escHtml(b.text)}</h2>`;

        if (b.type === 'p') return `<p class="mb-6 text-slate-600 dark:text-slate-300 leading-8 text-base md:text-lg${alignClass}">${escInlineHtml(b.text)}</p>`;
        
        if (b.type === 'blockquote') return `<blockquote class="bg-yellow-50 dark:bg-yellow-900/10 border-l-4 border-yellow-400 p-6 my-8 rounded-r-xl italic text-slate-700 dark:text-yellow-100/80">"${escInlineHtml(b.text)}"</blockquote>`;

        if (b.type === 'code') return `
            <div class="my-6 rounded-2xl bg-[#1e1e1e] border border-slate-700 overflow-hidden shadow-xl text-sm group not-prose">
                <div class="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] border-b border-black/20">
                    <div class="flex gap-1.5"><div class="w-3 h-3 rounded-full bg-red-500/20"></div><div class="w-3 h-3 rounded-full bg-yellow-500/20"></div><div class="w-3 h-3 rounded-full bg-green-500/20"></div></div>
                    <span class="text-xs text-slate-500 font-mono uppercase">${escHtml(ui.codeTerminalLabel || 'Terminal')}</span>
                </div><pre class="p-6 overflow-x-auto text-slate-300 font-mono leading-relaxed bg-[#1e1e1e] m-0">${escHtml(b.text)}</pre>
            </div>
        `;

        if (b.type === 'image') {
            if (srcBlocked(b.src)) {
                return renderExternalMediaPlaceholder(b, ui);
            }
            return `
            <figure class="my-10">
                <img src="${escAttr(b.src)}" class="rounded-xl shadow-lg w-full h-auto" loading="lazy">
                ${b.caption ? `<figcaption class="text-center text-sm text-slate-500 mt-2">${escInlineHtml(b.caption)}</figcaption>` : ''}
            </figure>`;
        }

        if (b.type === 'video') {
            if (srcBlocked(b.src)) {
                return renderExternalMediaPlaceholder(b, ui);
            }
            return `
            <div class="my-10">
                <div class="relative w-full pb-[56.25%] h-0 rounded-xl overflow-hidden shadow-lg bg-black">
                    <iframe src="${escAttr(b.src)}" class="absolute top-0 left-0 w-full h-full" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                </div>
            </div>`;
        }

        if (b.type === 'audio') {
            if (srcBlocked(b.src)) {
                return renderExternalMediaPlaceholder(b, ui);
            }
            return `
            <div class="my-6 p-4 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center gap-4 shadow-sm">
                <div class="w-10 h-10 bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-300 rounded-full flex items-center justify-center text-xl">🎵</div>
                <audio controls class="w-full" src="${escAttr(b.src)}"></audio>
            </div>`;
        }

        if (b.type === 'game') {
            const title = (b.label || ui.gameRecommendedTitle || ui.mobileArcadeCta || ui.navArcade || 'Arcade').trim();
            const prefix = (ui.gameCtaPrefix || ui.gameActivityDefaultLabel || 'Interactive activity').trim();
            const optPill = b.optional
                ? `<span class="arborito-pill arborito-pill--chip arborito-pill--slate arborito-pill--bordered ml-2">${ui.tagOptional || 'Optional'}</span>`
                : '';
            const url = (b.url || '').trim();
            const disabled = !url ? 'disabled aria-disabled="true"' : '';
            const btnLabel = ui.gamePlayNow || ui.arcadePlay || 'Play';
            const hint =
                ui.gameRecommendedHint ||
                ui.gameRecommendedHintFallback ||
                'Recommended interactive practice for this topic.';
            const topics = Array.isArray(b.topics) ? b.topics.filter(Boolean) : [];
            const topicsLabel =
                topics.length > 0
                    ? `<div class="text-[11px] text-slate-500 dark:text-slate-400 font-mono break-all select-text">topics: <span class="opacity-80">${escHtml(topics.join(', '))}</span></div>`
                    : '';
            return `
            <div class="not-prose my-10 rounded-3xl border border-orange-200/60 dark:border-orange-900/35 bg-gradient-to-br from-orange-50 to-white dark:from-slate-900 dark:to-slate-900/60 p-6 shadow-xl overflow-hidden relative">
                <div class="absolute -top-10 -right-10 text-[160px] opacity-[0.08] select-none" aria-hidden="true">🎮</div>
                <div class="relative z-10 flex flex-col gap-4">
                    <div class="flex items-start gap-4">
                        <div class="w-14 h-14 rounded-2xl bg-orange-100 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/40 flex items-center justify-center text-2xl shrink-0" aria-hidden="true">🎮</div>
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center flex-wrap">
                                <h3 class="m-0 text-lg font-black text-slate-900 dark:text-white tracking-tight">${escHtml(prefix)}: ${escHtml(title)}</h3>
                                ${optPill}
                            </div>
                            <p class="m-0 mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">${escHtml(hint)}</p>
                        </div>
                    </div>
                    <div class="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                        <button type="button" class="btn-game-launch px-5 py-3 rounded-xl font-black uppercase tracking-wider text-sm bg-slate-900 text-white hover:opacity-90 active:scale-[0.99] transition ${!url ? 'opacity-50 cursor-not-allowed' : ''}"
                            data-url="${escAttr(url)}"
                            data-title="${escAttr(title)}"
                            data-topics="${escAttr(topics.join(','))}"
                            ${disabled}>
                            ${escHtml(btnLabel)}
                        </button>
                        ${url ? `<div class="flex flex-col gap-1">
                            <div class="text-[11px] text-slate-500 dark:text-slate-400 font-mono break-all select-text">cartridge: <span class="opacity-80">${escHtml(url)}</span></div>
                            ${topicsLabel}
                        </div>` : `<div class="text-[11px] text-red-600 dark:text-red-300 font-bold">${escHtml(ui.gameMissingUrl || 'Missing game URL')}</div>`}
                    </div>
                </div>
            </div>`;
        }
        
        if (b.type === 'quizv2') {
            if (context.interactiveQuizV2) {
                return ContentRenderer.renderQuizV2Interactive(b, ui, getQuizState(b.id || 'quiz-v2'), context);
            }
            const traps = Array.isArray(b.traps) ? b.traps.filter((t) => String(t || '').trim()) : [];
            const trapList = traps
                .map((t) => `<li class="text-sm text-rose-700 dark:text-rose-300">${escHtml(t)}</li>`)
                .join('');
            return `
            <div id="${escAttr(b.id || 'quiz-v2')}" class="not-prose my-10 rounded-3xl border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/40 p-6 md:p-8 shadow-lg">
                <div class="flex items-center gap-2 mb-4">
                    <span class="text-2xl" aria-hidden="true">📋</span>
                    <h3 class="m-0 text-lg font-black text-indigo-900 dark:text-indigo-100 uppercase tracking-wide">${escHtml(ui.lessonQuizV2Label || 'Evaluation')}</h3>
                    <span class="arborito-pill arborito-pill--chip arborito-pill--emerald ml-auto">${escHtml(ui.lessonQuizV2StatusComplete || 'Game ready')}</span>
                </div>
                <dl class="grid gap-3 text-sm">
                    <div><dt class="font-bold text-indigo-800 dark:text-indigo-300">${escHtml(ui.editorBlockCoreConcept || 'Concept')}</dt><dd class="text-slate-800 dark:text-slate-100 mt-0.5">${escHtml(b.core_concept || '')}</dd></div>
                    <div><dt class="font-bold text-indigo-800 dark:text-indigo-300">${escHtml(ui.editorBlockShortDef || 'Definition')}</dt><dd class="text-slate-700 dark:text-slate-200 mt-0.5">${escHtml(b.short_definition || '')}</dd></div>
                    <div><dt class="font-bold text-indigo-800 dark:text-indigo-300">${escHtml(ui.editorBlockQuizQuestion || 'Question')}</dt><dd class="text-slate-800 dark:text-slate-100 mt-0.5 font-medium">${escHtml(b.main_question || '')}</dd></div>
                    <div><dt class="font-bold text-emerald-800 dark:text-emerald-300">${escHtml(ui.editorBlockCorrect || 'Correct')}</dt><dd class="text-emerald-800 dark:text-emerald-200 mt-0.5">${escHtml(b.correct_answer || '')}</dd></div>
                    ${trapList ? `<div><dt class="font-bold text-rose-800 dark:text-rose-300">${escHtml(ui.lessonQuizV2AddTrap || 'Distractors')}</dt><dd class="mt-1"><ul class="list-disc pl-5 m-0 space-y-1">${trapList}</ul></dd></div>` : ''}
                </dl>
                <p class="mt-4 mb-0 text-xs text-slate-500 dark:text-slate-400">${escHtml(ui.lessonQuizV2Desc || '')}</p>
            </div>`;
        }

        if (b.type === 'list') {
            return `<ul class="space-y-2 my-6 pl-4${alignClass}">${b.items.map(i => `<li class="flex items-start gap-3 text-slate-700 dark:text-slate-300 leading-relaxed"><span class="mt-2 w-1.5 h-1.5 bg-sky-500 rounded-full flex-shrink-0"></span><span>${escInlineHtml(i)}</span></li>`).join('')}</ul>`;
        }
        return '';
    }
}

