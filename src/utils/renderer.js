
import { BLOCKS } from './editor-engine.js';
import { escAttr } from './html-escape.js';

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
            <button type="button" class="arborito-media-consent-retry btn px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-bold">
                ${escHtml(ui.mediaBlockedRetry || 'Load options')}
            </button>
        </div>`;
}

function shuffleQuizOptions(seed, options) {
    const arr = options.slice();
    let h = 0;
    const s = String(seed || 'quiz');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    for (let i = arr.length - 1; i > 0; i--) {
        h = (h * 1103515245 + 12345) | 0;
        const j = Math.abs(h) % (i + 1);
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
    }
    return arr;
}

import { renderQuizV2Challenge } from './quiz-v2-player.js';

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
                ? `<button type="button" id="btn-view-certificate" class="mt-4 w-full md:w-auto px-6 py-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2 mx-auto">
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
                <div class="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
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

    _renderQuizV2InteractiveLegacy(b, ui, state, context = {}) {
        const blockId = b.id || 'quiz-v2';
        const correct = String(b.correct_answer || '').trim();
        const traps = Array.isArray(b.traps) ? b.traps.map((t) => String(t || '').trim()).filter(Boolean) : [];
        const options = shuffleQuizOptions(
            blockId,
            [{ text: correct, correct: true }, ...traps.map((t) => ({ text: t, correct: false }))]
        );
        const label = ui.lessonQuizV2Label || ui.quizLabel || 'Evaluation';
        const intro = ui.lessonQuizV2StudentIntro || ui.quizIntro || 'Test your knowledge with one question.';
        const startLbl = ui.quizStart || 'Start';
        const retryLbl = ui.quizRetry || 'Try again';
        const correctLbl = ui.quizCorrect || 'Correct!';
        const wrongLbl = ui.quizWrong || 'Not quite';
        const defHint = b.short_definition
            ? `<p class="text-sm text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">${escHtml(b.short_definition)}</p>`
            : '';

        if (state.finished && state.v2Answered) {
            const ok = !!state.v2Correct;
            const session = context.quizSession;
            const inSession = session && session.quizIds && session.quizIds.length > 1;
            const isExam = !!context.isExam;
            let actionHtml = `<button type="button" class="btn-quizv2-retry px-6 py-3 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-sm" data-id="${escAttr(blockId)}">${escHtml(retryLbl)}</button>`;
            if (inSession && session.awaitingAdvance && !session.finished) {
                const isLast = session.currentIndex >= session.quizIds.length - 1;
                const nextLbl = isLast
                    ? ui.lessonQuizSessionFinish || 'See results'
                    : ui.lessonQuizSessionNext || 'Next question';
                actionHtml = `<button type="button" class="btn-quizv2-next px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm" data-id="${escAttr(blockId)}">${escHtml(nextLbl)}</button>`;
            } else if (isExam && ok && !inSession) {
                actionHtml = `<button type="button" id="btn-view-certificate" class="px-6 py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm">${escHtml(ui.viewCert || 'View certificate')}</button>`;
            }
            return `
            <div id="${escAttr(blockId)}" class="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 p-6 md:p-8 text-center">
                <div class="w-16 h-16 mx-auto rounded-full flex items-center justify-center text-3xl mb-4 ${ok ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}">${ok ? '✓' : '✗'}</div>
                <h3 class="text-xl font-black text-slate-800 dark:text-white mb-2">${escHtml(ok ? correctLbl : wrongLbl)}</h3>
                <p class="text-sm text-slate-500 dark:text-slate-400 mb-1">${escHtml(ui.editorBlockCorrect || 'Correct answer')}:</p>
                <p class="text-base font-bold text-emerald-700 dark:text-emerald-300 mb-6">${escHtml(correct)}</p>
                ${actionHtml}
            </div>`;
        }

        if (!state.started) {
            return `
            <div id="${escAttr(blockId)}" class="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border-2 border-indigo-200 dark:border-indigo-800 p-6 md:p-8 text-center">
                <span class="text-3xl mb-3 block" aria-hidden="true">📋</span>
                <h3 class="text-xl font-black text-slate-800 dark:text-white mb-2">${escHtml(label)}</h3>
                ${b.core_concept ? `<p class="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-300 mb-2">${escHtml(b.core_concept)}</p>` : ''}
                ${defHint}
                <p class="text-slate-500 dark:text-slate-400 mb-6 text-sm">${escHtml(intro)}</p>
                <button type="button" class="btn-quizv2-start w-full md:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-[0.98]" data-id="${escAttr(blockId)}">${escHtml(startLbl)}</button>
            </div>`;
        }

        const optsHtml = options
            .map(
                (opt) =>
                    `<button type="button" class="btn-quizv2-ans w-full text-left px-4 py-3.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 font-semibold text-slate-800 dark:text-slate-100 transition-colors" data-id="${escAttr(blockId)}" data-correct="${opt.correct ? 'true' : 'false'}">${escHtml(opt.text)}</button>`
            )
            .join('');

        return `
        <div id="${escAttr(blockId)}" class="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 p-6 md:p-8">
            <p class="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">${escHtml(label)}</p>
            <h3 class="text-lg font-bold text-slate-800 dark:text-white mb-6 leading-snug">${escHtml(b.main_question || '')}</h3>
            <div class="flex flex-col gap-2.5">${optsHtml}</div>
        </div>`;
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
                ? `<span class="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">${ui.tagOptional || 'Optional'}</span>`
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
                    <span class="ml-auto px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">${escHtml(ui.lessonQuizV2StatusComplete || 'Game ready')}</span>
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

        if (b.type === 'quiz') {
            const state = getQuizState(b.id);
            const total = b.questions.length;
            
            if (state.finished) {
                 const isExam = context.isExam;
                 const passingScore = isExam ? Math.ceil(total * 0.8) : total;
                 const didPass = state.score >= passingScore;

                 const icon = didPass ? '🏆' : '😔';
                 const bgColor = didPass ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600';
                 const masteryMessage = isExam && didPass ? `<p class="text-green-600 font-bold mt-2">${ui.congrats} ${ui.branchMastered || 'BRANCH MASTERED!'}</p>` : '';
                 
                 let actionButtons = '';
                 if (isExam && didPass) {
                     actionButtons = `
                        <button id="btn-view-certificate" class="mt-4 w-full md:w-auto px-6 py-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2">
                            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            ${ui.viewCert}
                        </button>
                     `;
                 } else {
                     actionButtons = `<button class="btn-quiz-retry mt-4 w-full md:w-auto px-6 py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-200 font-bold rounded-lg text-sm transition-colors" data-id="${b.id}">${ui.quizRetry}</button>`;
                 }

                 const perQ = state.results || [];
                 const resultStrip =
                     perQ.length > 0
                         ? `<div class="flex gap-1 mb-5 justify-center max-w-md mx-auto px-2" role="presentation" aria-hidden="true">
                        ${perQ
                            .map((ok) =>
                                `<div class="h-2 flex-1 min-w-[6px] max-w-8 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}"></div>`
                            )
                            .join('')}
                    </div>`
                         : '';
                 return `
                 <div id="${b.id}" class="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 p-6 md:p-8 relative overflow-hidden transition-all">
                    <div class="absolute top-0 right-0 p-4 opacity-10 text-9xl">📝</div>
                    <div class="relative z-10 text-center py-4 arborito-quiz-result-panel">
                        <div class="w-20 h-20 mx-auto rounded-full flex items-center justify-center text-4xl mb-4 shadow-xl ${bgColor}">
                            ${icon}
                        </div>
                        <h3 class="text-xl font-black text-slate-800 dark:text-white mb-1">${ui.quizCompleted}</h3>
                        ${resultStrip}
                        <p class="text-slate-500 dark:text-slate-400 mb-6">${ui.quizScore} <strong class="text-slate-900 dark:text-white">${state.score} / ${total}</strong></p>
                        ${masteryMessage}
                        ${actionButtons}
                    </div>
                 </div>`;
            }

            if (!state.started) {
                return `
                <div id="${b.id}" class="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 p-6 md:p-8 relative overflow-hidden transition-all text-center">
                    <div class="absolute top-0 right-0 p-4 opacity-10 text-9xl">📝</div>
                    <div class="relative z-10 py-4">
                        <h3 class="text-xl font-bold text-slate-800 dark:text-white mb-2">${ui.quizTitle}</h3>
                        <p class="text-slate-500 dark:text-slate-400 mb-6 text-sm">${total} ${ui.quizIntro}</p>
                        <button class="btn-quiz-start w-full md:w-auto px-8 py-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-lg shadow-purple-600/20 transition-transform hover:scale-105 active:scale-95" data-id="${b.id}">${ui.quizStart}</button>
                    </div>
                </div>`;
            }
            
            const q = b.questions[state.currentIdx];
            const results = state.results || [];
            const segClass = (i) => {
                if (i < results.length) return results[i] ? 'bg-green-500' : 'bg-red-500';
                if (i === results.length) return 'bg-purple-500';
                return 'bg-slate-200 dark:bg-slate-700';
            };
            return `
            <div id="${b.id}" class="not-prose my-12 bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 p-6 md:p-8 relative overflow-hidden transition-all">
                <div class="arborito-quiz-question-enter relative z-10">
                    <!-- Progress Bar -->
                    <div class="flex gap-1 mb-6">
                        ${Array(total).fill(0).map((_, i) => `<div class="h-1.5 flex-1 rounded-full transition-colors ${segClass(i)}"></div>`).join('')}
                    </div>

                    <span class="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 block">${ui.quizQuestionPrefix} ${state.currentIdx + 1}</span>
                    <h3 class="text-lg font-bold text-slate-800 dark:text-white mb-6 leading-snug">${escHtml(q.question)}</h3>
                    
                    <div class="space-y-3">
                        ${q.options.map((opt, i) => `
                            <button class="btn-quiz-ans w-full text-left p-4 rounded-xl border-2 font-bold transition-all duration-200 flex items-center gap-3 group bg-white dark:bg-slate-900/50 border-slate-100 dark:border-slate-700 hover:border-purple-500 dark:hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm"
                             data-id="${b.id}" data-correct="${opt.correct}" data-total="${total}">
                                <span class="w-6 h-6 rounded-full border-2 border-slate-300 dark:border-slate-500 flex items-center justify-center text-[10px] group-hover:border-purple-500 group-hover:bg-purple-500 group-hover:text-white transition-colors flex-shrink-0">${['A','B','C','D'][i]}</span>
                                <span>${escHtml(opt.text)}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>`;
        }
        if (b.type === 'list') {
            return `<ul class="space-y-2 my-6 pl-4${alignClass}">${b.items.map(i => `<li class="flex items-start gap-3 text-slate-700 dark:text-slate-300 leading-relaxed"><span class="mt-2 w-1.5 h-1.5 bg-sky-500 rounded-full flex-shrink-0"></span><span>${escInlineHtml(i)}</span></li>`).join('')}</ul>`;
        }
        return '';
    }
}

export const AdminRenderer = {
    renderRecursiveTree(nodes, depth, context) {
        const { filter, expandedPaths, getCustomIcon } = context;
        
        const folders = nodes.filter(n => n.type === 'tree').sort((a,b) => a.path.localeCompare(b.path));
        const files = nodes.filter(n => n.type === 'blob').sort((a,b) => a.path.localeCompare(b.path));
        
        let html = '';
        
        const enc = (s) => encodeURIComponent(String(s != null ? s : ''));

        folders.forEach(node => {
             const name = node.path.split('/').pop().replace(/_/g, ' ');
             let hasMatchingChildren = false;
             let childrenHtml = '';
             
             if (node.children && node.children.length > 0) {
                 childrenHtml = AdminRenderer.renderRecursiveTree(node.children, depth + 1, context);
                 hasMatchingChildren = childrenHtml.length > 0;
             }
             
             const selfMatch = filter ? name.toLowerCase().includes(filter) : true;
             if (!selfMatch && !hasMatchingChildren && filter) return; 

             const isExpanded = expandedPaths.has(node.path) || (filter && hasMatchingChildren);
             const padding = depth * 12 + 10;
             const customIcon = getCustomIcon ? getCustomIcon(node.path) : null;

             html += `
             <div>
                <div class="flex items-center justify-between py-2 px-2 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer rounded text-base group transition-colors"
                     style="padding-left: ${padding}px"
                     onclick="window.selectAdminNode(decodeURIComponent('${enc(node.path)}'), 'tree'); window.toggleFolder(decodeURIComponent('${enc(node.path)}'))">
                    <div class="flex items-center gap-3 overflow-hidden">
                        <span class="text-slate-400 text-lg">${isExpanded ? '📂' : '📁'}</span>
                        ${customIcon ? `<span class="text-lg">${customIcon}</span>` : ''}
                        <span class="font-bold text-slate-700 dark:text-slate-300 truncate select-none text-sm">${name}</span>
                    </div>
                </div>
                ${isExpanded ? `<div class="border-l border-slate-200 dark:border-slate-800 ml-4">${childrenHtml}</div>` : ''}
             </div>`;
        });

        files.forEach(node => {
            if (node.path.endsWith('meta.json')) return; 
            const name = node.path.split('/').pop().replace('.md', '').replace(/_/g, ' ');
            if (filter && !name.toLowerCase().includes(filter)) return;

            const padding = depth * 12 + 10;
            
            html += `
            <div class="flex items-center justify-between py-2 px-2 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer rounded text-base group transition-colors"
                 style="padding-left: ${padding}px"
                 onclick="window.selectAdminNode(decodeURIComponent('${enc(node.path)}'), 'blob')">
                <div class="flex items-center gap-3 overflow-hidden">
                    <span class="text-slate-400 text-lg">📄</span>
                    <span class="text-slate-600 dark:text-slate-400 truncate select-none text-sm">${name}</span>
                </div>
            </div>`;
        });

        return html;
    }
};
