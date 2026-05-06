# Configuración de relays Nostr (despliegue y desarrollo)

Esta guía es para **quien empaqueta o aloja** Arborito (no sustituye el texto de privacidad que ve el usuario en la app; ese texto vive en los ficheros de idioma `locales/*.json`).

## Qué hace el cliente

Para árboles públicos `nostr://`, el navegador abre conexiones **WebSocket seguras** (`wss://`) hacia uno o más **relays** Nostr. Ahí circulan metadatos del currículo, trozos de contenido, foro y demás según el diseño descrito en [`NOSTR_BUNDLE_AND_PUBLISH.md`](NOSTR_BUNDLE_AND_PUBLISH.md).

## Lista por defecto

- Definida en código en [`src/config/nostr-relays-runtime.js`](../src/config/nostr-relays-runtime.js) (`DEFAULT_NOSTR_RELAYS`).
- Las URLs concretas pueden cambiar entre versiones; no las dupliques en textos legales de usuario: remite a “la instalación que uses” o mantén la política alineada con el código en cada release.

## Cómo sobrescribir la lista (orden de prioridad)

1. **`localStorage`** en el origen de la app, clave `arborito-nostr-relays-v1`: valor JSON, array de strings `wss://…`. Si existe y es válido, **sustituye** la lista por defecto para ese navegador y ese origen.
2. **`window.ARBORITO_NOSTR_RELAYS`**: array de URLs `wss://…`, asignado **antes** de que el módulo principal resuelva relays (por ejemplo en un `<script>` en [`index.html`](../index.html)). Suele usarse en despliegues propios.
3. Si no hay nada de lo anterior, se usa `DEFAULT_NOSTR_RELAYS` del fichero de runtime.

La lógica de lectura y normalización está en el mismo módulo `nostr-relays-runtime.js` y en [`src/services/nostr-universe.js`](../src/services/nostr-universe.js).

## Elección de relays (UE / RGPD)

Elegir relays con operadores en la UE es una decisión de **producto o cumplimiento** del despliegue: reduce en la práctica transferencias hacia terceros fuera de ese marco, pero cada relay publica su propio aviso jurídico y política de privacidad. No implica asesoramiento jurídico automático.

## Documentación relacionada

- [`DEPLOY_GITHUB_PAGES.md`](DEPLOY_GITHUB_PAGES.md) — despliegue estático.
- [`NOSTR_STORAGE_NOTES.md`](NOSTR_STORAGE_NOTES.md) — límites de borrado en la red.
- [`README.md`](../README.md) — visión general y enlaces al código.
