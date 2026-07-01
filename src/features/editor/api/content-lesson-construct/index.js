import { sharedMixin } from './shared.js';
import { stateMixin } from './state.js';
import { persistenceMixin } from './persistence.js';
import { modalsMixin } from './modals.js';

/**
 * Lesson editor / TOC construction handlers (split from `content.js`).
 *
 * TOC bindings and shell DnD live in React hooks:
 *  - `LessonEditorToc.jsx` / `useLessonEditorToc`
 *  - `LessonConstructDnD.jsx` / `useLessonConstructDnD`
 *  - `hooks/useLessonEditor.jsx` — markdown draft + undo stack
 */
export const contentLessonConstructMethods = Object.assign(
    {},
    sharedMixin,
    stateMixin,
    persistenceMixin,
    modalsMixin
);
