/**
 * Shared garden UI fragments (mochila + arcade).
 */

import { escAttr, escHtml } from '../../shared/lib/html-escape.js';
import { buildGardenPlotItems, getVitalityLabel, getVitalityPct } from './garden-stage.js';
import { getAvailableLumens, getEquippedDecor, GARDEN_SHOP_ITEMS } from './lumen-shop.js';

/**
 * @param {import('../../core/store.js').default} store
 * @param {Record<string, string>} ui
 * @param {{ compact?: boolean }} [opts]
 */
export function renderVitalityBannerHtml(store, ui, opts = {}) {
    const g = store.userStore.state.gamification;
    const goal = store.dailyXpGoal || 50;
    const pct = getVitalityPct(g.dailyXP, goal);
    const label = getVitalityLabel(pct, ui);
    const balance = getAvailableLumens(g);
    const compact = !!opts.compact;
    const skyDecor = getEquippedDecor(g, 'sky');
    const groundDecor = getEquippedDecor(g, 'ground');
    const decorHtml =
        skyDecor || groundDecor
            ? `<div class="garden-vitality__decor" aria-hidden="true">
                ${skyDecor ? `<span class="garden-vitality__decor-sky">${skyDecor.icon}</span>` : ''}
                ${groundDecor ? `<span class="garden-vitality__decor-ground">${groundDecor.icon}</span>` : ''}
               </div>`
            : '';

    return `
        <div class="garden-vitality${compact ? ' garden-vitality--compact' : ''}" style="--vitality:${pct}">
            ${decorHtml}
            <div class="garden-vitality__head">
                <span class="garden-vitality__label">${escHtml(ui.todayGoal || 'Fotosíntesis')}</span>
                <span class="garden-vitality__state">${escHtml(label)}</span>
            </div>
            <div class="garden-vitality__track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${escAttr((ui.todayGoal || '') + ' ' + pct + '%')}">
                <div class="garden-vitality__fill"></div>
            </div>
            <p class="garden-vitality__meta">
                ${escHtml(String(g.dailyXP || 0))} / ${goal} ${escHtml(ui.xpUnit || 'lúmenes')}
                · <span class="garden-vitality__balance">${escHtml(String(balance))} ${escHtml(ui.gardenShopBalance || 'disponibles')}</span>
            </p>
        </div>`;
}

/** Visual cap so a sprawling forest never floods the panel. */
const GARDEN_PLOT_VISIBLE_MAX = 12;

/** Stage ordering for "show the ones that need attention first". */
const STAGE_PRIORITY = { withered: 0, sprout: 1, healthy: 2, mature: 3, dormant: 4 };

/**
 * @param {import('../../core/store.js').default} store
 * @param {Record<string, string>} ui
 */
export function renderGardenPlotHtml(store, ui) {
    const items = buildGardenPlotItems(store, ui);
    if (!items.length) {
        return `<p class="garden-plot__empty">${escHtml(ui.gardenEmpty || '')}</p>`;
    }

    // Sort: attention-first (withered → sprout → healthy → mature → dormant),
    // tiebreaker by lowest health, then by name for stability.
    const sorted = [...items].sort((a, b) => {
        const pa = STAGE_PRIORITY[a.stage] ?? 9;
        const pb = STAGE_PRIORITY[b.stage] ?? 9;
        if (pa !== pb) return pa - pb;
        if ((a.healthPct || 0) !== (b.healthPct || 0)) return (a.healthPct || 0) - (b.healthPct || 0);
        return String(a.name || '').localeCompare(String(b.name || ''));
    });

    const visible = sorted.slice(0, GARDEN_PLOT_VISIBLE_MAX);
    const overflowCount = sorted.length - visible.length;
    const overflowTpl = ui.gardenPlotOverflow || '+{n} más';
    const overflowLabel = String(overflowTpl).replace('{n}', String(overflowCount));

    const cells = visible.map((item) => `
        <div class="garden-plot__cell garden-plot__cell--${escAttr(item.stage)}" title="${escAttr(item.name)} · ${item.healthPct}%">
            <span class="garden-plot__emoji" aria-hidden="true">${item.emoji}</span>
            <span class="garden-plot__name">${escHtml(item.name.length > 14 ? `${item.name.slice(0, 13)}…` : item.name)}</span>
        </div>
    `).join('');

    const overflow = overflowCount > 0
        ? `<div class="garden-plot__cell garden-plot__cell--overflow" title="${escAttr(overflowLabel)}" aria-label="${escAttr(overflowLabel)}">
                <span class="garden-plot__emoji" aria-hidden="true">🌳</span>
                <span class="garden-plot__name">${escHtml(overflowLabel)}</span>
           </div>`
        : '';

    return `
        <div class="garden-plot" aria-label="${escAttr(ui.gardenPlotTitle || ui.gardenTitle || 'Garden')}">
            ${cells}${overflow}
        </div>`;
}

