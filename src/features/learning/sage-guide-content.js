/**
 * Sage Guide (no LLM) — contextual content and navigation actions.
 * One screen at a time: hub → topic → tip.
 */

import { escAttr, escHtml } from '../../shared/lib/html-escape.js';
import { parseNostrTreeUrl } from '../nostr/nostr-refs.js';
import { getSageNodeFields, getSageQuizContent, getSageSupportResponse } from './sage-contextual.js';
import { resolveOpenTreeOwnerDisplay, storedTreeAuthorName } from '../tree-graph/tree-owner-display.js';

/** @returns {{ screen: 'hub' }} */
export function defaultSageGuideNav() {
    return { screen: 'hub' };
}

/**
 * @param {object} store
 * @param {{ lessonNode?: object|null }} opts
 */
export function detectSageGuideContext(store, opts = {}) {
    const lessonNode = opts.lessonNode;
    if (lessonNode && (lessonNode.type === 'leaf' || lessonNode.type === 'exam')) {
        return { mode: 'lesson', node: lessonNode };
    }
    if (store.value.constructionMode) {
        return { mode: 'construction', node: store.value.selectedNode || null };
    }
    return { mode: 'tree', node: store.value.selectedNode || null };
}

function treeTitle(store) {
    const raw = store.value.rawGraphData;
    return (raw && raw.meta && (raw.meta.title || raw.meta.name)) || '';
}

function treeCourseDetails(store, ui, counts) {
    const meta = (store.value.rawGraphData && store.value.rawGraphData.meta) || {};
    const lines = [];
    const desc = String(meta.description || '').trim();
    if (desc) {
        lines.push(desc.length > 100 ? `${desc.slice(0, 97)}…` : desc);
    } else if (!counts.total) {
        lines.push(ui.sageGuideTreeEmpty || 'Explora el mapa para descubrir el contenido.');
    }
    let author = storedTreeAuthorName(store);
    if (!author) {
        const treeRef = parseNostrTreeUrl(String(store.value.activeSource?.url || '').trim());
        if (treeRef) author = resolveOpenTreeOwnerDisplay(store, treeRef.pub).label;
    }
    if (author) {
        lines.push((ui.sageGuideTreeAuthor || 'Autor: {author}').replace('{author}', author));
    }
    return lines.join('\n');
}

function treeCountChip(ui, counts) {
    if (!counts.total) return ui.sageGuideTreeEmpty || 'Explora el mapa para descubrir el contenido.';
    let line = (ui.sageGuideTreeCount || '{leaves} lecciones · {modules} módulos')
        .replace('{leaves}', String(counts.leaves))
        .replace('{modules}', String(Math.max(0, counts.modules)));
    if (counts.exams > 0) {
        line += (ui.sageGuideTreeExamsSuffix || ' · {exams} exámenes').replace('{exams}', String(counts.exams));
    }
    return line;
}

function countLessons(root) {
    let leaves = 0;
    let exams = 0;
    let modules = 0;
    const walk = (n) => {
        if (!n || typeof n !== 'object') return;
        if (n.type === 'leaf') leaves += 1;
        else if (n.type === 'exam') exams += 1;
        else if (n.type === 'branch' || n.type === 'root') modules += 1;
        if (Array.isArray(n.children)) n.children.forEach(walk);
    };
    walk(root);
    return { leaves, exams, modules, total: leaves + exams };
}

function nodeTypeLabel(node, ui) {
    if (!node) return '';
    if (node.type === 'leaf') return ui.tagLesson || 'Lección';
    if (node.type === 'exam') return ui.tagExam || 'Examen';
    if (node.type === 'branch') return ui.tagModule || 'Módulo';
    if (node.type === 'root') return ui.manualLearnRoots || 'Árbol';
    return node.type || '';
}

