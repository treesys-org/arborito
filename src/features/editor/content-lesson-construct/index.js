import { sharedMixin } from './shared.js';
import { stateMixin } from './state.js';
import { persistenceMixin } from './persistence.js';
import { modalsMixin } from './modals.js';
import { nodeActionsMixin } from './node-actions.js';
import { tocRenderMixin } from './toc-render.js';
import { tocBindingsMixin } from './toc-bindings.js';
import { dndBindingsMixin } from './dnd-bindings.js';

/**
 * Lesson editor / TOC construction handlers (split from `content.js`).
 *
 * Composed from per-concern partials in this folder:
 *  - `dnd-bindings.js`  — drag-and-drop event wiring (touch/mouse)
 *  - `toc-render.js`    — table-of-contents rendering for the lesson
 *  - `toc-bindings.js`  — handlers for TOC actions (reorder, add, delete)
 *  - `node-actions.js`  — UI-wired node action handlers (rename, set icon, set description)
 *  - `modals.js`        — modal-related helpers (magic overlay)
 *  - `persistence.js`   — calls into `fileSystem` / `store` to persist changes
 *  - `state.js`         — local state mutators (selectedId, drag state, etc.)
 *  - `shared.js`        — small utilities used across the partials
 */
export const contentLessonConstructMethods = Object.assign(
    {},
    sharedMixin,
    stateMixin,
    persistenceMixin,
    modalsMixin,
    nodeActionsMixin,
    tocRenderMixin,
    tocBindingsMixin,
    dndBindingsMixin
);
