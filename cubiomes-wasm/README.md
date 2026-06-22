# cubiomes-wasm

Vendored [cubiomes](https://github.com/Cubitect/cubiomes) (Cubitect's C biome/structure
generation library) plus our thin `wrapper.c`, compiled to WebAssembly for the **Seed Map**
tool (`/seed-map`).

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