function sageCard({ icon, title, hint, action, topic, parentTopic = '', tone = 'indigo', badge = '', compact = false }) {
    const badgeHtml = badge
        ? `<span class="sage-card__badge">${escHtml(badge)}</span>`
        : '';
    const attrs = [];
    if (action) attrs.push(`data-sage-action="${escAttr(action)}"`);
    if (topic) attrs.push(`data-sage-topic="${escAttr(topic)}"`);
    if (parentTopic) attrs.push(`data-sage-parent-topic="${escAttr(parentTopic)}"`);
    const compactCls = compact ? ' sage-card--compact' : '';
    return `<button type="button" class="sage-card sage-card--${tone}${compactCls}" ${attrs.join(' ')}>
        <span class="sage-card__icon" aria-hidden="true">${icon}</span>
        <span class="sage-card__body">
            <span class="sage-card__title-row">
                <span class="sage-card__title">${escHtml(title)}</span>
                ${badgeHtml}
            </span>
            ${!compact && hint ? `<span class="sage-card__hint">${escHtml(hint)}</span>` : ''}
        </span>
        <span class="sage-card__chev" aria-hidden="true">›</span>
    </button>`;
}

function sageHero({ icon, kicker, title, body, details = '', chip = '', compact = false }) {
    const cls = compact ? 'sage-hero sage-hero--compact' : 'sage-hero';
    const bodyHtml = body && !compact ? `<p class="sage-hero__text">${body}</p>` : '';
    const detailsHtml =
        details && compact ? `<p class="sage-hero__details">${escHtml(details)}</p>` : '';
    return `<div class="${cls}">
        <span class="sage-hero__icon" aria-hidden="true">${icon}</span>
        <div class="sage-hero__body">
            ${kicker ? `<p class="sage-hero__kicker">${escHtml(kicker)}</p>` : ''}
            <h3 class="sage-hero__title">${escHtml(title)}</h3>
            ${bodyHtml}
            ${detailsHtml}
            ${chip ? `<span class="sage-hero__chip">${escHtml(chip)}</span>` : ''}
        </div>
    </div>`;
}

function sageQuickRow(items) {
    return `<div class="sage-quick-row">${items
        .map(
            (item) =>
                `<button type="button" class="sage-quick sage-quick--${item.tone || 'indigo'}" data-sage-action="${escAttr(item.action)}">${escHtml(item.label)}</button>`
        )
        .join('')}</div>`;
}

function sageGuideSageIntro(ui, variant = 'tree') {
    const text =
        variant === 'construction'
            ? ui.sageGuideSageIntroCon ||
              'Modo construcción: te guío para añadir lecciones, editar y publicar.'
            : variant === 'lesson'
              ? ui.sageGuideSageIntroLesson ||
                'Estás en una lección — pregúntame dónde estás o qué hacer ahora.'
              : ui.sageGuideSageIntro ||
                'Hola — soy Sage. Estoy acá para ayudarte a orientarte en el curso y encontrar lecciones.';
    return `<div class="sage-guide-sage-intro" role="note">
        <span class="sage-guide-sage-intro__owl" aria-hidden="true">🦉</span>
        <p class="sage-guide-sage-intro__text">${escHtml(text)}</p>
    </div>`;
}

function sageTopicBullets(bullets) {
    const items = bullets.filter(Boolean);
    if (!items.length) return '';
    return `<ul class="sage-bullets">${items.map((b) => `<li>${escHtml(b)}</li>`).join('')}</ul>`;
}

/**
 * Render a numbered, scannable step list (replaces the old 3-line bullet grid
 * on rich topic screens). `steps` is an array of `{ title, text }`; entries
 * missing both are silently dropped, so it's safe to feed the full S1..S5
 * range when only some have locale strings.
 */
function sageStepsList(steps) {
    const items = (Array.isArray(steps) ? steps : []).filter(
        (s) => s && ((s.title && String(s.title).trim()) || (s.text && String(s.text).trim()))
    );
    if (!items.length) return '';
    return `<ol class="sage-steps">${items
        .map(
            (s, i) => `<li class="sage-step">
                <span class="sage-step__num" aria-hidden="true">${i + 1}</span>
                <div class="sage-step__body">
                    ${s.title ? `<span class="sage-step__title">${escHtml(s.title)}</span>` : ''}
                    ${s.text ? `<p class="sage-step__text">${escHtml(s.text)}</p>` : ''}
                </div>
            </li>`
        )
        .join('')}</ol>`;
}

