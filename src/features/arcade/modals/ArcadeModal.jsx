import { useArcade } from '../hooks/useArcade.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { getModuleStaticGameReadiness } from '../../learning/api/quiz-status.js';
import {
    hasOfflineGameBundle,
    downloadAndCacheGame,
    removeOfflineGameBundle,
} from '../api/game-offline-cache.js';
import { DockModalShell } from '../../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../../app/components/ModalHero.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { ArcadeGrid } from './ArcadeGrid.jsx';
import { ArcadeSetup } from './ArcadeSetup.jsx';
import { ArcadeGarden } from './ArcadeGarden.jsx';
import { ArcadeStorage } from './ArcadeStorage.jsx';

async function ensureTreeLoaded(node, loadNodeChildren, depth = 0) {
    if (depth > 4) return;
    if (node.type === 'branch' || node.type === 'root') {
        if (node.hasUnloadedChildren) await loadNodeChildren(node);
        if (node.children) {
            await Promise.all(node.children.map((c) => ensureTreeLoaded(c, loadNodeChildren, depth + 1)));
        }
    }
}

function resolveInitialTab(modal) {
    const tab = modal?.initialTab;
    if (tab === 'games' || tab === 'garden' || tab === 'storage') {
        return tab;
    }
    return 'games';
}

