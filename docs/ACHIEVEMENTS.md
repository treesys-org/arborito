# Achievements and trophies

Arborito tracks three kinds of achievements. Open them from **More menu → Achievements** (or the backpack panel on desktop).

## Quick comparison

| Kind | When it appears | Who controls it |
|------|-----------------|-----------------|
| **Tree trophy** | Finishing every lesson in an imported **branch** (one `.arborito` course) | Automatic (one per branch) |
| **Branch trophy** | Finishing every lesson in one slot of a **composed tree** (playlist) | Automatic (one per embedded branch) |
| **Diploma** | Finishing every lesson inside a specific folder the author marked | Author (optional, any folder depth) |

**Important:** In Arborito vocabulary, a **branch** is a full course you import or publish (`.arborito`). Folders **inside** the map are **modules** or **sub-folders**, not branches. They do not get a default trophy unless you turn on **Issue diploma** in node properties.

## Tree trophy (default for one course)

When you study a single imported branch, you earn **one** tree trophy for completing the whole curriculum.

- Shown under **Completed trees** in achievements.
- Progress counts every lesson and exam in that branch.
- No author setup required.

## Branch trophies (composed trees only)

When you open a **tree** (playlist that combines several branches), each embedded branch slot can earn its own branch trophy.

- Shown under **Completed branches**.
- Only applies at the playlist home view, not inside a single imported branch.

## Diplomas (author-issued, any folder)

Authors can add extra trophies to **any module or sub-folder**:

1. Turn on **Construction mode**.
2. Tap the folder on the map.
3. Press the **trophy** button next to Move (gray = off, gold = on). Or open **Properties** and enable **Issue diploma**.

Students see the diploma under **Diplomas** when they finish every lesson inside that folder. Nested folders work the same way as top-level modules.

## What does *not* count

- Individual lessons (leaves) never appear as trophies.
- Default module folders at the map root do **not** each get a trophy. Only the whole branch (tree trophy) or an author-marked folder (diploma) does.
- Exam nodes contribute to folder completion but are not separate trophy rows.

## Backpack: module seeds (plot)

When you **finish every lesson in a module** (a folder on the map), Arborito plants a **seed** in your backpack plot.

- Each tile = one completed module (not a separate course branch).
- Emoji stage reflects memory health: sprout → healthy → mature, or withered if review is overdue.
- Tap **Care** to water due items and keep seeds healthy.

This is cosmetic progress tracking, separate from **trophies** above.

## For developers

| Code | Role |
|------|------|
| `src/features/garden-progress/api/achievement-sections.js` | Builds tree / branch / diploma sections |
| `src/features/garden-progress/api/certificate-entries.js` | Whole-tree certificate (`__tree_cert__:`) |
| `src/features/tree-graph/components/mobile/MobileInlineTools.jsx` | Trophy toggle next to Move |
| `src/features/tree-graph/modals/NodePropertiesModal.jsx` | **Issue diploma** checkbox on folders |
| `src/features/garden-progress/modals/CertificatesModal.jsx` | Achievements UI |

See also [`TREES_AND_BRANCHES.md`](TREES_AND_BRANCHES.md) for branch vs tree terminology.
