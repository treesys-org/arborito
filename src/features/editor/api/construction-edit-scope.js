import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { fileSystem } from '../../backup-export/api/filesystem.js';
import { parseNostrTreeUrl } from '../../nostr/api/nostr-refs.js';
import { resolveTreeProgressScope } from '../../trees/api/compose-tree-graph.js';
import { curriculumTreeDisplayName } from '../../version-updates/api/version-switch-logic.js';

/**
 * @typedef {'tree_playlist' | 'branch_course' | 'map_folder' | 'readonly' | 'governance_only' | 'hidden'} ConstructionEditScopeKind
 */

/**
 * @param {Record<string, string>} ui
 * @param {object} [opts]
 * @param {object|null} [opts.current] — active map panel node
 * @param {string[]} [opts.mobilePath]
 * @param {object|null} [opts.rootData] — graph root for composed scope
 * @param {boolean} [opts.isContributor]
 * @param {boolean} [opts.isNetworkTreeOwner]
 * @param {boolean} [opts.isLocalBranch]
 * @param {boolean} [opts.isLocalComposed]
 * @returns {{
 *   scope: ConstructionEditScopeKind,
 *   badgeLabel: string,
 *   hint: string | null,
 *   placeTitle: string,
 *   placeContext: string | null,
 *   context: {
 *     programLabel: string,
 *     programName: string,
 *     moduleLabel: string,
 *     moduleName: string | null,
 *     hint: string | null,
 *   },
 *   showScopeChrome: boolean,
 *   metadata: {
 *     showPresentationChip: boolean,
 *     presentationLabel: string,
 *     showIdentityEdit: boolean,
 *   },
 *   actions: {
 *     showPublish: boolean,
 *     showAbout: boolean,
 *     aboutKind: 'branch' | 'tree' | null,
 *     aboutLabel: string,
 *     folderNote: string | null,
 *   },
 *   dock: {
 *     canWriteMap: boolean,
 *     showGovernance: boolean,
 *     showPublish: boolean,
 *     showFork: boolean,
 *     readonlyMessage: string | null,
 *     hidePublishInMore?: boolean,
 *   },
 * }}
 */
export function resolveConstructionEditScope(ui, opts = {}) {
    const current = opts.current || null;
    const mobilePath = Array.isArray(opts.mobilePath) ? opts.mobilePath : [];
    const mobilePathLen = mobilePath.length || 1;
    const rootData = opts.rootData || store.state.rawGraphData || null;
    const isContributor = !!opts.isContributor;
    const features = fileSystem.features;
    const canWrite = !!features.canWrite;
    const hasGovernance = !!features.hasGovernance;
    const networkRole =
        typeof store.getMyTreeNetworkRole === 'function' ? store.getMyTreeNetworkRole() : null;
    const lessonOpen = !!(store.state.selectedNode || store.state.previewNode);
    const hasGraph = !!store.state.rawGraphData;
    const activeSource = store.state.activeSource;
    const sourceName = String(activeSource?.name || '').trim();
    const isLocalBranch = opts.isLocalBranch ?? fileSystem.isLocalBranch();
    const isLocalComposed = opts.isLocalComposed ?? fileSystem.isLocalComposedTree();
    const isNetworkTreeOwner = !!opts.isNetworkTreeOwner;
    const canShowPublish =
        hasGraph && (isLocalBranch || isLocalComposed || isNetworkTreeOwner);

    const presentationLabel =
        ui.constructionPresentationChip || ui.constructionPresentationTitle || 'Public description';

    const dockBase = {
        canWriteMap: isContributor && canWrite,
        showGovernance: isContributor && (canWrite || hasGovernance),
        showPublish: false,
        showFork: false,
        readonlyMessage: null,
    };

    if (lessonOpen || !hasGraph) {
        return {
            scope: 'hidden',
            badgeLabel: '',
            hint: null,
            placeTitle: '',
            placeContext: null,
            context: emptyConstructionContext(ui),
            showScopeChrome: false,
            metadata: {
                showPresentationChip: false,
                presentationLabel,
                showIdentityEdit: false,
            },
            actions: emptyScopeActions(),
            dock: dockBase,
        };
    }

    if (!isContributor) {
        return {
            scope: 'readonly',
            badgeLabel: '',
            hint: null,
            placeTitle: resolvePlaceTitle(ui, current, sourceName),
            placeContext: null,
            context: emptyConstructionContext(ui),
            showScopeChrome: false,
            metadata: {
                showPresentationChip: false,
                presentationLabel,
                showIdentityEdit: false,
            },
            actions: emptyScopeActions(),
            dock: {
                ...dockBase,
                showFork: true,
                readonlyMessage:
                    ui.constructionNoEditAccess || 'You do not have edit access to this course.',
            },
        };
    }

    if (networkRole === 'proposer' && !canWrite) {
        return {
            scope: 'governance_only',
            badgeLabel: ui.constructionScopeBranch || 'Branch',
            hint:
                ui.constructionSessionProposerHint ||
                ui.constructionHintGovernanceOnly ||
                'Use Team to collaborate',
            placeTitle: resolvePlaceTitle(ui, current, sourceName),
            placeContext: resolveComposedTreeContextName(ui),
            context: buildConstructionContext(ui, 'governance_only', current, mobilePath, rootData, sourceName),
            showScopeChrome: true,
            metadata: {
                showPresentationChip: false,
                presentationLabel,
                showIdentityEdit: false,
            },
            actions: emptyScopeActions(),
            dock: {
                ...dockBase,
                canWriteMap: false,
                showGovernance: true,
                showPublish: false,
            },
        };
    }

    const scopeKind = resolveScopeKind(current, mobilePath, rootData);
    const placeTitle = resolvePlaceTitle(ui, current, sourceName, scopeKind);
    const placeContext = resolvePlaceContext(ui, scopeKind);
    const badgeLabel = resolveBadgeLabel(ui, scopeKind);
    const actions = resolveScopeActions(ui, scopeKind, {
        canWrite,
        mobilePathLen,
        canShowPublish: isContributor && canShowPublish,
        current,
        mobilePath,
        rootData,
    });

    const context = buildConstructionContext(ui, scopeKind, current, mobilePath, rootData, sourceName);

    return {
        scope: scopeKind,
        badgeLabel,
        hint: context.hint || actions.folderNote,
        placeTitle,
        placeContext,
        context,
        showScopeChrome: false,
        metadata: {
            showPresentationChip: false,
            presentationLabel,
            showIdentityEdit: false,
        },
        actions,
        dock: {
            ...dockBase,
            showPublish: isContributor && canShowPublish,
        },
    };
}

