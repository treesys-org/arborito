import { useGardenProgress } from '../hooks/useGardenProgress.js';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { LoadingBrand } from '../../../shared/ui/Loading.jsx';
import { buildGardenPlotItems, getVitalityLabel, getVitalityPct } from '../api/garden-stage.js';
import { getAvailableLumens, getEquippedDecor, GARDEN_SHOP_ITEMS } from '../api/lumen-shop.js';

const GARDEN_PLOT_VISIBLE_MAX = 12;
const STAGE_PRIORITY = { withered: 0, sprout: 1, healthy: 2, mature: 3, dormant: 4 };

export function GardenVitalityBanner({ ui, compact = false, g: gProp }) {
    const { userStore, gamification, dailyXpGoal } = useGardenProgress();
    const g = gProp ?? gamification ?? userStore?.state?.gamification ?? {};
    const goal = dailyXpGoal || 50;
    const pct = getVitalityPct(g.dailyXP, goal);
    const label = getVitalityLabel(pct, ui);
    const balance = getAvailableLumens(g);
    const skyDecor = compact ? null : getEquippedDecor(g, 'sky');
    const groundDecor = compact ? null : getEquippedDecor(g, 'ground');
    const decorMods = [
        compact ? '' : skyDecor ? ' garden-vitality--has-sky' : '',
        compact ? '' : groundDecor ? ' garden-vitality--has-ground' : '',
    ].join('');

    return (
        <div
            className={`garden-vitality${compact ? ' garden-vitality--compact' : ''}${decorMods}`}
            style={{ '--vitality': pct }}
        >
            {skyDecor || groundDecor ? (
                <div className="garden-vitality__decor" aria-hidden="true">
                    {skyDecor ? (
                        <span className="garden-vitality__decor-sky">
                            <ChromeEmoji emoji={skyDecor.icon} size={22} />
                        </span>
                    ) : null}
                    {groundDecor ? (
                        <span className="garden-vitality__decor-ground">
                            <ChromeEmoji emoji={groundDecor.icon} size={22} />
                        </span>
                    ) : null}
                </div>
            ) : null}
            <div className="garden-vitality__head">
                <span className="garden-vitality__label">{ui.todayGoal || 'Photosynthesis'}</span>
                <span className="garden-vitality__state">{label}</span>
            </div>
            <div
                className="garden-vitality__track"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${ui.todayGoal || ''} ${pct}%`}
            >
                <div className="garden-vitality__fill" />
            </div>
            <p className="garden-vitality__meta">
                {g.dailyXP || 0} / {goal} {ui.xpUnit || 'lumens'}
                {' · '}
                <span className="garden-vitality__balance">
                    {balance} {ui.gardenShopBalance || 'available'}
                </span>
            </p>
        </div>
    );
}

export function GardenPlot({ ui }) {
    const { store } = useGardenProgress();
    const items = buildGardenPlotItems(store, ui);
    if (!items.length) {
        return <p className="garden-plot__empty">{ui.gardenEmpty || ''}</p>;
    }

    const sorted = [...items].sort((a, b) => {
        const pa = STAGE_PRIORITY[a.stage] ?? 9;
        const pb = STAGE_PRIORITY[b.stage] ?? 9;
        if (pa !== pb) return pa - pb;
        if ((a.healthPct || 0) !== (b.healthPct || 0)) return (a.healthPct || 0) - (b.healthPct || 0);
        return String(a.name || '').localeCompare(String(b.name || ''));
    });

    const visible = sorted.slice(0, GARDEN_PLOT_VISIBLE_MAX);
    const overflowCount = sorted.length - visible.length;
    const overflowTpl = ui.gardenPlotOverflow || '+{n} more';
    const overflowLabel = String(overflowTpl).replace('{n}', String(overflowCount));

    return (
        <div
            className="garden-plot"
            aria-label={ui.gardenPlotTitle || ui.gardenTitle || 'My plot'}
        >
            {visible.map((item) => (
                <div
                    key={item.id}
                    className={`garden-plot__cell garden-plot__cell--${item.stage}`}
                    title={`${item.name} · ${item.healthPct}%`}
                >
                    <span className="garden-plot__emoji" aria-hidden="true">
                        <ChromeEmoji emoji={item.emoji} size={24} />
                    </span>
                    <span className="garden-plot__name">
                        {item.name.length > 14 ? `${item.name.slice(0, 13)}…` : item.name}
                    </span>
                </div>
            ))}
            {overflowCount > 0 ? (
                <div
                    className="garden-plot__cell garden-plot__cell--overflow"
                    title={overflowLabel}
                    aria-label={overflowLabel}
                >
                    <span className="garden-plot__emoji" aria-hidden="true">
                        <ChromeEmoji emoji="🌳" size={24} />
                    </span>
                    <span className="garden-plot__name">{overflowLabel}</span>
                </div>
            ) : null}
        </div>
    );
}

export function GardenShop({ ui, g: gProp }) {
    const { userStore, gamification } = useGardenProgress();
    const g = gProp ?? gamification ?? userStore?.state?.gamification ?? {};
    const balance = getAvailableLumens(g);
    const inventory = new Set(g.inventory || []);

    if (!GARDEN_SHOP_ITEMS.length) return null;

    return (
        <section className="garden-shop" aria-labelledby="garden-shop-heading">
            <h4 id="garden-shop-heading" className="garden-shop__title">
                {ui.gardenShopTitle || 'Garden shop'}
            </h4>
            <p className="garden-shop__lead">{ui.gardenShopDesc || ''}</p>
            <p className="garden-shop__hint">
                {ui.gardenShopLegend || 'Buy a decoration and watch it move in the app background.'}
            </p>
            <div className="garden-shop__grid">
                {GARDEN_SHOP_ITEMS.map((item) => {
                    const owned = inventory.has(item.id);
                    const equipped = g.gardenDecor?.[item.slot] === item.id;
                    const label = ui[item.labelKey] || item.id;
                    const canBuy = !owned && balance >= item.cost;
                    return (
                        <article
                            key={item.id}
                            className={`garden-shop__item${owned ? ' garden-shop__item--owned' : ''}${equipped ? ' garden-shop__item--equipped' : ''}`}
                        >
                            <span className="garden-shop__icon" aria-hidden="true">
                                {item.icon}
                            </span>
                            <span className="garden-shop__name">{label}</span>
                            {owned ? (
                                <div className="garden-shop__actions">
                                    <button
                                        type="button"
                                        className="garden-shop__btn js-garden-equip"
                                        data-id={item.id}
                                        disabled={equipped}
                                    >
                                        {equipped
                                            ? ui.gardenShopEquipped || 'Equipped'
                                            : ui.gardenShopEquip || 'Equip'}
                                    </button>
                                    {equipped ? (
                                        <button
                                            type="button"
                                            className="garden-shop__btn garden-shop__btn--unequip js-garden-unequip"
                                            data-slot={item.slot}
                                        >
                                            {ui.gardenShopUnequip || 'Remove'}
                                        </button>
                                    ) : null}
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    className="garden-shop__btn garden-shop__btn--buy js-garden-buy"
                                    data-id={item.id}
                                    disabled={!canBuy}
                                >
                                    {item.cost} {ui.xpUnit || 'lumens'}
                                </button>
                            )}
                        </article>
                    );
                })}
            </div>
        </section>
    );
}

export function GardenRankingList({ rows, ui, weekKey }) {
    if (!rows.length) {
        return <p className="garden-ranking__empty">{ui.gardenRankingEmpty || ''}</p>;
    }

    const medals = ['🥇', '🥈', '🥉'];

    return (
        <>
            <ol className="garden-ranking__list">
                {rows.map((row) => (
                    <li
                        key={`${row.rank}-${row.displayName}`}
                        className={`garden-ranking__row${row.isSelf ? ' garden-ranking__row--self' : ''}`}
                    >
                        <span className="garden-ranking__rank">
                            {row.rank <= 3 ? medals[row.rank - 1] : row.rank}
                        </span>
                        <span className="garden-ranking__avatar" aria-hidden="true">
                            {row.avatar}
                        </span>
                        <span className="garden-ranking__name">{row.displayName}</span>
                        <span className="garden-ranking__score">
                            {row.weeklyLumens} {ui.xpUnit || ''}
                        </span>
                    </li>
                ))}
            </ol>
            <p className="garden-ranking__week">
                {String(ui.gardenRankingWeek || '{week}').replace('{week}', weekKey)}
            </p>
        </>
    );
}

export function GardenRankingSection({
    ui,
    consentOk,
    rankingOn,
    loading,
    rows,
    weekKey,
    emptyMessage,
}) {
    return (
        <section
            className="garden-ranking"
            id="garden-ranking-section"
            aria-labelledby="garden-ranking-heading"
        >
            <div className="garden-ranking__head">
                <h4 id="garden-ranking-heading" className="garden-ranking__title">
                    {ui.gardenRankingTitle || 'Tree neighbors'}
                </h4>
                {consentOk ? (
                    <button
                        type="button"
                        className={`garden-ranking__join js-garden-ranking-toggle${rankingOn ? ' garden-ranking__join--on' : ''}`}
                        aria-pressed={rankingOn ? 'true' : 'false'}
                    >
                        {rankingOn
                            ? ui.gardenRankingLeave || 'Leave'
                            : ui.gardenRankingJoin || 'Join'}
                    </button>
                ) : null}
            </div>
            <p className="garden-ranking__note">
                {!consentOk
                    ? ui.gardenRankingNeedConsent || ui.gardenRankingOptInHint || ''
                    : rankingOn
                      ? ui.gardenRankingNote || ''
                      : ui.gardenRankingOptOutHint || ui.gardenRankingOptInHint || ''}
            </p>
            <div id="garden-ranking-body">
                {loading ? (
                    <div className="arborito-loading-panel arborito-loading-panel--sky" role="status" aria-live="polite" aria-busy="true">
                        <LoadingBrand
                            label={ui.loading}
                            size="lg"
                            tone="sage"
                            extraClass="arborito-loading-brand--panel"
                        />
                    </div>
                ) : emptyMessage ? (
                    <p className="garden-ranking__empty">{emptyMessage}</p>
                ) : rows ? (
                    <GardenRankingList rows={rows} ui={ui} weekKey={weekKey} />
                ) : null}
            </div>
        </section>
    );
}
