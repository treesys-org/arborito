import { sharedMixin } from './shared.js';
import { stateMixin } from './state.js';
import { persistenceMixin } from './persistence.js';

/**
 * Lesson editor / TOC construction handlers (split from `content.js`).
 *
 * Shell DnD and draft flush live in React hooks:
 *  - `LessonConstructDnD.jsx` / `useLessonConstructDnD`
 *  - `hooks/useLessonEditor.jsx` — flushConstructEditor + undo stack
 */
export const contentLessonConstructMethods = Object.assign(
    {},
    sharedMixin,
    stateMixin,
    persistenceMixin
);
