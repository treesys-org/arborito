/**
 * Unit tests: course-vs-app routing for Sage (no Vite/store deps).
 * Run: node --test src/features/learning/api/sage-course-intent.test.mjs
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    isCurriculumCourseDeixis,
    hasStrongAppProductSignal,
    isWeakCoursesVocabOnly,
    resolveCourseVsAppIntentGate,
} from './sage-course-intent.js';
import {
    expandKnownAppStems,
    expandQueryByProductVocab,
    matchVocabByQueryPrefix,
} from './sage-app-stems.js';

describe('isCurriculumCourseDeixis', () => {
    it('detects Spanish whole-course questions', () => {
        assert.equal(isCurriculumCourseDeixis('de que trata este curso?'), true);
        assert.equal(isCurriculumCourseDeixis('de qué trata este curso'), true);
        assert.equal(isCurriculumCourseDeixis('de qeu trata este curso?'), true);
        assert.equal(isCurriculumCourseDeixis('resumen del curso'), true);
        assert.equal(isCurriculumCourseDeixis('temario del curso'), true);
        assert.equal(isCurriculumCourseDeixis('qué temas tiene el curso'), true);
    });

    it('detects English whole-course questions', () => {
        assert.equal(isCurriculumCourseDeixis('what is this course about?'), true);
        assert.equal(isCurriculumCourseDeixis('course overview'), true);
        assert.equal(isCurriculumCourseDeixis('syllabus of this course'), true);
    });

    it('does not steal product UI questions', () => {
        assert.equal(isCurriculumCourseDeixis('qué es Cursos'), false);
        assert.equal(isCurriculumCourseDeixis('mis cursos'), false);
        assert.equal(isCurriculumCourseDeixis('dónde está el bosque'), false);
        assert.equal(isCurriculumCourseDeixis('qué es Arcade'), false);
    });
});

describe('hasStrongAppProductSignal', () => {
    it('flags product surfaces', () => {
        assert.equal(hasStrongAppProductSignal('qué es Arcade'), true);
        assert.equal(hasStrongAppProductSignal('mis cursos'), true);
        assert.equal(hasStrongAppProductSignal('para qué sirve cursos'), true);
        assert.equal(hasStrongAppProductSignal('de qué trata este curso'), false);
    });
});

describe('stem / vocab: curso ≠ Cursos UI', () => {
    it('does not expand singular curso into product RAG terms', () => {
        const q = 'de que trata este curso?';
        assert.equal(expandKnownAppStems(q), q);
        assert.deepEqual(matchVocabByQueryPrefix(q), []);
        assert.equal(expandQueryByProductVocab(q), q);
    });

    it('still treats plural Cursos as product UI', () => {
        const q = 'qué es Cursos';
        assert.equal(hasStrongAppProductSignal(q), true);
        assert.equal(isCurriculumCourseDeixis(q), false);
        const hits = matchVocabByQueryPrefix(q);
        assert.ok(hits.includes('cursos') || /\bcursos\b/i.test(q));
        const expanded = expandQueryByProductVocab(q);
        assert.match(expanded, /cursos/i);
    });

    it('isWeakCoursesVocabOnly', () => {
        assert.equal(isWeakCoursesVocabOnly(['cursos', 'bosque']), true);
        assert.equal(isWeakCoursesVocabOnly(['arcade']), false);
    });
});

describe('resolveCourseVsAppIntentGate', () => {
    it('routes “este curso” to nav_outline when a tree is loaded', () => {
        const gate = resolveCourseVsAppIntentGate({
            raw: 'de que trata este curso?',
            wantsOutline: true,
            courseHit: false,
            metaApp: false,
            shortAppFollow: false,
            appTopicFollow: false,
            appHit: true, // legacy false friend
            hasTree: true,
        });
        assert.equal(gate, 'nav_outline');
    });

    it('routes named lesson + “trata” to lesson_qa (not outline-only)', () => {
        const gate = resolveCourseVsAppIntentGate({
            raw: 'de que trata lo de hola mundo?',
            wantsOutline: true,
            courseHit: true,
            metaApp: false,
            shortAppFollow: false,
            appTopicFollow: false,
            appHit: false,
            hasTree: true,
            leafScore: 90,
        });
        assert.equal(gate, 'lesson_qa');
    });

    it('keeps APP_HELP for real product questions', () => {
        const gate = resolveCourseVsAppIntentGate({
            raw: 'qué es Arcade',
            wantsOutline: false,
            courseHit: false,
            metaApp: false,
            shortAppFollow: false,
            appTopicFollow: false,
            appHit: true,
            hasTree: true,
        });
        assert.equal(gate, 'app_help');
    });

    it('keeps APP_HELP for mis cursos', () => {
        const gate = resolveCourseVsAppIntentGate({
            raw: 'dónde están mis cursos',
            wantsOutline: false,
            courseHit: false,
            metaApp: false,
            shortAppFollow: false,
            appTopicFollow: false,
            appHit: true,
            hasTree: true,
        });
        assert.equal(gate, 'app_help');
    });
});

/* Typo path: “de qeu trata este curso” still has “este curso”. */
describe('typos still deixis via este curso', () => {
    it('este curso alone is enough', () => {
        assert.equal(isCurriculumCourseDeixis('de qeu trata este curso?'), true);
    });
});
