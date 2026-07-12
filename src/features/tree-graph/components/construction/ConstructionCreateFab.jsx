import { useEffect, useRef, useState } from 'react';
import { useTreeGraph } from '../../hooks/useTreeGraph.js';
import { fileSystem } from '../../../backup-export/api/filesystem.js';
import { getArboritoStore } from '../../../../core/store-singleton.js';
import { schedulePersistTreeUiState } from '../../api/tree-ui-persist.js';
import { ChromeEmoji } from '../../../../app/components/ChromeEmoji.jsx';
import { isComposedTreePlaylistRoot } from '../../api/logic/construction-panel-tools.js';
import { clearConstructionUI, rectFromElement, setConstructionUI } from '../../api/logic/construction-ui-bridge.js';
import { graphPanelRootEl } from '../../api/graph-panel-api.js';

/** Floating + FAB with create menu (construction mode). */
export function ConstructionCreateFab({ folderNode }) {
    const tree = useTreeGraph();
    const { ui, userStore, graphUi, constructionMode } = tree;
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);
    const fabRef = useRef(null);
    const composedPlaylistRoot = isComposedTreePlaylistRoot(folderNode);

    useEffect(() => {
        if (!open) return undefined;
        const ac = new AbortController();
        document.addEventListener(
            'click',
            (ev) => {
                if (!rootRef.current?.contains(ev.target)) setOpen(false);
            },
            { signal: ac.signal, capture: true }
        );
        return () => ac.abort();
    }, [open]);

    if (!constructionMode || !fileSystem.features.canWrite || !folderNode) return null;
    if (folderNode.type !== 'root' && folderNode.type !== 'branch') return null;

    const addAria = (ui.graphAddChildFabAria || ui.graphAddFolder || 'Add').trim();
    const folderL = (ui.graphFabNewFolder || ui.graphAddFolder || 'New folder').trim();
    const lessonL = (ui.graphFabNewLesson || ui.graphAddLesson || 'New lesson').trim();
    const examL = (ui.graphFabNewExam || ui.graphAddExam || 'New exam').trim();
    const branchL = (ui.graphFabAddComposedBranch || ui.sourcesTreeEditorAdd || 'Add branch').trim();
    const isRootFolder = folderNode.type === 'root';
    const lessonMenuIc = isRootFolder ? '📖' : '📄';

    const graphRoot = () => graphPanelRootEl();

    const runAct = async (act) => {
        setOpen(false);
        clearConstructionUI();
        if (act === 'add-composed-branch') {
            const fab = fabRef.current;
            if (fab) setConstructionUI({ type: 'composed-add', rect: rectFromElement(fab) });
            return;
        }
        tree.selectMobileNode(folderNode.id);
        tree.setGraphMoveMode(false);
        const root = graphRoot();
        if (act === 'new-folder') await tree.handleGraphDockAction('new-folder', { skipPrompt: true }, root);
        else if (act === 'new-file') await tree.handleGraphDockAction('new-file', { skipPrompt: true }, root);
        else if (act === 'new-exam') await tree.handleGraphDockAction('new-exam', { skipPrompt: true }, root);
        tree.bumpGraphUiRevision();
        schedulePersistTreeUiState(getArboritoStore());
    };

    return (
        <div ref={rootRef} className="mobile-construction-fab-host">
            <div className="mobile-construction-fab-root">
                <div className="mobile-construction-fab-menu" hidden={!open} role="menu" aria-label={addAria}>
                    {composedPlaylistRoot ? (
                        <button type="button" className="mobile-construction-fab-menu__btn" role="menuitem" onClick={() => runAct('add-composed-branch')}>
                            <span className="mobile-construction-fab-menu__btn-ic" aria-hidden="true">
                                <ChromeEmoji emoji="🌿" size={20} className="arborito-emoji-glyph" />
                            </span>
                            <span className="mobile-construction-fab-menu__btn-txt">{branchL}</span>
                        </button>
                    ) : (
                        <>
                            <button type="button" className="mobile-construction-fab-menu__btn" role="menuitem" onClick={() => runAct('new-folder')}>
                                <span className="mobile-construction-fab-menu__btn-ic" aria-hidden="true">
                                    <ChromeEmoji emoji="🗂️" size={20} className="arborito-emoji-glyph" />
                                </span>
                                <span className="mobile-construction-fab-menu__btn-txt">{folderL}</span>
                            </button>
                            <button type="button" className="mobile-construction-fab-menu__btn" role="menuitem" onClick={() => runAct('new-file')}>
                                <span className="mobile-construction-fab-menu__btn-ic" aria-hidden="true">
                                    <ChromeEmoji emoji={lessonMenuIc} size={20} className="arborito-emoji-glyph" />
                                </span>
                                <span className="mobile-construction-fab-menu__btn-txt">{lessonL}</span>
                            </button>
                            <button type="button" className="mobile-construction-fab-menu__btn" role="menuitem" onClick={() => runAct('new-exam')}>
                                <span className="mobile-construction-fab-menu__btn-ic" aria-hidden="true">
                                    <ChromeEmoji emoji="📝" size={20} className="arborito-emoji-glyph" />
                                </span>
                                <span className="mobile-construction-fab-menu__btn-txt">{examL}</span>
                            </button>
                        </>
                    )}
                </div>
                <button
                    ref={fabRef}
                    type="button"
                    className="mobile-construction-fab"
                    aria-haspopup="true"
                    aria-expanded={open}
                    aria-label={addAria}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        clearConstructionUI();
                        setOpen((v) => !v);
                    }}
                >
                    +
                </button>
            </div>
        </div>
    );
}
