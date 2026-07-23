import { parseNostrTreeUrl } from '../../../../nostr/api/nostr-refs.js';
import { getSageNodeFields } from '../../../api/sage-contextual.js';
import { buildTreeBreadcrumb } from '../../../api/ai-context.js';
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
    SageGuideTipBody,
    SageGuideTopicCompact,
    SageGuideTopicLead,
    SageGuideTopicRich,
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

function fmtLessonGuide(tpl, node, learning) {
    const name = node?.name ? String(node.name) : '';
    const path =
        buildTreeBreadcrumb({ state: learning }, node, { maxChars: 120 }) ||
        (node?.path ? String(node.path).trim() : '') ||
        '…';
    return String(tpl || '')
        .replace(/\{name\}/g, name || '…')
        .replace(/\{path\}/g, path);
}

function nodeTypeLabel(node, ui) {
    if (!node) return '';
    if (node.type === 'leaf') return ui.tagLesson || 'Lesson';
    if (node.type === 'exam') return ui.tagExam || 'Exam';
    if (node.type === 'branch') return ui.tagModule || 'Module';
    if (node.type === 'root') return ui.manualLearnRoots || 'Tree';
    return node.type || '';
}

function treeCourseDetails(learning, ui, counts) {
    const meta = (learning.rawGraphData && learning.rawGraphData.meta) || {};
    const lines = [];
    const desc = String(meta.description || '').trim();
    if (desc) {
        lines.push(desc.length > 100 ? `${desc.slice(0, 97)}…` : desc);
    } else if (!counts.total) {
        lines.push(ui.sageGuideTreeEmpty || 'Explore the map to discover content.');
    }
    const storeAdapter = { value: learning };
    let author = storedTreeAuthorName(storeAdapter);
    if (!author) {
        const treeRef = parseNostrTreeUrl(String(learning.activeSource?.url || '').trim());
        if (treeRef) author = resolveOpenTreeOwnerDisplay(storeAdapter, treeRef.pub).label;
    }
    if (author) {
        lines.push((ui.sageGuideTreeAuthor || 'Author: {author}').replace('{author}', author));
    }
    return lines.join('\n');
}

function treeCountChip(ui, counts) {
    if (!counts.total) return ui.sageGuideTreeEmpty || 'Explore the map to discover content.';
    let line = (ui.sageGuideTreeCount || '{leaves} lessons · {modules} modules')
        .replace('{leaves}', String(counts.leaves))
        .replace('{modules}', String(Math.max(0, counts.modules)));
    if (counts.exams > 0) {
        line += (ui.sageGuideTreeExamsSuffix || ' · {exams} exams').replace('{exams}', String(counts.exams));
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
                    kicker={ui.sageGuideTreeKicker || 'Your course now'}
                    title={title || (ui.sageGuideTreeUntitled || 'This tree')}
                    details={courseDetails}
                    chip={countLine}
                    compact
                />
                <SageGuideIntro ui={ui} variant="tree" />
            </div>
            <div className="sage-guide-cards sage-guide-cards--grid">
                <SageGuideCard
                    icon="🌱"
                    title={ui.sageGuideDiscoverIntro || 'What is Arborito'}
                    hint={ui.sageGuideDiscoverIntroHint || 'Map, lessons & Arcade in 30 s'}
                    action="open-topic"
                    topic="intro"
                    parentTopic="discover"
                    tone="amber"
                />
                <SageGuideCard
                    icon="📖"
                    title={ui.sageGuideDiscoverStudy || 'Study'}
                    hint={ui.sageGuideDiscoverStudyHint || 'At your pace, no fixed order'}
                    action="open-topic"
                    topic="study"
                    parentTopic="discover"
                    tone="indigo"
                />
                <SageGuideCard
                    icon="🧭"
                    title={ui.sageGuideDiscoverMap || 'Map'}
                    hint={ui.sageGuideDiscoverMapHint || 'Zoom, branches & lessons'}
                    action="open-topic"
                    topic="nav-map"
                    parentTopic="discover"
                    tone="sky"
                />
                <SageGuideCard
                    icon="🎒"
                    title={ui.sageGuideDiscoverGarden || 'Backpack'}
                    hint={ui.sageGuideDiscoverGardenHint || 'Seeds, streak & review'}
                    action="open-topic"
                    topic="garden"
                    parentTopic="discover"
                    tone="emerald"
                />
            </div>
        </div>
    );
}

