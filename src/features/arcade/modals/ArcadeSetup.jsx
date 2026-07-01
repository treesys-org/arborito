import { useArcade } from '../hooks/useArcade.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Callout } from '../../../shared/ui/Callout.jsx';
import { LoadingBrand } from '../../../shared/ui/Loading.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { getModuleStaticGameReadiness } from '../../learning/api/quiz-status.js';
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
    const { findNode } = arcadeActions;

    const [localFilter, setLocalFilter] = useState(filterText || '');
    const [pickerOpen, setPickerOpen] = useState(true);
    const [pickerReady, setPickerReady] = useState(false);
    const [collapsedBranchIds, setCollapsedBranchIds] = useState(() => new Set());
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
                className="flex flex-1 flex-col items-center justify-center gap-3 min-h-0"
                role="status"
                aria-live="polite"
                aria-busy="true"
            >
                <LoadingBrand label="" size="boot" tone="sage" extraClass="arborito-loading-brand--compact" />
            </div>
        );
    }

    const filterActive = !!String(localFilter || '').trim();
    const visibleNodes = filterActive
        ? getFlatNodes(data, localFilter).slice(0, 500)
        : getTreeVisibleNodes(data, collapsedBranchIds).slice(0, 500);
    const selectedNode = selectedNodeId ? findNode(selectedNodeId) : null;
    const moduleReadiness = selectedNode ? getModuleStaticGameReadiness(selectedNode) : null;
    const isStatic = aiMode === 'static';
    const isDynamic = aiMode === 'dynamic';
    const staticBlocked =
        isStatic && moduleReadiness && moduleReadiness.totalLeaves > 0 && !moduleReadiness.staticReady;
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
        visibleNodes.map((n) => {
            const isSelected = selectedNodeId === n.id;
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
                <div
                    key={n.id}
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
                              'Fast & private. Uses lesson questionnaires only — no AI required.'
                            : ui.arcadeAiModeDynamicDesc ||
                              'Optional on-device AI enhances content. Requires consent & download.'}
                    </p>
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
                            {renderPickerRows()}
                            {visibleNodes.length === 0 ? (
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
                    disabled={!selectedNodeId || staticBlocked}
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
                    <p className="text-[10px] text-center arborito-text-muted mt-2">{ui.arcadeDisclaimer}</p>
                ) : null}
            </div>
        </div>
    );
}
