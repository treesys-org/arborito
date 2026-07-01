import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { GardenVitalityBanner, GardenPlot } from './GardenWidgets.jsx';
import { ProgressStatsRow } from './ProgressStatsRow.jsx';

/** Desktop / mobile mochila body (replaces buildCompactBodyHtml). */
export function ProgressGardenBody({ data }) {
    const {
        omitGardenBlock,
        omitActions,
        mobile,
        modalFull,
        ui,
        g,
        stats,
        collectedItems,
        dueCount,
        dailyGoalVal,
        seedPreview,
        trophyPreview,
        lessonsLine,
        careLine,
        vitalityPct,
        vitalityLabel,
        lumensBalance,
        shieldCount,
        ringLabel,
        tagline,
        careEmptyHint,
        seedsLabelResolved,
        careLabel,
        waterLabel,
        seedsLabel,
        progressTitle,
        careCountClass,
        ringEmoji,
        seedsEmptyHint,
        gardenEmptyHint,
        trophyEarned,
        trophyTotal,
    } = data;

    return (
        <div
            className={`mochila-v2 mochila-v2--forest${mobile ? ' mochila-v2--mobile' : ''}${mobile && modalFull ? ' mochila-v2--modal' : ''}`}
        >
            {!mobile ? (
                <header className="mochila-v2__head">
                    <div className="mochila-v2__head-mark" aria-hidden="true">
                        <ChromeEmoji emoji="🎒" size={22} />
                    </div>
                    <div className="mochila-v2__head-copy">
                        <p className="mochila-v2__head-title">{progressTitle}</p>
                        <p className="mochila-v2__head-tagline">{tagline}</p>
                    </div>
                </header>
            ) : null}

            {mobile ? (
                <p className="mochila-v2__daily-goal">
                    {g.dailyXP || 0}/{dailyGoalVal}{' '}
                    <ChromeEmoji emoji="☀️" size={14} /> {ui.todayGoal || 'Fotosíntesis'} · {vitalityLabel}
                </p>
            ) : (
                <GardenVitalityBanner ui={ui} g={g} compact />
            )}

            <section className="mochila-v2__grove" aria-label={ringLabel}>
                <div className="mochila-v2__splash">
                    <div className="mochila-v2__splash-ring-block">
                        <p className="mochila-v2__ring-heading">{ringLabel}</p>
                        <div
                            className="mochila-v2__ring mochila-v2__ring--vitality"
                            style={{ '--pct': stats.percentage, '--vitality': vitalityPct }}
                            role="img"
                            aria-label={`${ringLabel} ${stats.percentage}%`}
                        >
                            <div className="mochila-v2__ring-inner">
                                <div className="mochila-v2__ring-core">
                                    <span className="mochila-v2__ring-pct">
                                        {stats.percentage}
                                        <small>%</small>
                                    </span>
                                    <span className="mochila-v2__ring-emoji" aria-hidden="true">
                                        <ChromeEmoji emoji={ringEmoji} size={22} />
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <p className="mochila-v2__subtitle">{lessonsLine}</p>
                </div>
                <ProgressStatsRow g={g} ui={ui} lumensBalance={lumensBalance} shieldCount={shieldCount} />
            </section>

            {collectedItems.length ? (
                <article className="mochila-v2__card" aria-label={seedsLabel}>
                    <div className="mochila-v2__card-head">
                        <span className="mochila-v2__card-title">
                            <span aria-hidden="true">
                                <ChromeEmoji emoji="🪴" size={16} />
                            </span>{' '}
                            {ui.gardenPlotTitle || seedsLabel}
                        </span>
                    </div>
                    <GardenPlot ui={ui} />
                </article>
            ) : null}

            <div className="mochila-v2__cards">
                <article className="mochila-v2__card mochila-v2__card--care" aria-label={careLabel}>
                    <div className="mochila-v2__card-head">
                        <span className="mochila-v2__card-title">
                            <span aria-hidden="true">
                                <ChromeEmoji emoji="💧" size={16} />
                            </span>{' '}
                            {careLabel}
                        </span>
                        <span className={`mochila-v2__card-count${careCountClass}`}>
                            {dueCount > 0 ? dueCount : ''}
                        </span>
                    </div>
                    <p className="mochila-v2__hint mochila-v2__care-stats">
                        {dueCount > 0 || careLine.length
                            ? careLine.map((line) => (
                                  <span key={line} className="mochila-v2__care-stat">
                                      {line}
                                  </span>
                              ))
                            : careEmptyHint}
                    </p>
                    {dueCount > 0 ? (
                        <button
                            type="button"
                            className="mochila-v2__btn mochila-v2__btn--primary js-mochila-care"
                            style={{ marginTop: '0.55rem' }}
                        >
                            {waterLabel} ({dueCount})
                        </button>
                    ) : null}
                </article>

                {!omitGardenBlock ? (
                    <article className="mochila-v2__card" aria-label={seedsLabelResolved}>
                        <div className="mochila-v2__card-head">
                            <span className="mochila-v2__card-title">
                                <span aria-hidden="true">
                                    <ChromeEmoji emoji="🌱" size={16} />
                                </span>{' '}
                                {seedsLabelResolved}
                            </span>
                            <span className="mochila-v2__card-count">{collectedItems.length}</span>
                        </div>
                        {seedPreview.length ? (
                            <div className="mochila-v2__collection">
                                {seedPreview.map((s) => (
                                    <span key={s.id} className="mochila-v2__chip" title={s.id}>
                                        {s.icon || '🌱'}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <p className="mochila-v2__hint mochila-v2__hint--empty">{gardenEmptyHint}</p>
                        )}
                    </article>
                ) : null}

                <article className="mochila-v2__card" aria-label={ui.navCertificates || 'Logros'}>
                    <div className="mochila-v2__card-head">
                        <span className="mochila-v2__card-title">
                            <span aria-hidden="true">
                                <ChromeEmoji emoji="🏆" size={16} />
                            </span>{' '}
                            {ui.navCertificates || 'Logros'}
                        </span>
                        <span className="mochila-v2__card-count">
                            {trophyEarned}/{trophyTotal || '0'}
                        </span>
                    </div>
                    {trophyPreview.length ? (
                        <div className="mochila-v2__collection">
                            {trophyPreview.map((c) => (
                                <button
                                    key={c.id}
                                    type="button"
                                    className="mochila-v2__trophy js-mochila-open-cert arborito-desktop-hit"
                                    data-id={encodeURIComponent(c.id)}
                                    title={c.name}
                                >
                                    {c.icon || '🏆'}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <p className="mochila-v2__hint mochila-v2__hint--empty">{seedsEmptyHint}</p>
                    )}
                </article>
            </div>

            {!omitActions ? (
                <div className="mochila-v2__actions">
                    <button type="button" className="mochila-v2__btn mochila-v2__btn--primary js-mochila-certs">
                        {ui.progressViewCerts || 'Ver certificados'}
                    </button>
                </div>
            ) : null}
        </div>
    );
}
