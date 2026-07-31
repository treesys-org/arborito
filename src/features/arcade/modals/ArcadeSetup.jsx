import { useArcade } from '../hooks/useArcade.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Callout } from '../../../shared/ui/Callout.jsx';
import { ListRowEnter, ListRowSkeleton } from '../../../shared/ui/ListRowEnter.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import {
    collectStaticArcadePickerIds,
    getModuleStaticGameReadiness,
    resolveModuleStaticGameReadiness,
    resolveStaticArcadePickerIds,
} from '../../learning/api/quiz-status.js';
import { folderDisplayIcon, FOLDER_DISPLAY_ICON } from '../../tree-graph/api/node-property-emojis.js';

function isBranchLike(n) {
    return n?.type === 'branch' || n?.type === 'root';
}

function getAncestorIds(nodeId, root) {
    const ids = new Set();
    if (!nodeId || !root) return ids;
    let found = false;
    const walk = (n, path) => {
        if (found) return;
        if (String(n.id) === String(nodeId)) {
            path.forEach((p) => ids.add(String(p.id)));
            found = true;
            return;
        }
        for (const c of n.children || []) {
            walk(c, [...path, n]);
            if (found) return;
        }
    };
    walk(root, []);
    return ids;
}

function defaultCollapsedBranchIds(root, selectedNodeId) {
    const collapsed = new Set();
    if (!root) return collapsed;
    const expandIds = getAncestorIds(selectedNodeId, root);
    const walk = (n, depth) => {
        const kids = n.children || [];
        if (kids.length > 0 && isBranchLike(n)) {
            const id = String(n.id);
            if (depth > 0 && !expandIds.has(id) && id !== String(selectedNodeId || '')) {
                collapsed.add(id);
            }
        }
        kids.forEach((c) => walk(c, depth + 1));
    };
    walk(root, 0);
    return collapsed;
}

function getFlatNodes(data, filterText) {
    const root = data;
    if (!root) return [];
    const nodes = [];
    const q = String(filterText || '').trim().toLowerCase();
    const traverse = (n, depth) => {
        if (!q || String(n.name || '').toLowerCase().includes(q)) {
            nodes.push({ ...n, depth, hasKids: false, isCollapsed: false });
        }
        (n.children || []).forEach((c) => traverse(c, depth + 1));
    };
    traverse(root, 0);
    return nodes;
}

function getTreeVisibleNodes(data, collapsedIds) {
    const root = data;
    if (!root) return [];
    const nodes = [];
    const walk = (n, depth) => {
        const kids = n.children || [];
        const hasKids = kids.length > 0 && isBranchLike(n);
        const id = String(n.id);
        const isCollapsed = hasKids && collapsedIds.has(id);
        nodes.push({ ...n, depth, hasKids, isCollapsed });
        if (hasKids && !isCollapsed) {
            kids.forEach((c) => walk(c, depth + 1));
        }
    };
    walk(root, 0);
    return nodes;
}

function resolveNodeIcon(n, isLeaf, isExam) {
    let icon = n.icon;
    if (!icon) icon = isLeaf ? '📄' : isExam ? '⚔️' : FOLDER_DISPLAY_ICON;
    else if (!isLeaf && !isExam) icon = folderDisplayIcon(icon);
    return icon;
}

