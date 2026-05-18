# Desplegar Arborito en GitHub Pages (sin `npm` para el visitante)

## Qué ve el usuario final

- Abre la URL de Pages y recibe **HTML + JavaScript ya presentes** en el repo (`index.html`, `src/**/*.js`, `vendor/`, etc.).
- **No** hace falta Node, `npm install` ni `npm run build` en el navegador: la app es **módulos ES nativos** servidos como archivos estáticos.

## Archivo `.nojekyll` (obligatorio en GitHub Pages)

En la raíz del artefacto publicado (esta carpeta `arborito/`) debe existir **`.nojekyll`**. Sin él, GitHub Pages ejecuta **Jekyll**, que **no publica** rutas que contienen segmentos con guion bajo (`_`), por ejemplo `vendor/deps/noble-ciphers/esm/_assert.js`. El navegador recibe una página HTML (404) con tipo `text/html` y los módulos ES fallan con «disallowed MIME type».

El repo incluye `arborito/.nojekyll` vacío; no lo borres si desplegás con Pages.

## Qué hace quien mantiene el repo

1. **CSS:** los estilos compilados viven en `src/styles/main.css`. Tras cambiar clases o `main.entry.css`, ejecutá en tu máquina:
   ```bash
   npm run build:css
   ```
   o, para producción:
   ```bash
   npm run build:css:min
   ```
   Commiteá el `main.css` generado para que Pages sirva la versión actualizada.

2. **No hay bundler de aplicación** en este proyecto: no existe un paso `npm run build` que empaquete todo el JS; el runtime es el código fuente tal cual.

## GitHub Actions (opcional)

En la raíz del monorepo, [`.github/workflows/arborito-css.yml`](../../.github/workflows/arborito-css.yml) compila Tailwind en CI para que no se suba CSS desactualizado por error. Podés extenderlo con **upload-pages-artifact** si Pages se publica desde Actions. Si el repo es **solo** la carpeta `arborito/` en la raíz, mové ese workflow a `.github/workflows/` de ese repo y quitá el `working-directory: arborito`.

### Monorepo

Si `arborito/` no es la raíz del repositorio, cambiá `defaults.run.working-directory` y las rutas del workflow para apuntar a esa carpeta.

## Relays Nostr (opcional)

Si publicás o cargás currículos `nostr://`, el navegador necesita alcanzar relays `wss://`. La lista por defecto y las formas de sobrescribirla (`index.html`, `localStorage`, etc.) están en **[`NOSTR_RELAYS_CONFIGURATION.md`](NOSTR_RELAYS_CONFIGURATION.md)**.

## Resumen

| Rol | `npm` / terminal |
|-----|------------------|
| Visitante | No |
| Mantenedor (CSS) | Sí, solo para regenerar `main.css` cuando cambian estilos |
