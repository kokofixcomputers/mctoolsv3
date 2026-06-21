// api.ts (browser-safe)
// MinecraftStructures API v2.0 - Direct async functions for browser

// Types for the WASM glue exports
type EditionEnum = {
  Java: number;
  Bedrock: number;
};

type VersionEnum = {
  V1_7: number;
  V1_8: number;
  V1_9: number;
  V1_10: number;
  V1_11: number;
  V1_12: number;
  V1_13: number;
  V1_14: number;
  V1_15: number;
  V1_16: number;
  V1_17: number;
  V1_18: number;
  V1_19: number;
  V1_19_3: number;
  V1_20: number;
  V1_20_2: number;
  V1_20_30: number;
  V_1_20_60: number;
  V1_21: number;
  V1_21_2: number;
  V1_21_40_V1_21_4: number;
  V1_21_50_V1_21_5: number;
  V1_21_60_V1_21_6: number;
  V1_21_70: number;
  V1_21_80: number;
};

type WorldCtor = new (
  lo: number,
  hi: number,
  edition: number,
  version: number,
  biomeSize?: number | undefined,
  largeBiomes?: boolean
) => any;

type ZoneCtor = new (
  x: number,
  z: number,
  sizeX: number,
  sizeZ: number
) => any;

type OreFinderCtor = new (world: any, oreIndex: number) => {
  find(zone: any): any;
};

// --- Lazy WASM/glue loader for browser (for enums etc.) ---

let wasmLoaded = false;
let Edition!: EditionEnum;
let Version!: VersionEnum;
let World!: WorldCtor;
let Zone!: ZoneCtor;
let OreFinder!: OreFinderCtor;

/**
 * Call this before using getEnums, or let it be implicitly awaited.
 * Ore finding itself will run inside a worker, but we still use
 * these enums/types on the main thread.
 */
async function ensureWasmLoaded() {
  if (wasmLoaded) return;

  const glue = await import("./glue/wasmGlueFileForOres.mjs");

  Edition = glue.Edition as EditionEnum;
  Version = glue.Version as VersionEnum;
  World = glue.World as WorldCtor;
  Zone = glue.Zone as ZoneCtor;
  OreFinder = glue.OreFinder as OreFinderCtor;

  wasmLoaded = true;
}

// --- Biome maps (unchanged, pure data) ---

export const BIOME_ID_TO_NAME: Record<number, string> = {
  0: "Ocean",
  1: "Plains",
  2: "Desert",
  3: "Windswept Hills",
  4: "Forest",
  5: "Taiga",
  6: "Swamp",
  7: "River",
  10: "Frozen Ocean",
  11: "Frozen River",
  12: "Snowy Plains",
  13: "Snowy Mountains",
  14: "Mushroom Fields",
  15: "Mushroom Fields Shore",
  16: "Beach",
  17: "Desert Hills",
  18: "Windswept Forest",
  19: "Taiga Hills",
  20: "Mountain Edge",
  21: "Jungle",
  22: "Jungle Hills",
  23: "Sparse Jungle",
  24: "Deep Ocean",
  25: "Stony Shore",
  26: "Snowy Beach",
  27: "Birch Forest",
  28: "Birch Forest Hills",
  29: "Dark Forest",
  30: "Snowy Taiga",
  31: "Snowy Taiga Hills",
  32: "Old Growth Pine Taiga",
  33: "Giant Tree Taiga Hills",
  34: "Wooded Mountains",
  35: "Savanna",
  36: "Savanna Plateau",
  37: "Badlands",
  38: "Wooded Badlands",
  39: "Badlands Plateau",
  44: "Warm Ocean",
  45: "Lukewarm Ocean",
  46: "Cold Ocean",
  47: "Deep Warm Ocean",
  48: "Deep Lukewarm Ocean",
  49: "Deep Cold Ocean",
  50: "Deep Frozen Ocean",
  129: "Sunflower Plains",
  130: "Desert Lakes",
  131: "Windswept Gravelly Hills",
  132: "Flower Forest",
  133: "Taiga Mountains",
  134: "Swamp Hills",
  140: "Ice Spikes",
  149: "Modified Jungle",
  151: "Modified Jungle Edge",
  155: "Old Growth Birch Forest",
  156: "Tall Birch Hills",
  157: "Dark Forest Hills",
  158: "Snowy Taiga Mountains",
  160: "Old Growth Spruce Taiga",
  161: "Giant Spruce Taiga Hills",
  162: "Gravelly Mountains",
  163: "Windswept Savanna",
  164: "Shattered Savanna Plateau",
  165: "Eroded Badlands",
  166: "Modified Wooded Badlands Plateau",
  167: "Modified Badlands Plateau",
  168: "Bamboo Jungle",
  169: "Bamboo Jungle Hills",
  174: "Dripstone Caves",
  175: "Lush Caves",
  177: "Meadow",
  178: "Grove",
  179: "Snowy Slopes",
  180: "Frozen Peaks",
  181: "Jagged Peaks",
  182: "Stony Peaks",
  183: "Deep Dark",
  184: "Mangrove Swamp",
  185: "Cherry Grove",
};

