/// <reference lib="webworker" />

type BetaRequest = { id: number; seedStr: string; x: number; z: number; radius: number; oreId: number }
type BetaResponse = { id: number; ok: boolean; result?: unknown; error?: string }

const ws = self as unknown as DedicatedWorkerGlobalScope

let findOresBeta: ((seed: string, x: number, z: number, radius: number, oreId: number) => unknown) | null = null

const wasmReady = (async () => {
  const mod = await import('./glue-beta/ore_engine.js')
  await mod.default()  // init WASM
  findOresBeta = mod.find_ores_beta
})()

ws.onmessage = async (e: MessageEvent<BetaRequest>) => {
  const { id, seedStr, x, z, radius, oreId } = e.data
  try {
    await wasmReady
    const result = findOresBeta!(seedStr, x, z, radius, oreId)
    ws.postMessage({ id, ok: true, result } satisfies BetaResponse)
  } catch (err: unknown) {
    ws.postMessage({ id, ok: false, error: String(err instanceof Error ? err.message : err) } satisfies BetaResponse)
  }
}