function sageTopicLead(text) {
    const t = String(text || '').trim();
    if (!t) return '';
    return `<p class="sage-topic-lead">${escHtml(t)}</p>`;
}

/**
 * Breadcrumbs for guide sub-screens. Replaces the old in-screen "Volver" pill
 * and the redundant tip-bottom CTA — both confused users next to the global
 * header back arrow. Crumbs let the user JUMP to any ancestor (which a single
 * back arrow can't), so the two affordances now serve different purposes.
 *
 * The nav stack is implicit: `hub → topic[parent?] → topic | tip`. We rebuild
 * crumbs from `nav` rather than maintaining a parallel stack.
 *
 * Returns '' for hub (no ancestors to show), so callers can drop it in
 * unconditionally.
 */
function sageBreadcrumbs(ui, nav) {
    if (!nav || nav.screen === 'hub') return '';
    const hubLabel = ui.sageGuideBreadcrumbHub || 'Guía';
    const ariaLabel = ui.sageGuideBreadcrumbAria || 'Navegación de la guía';
    const crumbs = [{ label: hubLabel, dest: 'hub' }];
    if (nav.screen === 'topic') {
        if (nav.parentTopic && nav.parentTopic !== nav.topicId) {
            crumbs.push({
                label: sageGuideScreenLabel(ui, { screen: 'topic', topicId: nav.parentTopic }),
                dest: 'topic',
                topicId: nav.parentTopic
            });
        }
        crumbs.push({ label: sageGuideScreenLabel(ui, nav), current: true });
    } else if (nav.screen === 'tip') {
        if (nav.parentTopic) {
            crumbs.push({
                label: sageGuideScreenLabel(ui, { screen: 'topic', topicId: nav.parentTopic }),
                dest: 'topic',
                topicId: nav.parentTopic
            });
        }
        if (nav.returnTopicId && nav.returnTopicId !== nav.parentTopic) {
            crumbs.push({
                label: sageGuideScreenLabel(ui, { screen: 'topic', topicId: nav.returnTopicId }),
                dest: 'topic',
                topicId: nav.returnTopicId
            });
        }
        crumbs.push({ label: nav.tipTitle || ui.navBack || 'Volver', current: true });
    }
    if (crumbs.length <= 1) return '';
    const parts = crumbs
        .map((c, idx) => {
            const sep = idx > 0 ? '<span class="sage-crumbs__sep" aria-hidden="true">›</span>' : '';
            if (c.current) {
                return `${sep}<span class="sage-crumbs__crumb sage-crumbs__crumb--current" aria-current="page">${escHtml(c.label)}</span>`;
            }
            const attrs = [
                'data-sage-action="goto-nav"',
                `data-sage-nav="${escAttr(c.dest)}"`
            ];
            if (c.topicId) attrs.push(`data-sage-topic="${escAttr(c.topicId)}"`);
            return `${sep}<button type="button" class="sage-crumbs__crumb sage-crumbs__crumb--link" ${attrs.join(' ')}>${escHtml(c.label)}</button>`;
        })
        .join('');
    return `<nav class="sage-crumbs" aria-label="${escAttr(ariaLabel)}">${parts}</nav>`;
}

function sageTopicCompact(bullets, ui, nav) {
    const crumbs = ui ? sageBreadcrumbs(ui, nav) : '';
    return `<div class="sage-guide-screen sage-guide-screen--topic sage-guide-screen--compact">${crumbs}${sageTopicBullets(bullets)}</div>`;
}

/**
 * Rich topic shell: breadcrumbs + optional lead paragraph + numbered steps
 * (with bullet fallback when no step strings are available). Use this for
 * any topic that has `sageTopic*S1..` locale keys.
 */
function sageTopicRich(ui, nav, { lead, steps, fallbackBullets }) {
    const stepsHtml = sageStepsList(steps);
    const body = stepsHtml || sageTopicBullets(fallbackBullets || []);
    return `<div class="sage-guide-screen sage-guide-screen--topic sage-guide-screen--rich">
        ${sageBreadcrumbs(ui, nav)}
        ${sageTopicLead(lead)}
        ${body}
    </div>`;
}