export const BIOME_KEY_TO_ID: Record<string, number> = {
  ocean: 0,
  plains: 1,
  desert: 2,
  windswept_hills: 3,
  forest: 4,
  taiga: 5,
  swamp: 6,
  river: 7,
  frozen_ocean: 10,
  frozen_river: 11,
  snowy_plains: 12,
  snowy_mountains: 13,
  mushroom_fields: 14,
  mushroom_fields_shore: 15,
  beach: 16,
  desert_hills: 17,
  windswept_forest: 18,
  taiga_hills: 19,
  mountain_edge: 20,
  jungle: 21,
  jungle_hills: 22,
  sparse_jungle: 23,
  deep_ocean: 24,
  stony_shore: 25,
  snowy_beach: 26,
  birch_forest: 27,
  birch_forest_hills: 28,
  dark_forest: 29,
  snowy_taiga: 30,
  snowy_taiga_hills: 31,
  old_growth_pine_taiga: 32,
  giant_tree_taiga_hills: 33,
  wooded_mountains: 34,
  savanna: 35,
  savanna_plateau: 36,
  badlands: 37,
  wooded_badlands: 38,
  badlands_plateau: 39,
  warm_ocean: 44,
  lukewarm_ocean: 45,
  cold_ocean: 46,
  deep_warm_ocean: 47,
  deep_lukewarm_ocean: 48,
  deep_cold_ocean: 49,
  deep_frozen_ocean: 50,
  sunflower_plains: 129,
  desert_lakes: 130,
  windswept_gravelly_hills: 131,
  flower_forest: 132,
  taiga_mountains: 133,
  swamp_hills: 134,
  ice_spikes: 140,
  modified_jungle: 149,
  modified_jungle_edge: 151,
  old_growth_birch_forest: 155,
  tall_birch_hills: 156,
  dark_forest_hills: 157,
  snowy_taiga_mountains: 158,
  old_growth_spruce_taiga: 160,
  giant_spruce_taiga_hills: 161,
  gravelly_mountains: 162,
  windswept_savanna: 163,
  shattered_savanna_plateau: 164,
  eroded_badlands: 165,
  modified_wooded_badlands_plateau: 166,
  modified_badlands_plateau: 167,
  bamboo_jungle: 168,
  bamboo_jungle_hills: 169,
  dripstone_caves: 174,
  lush_caves: 175,
  meadow: 177,
  grove: 178,
  snowy_slopes: 179,
  frozen_peaks: 180,
  jagged_peaks: 181,
  stony_peaks: 182,
  deep_dark: 183,
  mangrove_swamp: 184,
  cherry_grove: 185,
};

// --- Helper types and functions ---

type EditionString = "Java" | "Bedrock";
type ParseEditionMode = "ore" | "structure" | "biome";

function parseEdition(
  name: unknown,
  editionEnum: EditionEnum | null,
  mode: ParseEditionMode
): number | EditionString {
  const s = String(name ?? "").toLowerCase();
  if (mode === "ore") {
    if (!editionEnum) throw new Error("Edition enum not provided for ore mode");
    if (s === "java") return editionEnum.Java;
    if (s === "bedrock") return editionEnum.Bedrock;
  } else {
    if (s === "java") return "Java";
    if (s === "bedrock") return "Bedrock";
  }
  throw new Error("Unknown edition: " + name);
}

