import { useRef, useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Shuffle, Plus, Minus, Crosshair, Copy, Check, Loader2, Gift, Maximize2, X, PanelLeft } from 'lucide-react'
import {
  initCubiomes, setupWorld, applySeed, biomeColors, biomeName, biomeAt, genArea, allBiomes,
  findStructures, findStrongholds, getSpawn, villageAbandoned, estimateLoot, seedToParts,
  type Dim, type SeedParts, type FoundStructure, type LootChest,
} from '../tools/seedmap/cubiomesApi'
import { STRUCTURES, ZOMBIE_VILLAGE_DEF, type StructureDef } from '../tools/seedmap/structures'

const VERSIONS = ['26.2', '26.1', '1.21.11', '1.21.9', '1.21.5', '1.21.4', '1.21.3', '1.21.1', '1.20.6', '1.20', '1.19.4', '1.18', '1.17', '1.16.5', '1.15', '1.14', '1.13', '1.12', '1.8', '1.7']
// Block-Y presets for sampling — cave biomes (sulfur caves, lush, deep dark…) only
// appear underground, so a layer selector is needed to see them.
const LAYERS = [
  { label: 'Surface', y: 63 },
  { label: 'Caves (Y -16)', y: -16 },
  { label: 'Deep (Y -48)', y: -48 },
]
const SCALES = [1, 4, 16, 64, 256]
const TILE = 128                 // biome cells per cached tile
const TILE_CACHE_CAP = 600       // max cached tile bitmaps before eviction
const FADE_MS = 220              // fade-in duration for a freshly generated tile
const MAX_REQ_PER_FRAME = 16     // tile requests dispatched per frame (avoids flooding the worker)
const MAX_PENDING = 96           // cap on outstanding requests
const RETRY_MS = 1500            // re-request a tile if the worker never answered
const MAX_VISIBLE_TILES = 1200   // hard overload guard
const maxBppFor = (dim: number) => (dim === 0 ? 512 : 160) // clamp zoom-out so tile counts stay bounded

interface View { cx: number; cz: number; bpp: number } // center world coords + blocks/pixel

function pickScale(bpp: number, dim: Dim): number {
  const allowed = dim === 0 ? SCALES : SCALES.filter(s => s !== 256)
  let best = allowed[0]
  for (const s of allowed) if (s <= Math.max(1, bpp)) best = s
  return best
}

