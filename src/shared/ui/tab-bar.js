/**
 * tabBarHtml — render a uniform `.arborito-tab-bar` with the given items.
 *
 * Replaces the 3 hand-rolled tab strips (about.js / arcade.js / certificates.js)
 * which used to reapply Tailwind classes in JS via a local `tabClass()` helper.
 *
 * `items`: array of `{ id, label, ariaControls?, extraClass? }`.
 * `activeId`: id of the currently selected tab.
 * `opts`: optional `{ role, ariaLabel, dataAttr }`.
 *   - `dataAttr` (default `data-tab`) is the attribute the JS handler should
 *     listen to (e.g. `[data-tab]` click handler).
 */
export function tabBarHtml(items, activeId, opts) {
    const o = opts || {};
    const role = o.role || 'tablist';
    const ariaLabel = o.ariaLabel ? ` aria-label="${String(o.ariaLabel).replace(/"/g, '&quot;')}"` : '';
    const dataAttr = o.dataAttr || 'data-tab';
    const list = Array.isArray(items) ? items : [];
    const tabs = list
        .map((it) => {
            if (!it || !it.id) return '';
            const isActive = it.id === activeId;
            const aSel = `aria-selected="${isActive ? 'true' : 'false'}"`;
            const aCtrls = it.ariaControls ? ` aria-controls="${it.ariaControls}"` : '';
            const cls = `arborito-tab${isActive ? ' arborito-tab--active' : ''}${it.extraClass ? ' ' + it.extraClass : ''}`;
            return `<button type="button" role="tab" ${aSel}${aCtrls} ${dataAttr}="${it.id}" class="${cls}">${it.label}</button>`;
        })
        .join('');
    return `<div role="${role}"${ariaLabel} class="arborito-tab-bar">${tabs}</div>`;
}
