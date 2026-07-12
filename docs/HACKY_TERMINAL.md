# Hacky Terminal (Arcade cartridge)

**Hacky Terminal** is the official retro-shell minigame in the [arborito-games](https://github.com/treesys-org/arborito-games) repo (`cartridges/hacky-terminal/`). It turns lesson content into terminal missions.

In the Arcade UI the catalog title is localized (`arcadeGameHackyTerminal` in `locales/*/games.json`); the manifest on GitHub stays in English.

## Modes

| Mode | Badge | Behaviour |
|------|-------|-----------|
| **Static** (default) | `STATIC` / `ESTÁTICO` | Shell app with menu: `lessons`, `play <n>`, numbered options for all quiz modes, bash missions. No network AI. |
| **Dynamic** (opt-in) | `DYNAMIC` / `DINÁMICO` | Linear missions plus free-form questions answered by Sage (local llama.cpp on desktop, or Expert API on web). |

Check mode in a cartridge with `window.arborito.getAIMode()` (`'static'` | `'dynamic'`). See [AI_INTEGRATION.md](AI_INTEGRATION.md).

## Player commands

Built into the shell (not course-specific):

| Command | Action |
|---------|--------|
| `help` | Lists built-in commands |
| `menu` | Main menu (static mode) |
| `lessons` / `ls` | Lists lessons in the loaded module |
| `play <n>` | Start lesson *n* (static mode) |
| `clear` | Clears the terminal output |
| `hint` or `?` | Hint for the current mission |
| `missions` | Lists all missions; `->` marks the active one |

Anything else is submitted to `arborito.play.submit()` (quiz answers, shell commands like `uname -a`, or AI prompts in dynamic mode).

## Where missions come from

1. **Quiz V2** blocks in the lesson (`@quiz`, steps, cloze, etc.) via `play.boot()`.
2. **Shell snippets** in lesson markdown: fenced `bash` / `sh` / `shell` blocks. The line after a command becomes its simulated output (same rules as the SDK `codeReplaysFromLesson` helper).

Authors do not configure Hacky Terminal separately: write normal lessons with quizzes and optional command examples.

## Development

Cartridges live in [`arborito-games`](https://github.com/treesys-org/arborito-games) (`cartridges/hacky-terminal/`). Each cartridge must appear in **`cartridges/manifest.json`** or the Arcade catalog will not list it. Push to `main` (Treesys: GitSync) to publish. Local dev uses the same jsDelivr catalog as production (`npm run dev` in arborito-games).

In **static mode**, Hacky Terminal auto-starts into the shell menu when the iframe loads. **Dynamic mode** uses the start screen and linear missions.

Desktop offline copies: Arcade → Storage.

## Related

- Play session API: [sdk-spec.md](sdk-spec.md) (section **Play session: `play`**)