/**
 * @param {import('../../core/store.js').default} store
 * @param {Record<string, string>} ui
 */
export function renderGardenShopHtml(store, ui) {
    const g = store.userStore.state.gamification;
    const balance = getAvailableLumens(g);
    const inventory = new Set(g.inventory || []);

    if (!GARDEN_SHOP_ITEMS.length) return '';

    return `
        <section class="garden-shop" aria-labelledby="garden-shop-heading">
            <h4 id="garden-shop-heading" class="garden-shop__title">${escHtml(ui.gardenShopTitle || 'Tienda del jardín')}</h4>
            <p class="garden-shop__lead">${escHtml(ui.gardenShopDesc || '')}</p>
            <p class="garden-shop__hint">${escHtml(ui.gardenShopLegend || 'Comprá una y la verás moverse en el fondo de la app.')}</p>
            <div class="garden-shop__grid">
                ${GARDEN_SHOP_ITEMS.map((item) => {
                    const owned = inventory.has(item.id);
                    const equipped = g.gardenDecor?.[item.slot] === item.id;
                    const label = ui[item.labelKey] || item.id;
                    const canBuy = !owned && balance >= item.cost;
                    return `
                        <article class="garden-shop__item${owned ? ' garden-shop__item--owned' : ''}${equipped ? ' garden-shop__item--equipped' : ''}">
                            <span class="garden-shop__icon" aria-hidden="true">${item.icon}</span>
                            <span class="garden-shop__name">${escHtml(label)}</span>
                            ${owned
                                ? `<div class="garden-shop__actions">
                                    <button type="button" class="garden-shop__btn js-garden-equip" data-id="${escAttr(item.id)}" ${equipped ? 'disabled' : ''}>
                                        ${escHtml(equipped ? (ui.gardenShopEquipped || 'Puesto') : (ui.gardenShopEquip || 'Poner'))}
                                    </button>
                                    ${equipped
                                        ? `<button type="button" class="garden-shop__btn garden-shop__btn--unequip js-garden-unequip" data-slot="${escAttr(item.slot)}">
                                            ${escHtml(ui.gardenShopUnequip || 'Quitar')}
                                           </button>`
                                        : ''}
                                   </div>`
                                : `<button type="button" class="garden-shop__btn garden-shop__btn--buy js-garden-buy" data-id="${escAttr(item.id)}" ${canBuy ? '' : 'disabled'}>
                                    ${item.cost} ${escHtml(ui.xpUnit || 'lúmenes')}
                                   </button>`}
                        </article>`;
                }).join('')}
            </div>
        </section>`;
}

/**
 * @param {RankingRow[]} rows
 * @param {Record<string, string>} ui
 * @param {string} weekKey
 */
export function renderRankingHtml(rows, ui, weekKey) {
    if (!rows.length) {
        return `<p class="garden-ranking__empty">${escHtml(ui.gardenRankingEmpty || '')}</p>`;
    }
    return `
        <ol class="garden-ranking__list">
            ${rows.map((row) => `
                <li class="garden-ranking__row${row.isSelf ? ' garden-ranking__row--self' : ''}">
                    <span class="garden-ranking__rank">${row.rank <= 3 ? ['🥇', '🥈', '🥉'][row.rank - 1] : row.rank}</span>
                    <span class="garden-ranking__avatar" aria-hidden="true">${row.avatar}</span>
                    <span class="garden-ranking__name">${escHtml(row.displayName)}</span>
                    <span class="garden-ranking__score">${row.weeklyLumens} ${escHtml(ui.xpUnit || '')}</span>
                </li>
            `).join('')}
        </ol>
        <p class="garden-ranking__week">${escHtml(String(ui.gardenRankingWeek || '{week}').replace('{week}', weekKey))}</p>`;
}
