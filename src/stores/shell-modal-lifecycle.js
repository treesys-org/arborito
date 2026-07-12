import { hideInitialLoader, notifyOnboardingShellPainted } from '../boot-loader.js';
import { getPanelRef } from '../app/panel-refs.js';
import { armModalOpenLoading } from '../app/modal-open-bridge.js';
import { isSagePointerGuarded } from '../features/learning/api/sage-pointer-guard.js';
import { ensureSageHostReadyOnStore } from './shell-sage-lifecycle.js';
import { prepareShellForModalOpen } from './shell-overlay-coordinator.js';
import * as constructionFlow from '../features/editor/api/construction-enter-flow.js';

/** @param {import('./shell-store.js').ShellStore} store */
export function setModalOnStore(store, modal) {
    if (!modal && store._isSageModal(store.state.modal) && isSagePointerGuarded()) {
        return;
    }
    if (modal) {
        prepareShellForModalOpen(store, modal);
        armModalOpenLoading(modal);
    }
    const isSage =
        modal && (modal === 'sage' || (typeof modal === 'object' && modal.type === 'sage'));
    if (isSage && store.state.previewNode) {
        store.update({ modal, previewNode: null });
    } else {
        store.update({ modal });
    }
    const resolvedType =
        modal && typeof modal === 'object' ? modal.type : typeof modal === 'string' ? modal : null;
    if (resolvedType === 'onboarding' || resolvedType === 'sources') {
        hideInitialLoader();
        if (resolvedType === 'onboarding') {
            notifyOnboardingShellPainted();
        }
    }
    if (isSage) void ensureSageHostReadyOnStore(store);
}

/** @param {import('./shell-store.js').ShellStore} store */
export function dismissModalOnStore(store, opts = {}) {
    if (store._isSageModal(store.state.modal) && isSagePointerGuarded()) {
        return;
    }
    const m = store.state.modal;
    const modalType = m && typeof m === 'object' ? m.type : typeof m === 'string' ? m : null;
    void dismissModalWithFlow(store, constructionFlow, opts, m, modalType);
}

/**
 * Mobile / construction modal stack routing when the user dismisses a nested modal.
 * @param {import('./shell-store.js').ShellStore} store
 */
export function dismissModalWithFlow(store, constructionFlow, opts, m, modalType) {
    const exitConstructionAfterSources =
        modalType === 'sources' && constructionFlow.shouldExitConstructionWhenSourcesClosed(m);
    const openedFromMore = m && typeof m === 'object' && m.fromMobileMore;
    const openedFromConstructionMore = m && typeof m === 'object' && m.fromConstructionMore;
    const openedFromSources = m && typeof m === 'object' && m.fromSources;
    const openedFromProfile = m && typeof m === 'object' && m.fromProfile;
    const openedFromAbout = m && typeof m === 'object' && m.fromAbout;
    const fromOnboarding = m && typeof m === 'object' && m.fromOnboarding;
    const returnToMore = opts.returnToMore !== false;

    if (fromOnboarding && returnToMore) {
        const hint = typeof fromOnboarding === 'object' ? fromOnboarding : {};
        const payload = { type: 'onboarding' };
        const returnStep = Number(hint.step);
        if (returnStep === 1 || returnStep === 2) payload.step = returnStep;
        if (hint.view) payload.view = hint.view;
        setModalOnStore(store, payload);
        return;
    }
    if (openedFromProfile && returnToMore) {
        setModalOnStore(store, { type: 'profile' });
        return;
    }
    if (openedFromAbout && returnToMore) {
        setModalOnStore(store, { type: 'about', tab: 'manifesto' });
        return;
    }
    if (openedFromSources && returnToMore) {
        const payload = { type: 'sources' };
        if (openedFromConstructionMore) payload.fromConstructionMore = true;
        if (openedFromMore) payload.fromMobileMore = true;
        if (m.sourcesFocusTab === 'branch') payload.focusTab = 'branch';
        setModalOnStore(store, payload);
        return;
    }
    /*
     * Construction: reopen “More” behind the modal, no scrim fade-in animation, and
     * clear the modal on the next frame, so the scrim is opaque before paint without the modal
     * (Sources / Versions / language used to fade in from 0 and the graph flickered).
     */
    if (openedFromConstructionMore && returnToMore) {
        const cp = getPanelRef('construction-panel');
        if (cp && typeof cp.openConstructionMoreMenu === 'function') {
            cp.openConstructionMoreMenu({ instant: true });
        }
        if (exitConstructionAfterSources) void constructionFlow.exitConstructionAfterTreeLibraryClosed(m);
        if (opts.syncClose) {
            setModalOnStore(store, null);
        } else {
            requestAnimationFrame(() => setModalOnStore(store, null));
        }
        return;
    }
    const fromConstructLang =
        m && typeof m === 'object' && m.type === 'pick-curriculum-lang' && m.fromConstructionLangModal;
    if (fromConstructLang && returnToMore) {
        setModalOnStore(store, { type: 'construction-curriculum-lang' });
        return;
    }
    if (openedFromMore && returnToMore) {
        const sb = getPanelRef('sidebar');
        if (sb && typeof sb.openMobileMoreMenu === 'function') sb.openMobileMoreMenu();
        if (exitConstructionAfterSources) void constructionFlow.exitConstructionAfterTreeLibraryClosed(m);
        requestAnimationFrame(() => setModalOnStore(store, null));
        return;
    }
    if (exitConstructionAfterSources) void constructionFlow.exitConstructionAfterTreeLibraryClosed(m);
    setModalOnStore(store, null);
}
