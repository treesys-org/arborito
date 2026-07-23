/** Scroll / highlight helpers for lesson content and TOC. */

const ATTENTION_MS = 2700;
const SCROLL_BOTTOM_PAD = 120;
const SCROLL_TOP_PAD = 24;

function findPendingInlineQuiz(contentArea) {
    if (!contentArea) return null;
    const incompleteSelectors = [
        '.arborito-inline-quiz--incomplete',
        '.arborito-inline-quiz--idle',
        '.arborito-inline-quiz--active',
        '.arborito-inline-quiz--failed',
        '.arborito-inline-quiz--exam-locked',
        '.arborito-inline-quiz--exam-section',
    ];
    for (const sel of incompleteSelectors) {
        const hit = contentArea.querySelector(sel);
        if (hit && !hit.classList.contains('arborito-inline-quiz--done')) return hit;
    }
    const all = contentArea.querySelectorAll('.arborito-inline-quiz');
    for (const el of all) {
        if (!el.classList.contains('arborito-inline-quiz--done')) return el;
    }
    return null;
}

/** Prefer the quiz progress / top of the card so mobile attention scroll does not bury it. */
function findQuizAttentionAnchor(quiz) {
    if (!quiz) return null;
    return (
        quiz.querySelector('.arborito-question-progress') ||
        quiz.querySelector('.arborito-question-runner') ||
        quiz
    );
}

function isElementVisibleInContainer(container, el, { topPad = SCROLL_TOP_PAD, bottomPad = SCROLL_BOTTOM_PAD } = {}) {
    if (!container || !el) return true;
    const cRect = container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    return eRect.top >= cRect.top + topPad && eRect.bottom <= cRect.bottom - bottomPad;
}

/**
 * Bring `el` into view inside `container`.
 * `align: 'start'` pins the top (keeps quiz progress visible on short mobile viewports).
 * `align: 'auto'` only bottom-aligns when the element fits; otherwise pins the top.
 */
function scrollElementIntoViewWithPadding(
    container,
    el,
    { behavior = 'smooth', topPad = SCROLL_TOP_PAD, bottomPad = SCROLL_BOTTOM_PAD, align = 'auto' } = {}
) {
    if (!container || !el) return;
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const usable = containerRect.height - topPad - bottomPad;
    const preferStart = align === 'start' || (align === 'auto' && elRect.height > usable);

    if (preferStart) {
        const delta = elRect.top - containerRect.top - topPad;
        if (Math.abs(delta) < 2) return;
        container.scrollTo({ top: Math.max(0, container.scrollTop + delta), behavior });
        return;
    }

    if (isElementVisibleInContainer(container, el, { topPad, bottomPad })) return;
    let targetTop = container.scrollTop;
    if (elRect.bottom > containerRect.bottom - bottomPad) {
        targetTop += elRect.bottom - containerRect.bottom + bottomPad;
    }
    if (elRect.top < containerRect.top + topPad) {
        targetTop += elRect.top - containerRect.top - topPad;
    }
    container.scrollTo({ top: Math.max(0, targetTop), behavior });
}

export function scrollLessonContentToQuiz(
    contentArea,
    { behavior = 'smooth', focus = 'auto', force = false, attention = false } = {}
) {
    if (!contentArea) return;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const quiz = findPendingInlineQuiz(contentArea);
            if (!quiz) {
                contentArea.scrollTop = 0;
                return;
            }
            let target = quiz;
            let align = 'auto';
            const nav = quiz.querySelector('.arborito-quiz-session-nav');
            const nextEnabled = nav?.querySelector(
                '.arborito-quiz-session-nav__btn--next:not([disabled])'
            );
            if (attention) {
                /* Incomplete-quiz pulse: keep progress at the top of the viewport. */
                target = findQuizAttentionAnchor(quiz);
                align = 'start';
            } else if (focus === 'nav' && nav) {
                target = nav;
            } else if (focus === 'quiz') {
                target = quiz.querySelector('.arborito-question-runner') || quiz;
            } else if (focus === 'auto') {
                if (nextEnabled && nav) target = nav;
                else {
                    const runner = quiz.querySelector('.arborito-question-runner');
                    if (runner) target = runner;
                }
            }
            if (
                !force &&
                align !== 'start' &&
                isElementVisibleInContainer(contentArea, target)
            ) {
                return;
            }
            scrollElementIntoViewWithPadding(contentArea, target, { behavior, align });
            if (attention) pulseQuizAttention(quiz);
        });
    });
}

export function pulseQuizAttention(quizEl) {
    if (!quizEl) return;
    quizEl.classList.remove('arborito-quiz-attention');
    void quizEl.offsetWidth;
    quizEl.classList.add('arborito-quiz-attention');
    window.setTimeout(() => quizEl.classList.remove('arborito-quiz-attention'), ATTENTION_MS);
}

export function pulseTocRowAttention(tocNav, idx) {
    if (!tocNav || idx == null || idx < 0) return;
    const row = tocNav.querySelector(`.btn-toc[data-idx="${idx}"]`);
    if (!row) return;
    row.classList.add('arborito-toc-attention');
    window.setTimeout(() => row.classList.remove('arborito-toc-attention'), ATTENTION_MS);
}

/** Scroll lesson content panel so a newly inserted editor block is visible. */
export function scrollLessonEditorToInsertedBlock(blockEl, { behavior = 'smooth' } = {}) {
    if (!blockEl) return;
    const contentArea = document.getElementById('content-area');
    if (!contentArea) {
        blockEl.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior });
        return;
    }
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            scrollElementIntoViewWithPadding(contentArea, blockEl, { behavior });
        });
    });
}

export function scrollTocRowIntoView(tocScroll, tocNav, idx) {
    if (!tocNav || idx == null || idx < 0) return;
    const row = tocNav.querySelector(`.btn-toc[data-idx="${idx}"]`);
    if (!row) return;
    const scrollHost = tocScroll || tocNav;
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    void scrollHost.offsetHeight;
}
