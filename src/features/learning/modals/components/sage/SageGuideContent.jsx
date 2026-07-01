import { parseNostrTreeUrl } from '../../../../nostr/api/nostr-refs.js';
import { getSageNodeFields, getSageQuizContent } from '../../../api/sage-contextual.js';
import { resolveOpenTreeOwnerDisplay, storedTreeAuthorName } from '../../../../tree-graph/api/tree-owner-display.js';
import {
    defaultSageGuideNav,
    detectSageGuideContext,
} from '../../../api/logic/sage-guide-context.js';
import {
    SageGuideBreadcrumbs,
    SageGuideCard,
    SageGuideHero,
    SageGuideIntro,
    SageGuideQuickRow,
    SageGuideStepsList,
    SageGuideTipBody,
    SageGuideTopicCompact,
    SageGuideTopicLead,
    SageGuideTopicRich,
    SageGuideBullets,
    hasSageGuideBreadcrumbs,
} from './SageGuideParts.jsx';

function treeTitle(learning) {
    const raw = learning.rawGraphData;
    return (raw && raw.meta && (raw.meta.title || raw.meta.name)) || '';
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

function treeCourseDetails(learning, ui, counts) {
    const meta = (learning.rawGraphData && learning.rawGraphData.meta) || {};
    const lines = [];
    const desc = String(meta.description || '').trim();
    if (desc) {
        lines.push(desc.length > 100 ? `${desc.slice(0, 97)}…` : desc);
    } else if (!counts.total) {
        lines.push(ui.sageGuideTreeEmpty || 'Explora el mapa para descubrir el contenido.');
    }
    const storeAdapter = { value: learning };
    let author = storedTreeAuthorName(storeAdapter);
    if (!author) {
        const treeRef = parseNostrTreeUrl(String(learning.activeSource?.url || '').trim());
        if (treeRef) author = resolveOpenTreeOwnerDisplay(storeAdapter, treeRef.pub).label;
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

function buildTreeHub(ui, learning) {
    const title = treeTitle(learning);
    const counts = countLessons(learning.data);
    const countLine = treeCountChip(ui, counts);
    const courseDetails = treeCourseDetails(learning, ui, counts);

    return (
        <div className="sage-guide-screen sage-guide-screen--hub">
            <div className="sage-guide-top sage-guide-top--premium">
                <SageGuideHero
                    icon="🌳"
                    kicker={ui.sageGuideTreeKicker || 'Tu curso ahora'}
                    title={title || (ui.sageGuideTreeUntitled || 'Este árbol')}
                    details={courseDetails}
                    chip={countLine}
                    compact
                />
                <SageGuideIntro ui={ui} variant="tree" />
            </div>
            <div className="sage-guide-cards sage-guide-cards--grid">
                <SageGuideCard
                    icon="🌱"
                    title={ui.sageGuideDiscoverIntro || 'Qué es Arborito'}
                    hint={ui.sageGuideDiscoverIntroHint || 'Mapa, lecciones y Arcade en 30 s'}
                    action="open-topic"
                    topic="intro"
                    parentTopic="discover"
                    tone="amber"
                />
                <SageGuideCard
                    icon="📖"
                    title={ui.sageGuideDiscoverStudy || 'Estudiar'}
                    hint={ui.sageGuideDiscoverStudyHint || 'A tu ritmo, sin orden fijo'}
                    action="open-topic"
                    topic="study"
                    parentTopic="discover"
                    tone="indigo"
                />
                <SageGuideCard
                    icon="🧭"
                    title={ui.sageGuideDiscoverMap || 'Mapa'}
                    hint={ui.sageGuideDiscoverMapHint || 'Zoom, ramas y lecciones'}
                    action="open-topic"
                    topic="nav-map"
                    parentTopic="discover"
                    tone="sky"
                />
                <SageGuideCard
                    icon="🎒"
                    title={ui.sageGuideDiscoverGarden || 'Mochila'}
                    hint={ui.sageGuideDiscoverGardenHint || 'Semillas, racha y repaso'}
                    action="open-topic"
                    topic="garden"
                    parentTopic="discover"
                    tone="emerald"
                />
            </div>
        </div>
    );
}

function buildLessonHub(ui, _learning, node) {
    const fields = getSageNodeFields(node);
    const quiz = getSageQuizContent(node);
    const typeLbl = nodeTypeLabel(node, ui);

    const cards = [
        <SageGuideCard
            key="map"
            icon="🏠"
            title={ui.sageBtnBackMap || 'Volver al mapa'}
            action="go-map"
            tone="slate"
            compact
        />,
        <SageGuideCard
            key="where"
            icon="📍"
            title={ui.sageBtnWhereAmI || '¿Dónde estoy?'}
            action="show-tip"
            topic="where"
            tone="amber"
            compact
        />,
        <SageGuideCard
            key="continue"
            icon="➡️"
            title={ui.sageBtnHowContinue || '¿Qué hago ahora?'}
            action="show-tip"
            topic="continue"
            tone="emerald"
            compact
        />,
    ];

    if (fields.hasDescription) {
        cards.push(
            <SageGuideCard
                key="summary"
                icon="📄"
                title={ui.sageBtnSummary || 'Ver resumen'}
                action="show-tip"
                topic="summary"
                tone="sky"
                compact
            />
        );
    }
    if (fields.hasNotes) {
        cards.push(
            <SageGuideCard
                key="notes"
                icon="💬"
                title={ui.sageBtnExtraInfo || 'Notas extra'}
                action="show-tip"
                topic="notes"
                tone="indigo"
                compact
            />
        );
    }
    if (quiz.hasQuiz) {
        cards.push(
            <SageGuideCard
                key="quiz"
                icon="✅"
                title={ui.sageBtnQuizStatus || 'Estado del cuestionario'}
                action="show-tip"
                topic="quiz-status"
                tone="violet"
                compact
            />
        );
    }

    return (
        <div className="sage-guide-screen sage-guide-screen--hub sage-guide-screen--lesson">
            <div className="sage-guide-top sage-guide-top--premium sage-guide-top--lesson">
                <SageGuideHero
                    icon={node.type === 'exam' ? '⚔️' : '📖'}
                    kicker={typeLbl}
                    title={String(node.name || ui.sageGuideLessonUntitled || 'Esta lección')}
                    chip={
                        quiz.hasQuiz
                            ? quiz.complete
                                ? ui.sageGuideQuizReady || 'Cuestionario listo'
                                : ui.sageGuideQuizDraft || 'Cuestionario incompleto'
                            : ui.sageGuideNoQuiz || 'Sin cuestionario'
                    }
                    compact
                />
            </div>
            <div className="sage-guide-cards sage-guide-cards--grid">{cards}</div>
        </div>
    );
}

function buildConstructionHub(ui, learning, node) {
    const title = treeTitle(learning);
    const nodeName = node && node.name ? String(node.name) : '';
    const nodeType = nodeTypeLabel(node, ui);
    const chip = nodeName
        ? (ui.sageConstructNodeHint || 'Seleccionado: {name}').replace('{name}', nodeName) +
          (nodeType ? ` · ${nodeType}` : '')
        : ui.sageGuideConstructNoSel || 'Toca un nodo del mapa';

    return (
        <div className="sage-guide-screen sage-guide-screen--hub">
            <div className="sage-guide-top sage-guide-top--premium">
                <SageGuideHero
                    icon="👷"
                    kicker={ui.sageConstructGuideSubtitle || ui.navConstruct || 'Modo Construcción'}
                    title={title || (ui.sageGuideTreeUntitled || 'Editando el árbol')}
                    chip={chip}
                    compact
                />
                <SageGuideIntro ui={ui} variant="construction" />
            </div>
            <SageGuideQuickRow
                items={[
                    { label: ui.sageGuideConTourShort || 'Tour', action: 'start-con-tour', tone: 'violet' },
                    { label: ui.sageGuideConExitShort || 'Salir', action: 'exit-construction', tone: 'slate' },
                ]}
            />
            <div className="sage-guide-cards sage-guide-cards--grid">
                <SageGuideCard
                    icon="➕"
                    title={ui.sageGuideConAddShort || 'Añadir'}
                    action="open-topic"
                    topic="construct-add"
                    tone="emerald"
                    compact
                />
                <SageGuideCard
                    icon="✏️"
                    title={ui.sageGuideConEditShort || 'Editar'}
                    action="open-topic"
                    topic="construct-edit"
                    tone="sky"
                    compact
                />
                <SageGuideCard
                    icon="🚀"
                    title={ui.sageGuideConPublishShort || 'Publicar'}
                    action="open-topic"
                    topic="construct-publish"
                    tone="amber"
                    compact
                />
                <SageGuideCard
                    icon="📗"
                    title={ui.sageGuideActDiscoverShort || ui.sageGuideActDiscover || 'Guía'}
                    action="open-topic"
                    topic="discover"
                    tone="indigo"
                    compact
                />
            </div>
        </div>
    );
}

function buildTopicDiscover(ui, nav) {
    return (
        <SageGuideTopicCompact ui={ui} nav={nav}>
            <SageGuideTopicLead text={ui.sageGuideDiscoverLead} />
            <div className="sage-guide-cards sage-guide-cards--grid">
                <SageGuideCard icon="🌱" title={ui.sageGuideDiscoverIntro || 'Qué es'} action="open-topic" topic="intro" parentTopic="discover" tone="amber" compact />
                <SageGuideCard icon="📖" title={ui.sageGuideDiscoverStudy || 'Estudiar'} action="open-topic" topic="study" parentTopic="discover" tone="indigo" compact />
                <SageGuideCard icon="🧭" title={ui.sageGuideDiscoverMap || 'Mapa'} action="open-topic" topic="nav-map" parentTopic="discover" tone="sky" compact />
                <SageGuideCard icon="🎒" title={ui.sageGuideDiscoverGarden || 'Mochila'} action="open-topic" topic="garden" parentTopic="discover" tone="emerald" compact />
            </div>
        </SageGuideTopicCompact>
    );
}

function buildTopicIntro(ui, nav) {
    return (
        <SageGuideTopicRich
            ui={ui}
            nav={nav}
            lead={ui.sageTopicIntroLead}
            features={[
                { icon: '🧭', title: ui.sageTopicIntroS1t, text: ui.sageTopicIntroS1b },
                { icon: '📖', title: ui.sageTopicIntroS2t, text: ui.sageTopicIntroS2b },
                { icon: '🎮', title: ui.sageTopicIntroS3t, text: ui.sageTopicIntroS3b },
                { icon: '🔒', title: ui.sageTopicIntroS4t, text: ui.sageTopicIntroS4b },
                { icon: '👷', title: ui.sageTopicIntroS5t, text: ui.sageTopicIntroS5b },
            ]}
            fallbackBullets={[
                ui.sageTopicIntroB1 ||
                    'Cursos en forma de árbol: ramas (temas) y hojas (lecciones). Tú eliges el camino.',
                ui.sageTopicIntroB2 ||
                    'Tu progreso se guarda en este dispositivo; la cuenta opcional sincroniza borradores.',
                ui.sageTopicIntroB3 || 'El Arcade repasa con minijuegos cuando la lección tiene cuestionario.',
            ]}
        />
    );
}

function buildTopicStudy(ui, nav) {
    return (
        <SageGuideTopicRich
            ui={ui}
            nav={nav}
            lead={ui.sageTopicStudyLead}
            features={[
                { icon: '🌿', title: ui.sageTopicStudyS1t, text: ui.sageTopicStudyS1b },
                { icon: '📖', title: ui.sageTopicStudyS2t, text: ui.sageTopicStudyS2b },
                { icon: '🦉', title: ui.sageTopicStudyS3t, text: ui.sageTopicStudyS3b },
                { icon: '🎮', title: ui.sageTopicStudyS4t, text: ui.sageTopicStudyS4b },
                { icon: '🎒', title: ui.sageTopicStudyS5t, text: ui.sageTopicStudyS5b },
            ]}
            fallbackBullets={[
                ui.sageTopicStudyB1 || 'Toca una hoja en el mapa para leer; no hace falta seguir un orden fijo.',
                ui.sageTopicStudyB2 || 'En cada lección, Sage te muestra dónde estás y qué hacer después.',
                ui.sageTopicStudyB3 || 'Repasa en Arcade o desde tu mochila cuando quieras.',
            ]}
        />
    );
}

function buildTopicNavMap(ui, nav) {
    return (
        <SageGuideTopicRich
            ui={ui}
            nav={nav}
            lead={ui.sageTopicNavLead}
            features={[
                { icon: '👆', title: ui.sageTopicNavS1t, text: ui.sageTopicNavS1b },
                { icon: '🔍', title: ui.sageTopicNavS2t, text: ui.sageTopicNavS2b },
                { icon: '🍃', title: ui.sageTopicNavS3t, text: ui.sageTopicNavS3b },
                { icon: '🏠', title: ui.sageTopicNavS4t, text: ui.sageTopicNavS4b },
            ]}
            fallbackBullets={[
                ui.sageTopicNavB1 || 'Desliza o arrastra para moverte; pellizco o rueda para zoom.',
                ui.sageTopicNavB2 || 'Toca un círculo (módulo) para expandir; una hoja abre la lección.',
                ui.sageTopicNavB3 || 'El botón 🏠 del dock recentra el mapa.',
            ]}
        />
    );
}

function buildTopicGarden(ui, nav) {
    return (
        <SageGuideTopicRich
            ui={ui}
            nav={nav}
            lead={ui.sageTopicGardenLead}
            features={[
                { icon: '🌱', title: ui.sageTopicGardenS1t, text: ui.sageTopicGardenS1b },
                { icon: '🔥', title: ui.sageTopicGardenS2t, text: ui.sageTopicGardenS2b },
                { icon: '🎮', title: ui.sageTopicGardenS3t, text: ui.sageTopicGardenS3b },
            ]}
            fallbackBullets={[
                ui.sageTopicGardenB1 || 'Semillas 🌱 marcan avance al completar módulos.',
                ui.sageTopicGardenB2 || 'La racha premia estudiar un poco cada día.',
                ui.sageTopicGardenB3 || 'La mochila te sugiere qué repasar según lo leído.',
            ]}
        />
    );
}

function buildTopicConstructAdd(ui, nav) {
    return (
        <SageGuideTopicRich
            ui={ui}
            nav={nav}
            lead={ui.sageTopicConAddLead}
            steps={[
                { title: ui.sageTopicConAddS1t, text: ui.sageTopicConAddS1b },
                { title: ui.sageTopicConAddS2t, text: ui.sageTopicConAddS2b },
                { title: ui.sageTopicConAddS3t, text: ui.sageTopicConAddS3b },
                { title: ui.sageTopicConAddS4t, text: ui.sageTopicConAddS4b },
            ]}
            fallbackBullets={[
                ui.sageTopicConAddB1 || 'Toca un módulo en el mapa y pulsa + (abajo en móvil).',
                ui.sageTopicConAddB2 || 'Elige módulo, lección o examen y ponle nombre.',
                ui.sageTopicConAddB3 || 'Puedes reordenar nodos arrastrando después.',
            ]}
        />
    );
}

function buildTopicConstructEdit(ui, node, nav) {
    const name = node && node.name ? String(node.name) : '';
    const sel = name
        ? (ui.sageTopicConEditSel || 'Seleccionado: {name}').replace('{name}', name)
        : ui.sageGuideConstructNoSel || 'Toca un nodo del mapa';
    const steps = [
        { title: ui.sageTopicConEditS1t, text: ui.sageTopicConEditS1b },
        { title: ui.sageTopicConEditS2t, text: ui.sageTopicConEditS2b },
        { title: ui.sageTopicConEditS3t, text: ui.sageTopicConEditS3b },
        { title: ui.sageTopicConEditS4t, text: ui.sageTopicConEditS4b },
    ];
    const hasSteps = steps.some((s) => (s.title && String(s.title).trim()) || (s.text && String(s.text).trim()));

    return (
        <div className="sage-guide-screen sage-guide-screen--topic sage-guide-screen--rich">
            <SageGuideBreadcrumbs ui={ui} nav={nav} />
            <p className="sage-topic-lead sage-topic-lead--selection">{sel}</p>
            <SageGuideTopicLead text={ui.sageTopicConEditLead} />
            {hasSteps ? (
                <SageGuideStepsList steps={steps} />
            ) : (
                <SageGuideBullets
                    bullets={[
                        ui.sageTopicConEditB1 || 'Menú contextual: propiedades, mover, duplicar o borrar.',
                        ui.sageTopicConEditB2 || 'Las hojas abren el editor de lección y cuestionario.',
                    ]}
                />
            )}
        </div>
    );
}

function buildTopicConstructPublish(ui, nav) {
    return (
        <SageGuideTopicRich
            ui={ui}
            nav={nav}
            lead={ui.sageTopicConPubLead}
            steps={[
                { title: ui.sageTopicConPubS1t, text: ui.sageTopicConPubS1b },
                { title: ui.sageTopicConPubS2t, text: ui.sageTopicConPubS2b },
                { title: ui.sageTopicConPubS3t, text: ui.sageTopicConPubS3b },
                { title: ui.sageTopicConPubS4t, text: ui.sageTopicConPubS4b },
            ]}
            fallbackBullets={[
                ui.sageTopicConPubB1 || 'Cada cambio se guarda al instante en tu dispositivo.',
                ui.sageTopicConPubB2 || 'Publicar / actualizar comparte el árbol (barra superior o inferior).',
                ui.sageTopicConPubB3 || 'Puedes deshacer o revertir a una versión guardada.',
            ]}
        />
    );
}

function buildTopicScreen(ui, ctx, nav) {
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
            return buildTopicConstructEdit(ui, ctx.node, nav);
        case 'construct-publish':
            return buildTopicConstructPublish(ui, nav);
        default:
            return buildTopicIntro(ui, nav);
    }
}

function buildTipScreen(ui, nav) {
    const tipText = (nav && nav.tipText) || '';
    const tipTitle = (nav && nav.tipTitle) || '';
    const showCrumbs = hasSageGuideBreadcrumbs(nav);
    const empty = ui.sageGuideTipEmpty || 'No hay información extra para mostrar aquí.';

    return (
        <div className="sage-guide-screen sage-guide-screen--tip">
            <SageGuideBreadcrumbs ui={ui} nav={nav} />
            {!showCrumbs && tipTitle ? <h3 className="sage-topic-title">{tipTitle}</h3> : null}
            <div className="sage-tip-body">
                {tipText ? <SageGuideTipBody text={tipText} /> : <p>{empty}</p>}
            </div>
        </div>
    );
}

function renderGuideScreen(ui, learning, nav, ctx) {
    if (nav.screen === 'tip') return buildTipScreen(ui, nav);
    if (nav.screen === 'topic' && nav.topicId) return buildTopicScreen(ui, ctx, nav);
    if (ctx.mode === 'lesson') return buildLessonHub(ui, learning, ctx.node);
    if (ctx.mode === 'construction') return buildConstructionHub(ui, learning, ctx.node);
    return buildTreeHub(ui, learning);
}

export function SageGuideContent({ ui, learning, nav, ctxOpts }) {
    const ctx = detectSageGuideContext({ value: learning }, ctxOpts);
    const safeNav = nav && nav.screen ? nav : defaultSageGuideNav();
    return (
        <div className="sage-guide-stage">
            <div className="sage-guide-stage__scroll">{renderGuideScreen(ui, learning, safeNav, ctx)}</div>
        </div>
    );
}

export { defaultSageGuideNav, detectSageGuideContext };
