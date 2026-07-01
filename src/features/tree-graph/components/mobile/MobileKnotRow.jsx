import { useEffect, useRef } from 'react';
import { useTreeGraph } from '../../hooks/useTreeGraph.js';
import { fileSystem } from '../../../backup-export/api/filesystem.js';
import {
    canConstructionNavigateToPathIndex,
    openConstructionEditPickFromRoot,
} from '../../../editor/api/construction-enter-flow.js';
import { getMobilePath, getSelectedNodeId } from '../../api/graph-ui-accessors.js';
import { folderDisplayIcon } from '../../api/node-property-emojis.js';
import { curriculumTreeDisplayName } from '../../../version-updates/api/version-switch-logic.js';
import { ARBORITO_ROOT_LOGO_URL } from '../../../../shared/ui/arborito-logo-root.js';
import { ChromeEmoji } from '../../../../app/components/ChromeEmoji.jsx';
import { MobileInlineTools } from './MobileInlineTools.jsx';

function knotStateClass(node, harvested, tree) {
    const isHarvested = harvested.find((h) => String(h.id) === String(node.id));
    const isCompleted = tree.isCompleted && tree.isCompleted(node.id);
    if (isHarvested) return ' state-harvested';
    if (node.isEmpty) return ' state-empty';
    if (isCompleted) return ' state-completed';
    return '';
}

function isVersionSwitcherTarget(target) {
    if (!target || typeof target.closest !== 'function') return false;
    return !!target.closest(
        '#arborito-curriculum-switcher-btn, #arborito-tree-switcher-btn, #arborito-tree-switcher-panel, #arborito-tree-switcher-backdrop, .arborito-tree-switcher-chip, .arborito-tree-switcher-host, .arborito-curriculum-switcher-host, #arborito-version-toggle, #arborito-version-dropdown-panel, #arborito-version-dropdown-backdrop, .arborito-version-archive-item, #arborito-version-live, .mobile-panel-version-slot, .arborito-branch-panel-version-chip'
    );
}

function navigateToPathIndex(tree, constructionMode, index) {
    const path = getMobilePath();
    if (constructionMode && !canConstructionNavigateToPathIndex({ mobilePath: path }, index)) return;
    tree.navigateMobilePath(path.slice(0, index + 1));
}

function selectConstructionNode(tree, node) {
    tree.selectMobileNode(node.id);
    tree.setGraphMoveMode(false);
    tree.bumpGraphUiRevision();
}

/** Single trunk knot (left column). */
export function MobileKnotRow({ node, index, pathNodes, harvested, isActive, tone, pulseGrowth }) {
    const tree = useTreeGraph();
    const { ui, userStore, graphUi, constructionMode } = tree;
    const knotRef = useRef(null);
    const isRoot = index === 0 && node.type === 'root';
    const isRootClover =
        isRoot &&
        constructionMode &&
        fileSystem.features.canWrite &&
        fileSystem.isLocalComposedTree();

    useEffect(() => {
        if (!pulseGrowth || !knotRef.current) return undefined;
        let shellTourPending = false;
        try {
            shellTourPending = localStorage.getItem('arborito-ui-tour-shell-pending-v1') === 'true';
        } catch {
            /* ignore */
        }
        if (shellTourPending) return undefined;
        const kn = knotRef.current;
        let timer;
        const raf = requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                kn.classList.add('mobile-knot--growth-burst');
                timer = window.setTimeout(() => kn.classList.remove('mobile-knot--growth-burst'), 1150);
            });
        });
        return () => {
            cancelAnimationFrame(raf);
            if (timer) clearTimeout(timer);
        };
    }, [pulseGrowth]);

    const stateClass = !isActive ? knotStateClass(node, harvested, tree) : '';

    const onKnotClick = () => {
        if (isRootClover) {
            openConstructionEditPickFromRoot();
            return;
        }
        if (!isActive) {
            navigateToPathIndex(tree, constructionMode, index);
            return;
        }
        if (constructionMode && fileSystem.features.canWrite) {
            selectConstructionNode(tree, node);
        }
    };

    return (
        <div
            className={`mobile-knot-wrapper${isRootClover ? ' mobile-knot-wrapper--construction-root-pick' : ''}`}
            onClick={isRootClover ? onKnotClick : undefined}
            role={isRootClover ? 'button' : undefined}
            tabIndex={isRootClover ? 0 : undefined}
            onKeyDown={
                isRootClover
                    ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onKnotClick();
                          }
                      }
                    : undefined
            }
        >
            <div
                ref={knotRef}
                className={`mobile-knot mobile-knot-tone-${tone}${isActive ? ' active' : ''}${stateClass}${
                    isRoot ? ' mobile-knot--svg' : ''
                }`}
                {...(isRoot ? { 'data-arbor-tour': 'graph-root' } : {})}
                onClick={!isRootClover ? onKnotClick : undefined}
                role={!isRootClover ? 'button' : undefined}
                tabIndex={!isRootClover ? 0 : undefined}
                onKeyDown={
                    !isRootClover
                        ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  onKnotClick();
                              }
                          }
                        : undefined
                }
            >
                {isRoot ? (
                    <img
                        src={ARBORITO_ROOT_LOGO_URL}
                        className="mobile-knot__svg arborito-root-knot-mark"
                        alt=""
                        aria-hidden="true"
                        draggable={false}
                        style={{
                            display: 'block',
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                            objectPosition: 'center bottom',
                        }}
                    />
                ) : (
                    <ChromeEmoji
                        emoji={folderDisplayIcon(node.icon)}
                        size={24}
                        className="arborito-emoji-glyph"
                    />
                )}
            </div>
        </div>
    );
}

/** Path label row in the right column. */
export function MobilePathLabelRow({ node, index, pathNodes }) {
    const tree = useTreeGraph();
    const { ui, viewMode, activeSource, constructionMode } = tree;
    const isActive = index === pathNodes.length - 1;
    const showRootVersion =
        index === 0 && viewMode === 'explore' && activeSource;
    const suppressActiveTitle = isActive && node.type !== 'root';
    const rowTitle = suppressActiveTitle
        ? ''
        : node.type === 'root'
          ? curriculumTreeDisplayName(ui)
          : node.name || '';

    const listedKids = Array.isArray(node.children) ? node.children : [];
    const deferFolderToolsToPanel =
        listedKids.length > 0 || !!node.hasUnloadedChildren || !!constructionMode;
    const showInlineTools =
        isActive &&
        constructionMode &&
        fileSystem.features.canWrite &&
        !deferFolderToolsToPanel;

    const onRowClick = (ev) => {
        if (isVersionSwitcherTarget(ev?.target)) return;
        if (!isActive) {
            navigateToPathIndex(tree, constructionMode, index);
            return;
        }
        if (constructionMode && fileSystem.features.canWrite) {
            selectConstructionNode(tree, node);
        }
    };

    const rowClass = `mobile-label-row ${isActive ? 'is-active' : ''}${
        showRootVersion || suppressActiveTitle ? ' mobile-label-row--suppress-title' : ''
    }`;

    return (
        <div
            className={rowClass}
            onClick={onRowClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onRowClick(e);
                }
            }}
        >
            <span className="mobile-label-text" title={rowTitle}>
                {rowTitle}
            </span>
            {showInlineTools ? (
                <MobileInlineTools node={node} compact revealDelete={false} />
            ) : null}
        </div>
    );
}
