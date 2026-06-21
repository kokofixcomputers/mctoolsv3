import type { OreFinderResult } from './api'

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (v: OreFinderResult) => void; reject: (e: Error) => void }>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./betaWorker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
    const { id, ok, result, error } = e.data
    const entry = pending.get(id)
    if (!entry) return
    pending.delete(id)
    if (ok) entry.resolve(result as OreFinderResult)
    else entry.reject(new Error(error))
  }
  return worker
}

export async function findOresBeta(
  seed: string,
  x: number,
  z: number,
  radius: number,
  oreId: number,
): Promise<OreFinderResult> {
  const w = getWorker()
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    w.postMessage({ id, seedStr: seed.trim(), x, z, radius, oreId })
  })
}
