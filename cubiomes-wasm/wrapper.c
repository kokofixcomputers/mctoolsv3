// Thin wrapper around cubiomes for the web seed-map tool.
// Exposes a flat C API that's easy to call from JS/WASM.
#include "generator.h"
#include "finders.h"
#include "util.h"
#include "loot/loot_tables.h"
#include "loot/loot_table_context.h"
#include <emscripten.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

static Generator g;
static int g_mc = MC_NEWEST;
static uint64_t g_seed = 0;
static SurfaceNoise g_sn;
static int g_dim = 0;

// Set up the generator for a version string ("1.21", "1.18", ...) and large-biomes flag.
EMSCRIPTEN_KEEPALIVE
int mc_setup(const char* ver, int large) {
    int mc = str2mc(ver);
    if (mc < 0) mc = MC_NEWEST;
    g_mc = mc;
    setupGenerator(&g, mc, large ? LARGE_BIOMES : 0);
    return mc;
}

// Apply a seed (split into low/high 32-bit halves) for a dimension.
// dim: 0 = Overworld, -1 = Nether, 1 = End
EMSCRIPTEN_KEEPALIVE
void mc_apply(int dim, unsigned int seedLo, unsigned int seedHi) {
    uint64_t seed = ((uint64_t)seedHi << 32) | (uint64_t)seedLo;
    g_seed = seed;
    g_dim = dim;
    applySeed(&g, dim, seed);
    initSurfaceNoise(&g_sn, dim, seed);
}

// Approximate Overworld surface height (in blocks) for an area at 1:4 scale.
// qx,qz and w,h are in quart (biome) coordinates. Writes w*h floats into out.
EMSCRIPTEN_KEEPALIVE
int mc_gen_heights(float* out, int qx, int qz, int w, int h) {
    return mapApproxHeight(out, NULL, &g, &g_sn, qx, qz, w, h);
}

// Single block-position biome id.
EMSCRIPTEN_KEEPALIVE
int mc_biome_at(int scale, int x, int y, int z) {
    return getBiomeAt(&g, scale, x, y, z);
}

// Generate an area of biome ids into `out` (length sx*sz).
// scale must be 1, 4, 16, 64, or 256. y is the (scale-4) vertical layer.
EMSCRIPTEN_KEEPALIVE
int mc_gen_area(int* out, int scale, int x, int z, int sx, int sz, int y) {
    Range r;
    r.scale = scale;
    r.x = x; r.z = z;
    r.sx = sx; r.sz = sz;
    r.y = y; r.sy = 1;
    int* cache = allocCache(&g, r);
    if (!cache) return 0;
    genBiomes(&g, cache, r);
    memcpy(out, cache, (size_t)sx * sz * sizeof(int));
    free(cache);
    return 1;
}

// Authentic cubiomes biome palette → out is 256*3 bytes (RGB).
EMSCRIPTEN_KEEPALIVE
void mc_biome_colors(unsigned char* out) {
    unsigned char colors[256][3];
    initBiomeColors(colors);
    memcpy(out, colors, 256 * 3);
}

// Biome display name for an id → writes into `out` (caller provides >=64 bytes).
EMSCRIPTEN_KEEPALIVE
void mc_biome_name(int id, char* out, int cap) {
    const char* s = biome2str(g_mc, id);
    if (!s) s = "unknown";
    int i = 0;
    for (; s[i] && i < cap - 1; i++) out[i] = s[i];
    out[i] = 0;
}

// ── Structures ──────────────────────────────────────────────────────────────────
// Find all generation attempts of `structType` within a block-coordinate box and
// verify them. Writes [x,z] pairs into `out` (each entry 2 ints), up to `maxOut`
// entries. Returns the number found.
EMSCRIPTEN_KEEPALIVE
int mc_find_structures(int structType, unsigned int seedLo, unsigned int seedHi,
                       int x0, int z0, int x1, int z1, int* out, int maxOut) {
    uint64_t seed = ((uint64_t)seedHi << 32) | (uint64_t)seedLo;
    StructureConfig sc;
    if (!getStructureConfig(structType, g_mc, &sc)) return 0;

    // Region size in blocks (regionSize chunks * 16).
    int regBlocks = sc.regionSize * 16;
    if (regBlocks <= 0) regBlocks = 512;

    int rx0 = (int)floordiv(x0, regBlocks);
    int rz0 = (int)floordiv(z0, regBlocks);
    int rx1 = (int)floordiv(x1, regBlocks);
    int rz1 = (int)floordiv(z1, regBlocks);

    int n = 0;
    for (int rz = rz0; rz <= rz1 && n < maxOut; rz++) {
        for (int rx = rx0; rx <= rx1 && n < maxOut; rx++) {
            Pos p;
            if (!getStructurePos(structType, g_mc, seed, rx, rz, &p)) continue;
            if (p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1) continue;
            if (!isViableStructurePos(structType, &g, p.x, p.z, 0)) continue;
            out[n * 2 + 0] = p.x;
            out[n * 2 + 1] = p.z;
            n++;
        }
    }
    return n;
}

