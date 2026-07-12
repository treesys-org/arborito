# AI integration

> **TL;DR:** Sage is **optional**. Desktop uses **native llama.cpp**. Browser uses **Expert API** (your key) or shows “install desktop app”. No in-browser WASM LLM.

## Providers

| Build | Sage chat | Voice |
|-------|-----------|-------|
| **Desktop (Electron)** | Native `llama-server` in main process | Piper + Whisper (optional) |
| **Browser** | Expert API if configured, else unavailable | System `speechSynthesis` only |

Code: `src/features/learning/api/ai.js` → `llamacpp` or `expert-api` or `unavailable`.

## Models (desktop)

GGUF from Hugging Face, cached under Electron `userData` (`llamacpp-models/`). Default: Llama 3.2 1B Instruct Q4.

## Privacy

- AI loads only after user consent.
- No third-party **script** CDN; model weights download from Hugging Face when the user enables Sage.
- See Privacy & data for GDPR copy.

## Dev

```bash
npm start   # Electron + native llama
```

Bench: `node scripts/bench-sage-hola.mjs`
