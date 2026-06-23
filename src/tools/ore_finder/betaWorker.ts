/// <reference lib="webworker" />
// "Beta" ore finder — powered by the cubiomes fork's ore generation (the old Rust
// ore-engine has been removed). Generates ore blocks for a chunk box and clusters
// adjacent blocks into veins.

import { setupWorld, applySeed, findOres, seedToParts } from '../seedmap/cubiomesApi'

type BetaRequest = { id: number; seedStr: string; x: number; z: number; radius: number; oreId: number }
type BetaResponse = { id: number; ok: boolean; result?: unknown; error?: string }

const ws = self as unknown as DedicatedWorkerGlobalScope

const BETA_VERSION = '1.21.11'
const MAX_RADIUS = 24       // chunk radius cap
const MAX_CLUSTERS = 50000  // absolute safety cap; the page applies the user-facing cap + sort

interface Cluster { x: number; y: number; z: number; ores: number }

// Group ore blocks into veins by 26-neighbour connectivity.
function clusterBlocks(blocks: Int32Array): Cluster[] {
  const count = blocks.length / 3
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`
  const index = new Map<string, number>()
  for (let i = 0; i < count; i++) index.set(key(blocks[i * 3], blocks[i * 3 + 1], blocks[i * 3 + 2]), i)

  const seen = new Uint8Array(count)
  const clusters: Cluster[] = []
  for (let i = 0; i < count; i++) {
    if (seen[i]) continue
    const stack = [i]
    seen[i] = 1
    let sx = 0, sy = 0, sz = 0, n = 0
    while (stack.length) {
      const j = stack.pop()!
      const bx = blocks[j * 3], by = blocks[j * 3 + 1], bz = blocks[j * 3 + 2]
      sx += bx; sy += by; sz += bz; n++
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dy === 0 && dz === 0) continue
        const nb = index.get(key(bx + dx, by + dy, bz + dz))
        if (nb !== undefined && !seen[nb]) { seen[nb] = 1; stack.push(nb) }
      }
    }
    clusters.push({ x: Math.round(sx / n), y: Math.round(sy / n), z: Math.round(sz / n), ores: n })
  }
  return clusters
}

ws.onmessage = async (e: MessageEvent<BetaRequest>) => {
  const { id, seedStr, x, z, radius, oreId } = e.data
  try {
    await setupWorld(BETA_VERSION, false)
    const parts = seedToParts(seedStr)
    const dim = oreId === 2 ? -1 : 0  // ancient debris → Nether
    applySeed(dim, parts)

    const ccx = Math.floor(x / 16), ccz = Math.floor(z / 16)
    const r = Math.max(1, Math.min(radius, MAX_RADIUS))
    const blocks = findOres(oreId, ccx - r, ccz - r, ccx + r, ccz + r)

    // Keep generation/scan order so clusters are spread across the whole search
    // area (sorting nearest-first would collapse the visible list onto spawn when
    // there are thousands of veins). Cap for the UI.
    const clusters = clusterBlocks(blocks).slice(0, MAX_CLUSTERS)

    const result = {
      ores_found: blocks.length / 3,
      clusters_found: clusters.length,
      clusters,
      seed_used: parts.big.toString(),
      seed_input: seedStr,
      center_x: x,
      center_z: z,
      radius,
    }
    ws.postMessage({ id, ok: true, result } satisfies BetaResponse)
  } catch (err: unknown) {
    ws.postMessage({ id, ok: false, error: String(err instanceof Error ? err.message : err) } satisfies BetaResponse)
  }
}