function buildTreeHub(ui, store) {
    const title = treeTitle(store);
    const counts = countLessons(store.value.data);
    const countLine = treeCountChip(ui, counts);
    const courseDetails = treeCourseDetails(store, ui, counts);

    const hero = sageHero({
        icon: '🌳',
        kicker: ui.sageGuideTreeKicker || 'Tu curso ahora',
        title: title || (ui.sageGuideTreeUntitled || 'Este árbol'),
        details: courseDetails,
        chip: countLine,
        compact: true
    });

    const quick = sageQuickRow([
        { label: ui.sageGuideActSearchShort || 'Buscar', action: 'open-search', tone: 'sky' },
        { label: ui.sageGuideActArcadeShort || 'Arcade', action: 'open-arcade', tone: 'violet' }
    ]);

    const cards = [
        sageCard({
            icon: '📗',
            title: ui.sageGuideActDiscoverShort || ui.sageGuideActDiscover || 'Guía',
            action: 'open-topic',
            topic: 'discover',
            tone: 'amber',
            compact: true
        }),
        sageCard({
            icon: '📚',
            title: ui.sageGuideActSourcesShort || ui.sageGuideActSources || 'Árboles',
            action: 'open-sources',
            tone: 'slate',
            compact: true
        })
    ].join('');

    return `<div class="sage-guide-screen sage-guide-screen--hub">
        <div class="sage-guide-top sage-guide-top--premium">${hero}${sageGuideSageIntro(ui, 'tree')}</div>
        ${quick}
        <div class="sage-guide-cards sage-guide-cards--duo">${cards}</div>
    </div>`;
}

function buildLessonHub(ui, store, node) {
    const fields = getSageNodeFields(node);
    const quiz = getSageQuizContent(node);
    const typeLbl = nodeTypeLabel(node, ui);

    const hero = sageHero({
        icon: node.type === 'exam' ? '⚔️' : '📖',
        kicker: typeLbl,
        title: String(node.name || ui.sageGuideLessonUntitled || 'Esta lección'),
        chip: quiz.hasQuiz
            ? (quiz.complete
                ? (ui.sageGuideQuizReady || 'Cuestionario listo')
                : (ui.sageGuideQuizDraft || 'Cuestionario incompleto'))
            : (ui.sageGuideNoQuiz || 'Sin cuestionario'),
        compact: true
    });

    const quick = sageQuickRow([
        { label: ui.sageBtnOpenArcade || 'Arcade', action: 'open-arcade-lesson', tone: 'violet' },
        { label: ui.sageBtnBackMap || 'Mapa', action: 'go-map', tone: 'slate' }
    ]);

    const cards = [
        sageCard({
            icon: '📍',
            title: ui.sageBtnWhereAmI || '¿Dónde estoy?',
            action: 'show-tip',
            topic: 'where',
            tone: 'amber',
            compact: true
        }),
        sageCard({
            icon: '➡️',
            title: ui.sageBtnHowContinue || '¿Qué hago ahora?',
            action: 'show-tip',
            topic: 'continue',
            tone: 'emerald',
            compact: true
        })
    ];

    if (fields.hasDescription) {
        cards.push(
            sageCard({
                icon: '📄',
                title: ui.sageBtnSummary || 'Ver resumen',
                action: 'show-tip',
                topic: 'summary',
                tone: 'sky',
                compact: true
            })
        );
    }
    if (fields.hasNotes) {
        cards.push(
            sageCard({
                icon: '💬',
                title: ui.sageBtnExtraInfo || 'Notas extra',
                action: 'show-tip',
                topic: 'notes',
                tone: 'indigo',
                compact: true
            })
        );
    }
    if (quiz.hasQuiz) {
        cards.push(
            sageCard({
                icon: '✅',
                title: ui.sageBtnQuizStatus || 'Estado del cuestionario',
                action: 'show-tip',
                topic: 'quiz-status',
                tone: 'violet',
                compact: true
            })
        );
    }

    return `<div class="sage-guide-screen sage-guide-screen--hub">
        <div class="sage-guide-top sage-guide-top--premium">${hero}${sageGuideSageIntro(ui, 'lesson')}</div>
        ${quick}
        <div class="sage-guide-cards sage-guide-cards--stack">${cards.join('')}</div>
    </div>`;
}

