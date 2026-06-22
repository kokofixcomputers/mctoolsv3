// Browser wrapper around the cubiomes WASM build (compiled from the C library).
// Exposes biome generation, biome colours/names, and structure finding.

/* eslint-disable @typescript-eslint/no-explicit-any */

let mod: any = null
let ready: Promise<void> | null = null

// cwrapped functions
let _setup: any, _apply: any, _biomeAt: any, _genArea: any, _findStructures: any
let _findStrongholds: any, _getSpawn: any, _villageAbandoned: any
let namePtr = 0, colorPtr = 0
let areaPtr = 0, areaCap = 0
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
    _findStructures = mod.cwrap('mc_find_structures', 'number',
      ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'])
    _findStrongholds = mod.cwrap('mc_find_strongholds', 'number', ['number', 'number'])
    _getSpawn = mod.cwrap('mc_get_spawn', null, ['number'])
    _villageAbandoned = mod.cwrap('mc_village_abandoned', 'number', ['number', 'number'])

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

/** Whether the village at a block position is an abandoned (zombie) village. */
export function villageAbandoned(x: number, z: number): boolean {
  return _villageAbandoned(x, z) === 1
}
