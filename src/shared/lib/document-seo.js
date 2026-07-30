/**
 * Document title + social/search meta for the public web shell.
 * Static defaults live in `index.html`; this keeps them aligned when UI language changes.
 */

export const DOCUMENT_SEO = {
    en: {
        title: 'Arborito: Learn anything for free',
        description:
            'Learn any subject as a visual tree of lessons. Free and open source from Treesys: quizzes, Memory Garden, optional Arcade. No ads, no subscription.',
        ogDescription:
            'Learn any subject as a visual tree of lessons. Free and open source: quizzes, Memory Garden, optional Arcade. No ads, no subscription.',
        jsonLdDescription:
            'Free, open-source learning app: explore subjects as interactive lesson maps with quizzes, Memory Garden, and optional Arcade.',
        imageAlt: 'Arborito lesson map',
        locale: 'en_US',
    },
    es: {
        title: 'Arborito: Aprende gratis lo que quieras',
        description:
            'Aprende cualquier tema como un árbol visual de lecciones. Gratis y de código abierto de Treesys: cuestionarios, Jardín de memoria, Arcade opcional. Sin anuncios ni suscripción.',
        ogDescription:
            'Aprende cualquier tema como un árbol visual de lecciones. Gratis y de código abierto: cuestionarios, Jardín de memoria, Arcade opcional. Sin anuncios ni suscripción.',
        jsonLdDescription:
            'App de aprendizaje gratuita y de código abierto: explorá temas como mapas de lecciones interactivos con cuestionarios, Jardín de memoria y Arcade opcional.',
        imageAlt: 'Mapa de lecciones de Arborito',
        locale: 'es_ES',
    },
};

function isSpanishLang(lang) {
    return String(lang || '')
        .trim()
        .toLowerCase()
        .startsWith('es');
}

function setMetaBySelector(selector, attr, value) {
    const el = document.head.querySelector(selector);
    if (!el || value == null) return;
    el.setAttribute(attr, value);
}

/**
 * @param {string} [lang] UI language code (`EN`, `ES`, …). Defaults from `arborito-lang` / `en`.
 */
export function applyDocumentSeo(lang) {
    if (typeof document === 'undefined') return;
    let code = lang;
    if (code == null) {
        try {
            code = localStorage.getItem('arborito-lang') || 'EN';
        } catch {
            code = 'EN';
        }
    }
    const es = isSpanishLang(code);
    const seo = es ? DOCUMENT_SEO.es : DOCUMENT_SEO.en;
    document.documentElement.lang = es ? 'es' : 'en';
    document.title = seo.title;
    setMetaBySelector('meta[name="description"]', 'content', seo.description);
    setMetaBySelector('meta[property="og:title"]', 'content', seo.title);
    setMetaBySelector('meta[property="og:description"]', 'content', seo.ogDescription);
    setMetaBySelector('meta[property="og:locale"]', 'content', seo.locale);
    setMetaBySelector('meta[property="og:image:alt"]', 'content', seo.imageAlt);
    setMetaBySelector('meta[name="twitter:title"]', 'content', seo.title);
    setMetaBySelector('meta[name="twitter:description"]', 'content', seo.ogDescription);
}
