/** Sources modal tab footer CTAs — bare Import + create row (no card chrome). */
export function SourcesTabFooter({ ui, mainTab, onAction }) {
    const isTrees = mainTab === 'trees';
    const importLbl = isTrees
        ? ui.sourcesImportTreeShort || ui.sourcesImportShort || 'Import tree'
        : ui.sourcesImportBranchShort || ui.sourcesImportShort || 'Import file';
    const createLbl = isTrees
        ? ui.sourcesCreateTreeShort || ui.sourcesCreateTree || 'Create tree (combined courses)'
        : ui.plantBranchShort || ui.plantBranch || 'Create branch (course)';

    return (
        <div
            className="arborito-sources-cta-bar"
            data-arbor-tour="sources-trees-footer"
        >
            <div className="arborito-sources-cta-bar__actions">
                <button
                    type="button"
                    className="arborito-cta-slate arborito-sources-cta-bar__btn"
                    onClick={() => onAction('import-tree')}
                >
                    {importLbl}
                </button>
                {isTrees ? (
                    <button
                        type="button"
                        className="arborito-cta-purple arborito-sources-cta-bar__btn arborito-sources-cta-bar__btn--create"
                        onClick={() => onAction('create-composed-tree')}
                    >
                        {createLbl}
                    </button>
                ) : (
                    <button
                        type="button"
                        className="arborito-cta-purple arborito-sources-cta-bar__btn arborito-sources-cta-bar__btn--create"
                        onClick={() => onAction('show-plant')}
                    >
                        {createLbl}
                    </button>
                )}
            </div>
        </div>
    );
}
