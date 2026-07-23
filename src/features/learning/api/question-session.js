/** Shared linear question session (exam + quiz temario). */

export function createQuestionSession(key, quizIds) {
    const ids = Array.isArray(quizIds) ? quizIds.filter(Boolean) : [];
    return {
        key: String(key || ''),
        quizIds: ids,
        currentIndex: 0,
        awaitingAdvance: false,
        finished: false,
    };
}

export function questionSessionMatches(session, key) {
    return !!(session && session.key === key && !session.finished);
}

export function getActiveQuestionId(session) {
    if (!session || session.finished) return null;
    return session.quizIds[session.currentIndex] || null;
}

export function canAdvanceSession(session) {
    return !!(session && session.awaitingAdvance && !session.finished);
}

export function advanceQuestionSession(session) {
    if (!session) return null;
    const next = { ...session, awaitingAdvance: false };
    const nextIdx = session.currentIndex + 1;
    if (nextIdx < session.quizIds.length) {
        next.currentIndex = nextIdx;
        return next;
    }
    next.finished = true;
    return next;
}

export function backQuestionSession(session) {
    if (!session || session.currentIndex <= 0) return session;
    return {
        ...session,
        currentIndex: session.currentIndex - 1,
        awaitingAdvance: false,
        finished: false,
    };
}

export function syncQuestionSession(existing, key, quizIds) {
    const ids = (Array.isArray(quizIds) ? quizIds : []).map(String);
    if (!ids.length) return { session: null };
    if (
        existing &&
        existing.key === key &&
        existing.quizIds.length === ids.length &&
        existing.quizIds.every((id, i) => id === ids[i])
    ) {
        return { session: existing };
    }
    return { session: createQuestionSession(key, ids) };
}

export function sessionProgressPct(session) {
    if (!session || !session.quizIds.length) return 0;
    const answered = session.awaitingAdvance || session.finished ? 1 : 0;
    return Math.round(((session.currentIndex + answered) / session.quizIds.length) * 100);
}
