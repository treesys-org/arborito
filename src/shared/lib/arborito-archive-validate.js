import { leavesByOrderPath } from './arborito-archive.js';
import {
    getChallengeValidationHints,
    findQuizBlocks,
    isQuizBlockClose,
    isQuizBlockOpen
} from '../../features/learning/api/quiz-schema.js';
import { FENCED_LESSON_TAGS, isFencedBlockClose, isFencedBlockOpen } from '../../features/learning/api/lesson-fenced-blocks.js';
const FENCE_LABEL = {
    en: {
        quiz: 'questionnaire',
        info: 'metadata',
        section: 'section',
        subsection: 'subsection',
        image: 'image',
        video: 'video',
        audio: 'audio',
        game: 'game'
    },
    es: {
        quiz: 'cuestionario',
        info: 'metadatos',
        section: 'sección',
        subsection: 'subsección',
        image: 'imagen',
        video: 'vídeo',
        audio: 'audio',
        game: 'juego'
    }
};

function fenceLabel(tag, en) {
    const lang = en ? 'en' : 'es';
    return FENCE_LABEL[lang][tag] || tag;
}

const INFO_KNOWN = new Set(['title', 'icon', 'description', 'exam', 'discussion', 'tags']);

/**
 * Friendly author warnings after import (non-blocking).
 * @param {object} tree
 * @param {'ES'|'EN'|string} [lang]
 * @returns {string[]}
 */
export function validateArboritoTree(tree, lang = 'ES') {
    const en = String(lang || 'ES').toUpperCase().startsWith('EN');
    const warnings = [];
    const langs = Object.keys(tree?.languages || {});

    for (const code of langs) {
        walkNode(tree.languages[code], code, [], warnings, en);
    }

    if (langs.length >= 2) {
        const byLang = {};
        for (const code of langs) {
            byLang[code] = leavesByOrderPath(tree.languages[code]);
        }
        const allKeys = new Set();
        for (const m of Object.values(byLang)) {
            for (const k of m.keys()) allKeys.add(k);
        }
        for (const key of allKeys) {
            const missing = langs.filter((l) => !byLang[l].has(key));
            if (missing.length > 0 && missing.length < langs.length) {
                const present = langs.filter((l) => byLang[l].has(key));
                warnings.push(
                    en
                        ? `Position ${key}: in ${present.join(', ')} but missing in ${missing.join(', ')}`
                        : `Posición ${key}: en ${present.join(', ')} pero falta en ${missing.join(', ')}`
                );
            }
        }
    }

    return warnings.slice(0, 25);
}

function walkNode(node, lang, pathParts, warnings, en) {
    const parts = node.type === 'root' ? pathParts : [...pathParts, node.name];
    const label = parts.join(' / ');

    if (node.type === 'leaf' || node.type === 'exam') {
        validateLessonContent(node.content || '', `${lang}: ${label}`, warnings, en, node.type === 'exam');
        return;
    }

    for (const child of node.children || []) {
        walkNode(child, lang, parts, warnings, en);
    }
}

function validateLessonContent(content, label, warnings, en, isExam) {
    const text = String(content || '');
    if (!text.trim()) {
        warnings.push(en ? `${label}: empty lesson` : `${label}: lección vacía`);
        return;
    }

    const lines = text.split('\n');
    checkUnclosedFences(lines, label, warnings, en);
    checkUnclosedQuiz(lines, label, warnings, en);
    checkUnknownInfoKeys(lines, label, warnings, en);

    const quizBlocks = findQuizBlocks(text);
    if (!quizBlocks.length && isExam) {
        warnings.push(
            en
                ? `${label}: marked as exam but has no questionnaire`
                : `${label}: marcada como examen pero no tiene cuestionario`
        );
    }

    quizBlocks.forEach((block, idx) => {
        const hints = getChallengeValidationHints(block.challenge);
        const blocking = hints;
        if (!blocking.length) return;
        const which =
            quizBlocks.length > 1
                ? en
                    ? `quiz ${idx + 1}`
                    : `cuestionario ${idx + 1}`
                : en
                  ? 'quiz'
                  : 'cuestionario';
        const detail = blocking.map((h) => (en ? h.en : h.es)).join('; ');
        warnings.push(`${label} (${which}): ${detail}`);
    });
}

function checkUnclosedFences(lines, label, warnings, en) {
    for (const tag of FENCED_LESSON_TAGS) {
        let open = 0;
        for (const line of lines) {
            if (isFencedBlockOpen(line, tag)) open++;
            if (isFencedBlockClose(line, tag)) open = Math.max(0, open - 1);
        }
        if (open > 0) {
            const name = fenceLabel(tag, en);
            warnings.push(
                en
                    ? `${label}: unclosed ${name} block`
                    : `${label}: bloque de ${name} sin cerrar`
            );
        }
    }
}

function checkUnclosedQuiz(lines, label, warnings, en) {
    let open = 0;
    for (const line of lines) {
        if (isQuizBlockOpen(line)) open++;
        if (isQuizBlockClose(line)) open = Math.max(0, open - 1);
    }
    if (open > 0) {
        warnings.push(
            en
                ? `${label}: unclosed questionnaire block`
                : `${label}: bloque de cuestionario sin cerrar`
        );
    }
}

function checkUnknownInfoKeys(lines, label, warnings, en) {
    let inInfo = false;
    for (const line of lines) {
        const t = line.trim();
        if (t === '@info') {
            inInfo = true;
            continue;
        }
        if (t === '@/info') {
            inInfo = false;
            continue;
        }
        if (!inInfo) continue;
        const m = t.match(/^([a-z_]+)\s*:/i);
        if (m && !INFO_KNOWN.has(m[1].toLowerCase())) {
            warnings.push(
                en
                    ? `${label}: unknown metadata field "${m[1]}" (ignored)`
                    : `${label}: campo de metadatos desconocido "${m[1]}" (se ignora)`
            );
        }
    }
}