// Is the village at this block position an abandoned (zombie) village? 1 = yes.
EMSCRIPTEN_KEEPALIVE
int mc_village_abandoned(int x, int z) {
    int biome = getBiomeAt(&g, 1, x, 63, z);
    StructureVariant sv;
    memset(&sv, 0, sizeof(sv));
    getVariant(&sv, Village, g_mc, g_seed, x, z, biome);
    return sv.abandoned ? 1 : 0;
}

// World spawn point → out[0]=x, out[1]=z
EMSCRIPTEN_KEEPALIVE
void mc_get_spawn(int* out) {
    Pos p = getSpawn(&g);
    out[0] = p.x; out[1] = p.z;
}

// Strongholds (a global feature, not region-based). Writes up to maxOut [x,z]
// pairs into `out`; returns the count found.
EMSCRIPTEN_KEEPALIVE
int mc_find_strongholds(int* out, int maxOut) {
    StrongholdIter sh;
    initFirstStronghold(&sh, g_mc, g_seed);
    int n = 0;
    while (n < maxOut) {
        if (nextStronghold(&sh, &g) <= 0) break;
        out[n * 2 + 0] = sh.pos.x;
        out[n * 2 + 1] = sh.pos.z;
        n++;
    }
    return n;
}

// Estimate the actual chest loot at a structure (deterministic from seed + chest
// position). Writes a JSON array of chests → items into `out`. Returns bytes written.
// Only some structures support loot (see the fork's docs). NB: loot tables from
// init_loot_table_name are STATIC — never free them.
static Piece g_pieces[600];

EMSCRIPTEN_KEEPALIVE
int mc_estimate_loot(int stype, int x, int z, char* out, int cap) {
    out[0] = 0;
    int biome = getBiomeAt(&g, 4, x >> 2, 15, z >> 2);

    StructureVariant sv;
    memset(&sv, 0, sizeof(sv));
    getVariant(&sv, stype, g_mc, g_seed, x, z, biome);
    int vbiome = sv.biome >= 0 ? sv.biome : biome;

    StructureSaltConfig ssconf;
    if (!getStructureSaltConfig(stype, g_mc, vbiome, &ssconf)) return 0;

    int np = getStructurePieces(g_pieces, 600, stype, ssconf, &sv, g_mc, g_seed, x, z);
    if (np <= 0) return 0;

    int len = 0;
    len += snprintf(out + len, cap - len, "[");
    int firstChest = 1;
    for (int p = 0; p < np && len < cap - 80; p++) {
        for (int c = 0; c < g_pieces[p].chestCount && len < cap - 80; c++) {
            LootTableContext* ctx = NULL;
            if (!init_loot_table_name(&ctx, g_pieces[p].lootTables[c], g_mc) || !ctx)
                continue;
            // Tables with unresolved sub-tables (e.g. 1.20+ archaeology) would call a
            // null function in generate_loot — skip them. Never free (tables are static).
            if (ctx->unresolved_subtable_count > 0) continue;
            set_loot_seed(ctx, g_pieces[p].lootSeeds[c]);
            generate_loot(ctx);

            if (!firstChest) len += snprintf(out + len, cap - len, ",");
            firstChest = 0;
            Pos cp = g_pieces[p].chestPoses[c];
            len += snprintf(out + len, cap - len, "{\"x\":%d,\"y\":%d,\"z\":%d,\"items\":[",
                            cp.x, (int)g_pieces[p].pos.y, cp.z);
            for (int i = 0; i < ctx->generated_item_count && len < cap - 80; i++) {
                ItemStack it = ctx->generated_items[i];
                const char* nm = get_item_name(ctx, it.item);
                if (!nm) nm = "unknown";
                len += snprintf(out + len, cap - len, "%s{\"name\":\"%s\",\"count\":%d}",
                                i ? "," : "", nm, it.count);
            }
            len += snprintf(out + len, cap - len, "]}");
        }
    }
    len += snprintf(out + len, cap - len, "]");
    return len;
}

// Allocate / free scratch buffers for JS.
EMSCRIPTEN_KEEPALIVE void* mc_malloc(int n) { return malloc(n); }
EMSCRIPTEN_KEEPALIVE void mc_free(void* p) { free(p); }