export function ArcadeSetup({
    ui,
    isPreparingContext,
    selectedNodeId,
    aiMode,
    filterText,
    onFilterChange,
    onSelectNode,
    onSetAiMode,
    onStartGame,
}) {
    const { data, arcadeActions } = useArcade();
    const { findNode, loadNodeContent } = arcadeActions;

    const [localFilter, setLocalFilter] = useState(filterText || '');
    const [pickerOpen, setPickerOpen] = useState(true);
    const [pickerReady, setPickerReady] = useState(false);
    const [collapsedBranchIds, setCollapsedBranchIds] = useState(() => new Set());
    const [probedReadiness, setProbedReadiness] = useState(null);
    const [probeBusy, setProbeBusy] = useState(false);
    /** After lazy bodies load; null = use sync collect only. */
    const [staticPickerRev, setStaticPickerRev] = useState(0);
    const [staticPickerBusy, setStaticPickerBusy] = useState(false);
    const selectedRowRef = useRef(null);

    useEffect(() => {
        setLocalFilter(filterText || '');
    }, [filterText]);

    useEffect(() => {
        if (isPreparingContext || pickerReady) return;
        const root = data;
        setCollapsedBranchIds(defaultCollapsedBranchIds(root, selectedNodeId));
        setPickerOpen(!selectedNodeId);
        setPickerReady(true);
    }, [isPreparingContext, selectedNodeId, pickerReady, data]);

    useEffect(() => {
        if (!pickerOpen || !selectedNodeId || isPreparingContext) return;
        const row = selectedRowRef.current;
        if (!row) return;
        const id = window.requestAnimationFrame(() => {
            row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
        return () => window.cancelAnimationFrame(id);
    }, [pickerOpen, selectedNodeId, isPreparingContext, localFilter, collapsedBranchIds]);

    /* Static mode: materialize lazy lesson bodies so quiz-less leaves can be hidden. */
    useEffect(() => {
        if (aiMode !== 'static' || isPreparingContext || !data) {
            setStaticPickerBusy(false);
            return;
        }
        const sync = collectStaticArcadePickerIds(data);
        if (sync.pendingLeafCount === 0) {
            setStaticPickerBusy(false);
            return;
        }
        let cancelled = false;
        setStaticPickerBusy(true);
        void resolveStaticArcadePickerIds(data, {
            loadContent: loadNodeContent,
            maxProbe: 48,
        }).then(() => {
            if (cancelled) return;
            setStaticPickerRev((n) => n + 1);
            setStaticPickerBusy(false);
        });
        return () => {
            cancelled = true;
        };
    }, [aiMode, isPreparingContext, loadNodeContent, data]);

    const filterActive = !!String(localFilter || '').trim();
    const isStatic = aiMode === 'static';
    const isDynamic = aiMode === 'dynamic';
    const staticPickerSnapshot = useMemo(
        () => (isStatic && data ? collectStaticArcadePickerIds(data) : null),
        [isStatic, data, staticPickerRev]
    );
    const staticPickerIds = staticPickerSnapshot?.visibleIds ?? null;

    /* Drop selection when static picker hides the current node (e.g. Intro without quiz).
     * Pending lazy leaves stay in visibleIds — if missing here, the node is definitively unplayable. */
    useEffect(() => {
        if (aiMode !== 'static' || isPreparingContext) return;
        if (!selectedNodeId || !data) return;
        const { visibleIds } = collectStaticArcadePickerIds(data);
        if (visibleIds.has(String(selectedNodeId))) return;
        onSelectNode(null);
        setPickerOpen(true);
    }, [aiMode, isPreparingContext, selectedNodeId, staticPickerRev, data, onSelectNode]);

    /* Network trees keep lesson bodies lazy — probe chunks before claiming “no quiz”. */
    useEffect(() => {
        if (aiMode !== 'static' || !selectedNodeId || isPreparingContext) {
            setProbedReadiness(null);
            setProbeBusy(false);
            return;
        }
        const node = findNode(selectedNodeId);
        if (!node) {
            setProbedReadiness(null);
            return;
        }
        const sync = getModuleStaticGameReadiness(node);
        if (sync.staticReady || !sync.pendingLazy) {
            setProbedReadiness(sync);
            setProbeBusy(false);
            return;
        }
        let cancelled = false;
        setProbeBusy(true);
        void resolveModuleStaticGameReadiness(node, {
            loadContent: loadNodeContent,
            maxProbe: 16,
        }).then((stats) => {
            if (!cancelled) {
                setProbedReadiness(stats);
                setProbeBusy(false);
                setStaticPickerRev((n) => n + 1);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [aiMode, selectedNodeId, isPreparingContext, findNode, loadNodeContent, data]);

    const toggleBranch = useCallback((branchId) => {
        const id = String(branchId);
        setCollapsedBranchIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    if (isPreparingContext) {
        return (
            <div
                className="flex flex-1 flex-col min-h-0 px-1 py-2"
                role="status"
                aria-live="polite"
                aria-busy="true"
                aria-label={ui.loading || 'Loading…'}
            >
                <ListRowSkeleton count={4} variant="compact" />
            </div>
        );
    }

    const rawVisibleNodes = filterActive
        ? getFlatNodes(data, localFilter).slice(0, 500)
        : getTreeVisibleNodes(data, collapsedBranchIds).slice(0, 500);
    const visibleNodes =
        isStatic && staticPickerIds
            ? rawVisibleNodes.filter((n) => staticPickerIds.has(String(n.id)))
            : rawVisibleNodes;
    const selectedNode = selectedNodeId ? findNode(selectedNodeId) : null;
    const syncReadiness = selectedNode ? getModuleStaticGameReadiness(selectedNode) : null;
    const moduleReadiness =
        probedReadiness && selectedNode && String(selectedNodeId || '')
            ? probedReadiness
            : syncReadiness;
    const staticPickerEmpty =
        isStatic && !staticPickerBusy && visibleNodes.length === 0 && !filterActive;
    const staticPickerEmptyFilter =
        isStatic && !staticPickerBusy && visibleNodes.length === 0 && filterActive;
    const awaitingLazyProbe =
        isStatic && !!syncReadiness?.pendingLazy && !syncReadiness?.staticReady && (probeBusy || !probedReadiness);
    const staticBlocked =
        isStatic &&
        moduleReadiness &&
        moduleReadiness.totalLeaves > 0 &&
        !moduleReadiness.staticReady &&
        !awaitingLazyProbe &&
        !moduleReadiness.pendingLazy;
    const staticReadyHint =
        isStatic && moduleReadiness && moduleReadiness.staticReady
            ? (ui.arcadeModuleStaticReady || '{n} lesson(s) with questionnaire ready for static play.').replace(
                  '{n}',
                  String(moduleReadiness.withCompleteQuiz)
              )
            : '';
    const staticWarnHint = staticBlocked
        ? ui.arcadeModuleNoQuizWarn ||
          'No complete lesson questionnaire in this module yet. Add questionnaires to lessons or use dynamic mode.'
        : '';
    const scopeSectionLbl = ui.arcadePlayScopeSection || 'Part of the course for this game';
    const scopeLeadLbl = ui.arcadePlayScopeLead || 'The game will use content from:';
    const scopeTapLbl = ui.arcadePlayScopeTap || 'Tap to choose another branch or lesson';
    const pickScopeAria = (ui.arcadePickScopeAria || 'Change course section; currently: {name}').replace(
        '{name}',
        selectedNode?.name || ''
    );
    const startScopeLine = selectedNode
        ? (ui.arcadeStartScope || 'Practicing: {name}').replace('{name}', selectedNode.name || '')
        : '';

    const handleFilterChange = (value) => {
        setLocalFilter(value);
        onFilterChange(value);
        if (String(value || '').trim()) setPickerOpen(true);
    };

    const handleSelectNode = (id) => {
        onSelectNode(id);
        if (!filterActive) {
            const root = data;
            setCollapsedBranchIds(defaultCollapsedBranchIds(root, id));
        }
        setPickerOpen(false);
    };

    const renderPickerRows = () =>
        visibleNodes.map((n, idx) => {
            const isSelected = String(selectedNodeId || '') === String(n.id);
            const isLeaf = n.type === 'leaf';
            const isExam = n.type === 'exam';
            const icon = resolveNodeIcon(n, isLeaf, isExam);

            let typeBadgeClass = 'arborito-pill arborito-pill--xs arborito-pill--slate';
            let typeBadgeLabel = ui.tagModule;
            if (isLeaf) {
                typeBadgeClass = 'arborito-pill arborito-pill--xs arborito-pill--purple';
                typeBadgeLabel = ui.tagLesson;
            }
            if (isExam) {
                typeBadgeClass = 'arborito-pill arborito-pill--xs arborito-pill--red';
                typeBadgeLabel = ui.tagExam;
            }

            const nodeReadiness =
                !isExam && (n.type === 'branch' || n.type === 'root' || n.type === 'leaf')
                    ? getModuleStaticGameReadiness(n)
                    : null;
            const showGameBadge = isStatic && nodeReadiness && nodeReadiness.staticReady;
            const rowClass = ['arborito-picker-row', isSelected ? 'is-selected' : ''].filter(Boolean).join(' ');

            return (
                <ListRowEnter key={n.id} index={idx}>
                <div
                    className="arborito-arcade-setup__row"
                    style={{ paddingLeft: `${Math.min(n.depth, 12) * 0.85 + 0.35}rem` }}
                    ref={isSelected ? selectedRowRef : undefined}
                >
                    {n.hasKids ? (
                        <button
                            type="button"
                            className="arborito-arcade-setup__fold"
                            aria-expanded={n.isCollapsed ? 'false' : 'true'}
                            aria-label={n.isCollapsed ? ui.arcadeTreeExpand : ui.arcadeTreeCollapse}
                            onClick={() => toggleBranch(n.id)}
                        >
                            {n.isCollapsed ? '▸' : '▾'}
                        </button>
                    ) : (
                        <span className="arborito-arcade-setup__fold arborito-arcade-setup__fold--spacer" aria-hidden="true" />
                    )}
                    <button
                        type="button"
                        className={rowClass}
                        disabled={isExam}
                        onClick={() => !isExam && handleSelectNode(n.id)}
                    >
                        <ChromeEmoji emoji={icon} size={20} className="arborito-emoji-glyph opacity-70" />
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <p className="font-bold truncate leading-tight m-0">{n.name}</p>
                                <span className={typeBadgeClass}>{typeBadgeLabel}</span>
                                {showGameBadge ? (
                                    <span
                                        className="arborito-pill arborito-pill--xs arborito-pill--emerald shrink-0"
                                        title={
                                            ui.arcadeNodeGameReadyTooltip ||
                                            'Questionnaire ready for static games'
                                        }
                                    >
                                        🎮
                                    </span>
                                ) : null}
                            </div>
                        </div>
                        {isSelected ? <span className="ml-auto font-bold">✔</span> : null}
                    </button>
                </div>
                </ListRowEnter>
            );
        });

    return (
        <div className="arborito-arcade-setup">
            <div className="arborito-arcade-setup__controls">
                <div className="mb-4">
                    <label className="arborito-eyebrow block mb-2">{ui.arcadeAiModeLabel || 'Game Mode'}</label>
                    <div className="arborito-seg-track arborito-seg-track--wide" role="group">
                        <button
                            type="button"
                            className={`arborito-seg-btn transition-all ${isStatic ? 'arborito-seg-btn--active-warn' : ''}`}
                            onClick={() => onSetAiMode('static')}
                        >
                            <span className="mr-1">⚡</span>
                            {ui.arcadeAiModeStatic || 'Static'}
                        </button>
                        <button
                            type="button"
                            className={`arborito-seg-btn transition-all ${isDynamic ? 'arborito-seg-btn--active-accent' : ''}`}
                            onClick={() => onSetAiMode('dynamic')}
                        >
                            <span className="mr-1">🧠</span>
                            {ui.arcadeAiModeDynamic || 'Dynamic AI'}
                        </button>
                    </div>
                    <p className="text-[10px] arborito-text-muted mt-1.5 leading-relaxed">
                        {isStatic
                            ? ui.arcadeAiModeStaticDesc ||
                              'Fast & private. Uses lesson questionnaires only, no AI required.'
                            : ui.arcadeAiModeDynamicDesc ||
                              'Optional on-device AI enhances content. Requires consent & download.'}
                    </p>
                    {isStatic ? (
                        <p className="text-[10px] arborito-text-muted mt-1 leading-relaxed">
                            {ui.arcadeStaticPickerHint ||
                                'Only lessons with a complete questionnaire appear below.'}
                        </p>
                    ) : null}
                    {staticReadyHint ? (
                        <Callout tone="emerald" size="sm" inline extraClass="mt-2 m-0" body={staticReadyHint} />
                    ) : null}
                    {staticWarnHint ? (
                        <Callout tone="rose" size="sm" inline extraClass="mt-2 m-0" body={staticWarnHint} />
                    ) : null}
                    {isDynamic ? (
                        <Callout
                            tone="amber"
                            size="sm"
                            inline
                            extraClass="mt-2 m-0"
                            body={ui.arcadeAiExperimentalDisclaimer || ui.sageExperimentalDisclaimer || ''}
                        />
                    ) : null}
                </div>

                <label className="arborito-eyebrow block mb-2">
                    {pickerOpen || !selectedNode ? ui.arcadeSelectModule : scopeSectionLbl}
                </label>

                {selectedNode && !pickerOpen ? (
                    <button
                        type="button"
                        className="arborito-arcade-setup__scope mb-2"
                        aria-label={pickScopeAria}
                        onClick={() => setPickerOpen(true)}
                    >
                        <p className="arborito-arcade-setup__scope-lead m-0">{scopeLeadLbl}</p>
                        <div className="arborito-arcade-setup__scope-main">
                            <ChromeEmoji
                                emoji={resolveNodeIcon(
                                    selectedNode,
                                    selectedNode.type === 'leaf',
                                    selectedNode.type === 'exam'
                                )}
                                size={22}
                                className="arborito-emoji-glyph shrink-0"
                            />
                            <span className="arborito-arcade-setup__scope-name">{selectedNode.name}</span>
                            <span className="arborito-arcade-setup__scope-chev" aria-hidden="true">
                                ▼
                            </span>
                        </div>
                        <p className="arborito-arcade-setup__scope-tap m-0">{scopeTapLbl}</p>
                    </button>
                ) : null}

                {pickerOpen ? (
                    <>
                        <div className="arborito-field-wrap mb-2">
                            <span className="arborito-search-icon">🔍</span>
                            <input
                                id="inp-filter-context"
                                type="text"
                                placeholder={ui.searchPlaceholder || ''}
                                className="arborito-input arborito-input--search font-bold"
                                value={localFilter}
                                autoComplete="off"
                                onChange={(e) => handleFilterChange(e.target.value)}
                            />
                        </div>
                        <div className="arborito-picker-panel arborito-arcade-setup__picker custom-scrollbar">
                            {staticPickerBusy && visibleNodes.length === 0 ? (
                                <div
                                    className="flex flex-col gap-2 p-3"
                                    role="status"
                                    aria-live="polite"
                                    aria-busy="true"
                                    aria-label={
                                        ui.arcadeStaticPickerLoading ||
                                        'Looking for lessons with questionnaires…'
                                    }
                                >
                                    <ListRowSkeleton count={3} variant="compact" />
                                    <p className="text-xs arborito-text-muted text-center m-0">
                                        {ui.arcadeStaticPickerLoading ||
                                            'Looking for lessons with questionnaires…'}
                                    </p>
                                </div>
                            ) : null}
                            {!(staticPickerBusy && visibleNodes.length === 0) ? renderPickerRows() : null}
                            {staticPickerEmpty ? (
                                <div className="p-4 text-center text-xs arborito-text-muted">
                                    {ui.arcadeStaticPickerEmpty ||
                                        'No lessons with a complete questionnaire yet. Add one in construction mode, or switch to dynamic mode.'}
                                </div>
                            ) : null}
                            {staticPickerEmptyFilter || (!isStatic && visibleNodes.length === 0) ? (
                                <div className="p-4 text-center text-xs arborito-text-muted">
                                    {ui.arcadeNoMatchingContent}
                                </div>
                            ) : null}
                        </div>
                    </>
                ) : null}
            </div>

            <div className="arborito-arcade-setup__footer">
                <button
                    type="button"
                    className="w-full py-3.5 arborito-cta-amber font-black text-lg rounded-2xl shadow-xl active:scale-95 transition-all flex flex-col items-center justify-center gap-1 disabled:opacity-50 min-h-[3.25rem]"
                    disabled={!selectedNodeId || staticBlocked || awaitingLazyProbe || (isStatic && staticPickerBusy && !moduleReadiness?.staticReady)}
                    onClick={onStartGame}
                >
                    <span className="flex items-center justify-center gap-2 leading-none">
                        <span aria-hidden="true">🚀</span>
                        <span>{ui.arcadeStart}</span>
                    </span>
                    {startScopeLine ? (
                        <span className="arborito-arcade-setup__start-scope">{startScopeLine}</span>
                    ) : null}
                </button>
                {isDynamic ? (
                    <p className="text-[10px] text-center arborito-text-muted mt-2 flex items-center justify-center gap-1.5">
                        <ChromeEmoji emoji="⚠️" size={14} aria-hidden="true" />
                        <span>{ui.arcadeDisclaimer || 'AI-generated content may vary.'}</span>
                    </p>
                ) : null}
            </div>
        </div>
    );
}
