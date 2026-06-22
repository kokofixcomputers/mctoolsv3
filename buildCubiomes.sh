#!/usr/bin/env bash
#
# Builds the cubiomes WASM module used by the Seed Map tool.
#
# Compiles the vendored cubiomes C library + our wrapper (cubiomes-wasm/) to
# WebAssembly with Emscripten and copies the outputs into the app:
#   public/wasm/cubiomes.wasm
#   src/tools/seedmap/cubiomes.mjs
#
# Requires Emscripten (emcc). If it's not on your PATH, the script will try to
# source an emsdk env from $EMSDK or ./emsdk, otherwise it prints install steps.
#
# Usage:  ./buildCubiomes.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$ROOT/cubiomes-wasm"

# ── Locate emcc ──────────────────────────────────────────────────────────────
if ! command -v emcc >/dev/null 2>&1; then
  if [ -n "${EMSDK:-}" ] && [ -f "$EMSDK/emsdk_env.sh" ]; then
    # shellcheck disable=SC1091
    source "$EMSDK/emsdk_env.sh"
  elif [ -f "$ROOT/emsdk/emsdk_env.sh" ]; then
    # shellcheck disable=SC1091
    source "$ROOT/emsdk/emsdk_env.sh"
  fi
fi

if ! command -v emcc >/dev/null 2>&1; then
  cat <<'EOF'
error: emcc (Emscripten) not found.

Install it once with:
  git clone https://github.com/emscripten-core/emsdk.git
  cd emsdk && ./emsdk install latest && ./emsdk activate latest
  source ./emsdk_env.sh

Then re-run ./buildCubiomes.sh (or set EMSDK to your emsdk dir).
EOF
  exit 1
fi

echo "Using $(emcc --version | head -1)"

# ── Compile ──────────────────────────────────────────────────────────────────
# Keep EXPORTED_FUNCTIONS in sync with wrapper.c's EMSCRIPTEN_KEEPALIVE functions.
EXPORTS='_mc_setup,_mc_apply,_mc_biome_at,_mc_gen_area,_mc_biome_colors,_mc_biome_name,_mc_find_structures,_mc_get_spawn,_mc_find_strongholds,_mc_village_abandoned,_mc_malloc,_mc_free,_malloc,_free'

cd "$SRC"
emcc -O3 -fwrapv \
  noise.c biomenoise.c biomes.c layers.c generator.c finders.c util.c wrapper.c \
  -I. \
  -sERROR_ON_UNDEFINED_SYMBOLS=0 \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker \
  -sALLOW_MEMORY_GROWTH=1 \
  -sEXPORTED_RUNTIME_METHODS=ccall,cwrap,getValue,setValue,UTF8ToString,HEAP32,HEAPU8 \
  -sEXPORTED_FUNCTIONS="$EXPORTS" \
  -o cubiomes.mjs

# ── Install outputs into the app ─────────────────────────────────────────────
mkdir -p "$ROOT/public/wasm" "$ROOT/src/tools/seedmap"
cp cubiomes.wasm "$ROOT/public/wasm/cubiomes.wasm"
cp cubiomes.mjs  "$ROOT/src/tools/seedmap/cubiomes.mjs"
rm -f cubiomes.wasm cubiomes.mjs

echo "✓ Built cubiomes WASM →"
echo "    public/wasm/cubiomes.wasm"
echo "    src/tools/seedmap/cubiomes.mjs"
