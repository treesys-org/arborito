import { useRef, useState } from 'react';
import { fileSystem } from '../../../backup-export/api/filesystem.js';
import { useTreeGraph } from '../../hooks/useTreeGraph.js';
import { ChromeEmoji } from '../../../../app/components/ChromeEmoji.jsx';
import {
    getNodeToolbarCapabilities,
    getNodeToolbarMeta,
} from '../../api/logic/graph-node-actions.js';
import { MobileStructureMenuPortal } from './mobile-structure-menu-portal.jsx';

/**
 * Construction inline tools (move / delete / diploma).
 * On mobile construction rows, actions collapse into a ⋮ menu to leave room for names.
 */
export function MobileInlineTools({ node, compact, folderContextDimmed, revealDelete, omitDelete }) {
    const tree = useTreeGraph();
    const { ui, constructionMode } = tree;
    const canWrite = fileSystem.features.canWrite;
    const [menuOpen, setMenuOpen] = useState(false);
    const menuBtnRef = useRef(null);

    const runAct = async (act) => {
        if (!node) return;
        setMenuOpen(false);
        await tree.runGraphNodeAction(node, act);
        tree.bumpGraphUiRevision();
    };

    if (!node || !canWrite) return null;

    const { canMove, canDelete, canToggleDiploma } = getNodeToolbarCapabilities(node);
    const diplomaOn = !!node.isCertifiable;
    const ct = getNodeToolbarMeta(ui, node);
    const compactClass = compact ? ' mobile-inline-tools--compact' : '';
    const shouldHide = revealDelete !== false && !constructionMode;
    const delReveal = shouldHide ? ' mobile-inline-tool--hover-reveal' : '';
    const hostExtra = folderContextDimmed ? ' mobile-inline-tools-host--folder-context-dimmed' : '';
    const useActionMenu = constructionMode && compact;
    const menuLbl = ui.ariaActions || ui.graphActionsMenu || 'Actions';

    const menuItems = (
        <>
            {canMove ? (
                <button
                    type="button"
                    role="menuitem"
                    className="mobile-structure-menu__action"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void runAct('move');
                    }}
                >
                    <ChromeEmoji emoji="🔄" size={16} className="arborito-emoji-glyph shrink-0" />
                    <span>{ui.graphMove || 'Move'}</span>
                </button>
            ) : null}
            {canToggleDiploma ? (
                <button
                    type="button"
                    role="menuitem"
                    className="mobile-structure-menu__action"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void runAct('toggle-diploma');
                    }}
                >
                    <ChromeEmoji emoji="🏆" size={16} className="arborito-emoji-glyph shrink-0" />
                    <span>
                        {diplomaOn
                            ? ui.graphDiplomaOn || 'Diploma enabled'
                            : ui.graphDiplomaOff || 'Enable diploma'}
                    </span>
                </button>
            ) : null}
            {canDelete && !omitDelete ? (
                <button
                    type="button"
                    role="menuitem"
                    className="mobile-structure-menu__action mobile-structure-menu__action--danger"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void runAct('delete');
                    }}
                >
                    <ChromeEmoji emoji="🗑️" size={16} className="arborito-emoji-glyph shrink-0" />
                    <span>{ui.graphDelete || 'Delete'}</span>
                </button>
            ) : null}
        </>
    );

    if (useActionMenu && (canMove || canDelete || canToggleDiploma)) {
        return (
            <div className={`mobile-inline-tools-host mobile-inline-tools-host--menu${hostExtra}`}>
                <button
                    ref={menuBtnRef}
                    type="button"
                    className="mobile-inline-tool mobile-inline-tool--menu"
                    aria-label={menuLbl}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setMenuOpen((v) => !v);
                    }}
                >
                    <span aria-hidden="true">⋮</span>
                </button>
                <MobileStructureMenuPortal
                    open={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    anchorRef={menuBtnRef}
                    menuLbl={menuLbl}
                >
                    {menuItems}
                </MobileStructureMenuPortal>
            </div>
        );
    }

    const moveBtn = canMove ? (
        <button
            type="button"
            className="mobile-inline-tool"
            aria-label={ui.graphMove || 'Move'}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void runAct('move');
            }}
        >
            <ChromeEmoji emoji="🔄" size={20} className="mobile-inline-tool__ic arborito-emoji-glyph" />
        </button>
    ) : null;

    const trophyBtn = canToggleDiploma ? (
        <button
            type="button"
            className={`mobile-inline-tool mobile-inline-tool--trophy${diplomaOn ? ' mobile-inline-tool--trophy-on' : ''}`}
            aria-label={
                diplomaOn
                    ? ui.graphDiplomaOn || 'Disable achievement'
                    : ui.graphDiplomaOff || 'Enable achievement'
            }
            aria-pressed={diplomaOn}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void runAct('toggle-diploma');
            }}
        >
            <ChromeEmoji emoji="🏆" size={20} className="mobile-inline-tool__ic arborito-emoji-glyph" />
        </button>
    ) : null;

    const deleteBtn =
        canDelete && !omitDelete ? (
            <button
                type="button"
                className={`mobile-inline-tool mobile-inline-tool--danger${delReveal}`}
                aria-label={ui.graphDelete || 'Delete'}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void runAct('delete');
                }}
            >
                <ChromeEmoji emoji="🗑️" size={20} className="mobile-inline-tool__ic arborito-emoji-glyph" />
            </button>
        ) : null;

    return (
        <div className={`mobile-inline-tools-host${hostExtra}`}>
            <div
                className={`mobile-inline-tools${compactClass}`}
                role="group"
                aria-label={ct.toolsGroupAria}
            >
                {moveBtn}
                {trophyBtn}
                {deleteBtn}
            </div>
        </div>
    );
}
