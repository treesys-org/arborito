import { useRegisterPanel } from '../../../app/hooks/useRegisterPanel.js';
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
        scope,
        curriculumEditLang,
        appLang,
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
                appLang={appLang}
                publishingPublic={publishingPublic}
                revokingPublic={revokingPublic}
                canShowPublish={scope.canShowPublish}
                canRetractPublicTree={scope.canRetractPublicTree}
                canWriteMapEdit={scope.canWriteMapEdit}
                showGovernanceTab={scope.showGovernanceTab}
                isContributor={scope.isContributor}
                constructionLangModalOpen={scope.constructionLangModalOpen}
                canForkForEdit={scope.canForkForEdit}
                dockExitlessDesktop={dockExitlessDesktop}
                onBack={() => {
                    setMoreToolsOpen(false);
                    toggleConstructionMode();
                }}
                onFork={() => void offerLocalCopyFromNetworkTreeForEditing({ enterConstruction: false })}
                onHistory={() => {
                    setMoreToolsOpen(false);
                    setModal({ type: 'construction-history', dockUi: true });
                }}
                onSage={() => {
                    setMoreToolsOpen(false);
                    const lessonOpen = !!(selectedNode || previewNode);
                    const node = selectedNode || previewNode;
                    const inLesson = lessonOpen && node && (node.type === 'leaf' || node.type === 'exam');
                    openSageModal({
                        type: 'sage',
                        mode: 'context',
                        ...(inLesson ? { sageLessonContext: true } : { dockUi: true }),
                    });
                }}
                onCurriculum={() => {
                    setMoreToolsOpen(false);
                    openConstructionCurriculumLangModal();
                }}
                onMoreToggle={() => setMoreToolsOpen((open) => !open)}
                onMoreClose={closeMore}
                onGovernance={() => setModal({ type: 'contributor', tab: 'info' })}
                onGovernanceFromMore={() => {
                    setMoreToolsOpen(false);
                    setModal({ type: 'contributor', tab: 'info', fromConstructionMore: true });
                }}
                onRetract={() => void handleRetractPublicTree()}
                onPublish={() => void handleScopePublishClick()}
                onCurriculumLangAdd={closeMore}
            />
        </div>
    );
}