export default function SeedMapPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [searchParams] = useSearchParams()
  const [seedInput, setSeedInput] = useState(() => searchParams.get('seed') || '1231234')
  const [version, setVersion] = useState(() => {
    const v = searchParams.get('v')
    return v && VERSIONS.includes(v) ? v : '1.21.11'
  })
  const [dim, setDim] = useState<Dim>(0)
  const [large, setLarge] = useState(false)
  const [layerY, setLayerY] = useState(63)
  const [fullscreen, setFullscreen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [enabledStructs, setEnabledStructs] = useState<Set<number>>(() => new Set(STRUCTURES.map(s => s.type)))

  const [highlightBiome, setHighlightBiome] = useState<number>(-1)
  const [terrain, setTerrain] = useState(false)
  const [biomeList, setBiomeList] = useState<{ id: number; name: string }[]>([])
  const [locateStruct, setLocateStruct] = useState<number>(5)
  const [locating, setLocating] = useState(false)
  const [locateMsg, setLocateMsg] = useState<string | null>(null)

  const [hover, setHover] = useState<{ x: number; z: number; biome: string } | null>(null)
  const [popup, setPopup] = useState<{ sx: number; sy: number; x: number; z: number; label: string; lootType?: number } | null>(null)

  const viewRef = useRef<View>({
    cx: Number(searchParams.get('x')) || 0,
    cz: Number(searchParams.get('z')) || 0,
    bpp: searchParams.has('x') ? 1 : 4, // zoom in when arriving at a specific spot
  })
  const partsRef = useRef<SeedParts>(seedToParts('1231234'))
  const colorsRef = useRef<Uint8Array | null>(null)
  const structMarkersRef = useRef<{ def: StructureDef; pts: FoundStructure[] }[]>([])
  const rafRef = useRef<number | null>(null)
  const worldReadyRef = useRef(false)
  // Tile cache: biome bitmaps generated in a worker and reused while panning.
  const tileCacheRef = useRef<Map<string, { img: ImageBitmap; t: number }>>(new Map())
  const pendingRef = useRef<Map<string, number>>(new Map()) // key → request time (for retry)
  const lastScaleRef = useRef<number>(-1)
  const worldKeyRef = useRef('')
  const lastCoreKeyRef = useRef('')
  const workerRef = useRef<Worker | null>(null)
  const workerReadyKeyRef = useRef('')
  const requestRedrawRef = useRef<(() => void) | null>(null)
  // Structure icons + global (non-region) markers.
  const iconsRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const globalMarkersRef = useRef<{ stronghold: FoundStructure[]; spawn: FoundStructure[] }>({ stronghold: [], spawn: [] })

  // ── Init WASM ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    initCubiomes()
      .then(() => { if (!cancelled) { setReady(true) } })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load cubiomes') })
    return () => { cancelled = true }
  }, [])

  // Preload structure icons; redraw as they arrive.
  useEffect(() => {
    for (const def of [...STRUCTURES, ZOMBIE_VILLAGE_DEF]) {
      if (iconsRef.current.has(def.icon)) continue
      const img = new Image()
      img.onload = () => requestRedrawRef.current?.()
      img.src = def.icon
      iconsRef.current.set(def.icon, img)
    }
  }, [])

  // Worker for off-thread biome tile generation.
  useEffect(() => {
    const worker = new Worker(new URL('../tools/seedmap/seedmapWorker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data
      if (msg.type === 'ready') {
        workerReadyKeyRef.current = msg.worldKey
        requestRedrawRef.current?.()
      } else if (msg.type === 'tile') {
        if (msg.worldKey !== worldKeyRef.current) return // stale world
        const data = new ImageData(new Uint8ClampedArray(msg.buf), 128, 128)
        createImageBitmap(data).then(bmp => {
          pendingRef.current.delete(msg.key)
          tileCacheRef.current.set(msg.key, { img: bmp, t: performance.now() })
          requestRedrawRef.current?.()
        })
      }
    }
    return () => { worker.terminate(); workerRef.current = null }
  }, [])

  // ── Apply seed/version/dim/large to the generator ────────────────────────────────
  const applyWorld = useCallback(async () => {
    if (!ready) return
    try {
      const coreChanged = lastCoreKeyRef.current !== `${version}|${large}|${dim}|${seedInput}`
      lastCoreKeyRef.current = `${version}|${large}|${dim}|${seedInput}`
      partsRef.current = seedToParts(seedInput)
      await setupWorld(version, large)
      applySeed(dim, partsRef.current)
      colorsRef.current = biomeColors()
      if (coreChanged || biomeList.length === 0) setBiomeList(allBiomes())
      worldReadyRef.current = true
      // worldKey includes highlight/terrain so tiles regenerate when those change.
      const wk = `${version}|${large ? 1 : 0}|${dim}|${partsRef.current.lo}|${partsRef.current.hi}|h${highlightBiome}|t${terrain ? 1 : 0}|y${layerY}`
      worldKeyRef.current = wk
      for (const { img } of tileCacheRef.current.values()) img.close()
      tileCacheRef.current.clear()
      pendingRef.current.clear()
      workerRef.current?.postMessage({
        type: 'setup', worldKey: wk, version, large, dim,
        lo: partsRef.current.lo, hi: partsRef.current.hi,
        highlight: highlightBiome, terrain, layerY,
      })
      // Global (non-region) markers — only recompute when the core world changed.
      if (coreChanged) {
        if (dim === 0) {
          try { globalMarkersRef.current = { stronghold: findStrongholds(40), spawn: [getSpawn()] } }
          catch { globalMarkersRef.current = { stronghold: [], spawn: [] } }
        } else {
          globalMarkersRef.current = { stronghold: [], spawn: [] }
        }
      }
      computeStructures()
      requestRedraw()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation error')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, seedInput, version, dim, large, highlightBiome, terrain, layerY])

  useEffect(() => { applyWorld() }, [applyWorld])

  // ── Structures over the visible area ─────────────────────────────────────────────
  const computeStructures = useCallback(() => {
    if (!worldReadyRef.current) { structMarkersRef.current = []; return }
    const canvas = canvasRef.current
    if (!canvas) return
    const { cx, cz, bpp } = viewRef.current
    const halfW = (canvas.width / 2) * bpp, halfH = (canvas.height / 2) * bpp
    const margin = Math.max(halfW, halfH) * 0.25
    const x0 = Math.floor(cx - halfW - margin), x1 = Math.ceil(cx + halfW + margin)
    const z0 = Math.floor(cz - halfH - margin), z1 = Math.ceil(cz + halfH + margin)
    const out: { def: StructureDef; pts: FoundStructure[] }[] = []
    for (const def of STRUCTURES) {
      if (!def.dims.includes(dim) || !enabledStructs.has(def.type)) continue
      if (def.mode === 'stronghold') { out.push({ def, pts: globalMarkersRef.current.stronghold }); continue }
      if (def.mode === 'spawn') { out.push({ def, pts: globalMarkersRef.current.spawn }); continue }
      try {
        const pts = findStructures(def.type, partsRef.current, x0, z0, x1, z1, 2000)
        if (def.type === 5) {
          // Split villages into normal vs zombie (abandoned).
          const normal: FoundStructure[] = [], zombie: FoundStructure[] = []
          for (const p of pts) (villageAbandoned(p.x, p.z) ? zombie : normal).push(p)
          out.push({ def, pts: normal })
          if (zombie.length) out.push({ def: ZOMBIE_VILLAGE_DEF, pts: zombie })
        } else {
          out.push({ def, pts })
        }
      } catch { /* some structures unsupported in older versions */ }
    }
    structMarkersRef.current = out
  }, [dim, enabledStructs])

  useEffect(() => { computeStructures(); requestRedraw() }, [computeStructures])

  // ── Rendering (tiled, worker-generated) ─────────────────────────────────────────
  // Visible tiles are requested from the worker; until a tile arrives the area is
  // white, then the bitmap fades in. The main thread never blocks on generation.
  const draw = useCallback(() => {
    rafRef.current = null
    const canvas = canvasRef.current
    if (!canvas || !worldReadyRef.current) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width, H = canvas.height
    const { cx, cz, bpp } = viewRef.current

    // Clamp zoom-out so the number of tiles stays bounded (prevents worker flooding).
    if (bpp > maxBppFor(dim)) { viewRef.current = { cx, cz, bpp: maxBppFor(dim) } }
    const bppc = viewRef.current.bpp
    const scale = pickScale(bppc, dim)
    const worldLeft = cx - (W / 2) * bppc
    const worldTop = cz - (H / 2) * bppc
    const tileWorld = TILE * scale          // world blocks covered by one tile
    const tileDest = tileWorld / bppc       // tile size on screen (px)

    // White base — uncovered/loading tiles read as white.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, H)
    ctx.imageSmoothingEnabled = false

    const tx0 = Math.floor(worldLeft / tileWorld)
    const tz0 = Math.floor(worldTop / tileWorld)
    const tx1 = Math.floor((worldLeft + W * bppc) / tileWorld)
    const tz1 = Math.floor((worldTop + H * bppc) / tileWorld)

    const cache = tileCacheRef.current
    const pending = pendingRef.current
    const wk = worldKeyRef.current
    const workerReady = workerReadyKeyRef.current === wk
    const now = performance.now()
    let animating = false

    // Scale changed (zoom level) → outstanding requests are for the old scale; drop
    // them so we re-request the current scale promptly and the queue can't pile up.
    if (lastScaleRef.current !== scale) { pending.clear(); lastScaleRef.current = scale }

    // Overload guard: if the view somehow covers an absurd number of tiles, recenter
    // to a sane zoom and reset caches instead of flooding the worker (→ permanent white).
    const visibleTiles = (tx1 - tx0 + 1) * (tz1 - tz0 + 1)
    if (visibleTiles > MAX_VISIBLE_TILES) {
      for (const v of cache.values()) v.img.close()
      cache.clear(); pending.clear()
      viewRef.current = { cx, cz, bpp: 4 }
      requestRedrawRef.current?.()
      return
    }

    let requested = 0
    for (let tz = tz0; tz <= tz1; tz++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const key = `${wk}|${scale}|${tx}|${tz}`
        const entry = cache.get(key)
        const dx = (tx * tileWorld - worldLeft) / bppc
        const dy = (tz * tileWorld - worldTop) / bppc
        if (entry) {
          const a = Math.min(1, (now - entry.t) / FADE_MS)
          if (a < 1) animating = true
          ctx.globalAlpha = a
          ctx.drawImage(entry.img, Math.floor(dx), Math.floor(dy), Math.ceil(tileDest) + 1, Math.ceil(tileDest) + 1)
          ctx.globalAlpha = 1
        } else {
          animating = true // a visible tile is missing → keep the loop alive
          if (workerReady && requested < MAX_REQ_PER_FRAME && pending.size < MAX_PENDING) {
            const reqAt = pending.get(key)
            // request if not pending, or if a previous request got stuck (timed out)
            if (reqAt === undefined || now - reqAt > RETRY_MS) {
              pending.set(key, now)
              workerRef.current?.postMessage({ type: 'tile', worldKey: wk, key, scale, tx, tz })
              requested++
            }
          }
        }
      }
    }

    // Evict old tiles if the cache grows too large.
    if (cache.size > TILE_CACHE_CAP) {
      const excess = cache.size - TILE_CACHE_CAP
      let i = 0
      for (const [k, v] of cache) { if (i++ >= excess) break; v.img.close(); cache.delete(k) }
    }
    // Keep animating the fade while any tile is still appearing.
    if (animating) requestRedrawRef.current?.()

    // Grid lines
    drawGrid(ctx, W, H, worldLeft, worldTop, bppc)

    // Structure markers (real Minecraft icons)
    const S = 20
    for (const { def, pts } of structMarkersRef.current) {
      const img = iconsRef.current.get(def.icon)
      for (const p of pts) {
        const px = (p.x - worldLeft) / bppc
        const py = (p.z - worldTop) / bppc
        if (px < -S || py < -S || px > W + S || py > H + S) continue
        if (img && img.complete && img.naturalWidth) {
          ctx.imageSmoothingEnabled = false
          ctx.drawImage(img, Math.round(px - S / 2), Math.round(py - S / 2), S, S)
        } else {
          ctx.fillStyle = 'rgba(0,0,0,0.6)'
          ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill()
        }
      }
    }
  }, [dim])

  const requestRedraw = useCallback(() => {
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(draw)
  }, [draw])
  requestRedrawRef.current = requestRedraw

  // ── Canvas sizing ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current
    if (!canvas || !wrap) return
    const resize = () => {
      canvas.width = wrap.clientWidth
      canvas.height = fullscreen ? wrap.clientHeight : Math.max(360, Math.round(wrap.clientWidth * 0.42))
      computeStructures()
      requestRedraw()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [computeStructures, requestRedraw, ready, fullscreen])

  // Exit fullscreen with Escape.
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  // ── Interaction ─────────────────────────────────────────────────────────────────
  const dragRef = useRef<{ x: number; y: number; cx: number; cz: number } | null>(null)
  const movedRef = useRef(false)

  const onDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return // only left button pans / closes
    dragRef.current = { x: e.clientX, y: e.clientY, cx: viewRef.current.cx, cz: viewRef.current.cz }
    movedRef.current = false
    setPopup(null) // clicking the map (outside the popup) closes it
  }

  // Build popup data for a screen position, snapping to a nearby structure marker.
  function popupAt(mx: number, my: number) {
    const canvas = canvasRef.current!
    const { cx, cz, bpp } = viewRef.current
    const wx = Math.round(cx + (mx - canvas.width / 2) * bpp)
    const wz = Math.round(cz + (my - canvas.height / 2) * bpp)
    let label = worldReadyRef.current ? biomeName(biomeAt1(wx, wz, layerY)) : ''
    let px = wx, pz = wz, lootType: number | undefined, isStructure = false
    for (const { def, pts } of structMarkersRef.current) {
      for (const p of pts) {
        if (Math.abs((p.x - cx) / bpp - (mx - canvas.width / 2)) < 12 &&
            Math.abs((p.z - cz) / bpp - (my - canvas.height / 2)) < 12) {
          label = def.label; px = p.x; pz = p.z; lootType = def.loot ? def.type : undefined; isStructure = true
        }
      }
    }
    return { sx: mx, sy: my, x: px, z: pz, label, lootType, isStructure }
  }
  const onMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const { cx, cz, bpp } = viewRef.current
    const wx = Math.round(cx + (mx - canvas.width / 2) * bpp)
    const wz = Math.round(cz + (my - canvas.height / 2) * bpp)

    if (dragRef.current) {
      const dx = e.clientX - dragRef.current.x, dy = e.clientY - dragRef.current.y
      if (Math.abs(dx) + Math.abs(dy) > 3) movedRef.current = true
      viewRef.current = { cx: dragRef.current.cx - dx * bpp, cz: dragRef.current.cz - dy * bpp, bpp }
      requestRedraw()
      return
    }
    // hover biome readout
    if (worldReadyRef.current) {
      try {
        const id = biomeAtThrottled(wx, wz, layerY)
        setHover({ x: wx, z: wz, biome: id == null ? '…' : biomeName(id) })
      } catch { /* noop */ }
    }
  }
  const onUp = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    const wasDrag = movedRef.current
    dragRef.current = null
    if (wasDrag) { computeStructures(); requestRedraw(); return }
    // Left click only opens a popup when it lands on a structure marker.
    const rect = canvasRef.current!.getBoundingClientRect()
    const p = popupAt(e.clientX - rect.left, e.clientY - rect.top)
    if (p.isStructure) setPopup(p)
  }
  // Right click anywhere shows the biome / location popup.
  const onContext = (e: React.MouseEvent) => {
    e.preventDefault()
    const rect = canvasRef.current!.getBoundingClientRect()
    setPopup(popupAt(e.clientX - rect.left, e.clientY - rect.top))
  }
  const onLeave = () => { dragRef.current = null; setHover(null) }

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault() // requires a non-passive listener (see effect below)
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const { cx, cz, bpp } = viewRef.current
    // world coord under cursor stays fixed
    const wx = cx + (mx - canvas.width / 2) * bpp
    const wz = cz + (my - canvas.height / 2) * bpp
    const factor = e.deltaY > 0 ? 1.2 : 1 / 1.2
    const nbpp = Math.min(maxBppFor(dim), Math.max(0.25, bpp * factor))
    viewRef.current = {
      bpp: nbpp,
      cx: wx - (mx - canvas.width / 2) * nbpp,
      cz: wz - (my - canvas.height / 2) * nbpp,
    }
    computeStructures()
    requestRedraw()
  }, [dim, computeStructures, requestRedraw])

  // Attach the wheel listener as non-passive so preventDefault stops page scroll.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [onWheel])

  function zoomBy(factor: number) {
    viewRef.current = { ...viewRef.current, bpp: Math.min(maxBppFor(dim), Math.max(0.25, viewRef.current.bpp * factor)) }
    computeStructures(); requestRedraw()
  }
  function goToSpawn() {
    viewRef.current = { cx: 0, cz: 0, bpp: viewRef.current.bpp }
    computeStructures(); requestRedraw()
  }

  // ── Locate (find nearest + jump) ───────────────────────────────────────────────
  function jumpTo(x: number, z: number, label: string) {
    const canvas = canvasRef.current
    viewRef.current = { ...viewRef.current, cx: x, cz: z }
    computeStructures(); requestRedraw()
    if (canvas) setPopup({ sx: canvas.width / 2, sy: canvas.height / 2, x, z, label })
  }

  function findNearestBiome(id: number): { x: number; z: number } | null {
    const { cx, cz } = viewRef.current
    const scale = 16, R = 768 // ±~12k blocks at 16-block resolution
    const cellX0 = Math.floor(cx / scale) - R, cellZ0 = Math.floor(cz / scale) - R
    const w = R * 2, h = R * 2
    let ids: Int32Array
    try { ids = genArea(scale, cellX0, cellZ0, w, h, Math.floor(layerY / 4)) } catch { return null }
    let best: { x: number; z: number } | null = null, bestD = Infinity
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (ids[j * w + i] !== id) continue
      const bx = (cellX0 + i) * scale + 8, bz = (cellZ0 + j) * scale + 8
      const d = (bx - cx) ** 2 + (bz - cz) ** 2
      if (d < bestD) { bestD = d; best = { x: bx, z: bz } }
    }
    return best
  }

  function findNearestStructure(type: number): { x: number; z: number } | null {
    const { cx, cz } = viewRef.current
    for (const r of [3000, 8000, 20000, 50000]) {
      let pts: FoundStructure[]
      try { pts = findStructures(type, partsRef.current, cx - r, cz - r, cx + r, cz + r, 8000) }
      catch { return null }
      if (pts.length) {
        let best = pts[0], bestD = Infinity
        for (const p of pts) { const d = (p.x - cx) ** 2 + (p.z - cz) ** 2; if (d < bestD) { bestD = d; best = p } }
        return best
      }
    }
    return null
  }

  function locateBiome() {
    if (highlightBiome < 0) return
    setLocating(true); setLocateMsg(null)
    // let the spinner paint before the (sync) search
    setTimeout(() => {
      const r = findNearestBiome(highlightBiome)
      setLocating(false)
      if (r) jumpTo(r.x, r.z, biomeName(highlightBiome))
      else setLocateMsg('Not found within ~12k blocks — pan closer and retry.')
    }, 20)
  }

  function nearestOf(pts: FoundStructure[]): FoundStructure | null {
    const { cx, cz } = viewRef.current
    let best: FoundStructure | null = null, bestD = Infinity
    for (const p of pts) { const d = (p.x - cx) ** 2 + (p.z - cz) ** 2; if (d < bestD) { bestD = d; best = p } }
    return best
  }

  function locateStructure() {
    setLocating(true); setLocateMsg(null)
    setTimeout(() => {
      const def = STRUCTURES.find(s => s.type === locateStruct)
      // Strongholds are a global feature — pick nearest from the precomputed list.
      const r = def?.mode === 'stronghold'
        ? nearestOf(globalMarkersRef.current.stronghold)
        : findNearestStructure(locateStruct)
      setLocating(false)
      if (r) jumpTo(r.x, r.z, def?.label ?? 'Structure')
      else setLocateMsg('None found nearby.')
    }, 20)
  }

  // ── Render ──────────────────────────────────────────────────────────────────────
  // Control cards — shared between the normal layout and the fullscreen sidebar.
  const controlsEl = (
    <div className="card flex flex-wrap items-end gap-3">
      <div>
        <label className="form-label">Version</label>
        <select className="form-input text-sm" value={version} onChange={e => setVersion(e.target.value)}>
          {VERSIONS.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
      <div className="flex-1 min-w-[160px]">
        <label className="form-label">Seed</label>
        <input className="form-input font-mono text-sm" value={seedInput} onChange={e => setSeedInput(e.target.value)} placeholder="seed (number or text)" />
      </div>
      <button onClick={() => setSeedInput(String(Math.floor((Math.random() - 0.5) * 2 ** 48)))}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
        style={{ border: '1px solid rgb(var(--border))', color: 'rgb(var(--text))' }}>
        <Shuffle className="w-4 h-4" /> Random
      </button>
      <div>
        <label className="form-label">Dimension</label>
        <div className="flex gap-1">
          {([[0, 'Overworld'], [-1, 'Nether'], [1, 'End']] as const).map(([d, l]) => (
            <button key={d} onClick={() => setDim(d as Dim)}
              className="px-2.5 py-2 rounded-lg text-xs font-medium"
              style={{
                border: `1px solid ${dim === d ? 'rgb(var(--accent))' : 'rgb(var(--border))'}`,
                background: dim === d ? 'rgb(var(--accent) / 0.1)' : 'transparent',
                color: dim === d ? 'rgb(var(--accent))' : 'rgb(var(--muted))',
              }}>{l}</button>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-1.5 text-sm cursor-pointer pb-1.5" style={{ color: 'rgb(var(--muted))' }}>
        <input type="checkbox" checked={large} onChange={e => setLarge(e.target.checked)} style={{ accentColor: 'rgb(var(--accent))' }} />
        Large Biomes
      </label>
      <label className="flex items-center gap-1.5 text-sm cursor-pointer pb-1.5" style={{ color: 'rgb(var(--muted))' }} title="Hill-shade by approximate surface height (best zoomed in)">
        <input type="checkbox" checked={terrain} onChange={e => setTerrain(e.target.checked)} style={{ accentColor: 'rgb(var(--accent))' }} />
        Terrain
      </label>
      {dim === 0 && (
        <div>
          <label className="form-label">Layer</label>
          <select className="form-input text-sm" value={layerY} onChange={e => setLayerY(Number(e.target.value))} title="Cave biomes (sulfur caves, lush, deep dark) only appear underground">
            {LAYERS.map(l => <option key={l.y} value={l.y}>{l.label}</option>)}
          </select>
        </div>
      )}
    </div>
  )

  const locateEl = (
    <div className="card flex flex-wrap items-end gap-4">
      <div className="flex items-end gap-2">
        <div>
          <label className="form-label flex items-center gap-1"><Crosshair className="w-3.5 h-3.5" /> Highlight biome</label>
          <select className="form-input text-sm" value={highlightBiome} onChange={e => setHighlightBiome(Number(e.target.value))} style={{ minWidth: 160 }}>
            <option value={-1}>— none —</option>
            {biomeList.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <button onClick={locateBiome} disabled={highlightBiome < 0 || locating}
          className="px-3 py-2 rounded-xl text-sm font-medium disabled:opacity-40"
          style={{ border: '1px solid rgb(var(--accent))', color: 'rgb(var(--accent))' }}>
          Find nearest
        </button>
      </div>
      <div className="flex items-end gap-2">
        <div>
          <label className="form-label">Locate structure</label>
          <select className="form-input text-sm" value={locateStruct} onChange={e => setLocateStruct(Number(e.target.value))} style={{ minWidth: 150 }}>
            {STRUCTURES.filter(s => s.dims.includes(dim) && (s.type >= 0 || s.mode === 'stronghold')).map(s => <option key={`${s.type}-${s.label}`} value={s.type}>{s.label}</option>)}
          </select>
        </div>
        <button onClick={locateStructure} disabled={locating}
          className="px-3 py-2 rounded-xl text-sm font-medium disabled:opacity-40"
          style={{ border: '1px solid rgb(var(--accent))', color: 'rgb(var(--accent))' }}>
          Find nearest
        </button>
      </div>
      {locating && <span className="text-sm pb-2" style={{ color: 'rgb(var(--muted))' }}>Searching…</span>}
      {locateMsg && <span className="text-sm pb-2" style={{ color: '#d98a1e' }}>{locateMsg}</span>}
      {highlightBiome >= 0 && (
        <span className="text-xs pb-2" style={{ color: 'rgb(var(--muted))' }}>Other biomes dimmed — clear to —none— to restore.</span>
      )}
    </div>
  )

  const filtersEl = (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 style={{ color: 'rgb(var(--text))' }}>Structures</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setEnabledStructs(new Set(STRUCTURES.filter(s => s.dims.includes(dim)).map(s => s.type)))}
            className="px-2.5 py-1 rounded-lg text-xs font-medium"
            style={{ border: '1px solid rgb(var(--accent))', color: 'rgb(var(--accent))', background: 'rgb(var(--accent) / 0.08)' }}>
            Show All
          </button>
          <button
            onClick={() => setEnabledStructs(new Set())}
            className="px-2.5 py-1 rounded-lg text-xs font-medium"
            style={{ border: '1px solid rgb(var(--border))', color: 'rgb(var(--muted))' }}>
            Hide All
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {STRUCTURES.filter(s => s.dims.includes(dim)).map(s => {
          const on = enabledStructs.has(s.type)
          return (
            <button
              key={`${s.type}-${s.label}`}
              onClick={() => setEnabledStructs(prev => {
                const n = new Set(prev); if (n.has(s.type)) n.delete(s.type); else n.add(s.type); return n
              })}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                border: `1px solid ${on ? 'rgb(var(--accent))' : 'rgb(var(--border))'}`,
                background: on ? 'rgb(var(--accent) / 0.1)' : 'transparent',
                color: on ? 'rgb(var(--accent))' : 'rgb(var(--muted))',
              }}>
              <img src={s.icon} alt="" width={16} height={16} style={{ imageRendering: 'pixelated' }} /> {s.label}
            </button>
          )
        })}
      </div>
      <p className="text-xs mt-3" style={{ color: 'rgb(var(--muted))' }}>
        Structure positions are verified against the biome (some 1.18+ temples/mansions can still rarely false-positive on surface height, which cubiomes can't check).
      </p>
    </div>
  )

  return (
    <div className={fullscreen ? '' : 'section container'}>
      {!fullscreen && (
        <div className="mb-6">
          <span className="badge-muted">Tool</span>
          <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>Seed Map</h1>
          <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
            Explore any seed's biomes and structures, powered by <span className="font-mono">cubiomes</span>. Drag to pan,
            scroll to zoom, hover for the biome. Click a structure for details &amp; loot; right-click anywhere for the location.
          </p>
        </div>
      )}

      {!fullscreen && <div className="mb-4">{controlsEl}</div>}
      {!fullscreen && <div className="mb-4">{locateEl}</div>}

      {/* Map — fixed below the topbar in fullscreen mode */}
      <div
        ref={wrapRef}
        className={fullscreen ? 'overflow-hidden' : 'relative rounded-2xl overflow-hidden mb-4'}
        style={fullscreen
          ? { position: 'fixed', top: '56px', left: 0, right: 0, bottom: 0, zIndex: 40, background: '#0b0b14' }
          : { position: 'relative', border: '1px solid rgb(var(--border))', background: '#0b0b14' }}>
        <canvas
          ref={canvasRef}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onLeave} onContextMenu={onContext}
          style={{ display: 'block', width: '100%', cursor: dragRef.current ? 'grabbing' : 'crosshair' }}
        />

        {/* Cursor readout */}
        {hover && (
          <div className={`absolute top-3 px-3 py-1.5 rounded-lg text-sm backdrop-blur pointer-events-none ${fullscreen ? 'left-1/2 -translate-x-1/2' : 'right-3'}`}
            style={{ background: 'rgba(20,20,32,0.8)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }}>
            <span className="font-medium">{hover.biome}</span>
            <span className="ml-3 font-mono text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>x {hover.x} · z {hover.z}</span>
          </div>
        )}

        {/* Zoom controls */}
        <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
          <IconBtn onClick={() => zoomBy(1 / 1.4)}><Plus className="w-4 h-4" /></IconBtn>
          <IconBtn onClick={() => zoomBy(1.4)}><Minus className="w-4 h-4" /></IconBtn>
          <IconBtn onClick={goToSpawn}><Crosshair className="w-4 h-4" /></IconBtn>
        </div>

        {/* Enter fullscreen */}
        {!fullscreen && (
          <div className="absolute top-3 left-3">
            <IconBtn onClick={() => setFullscreen(true)}><Maximize2 className="w-4 h-4" /></IconBtn>
          </div>
        )}

        {/* Fullscreen chrome: exit + collapsible sidebar */}
        {fullscreen && (
          <>
            <button onClick={() => setFullscreen(false)}
              className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium backdrop-blur"
              style={{ background: 'rgba(20,20,32,0.85)', border: '1px solid rgba(255,255,255,0.16)', color: '#fff' }}>
              <X className="w-4 h-4" /> Exit
            </button>

            <button onClick={() => setSidebarOpen(o => !o)}
              className="absolute top-3 z-10 w-9 h-9 flex items-center justify-center rounded-lg backdrop-blur transition-all"
              style={{ left: sidebarOpen ? 372 : 12, background: 'rgba(20,20,32,0.85)', border: '1px solid rgba(255,255,255,0.16)', color: '#fff' }}
              title={sidebarOpen ? 'Collapse panel' : 'Open panel'}>
              <PanelLeft className="w-4 h-4" />
            </button>

            {sidebarOpen && (
              <div className="absolute top-0 left-0 bottom-0 overflow-y-auto p-3 space-y-3"
                style={{ width: 360, background: 'rgb(var(--bg))', borderRight: '1px solid rgb(var(--border))' }}>
                <div className="h-9" />
                {controlsEl}
                {locateEl}
                {filtersEl}
              </div>
            )}
          </>
        )}

        {/* tp / structure popup */}
        {popup && <TpPopup popup={popup} />}

        {/* Loading / error */}
        {(!ready || error) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: 'rgba(11,11,20,0.7)' }}>
            {error
              ? <span className="text-sm" style={{ color: '#f87171' }}>{error}</span>
              : <><Loader2 className="w-7 h-7 animate-spin" style={{ color: 'rgb(var(--accent))' }} /><span className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>Loading cubiomes…</span></>}
          </div>
        )}
      </div>

      {!fullscreen && filtersEl}
    </div>
  )
}

