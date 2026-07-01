import { Fragment } from 'react';
import { ChromeEmoji } from '../../../../../app/components/ChromeEmoji.jsx';

/** Escape + render the `**bold**` subset only. */
export function SageInlineMd({ text }) {
    const line = String(text || '');
    if (!line) return null;
    const parts = [];
    let rest = line;
    let key = 0;
    while (rest.length) {
        const m = rest.match(/\*\*([^*]+)\*\*/);
        if (!m || m.index == null) {
            parts.push(rest);
            break;
        }
        if (m.index > 0) parts.push(rest.slice(0, m.index));
        parts.push(<strong key={`b${key++}`}>{m[1]}</strong>);
        rest = rest.slice(m.index + m[0].length);
    }
    return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : <>{parts}</>;
}

export function SageGuideCard({ icon, title, hint, action, topic, parentTopic = '', tone = 'indigo', badge = '', compact = false }) {
    const compactCls = compact ? ' sage-card--compact' : '';
    return (
        <button
            type="button"
            className={`sage-card sage-card--${tone}${compactCls}`}
            data-sage-action={action || undefined}
            data-sage-topic={topic || undefined}
            data-sage-parent-topic={parentTopic || undefined}
            data-sage-tip-title={action === 'show-tip' ? title : undefined}
        >
            <span className="sage-card__icon" aria-hidden="true">
                {icon}
            </span>
            <span className="sage-card__body">
                <span className="sage-card__title-row">
                    <span className="sage-card__title">{title}</span>
                    {badge ? <span className="sage-card__badge">{badge}</span> : null}
                </span>
                {!compact && hint ? <span className="sage-card__hint">{hint}</span> : null}
            </span>
            <span className="sage-card__chev" aria-hidden="true">
                ›
            </span>
        </button>
    );
}

export function SageGuideHero({ icon, kicker, title, body, details = '', chip = '', compact = false }) {
    const cls = compact ? 'sage-hero sage-hero--compact' : 'sage-hero';
    return (
        <div className={cls}>
            <span className="sage-hero__icon" aria-hidden="true">
                {icon}
            </span>
            <div className="sage-hero__body">
                {kicker ? <p className="sage-hero__kicker">{kicker}</p> : null}
                <h3 className="sage-hero__title">{title}</h3>
                {body && !compact ? <p className="sage-hero__text">{body}</p> : null}
                {details && compact ? <p className="sage-hero__details">{details}</p> : null}
                {chip ? <span className="sage-hero__chip">{chip}</span> : null}
            </div>
        </div>
    );
}

export function SageGuideQuickRow({ items }) {
    return (
        <div className="sage-quick-row">
            {items.map((item) => (
                <button
                    key={item.action}
                    type="button"
                    className={`sage-quick sage-quick--${item.tone || 'indigo'}`}
                    data-sage-action={item.action}
                >
                    {item.label}
                </button>
            ))}
        </div>
    );
}

export function sageGuideScreenLabel(ui, nav) {
    if (!nav || nav.screen === 'hub') return '';
    if (nav.screen === 'tip') return nav.tipTitle || ui.navBack || 'Volver';
    const id = nav.topicId || '';
    const labels = {
        discover: ui.sageGuideActDiscover || 'Guía de Arborito',
        intro: ui.sageTopicIntroTitle || '¿Qué es Arborito?',
        study: ui.sageTopicStudyTitle || 'Cómo estudiar',
        'nav-map': ui.sageTopicNavTitle || 'Moverte por el mapa',
        garden: ui.sageTopicGardenTitle || 'Mochila y progreso',
        'construct-add': ui.sageTopicConAddTitle || 'Añadir contenido',
        'construct-edit': ui.sageTopicConEditTitle || 'Editar selección',
        'construct-publish': ui.sageTopicConPubTitle || 'Publicar cambios',
    };
    return labels[id] || ui.navBack || 'Volver';
}

export function hasSageGuideBreadcrumbs(nav) {
    if (!nav || nav.screen === 'hub') return false;
    if (nav.screen === 'topic') return true;
    if (nav.screen === 'tip') return !!(nav.parentTopic || nav.returnTopicId || nav.tipTitle);
    return false;
}

