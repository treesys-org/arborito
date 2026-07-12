# Modal & surface standards (React)

> **TL;DR** Every new modal or panel is **`.jsx`** using shared components in `src/app/components/` and `src/shared/ui/`. Do not hand-roll backdrop, hero, callout, or spinners.

---

## 1. Required components

| Component | File | Use |
|-----------|------|-----|
| `ModalShell` | `src/app/components/ModalShell.jsx` | Backdrop + centered panel |
| `DockModalShell` | same file | Hub dock (`layout="dock"`), Arcade, Forest, certificates |
| `ModalCenteredShell` | same file | Centered / bottom-sheet without dock hub chrome |
| `DockHubSheet` | `src/shared/ui/DockHubSheet.jsx` | Dock-tab sheet (backdrop + sheet above dock); Backpack, construction hubs |
| `MobMoreSheet` | `src/shared/ui/MobMoreSheet.jsx` | More menu drill (backdrop + hero + scroll host) |
| `LessonTocSheet` | `src/features/learning/components/LessonTocSheet.jsx` | In-lesson TOC (backdrop + sheet; not viewport portal) |
| `NestedSheetShell` | `src/shared/ui/NestedSheetShell.jsx` | Sub-dialog **inside** a hub panel (`absolute inset-0`, not viewport `fixed`); presets via `variant="confirm"|"form"` |
| `ConfirmNestedSheet` | `src/shared/ui/ConfirmNestedSheet.jsx` | Binary confirm inside a hub (delete tree, snapshot, …) |
| `HubStackOverlay` | `src/shared/ui/HubStackOverlay.jsx` | Full-screen in-hub stack (tree editor, …), parent hub stays mounted |
| `ModalHubHero` | `src/app/components/ModalHero.jsx` | Hub header (← title ×) |
| `MmenuRootHero` | `src/shared/ui/MmenuChrome.jsx` | More / drill sub-pane header (grab + ← + title) |
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
4. **No** `modalShellHtml` / `modalHeroHtml` / `calloutHtml` in features, use React components from §1.
5. **Width:** use `panelSize` prop (`compact`, `content`, `dock-hub`, …), see `modal-panel-size.js`. No ad hoc `max-w-*` on the panel.
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

Some surfaces are **excluded from viewport `DockModalShell`**, but **L2 chrome still applies** (heroes, `Callout`, `ChromeEmoji`, `arborito-cta-*`, `.arborito-input`). Do not hand-roll those even when the shell stays custom.

