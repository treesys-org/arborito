/** @type {Set<Element>} */
const watchedScrolls = new Set();
let resizeBound = false;
let resizeRaf = 0;

function measureToolbarScroll(el) {
    const row = el.closest('.arborito-lesson-construct-row, .arborito-lesson-read-row');
    if (!row) return;

    if (!row.classList.contains('is-toolbar-row-overflowing')) {
        if (row.scrollWidth <= row.clientWidth + 3) {
            el.classList.remove('is-scrollable');
            return;
        }
        row.classList.add('is-toolbar-row-overflowing');
        void row.offsetWidth;
    } else {
        row.classList.remove('is-toolbar-row-overflowing');
        el.classList.remove('is-scrollable');
        if (row.scrollWidth <= row.clientWidth + 3) {
            return;
        }
        row.classList.add('is-toolbar-row-overflowing');
        void row.offsetWidth;
    }

    const needScroll = el.scrollWidth - el.clientWidth > 3;
    el.classList.toggle('is-scrollable', needScroll);
}

function runLessonToolbarScrollSync() {
    resizeRaf = 0;
    for (const el of [...watchedScrolls]) {
        if (!el.isConnected) {
            watchedScrolls.delete(el);
            continue;
        }
        measureToolbarScroll(el);
    }
}

function scheduleLessonToolbarScrollSync() {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(runLessonToolbarScrollSync);
}

function onWindowResize() {
    scheduleLessonToolbarScrollSync();
}

/** Register lesson toolbar scroll roots under `root` (or document). */
export function syncLessonToolbarScroll(root) {
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
    scope.querySelectorAll('.js-lesson-toolbar-scroll').forEach((el) => watchedScrolls.add(el));
    if (!watchedScrolls.size) return;

    if (!resizeBound) {
        resizeBound = true;
        window.addEventListener('resize', onWindowResize, { passive: true });
    }

    scheduleLessonToolbarScrollSync();
}

/** Drop tracked scroll roots torn down with `root`. */
export function teardownLessonToolbarScroll(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return;

    root.querySelectorAll('.js-lesson-toolbar-scroll').forEach((el) => watchedScrolls.delete(el));

    if (!watchedScrolls.size) {
        if (resizeRaf) {
            cancelAnimationFrame(resizeRaf);
            resizeRaf = 0;
        }
        if (resizeBound) {
            resizeBound = false;
            window.removeEventListener('resize', onWindowResize);
        }
    }
}