// ── biome sampling throttle ───────────────────────────────────────────────────────
let lastSample = 0
let lastId: number | null = null
function biomeAtThrottled(x: number, z: number, y: number): number | null {
  const now = performance.now()
  if (now - lastSample < 30) return lastId
  lastSample = now
  lastId = biomeAt(1, x, y, z)
  return lastId
}
function biomeAt1(x: number, z: number, y: number): number { return biomeAt(1, x, y, z) }

// ── small components ─────────────────────────────────────────────────────────────
function IconBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="w-9 h-9 flex items-center justify-center rounded-lg backdrop-blur"
      style={{ background: 'rgba(20,20,32,0.8)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }}>
      {children}
    </button>
  )
}

function TpPopup({ popup }: { popup: { sx: number; sy: number; x: number; z: number; label: string; lootType?: number } }) {
  const [copied, setCopied] = useState(false)
  const [loot, setLoot] = useState<LootChest[] | null>(null)
  const [lootLoading, setLootLoading] = useState(false)
  const cmd = `/tp @s ${popup.x} ~ ${popup.z}`
  const left = Math.min(popup.sx, 99999)

  function estimate() {
    if (popup.lootType === undefined) return
    setLootLoading(true)
    setTimeout(() => {
      try { setLoot(estimateLoot(popup.lootType!, popup.x, popup.z)) }
      catch { setLoot([]) }
      setLootLoading(false)
    }, 10)
  }

  return (
    <div className="absolute rounded-xl p-3 backdrop-blur text-sm"
      style={{ left, top: popup.sy, transform: 'translate(-50%, calc(-100% - 10px))', background: 'rgba(20,20,32,0.92)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', minWidth: 200, maxWidth: 280 }}>
      <div className="font-semibold mb-1">{popup.label || 'Location'}</div>
      <div className="font-mono text-xs mb-2" style={{ color: 'rgba(255,255,255,0.6)' }}>x {popup.x} · z {popup.z}</div>
      <button
        onClick={async () => { await navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 1200) }}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium"
        style={{ background: 'rgb(var(--accent))', color: 'rgb(var(--accent-fg,#fff))' }}>
        {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy /tp</>}
      </button>

      {popup.lootType !== undefined && loot === null && (
        <button onClick={estimate} disabled={lootLoading}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 mt-1.5 rounded-lg text-xs font-medium"
          style={{ border: '1px solid rgba(255,255,255,0.25)', color: '#fff' }}>
          <Gift className="w-3.5 h-3.5" /> {lootLoading ? 'Rolling…' : 'Estimate loot'}
        </button>
      )}

      {loot !== null && (
        <div className="mt-2 max-h-56 overflow-auto" style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 6 }}>
          {loot.length === 0 ? (
            <div className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>No chest loot found (or contains unresolvable pools).</div>
          ) : loot.map((chest, ci) => (
            <div key={ci} className="mb-1.5">
              <div className="text-[11px] font-mono mb-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Chest {loot.length > 1 ? `#${ci + 1} ` : ''}@ {chest.x} {chest.y} {chest.z}</div>
              {chest.items.map((it, ii) => (
                <div key={ii} className="flex justify-between text-xs">
                  <span>{it.name.replace('minecraft:', '').replace(/_/g, ' ')}</span>
                  <span style={{ color: 'rgba(255,255,255,0.6)' }}>×{it.count}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function drawGrid(ctx: CanvasRenderingContext2D, W: number, H: number, worldLeft: number, worldTop: number, bpp: number) {
  // choose a grid step that's a "nice" number of blocks ~ 120px apart
  const targetPx = 130
  const rawStep = targetPx * bpp
  const pow = Math.pow(2, Math.round(Math.log2(rawStep / 100)))
  const step = Math.max(16, 100 * pow)
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '10px monospace'
  ctx.lineWidth = 1
  const startX = Math.ceil(worldLeft / step) * step
  for (let wx = startX; wx < worldLeft + W * bpp; wx += step) {
    const px = (wx - worldLeft) / bpp
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke()
    ctx.textAlign = 'left'; ctx.fillText(String(wx), px + 2, 11)
  }
  const startZ = Math.ceil(worldTop / step) * step
  for (let wz = startZ; wz < worldTop + H * bpp; wz += step) {
    const py = (wz - worldTop) / bpp
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke()
    ctx.textAlign = 'left'; ctx.fillText(String(wz), 2, py - 2)
  }
}
