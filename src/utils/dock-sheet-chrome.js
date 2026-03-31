import { shouldShowMobileUI } from './breakpoints.js';

/**
 * Cromo compartido de “hojas” del dock (búsqueda, arcade, …).
 *
 * Cómo usarlo (sin magia):
 * - Importa `DOCK_SHEET_BODY_WRAP` y pon esa string en el `class` del contenedor
 *   que va justo debajo del hero (fila con ← y título).
 * - El contenido concreto (lista, tabs, etc.) sigue en cada modal.
 *
 * Ejemplos en el repo: `modals/search.js` (modo dock), `modals/arcade-ui.js` (#modal-content móvil).
 */
export const DOCK_SHEET_BODY_WRAP =
    'flex-1 flex flex-col min-h-0 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]';

const MODAL_WIN_X_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true" class="w-[1.125rem] h-[1.125rem]"><path d="M18 6 6 18M6 6l12 12"/></svg>';

function escModalAttr(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

/**
 * Botón × de cierre (ventana emergente), a la derecha del título en la cabecera.
 * @param {object} ui - p. ej. store.ui (usa `close` para aria-label)
 * @param {string} [extraClasses] - clases extra (p. ej. `btn-close` para delegación en Arcade)
 * @param {{ tone?: 'inverse'; showOnMobile?: boolean }} [opts] - `inverse`: cabecera oscura; `showOnMobile`: mostrar × en móvil (por defecto no)
 */
export function modalWindowCloseXHtml(ui, extraClasses = 'btn-close', opts = {}) {
    if (!opts.showOnMobile && shouldShowMobileUI()) return '';
    const label = escModalAttr((ui && ui.close) || 'Close');
    const inv = opts.tone === 'inverse';
    const toneCls = inv ? ' arborito-modal-window-x--inverse' : '';
    const extra = extraClasses ? ` ${extraClasses}` : '';
    return `<button type="button" class="arborito-modal-window-x${extra} shrink-0${toneCls}" aria-label="${label}">${MODAL_WIN_X_SVG}</button>`;
}

/**
 * Flecha ← solo en móvil (sheets / dock). En escritorio las ventanas centradas cierran con ×.
 * @param {string} extraClasses - clases extra (p. ej. `arborito-mmenu-back shrink-0`)
 * @param {{ tagClass?: string; ariaLabel?: string }} [opts] - tagClass: primera clase del botón (p. ej. `btn-close-search`, `btn-release-back`)
 */
export function modalNavBackHtml(ui, extraClasses = 'arborito-mmenu-back shrink-0', opts = {}) {
    if (!shouldShowMobileUI()) return '';
    const label = escModalAttr(opts.ariaLabel || (ui && ui.navBack) || (ui && ui.close) || 'Back');
    const tag = opts.tagClass || 'btn-close';
    return `<button type="button" class="${tag} ${extraClasses}" aria-label="${label}">←</button>`;
}
