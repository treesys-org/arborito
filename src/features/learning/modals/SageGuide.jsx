import { useLearning } from '../hooks/useLearning.js';
import { useCallback } from 'react';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { buildTreeBreadcrumb } from '../api/ai-context.js';
import { defaultSageGuideNav } from '../api/logic/sage-guide-context.js';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { SageModeToggle, SageMobPanel, SageDeskGuideShell } from './components/SageLayout.jsx';
import { sageHideDismissButton } from '../api/modals/logic/sage-ui-helpers.js';
import { SageGuideContent } from './components/sage/SageGuideContent.jsx';

function lessonGuideSubtitle(node, ui, learning) {
    if (!node) return ui.sageContextSubtitle || '';
    const name = String(node.name || '').trim();
    const crumb = buildTreeBreadcrumb({ state: learning }, node, { maxChars: 72 });
    if (name && crumb) return `${name} · ${crumb}`;
    return name || crumb || ui.sageContextSubtitle || '';
}

function sageGuideSubtitle(ui, sageLessonContext, constructionMode, learning) {
    const lessonNode = sageLessonContext ? learning.selectedNode : null;
    if (lessonNode && (lessonNode.type === 'leaf' || lessonNode.type === 'exam')) {
        return lessonGuideSubtitle(lessonNode, ui, { state: learning });
    }
    if (constructionMode) {
        return ui.sageConstructGuideSubtitle || ui.navConstruct || '';
    }
    return ui.sageTreeGuideSubtitle || '';
}

export function SageGuide({
    ui,
    guideNav,
    setGuideNav,
    sageLessonContext,
    constructionMode,
    sageEnterAnim,
    isAi,
    onSwitchMode,
    onClose,
    embedded = false,
}) {
    const learning = useLearning();
    const { setModal, toggleConstructionMode } = learning;

    const mob = shouldShowMobileUI();
    const hideDismiss = sageHideDismissButton();
    const lessonNode = sageLessonContext ? learning.selectedNode : null;
    const ctxOpts = { lessonNode };
    const nav = guideNav || defaultSageGuideNav();
    const showBack = nav.screen !== 'hub';
    const showBackBtn = showBack || mob;
    const subtitle = showBack ? '' : sageGuideSubtitle(ui, sageLessonContext, constructionMode, learning);

    const popGuideNav = useCallback(() => {
        if (nav.screen === 'topic') {
            if (nav.parentTopic && nav.topicId !== nav.parentTopic) {
                setGuideNav({ screen: 'topic', topicId: nav.parentTopic });
                return true;
            }
            setGuideNav(defaultSageGuideNav());
            return true;
        }
        return false;
    }, [nav, setGuideNav]);

    const runGuideAction = useCallback(
        (btn) => {
            const action = btn.getAttribute('data-sage-action');

            if (action === 'goto-nav') {
                const dest = btn.getAttribute('data-sage-nav') || '';
                if (dest === 'hub') setGuideNav(defaultSageGuideNav());
                else if (dest === 'topic') {
                    const topicId = btn.getAttribute('data-sage-topic') || '';
                    if (topicId) setGuideNav({ screen: 'topic', topicId });
                }
                return;
            }
            if (action === 'open-topic') {
                const topicId = btn.getAttribute('data-sage-topic');
                if (!topicId) return;
                const parentTopic = btn.getAttribute('data-sage-parent-topic') || '';
                setGuideNav({ screen: 'topic', topicId, ...(parentTopic ? { parentTopic } : {}) });
                return;
            }
            if (action === 'start-con-tour') {
                onClose();
                queueMicrotask(() => {
                    window.dispatchEvent(
                        new CustomEvent('arborito-start-tour', { detail: { mode: 'construction', force: true } })
                    );
                });
            } else if (action === 'exit-construction') {
                onClose();
                toggleConstructionMode();
            }
        },
        [onClose, setGuideNav, toggleConstructionMode]
    );

    const onGuideClick = useCallback(
        (e) => {
            const t = e.target instanceof Element ? e.target : null;
            const actionBtn = t?.closest('[data-sage-action]');
            if (!actionBtn) return;
            e.preventDefault();
            runGuideAction(actionBtn);
        },
        [runGuideAction]
    );

    const onBack = useCallback(() => {
        if (nav.screen && nav.screen !== 'hub' && popGuideNav()) return;
        onClose();
    }, [nav.screen, popGuideNav, onClose]);

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mob}
            title={ui.sageTitle || 'Sage'}
            subtitle={subtitle || undefined}
            subtitleClass={
                showBack
                    ? 'arborito-sage-hero-subtitle arborito-sage-hero-subtitle--accent'
                    : 'arborito-sage-hero-subtitle'
            }
            leadingIcon="🦉"
            trailingHtml={<SageModeToggle ui={ui} isAi={isAi} onChange={onSwitchMode} />}
            showBack={showBackBtn}
            showClose={!hideDismiss}
            onBack={onBack}
            onClose={onClose}
        />
    );

    const body = (
        <div
            className="arborito-sage-body arborito-sage-body--guide flex-1 min-h-0 flex flex-col overflow-hidden px-1.5 pb-1.5 pt-0"
            onClick={onGuideClick}
        >
            <SageGuideContent ui={ui} learning={learning} nav={nav} ctxOpts={ctxOpts} />
        </div>
    );

    if (mob && embedded) {
        return (
            <div className="arborito-sage-guide-embedded flex flex-col flex-1 min-h-0 h-full overflow-hidden">
                {hero}
                {body}
            </div>
        );
    }
    if (mob) {
        return (
            <SageMobPanel guide hero={hero} enterAnim={sageEnterAnim}>
                {body}
            </SageMobPanel>
        );
    }
    return (
        <SageDeskGuideShell enterAnim={sageEnterAnim} hero={hero}>
            {body}
        </SageDeskGuideShell>
    );
}
