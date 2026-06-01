/**
 * Injected into Arcade game iframes by game-player.js.
 * Single public surface: window.arborito (lowercase). No window.Arborito.
 *
 * Error convention: thrown Error may have .code in:
 *   AI_TIMEOUT | AI_SAGE_ERROR | AI_PARSE_ERROR | AI_EMPTY_RESPONSE | AI_NETWORK
 */

export function buildGameSdkInjection({ bridgeUser, bridgeAvatar, bridgeLang }) {
    const u = JSON.stringify(bridgeUser);
    const a = JSON.stringify(bridgeAvatar);
    const l = JSON.stringify(bridgeLang);

    return `(function(){
    var bridge = window.parent && window.parent.__ARBORITO_GAME_BRIDGE__;
    if (!bridge) { console.error("[arborito] Bridge not found"); return; }
    var user = { username: ${u}, avatar: ${a}, lang: ${l} };

    var CODES = { TIMEOUT: "AI_TIMEOUT", SAGE: "AI_SAGE_ERROR", PARSE: "AI_PARSE_ERROR", EMPTY: "AI_EMPTY_RESPONSE", NETWORK: "AI_NETWORK" };

    function makeError(code, message) {
        var e = new Error(message || code);
        e.code = code;
        return e;
    }

    function truncateForLog(s, maxLen) {
        maxLen = maxLen || 280;
        if (!s || typeof s !== "string") return "";
        if (s.length <= maxLen) return s;
        return s.substring(0, maxLen) + "…";
    }

    function extractJsonText(raw) {
        var clean = (raw || "").trim();
        if (!clean) return "";
        if (clean.indexOf("🦉") !== -1 && clean.indexOf("ERROR") !== -1) {
            throw makeError(CODES.SAGE, clean);
        }
        var codeBlockRegex = /\`\`\`(?:json)?\\s*([\\s\\S]*?)\\s*\`\`\`/i;
        var mdMatch = clean.match(codeBlockRegex);
        if (mdMatch) clean = mdMatch[1].trim();
        var firstBrace = clean.indexOf('{');
        var firstBracket = clean.indexOf('[');
        var lastBrace = clean.lastIndexOf('}');
        var lastBracket = clean.lastIndexOf(']');
        var start = -1, end = -1;
        if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
            start = firstBrace; end = lastBrace + 1;
        } else if (firstBracket !== -1) {
            start = firstBracket; end = lastBracket + 1;
        }
        if (start !== -1 && end > start) clean = clean.substring(start, end);
        return clean;
    }

    function parseJsonFromModelOutput(raw) {
        var clean = extractJsonText(raw);
        if (!clean) throw makeError(CODES.EMPTY, "AI_EMPTY_RESPONSE: Model returned no JSON.");
        return JSON.parse(clean);
    }

    async function askJSONImpl(promptText, onComplete, options) {
        options = options || {};
        var TIMEOUT_MS = options.timeoutMs != null ? options.timeoutMs : 90000;
        var maxAttempts = options.maxAttempts != null ? options.maxAttempts : 3;
        var lastErr = null;
        var augmented = promptText + "\\n\\nIMPORTANT: Return ONLY valid JSON. Do not include markdown code blocks.";

        for (var attempt = 0; attempt < maxAttempts; attempt++) {
            var timeoutPromise = new Promise(function(_, reject) {
                setTimeout(function() {
                    reject(makeError(CODES.TIMEOUT, "AI_TIMEOUT: The model is taking too long."));
                }, TIMEOUT_MS);
            });
            try {
                var res = await Promise.race([
                    bridge.aiChat([{role: 'user', content: augmented}]),
                    timeoutPromise
                ]);
                var raw = res.rawText || res.text || "";
                var result = parseJsonFromModelOutput(raw);
                if (onComplete && typeof onComplete === 'function') onComplete(result);
                return result;
            } catch (e) {
                lastErr = e;
                var code = e && e.code;
                if (code === CODES.TIMEOUT || code === CODES.SAGE || code === CODES.EMPTY) {
                    console.error("[arborito] ask.json:", code, truncateForLog(e.message));
                    throw e;
                }
                if (attempt < maxAttempts - 1) {
                    console.warn("[arborito] ask.json: parse retry", attempt + 1, "/", maxAttempts, truncateForLog(String(e && e.message)));
                    continue;
                }
                var wrapped = makeError(CODES.PARSE, "AI_PARSE_ERROR: " + (e && e.message ? e.message : String(e)));
                console.error("[arborito] ask.json:", CODES.PARSE, truncateForLog(wrapped.message));
                throw wrapped;
            }
        }
        throw lastErr || makeError(CODES.PARSE, "AI_PARSE_ERROR: Exhausted retries.");
    }

    var aiMode = (typeof bridge.getAIMode === 'function') ? bridge.getAIMode() : 'static';

    // Challenge Schema validation helper
    function isChallengeComplete(challenge) {
        if (!challenge) return false;
        const cc = (challenge.core_concept || '').trim();
        const sd = (challenge.short_definition || '').trim();
        const ca = (challenge.correct_answer || '').trim();
        if (cc && sd && ca) return true;
        const required = ['core_concept', 'short_definition', 'main_question', 'correct_answer'];
        const hasRequired = required.every(function(field) {
            return challenge[field] && String(challenge[field]).trim() !== '';
        });
        const hasTraps = challenge.traps && challenge.traps.length >= 1;
        return hasRequired && hasTraps;
    }

    function getChallengeCompleteness(challenge) {
        if (!challenge) return { complete: false, score: 0, total: 5 };
        const fields = ['core_concept', 'short_definition', 'main_question', 'correct_answer'];
        let score = 0;
        fields.forEach(f => { if (challenge[f] && challenge[f].trim()) score++; });
        if (challenge.traps && challenge.traps.length > 0) score++;
        return { complete: score === 5, score, total: 5 };
    }

    /* Lesson @info block: optional tags list. Spaced-repetition status
       comes from window.arborito.memory.due() / getStatus(lessonId). */
    function readLessonMeta(lesson) {
        var m = lesson && lesson.meta;
        if (!m) return { tags: [] };
        return { tags: Array.isArray(m.tags) ? m.tags.slice() : [] };
    }

    function staticQuizFromChallenge(lesson, count) {
        var c = lesson && lesson.challenge;
        if (!c) return null;
        var items = [];
        if (c.main_question && c.correct_answer) {
            items.push({
                topic: (c.core_concept || lesson.title || 'Topic').substring(0, 40),
                q: c.main_question,
                correct: c.correct_answer,
                wrong: pickStaticWrong(c)
            });
        }
        (c.traps || []).forEach(function(trap, i) {
            if (!trap || !c.main_question) return;
            var trapLabel = String(trap).trim();
            if (trapLabel.length > 36) trapLabel = trapLabel.slice(0, 34) + '…';
            items.push({
                topic: trapLabel || ((c.core_concept || 'Topic') + ' ' + (i + 2)),
                q: c.main_question,
                correct: c.correct_answer,
                wrong: trap
            });
        });
        if (!items.length && c.core_concept && c.short_definition) {
            items.push({
                topic: c.core_concept,
                q: 'What is ' + c.core_concept + '?',
                correct: c.short_definition,
                wrong: pickStaticWrong(c)
            });
        }
        return items.slice(0, count || 3);
    }

    function pickStaticWrong(c) {
        var traps = (c && c.traps) || [];
        for (var i = 0; i < traps.length; i++) {
            var t = String(traps[i] || '').trim();
            if (t && t !== '—') return t;
        }
        if (c && c.short_definition && c.short_definition !== c.correct_answer) {
            return c.short_definition;
        }
        return '—';
    }

    function staticQuizFromLesson(lesson, count) {
        var n = Math.max(1, count || 3);
        var challenges = getChallengesFromLesson(lesson);
        var items = [];
        for (var ci = 0; ci < challenges.length && items.length < n; ci++) {
            var batch = staticQuizFromChallenge({ challenge: challenges[ci], title: lesson && lesson.title }, n - items.length);
            if (batch && batch.length) items = items.concat(batch);
        }
        return items.slice(0, n);
    }

    /** Normalize face text for uniqueness checks (Memory: no duplicate card faces). */
    function memoryFaceKey(s) {
        return String(s || "")
            .replace(/\\s+/g, " ")
            .trim()
            .toLowerCase()
            .replace(/^❓\\s*/u, "")
            .replace(/[^\\p{L}\\p{N}\\s]/gu, "")
            .trim();
    }

    function isMemoryBoilerplateTerm(s) {
        var k = memoryFaceKey(s);
        if (!k || k.length < 2) return true;
        return /^(mini-?prueba|repaso|quiz|test|cuestionario|pregunta)$/.test(k);
    }

    function memoryTokenSet(s) {
        var k = memoryFaceKey(s);
        if (!k) return [];
        return k.split(/\\s+/).filter(function(w) { return w.length >= 2; });
    }

    /** Jaccard overlap on normalized tokens — detects same fact in defn vs correct_answer. */
    function memoryOverlapRatio(a, b) {
        var ta = memoryTokenSet(a);
        var tb = memoryTokenSet(b);
        if (!ta.length || !tb.length) return 0;
        var seen = Object.create(null);
        var inter = 0;
        ta.forEach(function(w) { seen[w] = true; });
        tb.forEach(function(w) { if (seen[w]) inter++; });
        var union = ta.length + tb.length - inter;
        return union ? inter / union : 0;
    }

    function memorySameFact(a, b) {
        if (!a || !b) return false;
        var ka = memoryFaceKey(a);
        var kb = memoryFaceKey(b);
        if (!ka || !kb) return false;
        if (ka === kb) return true;
        if (ka.length >= 8 && kb.length >= 8 && (ka.indexOf(kb) >= 0 || kb.indexOf(ka) >= 0)) return true;
        return memoryOverlapRatio(a, b) >= 0.5;
    }

    function memoryQuestionAboutConceptOnly(question, concept) {
        if (!question || !concept) return false;
        var kq = memoryFaceKey(question);
        var kc = memoryFaceKey(concept);
        if (!kc || kq.indexOf(kc) < 0) return false;
        return /^(que hace|qué hace|what does|was macht|significa|meaning)/.test(kq);
    }

    function getChallengesFromLesson(lesson) {
        if (!lesson) return [];
        if (lesson.challenges && lesson.challenges.length) return lesson.challenges;
        if (lesson.challenge) return [lesson.challenge];
        return [];
    }

    /* =========================================================================
     * Quiz V2 modalities — inlined for cartridge iframes. Mirror of
     * src/features/learning/quiz-v2-schema.js (which the host imports normally).
     * Keep both in sync when the canonical module changes.
     * ========================================================================= */
    var QUIZ_MODE_MULTIPLE = 'multiple';
    var QUIZ_MODE_RECALL = 'recall';
    var QUIZ_MODE_CLOZE = 'cloze';
    var QUIZ_MODE_CHIPS = 'chips';
    var QUIZ_MODE_STEPS = 'steps';
    var ALL_QUIZ_MODES = [QUIZ_MODE_MULTIPLE, QUIZ_MODE_RECALL, QUIZ_MODE_CLOZE, QUIZ_MODE_CHIPS, QUIZ_MODE_STEPS];

    function modesNormalizeChallenge(raw) {
        var c = {
            core_concept: '', short_definition: '', main_question: '', correct_answer: '',
            traps: [], cloze_indices: [], answer_mode: 'chips', steps: [],
            modes: ALL_QUIZ_MODES.slice(), skip_multiple: false, skip_ordering: false
        };
        if (!raw || typeof raw !== 'object') return c;
        c.core_concept = String(raw.core_concept || '').trim();
        c.short_definition = String(raw.short_definition || '').trim();
        c.main_question = String(raw.main_question || '').trim();
        c.correct_answer = String(raw.correct_answer || '').trim();
        c.traps = Array.isArray(raw.traps)
            ? raw.traps.map(function(t) { return String(t || '').trim(); }).filter(Boolean)
            : [];
        c.cloze_indices = Array.isArray(raw.cloze_indices)
            ? raw.cloze_indices.map(function(n) { return parseInt(n, 10); }).filter(function(n) { return !isNaN(n); })
            : [];
        c.answer_mode = raw.answer_mode === 'steps' ? 'steps' : 'chips';
        c.steps = Array.isArray(raw.steps)
            ? raw.steps.map(function(s) { return String(s || '').trim(); }).filter(Boolean)
            : [];
        c.skip_multiple = !!raw.skip_multiple;
        c.skip_ordering = !!raw.skip_ordering;
        if (Array.isArray(raw.modes) && raw.modes.length) {
            c.modes = raw.modes.filter(function(m) { return ALL_QUIZ_MODES.indexOf(m) >= 0; });
        }
        return c;
    }

    function modeIsPlayable(c, mode) {
        switch (mode) {
            case QUIZ_MODE_CLOZE:
                return !!(c.short_definition && c.cloze_indices.length > 0);
            case QUIZ_MODE_MULTIPLE:
                return !!(c.main_question && c.correct_answer && c.traps.length > 0 && !c.skip_multiple);
            case QUIZ_MODE_RECALL:
                return !!(c.core_concept && c.correct_answer);
            case QUIZ_MODE_CHIPS:
                return !!(c.correct_answer && c.correct_answer.indexOf(' ') > 0 && !c.skip_ordering);
            case QUIZ_MODE_STEPS:
                return !!(c.steps.length >= 2 && c.answer_mode === 'steps' && !c.skip_ordering);
            default:
                return false;
        }
    }

    function getPlayableModesImpl(challenge) {
        var n = modesNormalizeChallenge(challenge);
        var derived = ALL_QUIZ_MODES.filter(function(m) { return modeIsPlayable(n, m); });
        if (n.modes && n.modes.length && n.modes.length < ALL_QUIZ_MODES.length) {
            return derived.filter(function(m) { return n.modes.indexOf(m) >= 0; });
        }
        return derived;
    }

    function hashStr(s) {
        var h = 0;
        var str = String(s || '');
        for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
        return Math.abs(h);
    }

    function pickStudyQuizModeImpl(challenge, blockId, salt) {
        var n = modesNormalizeChallenge(challenge);
        var playable = getPlayableModesImpl(n);
        if (!playable.length) return QUIZ_MODE_MULTIPLE;
        var authored = n.modes && n.modes.length && n.modes.length < ALL_QUIZ_MODES.length ? n.modes : null;
        if (authored && authored.length === 1 && playable.indexOf(authored[0]) >= 0) return authored[0];
        return playable[hashStr(String(blockId || '') + ':' + String(salt || '')) % playable.length];
    }

    function shuffleArr(a) {
        var arr = a.slice();
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        }
        return arr;
    }

    function buildOptionsPool(correct, wrongPool, count) {
        var seen = Object.create(null);
        var out = [];
        var c = String(correct || '').trim();
        if (c) { out.push(c); seen[c.toLowerCase()] = true; }
        for (var i = 0; i < (wrongPool || []).length; i++) {
            var t = String(wrongPool[i] || '').trim();
            if (!t || out.length >= count) continue;
            var k = t.toLowerCase();
            if (seen[k]) continue;
            seen[k] = true;
            out.push(t);
        }
        return shuffleArr(out);
    }

    function buildClozeView(c) {
        var words = String(c.short_definition || '').split(/\\s+/).filter(Boolean);
        var idxs = c.cloze_indices || [];
        var blankIdx = idxs.length ? idxs[0] : -1;
        var blankWord = words[blankIdx] || String(c.correct_answer || '');
        var display = words.map(function(w, i) { return idxs.indexOf(i) >= 0 ? '______' : w; }).join(' ');
        return { display: display, blankWord: blankWord };
    }

    function distractorWordsExcept(text, exclude, limit) {
        var ex = String(exclude || '').toLowerCase();
        return String(text || '').split(/\\s+/)
            .map(function(w) { return w.replace(/[.,;:!?]+$/, ''); })
            .filter(function(w) { return w && w.toLowerCase() !== ex && w.length > 1; })
            .slice(0, limit || 3);
    }

    var MODE_PROMPTS = {
        ES: {
            recall: function(concept) { return '¿Qué es «' + concept + '»?'; },
            chips: function(concept) { return 'Ordena las palabras para «' + concept + '».'; },
            steps: function() { return 'Ordena los pasos correctamente.'; }
        },
        EN: {
            recall: function(concept) { return 'What is «' + concept + '»?'; },
            chips: function(concept) { return 'Order the words for «' + concept + '».'; },
            steps: function() { return 'Order the steps correctly.'; }
        }
    };

    function buildModeCardImpl(challenge, mode, opts) {
        opts = opts || {};
        var c = modesNormalizeChallenge(challenge);
        if (!modeIsPlayable(c, mode)) return null;
        var lang = String(opts.lang || 'ES').toUpperCase();
        var prompts = MODE_PROMPTS[lang] || MODE_PROMPTS.ES;
        var lessonTitle = String(opts.lessonTitle || '');
        var optionCount = Math.max(2, Math.min(opts.optionCount || 4, 6));
        var concept = c.core_concept || lessonTitle || 'Concept';

        switch (mode) {
            case QUIZ_MODE_MULTIPLE: {
                var wrong = c.traps.slice();
                if (c.short_definition && c.short_definition !== c.correct_answer) wrong.push(c.short_definition);
                return { mode: mode, concept: concept, question: c.main_question, correct: c.correct_answer,
                    options: buildOptionsPool(c.correct_answer, wrong, optionCount) };
            }
            case QUIZ_MODE_RECALL: {
                var wrongR = c.traps.slice();
                if (c.short_definition && c.short_definition !== c.correct_answer) wrongR.push(c.short_definition);
                return { mode: mode, concept: concept, question: prompts.recall(concept), correct: c.correct_answer,
                    options: buildOptionsPool(c.correct_answer, wrongR, optionCount) };
            }
            case QUIZ_MODE_CLOZE: {
                var view = buildClozeView(c);
                var wrongC = c.traps.slice();
                distractorWordsExcept(c.short_definition, view.blankWord).forEach(function(w) { wrongC.push(w); });
                return { mode: mode, concept: concept, question: view.display, correct: view.blankWord,
                    options: buildOptionsPool(view.blankWord, wrongC, optionCount),
                    clozeDisplay: view.display, blankWord: view.blankWord };
            }
            case QUIZ_MODE_CHIPS: {
                var words = String(c.correct_answer || '').split(/\\s+/).filter(Boolean);
                return { mode: mode, concept: concept, question: prompts.chips(concept),
                    correct: c.correct_answer, sequence: words, chips: shuffleArr(words) };
            }
            case QUIZ_MODE_STEPS: {
                var steps = c.steps.slice();
                return { mode: mode, concept: concept, question: prompts.steps(),
                    correct: steps.join(' → '), sequence: steps, chips: shuffleArr(steps) };
            }
            default:
                return null;
        }
    }

    function buildStudyCardImpl(challenge, blockId, opts) {
        var playable = getPlayableModesImpl(challenge);
        if (!playable.length) return null;
        var picked = pickStudyQuizModeImpl(challenge, blockId, (opts && opts.salt) || '');
        if (playable.indexOf(picked) < 0) picked = playable[0];
        return buildModeCardImpl(challenge, picked, opts);
    }

    /**
     * One Quiz V2 questionnaire = one topic. Wizard steps (conceptos, mini-prueba, huecos)
     * contribute a single union of pairs, not redundant cross-modal duplicates.
     */
    function collectMemoryCandidatesFromChallenge(c) {
        var out = [];
        if (!c) return out;
        var concept = String(c.core_concept || "").trim();
        var defn = String(c.short_definition || "").trim();
        var question = String(c.main_question || "").trim();
        var correct = String(c.correct_answer || "").trim();
        var traps = (c.traps || []).map(function(x) { return String(x || "").trim(); }).filter(Boolean);
        var topicDef = defn || correct;
        var hasTopicPair = false;

        function add(t, d, pri) {
            out.push({ t: t, d: d, pri: pri || 0 });
        }

        if (concept && topicDef && !isMemoryBoilerplateTerm(concept)) {
            add(concept, topicDef, 100);
            hasTopicPair = true;
        } else if (concept && correct && !isMemoryBoilerplateTerm(concept) && !memorySameFact(correct, defn)) {
            add(concept, correct, 95);
            hasTopicPair = true;
        }

        var mcSameAsTopic =
            memorySameFact(correct, defn) ||
            memorySameFact(correct, topicDef) ||
            memoryQuestionAboutConceptOnly(question, concept) ||
            (hasTopicPair && concept && question && memoryFaceKey(question).indexOf(memoryFaceKey(concept)) >= 0);
        if (question && correct && !mcSameAsTopic && !hasTopicPair) {
            var qShort = question.length > 56 ? question.substring(0, 54) + "…" : question;
            if (!/^❓\\s*mini-?prueba/i.test(question)) {
                add(qShort, correct, 40);
            }
        }

        /* Traps are for multiple-choice only — never pair a wrong option with the correct answer in Memory. */

        var steps = (c.steps || []).map(function(s) { return String(s || "").trim(); }).filter(Boolean);
        for (var si = 0; si < steps.length - 1; si++) {
            add(steps[si], steps[si + 1], 20 - si);
        }

        if (defn && Array.isArray(c.cloze_indices) && c.cloze_indices.length) {
            var words = defn.split(/\\s+/).filter(Boolean);
            c.cloze_indices.forEach(function(idx, ci) {
                var w = words[idx];
                if (w && concept && !memorySameFact(w, concept)) {
                    add(w, concept, 12 - ci);
                }
            });
        }

        return out;
    }

    /**
     * Memory pairs: each card face text is globally unique; term ≠ definition.
     * Avoids matching "conceptos básicos" on two different pairs.
     */
    function sanitizeMemoryPairs(rawPairs, maxPairs) {
        var usedFaces = Object.create(null);
        var out = [];
        (rawPairs || []).forEach(function(p) {
            if (!p || out.length >= maxPairs) return;
            var tt = String(p.t || "").replace(/\\s+/g, " ").trim();
            var dd = String(p.d || "").replace(/\\s+/g, " ").trim();
            if (tt.length < 2 || dd.length < 2) return;
            var kt = memoryFaceKey(tt);
            var kd = memoryFaceKey(dd);
            if (!kt || !kd || kt === kd) return;
            if (usedFaces[kt] || usedFaces[kd]) return;
            usedFaces[kt] = true;
            usedFaces[kd] = true;
            out.push({ t: tt.substring(0, 48), d: dd.substring(0, 72) });
        });
        return out;
    }

    function collectFlatMemoryCandidatesFromLessons(lessons) {
        var candidates = [];
        (lessons || []).forEach(function(lesson) {
            getChallengesFromLesson(lesson).forEach(function(c) {
                collectMemoryCandidatesFromChallenge(c).forEach(function(p) {
                    candidates.push(p);
                });
            });
        });
        candidates.sort(function(a, b) { return (b.pri || 0) - (a.pri || 0); });
        return candidates.map(function(p) { return { t: p.t, d: p.d }; });
    }

    function staticMatchPairsFromLessons(lessons, count) {
        var maxPairs = Math.max(1, Math.min(count || 6, 8));
        return sanitizeMemoryPairs(collectFlatMemoryCandidatesFromLessons(lessons), maxPairs);
    }

    function staticMatchPairsFromChallenge(lesson, count) {
        return staticMatchPairsFromLessons([lesson], count);
    }

    function lessonHasMemoryContent(lesson) {
        return getChallengesFromLesson(lesson).some(function(c) {
            return c && (
                (c.core_concept && String(c.core_concept).trim()) ||
                (c.short_definition && String(c.short_definition).trim()) ||
                (c.correct_answer && String(c.correct_answer).trim())
            );
        });
    }

    async function staticMatchPairsWithCurriculumFill(lesson, count, fillFromCurriculum) {
        var n = Math.max(1, Math.min(count || 6, 8));
        var lessons = lesson ? [lesson] : [];
        var pairs = staticMatchPairsFromLessons(lessons, n);
        if (!fillFromCurriculum || pairs.length >= n || !lesson || !lesson.id) return pairs;
        if (!bridge.getCurriculum || typeof bridge.getLessonAt !== 'function') return pairs;

        var curriculum = bridge.getCurriculum() || [];
        var startIdx = -1;
        for (var i = 0; i < curriculum.length; i++) {
            if (curriculum[i] && curriculum[i].id === lesson.id) {
                startIdx = i;
                break;
            }
        }
        if (startIdx < 0) return pairs;

        for (var j = startIdx + 1; j < curriculum.length && pairs.length < n; j++) {
            var nextL = await bridge.getLessonAt(j);
            if (!nextL || !lessonHasMemoryContent(nextL)) continue;
            lessons.push(nextL);
            pairs = staticMatchPairsFromLessons(lessons, n);
        }
        return pairs;
    }

    function shuffleArray(arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    function isGenericQuizTrap(t) {
        var s = String(t || '').trim();
        if (!s || s === '—') return true;
        return /^(ninguna de las anteriores|todas las anteriores|none of the above|all of the above|depende del contexto)$/i.test(s);
    }
    function isGrammarOnlyTrap(t) {
        var s = String(t || '').trim();
        if (!s || s.length <= 2) return true;
        if (/^(der|die|das|den|dem|des|ein|eine?)$/i.test(s)) return true;
        if (/^[-–"']/.test(s) && s.length < 8) return true;
        return false;
    }
    function isMeaningQuestion(q) {
        return /significa|meaning|bedeutet|translate|qué significa/i.test(String(q || ''));
    }
    function filterQuizTraps(traps, correct, concept, mainQuestion) {
        var meaning = isMeaningQuestion(mainQuestion);
        var seen = {};
        if (correct) seen[String(correct).trim().toLowerCase()] = true;
        if (concept) seen[String(concept).trim().toLowerCase()] = true;
        return (traps || []).filter(function(t) {
            t = String(t || '').trim();
            if (!t || isGenericQuizTrap(t)) return false;
            if (meaning && isGrammarOnlyTrap(t)) return false;
            var k = t.toLowerCase();
            if (seen[k]) return false;
            seen[k] = true;
            return true;
        });
    }

    function buildOptions(correct, wrongPool, count) {
        var seen = {};
        var out = [];
        if (correct) { out.push(correct); seen[correct] = true; }
        (wrongPool || []).forEach(function(w) {
            var t = String(w || '').trim();
            if (!t || seen[t] || out.length >= count) return;
            seen[t] = true;
            out.push(t);
        });
        return shuffleArray(out);
    }

    /** Duel / battle cards from Quiz V2 — static-first; same shape in dynamic mode. */
    function buildDuelDeckFromChallenge(lesson) {
        var c = lesson && lesson.challenge;
        if (!c || !c.main_question || !c.correct_answer) return null;
        var title = (lesson && lesson.title) ? lesson.title : 'Lesson';
        var traps = filterQuizTraps(c.traps || [], c.correct_answer, c.core_concept, c.main_question);
        var wrongPool = traps.slice();
        if (!isMeaningQuestion(c.main_question) && c.short_definition && c.short_definition !== c.correct_answer) {
            wrongPool.push(c.short_definition);
        }
        var cards = [];
        cards.push({
            id: 'core',
            name: c.core_concept || title,
            effect: c.short_definition || '',
            question: c.main_question,
            correct: c.correct_answer,
            options: buildOptions(c.correct_answer, wrongPool, 4),
            power: 100
        });
        return cards;
    }

    /* ----------------------------------------------------------------
     * Platform helpers (cartridges receive these for free; no need to
     * duplicate viewport / tap utilities inside each cartridge folder).
     * -------------------------------------------------------------- */
    function escAttr(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
    function escText(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function getScreenSize() {
        var vv = window.visualViewport;
        if (vv) {
            return { width: Math.max(1, Math.round(vv.width)), height: Math.max(1, Math.round(vv.height)) };
        }
        return { width: window.innerWidth, height: window.innerHeight };
    }

    function onScreenChange(callback, observeTargets) {
        var rafId = 0;
        function schedule() {
            if (rafId) return;
            rafId = requestAnimationFrame(function() { rafId = 0; callback(); });
        }
        function onOrient() { setTimeout(schedule, 200); }
        window.addEventListener("resize", schedule);
        window.addEventListener("orientationchange", onOrient);
        if (window.visualViewport) {
            window.visualViewport.addEventListener("resize", schedule);
        }
        var ro = null;
        if (typeof ResizeObserver !== "undefined" && observeTargets) {
            var list = Array.isArray(observeTargets) ? observeTargets : [observeTargets];
            ro = new ResizeObserver(schedule);
            for (var i = 0; i < list.length; i++) {
                if (list[i]) ro.observe(list[i]);
            }
        }
        return function() {
            if (rafId) cancelAnimationFrame(rafId);
            window.removeEventListener("resize", schedule);
            window.removeEventListener("orientationchange", onOrient);
            if (window.visualViewport) {
                window.visualViewport.removeEventListener("resize", schedule);
            }
            if (ro) ro.disconnect();
        };
    }

    function onTap(el, handler) {
        if (!el || typeof handler !== "function") return function() {};
        var sx = 0, sy = 0, lastTouchAt = 0, tracking = false;
        var SLOP = 14;
        function onTouchStart(e) {
            var t = e.touches && e.touches[0];
            if (!t) return;
            sx = t.clientX; sy = t.clientY; tracking = true;
        }
        function onTouchEnd(e) {
            if (!tracking) return;
            tracking = false;
            var t = e.changedTouches && e.changedTouches[0];
            if (!t) return;
            if (Math.abs(t.clientX - sx) > SLOP || Math.abs(t.clientY - sy) > SLOP) return;
            e.preventDefault();
            lastTouchAt = Date.now();
            handler(e);
        }
        function onTouchCancel() { tracking = false; }
        function onClick(e) {
            if (Date.now() - lastTouchAt < 450) return;
            handler(e);
        }
        el.addEventListener("touchstart", onTouchStart, { passive: true });
        el.addEventListener("touchend", onTouchEnd, { passive: false });
        el.addEventListener("touchcancel", onTouchCancel, { passive: true });
        el.addEventListener("click", onClick);
        return function() {
            el.removeEventListener("touchstart", onTouchStart);
            el.removeEventListener("touchend", onTouchEnd);
            el.removeEventListener("touchcancel", onTouchCancel);
            el.removeEventListener("click", onClick);
        };
    }

    /* ----------------------------------------------------------------
     * Quiz V2 UI helpers (rendering chips / options for cartridges that
     * surface the native quiz interaction). Keeps every cartridge from
     * reimplementing the same DOM markup.
     * -------------------------------------------------------------- */
    var MODE_LABELS_I18N = {
        EN: { multiple: "Multiple choice", recall: "Recall", cloze: "Fill blank", chips: "Word order", steps: "Step order" },
        ES: { multiple: "Opción múltiple", recall: "Recuerda", cloze: "Hueco", chips: "Ordena palabras", steps: "Ordena pasos" }
    };
    function modeLabel(mode, lang) {
        var L = MODE_LABELS_I18N[lang] || MODE_LABELS_I18N.EN;
        return L[mode] || mode || "";
    }
    function modeClassName(mode) { return mode ? " is-mode-" + mode : ""; }
    function modeIsOrdering(card) {
        return !!(card && (card.mode === QUIZ_MODE_CHIPS || card.mode === QUIZ_MODE_STEPS));
    }
    function modeCheckOrder(card, picked) {
        if (!card || !card.sequence || !Array.isArray(picked)) return false;
        if (picked.length !== card.sequence.length) return false;
        for (var i = 0; i < picked.length; i++) {
            if (picked[i] !== card.sequence[i]) return false;
        }
        return true;
    }
    function modeRenderAnswers(card, opts) {
        opts = opts || {};
        if (!opts.showOpts) return "";
        var lang = opts.lang === "EN" ? "EN" : "ES";
        var disabled = opts.optsDisabled ? "disabled" : "";
        if (modeIsOrdering(card)) {
            var chips = (card.chips || card.sequence || []).map(function(chip) {
                return '<button type="button" class="seq-chip" data-chip="' + escAttr(chip) + '" ' + disabled + '>' + escText(chip) + '</button>';
            }).join("");
            var pickedLabel = lang === "EN" ? "Your order:" : "Tu orden:";
            var confirmLabel = lang === "EN" ? "Confirm" : "Confirmar";
            return '<div class="seq-wrap" data-mode="' + escAttr(card.mode) + '">' +
                '<p class="seq-hint">' + escText(card.question) + '</p>' +
                '<div class="seq-picked" data-seq-picked><span class="seq-picked-label">' + pickedLabel + '</span> <span class="seq-picked-val"></span></div>' +
                '<div class="seq-chips">' + chips + '</div>' +
                '<button type="button" class="seq-submit" ' + disabled + '>' + confirmLabel + '</button>' +
                '</div>';
        }
        return (card.options || []).map(function(opt, i) {
            return '<button type="button" class="opt-btn" data-value="' + escAttr(opt) + '" ' + disabled + '><kbd>' + (i + 1) + '</kbd>' + escText(opt) + '</button>';
        }).join("");
    }

    window.arborito = {
        user: user,
        /** Error code strings (for games that branch on failure kind). Same as CODES values. */
        ERROR_CODES: CODES,
        /** AI Mode: 'static' (no AI) or 'dynamic' (AI available). Games should check this before using ask.* */
        getAIMode: function() { return aiMode; },
        lesson: {
            next: function() { return bridge.getNextLesson(); },
            list: function() { return bridge.getCurriculum(); },
            at: function(idx) { return bridge.getLessonAt(idx); },
            /* Returns { tags } parsed from the lesson @info block.
               Spaced-repetition is decided by Arborito's SRS engine
               (see arborito.memory.due / getStatus). */
            readMeta: readLessonMeta
        },
        meta: {
            read: readLessonMeta
        },
        /** Challenge Schema utilities for static mode games */
        challenge: {
            /** Check if a challenge object has all required fields */
            isComplete: isChallengeComplete,
            /** Get completeness score (0-5) and status */
            getCompleteness: getChallengeCompleteness,
            /** All Quiz V2 questionnaires on a lesson (challenge + challenges[]) */
            fromLesson: getChallengesFromLesson,
            /** Default empty challenge template */
            template: function() {
                return { core_concept: '', short_definition: '', main_question: '', correct_answer: '', traps: [], cloze_indices: [], steps: [], modes: [] };
            },
            /** Build duel/battle cards from lesson questionnaire (static-first). */
            buildDuelDeck: function(lesson) {
                return buildDuelDeckFromChallenge(lesson);
            },
            /**
             * Quiz V2 modalities (multiple / recall / cloze / chips / steps).
             * Mirrors arborito/src/features/learning/quiz-v2-schema.js so cartridges and
             * Python SDK games can render the full Care/Study experience.
             */
            modes: {
                ALL: ALL_QUIZ_MODES.slice(),
                MULTIPLE: QUIZ_MODE_MULTIPLE,
                RECALL: QUIZ_MODE_RECALL,
                CLOZE: QUIZ_MODE_CLOZE,
                CHIPS: QUIZ_MODE_CHIPS,
                STEPS: QUIZ_MODE_STEPS,
                isPlayable: function(challenge, mode) {
                    return modeIsPlayable(modesNormalizeChallenge(challenge), mode);
                },
                playable: function(challenge) { return getPlayableModesImpl(challenge); },
                pick: function(challenge, blockId, salt) { return pickStudyQuizModeImpl(challenge, blockId, salt); },
                buildCard: function(challenge, mode, opts) { return buildModeCardImpl(challenge, mode, opts); },
                buildStudyCard: function(challenge, blockId, opts) { return buildStudyCardImpl(challenge, blockId, opts); },
                /** Translated mode label, e.g. label('cloze','ES') -> 'Hueco'. */
                label: modeLabel,
                /** CSS class fragment for styling per modality, e.g. " is-mode-cloze". */
                className: modeClassName,
                /** True when the player has to drag chips / steps into order (chips & steps modes). */
                isOrdering: modeIsOrdering,
                /** Compare what the player picked against the card's expected order. */
                checkOrder: modeCheckOrder,
                /** HTML for the answer area (chips for ordering, buttons for multiple-choice).
                 *  opts: { showOpts, optsDisabled, lang }. */
                renderAnswers: modeRenderAnswers
            }
        },
        ask: {
            json: function() {
                if (aiMode === 'static') {
                    throw makeError(CODES.SAGE, 'AI not available in static mode. Switch to Dynamic AI mode to use ask.json.');
                }
                return askJSONImpl.apply(null, arguments);
            },
            chat: function(messages, ctx) {
                if (aiMode === 'static') {
                    throw makeError(CODES.SAGE, 'AI not available in static mode. Switch to Dynamic AI mode to use ask.chat.');
                }
                return bridge.aiChat(messages, ctx);
            }
        },
        xp: function(n) { bridge.addXP(n); },
        exit: function() { bridge.close(); },
        save: function(k, v) { return bridge.save(k, v); },
        load: function(k) { return bridge.load(k); },
        memory: {
            due: function() { return bridge.getDue(); },
            getStatus: function(nodeId) {
                return typeof bridge.getMemoryStatus === 'function' ? bridge.getMemoryStatus(nodeId) : null;
            },
            isDue: function(nodeId) {
                return typeof bridge.isMemoryDue === 'function' ? bridge.isMemoryDue(nodeId) : false;
            },
            report: function(nodeId, quality) { return bridge.reportMemory(nodeId, quality); }
        },
        /** Platform helpers every cartridge gets for free.
         *  Mobile-friendly tap, screen-size probing, and HTML-safe escaping. */
        platform: {
            /** Tap that doesn't fire twice on mobile. Returns a cleanup function. */
            onTap: onTap,
            /** { width, height } of the usable area (accounts for mobile chrome). */
            getScreenSize: getScreenSize,
            /** Subscribe to resize / orientation. Returns a cleanup function. */
            onScreenChange: onScreenChange,
            /** Escape text for safe HTML insertion. */
            escapeHtml: escText,
            /** Escape values for safe attributes. */
            escapeAttr: escAttr
        },
        quiz: async function(lesson, opts) {
            opts = opts || {};
            var count = opts.count != null ? opts.count : 3;
            if (aiMode === 'static') {
                var staticQuiz = staticQuizFromLesson(lesson, count);
                if (!staticQuiz || !staticQuiz.length) {
                    throw makeError(CODES.SAGE, 'STATIC_QUIZ: Fill the lesson questionnaire (Quiz V2) to play in static mode.');
                }
                return staticQuiz;
            }
            var langName = (user.lang === 'ES') ? 'Spanish' : 'English';
            var txt = (lesson && lesson.text) ? lesson.text : '';
            var prompt =
                'Context: "' + txt.substring(0, 800) + '".\\n' +
                'The user language is ' + langName + '.\\n' +
                'Generate ' + count + ' distinct topics based on the context. For each topic, create a short question, a CORRECT answer (max 3 words), and a PLAUSIBLE WRONG answer (max 3 words).\\n' +
                'ALL output (topics, questions, answers) MUST be in ' + langName + '.\\n' +
                'Return ONLY a valid JSON array matching this schema:\\n' +
                '[\\n    { "topic": "Short Topic Name", "q": "Question text", "correct": "Correct Answer", "wrong": "Wrong Answer" }\\n]';
            return await askJSONImpl(prompt, null, opts.askOptions);
        },
        matchPairs: async function(lesson, opts) {
            opts = opts || {};
            var n = opts.count != null ? opts.count : 6;
            var fillFromCurriculum = opts.fillFromCurriculum !== false;
            if (aiMode === 'static') {
                var staticPairs = await staticMatchPairsWithCurriculumFill(lesson, n, fillFromCurriculum);
                if (!staticPairs || staticPairs.length < 1) {
                    throw makeError(CODES.SAGE, 'STATIC_PAIRS: Fill the lesson questionnaire (Quiz V2) to play in static mode.');
                }
                return staticPairs;
            }
            var langName = (user.lang === 'ES') ? 'Spanish' : 'English';
            var txt = (lesson && lesson.text) ? lesson.text : '';
            var prompt =
                'Context: "' + txt.substring(0, 1000) + '".\\n' +
                'Task: Create content for a Memory-style card matching game in ' + langName + '.\\n' +
                'Goal: Generate ' + n + ' pairs of concepts where the player must match a Term with its Definition.\\n' +
                'Rules: Terms 1-3 words; definitions max 6 words; all in ' + langName + '; pairs unique and logically connected.\\n' +
                'Output: ONLY a valid JSON array: [{"t": "Term", "d": "Definition"}, ...]';
            var aiPairs = await askJSONImpl(prompt, null, opts.askOptions);
            var merged = sanitizeMemoryPairs(Array.isArray(aiPairs) ? aiPairs : [], n);
            if (fillFromCurriculum && merged.length < n && lesson) {
                var extraLessons = [lesson];
                var curriculum = bridge.getCurriculum ? bridge.getCurriculum() : [];
                var startIdx = -1;
                for (var fi = 0; fi < curriculum.length; fi++) {
                    if (curriculum[fi] && curriculum[fi].id === lesson.id) {
                        startIdx = fi;
                        break;
                    }
                }
                if (startIdx >= 0 && typeof bridge.getLessonAt === 'function') {
                    for (var fj = startIdx + 1; fj < curriculum.length && merged.length < n; fj++) {
                        var followL = await bridge.getLessonAt(fj);
                        if (!followL || !lessonHasMemoryContent(followL)) continue;
                        extraLessons.push(followL);
                        merged = sanitizeMemoryPairs(
                            merged.concat(staticMatchPairsFromLessons([followL], n)),
                            n
                        );
                    }
                }
            }
            return merged;
        }
    };
})();`;
}