function buildConstructionHub(ui, store, node) {
    const title = treeTitle(store);
    const nodeName = node && node.name ? String(node.name) : '';
    const nodeType = nodeTypeLabel(node, ui);

    const hero = sageHero({
        icon: '👷',
        kicker: ui.sageConstructGuideSubtitle || ui.navConstruct || 'Modo Construcción',
        title: title || (ui.sageGuideTreeUntitled || 'Editando el árbol'),
        chip: nodeName
            ? (ui.sageConstructNodeHint || 'Seleccionado: {name}').replace('{name}', nodeName) +
              (nodeType ? ` · ${nodeType}` : '')
            : (ui.sageGuideConstructNoSel || 'Tocá un nodo del mapa'),
        compact: true
    });

    const quick = sageQuickRow([
        { label: ui.sageGuideConTourShort || 'Tour', action: 'start-con-tour', tone: 'violet' },
        { label: ui.sageGuideConExitShort || 'Salir', action: 'exit-construction', tone: 'slate' }
    ]);

    const cards = [
        sageCard({
            icon: '➕',
            title: ui.sageGuideConAddShort || 'Añadir',
            action: 'open-topic',
            topic: 'construct-add',
            tone: 'emerald',
            compact: true
        }),
        sageCard({
            icon: '✏️',
            title: ui.sageGuideConEditShort || 'Editar',
            action: 'open-topic',
            topic: 'construct-edit',
            tone: 'sky',
            compact: true
        }),
        sageCard({
            icon: '🚀',
            title: ui.sageGuideConPublishShort || 'Publicar',
            action: 'open-topic',
            topic: 'construct-publish',
            tone: 'amber',
            compact: true
        }),
        sageCard({
            icon: '📗',
            title: ui.sageGuideActDiscoverShort || ui.sageGuideActDiscover || 'Guía',
            action: 'open-topic',
            topic: 'discover',
            tone: 'indigo',
            compact: true
        })
    ].join('');

    return `<div class="sage-guide-screen sage-guide-screen--hub">
        <div class="sage-guide-top sage-guide-top--premium">${hero}${sageGuideSageIntro(ui, 'construction')}</div>
        ${quick}
        <div class="sage-guide-cards sage-guide-cards--grid">${cards}</div>
    </div>`;
}

function buildTopicDiscover(ui, nav) {
    const cards = [
        sageCard({
            icon: '🌱',
            title: ui.sageGuideDiscoverIntro || 'Qué es',
            action: 'open-topic',
            topic: 'intro',
            parentTopic: 'discover',
            tone: 'amber',
            compact: true
        }),
        sageCard({
            icon: '📖',
            title: ui.sageGuideDiscoverStudy || 'Estudiar',
            action: 'open-topic',
            topic: 'study',
            parentTopic: 'discover',
            tone: 'indigo',
            compact: true
        }),
        sageCard({
            icon: '🧭',
            title: ui.sageGuideDiscoverMap || 'Mapa',
            action: 'open-topic',
            topic: 'nav-map',
            parentTopic: 'discover',
            tone: 'sky',
            compact: true
        }),
        sageCard({
            icon: '🎒',
            title: ui.sageGuideDiscoverGarden || 'Mochila',
            action: 'open-topic',
            topic: 'garden',
            parentTopic: 'discover',
            tone: 'emerald',
            compact: true
        })
    ].join('');

    return `<div class="sage-guide-screen sage-guide-screen--topic sage-guide-screen--compact">
        ${sageBreadcrumbs(ui, nav)}
        ${sageTopicLead(ui.sageGuideDiscoverLead)}
        <div class="sage-guide-cards sage-guide-cards--grid">${cards}</div>
    </div>`;
}

