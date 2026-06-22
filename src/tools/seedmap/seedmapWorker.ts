// Web Worker: runs cubiomes off the main thread so biome tile generation never
// freezes the page. It owns its own generator instance and returns ready-to-paint
// RGBA tile buffers (transferred, zero-copy). Supports biome highlighting (darken
// non-matching cells) and terrain hill-shading.

import { setupWorld, applySeed, genArea, genHeights, biomeColors } from './cubiomesApi'

const TILE = 128

let colors: Uint8Array | null = null
let curWorldKey = ''
let highlight = -1       // biome id to keep bright (others darkened); -1 = off
let terrain = false      // hill-shade by approximate surface height
let layerY = 63          // block Y to sample biomes at (cave biomes need a low Y)

type SetupMsg = { type: 'setup'; worldKey: string; version: string; large: boolean; dim: -1 | 0 | 1; lo: number; hi: number; highlight: number; terrain: boolean; layerY: number }
type TileMsg = { type: 'tile'; worldKey: string; key: string; scale: number; tx: number; tz: number }
type InMsg = SetupMsg | TileMsg

function clamp255(v: number) { return v < 0 ? 0 : v > 255 ? 255 : v }

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data
  if (msg.type === 'setup') {
    await setupWorld(msg.version, msg.large)
    applySeed(msg.dim, { lo: msg.lo, hi: msg.hi, big: 0n })
    colors = biomeColors()
    curWorldKey = msg.worldKey
    highlight = msg.highlight
    terrain = msg.terrain
    layerY = msg.layerY
    ;(self as unknown as Worker).postMessage({ type: 'ready', worldKey: msg.worldKey })
    return
  }
  if (msg.type === 'tile') {
    if (msg.worldKey !== curWorldKey || !colors) return // stale request
    const { scale, tx, tz } = msg
    // genArea's y is block-coords at scale 1, biome-coords (÷4) otherwise.
    const yLayer = scale === 1 ? layerY : Math.floor(layerY / 4)
    let ids: Int32Array
    try { ids = genArea(scale, tx * TILE, tz * TILE, TILE, TILE, yLayer) }
    catch { return }

    // Optional terrain heights at 1:4 scale (only worth it when zoomed in).
    let hq: Float32Array | null = null
    let qw = 0
    if (terrain && scale <= 4) {
      qw = (TILE * scale) / 4               // quart cells across the tile
      const qx = (tx * TILE * scale) / 4
      const qz = (tz * TILE * scale) / 4
      try { hq = genHeights(qx, qz, qw, qw) } catch { hq = null }
    }

    const buf = new Uint8ClampedArray(TILE * TILE * 4)
    for (let j = 0; j < TILE; j++) {
      for (let i = 0; i < TILE; i++) {
        const idx = j * TILE + i
        const id = ids[idx]
        const ci = (id >= 0 && id < 256) ? id * 3 : 0
        let r = colors[ci], g = colors[ci + 1], b = colors[ci + 2]

        // Hill-shade from the height gradient (light from the NW).
        if (hq) {
          const qi = Math.min(qw - 1, (i * scale / 4) | 0)
          const qj = Math.min(qw - 1, (j * scale / 4) | 0)
          const hC = hq[qj * qw + qi]
          const hR = hq[qj * qw + Math.min(qw - 1, qi + 1)]
          const hD = hq[Math.min(qw - 1, qj + 1) * qw + qi]
          const slope = (hC - hR) + (hC - hD)
          let shade = 1 + slope * 0.10
          if (shade < 0.55) shade = 0.55
          else if (shade > 1.5) shade = 1.5
          r *= shade; g *= shade; b *= shade
          // light contour lines every 16 blocks of elevation
          if ((hC / 16 | 0) !== (hR / 16 | 0) || (hC / 16 | 0) !== (hD / 16 | 0)) {
            r *= 0.7; g *= 0.7; b *= 0.7
          }
        }

        // Highlight: darken everything that isn't the chosen biome.
        if (highlight >= 0 && id !== highlight) {
          r *= 0.15; g *= 0.15; b *= 0.18
        }

        const o = idx * 4
        buf[o] = clamp255(r); buf[o + 1] = clamp255(g); buf[o + 2] = clamp255(b); buf[o + 3] = 255
      }
    }
    ;(self as unknown as Worker).postMessage(
      { type: 'tile', key: msg.key, worldKey: msg.worldKey, buf: buf.buffer },
      [buf.buffer],
    )
  }
}