export function SageGuideBreadcrumbs({ ui, nav }) {
    if (!nav || nav.screen === 'hub') return null;
    const hubLabel = ui.sageGuideBreadcrumbHub || 'Guía';
    const ariaLabel = ui.sageGuideBreadcrumbAria || 'Navegación de la guía';
    const crumbs = [{ label: hubLabel, dest: 'hub' }];
    if (nav.screen === 'topic') {
        if (nav.parentTopic && nav.parentTopic !== nav.topicId) {
            crumbs.push({
                label: sageGuideScreenLabel(ui, { screen: 'topic', topicId: nav.parentTopic }),
                dest: 'topic',
                topicId: nav.parentTopic,
            });
        }
        crumbs.push({ label: sageGuideScreenLabel(ui, nav), current: true });
    } else if (nav.screen === 'tip') {
        if (nav.parentTopic) {
            crumbs.push({
                label: sageGuideScreenLabel(ui, { screen: 'topic', topicId: nav.parentTopic }),
                dest: 'topic',
                topicId: nav.parentTopic,
            });
        }
        if (nav.returnTopicId && nav.returnTopicId !== nav.parentTopic) {
            crumbs.push({
                label: sageGuideScreenLabel(ui, { screen: 'topic', topicId: nav.returnTopicId }),
                dest: 'topic',
                topicId: nav.returnTopicId,
            });
        }
        crumbs.push({ label: nav.tipTitle || ui.navBack || 'Volver', current: true });
    }
    if (crumbs.length <= 1) return null;

    return (
        <nav className="sage-crumbs" aria-label={ariaLabel}>
            {crumbs.map((c, idx) => (
                <Fragment key={`${c.dest}-${c.topicId || c.label}-${idx}`}>
                    {idx > 0 ? (
                        <span className="sage-crumbs__sep" aria-hidden="true">
                            ›
                        </span>
                    ) : null}
                    {c.current ? (
                        <span className="sage-crumbs__crumb sage-crumbs__crumb--current" aria-current="page">
                            {c.label}
                        </span>
                    ) : (
                        <button
                            type="button"
                            className="sage-crumbs__crumb sage-crumbs__crumb--link"
                            data-sage-action="goto-nav"
                            data-sage-nav={c.dest}
                            data-sage-topic={c.topicId || undefined}
                        >
                            {c.label}
                        </button>
                    )}
                </Fragment>
            ))}
        </nav>
    );
}

export function SageGuideIntro({ ui, variant = 'tree' }) {
    const text =
        variant === 'construction'
            ? ui.sageGuideSageIntroCon ||
              'Modo construcción: te guío para añadir lecciones, editar y publicar.'
            : variant === 'lesson'
              ? ui.sageGuideSageIntroLesson ||
                'Estás en una lección — pregúntame dónde estás o qué hacer ahora.'
              : ui.sageGuideSageIntro ||
                'Hola — soy Sage. Estoy acá para ayudarte a orientarte en el curso y encontrar lecciones.';
    return (
        <div className="sage-guide-sage-intro" role="note">
            <span className="sage-guide-sage-intro__owl" aria-hidden="true">
                <ChromeEmoji emoji="🦉" size={28} />
            </span>
            <p className="sage-guide-sage-intro__text">
                <SageInlineMd text={text} />
            </p>
        </div>
    );
}

export function SageGuideBullets({ bullets }) {
    const items = (bullets || []).filter(Boolean);
    if (!items.length) return null;
    return (
        <ul className="sage-bullets">
            {items.map((b, i) => (
                <li key={i}>{b}</li>
            ))}
        </ul>
    );
}

export function SageGuideStepsList({ steps }) {
    const items = (Array.isArray(steps) ? steps : []).filter(
        (s) => s && ((s.title && String(s.title).trim()) || (s.text && String(s.text).trim()))
    );
    if (!items.length) return null;
    return (
        <ol className="sage-steps">
            {items.map((s, i) => (
                <li key={i} className="sage-step">
                    <span className="sage-step__num" aria-hidden="true">
                        {i + 1}
                    </span>
                    <div className="sage-step__body">
                        {s.title ? (
                            <span className="sage-step__title">
                                <SageInlineMd text={s.title} />
                            </span>
                        ) : null}
                        {s.text ? (
                            <p className="sage-step__text">
                                <SageInlineMd text={s.text} />
                            </p>
                        ) : null}
                    </div>
                </li>
            ))}
        </ol>
    );
}

