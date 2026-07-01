# Modal & surface standards (React)

> **TL;DR** Every new modal or panel is **`.jsx`** using shared components in `src/app/components/` and `src/shared/ui/`. Do not hand-roll backdrop, hero, callout, or spinners.

---

## 1. Required components

| Component | File | Use |
|-----------|------|-----|
| `ModalShell` | `src/app/components/ModalShell.jsx` | Backdrop + centered panel |
| `DockModalShell` | same file | Hub dock (`layout="dock"`) — Arcade, Biblioteca, certificates |
| `ModalHubHero` | `src/app/components/ModalHero.jsx` | Hub header (← title ×) |
| `Callout` | `src/shared/ui/Callout.jsx` | Info / warn / danger / sage notices |
| `ChromeEmoji` | `src/app/components/ChromeEmoji.jsx` | Offline emoji (twemoji) |
| `LoadingBrand` / `LoadingRow` | `src/app/components/LoadingBrand.jsx` | Boot / loading rows |
| `LocaleRichText` | `src/shared/ui/LocaleRichText.jsx` | Locale HTML → safe JSX |
| `ModalHtml` | `src/app/components/ModalShell.jsx` | Bounded static HTML (prefer `Callout` / `LocaleRichText`) |

**Shared CSS:** tokens in `src/shared/styles/modals/`, CTAs in `arborito-cta.css`, inputs in `arborito-forms.css` (`.arborito-input`, `.arborito-select`).

**Jr references:**

- Compact modal: [`LanguageModal.jsx`](../src/features/shell-chrome/modals/LanguageModal.jsx)
- Hub dock: [`ArcadeModal.jsx`](../src/features/arcade/modals/ArcadeModal.jsx)
- Settings with hook: [`SageSettings.jsx`](../src/features/learning/modals/SageSettings.jsx) + [`useSageSettings.jsx`](../src/features/learning/modals/hooks/useSageSettings.jsx)

---

## 2. Hard rules (CI + review)

In `src/features/**/modals/*.jsx` and `components/*.jsx`:

1. **No** `className="fixed inset-0 …"` as your own shell → `ModalShell` / `DockModalShell`.
2. **No** `dangerouslySetInnerHTML` → `ModalHtml`, `Callout`, `LocaleRichText`, `ChromeEmoji`.
3. **No** `bindMobileTap` / `wireArboritoSwitch` → React `onClick` or shell props.
4. **No** `modalShellHtml` / `modalHeroHtml` / `calloutHtml` in features — use React components from §1.
5. **Width:** use `panelSize` prop (`compact`, `content`, `dock-hub`, …) — see `modal-panel-size.js`. No ad hoc `max-w-*` on the panel.
6. **Mobile:** `ModalShell` infers `shouldShowMobileUI()`; do not duplicate `arborito-modal--mobile` flags by hand.

Quick audit before PR:

```bash
rg -n 'dangerouslySetInnerHTML|bindMobileTap|wireArboritoSwitch|modalShellHtml|fixed inset-0' src/features/*/modals/*.jsx
```

Zero matches in touched files = good.

---

## 3. Size grid (`panelSize`)

Single source: [`modal-panel-size.js`](../src/shared/ui/modal-panel-size.js).

| Tier | Token | Example |
|------|-------|---------|
| `compact` + `auto-h` | 28rem | Language, backup, Sage settings |
| `standard` + `auto-h` | 36rem | Warnings, forms |
| `content` + `auto-h` | 42rem | Search, profile |
| `dock-hub` | 74rem | Arcade, certificates, tree-info |
| `forum` | 80rem | Forum |

New width → add tier in `modal-panel-size.js` + CSS token, not loose classes in the modal.

---

## 4. Special surfaces (not centered modals)

| Surface | File | Notes |
|---------|------|-------|
| Sage overlay (chat + guide) | `SageOverlay.jsx`, `SageLayout.jsx` | Anchored widget / mobile sheet; not centered `ModalShell` |
| Sage settings sub-panel | `SageSettings.jsx` | `ModalShell` + `SageMobPanel` inside `SageOverlay` |
| Immersive game player | `GamePlayerModal.jsx` | `ModalShell` with dark `panelTone` + immersive flags |
| Sources | `SourcesModal.jsx` | Own shell via `useRegisterPanel('modal-sources')` |
| Governance embed | `AdminPanel.jsx` | Body only; `ModalHost` supplies dock/centered shell via `embed` |
| Lesson mobile scrim | `Content.jsx` `#backdrop-overlay` | Non-interactive `pointer-events-none` — not a modal |
| Construction rename sheet | `GraphConstructionLayer.jsx` `MobileRenameSheet` | `ModalCenteredShell` bottom-sheet via portal |
| Forum new-topic sheet | `ForumThreads.jsx` + `NestedSheetShell.jsx` | Sub-dialog inside forum `DockModalShell` |
| Untrusted tree warnings | `UntrustedTreeWarningShell.jsx` | Shared `DockModalShell` for load + community-add flows |

Any other floating widget → discuss in PR and document here.

---

## 5. Extend instead of fork

1. Find the closest component (`ModalShell`, `ModalHubHero`, `Callout`).
2. Add a documented prop with a default that does not break existing callers.
3. Migrate your modal to the new prop.
4. If ≥3 modals need the same thing → preset or new `tone` in this doc.

Accepted examples: `panelTone: 'sage' | 'dark'`, `scrim: 'opaque'`, `shellOpts.enter`, `ModalHubHero` `tone: 'danger'`.

---

## 6. Privacy and legal

Any capability that leaves the device, uses the network, or stores secrets needs a section in [`PrivacyModal.jsx`](../src/features/privacy-gdpr/modals/PrivacyModal.jsx) (EN/ES), aligned with consent copy in `locales/`.

---

## 7. Single source per UI family

| Family | Source |
|--------|--------|
| Modal shell | `ModalShell.jsx` + `arborito-modals.css` |
| Hub hero | `ModalHero.jsx` + `arborito-dock-hub.css` |
| Callouts | `Callout.jsx` + `arborito-callout.css` |
| Nested in-hub sheet | `NestedSheetShell.jsx` + `panelSizeTier` |
| Untrusted tree warnings | `UntrustedTreeWarningShell.jsx` |
| Biblioteca directory network | `runBibliotecaNetworkLoad()` in `connected-services/runtime.js` |
| CTAs | `arborito-cta.css` |
| Forms | `arborito-forms.css` |
| App background | `tokens.css` + garden SVGs — no `background-image !important` in features |
| Sage guide (no AI) | `SageGuide.jsx` + `SageGuideContent.jsx` + `sage-guide.css` |

If your PR duplicates a row in this table, extend the canonical source — do not copy markup.
