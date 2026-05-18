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

    // Get AI mode from bridge
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

    /** Lesson header tags: @repaso, @id, @grupo, @tags (from lesson.meta). */
    function readLessonMeta(lesson) {
        var m = lesson && lesson.meta;
        if (!m) return { repaso: false, id: '', grupo: '', tags: [] };
        return {
            repaso: !!m.repaso,
            id: String(m.id || ''),
            grupo: String(m.grupo || ''),
            tags: Array.isArray(m.tags) ? m.tags.slice() : []
        };
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
                wrong: (c.traps && c.traps[0]) || c.short_definition || '—'
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
                wrong: (c.traps && c.traps[0]) || '—'
            });
        }
        return items.slice(0, count || 3);
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
            /** { repaso, id, grupo, tags } from lesson.meta */
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
            /** Default empty challenge template */
            template: function() {
                return { core_concept: '', short_definition: '', main_question: '', correct_answer: '', traps: [] };
            },
            /** Build duel/battle cards from lesson questionnaire (static-first). */
            buildDuelDeck: function(lesson) {
                return buildDuelDeckFromChallenge(lesson);
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
            getStatus: function(nodeId) { return bridge.getMemoryStatus(nodeId); },
            isDue: function(nodeId) { return bridge.isMemoryDue(nodeId); },
            report: function(nodeId, quality) { return bridge.reportMemory(nodeId, quality); }
        },
        quiz: async function(lesson, opts) {
            opts = opts || {};
            var count = opts.count != null ? opts.count : 3;
            if (aiMode === 'static') {
                var staticQuiz = staticQuizFromChallenge(lesson, count);
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
