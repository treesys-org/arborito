/** Sources modal tab footer CTAs — bare Import + create row (no card chrome). */
export function SourcesTabFooter({ ui, mainTab, onAction }) {
    const isTrees = mainTab === 'trees';

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
                    {ui.sourcesImportShort || 'Import'}
                </button>
                {isTrees ? (
                    <button
                        type="button"
                        className="arborito-cta-purple arborito-sources-cta-bar__btn arborito-sources-cta-bar__btn--create"
                        onClick={() => onAction('create-composed-tree')}
                    >
                        {ui.sourcesCreateTreeShort || ui.sourcesCreateTree || 'Create tree'}
                    </button>
                ) : (
                    <button
                        type="button"
                        className="arborito-cta-purple arborito-sources-cta-bar__btn arborito-sources-cta-bar__btn--create"
                        onClick={() => onAction('show-plant')}
                    >
                        {ui.plantBranchShort || ui.plantBranch || 'New branch'}
                    </button>
                )}
            </div>
        </div>
    );
}
