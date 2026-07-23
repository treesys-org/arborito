import { useRegisterPanel } from '../../../app/hooks/useRegisterPanel.js';
import { getArboritoStore } from '../../../core/store-singleton.js';
import { openContributorHub } from '../../publishing/api/account-hub-gate.js';
import { ConstructionToolbar } from './ConstructionToolbar.jsx';
import { useConstructionPanel } from '../hooks/useConstructionPanel.js';

export function ConstructionPanel({ embed }) {
    const panel = useConstructionPanel();
    const {
        ui,
        constructionMode,
        panelApiRef,
        useCompactDock,
        moreToolsOpen,
        conMoreInstantReveal,
        dockExitlessDesktop,
        showCurriculumTools,
        publishingPublic,
        revokingPublic,
        openingPublishHub,
        scope,
        curriculumEditLang,
        curriculumLangPickerEpoch,
        appLang,
        dismissModal,
        setModal,
        toggleConstructionMode,
        offerLocalCopyFromNetworkTreeForEditing,
        openSageModal,
        openConstructionCurriculumLangModal,
        selectedNode,
        previewNode,
        setMoreToolsOpen,
        closeMore,
        handleRetractPublicTree,
        handleScopePublishClick,
        modalType,
        modal,
        sageDockActive,
        historyDockActive,
        publishDockActive,
    } = panel;

    useRegisterPanel('construction-panel', () => panelApiRef.current);

    if (!constructionMode) {
        return (
            <div
                data-arborito-panel="construction-panel"
                data-embed={embed ? '1' : undefined}
                style={{ display: 'none' }}
            />
        );
    }

    return (
        <div data-arborito-panel="construction-panel" data-embed={embed ? '1' : undefined}>
            <ConstructionToolbar
                ui={ui}
                editScope={scope.editScope}
                useCompactDock={useCompactDock}
                moreToolsOpen={moreToolsOpen}
                conMoreInstantReveal={conMoreInstantReveal}
                showCurriculumTools={showCurriculumTools}
                langKeys={scope.langKeys}
                curriculumEditLang={curriculumEditLang}
                curriculumLangPickerEpoch={curriculumLangPickerEpoch}
                appLang={appLang}
                publishingPublic={publishingPublic}
                revokingPublic={revokingPublic}
                openingPublishHub={openingPublishHub}
                canShowPublish={scope.canShowPublish}
                canRetractPublicTree={scope.canRetractPublicTree}
                canWriteMapEdit={scope.canWriteMapEdit}
                showGovernanceTab={scope.showGovernanceTab}
                isContributor={scope.isContributor}
                constructionLangModalOpen={scope.constructionLangModalOpen}
                canForkForEdit={scope.canForkForEdit}
                dockExitlessDesktop={dockExitlessDesktop}
                sageDockActive={sageDockActive}
                historyDockActive={historyDockActive}
                publishDockActive={publishDockActive}
                onBack={() => {
                    setMoreToolsOpen(false);
                    toggleConstructionMode();
                }}
                onFork={() => void offerLocalCopyFromNetworkTreeForEditing({ enterConstruction: true })}
                onHistory={() => {
                    setMoreToolsOpen(false);
                    if (modalType === 'construction-history') {
                        dismissModal();
                        return;
                    }
                    setModal({ type: 'construction-history', dockUi: true });
                }}
                onSage={() => {
                    setMoreToolsOpen(false);
                    if (modalType === 'sage') {
                        dismissModal();
                        return;
                    }
                    const lessonOpen = !!(selectedNode || previewNode);
                    const node = selectedNode || previewNode;
                    const inLesson = lessonOpen && node && (node.type === 'leaf' || node.type === 'exam');
                    openSageModal({
                        type: 'sage',
                        mode: 'context',
                        dockUi: true,
                        ...(inLesson ? { sageLessonContext: true } : {}),
                    });
                }}
                onCurriculum={() => {
                    setMoreToolsOpen(false);
                    openConstructionCurriculumLangModal();
                }}
                onMoreToggle={() => {
                    const fromConMore =
                        modal &&
                        typeof modal === 'object' &&
                        modal.fromConstructionMore;
                    if (fromConMore) {
                        dismissModal({ returnToMore: false });
                        setMoreToolsOpen(false);
                        return;
                    }
                    setMoreToolsOpen((open) => {
                        const next = !open;
                        if (next) {
                            const dockModalTypes = new Set([
                                'construction-about',
                                'construction-history',
                                'construction-curriculum-lang',
                                'sage',
                                'contributor',
                            ]);
                            if (modalType && dockModalTypes.has(modalType)) {
                                dismissModal({ returnToMore: false });
                            }
                        }
                        return next;
                    });
                }}
                onMoreClose={closeMore}
                onGovernance={() => void openContributorHub(getArboritoStore())}
                onGovernanceFromMore={() => {
                    setMoreToolsOpen(false);
                    void openContributorHub(getArboritoStore(), { fromConstructionMore: true });
                }}
                onRetract={() => void handleRetractPublicTree()}
                onPublish={() => {
                    if (modalType === 'construction-about') {
                        dismissModal();
                        return;
                    }
                    void handleScopePublishClick();
                }}
                onCurriculumLangAdd={closeMore}
            />
        </div>
    );
}
