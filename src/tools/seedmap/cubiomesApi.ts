// Browser wrapper around the cubiomes WASM build (compiled from the C library).
// Exposes biome generation, biome colours/names, and structure finding.

/* eslint-disable @typescript-eslint/no-explicit-any */

let mod: any = null
let ready: Promise<void> | null = null

// cwrapped functions
let _setup: any, _apply: any, _biomeAt: any, _genArea: any, _genHeights: any, _findStructures: any
let _findStrongholds: any, _getSpawn: any, _villageAbandoned: any, _estimateLoot: any, _findOres: any
let lootPtr = 0, lootCap = 0
let orePtr = 0, oreCap = 0
let namePtr = 0, colorPtr = 0
let areaPtr = 0, areaCap = 0
let heightPtr = 0, heightCap = 0
let outPtr = 0, outCap = 0
let spawnPtr = 0

async function ensure(): Promise<void> {
  if (ready) return ready
  ready = (async () => {
    const buf = await fetch('/wasm/cubiomes.wasm').then(r => {
      if (!r.ok) throw new Error(`cubiomes.wasm ${r.status}`)
      return r.arrayBuffer()
    })
    const m = await import('./cubiomes.mjs')
    const factory = (m as any).default ?? (m as any)
    mod = await factory({ wasmBinary: new Uint8Array(buf) })

    _setup = mod.cwrap('mc_setup', 'number', ['string', 'number'])
    _apply = mod.cwrap('mc_apply', null, ['number', 'number', 'number'])
    _biomeAt = mod.cwrap('mc_biome_at', 'number', ['number', 'number', 'number', 'number'])
    _genArea = mod.cwrap('mc_gen_area', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number'])
    _genHeights = mod.cwrap('mc_gen_heights', 'number', ['number', 'number', 'number', 'number', 'number'])
    _findStructures = mod.cwrap('mc_find_structures', 'number',
      ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'])
    _findStrongholds = mod.cwrap('mc_find_strongholds', 'number', ['number', 'number'])
    _getSpawn = mod.cwrap('mc_get_spawn', null, ['number'])
    _villageAbandoned = mod.cwrap('mc_village_abandoned', 'number', ['number', 'number'])
    _estimateLoot = mod.cwrap('mc_estimate_loot', 'number', ['number', 'number', 'number', 'number', 'number'])
    _findOres = mod.cwrap('mc_find_ores', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number'])

    namePtr = mod._mc_malloc(64)
    colorPtr = mod._mc_malloc(256 * 3)
    spawnPtr = mod._mc_malloc(8)
  })()
  return ready
}

// ── Seed parsing ─────────────────────────────────────────────────────────────────

function javaHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}

export interface SeedParts { lo: number; hi: number; big: bigint }

export function seedToParts(input: string): SeedParts {
  const s = input.trim()
  let big: bigint
  if (/^-?\d+$/.test(s)) {
    try { big = BigInt(s) } catch { big = BigInt(javaHash(s)) }
  } else {
    big = BigInt(javaHash(s))
  }
  big &= (1n << 64n) - 1n
  const lo = Number(big & 0xffffffffn) >>> 0
  const hi = Number((big >> 32n) & 0xffffffffn) >>> 0
  return { lo, hi, big }
}

// ── Public API ──────────────────────────────────────────────────────────────────

export type Dim = 0 | -1 | 1   // overworld, nether, end

let cachedColors: Uint8Array | null = null

export async function initCubiomes(): Promise<void> { await ensure() }

export async function setupWorld(version: string, large: boolean): Promise<void> {
  await ensure()
  _setup(version, large ? 1 : 0)
}

export function applySeed(dim: Dim, parts: SeedParts): void {
  _apply(dim, parts.lo, parts.hi)
}

export function biomeAt(scale: number, x: number, y: number, z: number): number {
  return _biomeAt(scale, x, y, z)
}

/** Generate a grid of biome ids. cellX/cellZ are in scale-units; returns Int32Array(w*h). */
export function genArea(scale: number, cellX: number, cellZ: number, w: number, h: number, y: number): Int32Array {
  const need = w * h * 4
  if (need > areaCap) {
    if (areaPtr) mod._mc_free(areaPtr)
    areaPtr = mod._mc_malloc(need)
    areaCap = need
  }
  _genArea(areaPtr, scale, cellX, cellZ, w, h, y)
  // copy out of the heap (heap can move on growth)
  return mod.HEAP32.slice(areaPtr >> 2, (areaPtr >> 2) + w * h)
}

/** Approximate surface heights (blocks) for an area at 1:4 scale. qx/qz in quart coords. */
export function genHeights(qx: number, qz: number, w: number, h: number): Float32Array {
  const need = w * h * 4
  if (need > heightCap) {
    if (heightPtr) mod._mc_free(heightPtr)
    heightPtr = mod._mc_malloc(need)
    heightCap = need
  }
  _genHeights(heightPtr, qx, qz, w, h)
  return mod.HEAPF32.slice(heightPtr >> 2, (heightPtr >> 2) + w * h)
}

/** All distinct biomes (id + display name) for the current version. */
export function allBiomes(): { id: number; name: string }[] {
  const seen = new Set<string>()
  const out: { id: number; name: string }[] = []
  for (let id = 0; id < 256; id++) {
    const name = biomeName(id)
    if (!name || name === 'unknown' || seen.has(name)) continue
    seen.add(name)
    out.push({ id, name })
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

export function biomeColors(): Uint8Array {
  if (cachedColors) return cachedColors
  mod.ccall('mc_biome_colors', null, ['number'], [colorPtr])
  cachedColors = mod.HEAPU8.slice(colorPtr, colorPtr + 256 * 3)
  return cachedColors!
}

export function biomeName(id: number): string {
  mod.ccall('mc_biome_name', null, ['number', 'number', 'number'], [id, namePtr, 64])
  return mod.UTF8ToString(namePtr)
}

export interface FoundStructure { x: number; z: number }

export function findStructures(
  structType: number, parts: SeedParts,
  x0: number, z0: number, x1: number, z1: number, max = 4096,
): FoundStructure[] {
  const need = max * 8
  if (need > outCap) {
    if (outPtr) mod._mc_free(outPtr)
    outPtr = mod._mc_malloc(need)
    outCap = need
  }
  const n = _findStructures(structType, parts.lo, parts.hi, x0, z0, x1, z1, outPtr, max)
  const res: FoundStructure[] = []
  const base = outPtr >> 2
  for (let i = 0; i < n; i++) {
    res.push({ x: mod.HEAP32[base + i * 2], z: mod.HEAP32[base + i * 2 + 1] })
  }
  return res
}

/** Strongholds are a global feature — find up to `max` of them for the current seed. */
export function findStrongholds(max = 40): FoundStructure[] {
  const need = max * 8
  if (need > outCap) {
    if (outPtr) mod._mc_free(outPtr)
    outPtr = mod._mc_malloc(need)
    outCap = need
  }
  const n = _findStrongholds(outPtr, max)
  const res: FoundStructure[] = []
  const base = outPtr >> 2
  for (let i = 0; i < n; i++) res.push({ x: mod.HEAP32[base + i * 2], z: mod.HEAP32[base + i * 2 + 1] })
  return res
}

export function getSpawn(): FoundStructure {
  _getSpawn(spawnPtr)
  return { x: mod.HEAP32[spawnPtr >> 2], z: mod.HEAP32[(spawnPtr >> 2) + 1] }
}

/**
 * Ore block positions (x,y,z triples) within a chunk box, via the fork's ore-gen.
 * uiOre: 1=Diamond 2=AncientDebris 3=Redstone 4=Iron 5=Emerald 6=Gold 7=Lapis 8=Coal 9=Copper
 */
export function findOres(uiOre: number, cx0: number, cz0: number, cx1: number, cz1: number, max = 300000): Int32Array {
  const need = max * 3 * 4
  if (need > oreCap) {
    if (orePtr) mod._mc_free(orePtr)
    orePtr = mod._mc_malloc(need)
    oreCap = need
  }
  const n = _findOres(uiOre, cx0, cz0, cx1, cz1, orePtr, max)
  return mod.HEAP32.slice(orePtr >> 2, (orePtr >> 2) + n * 3)
}

/** Whether the village at a block position is an abandoned (zombie) village. */
export function villageAbandoned(x: number, z: number): boolean {
  return _villageAbandoned(x, z) === 1
}

export interface LootChest { x: number; y: number; z: number; items: { name: string; count: number }[] }

/** The exact (deterministic) chest loot at a structure for the current seed/version. */
export function estimateLoot(structType: number, x: number, z: number): LootChest[] {
  const cap = 1 << 16
  if (lootCap < cap) {
    if (lootPtr) mod._mc_free(lootPtr)
    lootPtr = mod._mc_malloc(cap)
    lootCap = cap
  }
  const len = _estimateLoot(structType, x, z, lootPtr, cap)
  if (len <= 0) return []
  try { return JSON.parse(mod.UTF8ToString(lootPtr)) } catch { return [] }
}
