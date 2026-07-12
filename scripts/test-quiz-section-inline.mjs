import assert from 'node:assert/strict';
import { parseContent } from '../src/features/learning/api/parser.js';
import { parseArboritoFile } from '../src/features/editor/api/logic/editor-serialize.js';
import {
    buildTocFromBlocks,
    annotateTocWithQuizSections,
    getExpandedQuestionIdsForQuizBlock,
    getExpandedQuestionIdsForSection,
    makeBlockSessionKey,
    isTocSectionCompleted,
} from '../src/features/learning/api/content-toc.js';
import {
    parseQuizBlock,
    serializeQuizBlock,
    challengesSemanticallyEqual,
    expandQuizBlock,
    tokenizeQuizAnswerChips,
} from '../src/features/learning/api/quiz-schema.js';
import { getQuizState } from '../src/features/learning/api/content-panel-quiz.js';

const sampleBody = `# Herbívoros

Los herbívoros comen plantas.

@quiz
items:
  - concept: Vaca
    definition: Animal {herbívoro} doméstico
    question: ¿Qué come una vaca?
    answer: Plantas
    traps:
    - Carne
    - Pescado
  - concept: Ciervo
    definition: {Herbívoro} silvestre
    question: ¿El ciervo es carnívoro?
    answer: No, es herbívoro
    traps:
    - Sí, solo carne
@/quiz

# Carnívoros

@quiz
concept: León
definition: Felino {carnívoro}
question: ¿Qué come un león?
answer: Carne
traps:
- Hierba
- Fruta
@/quiz
`;

const parsed = parseArboritoFile(`@info\ntitle: Test\n@/info\n\n${sampleBody}`);
const blocks = parseContent(parsed.body);
const toc = annotateTocWithQuizSections(blocks, buildTocFromBlocks(blocks));
assert.equal(toc.length, 2);
assert.ok(!toc[0].isQuiz);
assert.equal(toc[1].isQuiz, true);
assert.equal(toc[1].kind, 'quiz');

const quizBlocks = blocks.filter((b) => b.type === 'quiz');
assert.equal(quizBlocks.length, 2);
const herbQuiz = quizBlocks[0];
assert.ok(herbQuiz.items?.length >= 2 || expandQuizBlock(herbQuiz).length === 2);
const herbIds = getExpandedQuestionIdsForQuizBlock(herbQuiz);
assert.deepEqual(herbIds, [`${herbQuiz.id || 'quiz'}:0`, `${herbQuiz.id || 'quiz'}:1`]);
assert.equal(herbQuiz.items?.length, 2);
assert.equal(herbQuiz.items[0].traps?.length, 2);
assert.equal(herbQuiz.items[1].traps?.length, 1);

const section0Ids = getExpandedQuestionIdsForSection(blocks, toc, 0);
assert.equal(section0Ids.length, 2);
const section1Ids = getExpandedQuestionIdsForSection(blocks, toc, 1);
assert.equal(section1Ids.length, 1);

const key = makeBlockSessionKey('node-1', 0, herbQuiz.id || 'quiz');
assert.equal(key, `node-1:0:${herbQuiz.id || 'quiz'}`);

const quizStates = {};
for (const id of section0Ids) {
    quizStates[id] = { finished: true, correct: true };
}
const visited = new Set([0]);
assert.equal(
    isTocSectionCompleted(0, toc, blocks, visited, (id) => getQuizState(quizStates, id)),
    true
);
assert.equal(
    isTocSectionCompleted(0, toc, blocks, new Set(), (id) => getQuizState(quizStates, id)),
    true
);

const itemRoundTrip = parseQuizBlock(
    serializeQuizBlock({
        items: [
            {
                core_concept: 'A',
                short_definition: 'def {one}',
                main_question: 'Q?',
                correct_answer: 'ok',
                traps: ['x'],
                cloze_indices: [0],
                skip_multiple: true,
                steps: ['s1', 's2'],
                skip_ordering: false,
            },
        ],
    }).split('\n').slice(1, -1)
);
assert.ok(challengesSemanticallyEqual(itemRoundTrip, itemRoundTrip));
assert.equal(itemRoundTrip.items.length, 1);
assert.equal(itemRoundTrip.items[0].traps.length, 1);
assert.equal(itemRoundTrip.items[0].skip_multiple, true);

const expanded = expandQuizBlock(herbQuiz);
assert.equal(expanded.length, 2);

assert.deepEqual(tokenizeQuizAnswerChips('(saludo informal) Hola'), ['(saludo informal)', 'Hola']);
assert.deepEqual(tokenizeQuizAnswerChips('I speak English'), ['I', 'speak', 'English']);

console.log('test-quiz-section-inline: ok');
