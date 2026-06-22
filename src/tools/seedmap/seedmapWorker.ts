// Web Worker: runs cubiomes off the main thread so biome tile generation never
// freezes the page. It owns its own generator instance and returns ready-to-paint
// RGBA tile buffers (transferred, zero-copy).

import { setupWorld, applySeed, genArea, biomeColors } from './cubiomesApi'

const TILE = 128

let colors: Uint8Array | null = null
let curWorldKey = ''

type SetupMsg = { type: 'setup'; worldKey: string; version: string; large: boolean; dim: -1 | 0 | 1; lo: number; hi: number }
type TileMsg = { type: 'tile'; worldKey: string; key: string; scale: number; tx: number; tz: number }
type InMsg = SetupMsg | TileMsg

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data
  if (msg.type === 'setup') {
    await setupWorld(msg.version, msg.large)
    applySeed(msg.dim, { lo: msg.lo, hi: msg.hi, big: 0n })
    colors = biomeColors()
    curWorldKey = msg.worldKey
    ;(self as unknown as Worker).postMessage({ type: 'ready', worldKey: msg.worldKey })
    return
  }
  if (msg.type === 'tile') {
    if (msg.worldKey !== curWorldKey || !colors) return // stale request
    const yLayer = msg.scale === 1 ? 63 : 15
    let ids: Int32Array
    try { ids = genArea(msg.scale, msg.tx * TILE, msg.tz * TILE, TILE, TILE, yLayer) }
    catch { return }
    const buf = new Uint8ClampedArray(TILE * TILE * 4)
    for (let i = 0; i < TILE * TILE; i++) {
      const id = ids[i]
      const ci = (id >= 0 && id < 256) ? id * 3 : 0
      const o = i * 4
      buf[o] = colors[ci]; buf[o + 1] = colors[ci + 1]; buf[o + 2] = colors[ci + 2]; buf[o + 3] = 255
    }
    ;(self as unknown as Worker).postMessage(
      { type: 'tile', key: msg.key, worldKey: msg.worldKey, buf: buf.buffer },
      [buf.buffer],
    )
  }
}
