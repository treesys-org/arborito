/** Sources modal tab footer — Import only on Mis; one Crear that asks Curso | Playlist. */
export function SourcesTabFooter({ ui, mainTab, onAction }) {
    const isTrees = mainTab === 'trees';
    const isMine = mainTab === 'mine';

    if (isTrees) {
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
                        {ui.sourcesImportTreeShort || ui.sourcesImportShort || 'Import file'}
                    </button>
                    <button
                        type="button"
                        className="arborito-cta-purple arborito-sources-cta-bar__btn arborito-sources-cta-bar__btn--create"
                        onClick={() => onAction('create-composed-tree')}
                    >
                        {ui.sourcesCreateKindPlaylist || 'Playlist'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            className="arborito-sources-cta-bar"
            data-arbor-tour="sources-trees-footer"
        >
            <div className="arborito-sources-cta-bar__actions">
                {isMine ? (
                    <button
                        type="button"
                        className="arborito-cta-slate arborito-sources-cta-bar__btn"
                        onClick={() => onAction('import-tree')}
                    >
                        {ui.sourcesImportBranchShort || ui.sourcesImportShort || 'Import file'}
                    </button>
                ) : null}
                <button
                    type="button"
                    className="arborito-cta-purple arborito-sources-cta-bar__btn arborito-sources-cta-bar__btn--create"
                    onClick={() => onAction('show-create-kind')}
                >
                    {ui.sourcesCreateShort || 'Create'}
                </button>
            </div>
        </div>
    );
}
