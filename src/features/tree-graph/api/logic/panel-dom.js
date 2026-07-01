/**
 * DOM delegation for graph engine mounted under a React root ref.
 */
export const panelDomMethods = {
    querySelector(sel) {
        return this.root?.querySelector(sel) ?? null;
    },
    querySelectorAll(sel) {
        return this.root?.querySelectorAll(sel) ?? [];
    },
    get classList() {
        return this.root?.classList;
    },
    setAttribute(...args) {
        this.root?.setAttribute(...args);
    },
    getAttribute(...args) {
        return this.root?.getAttribute(...args) ?? null;
    },
    hasAttribute(...args) {
        return this.root?.hasAttribute(...args) ?? false;
    },
    removeAttribute(...args) {
        this.root?.removeAttribute(...args);
    },
    appendChild(node) {
        return this.root?.appendChild(node);
    },
    addEventListener(...args) {
        return this.root?.addEventListener(...args);
    },
    removeEventListener(...args) {
        return this.root?.removeEventListener(...args);
    },
    get isConnected() {
        return this.root?.isConnected ?? false;
    },
    closest(sel) {
        return this.root?.closest(sel) ?? null;
    },
    focus() {
        this.root?.focus();
    },
    get children() {
        return this.root?.children;
    },
    get style() {
        return this.root?.style;
    },
    get dataset() {
        return this.root?.dataset;
    },
    get className() {
        return this.root?.className ?? '';
    },
    set className(v) {
        if (this.root) this.root.className = v;
    },
    get parentElement() {
        return this.root?.parentElement ?? null;
    },
    get hidden() {
        return this.root?.hidden ?? false;
    },
    set hidden(v) {
        if (this.root) this.root.hidden = v;
    },
    remove() {
        this.root?.remove();
    },
    getBoundingClientRect() {
        return this.root?.getBoundingClientRect() ?? new DOMRect();
    },
    get clientWidth() {
        return this.root?.clientWidth ?? 0;
    },
    get clientHeight() {
        return this.root?.clientHeight ?? 0;
    },
    get offsetWidth() {
        return this.root?.offsetWidth ?? 0;
    },
    get offsetHeight() {
        return this.root?.offsetHeight ?? 0;
    },
    get scrollTop() {
        return this.root?.scrollTop ?? 0;
    },
    set scrollTop(v) {
        if (this.root) this.root.scrollTop = v;
    },
    get scrollHeight() {
        return this.root?.scrollHeight ?? 0;
    },
    contains(node) {
        return this.root?.contains(node) ?? false;
    },
    replaceChildren(...nodes) {
        this.root?.replaceChildren(...nodes);
    },
    isEmbedded() {
        return this.hasAttribute('embed') || this.getAttribute('data-embed') === '1';
    },
};

/** @param {object} engine */
export function applyPanelDom(engine) {
    for (const key of Object.keys(panelDomMethods)) {
        const desc = Object.getOwnPropertyDescriptor(panelDomMethods, key);
        if (desc) Object.defineProperty(engine, key, desc);
    }
}