| Surface | File | Shell | L2 chrome |
|---------|------|-------|-----------|
| Sage overlay (chat + guide) | `SageOverlay.jsx`, `SageLayout.jsx` | Anchored widget / `DockHubSheet` dock tab / lesson `DockModalShell` | `ModalHubHero`, `Callout`, CTAs; `embedded` when hosted in outer shell (dock tab + lesson) |
| Sage settings sub-panel | `SageSettings.jsx` | mob: `DockModalShell` portaled (`#sage-settings-backdrop`); desk: `ModalShell` | `ModalHubHero` ✓ |
| Immersive game player | `GamePlayerModal.jsx` | `ModalShell` dark immersive; blocking screens use `GamePlayerImmersiveScreen` in `GamePlayerChrome.jsx` | `ModalHubHero` |
| Team / governance hub | `ContributorModal.jsx` | `DockModalShell` + `ModalHubHero` | ✓ |
| Sources | `SourcesModal.jsx` | Own shell via `useRegisterPanel('modal-sources')` | hub hero + lists |
| Lesson mobile scrim | `Content.jsx` `#backdrop-overlay` | Non-interactive `pointer-events-none` | none |
| Lesson TOC sheet | `LessonToc.jsx` + `LessonTocSheet.jsx` | In-lesson sheet (not global viewport); mobile `MmenuRootHero` | `MmenuRootHero`, `ChromeEmoji` |
| Sage lesson overlay | `SageOverlay.jsx` | `DockModalShell` fullbleed portaled; `bareBackdrop` + `embedded` | `ModalHubHero`, `DockHubShell` |
| Sage settings mobile | `SageSettings.jsx` | `DockModalShell` portaled (`#sage-settings-backdrop`) | `ModalHubHero` ✓ |
| Construction rename sheet | `GraphConstructionLayer.jsx` `MobileRenameSheet` | `ModalCenteredShell` bottom-sheet via portal | `.arborito-input`, CTAs |
| Construction popovers | `GraphConstructionLayer.jsx` | Anchored popover (excluded L1) | `arborito-float-modal-card--compact`, `ChromeEmoji` |
| Forum new-topic sheet | `ForumThreads.jsx` + `NestedSheetShell.jsx` | Sub-dialog inside forum `DockModalShell` | hero inside nested form |
| Untrusted tree warnings | `UntrustedTreeWarningShell.jsx` | Shared `DockModalShell` | ✓ |
| Backpack (progress) mobile | `ProgressWidget.jsx` | `DockHubSheet`, **fullbleed** (dock hidden) | `DockHubShell` |
| Cambiar (tree switcher) | `CurriculumSwitcherModal.jsx` | mob: `DockModalShell` fullbleed; desktop: `ModalShell` bareBackdrop + right drawer | `ModalHubHero` ✓ |
| Product tour | `ProductTour.jsx` | Spotlight (excluded L1) | `arborito-cta-*` on nav buttons |
| Tree growing loader | `TreeGrowingOverlay.jsx` | Toast / block overlay (excluded L1) | `LoadingBrand` / `LoadingRow` |
| Chunk pending | `ModalChunkFallback.jsx` | Minimal spinner under host (excluded L1) | `LoadingBrandRing` |

Version picking is only via `CurriculumSwitcherModal` (no legacy dropdown).

Any other floating widget → discuss in PR and document here.

### Alternate backdrop IDs (mobile fullbleed CSS)

When portaling outside `#modal-backdrop`, register the ID in [`mobile-sheets-dock.css`](../src/shared/styles/modals/mobile-sheets-dock.css) fullbleed rules:

| Backdrop ID | Surface | Notes |
|-------------|---------|-------|
| `#modal-backdrop` | ModalHost (default) | Canonical |
| `#arborito-tree-switcher-backdrop` | Cambiar | fullbleed |
| `#sage-lesson-backdrop` | Sage from lesson | `bareBackdrop: true` |
| `#sage-settings-backdrop` | Sage settings mobile | portaled `DockModalShell` |
| `#sage-dock-backdrop` | Sage dock tab | `DockHubSheet` |
| `#browse-dock-hub-backdrop` | Search/Arcade/Forum hub | `DockHubSheet` |
| `#progress-dock-backdrop` | Backpack | fullbleed |
| `#mobile-menu-backdrop` | More menu (mobile) | dock-gap |
| `#toc-mobile-backdrop` | Lesson TOC | in-lesson CSS |
| `#arborito-construction-rename-backdrop` | Construction rename | bottom-sheet |

Sage lesson: `DockModalShell` + `shellOpts.bareBackdrop: true` + `embedded` on inner screens (no double `DockHubShell`).

### Desktop layout (forest ≥900px)

On forest desktop (`html.arborito-desktop`):

