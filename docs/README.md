# Arborito documentation

Short index. To run the app: [`../README.md`](../README.md).

## Start here

| Doc | Audience | Contents |
|-----|----------|----------|
| [**PRODUCT_GUIDE.md**](PRODUCT_GUIDE.md) | Everyone | Branch vs tree, **freeze vs versions**, trophies, web vs desktop |
| [**AUTHORING.md**](AUTHORING.md) | Authors | Construction mode, `@quiz`, `.arborito` format |
| [**DEVELOPMENT.md**](DEVELOPMENT.md) | Developers | Code layout, hooks, CI, conventions |

## Network, account, SDK

| Doc | Topic |
|-----|--------|
| [NETWORK.md](NETWORK.md) | Nostr, WebTorrent, relays, security |
| [AUTH_AND_ACCOUNT.md](AUTH_AND_ACCOUNT.md) | Optional account, sync, recovery |
| [PYTHON_SDK.md](PYTHON_SDK.md) | Python CLI and library (**0.2.2**) |
| [sdk-spec.md](sdk-spec.md) | Browser Arcade contract (`window.arborito`) |

## UI and editor (technical)

| Doc | Topic |
|-----|--------|
| [MODAL_STANDARDS.md](MODAL_STANDARDS.md) | Required before changing modals |
| [editor-architecture.md](editor-architecture.md) | contentEditable + React layers |

## Release and legal

| Doc | Topic |
|-----|--------|
| [RELEASE.md](RELEASE.md) | Web build, Flatpak, Windows, Android, QA |
| [ARBORITO_ARCHIVE.md](ARBORITO_ARCHIVE.md) | `.arborito` archive internals |
| [DSA_COMPLIANCE.md](DSA_COMPLIANCE.md) | EU DSA compliance map |
| [forking-and-branding.md](forking-and-branding.md) | GPL forks and trade marks |

## Ecosystem

| Repo | Docs |
|------|------|
| [arborito-sdk](https://github.com/treesys-org/arborito-sdk) | Python CLI |
| [arborito-games](https://github.com/treesys-org/arborito-games) | Arcade cartridges |

CSS: edit `main.entry.css`, then `npm run build:css:min`. Do not edit `main.css` by hand.

Build tooling: [`scripts/README.md`](../scripts/README.md).
