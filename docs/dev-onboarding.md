# Developer onboarding — Arborito está organizado por features

Si el repo te parece grande, **es normal** para una UI de escritorio + web con muchas pantallas. La estructura sigue **una sola regla**: cada cosa vive junto a las cosas con las que comparte significado, no junto a las cosas que casualmente son del mismo tipo técnico.

## Cómo leer el árbol — sólo hay tres conceptos

```
arborito/src/
├── boot.js  main.js  app-entry.js   ← entry points (los carga index.html)
│
├── core/                            ← el "motor": estado central, i18n, store
│   ├── store.js                     central god-store (~2k líneas)
│   ├── ui-store.js                  estado de UI (modo construcción, modal activo, idioma…)
│   ├── store-mixins/                lo veremos abajo — los métodos viven en cada feature
│   ├── user-store/                  datos locales del usuario (bookmarks, progreso, gamification…)
│   ├── version.js                   ARBORITO_BUILD_ID (bumpeado por CI en cada release)
│   ├── i18n.js / i18n-runtime.js    motor de traducciones
│
├── shared/                          ← lo que de verdad usan >1 features
│   ├── ui/                          modal-shell, modal-hero, callout, loading,
│   │                                mobile-tap, breakpoints, component, tab-bar,
│   │                                modal-overlay-host, toast-stack, dialog, …
│   ├── lib/                         html-escape, base58btc, http-fetch,
│   │                                user-handle, locale-rich-html, …
│   └── styles/                      tokens + reset + utilities + modal layout
│       ├── main.entry.css           Tailwind input (la cadena de @import)
│       ├── main.css                 **NO EDITAR** — generado por Tailwind
│       ├── foundation/              tokens, reset, scroll
│       ├── layout/                  app-flex-and-pointer-hosts
│       ├── utilities/               CTAs, callouts, pills, forms, modal base
│       ├── modals/                  desktop dock layout, mobile sheets, host
│       └── runtime-overrides/       cadena suelta cargada como `<link>` aparte
│
└── features/                        ← una carpeta por dominio funcional
    ├── tree-graph/                  vista del árbol, presentación, mutaciones
    ├── learning/                    lecciones, quiz player, sage tutor, AI
    ├── editor/                      modo construcción + editor + drag-drop TOC
    ├── garden-progress/             mochila 🎒, gamificación, jardín, certificados
    ├── arcade/                      Arcade + games + cartridges
    ├── sources/                     catálogo de árboles (Trees & libraries)
    ├── identity-auth/               profile, sign-in/sign-up, onboarding, escrow
    ├── nostr/                       cliente Nostr + admin de governance
    ├── p2p-webtorrent/              WebTorrent + global directory
    ├── publishing/                  publicar/revocar, import/export, license, reports
    ├── forum/                       foro / community
    ├── backup-export/               filesystem service, backup, export PDF
    ├── search/                      search index + worker + UI
    ├── privacy-gdpr/                consentimiento red/social, modal de privacidad
    ├── shell-chrome/                sidebar, header desktop, dock móvil, language picker, about
    ├── tour/                        product tour
    └── version-updates/             widget de versión + releases service
```

## ¿Dónde busco X?

| Si quieres tocar… | Vas a… |
|---|---|
| Cómo se ve el árbol, navegación de nodos | `src/features/tree-graph/` |
| Una lección, el quiz, la tutor IA | `src/features/learning/` |
| El modo construcción / editor | `src/features/editor/` |
| La mochila 🎒 / racha / lúmenes / certificados | `src/features/garden-progress/` |
| El sidebar / header / dock móvil | `src/features/shell-chrome/` |
| El modal de Profile / login / onboarding | `src/features/identity-auth/` |
| Crear o cambiar **un modal nuevo de UX común** | `src/shared/ui/modal-shell.js` (helper) + tu feature |
| Un helper que usan varias features | `src/shared/ui/` o `src/shared/lib/` |
| Estilos compartidos | `src/shared/styles/` |
| Estilos específicos de una feature | `src/features/{feature}/styles/` |
| Estado global / suscriptores `state-change` | `src/core/store.js` + mixin de la feature en `src/features/{feature}/store-mixins/` |

## Mental model: store + mixins por feature

Hay **un solo store global** (`src/core/store.js`, ~2k líneas) con **un solo stream de eventos** (`state-change`). Cada componente se re-renderiza escuchando ese stream.

Los **métodos** del store no viven todos en `store.js` (sería de 8k líneas). Cada feature aporta su lote en `src/features/{feature}/store-mixins/store-{algo}-methods.js`. Esos archivos se montan con `Object.assign(ArboritoStore.prototype, {…})`, así que `this` sigue siendo el singleton. Solo `store.js` los importa; el resto del código llama `store.xxx()` sin saber dónde están.

Aparte hay **stores independientes** dentro de la feature que los necesita (`forum/forum-store.js`, `tree-graph/graph-logic.js`, `sources/source-manager.js`, `learning/ai-logic.js`, `backup-export/storage-manager.js`). El `store.js` central los instancia.