export function ModalArcade({ embed }) {
    const {
        ui,
        dismissModal,
        setModal,
        notify,
        update,
        confirm,
        showDialog,
        modal: appModal,
        data,
        lang,
        previewNode,
        selectedNode,
        activeSource,
        userStore,
        storage,
        arcadeActions,
    } = useArcade();

    const {
        loadNodeChildren,
        findNode,
        loadTreeRanking,
        buyGardenShopItem,
        equipGardenShopItem,
        unequipGardenShopItem,
        setRankingOptIn,
        getActivePublicTreeRef,
    } = arcadeActions;
    const mobile = embed ? true : shouldShowMobileUI();
    const modal = appModal;

    const [activeTab, setActiveTab] = useState(() => resolveInitialTab(modal));
    const [discoveredGames, setDiscoveredGames] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isPreparingContext, setIsPreparingContext] = useState(false);
    const [selectedGame, setSelectedGame] = useState(null);
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [aiMode, setAiMode] = useState('static');
    const [wateringTargetId, setWateringTargetId] = useState(null);
    const [filterText, setFilterText] = useState('');
    const [offlineCacheReady, setOfflineCacheReady] = useState({});
    const [offlineDownloading, setOfflineDownloading] = useState({});
    const isPreparingRef = useRef(false);

    const close = useCallback(() => dismissModal(), []);

    const refreshOfflineCacheStatus = useCallback(async (games) => {
        const manualGames = userStore.state.installedGames || [];
        const allGames = [...games, ...manualGames];
        const next = {};
        await Promise.all(
            allGames.map(async (g) => {
                const id = g.id != null ? String(g.id) : '';
                if (!id) return;
                next[id] = await hasOfflineGameBundle(id);
            })
        );
        setOfflineCacheReady(next);
    }, []);

    const loadAllGames = useCallback(async () => {
        setIsLoading(true);
        const repos = [...(userStore.state.gameRepos || [])].sort((a, b) => {
            if (a.isOfficial && !b.isOfficial) return -1;
            if (!a.isOfficial && b.isOfficial) return 1;
            return 0;
        });
        const byId = new Map();

        await Promise.all(
            repos.map(async (repo) => {
                try {
                    const res = await fetch(repo.url, { cache: 'no-cache' });
                    if (res.ok) {
                        const games = await res.json();
                        const repoBase = repo.url.substring(0, repo.url.lastIndexOf('/') + 1);
                        const normalize = (path) => {
                            if (!path) return '';
                            if (path.startsWith('http') || path.startsWith('//')) return path;
                            if (path.startsWith('./')) return repoBase + path.substring(2);
                            if (path.startsWith('/')) return repoBase + path.substring(1);
                            return repoBase + path;
                        };
                        games.forEach((g) => {
                            byId.set(g.id, {
                                ...g,
                                path: normalize(g.path || g.url),
                                repoId: repo.id,
                                repoName: repo.name,
                                isOfficial: !!repo.isOfficial,
                            });
                        });
                    }
                } catch (e) {
                    console.warn(`Failed to load repo ${repo.name}`, e);
                }
            })
        );

        const games = [...byId.values()];
        setDiscoveredGames(games);
        setIsLoading(false);
        await refreshOfflineCacheStatus(games);
    }, [refreshOfflineCacheStatus]);

    useEffect(() => {
        void loadAllGames();
    }, [loadAllGames]);

    useEffect(() => {
        if (selectedGame && isPreparingRef.current) return;
        const tab = resolveInitialTab(modal);
        setActiveTab(tab);
    }, [modal, selectedGame]);

    useEffect(() => {
        if (selectedGame) return;
        const m = modal;
        const preSelectedNodeId = m?.preSelectedNodeId || m?.moduleId || m?.nodeId || null;
        if (preSelectedNodeId && m?.initialTab !== 'garden') {
            const want = String(preSelectedNodeId);
            setWateringTargetId((prev) => {
                if (prev !== want) {
                    setActiveTab('games');
                    return want;
                }
                return prev;
            });
        }
    }, [modal, selectedGame]);

    const cancelLaunch = useCallback(() => {
        setSelectedGame(null);
        setSelectedNodeId(null);
        setWateringTargetId(null);
        setFilterText('');
        setAiMode('static');
    }, []);

    const handleClose = useCallback(() => {
        if (selectedGame) cancelLaunch();
        else close();
    }, [selectedGame, cancelLaunch, close]);

    const findGameById = useCallback(
        (gameId) => {
            const manualGames = userStore.state.installedGames || [];
            const allGames = [
                ...discoveredGames,
                ...manualGames.map((g) => ({ ...g, path: g.url })),
            ];
            return allGames.find((g) => String(g.id) === String(gameId)) || null;
        },
        [discoveredGames]
    );

    const prepareLaunch = useCallback(
        async (game, preSelectedNodeId = null) => {
            setSelectedGame(game);
            setIsPreparingContext(true);
            isPreparingRef.current = true;

            const root = data;
            if (root) await ensureTreeLoaded(root, loadNodeChildren);

            if (preSelectedNodeId) setSelectedNodeId(preSelectedNodeId);
            else {
                const current = previewNode || selectedNode || data;
                if (current) setSelectedNodeId(current.type === 'exam' ? current.parentId : current.id);
                else setSelectedNodeId(root ? root.id : null);
            }

            setIsPreparingContext(false);
            isPreparingRef.current = false;
        },
        []
    );

    const handlePrepare = useCallback(
        (game, _index, _isManual) => {
            void prepareLaunch(game, wateringTargetId);
            setWateringTargetId(null);
        },
        [prepareLaunch, wateringTargetId]
    );

    const launchWateringSession = useCallback((nodeId) => {
        setWateringTargetId(nodeId);
        setActiveTab('games');
    }, []);

    const launchGame = useCallback(() => {
        if (!selectedGame || !selectedNodeId) return;
        const targetNode = findNode(selectedNodeId);
        if (!activeSource || !targetNode) return;

        if (aiMode === 'static') {
            const readiness = getModuleStaticGameReadiness(targetNode);
            if (readiness && !readiness.staticReady) {
                notify(
                    ui.arcadeStaticNoQuizWarn ||
                        'Este módulo no tiene lecciones con cuestionario completo. Añade un cuestionario en al menos una lección o usa modo dinámico.'
                );
                return;
            }
        }

        const treeUrl = encodeURIComponent(activeSource.url);
        const playLang = lang || 'EN';
        const modulePath = targetNode.apiPath || targetNode.contentPath || '';
        const encodedPath = encodeURIComponent(modulePath);

        let finalUrl = selectedGame.path;
        const separator = finalUrl.includes('?') ? '&' : '?';
        finalUrl += `${separator}source=${treeUrl}&lang=${lang}`;
        if (encodedPath) finalUrl += `&module=${encodedPath}`;
        finalUrl += `&moduleId=${selectedNodeId}`;

        setModal({
            type: 'game-player',
            url: finalUrl,
            title: selectedGame.name,
            moduleId: selectedNodeId,
            aiMode,
            gameEntryUrl: selectedGame.path,
            offlineGameId: String(selectedGame.id),
            playOffline: userStore.isGameOffline(selectedGame.id),
        });
    }, [selectedGame, selectedNodeId, activeSource, findNode, aiMode, lang, notify, ui, setModal, userStore]);

    const toggleOffline = useCallback(
        async (gameId) => {
            if (!gameId || offlineDownloading[gameId]) return;
            const enabled = userStore.isGameOffline(gameId);

            if (enabled) {
                userStore.setGameOffline(gameId, false);
                try {
                    await removeOfflineGameBundle(gameId);
                } catch (e) {
                    console.warn('Failed to remove offline game bundle', e);
                }
                setOfflineCacheReady((prev) => ({ ...prev, [gameId]: false }));
                return;
            }

            if (localStorage.getItem('arborito-freeze-notice-seen') !== '1') {
                const ok = await showDialog({
                    type: 'confirm',
                    title: ui.arcadeOfflineFirstNoticeTitle || 'Save for offline play?',
                    body:
                        ui.arcadeOfflineFirstNotice ||
                        'Saves a copy on your device. While offline mode is on it will not update. Turn off to delete the copy.',
                    confirmText: ui.arcadeOfflineFirstNoticeConfirm || 'Save',
                    cancelText: ui.arcadeOfflineFirstNoticeCancel || ui.cancel || 'Cancel',
                });
                if (!ok) return;
                localStorage.setItem('arborito-freeze-notice-seen', '1');
            }

            const game = findGameById(gameId);
            if (!game?.path) {
                notify(ui.arcadeOfflineNoUrl || 'Could not resolve game URL.', true);
                return;
            }

            if (!offlineCacheReady[gameId]) {
                setOfflineDownloading((prev) => ({ ...prev, [gameId]: true }));
                try {
                    await downloadAndCacheGame(gameId, game.path);
                    setOfflineCacheReady((prev) => ({ ...prev, [gameId]: true }));
                } catch (e) {
                    console.error('Offline download failed', e);
                    notify(
                        e?.message || ui.arcadeOfflineDownloadFailed || 'Could not download offline copy.',
                        true
                    );
                    setOfflineDownloading((prev) => {
                        const next = { ...prev };
                        delete next[gameId];
                        return next;
                    });
                    return;
                }
                setOfflineDownloading((prev) => {
                    const next = { ...prev };
                    delete next[gameId];
                    return next;
                });
            }

            userStore.setGameOffline(gameId, true);
        },
        [offlineDownloading, offlineCacheReady, findGameById, ui]
    );

    const addCustomGame = useCallback((url) => {
        let name = 'Custom Game';
        try {
            name = new URL(url).hostname;
        } catch {
            /* keep default */
        }
        userStore.settings.addGame(name, url);
    }, []);

    const handleGardenClick = useCallback(
        (e) => {
            const buyBtn = e.target.closest('.js-garden-buy');
            if (buyBtn) {
                e.stopPropagation();
                const id = buyBtn.getAttribute('data-id');
                if (id) buyGardenShopItem(id);
                return;
            }
            const equipBtn = e.target.closest('.js-garden-equip');
            if (equipBtn) {
                e.stopPropagation();
                const id = equipBtn.getAttribute('data-id');
                if (id) equipGardenShopItem(id);
                return;
            }
            const unequipBtn = e.target.closest('.js-garden-unequip');
            if (unequipBtn) {
                e.stopPropagation();
                const slot = unequipBtn.getAttribute('data-slot');
                if (slot) unequipGardenShopItem(slot);
                return;
            }
            const rankingToggle = e.target.closest('.js-garden-ranking-toggle');
            if (rankingToggle) {
                e.stopPropagation();
                const on = rankingToggle.getAttribute('aria-pressed') !== 'true';
                setRankingOptIn(on);
                return;
            }
            const waterBtn = e.target.closest('.js-arcade-water-node');
            if (waterBtn) {
                e.stopPropagation();
                const nodeId = waterBtn.getAttribute('data-id');
                if (nodeId) launchWateringSession(nodeId);
            }
        },
        [launchWateringSession]
    );

    const tabs = (
        <div id="main-tabs" className="arborito-tab-strip">
            <button
                type="button"
                className={`arborito-tab-strip__btn${activeTab === 'games' ? ' is-active' : ''}`}
                id="tab-games"
                onClick={() => setActiveTab('games')}
            >
                🎮 {ui.arcadeFeatured}
            </button>
            <button
                type="button"
                className={`arborito-tab-strip__btn${activeTab === 'garden' ? ' is-active' : ''}`}
                id="tab-garden"
                onClick={() => setActiveTab('garden')}
            >
                🍂 {ui.arcadeTabCare}
            </button>
            <div className="arborito-tab-strip__divider" aria-hidden="true" />
            <button
                type="button"
                className={`arborito-tab-strip__btn${activeTab === 'storage' ? ' is-active' : ''}`}
                id="tab-storage"
                onClick={() => setActiveTab('storage')}
            >
                💾 {ui.arcadeTabStorage}
            </button>
        </div>
    );

    let content;
    if (selectedGame) {
        content = (
            <ArcadeSetup
                ui={ui}
                isPreparingContext={isPreparingContext}
                selectedNodeId={selectedNodeId}
                aiMode={aiMode}
                filterText={filterText}
                onFilterChange={setFilterText}
                onSelectNode={setSelectedNodeId}
                onSetAiMode={setAiMode}
                onStartGame={launchGame}
            />
        );
    } else if (activeTab === 'games') {
        content = (
            <ArcadeGrid
                ui={ui}
                isLoading={isLoading}
                discoveredGames={discoveredGames}
                wateringTargetId={wateringTargetId}
                offlineCacheReady={offlineCacheReady}
                offlineDownloading={offlineDownloading}
                onCancelWatering={() => setWateringTargetId(null)}
                onPrepare={handlePrepare}
                onToggleOffline={(id) => void toggleOffline(id)}
                onRemoveGame={(id) => {
                    userStore.settings.removeGame(id);
                }}
                onAddCustom={addCustomGame}
            />
        );
    } else if (activeTab === 'garden') {
        content = (
            <div onClick={handleGardenClick} onKeyDown={undefined} role="presentation">
                <ArcadeGarden ui={ui} />
            </div>
        );
    } else {
        content = (
            <ArcadeStorage
                ui={ui}
                onDeleteSave={async (id) => {
                    if (await confirm(ui.arcadeDeleteSaveConfirm || 'Delete save data for this game?')) {
                        storage.clearGameData(id);
                    }
                }}
                onDeleteAllSaves={async () => {
                    if (
                        await confirm(
                            ui.arcadeDeleteAllSavesConfirm || 'Delete ALL Arcade save data?'
                        )
                    ) {
                        storage.clearAll();
                    }
                }}
            />
        );
    }

    const hero = selectedGame ? (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={selectedGame.name}
            subtitle={ui.arcadeSetup || 'Game Setup'}
            leadingIcon={<ChromeEmoji emoji={selectedGame.icon || '🕹️'} size={24} />}
            tagClass="btn-close"
            onClose={handleClose}
        />
    ) : (
        <ModalHubHero
            ui={ui}
            mobile={mobile}
            title={ui.arcadeTitle}
            subtitle={ui.arcadeDesc}
            leadingIcon={<ChromeEmoji emoji="🎮" size={mobile ? 24 : 28} />}
            tagClass="btn-close"
            onClose={handleClose}
        />
    );

    return (
        <div data-arborito-panel="modal-arcade" data-embed={embed ? '1' : undefined}>
            <DockModalShell
                mobile={mobile}
                sizeTier="HUB"
                hero={hero}
                toolbar={selectedGame ? undefined : tabs}
                skipBodyWrap
                shellOpts={{ rootFlags: 'arborito-modal--arcade' }}
                onBackdropClick={handleClose}
            >
                <div id="modal-content" className="flex flex-col min-h-0 flex-1 overflow-hidden">
                    {content}
                </div>
            </DockModalShell>
        </div>
    );
}
