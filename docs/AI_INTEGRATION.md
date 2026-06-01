# AI integration

> **TL;DR for users:** the AI tutor in Arborito is **optional**. You can learn, plant trees, take quizzes, and play games without ever turning it on. If you do enable it, everything runs **on your own device** — there is no cloud AI provider involved.

This document is for developers and curious users who want to understand exactly how AI works inside Arborito, what gets bundled, what gets downloaded, and where things live on disk.

---

## What is "the AI" in Arborito?

Two surfaces use a local LLM:

1. **Sage**, the owl tutor in the chat dock (lesson summaries, Q&A, study help).
2. **Dynamic game cartridges** in the Arcade — cartridges that opt into `ask.json` for procedural quiz/RPG content.

Both call the **same** internal service (`aiService.chat()` in `src/features/learning/ai.js`). Everything else in the app (the map, lessons, quizzes, Memory Garden, Nostr sync, the visual editor) works with **no AI at all**.

## Two builds, two engines, same model files

The same source code produces two builds. The engine is picked automatically based on where the renderer is running — there is no user-facing toggle:

| Build | Engine | Where it runs | What the user gets |
|---|---|---|---|
| **Desktop (Electron)** | [`node-llama-cpp`](https://github.com/withcatai/node-llama-cpp) — a Node binding around llama.cpp | Electron main process | Real native code, multi-threaded CPU, GPU acceleration when available (Metal on macOS, CUDA on NVIDIA, Vulkan elsewhere). |
| **In-browser** (`arborito.org`, GitHub Pages mirrors, …) | [`@wllama/wllama`](https://github.com/ngxson/wllama) (WebAssembly llama.cpp port) running in a Web Worker | Browser tab | Zero install, zero processes outside the tab. Slower because WebAssembly cannot reach the GPU. |

At startup the renderer checks for the Electron preload bridge (`window.arboritoElectron`). If present, it routes through native llama.cpp; otherwise it loads the WebAssembly worker. The user does not pick the engine in any UI — there is nothing to pick, the right one for the build is already chosen.

## What is bundled vs. what is downloaded

This is the question that surprises most people:

| Thing | Desktop build | In-browser build |
|---|---|---|
| **Inference engine** | **Bundled.** `node-llama-cpp` is installed during `npm install` and ships **prebuilt native binaries** for the target platform (Linux x64/arm64, macOS x64/arm64-with-Metal, Windows x64-with-CUDA-optional). `electron-builder` packs them inside the AppImage / `.deb` / `.dmg` / `.exe` thanks to the `asarUnpack` config. **No engine download happens at runtime.** | **Lazy-loaded.** The WebAssembly bundle is served from the same-origin `vendor/wllama/` directory (or, if missing, from jsDelivr after explicit AI consent). It is **not** required to start the app — only when the user opts into AI. |
| **Model weights (GGUF)** | **Downloaded at first use** from Hugging Face into `<userData>/llamacpp-models/<file>.gguf`. The default `Llama-3.2-1B-Instruct-Q4_K_M.gguf` is about 770 MB. Subsequent launches reuse the cached file. | **Downloaded at first use** from Hugging Face into the browser's Cache API (`wllama-cache`). Same model, same ~770 MB. |

## Default model

Both builds default to **Llama-3.2-1B-Instruct (Q4_K_M, GGUF)** from `bartowski/Llama-3.2-1B-Instruct-GGUF`. The user can change it from **Sage → Settings**; any public GGUF on Hugging Face works.

## Where settings live

| Build | Settings | Model files |
|---|---|---|
| **In-browser** | `localStorage` keys prefixed `arborito_` (model id, max tokens, context preset, …). Wipe everything via **Profile → wipe local data**. | Browser Cache API under `wllama-cache`. |
| **Desktop (Electron)** | `<userData>/arborito-llamacpp.json` (model id, max tokens, context preset, …). | `<userData>/llamacpp-models/<file>.gguf`. |

The `<userData>` directory comes from Electron's `app.getPath('userData')`:

| OS | Path |
|---|---|
| **Linux** | `~/.config/Arborito/` |
| **macOS** | `~/Library/Application Support/Arborito/` |
| **Windows** | `%APPDATA%\Arborito\` |

Browser sessions and desktop installs are **independent storage** — they don't share `localStorage`, `userData`, or the cached model file. Moving from one to the other means downloading the model again the first time.

## Running the desktop build

```bash
npm install   # also installs node-llama-cpp via optionalDependencies
npm start
```

`node-llama-cpp` is declared as an **optional** dependency: if the prebuilt binary for the host doesn't exist (older OS, restricted CI sandbox, …) the Electron app boots normally and the renderer transparently uses the WebAssembly path instead. The Sage settings tile header indicates which one is active: *Native (desktop)* vs *In-browser (WebAssembly)*.

## Source map

| File | Role |
|---|---|
| `electron-main.js` | Electron main process: registers `arborito-llamacpp-*` IPC handlers backed by lazy-loaded `node-llama-cpp`. |
| `preload.js` | Exposes `window.arboritoElectron.llamacpp` to the renderer (status, paths, load, chat with streaming, abort). |
| `src/features/learning/ai.js` | Provider-agnostic chat pipeline. Routes through native llama.cpp when the bridge is present, otherwise through the WebAssembly worker. |
| `src/features/learning/ai-llamacpp-bridge.js` | Renderer-side wrapper over `arboritoElectron.llamacpp`. Returns false-y when not in Electron, which is how the in-browser fallback is detected. |
| `src/features/learning/ai-worker.js` | Web Worker that loads wllama (vendor first, jsDelivr fallback) and downloads the GGUF from Hugging Face. |
| `src/features/learning/modals/sage*.js` | Sage UI (chat panel, settings panel, optional opt-in screen). |
| `src/features/arcade/inject-game-sdk.js` | Browser game SDK injected into cartridge iframes. Surfaces `window.arborito.ask.json` / `.chat` and the static-mode error codes. |

## Cartridge AI (`window.arborito.ask.json`)

Game cartridges call the same `aiService.chat()` underneath, so the desktop-or-browser switch is invisible to them — they only care that a valid JSON answer comes back when AI is enabled.

For Python / standalone game engines (outside the browser iframe) see [`arborito-games/sdk/README.md`](../../arborito-games/sdk/README.md). That SDK targets a local **`llama-server`** instance over the OpenAI-compatible `/v1/chat/completions` endpoint; configure with `LLAMA_CPP_HOST` (default `http://127.0.0.1:8080`).

## Privacy summary

- **No third-party AI provider.** Arborito does not call OpenAI, Anthropic, Google, any cloud LLM, or any AI service that bills per-token. The model runs on the user's own machine.
- **Network usage strictly limited.** The only AI-related network traffic is the **one-time** model download from Hugging Face (or, in the browser build, the WebAssembly bundle from `vendor/` or jsDelivr if `vendor/wllama/` is empty).
- **Explicit opt-in.** AI does not run on first launch. The user has to accept a privacy notice in **Sage → Settings** (or when a dynamic game cartridge requests AI). Until they do, no model downloads and no inference runs.
- **Easy to back out.** Clearing local data (Profile → wipe local data on web; uninstall + delete `<userData>/Arborito/` on desktop) removes everything — settings, model weights, chat history.