function buildLessonHub(ui, learning, node) {
    const fields = getSageNodeFields(node);
    const typeLbl = nodeTypeLabel(node, ui);
    const inConstruct = !!learning.constructionMode;

    const cards = [
        <SageGuideCard
            key="where"
            icon="📍"
            title={ui.sageBtnWhereAmI || 'Where am I?'}
            hint={ui.sageLessonWhereHint || 'Your place in the tree and this lesson'}
            action="open-topic"
            topic="lesson-where"
            tone="amber"
        />,
        <SageGuideCard
            key="continue"
            icon="➡️"
            title={ui.sageBtnHowContinue || 'What should I do next?'}
            hint={ui.sageLessonContinueHint || 'What to do now in this lesson'}
            action="open-topic"
            topic="lesson-continue"
            tone="emerald"
        />,
    ];

    if (fields.hasDescription) {
        cards.push(
            <SageGuideCard
                key="summary"
                icon="📄"
                title={ui.sageBtnSummary || 'View summary'}
                hint={ui.sageLessonSummaryHint || 'Author summary for this lesson'}
                action="open-topic"
                topic="lesson-summary"
                tone="sky"
            />
        );
    }
    if (fields.hasNotes) {
        cards.push(
            <SageGuideCard
                key="notes"
                icon="💬"
                title={ui.sageBtnExtraInfo || 'Extra notes'}
                hint={ui.sageLessonNotesHint || 'Extra context from the author'}
                action="open-topic"
                topic="lesson-notes"
                tone="indigo"
            />
        );
    }
    if (inConstruct) {
        cards.push(
            <SageGuideCard
                key="quiz-exam-author"
                icon="🎯"
                title={ui.sageBtnQuizExamAuthor || 'Quizzes & exams'}
                hint={ui.sageLessonQuizAuthorHint || 'Authoring quizzes and exams'}
                action="open-topic"
                topic="lesson-quiz-author"
                tone="rose"
            />
        );
    } else if (node.type === 'exam') {
        cards.push(
            <SageGuideCard
                key="exam-student"
                icon="⚔️"
                title={ui.sageBtnExamHelp || 'How does this exam work?'}
                hint={ui.sageLessonExamHint || 'Rules and how to pass'}
                action="open-topic"
                topic="lesson-exam"
                tone="rose"
            />
        );
    }

    return (
        <div className="sage-guide-screen sage-guide-screen--hub">
            <div className="sage-guide-top sage-guide-top--premium">
                <SageGuideHero
                    icon={node.type === 'exam' ? '⚔️' : '📖'}
                    kicker={typeLbl}
                    title={String(node.name || ui.sageGuideLessonUntitled || 'This lesson')}
                    compact
                />
                <SageGuideIntro ui={ui} variant="lesson" />
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
        ? (ui.sageConstructNodeHint || 'Selected: {name}').replace('{name}', nodeName) +
          (nodeType ? ` · ${nodeType}` : '')
        : ui.sageGuideConstructNoSel || 'Tap a node on the map';

    return (
        <div className="sage-guide-screen sage-guide-screen--hub">
            <div className="sage-guide-top sage-guide-top--premium">
                <SageGuideHero
                    icon="👷"
                    kicker={ui.sageConstructGuideSubtitle || ui.navConstruct || 'Construction Mode'}
                    title={title || (ui.sageGuideTreeUntitled || 'Editing the tree')}
                    chip={chip}
                    compact
                />
                <SageGuideIntro ui={ui} variant="construction" />
            </div>
            <SageGuideQuickRow
                items={[
                    { emoji: '🧭', label: ui.sageGuideConTourShort || 'Tour', action: 'start-con-tour', tone: 'violet' },
                    { emoji: '🚪', label: ui.sageGuideConExitShort || 'Exit', action: 'exit-construction', tone: 'slate' },
                ]}
            />
            <div className="sage-guide-cards sage-guide-cards--grid">
                <SageGuideCard
                    icon="➕"
                    title={ui.sageGuideConAddShort || 'Add'}
                    action="open-topic"
                    topic="construct-add"
                    tone="emerald"
                    compact
                />
                <SageGuideCard
                    icon="✏️"
                    title={ui.sageGuideConEditShort || 'Edit'}
                    action="open-topic"
                    topic="construct-edit"
                    tone="sky"
                    compact
                />
                <SageGuideCard
                    icon="🚀"
                    title={ui.sageGuideConPublishShort || 'Publish'}
                    action="open-topic"
                    topic="construct-publish"
                    tone="amber"
                    compact
                />
                <SageGuideCard
                    icon="📗"
                    title={ui.sageGuideActDiscoverShort || ui.sageGuideActDiscover || 'Guide'}
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
                <SageGuideCard icon="🌱" title={ui.sageGuideDiscoverIntro || 'What is'} action="open-topic" topic="intro" parentTopic="discover" tone="amber" compact />
                <SageGuideCard icon="📖" title={ui.sageGuideDiscoverStudy || 'Study'} action="open-topic" topic="study" parentTopic="discover" tone="indigo" compact />
                <SageGuideCard icon="🧭" title={ui.sageGuideDiscoverMap || 'Map'} action="open-topic" topic="nav-map" parentTopic="discover" tone="sky" compact />
                <SageGuideCard icon="🎒" title={ui.sageGuideDiscoverGarden || 'Backpack'} action="open-topic" topic="garden" parentTopic="discover" tone="emerald" compact />
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
                    'Tree-shaped courses: branches (topics) and leaves (lessons). You choose the path.',
                ui.sageTopicIntroB2 ||
                    'Your progress is saved on this device; an optional account syncs drafts.',
                ui.sageTopicIntroB3 || 'Arcade reviews with minigames when a lesson has a quiz.',
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
                ui.sageTopicStudyB1 || 'Tap a leaf on the map to read; no fixed order required.',
                ui.sageTopicStudyB2 || 'In each lesson, Sage shows where you are and what to do next.',
                ui.sageTopicStudyB3 || 'Review in Arcade or from your backpack whenever you want.',
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
                ui.sageTopicNavB1 || 'Swipe or drag to move; pinch or scroll wheel to zoom.',
                ui.sageTopicNavB2 || 'Tap a circle (module) to expand; a leaf opens the lesson.',
                ui.sageTopicNavB3 || 'The 🏠 dock button recenters the map.',
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
                ui.sageTopicGardenB1 || 'Seeds 🌱 mark progress when you complete modules.',
                ui.sageTopicGardenB2 || 'Your streak rewards studying a little every day.',
                ui.sageTopicGardenB3 || 'Your backpack suggests what to review based on what you read.',
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
            features={[
                { icon: '📍', title: ui.sageTopicConAddS1t, text: ui.sageTopicConAddS1b },
                { icon: '➕', title: ui.sageTopicConAddS2t, text: ui.sageTopicConAddS2b },
                { icon: '✏️', title: ui.sageTopicConAddS3t, text: ui.sageTopicConAddS3b },
                { icon: '🔀', title: ui.sageTopicConAddS4t, text: ui.sageTopicConAddS4b },
            ]}
            fallbackBullets={[
                ui.sageTopicConAddB1 || 'Tap a module on the map and press + (bottom on mobile).',
                ui.sageTopicConAddB2 || 'Choose module, lesson, or exam and give it a name.',
                ui.sageTopicConAddB3 || 'You can reorder nodes by dragging afterward.',
            ]}
        />
    );
}

function buildTopicConstructEdit(ui, node, nav) {
    const name = node && node.name ? String(node.name) : '';
    const sel = name
        ? (ui.sageTopicConEditSel || 'Selected: {name}').replace('{name}', name)
        : ui.sageGuideConstructNoSel || 'Tap a node on the map';

    return (
        <SageGuideTopicRich
            ui={ui}
            nav={nav}
            lead={ui.sageTopicConEditLead}
            features={[
                { icon: '👆', title: ui.sageTopicConEditS1t, text: ui.sageTopicConEditS1b },
                { icon: '📖', title: ui.sageTopicConEditS2t, text: ui.sageTopicConEditS2b },
                { icon: '✅', title: ui.sageTopicConEditS3t, text: ui.sageTopicConEditS3b },
                { icon: '🗂️', title: ui.sageTopicConEditS4t, text: ui.sageTopicConEditS4b },
                { icon: '🗑️', title: ui.sageTopicConEditS5t, text: ui.sageTopicConEditS5b },
            ]}
            fallbackBullets={[
                ui.sageTopicConEditB1 || 'Context menu: properties, move, duplicate, or delete.',
                ui.sageTopicConEditB2 || 'Leaves open the lesson and quiz editor.',
            ]}
            footer={<p className="sage-topic-lead sage-topic-lead--selection">{sel}</p>}
        />
    );
}

function buildTopicConstructPublish(ui, nav) {
    return (
        <SageGuideTopicRich
            ui={ui}
            nav={nav}
            lead={ui.sageTopicConPubLead}
            features={[
                { icon: '💾', title: ui.sageTopicConPubS1t, text: ui.sageTopicConPubS1b },
                { icon: '🚀', title: ui.sageTopicConPubS2t, text: ui.sageTopicConPubS2b },
                { icon: '🔗', title: ui.sageTopicConPubS3t, text: ui.sageTopicConPubS3b },
                { icon: '↩️', title: ui.sageTopicConPubS4t, text: ui.sageTopicConPubS4b },
            ]}
            fallbackBullets={[
                ui.sageTopicConPubB1 || 'Every change saves instantly on your device.',
                ui.sageTopicConPubB2 || 'Publish / update shares the tree (top or bottom bar).',
                ui.sageTopicConPubB3 || 'You can undo or revert to a saved version.',
            ]}
        />
    );
}

function buildTopicLessonContinue(ui, nav, node, learning) {
    return (
        <SageGuideTopicRich
            ui={ui}
            nav={nav}
            lead={fmtLessonGuide(ui.sageTopicLessonContinueLead, node, learning)}
            features={[
                { icon: '✅', title: ui.sageTopicLessonContinueS1t, text: ui.sageTopicLessonContinueS1b },
                { icon: '🎮', title: ui.sageTopicLessonContinueS2t, text: ui.sageTopicLessonContinueS2b },
                { icon: '🏠', title: ui.sageTopicLessonContinueS3t, text: ui.sageTopicLessonContinueS3b },
                { icon: '🌱', title: ui.sageTopicLessonContinueS4t, text: ui.sageTopicLessonContinueS4b },
            ]}
        />
    );
}

function buildTopicLessonWhere(ui, nav, node, learning) {
    return (
        <SageGuideTopicRich
            ui={ui}
            nav={nav}
            lead={fmtLessonGuide(ui.sageTopicLessonWhereLead, node, learning)}
            features={[
                {
                    icon: '🧭',
                    title: ui.sageTopicLessonWhereS1t,
                    text: fmtLessonGuide(ui.sageTopicLessonWhereS1b, node, learning),
                },
                { icon: '🏠', title: ui.sageTopicLessonWhereS2t, text: ui.sageTopicLessonWhereS2b },
                { icon: '📑', title: ui.sageTopicLessonWhereS3t, text: ui.sageTopicLessonWhereS3b },
                { icon: '🔍', title: ui.sageTopicLessonWhereS4t, text: ui.sageTopicLessonWhereS4b },
            ]}
        />
    );
}

function buildTopicLessonSummary(ui, nav, node) {
    const fields = getSageNodeFields(node);
    const body = String(fields.description || '').trim();
    return (
        <SageGuideTopicRich
            ui={ui}
            nav={nav}
            lead={ui.sageTopicLessonSummaryLead}
            footer={body ? <SageGuideTipBody text={body} /> : <p>{ui.sageGuideTipEmpty}</p>}
        />
    );
}

function buildTopicLessonNotes(ui, nav, node) {
    const fields = getSageNodeFields(node);
    const body = String(fields.notes || '').trim();
    return (
        <SageGuideTopicRich
            ui={ui}
            nav={nav}
            lead={ui.sageTopicLessonNotesLead}
            footer={body ? <SageGuideTipBody text={body} /> : <p>{ui.sageGuideTipEmpty}</p>}
        />
    );
}

function buildTopicLessonExam(ui, nav) {
    return (
        <SageGuideTopicRich
            ui={ui}
            nav={nav}
            lead={ui.sageTopicLessonExamLead}
            features={[
                { icon: '⚔️', title: ui.sageTopicLessonExamS1t, text: ui.sageTopicLessonExamS1b },
                { icon: '🚫', title: ui.sageTopicLessonExamS2t, text: ui.sageTopicLessonExamS2b },
                { icon: '📖', title: ui.sageTopicLessonExamS3t, text: ui.sageTopicLessonExamS3b },
            ]}
        />
    );
}

function buildTopicLessonQuizAuthor(ui, nav) {
    return (
        <SageGuideTopicRich
            ui={ui}
            nav={nav}
            lead={ui.sageTopicLessonQuizAuthorLead}
            features={[
                { icon: '✅', title: ui.sageTopicLessonQuizAuthorS1t, text: ui.sageTopicLessonQuizAuthorS1b },
                { icon: '⚔️', title: ui.sageTopicLessonQuizAuthorS2t, text: ui.sageTopicLessonQuizAuthorS2b },
                { icon: '🎮', title: ui.sageTopicLessonQuizAuthorS3t, text: ui.sageTopicLessonQuizAuthorS3b },
            ]}
        />
    );
}

function buildTopicScreen(ui, ctx, nav, learning) {
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
        case 'lesson-continue':
            return buildTopicLessonContinue(ui, nav, ctx.node, learning);
        case 'lesson-where':
            return buildTopicLessonWhere(ui, nav, ctx.node, learning);
        case 'lesson-summary':
            return buildTopicLessonSummary(ui, nav, ctx.node);
        case 'lesson-notes':
            return buildTopicLessonNotes(ui, nav, ctx.node);
        case 'lesson-exam':
            return buildTopicLessonExam(ui, nav);
        case 'lesson-quiz-author':
            return buildTopicLessonQuizAuthor(ui, nav);
        default:
            return buildTopicIntro(ui, nav);
    }
}

function renderGuideScreen(ui, learning, nav, ctx) {
    if (nav.screen === 'topic' && nav.topicId) return buildTopicScreen(ui, ctx, nav, learning);
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
