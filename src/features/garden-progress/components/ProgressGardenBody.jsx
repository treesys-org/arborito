import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { localDateKey } from '../../../core/user-store/date-key.js';

/**
 * Quiet mochila layout:
 * 1) Ring (course progress)
 * 2) Two labeled stats (habit | pack)
 * 3) Footer actions (care if due, logros)
 */
export function ProgressGardenBody({ data }) {
    const {
        omitActions,
        mobile,
        modalFull,
        ui,
        g,
        stats,
        dueCount,
        dailyGoalVal,
        lessonsLine,
        vitalityPct,
        lumensBalance,
        shieldCount,
        ringLabel,
        tagline,
        careLabel,
        waterLabel,
        progressTitle,
        ringEmoji,
    } = data;

    const studiedToday = Boolean(g?.lastStudyDate) && g.lastStudyDate === localDateKey();
    const streakDays = Number(g?.streak) || 0;
    const streakTip = studiedToday ? ui.streakHintDone || '' : ui.streakHint || '';
    const goal = Math.max(0, Number(dailyGoalVal) || 0);
    const dailyXp = Math.max(0, Number(g?.dailyXP) || 0);
    const shields = Math.max(0, Number(shieldCount) || 0);
    const arcadeScore = Math.max(0, Number(g?.arcadeScore) || 0);
    const habitLabel = ui.streak || 'Racha';
    const packLabel = ui.lumensBadgeLabel || ui.xpUnit || 'Lúmenes';
    const showCare = dueCount > 0;
    const showFooter = showCare || !omitActions;
    const dailyCapLine =
        goal > 0 ? `${Math.min(dailyXp, goal)}/${goal} ${ui.dailyShort || 'hoy'}` : '';

    return (
        <div
            className={`mochila-v2 mochila-v2--forest mochila-v2--quiet${mobile ? ' mochila-v2--mobile' : ''}${mobile && modalFull ? ' mochila-v2--modal' : ''}`}
        >
            {!mobile ? (
                <header className="mochila-v2__head">
                    <div className="mochila-v2__head-mark" aria-hidden="true">
                        <ChromeEmoji emoji="🎒" size={22} />
                    </div>
                    <div className="mochila-v2__head-copy">
                        <p className="mochila-v2__head-title">{progressTitle}</p>
                        {tagline ? <p className="mochila-v2__head-tagline">{tagline}</p> : null}
                    </div>
                </header>
            ) : null}

            <section className="mochila-v2__grove mochila-v2__grove--hero" aria-label={ringLabel}>
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
                {lessonsLine ? <p className="mochila-v2__subtitle">{lessonsLine}</p> : null}
            </section>

            <div className="mochila-v2__stats" role="group" aria-label={progressTitle || 'Mochila'}>
                <article className="mochila-v2__stat" title={streakTip || undefined}>
                    <p className="mochila-v2__stat-lb">
                        <ChromeEmoji emoji="💧" size={14} /> {habitLabel}
                    </p>
                    <p className="mochila-v2__stat-val mochila-v2__stat-val--with-extra">
                        <span>{streakDays}</span>
                        {shields > 0 ? (
                            <span
                                className="mochila-v2__stat-shield"
                                title={ui.streakShieldHint || undefined}
                            >
                                <ChromeEmoji emoji="☂️" size={16} />
                                <span className="mochila-v2__stat-shield-n">{shields}</span>
                            </span>
                        ) : null}
                    </p>
                    {studiedToday ? (
                        <p className="mochila-v2__stat-sub">
                            {ui.streakTodayDone || ui.streakKept || 'Hoy ok'}
                        </p>
                    ) : (
                        <p className="mochila-v2__stat-sub mochila-v2__stat-sub--muted">
                            {ui.streakTodayPending || 'Falta hoy'}
                        </p>
                    )}
                </article>

                <article className="mochila-v2__stat" title={ui.lumensBadgeHint || undefined}>
                    <p className="mochila-v2__stat-lb">
                        <ChromeEmoji emoji="☀️" size={14} /> {packLabel}
                    </p>
                    <p className="mochila-v2__stat-val">{lumensBalance}</p>
                    {arcadeScore > 0 ? (
                        <p
                            className="mochila-v2__stat-sub mochila-v2__stat-sub--row"
                            title={ui.arcadeScoreHint || undefined}
                        >
                            <ChromeEmoji emoji="🎮" size={12} /> {arcadeScore}
                        </p>
                    ) : dailyCapLine ? (
                        <p className="mochila-v2__stat-sub">{dailyCapLine}</p>
                    ) : (
                        <p className="mochila-v2__stat-sub mochila-v2__stat-sub--muted">
                            {ui.xpUnit || packLabel}
                        </p>
                    )}
                </article>
            </div>

            {showFooter ? (
                <footer className="mochila-v2__foot">
                    {showCare ? (
                        <button
                            type="button"
                            className="mochila-v2__btn mochila-v2__btn--primary js-mochila-care"
                            aria-label={`${careLabel}: ${waterLabel} (${dueCount})`}
                        >
                            <ChromeEmoji emoji="💧" size={16} /> {waterLabel} ({dueCount})
                        </button>
                    ) : null}
                    {!omitActions ? (
                        <button
                            type="button"
                            className="mochila-v2__btn mochila-v2__btn--ghost js-mochila-certs"
                        >
                            <ChromeEmoji emoji="🏆" size={16} />{' '}
                            {ui.progressViewCerts || ui.navCertificates || 'Logros'}
                        </button>
                    ) : null}
                </footer>
            ) : null}
        </div>
    );
}