- Store hubs → `DockModalShell` via `ModalHost` (`#modal-backdrop`).
- Compact cards → `ModalCenteredShell` + `sizeTier` (not raw `ModalShell` except §4 exceptions).
- Search → inline in header (`search-redirect`); no modal in forest.
- Tree switcher (Cambiar) → drawer `ModalShell` `bareBackdrop` portaled (`#arborito-tree-switcher-backdrop`).
- Sage → anchored widget (excluded L1); desktop settings uses local `ModalShell` scrim.
- Construction mode adds anchored popovers + inline edit on the graph; viewport modals follow the same rules above. Share primitives (`NodeEmojiPickerGrid`, `Callout`, `NestedSheetShell`) before duplicating markup.

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
| Nested in-hub sheet | `NestedSheetShell.jsx` + `panelSizeTier` / `variant` |
| In-hub confirm (delete, etc.) | `ConfirmNestedSheet.jsx`, branch **and** composed-tree delete in Forest (`SourcesDeleteOverlay`); viewport confirms use `store.confirm()` |
| In-hub full-screen stack | `HubStackOverlay.jsx`, e.g. Forest tree editor |
| Untrusted tree warnings | `UntrustedTreeWarningShell.jsx` |
| Forest directory network | `runBibliotecaNetworkLoad()` in `connected-services/runtime.js` |
| CTAs | `modal-action-chrome.js` + `arborito-cta-forms.css` |
| Modal footers | `arborito-modal-footer` + `arborito-action-row`, see §8b |
| Forms | `arborito-forms.css` |
| App background | `tokens.css` + garden SVGs, no `background-image !important` in features |
| Sage guide (no AI) | `SageGuide.jsx` + `SageGuideContent.jsx` + `sage-guide.css` |

If your PR duplicates a row in this table, extend the canonical source, do not copy markup.

---

## 8. Boolean prefs: use `SwitchRow`

| Component | File | Use |
|-----------|------|-----|
| `SwitchRow` | `src/shared/ui/SwitchRow.jsx` | Label + hint + `.arborito-switch` (role=`switch`) |

**Do not** hand-roll `.arborito-switch` buttons in modals. **Do not** use HTML `<input type="checkbox">` for on/off prefs.

- **`DialogModal`**: `switchLabel` + `switchHint` (import branch sync, etc.).
- **Publish hub**: `BranchPublishFooter` + `SwitchRow` (forum opt-in).
- **Prefs modals**: `CelebrationPrefsModal`, `AccessibilityPrefsModal`.

---

## 8b. Footer CTAs and construction hubs

| Pattern | File | When |
|---------|------|------|
| `MODAL_CTA_CANCEL` + `modalCtaConfirm()` | `modal-action-chrome.js` | All confirm/cancel pairs (`DialogModal`, publish footer, etc.) |
| `arborito-modal-footer--blend` | `arborito-cta-forms.css` | Compact construction hubs, transparent footer inheriting panel surface |
| `arborito-modal-footer--bg-flat` | same | Full-bleed sticky bars with solid bg (properties, consent) |
| Shell `footer` prop | `ConstructionModalShell`, `ContributorHubShell`, `DockModalShell` | Sticky bottom CTAs, always rendered **inside** `DockHubShell` when hub chrome is used |

**Construction hub shells (desktop + mobile):**

| Modal | Shell | Footer |
|-------|-------|--------|
| Publish (`construction-about`) | `ModalCenteredShell` / `DockHubSheet` compact | `BranchPublishFooter` in shell `footer` |
| Team (`contributor`, compact views) | centered or `DockHubSheet` compact | `ContributorLocalDraftFooter` in shell `footer` |
| Language | centered / compact sheet | hero close only |
| History | `DockModalShell` HUB / full sheet | **in-body navigation toolbar** (not a footer), uses `arborito-action-row` + `modalCtaConfirm('slate')` inside `.construction-history-toolbar` |

Chunk fallbacks must mirror the loaded shell (including footer skeleton for publish; contributor `compact` derived from `contributorView`).

### Compact prefs modals (mobile dock-gap + desktop centered)

Canonical reference: [`PrivacyModal.jsx`](../src/features/privacy-gdpr/modals/PrivacyModal.jsx).

| Modal | Mobile shell | Desktop shell | Body padding | Notes |
|-------|--------------|---------------|--------------|-------|
| Privacy | `DockModalShell` `layout="dock-bottom"` | `ModalCenteredShell` `COMPACT` | `px-4 pb-6 pt-2` | Reference implementation |
| Celebration prefs | same | same | same | Not in `MOBILE_DOCK_TAKEOVER_MODAL_TYPES` |
| Accessibility prefs | same | same | same | Test-voice CTAs → `modalCtaConfirmFull('sky')` |
| Language | same | same | same | Hero close only |
| Backup | same | same | `px-4 pb-4 pt-2` | Footer `--blend` + `modalCtaConfirmFull` export/import |

