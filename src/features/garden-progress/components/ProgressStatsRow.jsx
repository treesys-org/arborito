import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';

/** Streak, shield, and lumens trail under the progress ring. */
export function ProgressStatsRow({ g, ui, lumensBalance, shieldCount }) {
    return (
        <div className="mochila-v2__trail" role="list">
            <div
                className="mochila-v2__trail-item mochila-v2__trail-item--water"
                role="listitem"
                data-arbor-tip={ui.streakHint || 'Días seguidos regando tu árbol'}
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
                data-arbor-tip={ui.streakShieldHint || 'Protege un día sin estudiar'}
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
                <span className="mochila-v2__trail-lb">{ui.lumensBadgeLabel || ui.xpUnit || 'Lúmenes'}</span>
            </div>
        </div>
    );
}
