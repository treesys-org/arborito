/** Scroll / highlight helpers for lesson content and TOC. */

const ATTENTION_MS = 2700;
const SCROLL_BOTTOM_PAD = 120;

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

function scrollElementIntoViewWithPadding(container, el, { behavior = 'smooth' } = {}) {
    if (!container || !el) return;
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const targetTop =
        container.scrollTop +
        (elRect.top - containerRect.top) -
        Math.max(24, (container.clientHeight - elRect.height - SCROLL_BOTTOM_PAD) / 2);
    container.scrollTo({ top: Math.max(0, targetTop), behavior });
}

export function scrollLessonContentToQuiz(contentArea, { behavior = 'smooth' } = {}) {
    if (!contentArea) return;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const quiz = findPendingInlineQuiz(contentArea);
            if (quiz) {
                scrollElementIntoViewWithPadding(contentArea, quiz, { behavior });
                pulseQuizAttention(quiz);
            } else {
                contentArea.scrollTop = 0;
            }
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