**Pattern:** mobile `DockModalShell` with dock-gap root flags; desktop `ModalCenteredShell` `COMPACT`; fixed body padding (do not gate on `embed`).

### Footer exceptions (not `modalCtaConfirm` pairs)

| Modal | Footer style | CTA pattern |
|-------|--------------|-------------|
| Profile (`ProfileTools`) | `arborito-modal-footer--blend` in shell `footer` | Link-style tool rows (`arborito-action-row`), not confirm/cancel |
| Media consent | `arborito-modal-footer--bg-flat` | `MODAL_CTA_CANCEL` + `modalCtaConfirm('sky')`, documented exception |
| Node properties | `arborito-modal-footer--bg-flat` | `MODAL_CTA_CANCEL` + `modalCtaConfirm` save |

### Chunk fallbacks (`ModalChunkFallback.jsx`)

Replace `GenericChunkFallback` with a shell-specific fallback when the loaded modal has distinct chrome:

| `chunkType` | Shell / notes |
|-------------|---------------|
| `search` | `DockModalShell` search dock |
| `arcade` | `DockModalShell` HUB |
| `forum` | `DockModalShell` FORUM |
| `certificates` | `DockModalShell` HUB |
| `contributor` | `ContributorHubShell` (compact from `contributorView`) |
| `construction-about` | `ConstructionModalShell` compact + `BranchPublishFooterSkeleton` |
| `construction-history` | `ConstructionModalShell` HUB |
| `construction-curriculum-lang` | `ConstructionModalShell` compact |
| `construction-edit-pick` | `DockModalShell` COMPACT + construction pick hero |
| `backup` | mobile dock-bottom / desktop `ModalCenteredShell` + footer skeleton |
| `sources` | `DockModalShell` HUB (`arborito-sources-modal-shell`) |
| `node-properties` | mobile/desktop split + `--bg-flat` footer skeleton |
| `export-pdf` | mobile/desktop `COMPACT` centered |

Unlisted lazy types may still use `GenericChunkFallback` (minimal spinner) until migrated.

---

## 9. Opening modals

| API | File | Use |
|-----|------|-----|
| `openModal(modal)` | `src/app/modal-open.js` | Set shell modal (prefetch arm inside `setModalOnStore`) |
| `openModalWhenReady(modal)` | same | Await lazy chunk, then open |
| `prefetchModal(type)` | same | Hover / intent warm-up |
| `isModalReady(type)` | same | Spinner / busy state |
| `openPublishHub()` | `account-hub-gate.js` | Publish hub (sign-in gate + `construction-about`) |
| `openContributorHub()` | `account-hub-gate.js` | Team modal (sign-in gate + `contributor`) |

Feature hooks and actions should call these gates or `openModal`, not `setModalOnStore` directly.

Eager vs lazy list: [`file-hierarchy.md`](file-hierarchy.md) § Modals.

### Unified modal pipeline

| Layer | File | Role |
|-------|------|------|
| Surface routing | `src/app/modal-surface-routing.js` | `modal-host` vs `browse-dock-hub` vs `construction-dock-hub` vs `sage` |
| Chunk loading | `src/app/hooks/useModalChunk.js` + `modal-chunk-loaders.js` | Single gate; skips spinner when chunk cached |
| ModalHost | `src/app/components/ModalHost.jsx` | `#modal-backdrop` takeover + desktop; CC author-license overlay (`modalOverlay.type === 'author-license'`) stacks here |
| Dock hub panel | `src/app/components/DockHubPanelLayer.jsx` | Mobile dock sheets (search, arcade, forum, …) |
| Dock embed chrome | `src/shared/ui/DockHubPanelEmbed.jsx` | Inner shell when layer owns the shared sheet |

Open with `{ type, dockUi: true }` for mobile dock tabs; preserve `dockUi` when returning from nested modals (e.g. game-player → arcade via `arcade-modal-nav.js`).

---
