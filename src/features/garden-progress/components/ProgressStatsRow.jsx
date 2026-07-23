import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';

/** Streak, shield, lumens, and arcade score under the progress ring. */
export function ProgressStatsRow({ g, ui, lumensBalance, shieldCount }) {
    const arcadeScore = Math.max(0, Number(g?.arcadeScore) || 0);
    return (
        <>
        <div className="mochila-v2__trail" role="list">
            <div
                className="mochila-v2__trail-item mochila-v2__trail-item--water"
                role="listitem"
                data-arbor-tip={ui.streakHint || 'Consecutive days watering your tree'}
            >
                <span className="mochila-v2__trail-ic" aria-hidden="true">
                    <ChromeEmoji emoji="💧" size={20} />
                </span>
                <span className="mochila-v2__trail-val">{g.streak}</span>
                <span className="mochila-v2__trail-lb">{ui.streak || 'Racha'}</span>
            </div>
            <div
                className={`mochila-v2__trail-item mochila-v2__trail-item--shield${shieldCount > 0 ? '' : ' mochila-v2__trail-item--dim'}`}
                role="listitem"
                data-arbor-tip={ui.streakShieldHint || 'Protects one day without studying'}
            >
                <span className="mochila-v2__trail-ic" aria-hidden="true">
                    <ChromeEmoji emoji="☂️" size={20} />
                </span>
                <span className="mochila-v2__trail-val">{shieldCount}</span>
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
        {(g.weeklyLumens || 0) > 0 ? (
            <p className="mochila-v2__weekly m-0 mt-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 text-center">
                {(ui.progressWeeklyLine || 'This week: {n} lumens').replace(/\{n\}/g, String(g.weeklyLumens || 0))}
            </p>
        ) : null}
        </>
    );
}