function emptyScopeActions() {
    return {
        showPublish: false,
        showAbout: false,
        aboutKind: null,
        aboutLabel: '',
        publishLabel: '',
        folderNote: null,
    };
}

function resolveScopeActions(ui, scopeKind, opts) {
    const { canWrite, canShowPublish, current, mobilePath, rootData } = opts;
    if (!canWrite) return emptyScopeActions();

    if (scopeKind === 'map_folder') {
        return {
            showPublish: false,
            showAbout: false,
            aboutKind: null,
            aboutLabel: '',
            publishLabel: '',
            folderNote: ui.constructionHintMapFolder || 'Name and icon in the header',
        };
    }

    if (scopeKind === 'tree_playlist') {
        return {
            showPublish: canShowPublish,
            showAbout: false,
            aboutKind: null,
            aboutLabel:
                ui.constructionScopeTreeInfoLabel ||
                ui.treePresentationTitle ||
                'About this tree',
            publishLabel: ui.publicTreePublishComposedLabel || ui.publicTreeDockLabel || 'Publish tree',
            folderNote: null,
        };
    }

    return {
        showPublish: canShowPublish,
        showAbout: false,
        aboutKind: null,
        aboutLabel:
            ui.constructionScopeBranchInfoLabel ||
            ui.constructionScopeBranchAboutLabel ||
            'Branch info',
        publishLabel:
            ui.publicTreePublishBranchDockLabel ||
            ui.publicTreePublishBranchLabel ||
            'Publish branch',
        folderNote: null,
    };
}

/**
 * @param {object|null} current
 * @param {string[]} mobilePath
 * @param {object|null} rootData
 * @returns {ConstructionEditScopeKind}
 */
function resolveScopeKind(current, mobilePath, rootData) {
    if (current?._composedVirtualRoot) return 'tree_playlist';

    const treeContext = store.state.treeContext;
    if (treeContext?.kind === 'composed-tree') {
        const progress = resolveTreeProgressScope(treeContext, mobilePath, rootData);
        if (progress.scope === 'tree' && mobilePath.length <= 1) return 'tree_playlist';
        if (current?._composedWrapper) return 'branch_course';
    }

    if (mobilePath.length > 1) return 'map_folder';

    return 'branch_course';
}

