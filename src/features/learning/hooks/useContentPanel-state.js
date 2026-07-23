export function lessonDraftStateSig(node, lessonDraftLessonId, lessonBodyMarkdown, lessonDraftNonce) {
    const id = node?.id ?? '';
    if (lessonDraftLessonId !== id || lessonBodyMarkdown == null) return '';
    const s = lessonBodyMarkdown;
    let h = 0;
    const lim = Math.min(s.length, 1200);
    for (let i = 0; i < lim; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return `${s.length}:${h}:${lessonDraftNonce}`;
}

export function createInitialPanelState() {
    return {
        currentNode: null,
        isTocVisible: false,
        activeSectionIndex: 0,
        examStarted: false,
        examShowResults: false,
        quizAttentionNonce: 0,
        blockSessions: {},
        visitedSections: new Set(),
        tocFilter: '',
        quizStates: {},
        quizPassRecord: {},
        lessonDraftLessonId: null,
        lessonBodyMarkdown: null,
        lessonConstructDraft: false,
        lessonDraftNonce: 0,
        lessonUserHasEdited: false,
        lessonSaveState: 'idle',
        lessonLocalDraftState: 'none',
        lessonHistoryStack: [],
        lessonHistoryRedoStack: [],
        tocInlineEditIdx: null,
        headerMetaDraft: null,
        headerMetaSaving: false,
        careFeedbackMsg: null,
        mediaDeclinedLessonId: null,
        mediaConsentNonce: 0,
        mediaConsentForceOpen: false,
    };
}