function buildTopicIntro(ui, nav) {
    return sageTopicRich(ui, nav, {
        lead: ui.sageTopicIntroLead,
        steps: [
            { title: ui.sageTopicIntroS1t, text: ui.sageTopicIntroS1b },
            { title: ui.sageTopicIntroS2t, text: ui.sageTopicIntroS2b },
            { title: ui.sageTopicIntroS3t, text: ui.sageTopicIntroS3b },
            { title: ui.sageTopicIntroS4t, text: ui.sageTopicIntroS4b },
            { title: ui.sageTopicIntroS5t, text: ui.sageTopicIntroS5b }
        ],
        fallbackBullets: [
            ui.sageTopicIntroB1 ||
                'Cursos en forma de árbol: ramas (temas) y hojas (lecciones). Tú eliges el camino.',
            ui.sageTopicIntroB2 ||
                'Tu progreso se guarda en este dispositivo; puedes estudiar sin prisa.',
            ui.sageTopicIntroB3 ||
                'El Arcade repasa con minijuegos cuando la lección tiene cuestionario.'
        ]
    });
}

function buildTopicStudy(ui, nav) {
    return sageTopicRich(ui, nav, {
        lead: ui.sageTopicStudyLead,
        steps: [
            { title: ui.sageTopicStudyS1t, text: ui.sageTopicStudyS1b },
            { title: ui.sageTopicStudyS2t, text: ui.sageTopicStudyS2b },
            { title: ui.sageTopicStudyS3t, text: ui.sageTopicStudyS3b },
            { title: ui.sageTopicStudyS4t, text: ui.sageTopicStudyS4b },
            { title: ui.sageTopicStudyS5t, text: ui.sageTopicStudyS5b }
        ],
        fallbackBullets: [
            ui.sageTopicStudyB1 ||
                'Toca una hoja en el mapa para leer; no hace falta seguir un orden fijo.',
            ui.sageTopicStudyB2 ||
                'En cada lección, Sage te muestra dónde estás y qué hacer después.',
            ui.sageTopicStudyB3 || 'Repasa en Arcade o desde tu mochila cuando quieras.'
        ]
    });
}

function buildTopicNavMap(ui, nav) {
    return sageTopicRich(ui, nav, {
        lead: ui.sageTopicNavLead,
        steps: [
            { title: ui.sageTopicNavS1t, text: ui.sageTopicNavS1b },
            { title: ui.sageTopicNavS2t, text: ui.sageTopicNavS2b },
            { title: ui.sageTopicNavS3t, text: ui.sageTopicNavS3b },
            { title: ui.sageTopicNavS4t, text: ui.sageTopicNavS4b }
        ],
        fallbackBullets: [
            ui.sageTopicNavB1 || 'Desliza o arrastra para moverte; pellizco o rueda para zoom.',
            ui.sageTopicNavB2 || 'Toca un círculo (módulo) para expandir; una hoja abre la lección.',
            ui.sageTopicNavB3 || 'El botón 🏠 del dock recentra el mapa.'
        ]
    });
}

function buildTopicGarden(ui, nav) {
    return sageTopicRich(ui, nav, {
        lead: ui.sageTopicGardenLead,
        steps: [
            { title: ui.sageTopicGardenS1t, text: ui.sageTopicGardenS1b },
            { title: ui.sageTopicGardenS2t, text: ui.sageTopicGardenS2b },
            { title: ui.sageTopicGardenS3t, text: ui.sageTopicGardenS3b }
        ],
        fallbackBullets: [
            ui.sageTopicGardenB1 || 'Semillas 🌱 marcan avance al completar módulos.',
            ui.sageTopicGardenB2 || 'La racha premia estudiar un poco cada día.',
            ui.sageTopicGardenB3 || 'La mochila te sugiere qué repasar según lo leído.'
        ]
    });
}

