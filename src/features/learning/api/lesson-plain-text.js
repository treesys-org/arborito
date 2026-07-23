/**
 * Plain lesson prose for games / TTS / NPC dialogue — strips Treesys author markup.
 */
import { parseArboritoFile } from '../../editor/api/editor-engine.js';
import { FENCED_LESSON_TAGS } from './lesson-fenced-blocks.js';

function stripFencedBlocks(text) {
    let s = String(text || '');
    s = s.replace(/^@quiz\s*\n[\s\S]*?^@\/quiz\s*$/gim, '\n');
    for (const tag of FENCED_LESSON_TAGS) {
        s = s.replace(new RegExp(`^@${tag}\\s*\\n[\\s\\S]*?^@\\/${tag}\\s*$`, 'gim'), '\n');
    }
    s = s.replace(/^@info\s*\n[\s\S]*?^@\/info\s*$/gim, '\n');
    return s;
}

function stripMarkdownNoise(text) {
    let s = String(text || '');
    s = s.replace(/<[^>]*>/g, ' ');
    s = s.replace(/```[\s\S]*?```/g, ' ');
    s = s.replace(/`[^`]*`/g, ' ');
    s = s.replace(/^\s*#+\s+/gm, '');
    s = s.replace(/^\s*>\s+/gm, '');
    s = s.replace(/^\s*\d+\.\s+/gm, '');
    s = s.replace(/^\s*[-*•]\s+/gm, '');
    s = s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');
    s = s.replace(/\*\*(.*?)\*\*/g, '$1');
    s = s.replace(/__(.*?)__/g, '$1');
    s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1');
    s = s.replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1');
    s = s.replace(/\{\{(?:lg|md|sm)\}\}([\s\S]*?)\{\{\/(?:lg|md|sm)\}\}/g, '$1');
    s = s.replace(/@[A-Za-z_][\w-]*/g, ' ');
    s = s.replace(/@\/[A-Za-z_][\w-]*/g, ' ');
    s = s.replace(/^[a-z][a-z0-9_-]*:\s*.+$/gim, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
}

/** @param {string} raw Full lesson markdown from the tree node. */
export function lessonPlainTextForGames(raw) {
    const parsed = parseArboritoFile(String(raw || ''));
    return stripMarkdownNoise(stripFencedBlocks(parsed.body || ''));
}

/** @param {{ raw?: string, text?: string }|string|null|undefined} lesson */
export function lessonPlainTextFromLesson(lesson) {
    if (lesson == null) return '';
    if (typeof lesson === 'string') return lessonPlainTextForGames(lesson);
    const raw = lesson.raw || lesson.text || '';
    return lessonPlainTextForGames(raw);
}
