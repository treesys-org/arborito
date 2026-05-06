# wllama (same-origin fallback)

The Sage **AI worker** tries to load `@wllama/wllama` from here first, then falls back to jsDelivr.

If the CDN is blocked (CORS, tracking protection, offline), copy the package into this folder:

```bash
cd arborito
mkdir -p vendor/wllama/esm
cp node_modules/@wllama/wllama/esm/index.js vendor/wllama/esm/
cp node_modules/@wllama/wllama/esm/wasm-from-cdn.js vendor/wllama/esm/
# Also copy any additional chunks that those files import (check import graph).
```

After copying, reload the app; imports resolve from `vendor/wllama/esm/` relative to `src/services/ai-worker.js`.
