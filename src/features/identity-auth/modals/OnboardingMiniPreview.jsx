import { ARBORITO_ROOT_LOGO_URL } from '../../../shared/ui/arborito-logo-root.js';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';

/**
 * Autoplay preview: root at bottom + curved trunk.
 * Alternates language course (ES UI → English A1 / EN UI → Spanish A1) with Python.
 * All visible labels follow the UI language.
 */
export function OnboardingMiniPreview({ ui, lang }) {
    const uiLang = String(lang || 'en')
        .toLowerCase()
        .slice(0, 2);
    const uiEs = uiLang === 'es';

    const langCourse = {
        course: uiEs
            ? ui.onboardingMiniDemoLangCourseEs || 'Inglés A1'
            : ui.onboardingMiniDemoLangCourseEn || 'Spanish A1',
        lesson: uiEs
            ? ui.onboardingMiniDemoLangLessonEs || 'Saludos'
            : ui.onboardingMiniDemoLangLessonEn || 'Greetings',
        branch: uiEs
            ? ui.onboardingMiniDemoLangBranchEs || 'Unidad 1'
            : ui.onboardingMiniDemoLangBranchEn || 'Unit 1',
        line1: uiEs
            ? ui.onboardingMiniDemoLangLine1Es || 'Hello!'
            : ui.onboardingMiniDemoLangLine1En || '¡Hola!',
        line2: uiEs
            ? ui.onboardingMiniDemoLangLine2Es || "Hi, I'm Ana."
            : ui.onboardingMiniDemoLangLine2En || 'Me llamo Ana.',
        leafEmoji: '🗣️',
    };

    const pyCourse = {
        course: uiEs
            ? ui.onboardingMiniDemoPyCourseEs || 'Python'
            : ui.onboardingMiniDemoPyCourseEn || 'Python',
        lesson: uiEs
            ? ui.onboardingMiniDemoPyLessonEs || 'Variables'
            : ui.onboardingMiniDemoPyLessonEn || 'Variables',
        branch: uiEs
            ? ui.onboardingMiniDemoPyBranchEs || 'Básicos'
            : ui.onboardingMiniDemoPyBranchEn || 'Basics',
        line1: ui.onboardingMiniDemoPyLine1 || 'x = 3',
        line2: ui.onboardingMiniDemoPyLine2 || 'print(x)',
        leafEmoji: '🍃',
    };

    return (
        <div className="arborito-onb-mini" aria-hidden="true">
            <div className="arborito-onb-mini__stage">
                <MiniMapFrame course={langCourse} variant="lang" />
                <MiniLessonFrame course={langCourse} variant="lang" />
                <MiniMapFrame course={pyCourse} variant="py" />
                <MiniLessonFrame course={pyCourse} variant="py" />
            </div>
        </div>
    );
}

function MiniMapFrame({ course, variant }) {
    return (
        <div className={`arborito-onb-mini__map arborito-onb-mini__map--${variant}`}>
            <div className="arborito-onb-mini__forest">
                <div className="arborito-onb-mini__trunk-col">
                    <svg
                        className="arborito-onb-mini__trunk-svg"
                        viewBox="0 0 40 100"
                        preserveAspectRatio="none"
                    >
                        <path
                            className="arborito-onb-mini__trunk-path"
                            d="M20 92 C18 72 14 58 22 42 C28 30 24 18 20 8"
                        />
                    </svg>
                    <span className="arborito-onb-mini__knot arborito-onb-mini__knot--leaf arborito-onb-mini__knot--pulse">
                        <ChromeEmoji emoji={course.leafEmoji} size={13} />
                    </span>
                    <span className="arborito-onb-mini__knot arborito-onb-mini__knot--mid">
                        <ChromeEmoji emoji="📗" size={14} />
                    </span>
                    <span className="arborito-onb-mini__knot arborito-onb-mini__knot--root">
                        <img
                            src={ARBORITO_ROOT_LOGO_URL}
                            alt=""
                            className="arborito-onb-mini__root-img"
                            draggable={false}
                        />
                    </span>
                </div>
                <div className="arborito-onb-mini__labels">
                    <div className="arborito-onb-mini__vineta arborito-onb-mini__vineta--active">
                        <span className="arborito-onb-mini__vineta-name">{course.lesson}</span>
                        <span className="arborito-onb-mini__vineta-meta">{course.branch}</span>
                    </div>
                    <div className="arborito-onb-mini__vineta">{course.branch}</div>
                    <div className="arborito-onb-mini__course-chip">{course.course}</div>
                </div>
            </div>
        </div>
    );
}

function MiniLessonFrame({ course, variant }) {
    return (
        <div className={`arborito-onb-mini__lesson arborito-onb-mini__lesson--${variant}`}>
            <div className="arborito-onb-mini__lesson-sheet">
                <div className="arborito-onb-mini__lesson-head">
                    <span className="arborito-onb-mini__lesson-emoji">
                        <ChromeEmoji emoji={course.leafEmoji} size={14} />
                    </span>
                    <p className="arborito-onb-mini__lesson-title">{course.lesson}</p>
                </div>
                <div className="arborito-onb-mini__lesson-body">
                    <p className={`arborito-onb-mini__prose${variant === 'py' ? ' arborito-onb-mini__prose--code' : ''}`}>
                        {course.line1}
                        <br />
                        {course.line2}
                    </p>
                    <div className="arborito-onb-mini__quiz-row">
                        <span className="arborito-onb-mini__quiz-dot" />
                        <span className="arborito-onb-mini__quiz-bar" />
                    </div>
                </div>
            </div>
        </div>
    );
}
