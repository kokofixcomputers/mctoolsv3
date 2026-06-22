# cubiomes-wasm

Vendored [cubiomes — xpple's active fork](https://github.com/xpple/cubiomes) (C biome/
structure generation, based on Cubitect's original) plus our thin `wrapper.c`, compiled to
WebAssembly for the **Seed Map** tool (`/seed-map`).

The fork adds versions up to **26.2** (incl. the **`sulfur_caves`** biome), plus ore/ore-vein
generation, terrain noise, structure loot, and more — which is why we migrated to it (Cubitect's
upstream has been dormant for years). The vendored tree includes the `features/` and `loot/`
subdirectories the fork's `finders.c` depends on.

## Build

From the repo root:

```sh
./buildCubiomes.sh
```

Requires [Emscripten](https://emscripten.org). If `emcc` isn't on your PATH the script
looks for `$EMSDK/emsdk_env.sh` or `./emsdk/emsdk_env.sh`; otherwise it prints install
steps. One-time setup:

```sh
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk && ./emsdk install latest && ./emsdk activate latest && source ./emsdk_env.sh
```

The script outputs:

- `public/wasm/cubiomes.wasm` — the module (fetched same-origin by the app)
- `src/tools/seedmap/cubiomes.mjs` — the Emscripten ES6 glue

## What `wrapper.c` exposes

A flat C API consumed by [`src/tools/seedmap/cubiomesApi.ts`](../src/tools/seedmap/cubiomesApi.ts):
`mc_setup`, `mc_apply`, `mc_biome_at`, `mc_gen_area`, `mc_biome_colors`, `mc_biome_name`,
`mc_find_structures`, `mc_find_strongholds`, `mc_village_abandoned` (zombie-village check),
`mc_get_spawn`, plus `mc_malloc`/`mc_free`. When you add a new export, list it in both
`wrapper.c` (with `EMSCRIPTEN_KEEPALIVE`) and the `EXPORTS` line in `buildCubiomes.sh`.

## Verify

Correctness sanity check: seed `262` in MC 1.18 has a `mushroom_fields` biome at block
(0, 0) — straight from the cubiomes docs.

cubiomes is licensed under MIT (see `LICENSE`).
