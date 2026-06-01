# Modal & Surface Standards (mandatory)

> **TL;DR** Every modal or panel must be built with the unified helpers in
> `src/shared/ui/`. No exceptions. Any new code that invents its own shell, hero,
> callout, spinner, or close-tap HTML is considered a **bug** and blocks the
> merge — even if it "works".

This document is the single source of truth for:

- Which helpers to use.
- The current compliance state.
- How to evolve the helpers when a new need appears.

It exists because UX breaks modal-by-modal whenever each feature reinvents its
own panel: different shadows, headers that don't line up between desktop and
mobile, close buttons that don't respond to touch on iOS, spinners with random
sizes and colours. **That is no longer allowed.**

---

## 1. The seven mandatory helpers

| Helper | File | Mandatory for |
|--------|------|---------------|
| `modalShellHtml({ bodyHtml, mobile, layout, panelSize, lift, scrim, enter, rootFlags, panelAttrs, bareBackdrop })` | `src/shared/ui/modal-shell.js` | **Every modal backdrop + panel.** The only place that knows about `arborito-float-modal-card`, `arborito-sheet--mobile`, mobile fullbleed, scrim, and entry animation. |
| `modalHeroHtml(ui, { title, subtitle, leadingIcon, trailingHtml, mobile, tone, backTagClass, closeTagClass, showBack, showClose, titleId })` | `src/shared/ui/modal-hero.js` | **Header (← title × or variants).** Guarantees that mobile and desktop share the same visual row. `subtitle` accepts HTML. `trailingHtml` covers extra inline buttons. |
| `calloutHtml({ tone, size, title, body, htmlBody, inline, bodyClass, titleClass, extraClass })` | `src/shared/ui/callout.js` | **Banners / callouts** (info, warn, danger, sage). Replaces any `<div class="bg-blue-50 ... border-blue-200 ...">`. |
| `loadingHtml({ label, variant: 'inline'\|'block'\|'fullbleed', size, tone, extraClass })` | `src/shared/ui/loading.js` | **Loading states** (spinner + label). Replaces any `<div class="animate-spin">⏳`. |
| `bindCloseTaps(root, handler)` | `src/shared/ui/mobile-tap.js` | **Close bindings.** Tap-and-release-safe for iOS; replaces `el.onclick = …` on any button whose job is to close. |
| `.arborito-cta-{tone}` (`emerald`, `slate`, `amber`, `rose`, `purple`, `blue`, `green`, `red`, `sky`, `indigo`) | `src/shared/styles/utilities/arborito-cta.css` | **Color / hover / dark for buttons.** Replaces `bg-*-600 hover:bg-*-500 dark:bg-*-700 dark:hover:bg-*-600`. Padding / font / rounded remain Tailwind at the call site. |
| `.arborito-input` | `src/shared/styles/utilities/arborito-forms.css` | **Form inputs.** Replaces the chain `border bg-white dark:bg-slate-800 dark:border-slate-700 ...`. |

> If your need doesn't fit any helper, the rule is **not** "do it by hand".
> The rule is **extend the helper** (add a field to `opts`). The new field is
> then available for the next 43 modals. Forking HTML at the call site is the
> debt that led to the inconsistent UX the team decided to kill.

---

## 2. Hard rules (passive lint — no tool yet)

