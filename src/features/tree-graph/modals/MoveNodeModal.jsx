import { useTreeGraph } from '../hooks/useTreeGraph.js';
import { useEffect, useMemo, useState } from 'react';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { MODAL_CTA_CANCEL, modalCtaConfirm, modalCtaConfirmFull } from '../../../shared/ui/modal-action-chrome.js';
import { folderDisplayIcon } from '../api/node-property-emojis.js';
import { DockModalShell, ModalCenteredShell } from '../../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';

function collectMoveTargets(root, movingNode) {
    const invalid = new Set();
    const markDesc = (n) => {
        invalid.add(n.id);
        (n.children || []).forEach(markDesc);
    };
    markDesc(movingNode);

    const out = [];
    const walk = (n) => {
        if ((n.type === 'root' || n.type === 'branch') && !invalid.has(n.id)) {
            out.push(n);
        }
        (n.children || []).forEach(walk);
    };
    walk(root);
    return out;
}

function breadcrumbPath(root, target) {
    const labels = [];
    const dfs = (n, stack) => {
        if (String(n.id) === String(target.id)) {
            labels.push(...stack.map((x) => x.name || String(x.id)), n.name || String(n.id));
            return true;
        }
        for (const c of n.children || []) {
            if (dfs(c, [...stack, n])) return true;
        }
        return false;
    };
    dfs(root, []);
    return labels.join(' / ');
}

export function ModalMoveNode() {
    const tree = useTreeGraph();
    const { ui, dismissModal, findNode, alert, startMovePickOnTree, moveNode } = tree;
    const modal = tree.modal;
    const treeRoot = tree.data;
    const moving = modal?.node ? findNode(modal.node.id) : null;
    const [filter, setFilter] = useState('');

    useEffect(() => {
        if (!moving || !treeRoot || moving.type === 'root') {
            dismissModal();
            return;
        }
        const rawTargets = collectMoveTargets(treeRoot, moving);
        if (rawTargets.length === 0) {
            dismissModal();
            queueMicrotask(() =>
                alert(ui.moveNoTargets || 'No valid folder to move into.')
            );
        }
    }, [moving, treeRoot, ui.moveNoTargets]);

    if (!moving || !treeRoot || moving.type === 'root') return null;

    const rawTargets = collectMoveTargets(treeRoot, moving);
    if (rawTargets.length === 0) return null;

    const isMob = shouldShowMobileUI();
    const decorated = rawTargets
        .map((t) => ({ node: t, crumb: breadcrumbPath(treeRoot, t) }))
        .sort((a, b) => a.crumb.localeCompare(b.crumb, undefined, { sensitivity: 'base' }));

    const q = filter.trim().toLowerCase();
    const visible = decorated.filter(({ node: t, crumb }) => {
        if (!q) return true;
        const hay = `${t.name || ''} ${crumb}`.toLowerCase();
        return hay.includes(q);
    });

    const dismissMove = () => dismissModal();

    const onPickTree = () => {
        dismissModal();
        queueMicrotask(() => {
            startMovePickOnTree(moving.id);
        });
    };

    const onSelectTarget = async (id) => {
        dismissModal();
        if (id) await moveNode(moving, id);
    };

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={isMob}
            title={ui.moveChooseParent || 'Move into folder'}
            subtitle={`${moving.icon || ''} ${moving.name || ''}`.trim()}
            titleTruncate
            leadingIcon="📁"
            backTagClass="js-move-back"
            closeTagClass="js-move-x"
            onBack={dismissMove}
            onClose={dismissMove}
        />
    );

    const footer = (
        <div className="arborito-modal-footer arborito-modal-footer--blend flex flex-col gap-2">
            <div className="arborito-action-row arborito-action-row--stack-mobile">
                <button
                    type="button"
                    className={`js-move-pick-tree ${modalCtaConfirmFull('amber')}`}
                    onClick={onPickTree}
                >
                    {ui.movePickOnTreeBtn || 'Choose on tree'}
                </button>
            </div>
            <div className="arborito-action-row">
                <button type="button" className={`js-move-cancel ${MODAL_CTA_CANCEL}`} onClick={dismissMove}>
                    {ui.cancel || 'Cancel'}
                </button>
            </div>
        </div>
    );

    const listBody = (
        <>
            <div className="shrink-0 px-3 pt-3 pb-2 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                <label htmlFor="move-node-filter" className="sr-only">
                    {ui.moveSearchPlaceholder || 'Search folders'}
                </label>
                <input
                    type="search"
                    id="move-node-filter"
                    autoComplete="off"
                    placeholder={ui.moveSearchPlaceholder || 'Search folders…'}
                    className="arborito-input"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 custom-scrollbar" id="move-node-target-list">
                {visible.map(({ node: t, crumb }) => {
                    const title = t.name || t.path || crumb;
                    return (
                        <button
                            key={String(t.id)}
                            type="button"
                            className="move-node-target-btn w-full text-left px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 transition-colors active:scale-[0.99] flex items-start gap-2"
                            onClick={(ev) => {
                                ev.stopPropagation();
                                void onSelectTarget(String(t.id));
                            }}
                        >
                            <ChromeEmoji
                                emoji={folderDisplayIcon(t.icon)}
                                className="arborito-emoji-glyph"
                            />
                            <span className="min-w-0 flex-1 flex flex-col gap-0.5">
                                <span className="text-sm font-bold break-words">{title}</span>
                                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 break-words leading-snug">
                                    {crumb}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </>
    );

    if (isMob) {
        return (
            <div data-arborito-panel="modal-move-node">
                <DockModalShell
                    mobile
                    layout="dock-bottom"
                    hero={hero}
                    footer={footer}
                    shellOpts={{ z: 130, enter: 'fade-fast' }}
                    onBackdropClick={dismissMove}
                >
                    {listBody}
                </DockModalShell>
            </div>
        );
    }

    return (
        <div data-arborito-panel="modal-move-node">
            <ModalCenteredShell
                refKey="modal-move-node"
                layout="centered"
                sizeTier="COMPACT"
                hero={hero}
                footer={footer}
                shellOpts={{ z: 130, enter: 'fade-fast' }}
                onBackdropClick={dismissMove}
            >
                {listBody}
            </ModalCenteredShell>
        </div>
    );
}
