import { useTreeGraph } from '../../hooks/useTreeGraph.js';
import { fileSystem } from '../../../backup-export/api/filesystem.js';
import { ConstructPanelHead } from './ConstructPanelHead.jsx';
import { ExplorePanelHead } from './ExplorePanelHead.jsx';

/** Mobile branch panel header, routes to explore or construction layout. */
export function MobilePanelHead({ current, ui, directChildSelected }) {
    const tree = useTreeGraph();
    const constructionMode = !!tree.constructionMode;
    const canWrite = fileSystem.features.canWrite;

    if (constructionMode && canWrite) {
        return (
            <ConstructPanelHead
                current={current}
                ui={ui}
                tree={tree}
                directChildSelected={directChildSelected}
            />
        );
    }

    return (
        <ExplorePanelHead
            current={current}
            ui={ui}
            tree={tree}
            constructChrome={constructionMode}
        />
    );
}
