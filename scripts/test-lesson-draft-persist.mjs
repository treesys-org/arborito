import assert from 'node:assert/strict';
import {
    lessonContentFingerprint,
    saveLessonDraft,
    loadLessonDraft,
    clearLessonDraft,
    draftMatchesSavedContent
} from '../src/features/editor/api/logic/lesson-draft-persist.js';

const sourceId = 'test-source';
const nodeId = 'node-1';

clearLessonDraft(sourceId, nodeId);

const fp = lessonContentFingerprint('@info\ntitle: Hi\n@/info\n\n# Intro\n\nHello');
assert.equal(typeof fp, 'string');
assert.ok(fp.includes(':'));

saveLessonDraft({
    sourceId,
    nodeId,
    bodyMarkdown: '# Intro\n\nDraft body',
    headerMetaDraft: { nodeId, title: 'Draft title' },
    activeSectionIndex: 2,
    baseContentFp: fp
});

const loaded = loadLessonDraft(sourceId, nodeId);
assert.ok(loaded);
assert.equal(loaded.bodyMarkdown, '# Intro\n\nDraft body');
assert.equal(loaded.headerMetaDraft.title, 'Draft title');
assert.equal(loaded.activeSectionIndex, 2);
assert.equal(loaded.baseContentFp, fp);

assert.equal(draftMatchesSavedContent(loaded, '@info\ntitle: Hi\n@/info\n\n# Intro\n\nHello'), true);
assert.equal(draftMatchesSavedContent(loaded, '@info\ntitle: Hi\n@/info\n\n# Intro\n\nSaved elsewhere'), false);

clearLessonDraft(sourceId, nodeId);
assert.equal(loadLessonDraft(sourceId, nodeId), null);

console.log('test-lesson-draft-persist: ok');