function resolvePlaceTitle(ui, current, sourceName, scopeKind) {
    if (scopeKind === 'tree_playlist') {
        const treeId = fileSystem.composedTreeId();
        const entry = treeId ? store.userStore?.getTree?.(treeId) : null;
        return String(entry?.name || sourceName || ui.constructionSessionTreeFallback || 'Tree').trim();
    }
    if (current?.type === 'root') {
        return curriculumTreeDisplayName(ui) || sourceName || ui.constructionSessionCourseFallback || 'Course';
    }
    const name = String(current?.name || '').trim();
    if (name) return name;
    return sourceName || ui.constructionSessionCourseFallback || 'Course';
}

function resolveComposedTreeContextName(ui) {
    if (!fileSystem.isLocalComposedTree()) return null;
    const treeId = fileSystem.composedTreeId();
    const entry = treeId ? store.userStore?.getTree?.(treeId) : null;
    const treeName = String(entry?.name || store.state.activeSource?.name || '').trim();
    if (!treeName || !store.state.treeContext?.activeBranchRefId) return null;
    return treeName;
}

function resolvePlaceContext(ui, scopeKind) {
    if (scopeKind !== 'branch_course') return null;
    return resolveComposedTreeContextName(ui);
}

function resolveBadgeLabel(ui, scopeKind) {
    switch (scopeKind) {
        case 'tree_playlist':
            return ui.constructionScopeProgram || ui.constructionScopeTree || 'Program';
        case 'map_folder':
            return ui.constructionScopeFolder || 'Folder';
        default:
            return ui.constructionScopeModule || ui.constructionScopeBranch || 'Module';
    }
}

function emptyConstructionContext(ui) {
    return {
        programLabel: ui.constructionContextProgram || ui.constructionScopeProgram || 'Program',
        programName: '',
        moduleLabel: ui.constructionContextModule || ui.constructionScopeModule || 'Module',
        moduleName: null,
        hint: null,
    };
}

function resolveProgramDisplayName(ui, sourceName) {
    if (fileSystem.isLocalComposedTree()) {
        const treeId = fileSystem.composedTreeId();
        const entry = treeId ? store.userStore?.getTree?.(treeId) : null;
        return String(entry?.name || sourceName || ui.constructionSessionTreeFallback || 'Program').trim();
    }
    return (
        curriculumTreeDisplayName(ui) ||
        sourceName ||
        ui.constructionSessionCourseFallback ||
        'Course'
    );
}

function resolveBranchNameAlongPath(rootData, mobilePath) {
    if (!rootData || !Array.isArray(mobilePath) || mobilePath.length <= 1) return '';
    const pathIds = new Set(mobilePath.map((id) => String(id)));
    let found = '';
    const walk = (node) => {
        if (!node || found) return;
        if (node._composedWrapper && pathIds.has(String(node.id))) {
            found = String(node.name || '').trim();
        }
        if (Array.isArray(node.children)) node.children.forEach(walk);
    };
    walk(rootData);
    return found;
}

function buildConstructionContext(ui, scopeKind, current, mobilePath, rootData, sourceName) {
    const programLabel = ui.constructionContextProgram || ui.constructionScopeProgram || 'Program';
    const moduleLabel = ui.constructionContextModule || ui.constructionScopeModule || 'Module';
    const programName = resolveProgramDisplayName(ui, sourceName);
    let moduleName = null;
    let hint = null;

    switch (scopeKind) {
        case 'tree_playlist':
            hint = ui.constructionHintTreePlaylist || null;
            break;
        case 'map_folder':
            moduleName = resolveBranchNameAlongPath(rootData, mobilePath) || null;
            hint = ui.constructionHintMapFolder || null;
            break;
        case 'branch_course':
            if (fileSystem.isLocalComposedTree()) {
                const progress = resolveTreeProgressScope(store.state.treeContext, mobilePath, rootData);
                if (progress.scope === 'branch') {
                    moduleName = current?._composedWrapper
                        ? String(current.name || '').trim()
                        : resolveBranchNameAlongPath(rootData, mobilePath) || String(current?.name || '').trim();
                    if (!moduleName) moduleName = null;
                }
            }
            hint = ui.constructionHintBranchCourse || null;
            break;
        case 'governance_only':
            hint =
                ui.constructionSessionProposerHint ||
                ui.constructionHintGovernanceOnly ||
                null;
            break;
        default:
            break;
    }

    return { programLabel, programName, moduleLabel, moduleName, hint };
}