Y hay `src/core/user-store/` con los datos locales del usuario (bookmarks, gamification, installed-games, inventory, local-tree-*, progress, srs-memory, streak). Es un slice grande y compartido — por eso vive en `core/`, no dentro de una feature.

## Web components

`<arborito-*>` se definen con `customElements.define`. Los grandes (sidebar, modals con muchas pestañas) usan el **patrón mixin**: el custom element vive en `xxx.js` y delega métodos a `xxx-*-mixin.js` en una sub-carpeta `xxx-mixins/`. Pattern:

```js
Object.assign(ArboritoModalProfile.prototype, identityMixin, signinMixin, toolsMixin, prefsMixin);
customElements.define('arborito-modal-profile', ArboritoModalProfile);
```

## CSS

Tailwind compila `src/shared/styles/main.entry.css` (que `@import`a tanto los partials shared como los de cada feature) en `src/shared/styles/main.css`. Corré `npm run build:css` después de tocar cualquier CSS, o usá `npm start` / `npm run dist`, que compilan primero.

`main.css` está bloqueado por hook (`.cursor/hooks/no-touch-generated.py`) y por `.cursorignore` — **es output, nunca lo edites a mano**.

## Helpers UX obligatorios

Antes de pegar HTML/Tailwind a mano para un modal nuevo, usá:

- `src/shared/ui/modal-shell.js` — `modalShellHtml({...})`
- `src/shared/ui/modal-hero.js` — `modalHeroHtml(ui, {...})`
- `src/shared/ui/callout.js` — `calloutHtml(...)`
- `src/shared/ui/loading.js` — `loadingHtml(...)`
- `src/shared/ui/mobile-tap.js` — `bindCloseTaps(...)`

Si un modal nuevo **no** los usa, hay que refactorizarlo — no está siguiendo la filosofía. Ver [`docs/MODAL_STANDARDS.md`](MODAL_STANDARDS.md) (**lectura obligada**).

## Documentos vinculados

1. [`docs/MODAL_STANDARDS.md`](MODAL_STANDARDS.md) — obligatorio antes de tocar cualquier modal.
2. [`src/shared/styles/README.md`](../src/shared/styles/README.md) — pipeline CSS.
3. [`CONTRIBUTING.md`](../CONTRIBUTING.md) — patrones de componentes y estilos.
4. [`docs/AI_INTEGRATION.md`](AI_INTEGRATION.md) — tutor IA opcional (engines, modelos, paths por OS).
5. [`docs/NOSTR_RELAYS_CONFIGURATION.md`](NOSTR_RELAYS_CONFIGURATION.md) — relays default y overrides.
6. [`docs/MILLIONS_SCALE_ARCHITECTURE.md`](MILLIONS_SCALE_ARCHITECTURE.md) — Nostr (control plane) + WebTorrent (data plane).

## Entry points y carga

| Path | Qué es |
|------|--------|
| `index.html` | Carga `src/boot.js` (los importmaps de Nostr/Noble están aquí) |
| `src/boot.js` | Inyecta `<link>` para `src/shared/styles/main.css` y `src/shared/styles/runtime-overrides/index.css`, y carga `src/main.js` |
| `src/main.js` | Carga `src/app-entry.js` y agenda la inicialización de WebTorrent tras consentimiento GDPR |
| `src/app-entry.js` | Importa el store, registra todos los web components top-level, fija el tema y aplica clases de viewport |
| `electron-main.js` | Proceso principal de Electron: ventana/menús, IPC `arborito-fetch-url`, bridge nativo de IA opcional |
| `preload.js` | Expone `arboritoElectron.fetchUrl` y `arboritoElectron.llamacpp` al renderer |
| `vendor/nostr-tools/` | Bundle vendoreado de `nostr-tools` |
| `locales/` | i18n JSON (manifest + `en/*.json`, `es/*.json`) |
| `node_modules/` | Dependencias npm — NO es código de Arborito |

## Comandos útiles

```bash
npm start              # Electron (compila CSS primero)
npm run build:css      # Tailwind: main.entry.css → main.css
npm run watch:css      # Tailwind en modo watch (útil mientras editás CSS)
npm run knip           # Detecta exports muertos
npm run serve:http     # Servidor estático en :8000 para probar sin Electron
```

## Si algo se ve raro

Preferí **agregar clases Tailwind en templates** antes que CSS crudo nuevo. Si Tailwind no lo expresa (p. ej. scrollbars), agregá la regla en el `styles/` de la feature correspondiente — y solo en `src/shared/styles/utilities/` si **de verdad** la usan varias features.

Si tu cambio quiebra los imports de un archivo (porque lo moviste, lo renombraste o estás creando uno nuevo en otra feature), tené en cuenta:
- Todos los imports en `src/` son **relativos** (sin alias).
- `src/features/X/foo.js` que usa algo de `src/shared/ui/modal-shell.js` se escribe `import { modalShellHtml } from '../../../shared/ui/modal-shell.js';`.
- Para cosas del store global: `import { store } from '../../../core/store.js';`.

Cuando dudes, preguntá — la estructura de arriba es la forma **intencional** de trabajar en Arborito.