The following strings are **non-compliance signals** inside `src/features/*` (any feature's components or modals):

1. `class="fixed inset-0`  → you are building a backdrop by hand. Use `modalShellHtml`.
2. `shadow-2xl`  → you are almost certainly duplicating the canonical shadow of `.arborito-float-modal-card`. If your modal doesn't use `arborito-float-modal-card`, add it via `modalShellHtml`.
3. `<div class="animate-spin`  → use `loadingHtml`.
4. `<div class="bg-blue-50 dark:bg-blue-900 ... border-blue-200 ...">`  → use `calloutHtml`.
5. `.onclick = () => ...close()` on a button that closes  → use `bindCloseTaps`.
6. `bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-700`  → use `arborito-cta-emerald`.
7. `panelClass: '... max-w-* ...'`  → **forbidden**. Width travels through `panelSize` (see §2.1). If it doesn't fit, add a new entry to the grid.
8. `rootFlags: '... arborito-modal--mobile ...'`  → **redundant**. `modalShellHtml` injects it on its own when `mobile=true`.
9. `rootFlags: '... arborito-modal-backdrop--instant ...'` or `enter: instantBackdrop ? 'instant' : 'fade'`  → use the first-class option `instantOpen: boolean`.
10. `panelAttrs: 'role="dialog" aria-modal="true" ...'`  → redundant. The helper injects `role="dialog" aria-modal="true"` itself. You should still declare `aria-labelledby` or `aria-describedby` if your modal exposes them.

Quick audit command before a PR:

```bash
rg -nE 'fixed inset-0|shadow-2xl|<div class="animate-spin|class="[^"]*bg-(emerald|blue|amber|rose|purple|green|red|sky|indigo)-600 hover:bg-\1-500|panelClass:[^,}]*max-w-|rootFlags:[^,}]*arborito-modal--mobile[^-]|panelAttrs:[^,}]*role=.dialog' src/features/your-feature/modals/your-modal.js
```

Zero matches = good.

### 2.1 Canonical size grid

Every modal **must** request its width via `panelSize`. The grid is:

| `panelSize`     | Effective width    | Tailwind equivalent | Typical use                                     |
|---|---:|---|---|
| `xs`            | `min(92vw, 24rem)` | `max-w-sm`          | QR scanner, tiny popovers                       |
| `narrow`        | `min(92vw, 26rem)` | ~`max-w-md`         | Language / compact consent / game-player states |
| `lg-tight`      | `min(92vw, 32rem)` | `max-w-lg`          | Publish diff / report / pickers                 |
| `md`            | `min(92vw, 36rem)` | `max-w-xl`          | Generic dialogs                                 |
| `lg`            | `min(92vw, 42rem)` | `max-w-2xl`         | `tree-info`, rich callouts                      |
| `xl`            | `min(92vw, 48rem)` | `max-w-3xl`         | Privacy, long forms                             |
| `huge`          | `min(92vw, 64rem)` | `max-w-5xl`         | Manual / docs                                   |
| `forum`         | `min(95vw, 80rem)` | `max-w-7xl`         | Forum / master-detail                           |
| `search`        | `min(92vw, 42rem)` | —                   | Search (uses its own shell)                     |
| `readme` / `certificate` / `certs` | various | — | Specific semantic cases                         |

**Combinable modifier**: `auto-h` lowers the fixed height (`min(86vh, 720px)`) to "auto height with a cap". It can be combined with any width by separating with a space: `panelSize: 'lg-tight auto-h'`.

**Rule**: if your modal needs a width outside the grid, add a new entry in
`src/shared/styles/modals/system-root-and-variants.css` **and** in `validSizes` of
`src/shared/ui/modal-shell.js`. Do not pass `max-w-*` through `panelClass`.

### 2.2 Defaults the helper enforces on its own

These are provided by `modalShellHtml` automatically. Don't repeat them in every caller:

| Auto | When | Replaces |
|---|---|---|
| `mobile = shouldShowMobileUI()` | when the caller doesn't declare it | repeated `mobile: shouldShowMobileUI()` |
| `role="dialog" aria-modal="true"` | always, unless `panelAttrs` already has `role=` | forgotten accessibility attributes |
| `arborito-modal--mobile` in rootFlags | when `mobile=true` | hundreds of half-done callers that forgot the flag and fell back to `max-width: 92vw` |
| `arborito-modal--mobile-fullbleed` | when `layout='dock' && mobile=true` | same |
| `arborito-modal-backdrop--instant` + `enter='instant'` | when `instantOpen: true` | duplicated `instantBackdrop ? 'instant' : 'fade'` ternary in every caller |

---

## 3. Compliance table (current state, 44 modal files)

Generated with the script in `docs/MODAL_STANDARDS.md § 4`. Keep it up to date
when you add a modal or refactor an existing one.

Legend: `✓` uses the helper · `·` doesn't use it (may be intentional) · `!` violates a hard rule.

| Modal | Lines | shell | hero | callout | bindCloseTaps | loading | Notes |
|---|---:|:---:|:---:|:---:|:---:|:---:|---|
| about | 279 | ✓ | · | ✓ | ✓ | · | hero hand-rolled — pending migration |
| admin | 395 | · | ✓ | · | · | · | **embedded** (not a top-level modal: it renders inside another governance panel). |
| arcade | 396 | (✓) | (✓) | (✓) | · | · | delegates 100% to `arcade-ui.js` (compliant) |
| arcade-ui | 490 | ✓ | ✓ | ✓ | · | · | |
| author-license | 84 | ✓ | ✓ | ✓ | · | · | |
| certificate-view | 108 | ✓ | ✓ | · | ✓ | · | |
| certificates | 270 | ✓ | ✓ | · | ✓ | · | |
| construction-curriculum-lang | 85 | ✓ | ✓ | · | · | · | |
| construction-history | 234 | ✓ | ✓ | · | · | · | |
| dialog | 342 | ✓ | ✓ | · | · | · | |
| empty-module | 119 | ✓ | ✓ | · | ✓ | · | |
| export-pdf | 129 | ✓ | ✓ | · | ✓ | · | |
| forum | 724 | (✓) | (✓) | ✓ | · | · | delegates to `forum-modal-render-mixin.js` (compliant) |
| forum-modal-render-mixin | — | ✓ | ✓ | · | · | · | |
| forum-modal-utils | 229 | — | — | — | — | — | pure utils, not a modal |
| game-player | 883 | ✓ | · | · | · | · | The 4 states (loading / consent / error / crash) all go through `_gameDarkModalShell()` → `modalShellHtml({ panelTone: 'dark'\|'danger-dark', scrim: 'black', rootFlags: 'arborito-modal--immersive arborito-modal-immersive--center arborito-game-immersive-scrim' })`. Reuses the canonical shell and adds the game's immersive flag via `rootFlags`. |
| language | 54 | ✓ | ✓ | · | ✓ | · | |
| load-warning | 111 | ✓ | ✓ | · | · | · | `danger` tone |
| manual | 315 | ✓ | ✓ | ✓ | ✓ | · | |
| move-node | 168 | ✓ | ✓ | · | · | · | |
| node-properties | 238 | ✓ | ✓ | · | · | ✓ | loading migrated to `loadingHtml` |
| onboarding | 151 | ✓ | · | · | · | · | embedded flow with its own header (3 steps); uses `modalShellHtml` for the outer shell |
| pick-curriculum-lang | 108 | ✓ | ✓ | · | · | · | |
| preview | 59 | ✓ | ✓ | · | · | · | |
| privacy | 132 | ✓ | ✓ | ✓ | · | · | |
| profile | 749 | ✓ | ✓ | · | ✓ | · | |
| publish-diff | 180 | ✓ | ✓ | · | · | · | |
| readme | 693 | ✓ | ✓ | · | · | · | |
| releases | 511 | ✓ | ✓ | · | · | · | |
| sage | 112 | (✓) | (✓) | (✓) | · | · | delegates to `sage-ui-chat.js` ← `sage-ui-core.js` (partially compliant) |
| sage-ui-chat | 304 | (✓) | ✓ | · | ✓ | · | Unified hero (mobile + desktop) via `modalHeroHtml`. The "settings" sub-shell (L~75) uses the canonical class `arborito-float-modal-card` without Tailwind redundancies → it inherits the tripartite shadow. |
| sage-ui-core | 986 | (✓) | ✓ | ✓ | ✓ | · | 3 desktop variants (GDPR consent / external download / menu) use `arborito-float-modal-card` + `--auto-h` or `--narrow` (canonical shadow). The 2 corner widgets (chat-widget L~210, loading-screen L~832) are listed in § *Special positioned widgets* — they are corner overlays, not centered modals; they share the shadow helper but not `modalShellHtml`. |
| search | 322 | ✓ | ✓ | · | ✓ | · | |
| security-warning | 113 | ✓ | ✓ | · | · | · | `danger` tone |
| sources | 561 | ✓ | ✓ | · | ✓ | · | own shell (`arborito-sources-modal-shell`) registered via `bareBackdrop: true`; chrome inherits `.arborito-float-modal-card` |
| sync-login-qr-scanner | 196 | ✓ | · | · | · | · | own header (live camera); acceptable because the header carries scanner-specific controls |
| tree-info | 395 | ✓ | ✓ | · | · | · | |
| tree-report | 433 | ✓ | ✓ | · | · | · | |

### Special positioned widgets (NOT centered modals, do not use `modalShellHtml`)

These two panels have custom positioning (bottom-right corner on desktop,
fullscreen sheet on mobile) and their own z-index/animation that doesn't fit
any `layout` of `modalShellHtml`. **They are the ONLY approved exception** to
the rule in § 1:

1. **Sage chat widget** — `sage-ui-core.js` `_sageMountShell()` (L~205–211).
   Bottom-right floating chat. Anchored at `md:bottom-6 md:right-6` on
   desktop, sheet on mobile. Kept custom because it isn't a modal: it's a
   persistent-presence widget.
2. **Sage loading screen** — `sage-ui-core.js` `renderLoading()` (L~825–840).
   Same anchor as the chat widget. Appears while the AI model loads.

Both share chrome through Tailwind `shadow-2xl border border-slate-200` so they
LOOK like canonical modals at first glance, even though they don't use the
helper. Any third "positioned widget" must go through discussion before being
added — the default rule is still: use `modalShellHtml`.

### Known debt

**None.** The 36 top-level surfaces comply with the rule in § 1, and the 2
exceptions are explicitly documented above.

If you find another surface that doesn't comply and isn't listed here, add it
before anything else — the rule is: document it in this file and then fix it.
**We do not want bug-hunting for broken modals.**

---

## 4. How to regenerate the table

```bash
python3 - << 'PY'
import os, re, glob
rows = []
for f in sorted(glob.glob('src/features/*/modals/*.js') + glob.glob('src/shared/ui/*.js')):
    name = os.path.basename(f).replace('.js','')
    if 'mixin' in name or 'helpers' in name or 'logic' in name or 'utils' in name:
        continue
    s = open(f, encoding='utf-8').read()
    has = lambda needle: '✓' if needle in s else '·'
    raw_fixed = '!' if re.search(r'class="[^"]*fixed inset-0', s) and 'modalShellHtml(' not in s else ''
    raw_shadow = '!' if re.search(r'\bshadow-2xl\b', s) and 'modalShellHtml(' not in s else ''
    bug = (raw_fixed or raw_shadow)
    lines = len(s.splitlines())
    rows.append((name, lines, has('modalShellHtml('), has('modalHeroHtml('),
                 has('calloutHtml('), has('bindCloseTaps('), has('loadingHtml('), bug))

print(f'{"modal":<32}{"lines":>6}  shell hero call bind load  bug')
for r in rows:
    print(f'{r[0]:<32}{r[1]:>6}   {r[2]:^4}{r[3]:^4}{r[4]:^4}{r[5]:^4}{r[6]:^4}  {r[7]}')
PY
```

---

## 5. How to extend a helper (instead of forking)

Canonical steps:

1. Identify the closest helper (`modalShellHtml`, `modalHeroHtml`, `calloutHtml`, `loadingHtml`, `bindCloseTaps`).
2. Add a new field to the `opts` documented in the helper's JSDoc.
3. Implement it keeping the default behaviour identical to today (everything previous keeps working untouched).
4. Migrate your modal to the new field.
5. If three or more modals need the same thing, consider a new `tone` or a preset documented in this file.

Examples of accepted extensions already live:

- `modalShellHtml` `panelSize: 'forum'` for the wide forum modal.
- `modalShellHtml` `lift: 'soft'|'strong'` for extra shadows + rings.
- `modalHeroHtml` `tone: 'danger'` for warnings (security-warning, load-warning).
- `modalHeroHtml` `trailingHtml` for inline controls in the hero (sage, profile).
- `calloutHtml` `htmlBody` for bodies with embedded `<strong>` / `<code>`.

If your change would break an existing modal, it is **not** an extension: it's
a refactor that must migrate every call site in the same PR.

---

## 6. Privacy & legal coverage

The in-app privacy policy (`src/features/privacy-gdpr/modals/privacy.js`) must explicitly
cover, in EN and ES:

- Nostr relays (public network) — `privacyNostrRelaysHeading` / `…Body`.
- WebTorrent (IP exposure in P2P) — `privacyWebTorrentHeading` / `…Body`.
- Identity keys in `localStorage` (no central backup) — `privacySecretsHeading` / `…Body`.
- Third parties for in-browser AI (CDN) — `privacyAiBrowserLine`.
- Tech stack / hosting — `privacyTechHosting`, `privacyTechCurriculum`, etc.
- **Revoke consent** and **wipe local data** buttons — `privacyResetConsentButton`, `privacyWipeLocalButton`.

Golden rules:

- Any new capability that (a) leaves the device or (b) stores a secret needs a
  section with the four parts: **what it is**, **what is seen/exposed**,
  **mitigations**, **user rights / how to delete**.
- If a capability is disabled by default, say so. If it requires consent, say
  so (the consent lives in `store-methods/consents`).

The CSP in `index.html` is documented in-line: any relaxation (allowing a new
`https://…` source, opening `'unsafe-eval'`, etc.) must be made explicit in
the comment of the `Content-Security-Policy` meta tag.

---

## 7. Single sources by UI family

Summary so you don't get lost looking for "where X is defined":

| Family                     | Single source                                                   |
|---|---|
| Modal shell + shadows      | `src/shared/ui/modal-shell.js` + `src/shared/styles/modals/system-root-and-variants.css` |
| Modal header (hero)        | `src/shared/ui/modal-hero.js`                                       |
| Callouts / banners         | `src/shared/ui/callout.js` + `src/shared/styles/utilities/arborito-callout.css` |
| Loading spinners           | `src/shared/ui/loading.js`                                          |
| CTA buttons (10 tones)     | `src/shared/styles/utilities/arborito-cta.css`                         |
| Inputs / forms             | `arborito-input` / `arborito-select` / `arborito-textarea` in `arborito-forms.css` |
| **App background**         | `src/shared/styles/foundation/tokens.css` (`--bg-app-gradient`) + real SVGs in `src/features/garden-progress/assets/scene-day.svg` and `scene-night.svg`. **Forbidden** to inject `background-image` with `!important` in other files (breaks the single source). |
| **Sage guide (no AI)**     | `src/features/learning/sage-guide-content.js` (content + contextual actions) + `src/features/learning/sage-guide-drill.js` (scroll shell) + `src/features/learning/styles/arborito-sage-guide.css`. Navigation: hub → topic → tip (one screen at a time; back arrow in header). Wiring in `sage-ui-core.js::_wireSageGuideActions` (`data-sage-action`). **Do not** reuse the accordion manual (`manual-sections.js`) inside Sage. |
| "Eyebrow" font style       | `arborito-eyebrow.css`                                          |
| Lists / rows in menus      | `arborito-list-row.css`                                         |
| Action rows (button pairs) | `arborito-action-row.css`                                       |
| Canonical mobile back chip | `.arborito-mmenu-back` in utilities                             |

Rule: if your PR adds a second implementation of anything in this table, you're
not extending — you're duplicating. Go down to the canonical helper / CSS and
propose an extension, not a parallel fork.
