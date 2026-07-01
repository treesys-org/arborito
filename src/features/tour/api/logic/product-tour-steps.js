import { getArboritoStore as store } from '../../../../core/store-singleton.js';
import { getPanelRef } from '../../../../app/panel-refs.js';
import {
    TOUR_PAD as PAD,
    TOUR_PAD_GRAPH_ROOT,
    queryTourTarget,
    rectForElement,
    fallbackRect,
} from '../product-tour-targets.js';

export const TOUR_DONE_KEY = 'arborito-ui-tour-done';
export const TOUR_DONE_KEY_CONSTRUCTION = 'arborito-ui-tour-done-construction';
export const TOUR_DONE_KEY_LESSON_EDIT = 'arborito-ui-tour-done-lesson-edit';
export const TOUR_DONE_KEY_SOURCES_PICKER = 'arborito-ui-tour-sources-picker-v1-done';
export const SHELL_TOUR_PENDING_KEY = 'arborito-ui-tour-shell-pending-v1';

export const EMPTY_LAYOUT = {
    ring: { top: 0, left: 0, width: 0, height: 0 },
    shades: {
        top: { height: 0 },
        left: { top: 0, left: 0, width: 0, height: 0 },
        right: { top: 0, left: 0, width: 0, height: 0 },
        bottom: { top: 0, height: 0 },
    },
    tip: { top: 0, left: 0 },
};

export function mascotForTarget(mode, target) {
    let m =
        mode === 'construction' ? '🦉⛑️'
        : mode === 'lesson-edit' ? '🦉📋'
        : '🦉';
    const t = target;
    if (t === 'graph-root') m = '🌳';
    else if (t === 'graph' || t === 'mob-home' || t === 'home') m = '🗺️';
    else if (t === 'arcade' || t === 'mob-arcade') m = '🎮';
    else if (t === 'construct') m = '🏗️';
    else if (t === 'search' || t === 'mob-search') m = '🔍';
    else if (t === 'profile' || t === 'mob-profile') m = '🎒';
    else if (t === 'sage-fab' || t === 'mob-sage') m = '🦉';
    else if (
        t === 'sources' ||
        t === 'sources-pick-tree' ||
        t === 'sources-pick-tree-trees' ||
        t === 'sources-main-tabs' ||
        t === 'sources-tab-branches'
    ) m = '📚';
    else if (t === 'sources-tab-trees') m = '🌳';
    else if (t === 'con-undo') m = '🕒';
    else if (t === 'con-exit') m = '⬅️';
    else if (t === 'con-more') m = '🧰';
    else if (t === 'con-lang') m = '🌐';
    else if (t === 'con-info') m = 'ℹ️';
    else if (t === 'con-gov') m = '👥';
    else if (t === 'con-publish') m = '🚀';
    else if (t === 'cloud-sync') m = '☁️';
    else if (t === 'mob-progress') m = '📊';
    else if (t === 'mob-theme') m = '🌓';
    else if (t === 'con-ai') m = '🦉⛑️';
    else if (t === 'lesson-edit-meta') m = '📝';
    else if (t === 'lesson-edit-toolbar') m = '🧰';
    else if (t === 'lesson-edit-insert') m = '➕';
    else if (t === 'lesson-edit-quiz') m = '📋';
    else if (t === 'lesson-edit-wizard') m = '🎯';
    else if (t === 'lesson-edit-arcade') m = '🎮';
    else if (t === 'lesson-edit-save') m = '💾';
    else if (t === 'lesson-edit-toc') m = '🎮';
    else if (!t) m = '👋';
    return m;
}

export function defaultMascotForMode(mode, sourcesPickerOnly) {
    if (sourcesPickerOnly) return '📚';
    if (mode === 'construction') return '🦉⛑️';
    if (mode === 'lesson-edit') return '🦉📋';
    return '🦉';
}

function elementNeedsScroll(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 && r.height < 2) return true;
    const margin = 48;
    return (
        r.top < margin ||
        r.left < margin ||
        r.bottom > window.innerHeight - margin ||
        r.right > window.innerWidth - margin
    );
}

export function computeLayout(step, tipEl, { smoothScroll = false } = {}) {
    const stepTarget = step?.target;
    const el = step ? queryTourTarget(stepTarget) : null;
    if (
        el &&
        stepTarget !== 'graph-root' &&
        typeof el.scrollIntoView === 'function' &&
        elementNeedsScroll(el)
    ) {
        const scrollBehavior = smoothScroll ? 'smooth' : 'instant';
        try {
            el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: scrollBehavior });
        } catch {
            try {
                el.scrollIntoView({ block: 'center', inline: 'nearest' });
            } catch {
                el.scrollIntoView();
            }
        }
    }
    let r = rectForElement(el, stepTarget);
    if (!r) r = fallbackRect();

    const pad = stepTarget === 'graph-root' ? TOUR_PAD_GRAPH_ROOT : PAD;
    const t = Math.max(0, r.top - pad);
    const l = Math.max(0, r.left - pad);
    const right = Math.min(window.innerWidth, r.right + pad);
    const bottom = Math.min(window.innerHeight, r.bottom + pad);
    const w = Math.max(0, right - l);
    const h = Math.max(0, bottom - t);

    const margin = 12;
    const tw = tipEl?.offsetWidth || 320;
    const th = tipEl?.offsetHeight || 200;
    let ty = bottom + margin;
    if (ty + th > window.innerHeight - margin) {
        ty = t - th - margin;
    }
    if (ty < margin) ty = margin;
    let tx = l + w / 2 - tw / 2;
    tx = Math.max(margin, Math.min(window.innerWidth - tw - margin, tx));

    return {
        ring: { top: t, left: l, width: w, height: h },
        shades: {
            top: { height: t },
            left: { top: t, left: 0, width: l, height: h },
            right: {
                top: t,
                left: l + w,
                width: Math.max(0, window.innerWidth - l - w),
                height: h,
            },
            bottom: { top: t + h, height: Math.max(0, window.innerHeight - t - h) },
        },
        tip: { top: ty, left: tx },
    };
}

export function setProfilePopoverOpen(open) {
    const wrap = document.querySelector('.arborito-desktop-profile-wrap');
    if (!wrap) return;
    wrap.classList.toggle('arborito-tour-popover-open', !!open);
}

export function syncSourcesPickerTabForStep(step, sourcesPickerOnlyTour) {
    if (!step?.target || !sourcesPickerOnlyTour) return false;
    const modal = getPanelRef('modal-sources');
    if (!modal) return false;
    const t = step.target;
    let mainTab = null;
    if (t === 'sources-tab-branches' || t === 'sources-pick-tree') mainTab = 'branches';
    else if (t === 'sources-tab-trees' || t === 'sources-pick-tree-trees') mainTab = 'trees';
    if (!mainTab || modal._sourcesMainTab === mainTab) return false;
    modal._sourcesMainTab = mainTab;
    modal.activeTab = mainTab === 'trees' ? 'trees' : 'branch';
    modal.updateContent?.();
    return true;
}

export function inSourcesContinuationPhase(active, mode, sourcesPickerOnlyTour) {
    if (!active || mode !== 'default') return false;
    if (!sourcesPickerOnlyTour) return false;
    const modal = store.value.modal;
    const modalType = typeof modal === 'string' ? modal : modal?.type;
    return modalType === 'sources';
}
