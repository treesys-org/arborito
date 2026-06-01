/**
 * Timeline/version picker moved into the graph curriculum bar (see graph.js).
 * Host kept for index.html / main.js registration; stays hidden.
 */
class ArboritoVersionWidget extends HTMLElement {
    connectedCallback() {
        this.className = 'hidden';
        this.innerHTML = '';
    }
}

customElements.define('arborito-version-widget', ArboritoVersionWidget);
