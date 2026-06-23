// Web Worker: brute-forces seeds looking for a cluster of structures that satisfy
// the user's criteria. The first criterion is the "anchor" (must be near spawn);
// the rest must each lie within their distance of the anchor.

import { setupWorld, applySeed, findStructures } from './cubiomesApi'

interface Crit { type: number; within: number }

let stopped = false
let count = 0
let seed = 0
let stride = 1   // seeds are partitioned across workers: each handles seed, seed+stride, …
let version = '1.21.11'
let large = false
let searchRadius = 2000
let maxSeeds = 0 // 0 = infinite (per worker)
let criteria: Crit[] = []

type StartMsg = { type: 'start'; version: string; large: boolean; searchRadius: number; maxSeeds: number; criteria: Crit[]; startSeed: number; stride: number }
type StopMsg = { type: 'stop' }

const post = (m: unknown) => (self as unknown as Worker).postMessage(m)

self.onmessage = async (e: MessageEvent<StartMsg | StopMsg>) => {
  const m = e.data
  if (m.type === 'stop') { stopped = true; return }
  if (m.type === 'start') {
    stopped = false; count = 0
    version = m.version; large = m.large; searchRadius = m.searchRadius
    maxSeeds = m.maxSeeds; criteria = m.criteria
    seed = m.startSeed >>> 0; stride = Math.max(1, m.stride)
    await setupWorld(version, large)
    runBatch()
  }
}

function dist2(ax: number, az: number, bx: number, bz: number) {
  const dx = ax - bx, dz = az - bz
  return dx * dx + dz * dz
}

interface Found { type: number; x: number; z: number }

function checkSeed(s: number): Found[] | null {
  const parts = { lo: s >>> 0, hi: 0, big: 0n }
  applySeed(0, parts)
  const anchor = criteria[0]
  const maxWithin = criteria.slice(1).reduce((m, c) => Math.max(m, c.within), 0)
  const box = searchRadius + maxWithin

  // Cache verified positions per distinct structure type within the box.
  const cache = new Map<number, { x: number; z: number }[]>()
  const posOf = (t: number) => {
    let v = cache.get(t)
    if (!v) { v = findStructures(t, parts, -box, -box, box, box, 4096); cache.set(t, v) }
    return v
  }

  const anchors = posOf(anchor.type).filter(p => Math.abs(p.x) <= searchRadius && Math.abs(p.z) <= searchRadius)
  for (const A of anchors) {
    const used = new Set<string>([`${A.x},${A.z}`])
    const chosen: Found[] = [{ type: anchor.type, x: A.x, z: A.z }]
    let ok = true
    for (let i = 1; i < criteria.length; i++) {
      const c = criteria[i]
      const w2 = c.within * c.within
      const hit = posOf(c.type).find(p => !used.has(`${p.x},${p.z}`) && dist2(p.x, p.z, A.x, A.z) <= w2)
      if (!hit) { ok = false; break }
      used.add(`${hit.x},${hit.z}`)
      chosen.push({ type: c.type, x: hit.x, z: hit.z })
    }
    if (ok) return chosen
  }
  return null
}

function runBatch() {
  if (stopped) return
  const t0 = performance.now()
  let found: { seed: number; positions: Found[] } | null = null
  while (performance.now() - t0 < 60) {
    const s = seed
    const r = checkSeed(s)
    count++
    seed = (seed + stride) >>> 0
    if (r) { found = { seed: s, positions: r }; break }
    if (maxSeeds > 0 && count >= maxSeeds) break
  }
  post({ type: 'progress', count })
  if (found) { post({ type: 'found', seed: found.seed, positions: found.positions, count }); return }
  if (maxSeeds > 0 && count >= maxSeeds) { post({ type: 'exhausted', count }); return }
  setTimeout(runBatch, 0) // yield so a 'stop' message can be processed
}
