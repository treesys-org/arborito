import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { localDateKey } from '../../../core/user-store/date-key.js';

/** Streak, shield, lumens, and arcade score under the progress ring. */
export function ProgressStatsRow({ g, ui, lumensBalance, shieldCount }) {
    const arcadeScore = Math.max(0, Number(g?.arcadeScore) || 0);
    const studiedToday = Boolean(g?.lastStudyDate) && g.lastStudyDate === localDateKey();
    const streakDays = Number(g?.streak) || 0;
    const shields = Math.max(0, Number(shieldCount) || 0);
    const streakTip = studiedToday
        ? ui.streakHintDone ||
          'Today already counts. Study again tomorrow to add another day.'
        : ui.streakHint ||
          'Earn lumens or do a care review today to keep your streak.';
    const streakValue = (ui.streakDays || '{n} days').replace(/\{n\}/g, String(streakDays));
    const streakLabel = studiedToday
        ? ui.streakTodayDone || 'Streak done'
        : ui.streakTodayPending || 'Streak due';
    const streakStateClass = studiedToday
        ? ' mochila-v2__trail-item--streak-done'
        : ' mochila-v2__trail-item--streak-pending';
    const streakNudge =
        ui.streakNudgeBanner || 'A little study today keeps your streak going.';
    return (
        <>
        <div className="mochila-v2__trail" role="list">
            <div
                className={`mochila-v2__trail-item mochila-v2__trail-item--water${streakStateClass}`}
                role="listitem"
                data-arbor-tip={streakTip}
                aria-label={`${streakValue}. ${streakLabel}. ${streakTip}`}
            >
                <span
                    className={`mochila-v2__trail-ic${studiedToday ? ' mochila-v2__trail-ic--streak-ok' : ' mochila-v2__trail-ic--streak-open'}`}
                    aria-hidden="true"
                >
                    <ChromeEmoji emoji="💧" size={20} />
                    {studiedToday ? (
                        <svg
                            className="mochila-v2__trail-check"
                            viewBox="0 0 16 16"
                            width="12"
                            height="12"
                            focusable="false"
                        >
                            <path
                                d="M3.2 8.2 6.4 11.4 12.8 4.6"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    ) : (
                        <span className="mochila-v2__trail-mark" aria-hidden="true">
                            !
                        </span>
                    )}
                </span>
                <span className="mochila-v2__trail-val">{streakValue}</span>
                <span className="mochila-v2__trail-lb">{streakLabel}</span>
            </div>
            <div
                className={`mochila-v2__trail-item mochila-v2__trail-item--shield${shields > 0 ? '' : ' mochila-v2__trail-item--dim'}`}
                role="listitem"
                data-arbor-tip={ui.streakShieldHint || 'Protects one day without studying'}
            >
                <span className="mochila-v2__trail-ic" aria-hidden="true">
                    <ChromeEmoji emoji="☂️" size={20} />
                </span>
                <span className="mochila-v2__trail-val">{shields}</span>
                <span className="mochila-v2__trail-lb">{ui.streakShieldLabel || 'Paraguas'}</span>
            </div>
            <div
                className="mochila-v2__trail-item mochila-v2__trail-item--sun"
                role="listitem"
                data-arbor-tip={ui.lumensBadgeHint || 'Luz del bosque'}
            >
                <span className="mochila-v2__trail-ic" aria-hidden="true">
                    <ChromeEmoji emoji="☀️" size={20} />
                </span>
                <span className="mochila-v2__trail-val">{lumensBalance}</span>
                <span className="mochila-v2__trail-lb">{ui.lumensBadgeLabel || ui.xpUnit || 'Lumens'}</span>
            </div>
            {arcadeScore > 0 ? (
                <div
                    className="mochila-v2__trail-item mochila-v2__trail-item--arcade"
                    role="listitem"
                    data-arbor-tip={
                        ui.arcadeScoreHint ||
                        'Arcade practice score — keeps growing even after daily lumens for the shop are capped'
                    }
                >
                    <span className="mochila-v2__trail-ic" aria-hidden="true">
                        <ChromeEmoji emoji="🎮" size={20} />
                    </span>
                    <span className="mochila-v2__trail-val">{arcadeScore}</span>
                    <span className="mochila-v2__trail-lb">{ui.arcadeScoreLabel || 'Arcade'}</span>
                </div>
            ) : null}
        </div>
        {!studiedToday ? (
            <p className="mochila-v2__streak-nudge" role="status">
                {streakNudge}
            </p>
        ) : null}
        {(g.weeklyLumens || 0) > 0 ? (
            <p className="mochila-v2__weekly m-0 mt-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 text-center">
                {(ui.progressWeeklyLine || 'This week: {n} lumens').replace(/\{n\}/g, String(g.weeklyLumens || 0))}
            </p>
        ) : null}
        </>
    );
}