function buildTopicConstructAdd(ui, nav) {
    return sageTopicRich(ui, nav, {
        lead: ui.sageTopicConAddLead,
        steps: [
            { title: ui.sageTopicConAddS1t, text: ui.sageTopicConAddS1b },
            { title: ui.sageTopicConAddS2t, text: ui.sageTopicConAddS2b },
            { title: ui.sageTopicConAddS3t, text: ui.sageTopicConAddS3b },
            { title: ui.sageTopicConAddS4t, text: ui.sageTopicConAddS4b }
        ],
        fallbackBullets: [
            ui.sageTopicConAddB1 || 'Toca un módulo en el mapa y pulsa + (abajo en móvil).',
            ui.sageTopicConAddB2 || 'Elige módulo, lección o examen y ponle nombre.',
            ui.sageTopicConAddB3 || 'Puedes reordenar nodos arrastrando después.'
        ]
    });
}

function buildTopicConstructEdit(ui, store, node, nav) {
    const name = node && node.name ? String(node.name) : '';
    const sel = name
        ? (ui.sageTopicConEditSel || 'Seleccionado: {name}').replace('{name}', name)
        : ui.sageGuideConstructNoSel || 'Toca un nodo del mapa';
    return `<div class="sage-guide-screen sage-guide-screen--topic sage-guide-screen--rich">
        ${sageBreadcrumbs(ui, nav)}
        <p class="sage-topic-lead sage-topic-lead--selection">${escHtml(sel)}</p>
        ${sageTopicLead(ui.sageTopicConEditLead)}
        ${sageStepsList([
            { title: ui.sageTopicConEditS1t, text: ui.sageTopicConEditS1b },
            { title: ui.sageTopicConEditS2t, text: ui.sageTopicConEditS2b },
            { title: ui.sageTopicConEditS3t, text: ui.sageTopicConEditS3b },
            { title: ui.sageTopicConEditS4t, text: ui.sageTopicConEditS4b }
        ]) ||
            sageTopicBullets([
                ui.sageTopicConEditB1 || 'Menú contextual: propiedades, mover, duplicar o borrar.',
                ui.sageTopicConEditB2 || 'Las hojas abren el editor de lección y cuestionario.'
            ])}
    </div>`;
}

function buildTopicConstructPublish(ui, nav) {
    return sageTopicRich(ui, nav, {
        lead: ui.sageTopicConPubLead,
        steps: [
            { title: ui.sageTopicConPubS1t, text: ui.sageTopicConPubS1b },
            { title: ui.sageTopicConPubS2t, text: ui.sageTopicConPubS2b },
            { title: ui.sageTopicConPubS3t, text: ui.sageTopicConPubS3b },
            { title: ui.sageTopicConPubS4t, text: ui.sageTopicConPubS4b }
        ],
        fallbackBullets: [
            ui.sageTopicConPubB1 || 'Cada cambio se guarda al instante en tu dispositivo.',
            ui.sageTopicConPubB2 ||
                'Publicar / actualizar comparte el árbol (barra superior o inferior).',
            ui.sageTopicConPubB3 || 'Puedes deshacer o revertir a una versión guardada.'
        ]
    });
}

function buildTopicScreen(ui, store, ctx, nav) {
    const topicId = (nav && nav.topicId) || '';
    switch (topicId) {
        case 'discover':
            return buildTopicDiscover(ui, nav);
        case 'intro':
            return buildTopicIntro(ui, nav);
        case 'study':
            return buildTopicStudy(ui, nav);
        case 'nav-map':
            return buildTopicNavMap(ui, nav);
        case 'garden':
            return buildTopicGarden(ui, nav);
        case 'construct-add':
            return buildTopicConstructAdd(ui, nav);
        case 'construct-edit':
            return buildTopicConstructEdit(ui, store, ctx.node, nav);
        case 'construct-publish':
            return buildTopicConstructPublish(ui, nav);
        default:
            return buildTopicIntro(ui, nav);
    }
}

