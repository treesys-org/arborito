import { getArboritoStore as store } from '../../../../core/store-singleton.js';
import { loadArcadeGamesCatalog } from '../../../arcade/api/arcade-games-loader.js';
import { sortArcadeGamesForDiscovery } from '../../../arcade/api/arcade-game-discovery.js';
import {
    getCurrentLessonTopicItems,
    resolveTopicLabels,
} from './editor-game-topics.js';

let gamesCatalogPromise = null;

function topicIdsFromBlock(block) {
    const raw =
        block.querySelector('.game-topics-input')?.value || block.getAttribute('data-topics') || '';
    return String(raw)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function officialGamesOnly(games) {
    return (games || []).filter((g) => g.isOfficial);
}

function ensureGamesCatalog() {
    if (!gamesCatalogPromise) {
        gamesCatalogPromise = loadArcadeGamesCatalog(store.userStore)
            .then((result) => officialGamesOnly(result?.games ?? result))
            .catch((e) => {
                gamesCatalogPromise = null;
                console.warn('[Arborito] game catalog load failed', e);
                return [];
            });
    }
    return gamesCatalogPromise;
}

function findGameByPath(games, path) {
    const p = String(path || '').trim();
    if (!p) return null;
    return games.find((g) => String(g.path || '') === p) || null;
}

function syncGameSelectedDisplay(block, games = null) {
    const display = block.querySelector('.game-selected-display');
    const urlInput = block.querySelector('.game-url-input');
    const labelInput = block.querySelector('.game-label-input');
    if (!display) return;
    const ui = store.ui;
    const url = String(urlInput?.value || '').trim();
    if (!url) {
        display.textContent = ui.editorBlockGameNoneSelected || 'No game selected';
        display.classList.add('game-selected-display--empty');
        return;
    }
    display.classList.remove('game-selected-display--empty');
    const label = String(labelInput?.value || '').trim();
    if (label) {
        display.textContent = label;
        return;
    }
    const match = games ? findGameByPath(games, url) : null;
    display.textContent = match?.name || url;
}

function syncGameBlockTopicsUi(block) {
    const topics = topicIdsFromBlock(block);
    const joined = topics.join(',');
    block.setAttribute('data-topics', joined);
    const hidden = block.querySelector('.game-topics-input');
    if (hidden) hidden.value = joined;

    const catalog = block._arboritoTopicCatalog || getCurrentLessonTopicItems();
    block._arboritoTopicCatalog = catalog;
    const labels = resolveTopicLabels(topics, catalog);

    const chips = block.querySelector('.game-topics-chips');
    const ui = store.ui;
    if (chips) {
        if (!topics.length) {
            chips.innerHTML = `<span class="game-topics-list text-[11px] text-slate-500 dark:text-slate-400 italic">${escapeHtml(ui.editorBlockGameTopicsNone || 'No topics selected')}</span>`;
        } else {
            chips.innerHTML = topics
                .map(
                    (id, i) =>
                        `<span class="game-topic-chip inline-flex items-center gap-1 px-2 py-1 rounded-full bg-orange-100 dark:bg-orange-900/30 text-[11px] font-bold text-orange-900 dark:text-orange-100" data-topic-id="${escapeHtml(id)}"><span class="game-topic-chip__label">${escapeHtml(labels[i] || id)}</span><button type="button" class="game-topic-chip-remove text-orange-700 dark:text-orange-200" aria-label="${escapeHtml(ui.remove || 'Remove')}">×</button></span>`
                )
                .join('');
        }
    }

    const countEl = block.querySelector('.game-topics-count');
    if (countEl) countEl.textContent = `(${topics.length})`;

    const section = block.querySelector('.game-topics-section');
    if (section) section.classList.toggle('game-topics-section--missing', topics.length === 0);
}

function setPickerLoading(block, loading) {
    const panel = block.querySelector('.game-picker-panel');
    const loadingEl = block.querySelector('.game-picker-loading');
    const results = block.querySelector('.game-picker-results');
    if (panel) panel.classList.toggle('game-picker-panel--loading', loading);
    if (loadingEl) loadingEl.classList.toggle('hidden', !loading);
    if (results && loading) results.innerHTML = '';
}

function renderGamePickerResults(block, games, filterText = '') {
    const results = block.querySelector('.game-picker-results');
    const emptyEl = block.querySelector('.game-picker-empty');
    if (!results) return;
    const q = String(filterText || '').trim().toLowerCase();
    const filtered = q
        ? games.filter((g) => {
              const hay = `${g.name || ''} ${g.description || ''}`.toLowerCase();
              return hay.includes(q);
          })
        : games;

    results.innerHTML = '';
    if (!filtered.length) {
        if (emptyEl) emptyEl.classList.remove('hidden');
        return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');

    const currentUrl = String(block.querySelector('.game-url-input')?.value || '').trim();
    for (const game of filtered) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'game-picker-row arborito-picker-row';
        row.dataset.gamePath = String(game.path || '');
        row.dataset.gameName = String(game.name || '');
        if (String(game.path || '') === currentUrl) row.classList.add('game-picker-row--active');
        const icon = game.icon ? String(game.icon) : '🎮';
        row.innerHTML = `<span class="game-picker-row__icon" aria-hidden="true">${icon}</span><span class="game-picker-row__body"><span class="game-picker-row__name">${escapeHtml(game.name || game.id || '')}</span></span>`;
        results.appendChild(row);
    }
}

function renderTopicPickerResults(block, topics, filterText = '') {
    const results = block.querySelector('.game-topic-picker-results');
    const emptyEl = block.querySelector('.game-topic-picker-empty');
    if (!results) return;
    const selected = new Set(topicIdsFromBlock(block));
    const q = String(filterText || '').trim().toLowerCase();
    const filtered = (topics || []).filter((t) => {
        if (selected.has(t.id)) return false;
        if (!q) return true;
        return `${t.text} ${t.id}`.toLowerCase().includes(q);
    });

    results.innerHTML = '';
    if (!filtered.length) {
        emptyEl?.classList.remove('hidden');
        return;
    }
    emptyEl?.classList.add('hidden');

    for (const topic of filtered) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'game-topic-picker-row arborito-picker-row';
        row.dataset.topicId = topic.id;
        row.dataset.topicLabel = topic.text;
        const indent = Math.max(0, (topic.level || 1) - 1) * 12;
        row.style.paddingLeft = `${0.65 + indent / 16}rem`;
        row.innerHTML = `<span class="game-topic-picker-row__name">${escapeHtml(topic.text)}</span>`;
        results.appendChild(row);
    }
}

