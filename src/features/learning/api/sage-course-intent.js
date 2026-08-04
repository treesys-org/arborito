/**
 * Course-vs-app intent guards for Sage.
 * Keep this module free of editor/store/demo imports so unit tests stay light.
 */

/** Strong product UI / feature names (not the loaded syllabus). */
export const STRONG_APP_PRODUCT_RE =
    /\b(arborito|arcade|sage|mochila|backpack|flatpak|aplicaci[oó]n|construcci[oó]n|construction|bosque|forest|memory\s*garden|jard[ií]n)\b/i;

/** “Mis cursos”, section Courses — product UI, not “este curso”. */
export const PRODUCT_COURSES_UI_RE =
    /\b(?:mis|tus|sus)\s+cursos\b|\b(?:my|your)\s+courses\b|\bsecci[oó]n\s+cursos\b|\ben\s+cursos\b|\bcursos\s+(?:de\s+la\s+app|en\s+arborito)\b|\bCourses\s+(?:tab|section)\b/i;

/**
 * Deictic / overview of the *loaded* curriculum (“este curso”, “this course”).
 * Must not be routed to Arborito’s Cursos product docs.
 */
export function isCurriculumCourseDeixis(query) {
    const q = String(query || '').trim();
    if (!q || q.length > 220) return false;
    if (PRODUCT_COURSES_UI_RE.test(q) || STRONG_APP_PRODUCT_RE.test(q)) return false;

    if (
        /\b(?:este|el|mi|nuestro|aquel)\s+curso\b/i.test(q)
        || /\b(?:this|the|my|our|that)\s+course\b/i.test(q)
        || /\b(?:del|de\s+el|de\s+la|de\s+este|de\s+mi)\s+curso\b/i.test(q)
        || /\b(?:de\s+)?(?:qu[eé]|que)\s+trata\s+(?:este\s+|el\s+|mi\s+)?curso\b/i.test(q)
        || /\b(?:de\s+)?(?:qu[eé]|que)\s+habla\s+(?:este\s+|el\s+)?curso\b/i.test(q)
        || /\bwhat\s+(?:is|does)\s+(?:this\s+|the\s+)?course\b/i.test(q)
        || /\b(?:about\s+)?(?:this|the)\s+course\b/i.test(q)
        || /\b(?:resumen|temario|contenido|estructura|temas|m[oó]dulos)\s+(?:del?\s+|de\s+(?:este\s+|el\s+|mi\s+)?)?curso\b/i.test(q)
        || /\b(?:syllabus|outline|overview|modules|topics)\s+(?:of\s+)?(?:this\s+|the\s+)?course\b/i.test(q)
        || /\bcourse\s+(?:overview|syllabus|outline|structure|about)\b/i.test(q)
    ) {
        return true;
    }
    return false;
}

/** True when the user clearly names an Arborito product surface. */
export function hasStrongAppProductSignal(query) {
    const q = String(query || '');
    if (!q) return false;
    if (STRONG_APP_PRODUCT_RE.test(q)) return true;
    if (PRODUCT_COURSES_UI_RE.test(q)) return true;
    /* Bare plural “cursos/courses” as the topic (qué es Cursos) — not “este curso”. */
    if (
        /\b(?:qu[eé]|que|what)\s+(?:es|son|is|are)\s+cursos\b/i.test(q)
        || /\b(?:qu[eé]|que|what)\s+(?:es|son|is|are)\s+courses\b/i.test(q)
        || /\bpara\s+qu[eé]\s+sirve(?:n)?\s+cursos\b/i.test(q)
    ) {
        return true;
    }
    return false;
}

/**
 * Vocab/stem hits that are false friends of the loaded syllabus word “curso”.
 * @param {string[]} hits
 */
export function isWeakCoursesVocabOnly(hits) {
    if (!Array.isArray(hits) || !hits.length) return false;
    return hits.every((h) => /^(cursos|courses|curso|course|bosque|forest)$/i.test(String(h || '')));
}

/** Catalog leaf score that means the user named a concrete lesson. */
export const STRONG_LESSON_SCORE = 28;

/**
 * Decide whether APP_HELP may override outline / course deixis.
 * @returns {'app_help'|'nav_outline'|'lesson_qa'|null} null = keep broader intent logic
 */
export function resolveCourseVsAppIntentGate({
    raw,
    wantsOutline,
    courseHit,
    metaApp,
    shortAppFollow,
    appTopicFollow,
    appHit,
    hasTree,
    leafScore = 0,
}) {
    const text = String(raw || '');
    const deixis = isCurriculumCourseDeixis(text);
    const strongApp = hasStrongAppProductSignal(text);
    const strongLeaf = Number(leafScore) >= STRONG_LESSON_SCORE;

    /*
     * “de qué trata lo de Hola mundo” matches outline regex (“trata”) but names a
     * lesson — never steal into map-only NAV_OUTLINE (that skips lesson bodies).
     */
    if (hasTree && strongLeaf && !deixis && !metaApp && !strongApp && !shortAppFollow) {
        return 'lesson_qa';
    }

    /* Loaded-tree overview always wins over weak “curso→Cursos” product routing. */
    if (hasTree && deixis && !strongApp && !metaApp && !shortAppFollow) {
        return 'nav_outline';
    }

    if (
        hasTree
        && wantsOutline
        && !strongLeaf
        && !strongApp
        && !metaApp
        && !shortAppFollow
        && !appTopicFollow
    ) {
        /* Outline question without a named product — do not steal into APP_HELP. */
        if (!courseHit && appHit && !strongApp) {
            return 'nav_outline';
        }
        if (!appHit || courseHit) {
            return 'nav_outline';
        }
    }

    if (
        (metaApp && !courseHit)
        || appTopicFollow
        || shortAppFollow
        || (appHit && !courseHit && strongApp)
        || (appHit && !courseHit && !wantsOutline && !deixis && !strongLeaf)
    ) {
        return 'app_help';
    }

    if (hasTree && (deixis || (wantsOutline && !strongLeaf)) && !strongApp) {
        return 'nav_outline';
    }

    return null;
}
