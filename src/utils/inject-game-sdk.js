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

    window.arborito = {
        user: user,
        /** Error code strings (for games that branch on failure kind). Same as CODES values. */
        ERROR_CODES: CODES,
        lesson: {
            next: function() { return bridge.getNextLesson(); },
            list: function() { return bridge.getCurriculum(); },
            at: function(idx) { return bridge.getLessonAt(idx); }
        },
        ask: {
            json: askJSONImpl,
            chat: function(messages, ctx) { return bridge.aiChat(messages, ctx); }
        },
        xp: function(n) { bridge.addXP(n); },
        exit: function() { bridge.close(); },
        save: function(k, v) { return bridge.save(k, v); },
        load: function(k) { return bridge.load(k); },
        memory: {
            due: function() { return bridge.getDue(); },
            report: function(nodeId, quality) { return bridge.reportMemory(nodeId, quality); }
        },
        quiz: async function(lesson, opts) {
            opts = opts || {};
            var count = opts.count != null ? opts.count : 3;
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
            var langName = (user.lang === 'ES') ? 'Spanish' : 'English';
            var txt = (lesson && lesson.text) ? lesson.text : '';
            var prompt =
                'Context: "' + txt.substring(0, 1000) + '".\\n' +
                'Task: Create content for a Memory-style card matching game in ' + langName + '.\\n' +
                'Goal: Generate ' + n + ' pairs of concepts where the player must match a Term with its Definition.\\n' +
                'Rules: Terms 1-3 words; definitions max 6 words; all in ' + langName + '; pairs unique and logically connected.\\n' +
                'Output: ONLY a valid JSON array: [{"t": "Term", "d": "Definition"}, ...]';
            return await askJSONImpl(prompt, null, opts.askOptions);
        }
    };
})();`;
}