export function SageGuideFeatureTiles({ items }) {
    const rows = (Array.isArray(items) ? items : []).filter(
        (s) => s && ((s.title && String(s.title).trim()) || (s.text && String(s.text).trim()))
    );
    if (!rows.length) return null;
    return (
        <div className="sage-feature-tiles">
            {rows.map((s, i) => (
                <div key={i} className="sage-feature-tile">
                    <span className="sage-feature-tile__icon" aria-hidden="true">
                        {s.icon || '✨'}
                    </span>
                    <div className="sage-feature-tile__body">
                        {s.title ? (
                            <p className="sage-feature-tile__title">
                                <SageInlineMd text={s.title} />
                            </p>
                        ) : null}
                        {s.text ? (
                            <p className="sage-feature-tile__text">
                                <SageInlineMd text={s.text} />
                            </p>
                        ) : null}
                    </div>
                </div>
            ))}
        </div>
    );
}

export function SageGuideTopicLead({ text }) {
    const t = String(text || '').trim();
    if (!t) return null;
    return (
        <p className="sage-topic-lead">
            <SageInlineMd text={t} />
        </p>
    );
}

export function SageGuideTipBody({ text }) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    const blocks = raw.split(/\n{2,}/);
    return (
        <>
            {blocks
                .map((block) => {
                    const lines = block
                        .split('\n')
                        .map((l) => l.trim())
                        .filter(Boolean);
                    if (!lines.length) return null;
                    const isBulleted = lines.every((l) => /^[•\-]\s+/.test(l));
                    const isNumbered = lines.every((l) => /^\d+[.)]\s+/.test(l));
                    if (isBulleted) {
                        return (
                            <ul key={block} className="sage-tip-list">
                                {lines.map((l, i) => (
                                    <li key={i}>
                                        <SageInlineMd text={l.replace(/^[•\-]\s+/, '')} />
                                    </li>
                                ))}
                            </ul>
                        );
                    }
                    if (isNumbered) {
                        return (
                            <ol key={block} className="sage-tip-list sage-tip-list--num">
                                {lines.map((l, i) => (
                                    <li key={i}>
                                        <SageInlineMd text={l.replace(/^\d+[.)]\s+/, '')} />
                                    </li>
                                ))}
                            </ol>
                        );
                    }
                    return (
                        <p key={block}>
                            {lines.map((l, i) => (
                                <Fragment key={i}>
                                    {i > 0 ? <br /> : null}
                                    <SageInlineMd text={l} />
                                </Fragment>
                            ))}
                        </p>
                    );
                })
                .filter(Boolean)}
        </>
    );
}

function hasGuideItems(items) {
    return (Array.isArray(items) ? items : []).some(
        (s) => s && ((s.title && String(s.title).trim()) || (s.text && String(s.text).trim()))
    );
}

export function SageGuideTopicRich({ ui, nav, lead, steps, features, fallbackBullets }) {
    const useFeatures = hasGuideItems(features);
    const useSteps = !useFeatures && hasGuideItems(steps);
    const body = useFeatures ? (
        <SageGuideFeatureTiles items={features} />
    ) : useSteps ? (
        <SageGuideStepsList steps={steps} />
    ) : (
        <SageGuideBullets bullets={fallbackBullets} />
    );
    return (
        <div className="sage-guide-screen sage-guide-screen--topic sage-guide-screen--rich">
            <SageGuideBreadcrumbs ui={ui} nav={nav} />
            <SageGuideTopicLead text={lead} />
            {body}
        </div>
    );
}

export function SageGuideTopicCompact({ ui, nav, bullets, children }) {
    return (
        <div className="sage-guide-screen sage-guide-screen--topic sage-guide-screen--compact">
            <SageGuideBreadcrumbs ui={ui} nav={nav} />
            {children}
            {bullets ? <SageGuideBullets bullets={bullets} /> : null}
        </div>
    );
}