function parseVersion(versionStr: unknown): number {
  const s = String(versionStr ?? "").trim();
  const versionMap: Record<string, number> = {
    "1.7": Version.V1_7,
    "1.8": Version.V1_8,
    "1.9": Version.V1_9,
    "1.10": Version.V1_10,
    "1.11": Version.V1_11,
    "1.12": Version.V1_12,
    "1.13": Version.V1_13,
    "1.14": Version.V1_14,
    "1.15": Version.V1_15,
    "1.16": Version.V1_16,
    "1.17": Version.V1_17,
    "1.18": Version.V1_18,
    "1.19": Version.V1_19,
    "1.19.3": Version.V1_19_3,
    "1.20": Version.V1_20,
    "1.20.2": Version.V1_20_2,
    "1.20.30": Version.V1_20_30,
    "1.20.60": Version.V_1_20_60,
    "1.21": Version.V1_21,
    "1.21.2": Version.V1_21_2,
    "1.21.4": Version.V1_21_40_V1_21_4,
    "1.21.5": Version.V1_21_50_V1_21_5,
    "1.21.6": Version.V1_21_60_V1_21_6,
    "1.21.7": Version.V1_21_70,
    "1.21.8": Version.V1_21_80,
  };
  const v = versionMap[s];
  if (!v) throw new Error("Unsupported version string: " + versionStr);
  return v;
}

function javaHash(seedStr: string): number {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h, 31) + seedStr.charCodeAt(i);
    h |= 0;
  }
  return h;
}

function splitSeedToHiLo(seedBigInt: bigint): { hi: number; lo: number } {
  const mask32 = 0xffffffffn;
  const lo = Number(seedBigInt & mask32);
  const hi = Number((seedBigInt >> 32n) & mask32);
  return { hi, lo };
}

// --- Public API types ---

export interface OreFinderParams {
  edition: EditionString;
  version: string;
  seed: string | number;
  x: number;
  z: number;
  radius?: number;
  oreIndex?: number;
}

export interface OreCluster {
  x: number;
  z: number;
  y: number;
  ores: number;
  [key: string]: unknown;
}

export interface OreFinderResult {
  ores_found: number;
  clusters_found: number;
  clusters: OreCluster[];
  seed_used: string;
  seed_input: string;
  search_center: { x: number; z: number };
  search_radius: number;
}

// --- Worker wiring ---

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (v: any) => void; reject: (e: any) => void }
>();

function getWorker(): Worker {
  if (worker) return worker;

  // Adjust path if needed; bundler must support this pattern.
  worker = new Worker(new URL("./oreWorker.ts", import.meta.url), {
    type: "module",
  });

  worker.onmessage = (event: MessageEvent<any>) => {
    const { id, ok, result, error } = event.data;
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (ok) entry.resolve(result);
    else entry.reject(new Error(error));
  };

  return worker;
}

function callWorker(type: "ORE_FINDER", payload: any): Promise<any> {
  const w = getWorker();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, type, payload });
  });
}

// --- Main API: ore_finder (browser, off-main-thread) ---

export async function ore_finder(params: OreFinderParams): Promise<OreFinderResult> {
  // Still load enums/types on main thread for parsing.
  await ensureWasmLoaded();

  const edition = parseEdition(params.edition, Edition, "ore") as number;
  const version = parseVersion(params.version);

  let seed: bigint;
  const seedInput = String(params.seed).trim();
  if (/^-?\d+$/.test(seedInput)) {
    seed = BigInt(seedInput);
  } else {
    const hash32 = javaHash(seedInput);
    seed = BigInt(hash32);
  }

  const { hi, lo } = splitSeedToHiLo(seed);
  const x = Number(params.x);
  const z = Number(params.z);
  const radius = Number(params.radius ?? 5);
  const oreIndex = Number(params.oreIndex ?? 0);

  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new Error("x and z must be numbers");
  }
  if (!Number.isInteger(radius) || radius <= 0) {
    throw new Error("radius must be a positive integer");
  }
  if (!Number.isInteger(oreIndex) || oreIndex < 1 || oreIndex > 9) {
    throw new Error("oreIndex must be an integer between 1 and 9");
  }

  const workerResult = await callWorker("ORE_FINDER", {
    edition,
    version,
    lo,
    hi,
    x,
    z,
    radius,
    oreIndex,
  });

  const {
    ores_found,
    clusters_found,
    clusters,
  } = workerResult as {
    ores_found: number;
    clusters_found: number;
    clusters: OreCluster[];
  };

  return {
    ores_found,
    clusters_found,
    clusters,
    seed_used: seed.toString(),
    seed_input: seed.toString(),
    search_center: { x, z },
    search_radius: radius,
  };
}

// Optional: re‑export Edition/Version enums (once wasm is loaded)
export async function getEnums() {
  await ensureWasmLoaded();
  return { Edition, Version };
}