function showGamePicker(block) {
    const panel = block.querySelector('.game-picker-panel');
    if (!panel) return;
    block.querySelector('.game-topics-picker-panel')?.classList.add('hidden');
    panel.classList.remove('hidden');
    const search = block.querySelector('.game-search-input');
    if (search instanceof HTMLInputElement) {
        search.value = '';
        search.focus({ preventScroll: true });
    }
    setPickerLoading(block, true);
    void ensureGamesCatalog().then((games) => {
        const sorted = sortArcadeGamesForDiscovery(games);
        block._arboritoGamesCatalog = sorted;
        setPickerLoading(block, false);
        renderGamePickerResults(block, sorted, '');
        syncGameSelectedDisplay(block, sorted);
    });
}

function hideGamePicker(block) {
    block.querySelector('.game-picker-panel')?.classList.add('hidden');
}

function showTopicPicker(block) {
    const panel = block.querySelector('.game-topics-picker-panel');
    if (!panel) return;
    hideGamePicker(block);
    panel.classList.remove('hidden');
    const catalog = getCurrentLessonTopicItems();
    block._arboritoTopicCatalog = catalog;
    const search = block.querySelector('.game-topic-search-input');
    if (search instanceof HTMLInputElement) {
        search.value = '';
        search.focus({ preventScroll: true });
    }
    renderTopicPickerResults(block, catalog, '');
}

function hideTopicPicker(block) {
    block.querySelector('.game-topics-picker-panel')?.classList.add('hidden');
}