/**
 * Light-weight tip → HTML renderer. We deliberately don't pull a markdown lib
 * (Sage tips ship as plain locale strings and we want zero parsing cost). The
 * subset we support is everything the tip copy actually uses today:
 *   • Blank line → paragraph break.
 *   • Lines starting with "• " or "- " → consecutive items form a <ul>.
 *   • Lines starting with "1. " / "2. " etc. → consecutive items form an <ol>.
 *   • `**word**` → <strong>word</strong>.
 *   • Trailing lines that don't match anything else → wrapped in <p>.
 * Everything else is HTML-escaped first, so locale strings can't sneak in
 * unsafe markup.
 */
function renderSageTipBody(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    const blocks = raw.split(/\n{2,}/);
    const html = blocks
        .map((block) => {
            const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
            if (!lines.length) return '';
            const isBulleted = lines.every((l) => /^[•\-]\s+/.test(l));
            const isNumbered = lines.every((l) => /^\d+[.)]\s+/.test(l));
            if (isBulleted) {
                const items = lines
                    .map((l) => l.replace(/^[•\-]\s+/, ''))
                    .map((l) => `<li>${formatInlineMd(l)}</li>`)
                    .join('');
                return `<ul class="sage-tip-list">${items}</ul>`;
            }
            if (isNumbered) {
                const items = lines
                    .map((l) => l.replace(/^\d+[.)]\s+/, ''))
                    .map((l) => `<li>${formatInlineMd(l)}</li>`)
                    .join('');
                return `<ol class="sage-tip-list sage-tip-list--num">${items}</ol>`;
            }
            return `<p>${lines.map(formatInlineMd).join('<br>')}</p>`;
        })
        .filter(Boolean)
        .join('');
    return html;
}

/** Escape + render the `**bold**` subset only. Everything else stays literal. */
function formatInlineMd(line) {
    return escHtml(line).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function buildTipScreen(ui, nav) {
    /* Breadcrumbs replace the old top "Volver" pill AND the bottom-CTA back —
     * both were redundant with the header arrow. Crumbs additionally let the
     * user jump straight to the hub or to the parent topic. The body now goes
     * through `renderSageTipBody` so locale copy can use markdown-style bullets
     * + bold and read as proper guidance instead of a wall of text. */
    const tipText = (nav && nav.tipText) || '';
    const tipTitle = (nav && nav.tipTitle) || '';
    const bodyHtml = renderSageTipBody(tipText);
    return `<div class="sage-guide-screen sage-guide-screen--tip">
        ${sageBreadcrumbs(ui, nav)}
        ${tipTitle ? `<h3 class="sage-topic-title">${escHtml(tipTitle)}</h3>` : ''}
        <div class="sage-tip-body">${bodyHtml || `<p>${escHtml(ui.sageGuideTipEmpty || 'No hay información extra para mostrar aquí.')}</p>`}</div>
    </div>`;
}

function resolveTipText(topicId, ui, store, ctx) {
    const node = ctx.node;
    if (topicId === 'summary' || topicId === 'notes') {
        const fields = getSageNodeFields(node);
        return topicId === 'summary' ? fields.description : fields.notes;
    }
    return getSageSupportResponse(topicId, ui, {
        selectedNode: node,
        previewNode: store.value.previewNode,
        store
    });
}

/**
 * @param {object} ui
 * @param {object} store
 * @param {{ screen: string, topicId?: string, tipText?: string, tipTitle?: string }} nav
 * @param {ReturnType<typeof detectSageGuideContext>} ctx
 */
export function buildSageGuideHtml(ui, store, nav, ctx) {
    if (nav.screen === 'tip') {
        return buildTipScreen(ui, nav);
    }
    if (nav.screen === 'topic' && nav.topicId) {
        return buildTopicScreen(ui, store, ctx, nav);
    }

    if (ctx.mode === 'lesson') return buildLessonHub(ui, store, ctx.node);
    if (ctx.mode === 'construction') return buildConstructionHub(ui, store, ctx.node);
    return buildTreeHub(ui, store);
}

export { resolveTipText };

/** @param {object} ui @param {{ screen: string, topicId?: string, tipTitle?: string }} nav */
function sageGuideScreenLabel(ui, nav) {
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
        'construct-publish': ui.sageTopicConPubTitle || 'Publicar cambios'
    };
    return labels[id] || ui.navBack || 'Volver';
}