function selectGame(block, game) {
    const urlInput = block.querySelector('.game-url-input');
    const labelInput = block.querySelector('.game-label-input');
    if (urlInput) urlInput.value = String(game.path || '');
    if (labelInput) labelInput.value = String(game.name || '');
    syncGameSelectedDisplay(block, block._arboritoGamesCatalog || null);
    hideGamePicker(block);
}

function addTopic(block, topicId) {
    const id = String(topicId || '').trim();
    if (!id) return;
    const topics = topicIdsFromBlock(block);
    if (!topics.includes(id)) topics.push(id);
    block.setAttribute('data-topics', topics.join(','));
    const hidden = block.querySelector('.game-topics-input');
    if (hidden) hidden.value = topics.join(',');
    syncGameBlockTopicsUi(block);
    const catalog = block._arboritoTopicCatalog || getCurrentLessonTopicItems();
    renderTopicPickerResults(block, catalog, block.querySelector('.game-topic-search-input')?.value || '');
}

function removeTopic(block, topicId) {
    const id = String(topicId || '').trim();
    const topics = topicIdsFromBlock(block).filter((t) => t !== id);
    block.setAttribute('data-topics', topics.join(','));
    const hidden = block.querySelector('.game-topics-input');
    if (hidden) hidden.value = topics.join(',');
    syncGameBlockTopicsUi(block);
    const catalog = block._arboritoTopicCatalog || getCurrentLessonTopicItems();
    renderTopicPickerResults(block, catalog, block.querySelector('.game-topic-search-input')?.value || '');
}

/** Wire game block controls inside the visual editor (delegation target: block root). */
export function handleGameBlockAction(block, target) {
    if (!(block instanceof HTMLElement) || !(target instanceof Element)) return false;

    if (target.closest('.game-topic-chip-remove')) {
        const chip = target.closest('.game-topic-chip');
        removeTopic(block, chip?.getAttribute('data-topic-id'));
        return true;
    }

    if (target.closest('.game-browse-btn')) {
        const panel = block.querySelector('.game-picker-panel');
        if (panel?.classList.contains('hidden')) showGamePicker(block);
        else hideGamePicker(block);
        return true;
    }

    if (target.closest('.game-topic-browse-btn')) {
        const panel = block.querySelector('.game-topics-picker-panel');
        if (panel?.classList.contains('hidden')) showTopicPicker(block);
        else hideTopicPicker(block);
        return true;
    }

    if (target.closest('.game-picker-close')) {
        hideGamePicker(block);
        hideTopicPicker(block);
        return true;
    }

    const gameRow = target.closest('.game-picker-row');
    if (gameRow instanceof HTMLElement) {
        selectGame(block, {
            path: gameRow.dataset.gamePath,
            name: gameRow.dataset.gameName,
        });
        return true;
    }

    const topicRow = target.closest('.game-topic-picker-row');
    if (topicRow instanceof HTMLElement) {
        addTopic(block, topicRow.dataset.topicId);
        return true;
    }

    return false;
}

export function bindGameBlockControls(block) {
    if (!(block instanceof HTMLElement)) return;
    block._arboritoTopicCatalog = getCurrentLessonTopicItems();
    syncGameBlockTopicsUi(block);

    if (block.dataset.gameControlsBound === '1') {
        syncGameSelectedDisplay(block, block._arboritoGamesCatalog || null);
        return;
    }
    block.dataset.gameControlsBound = '1';

    const searchInput = block.querySelector('.game-search-input');
    if (searchInput instanceof HTMLInputElement) {
        searchInput.addEventListener('input', () => {
            renderGamePickerResults(block, block._arboritoGamesCatalog || [], searchInput.value);
        });
    }

    const topicSearchInput = block.querySelector('.game-topic-search-input');
    if (topicSearchInput instanceof HTMLInputElement) {
        topicSearchInput.addEventListener('input', () => {
            renderTopicPickerResults(
                block,
                block._arboritoTopicCatalog || getCurrentLessonTopicItems(),
                topicSearchInput.value
            );
        });
    }

    void ensureGamesCatalog().then((games) => {
        const sorted = sortArcadeGamesForDiscovery(games);
        block._arboritoGamesCatalog = sorted;
        syncGameSelectedDisplay(block, sorted);
    });
}
