import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  Brush, Eraser, PaintBucket, Pipette,
  Undo2, Redo2, Download, Plus, Search, X, Trash2, Grid3x3,
} from 'lucide-react'
import JSZip from 'jszip'
import { TEXTURE_CATEGORIES, type TextureCategory } from '../tools/resourcepack/textureManifest'

const VERSION = '1.21.7'
const DISPLAY_SIZE = 512
const MAX_HISTORY = 40

type Tool = 'brush' | 'eraser' | 'fill' | 'eyedrop'
type Mode = 'replace' | 'custom'

interface PackEntry {
  id: string
  label: string
  catId: string
  rpPath: string
  dataUrl: string
  w: number
  h: number
}

interface CustomItemEntry {
  id: string
  customName: string      // e.g. "ruby_chestplate"
  baseItem: string        // e.g. "diamond_chestplate"
  customModelData: number
  parentModel: string     // e.g. "item/generated"
  dataUrl: string
  w: number
  h: number
}

const HANDHELD = ['sword', 'axe', 'pickaxe', 'hoe', 'shovel', 'bow', 'crossbow', 'fishing_rod', 'trident', 'mace']

function guessParentModel(itemName: string): string {
  return HANDHELD.some(h => itemName.includes(h)) ? 'item/handheld' : 'item/generated'
}

// ── Pixel helpers ─────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): [number, number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha]
}

function rgbaToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
}

function makeBlank(w: number, h: number): Uint8ClampedArray {
  return new Uint8ClampedArray(w * h * 4) // all zeros = transparent
}

function clonePixels(px: Uint8ClampedArray): Uint8ClampedArray {
  return new Uint8ClampedArray(px)
}

function floodFill(
  px: Uint8ClampedArray, w: number, h: number,
  sx: number, sy: number,
  fill: [number, number, number, number],
) {
  const i0 = (sy * w + sx) * 4
  const tr = px[i0], tg = px[i0 + 1], tb = px[i0 + 2], ta = px[i0 + 3]
  if (tr === fill[0] && tg === fill[1] && tb === fill[2] && ta === fill[3]) return
  const stack = [sx + sy * w]
  const visited = new Uint8Array(w * h)
  while (stack.length) {
    const pos = stack.pop()!
    if (visited[pos]) continue
    visited[pos] = 1
    const ci = pos * 4
    if (px[ci] !== tr || px[ci + 1] !== tg || px[ci + 2] !== tb || px[ci + 3] !== ta) continue
    px[ci] = fill[0]; px[ci + 1] = fill[1]; px[ci + 2] = fill[2]; px[ci + 3] = fill[3]
    const cx = pos % w, cy = Math.floor(pos / w)
    if (cx > 0) stack.push(pos - 1)
    if (cx < w - 1) stack.push(pos + 1)
    if (cy > 0) stack.push(pos - w)
    if (cy < h - 1) stack.push(pos + w)
  }
}

function pixelsToDataUrl(px: Uint8ClampedArray, w: number, h: number): string {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(px), w, h), 0, 0)
  return c.toDataURL('image/png')
}

async function loadImagePixels(src: string): Promise<{ px: Uint8ClampedArray; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    // No crossOrigin — same-origin assets don't need it and setting it causes
    // failure when the server doesn't respond with CORS headers.
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth; c.height = img.naturalHeight
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const d = ctx.getImageData(0, 0, c.width, c.height)
      // Clone so the ImageData / canvas can be GC'd independently
      resolve({ px: new Uint8ClampedArray(d.data), w: c.width, h: c.height })
    }
    img.onerror = reject
    img.src = src
  })
}

// ── Canvas drawing ────────────────────────────────────────────────────────────

function redrawCanvas(
  canvas: HTMLCanvasElement,
  px: Uint8ClampedArray,
  w: number, h: number,
  grid: boolean,
) {
  const cell = Math.max(1, Math.floor(DISPLAY_SIZE / Math.max(w, h)))
  const dw = w * cell, dh = h * cell
  canvas.width = dw; canvas.height = dh
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false

  // Checkerboard for transparency
  for (let py = 0; py < h; py++) {
    for (let px2 = 0; px2 < w; px2++) {
      ctx.fillStyle = (px2 + py) % 2 === 0 ? '#b2b2b2' : '#808080'
      ctx.fillRect(px2 * cell, py * cell, cell, cell)
    }
  }

  // Pixels via offscreen canvas
  const off = document.createElement('canvas')
  off.width = w; off.height = h
  off.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(px), w, h), 0, 0)
  ctx.drawImage(off, 0, 0, dw, dh)

  // Grid overlay
  if (grid && cell >= 3) {
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'
    ctx.lineWidth = 1
    for (let x = 0; x <= w; x++) {
      ctx.beginPath(); ctx.moveTo(x * cell + 0.5, 0); ctx.lineTo(x * cell + 0.5, dh); ctx.stroke()
    }
    for (let y = 0; y <= h; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * cell + 0.5); ctx.lineTo(dw, y * cell + 0.5); ctx.stroke()
    }
  }
}

// ── Tool button ───────────────────────────────────────────────────────────────

function ToolBtn({
  icon: Icon, active, title, onClick, disabled,
}: {
  icon: React.ElementType
  active?: boolean
  title: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="w-9 h-9 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
      style={{
        backgroundColor: active ? 'rgb(var(--accent) / 0.15)' : 'transparent',
        color: active ? 'rgb(var(--accent))' : 'rgb(var(--muted))',
        border: `1px solid ${active ? 'rgb(var(--accent) / 0.4)' : 'transparent'}`,
      }}
    >
      <Icon className="w-4 h-4" />
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const PACK_FORMATS = [
  { value: 46, label: '46 — 1.21.x' },
  { value: 34, label: '34 — 1.20.x' },
  { value: 18, label: '18 — 1.19.x' },
]

export default function ResourcePackPage() {
  // ── Editor state (refs — no re-render on draw) ─────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pixelsRef = useRef<Uint8ClampedArray>(makeBlank(16, 16))
  const sizeRef = useRef({ w: 16, h: 16 })
  const isPainting = useRef(false)
  const undoStack = useRef<Uint8ClampedArray[]>([])
  const redoStack = useRef<Uint8ClampedArray[]>([])

  // ── React state (UI) ───────────────────────────────────────────────────────
  const [tool, setTool] = useState<Tool>('brush')
  const [color, setColor] = useState('#6d28d9')
  const [alpha, setAlpha] = useState(255)
  const [showGrid, setShowGrid] = useState(true)
  const [histLen, setHistLen] = useState(0)
  const [futureLen, setFutureLen] = useState(0)

  // Texture browser — null means "All"
  const [selectedCat, setSelectedCat] = useState<TextureCategory | null>(null)
  const [search, setSearch] = useState('')
  const [loadingTex, setLoadingTex] = useState(false)

  // Current editing target
  const [currentEntry, setCurrentEntry] = useState<{ label: string; catId: string; rpPath: string } | null>(null)

  // Mode
  const [mode, setMode] = useState<Mode>('replace')

  // Pack
  const [packEntries, setPackEntries] = useState<PackEntry[]>([])
  const [packName, setPackName] = useState('my-resource-pack')
  const [packDesc, setPackDesc] = useState('A custom resource pack')
  const [packFormat, setPackFormat] = useState(46)

  // Custom Model Data items
  const [customItems, setCustomItems] = useState<CustomItemEntry[]>([])
  const customItemsRef = useRef<CustomItemEntry[]>([])
  useEffect(() => { customItemsRef.current = customItems }, [customItems])
  const [customName, setCustomName] = useState('')
  const [baseItemName, setBaseItemName] = useState('')
  const [customModelData, setCustomModelData] = useState(1)
  const [parentModel, setParentModel] = useState('item/generated')

  // ── Auto-populate custom item form when entry loads ───────────────────────
  useEffect(() => {
    if (mode !== 'custom' || !currentEntry) return
    const base = currentEntry.rpPath.replace(/\.png$/, '').replace(/^.*\//, '')
    setBaseItemName(base)
    setCustomName('')
    const existing = customItemsRef.current.filter(i => i.baseItem === base)
    setCustomModelData(existing.length > 0 ? Math.max(...existing.map(i => i.customModelData)) + 1 : 1)
    setParentModel(guessParentModel(base))
  }, [currentEntry, mode])

  // ── Canvas redraw ─────────────────────────────────────────────────────────
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    redrawCanvas(canvas, pixelsRef.current, sizeRef.current.w, sizeRef.current.h, showGrid)
  }, [showGrid])

  useEffect(() => { redraw() }, [redraw])

  // ── History ───────────────────────────────────────────────────────────────
  const pushHistory = useCallback(() => {
    undoStack.current.push(clonePixels(pixelsRef.current))
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift()
    redoStack.current = []
    setHistLen(undoStack.current.length)
    setFutureLen(0)
  }, [])

  const undo = useCallback(() => {
    if (!undoStack.current.length) return
    redoStack.current.push(clonePixels(pixelsRef.current))
    pixelsRef.current = undoStack.current.pop()!
    setHistLen(undoStack.current.length)
    setFutureLen(redoStack.current.length)
    redraw()
  }, [redraw])

  const redo = useCallback(() => {
    if (!redoStack.current.length) return
    undoStack.current.push(clonePixels(pixelsRef.current))
    pixelsRef.current = redoStack.current.pop()!
    setHistLen(undoStack.current.length)
    setFutureLen(redoStack.current.length)
    redraw()
  }, [redraw])

  // ── Drawing ───────────────────────────────────────────────────────────────
  const toolRef = useRef<Tool>('brush')
  const colorRef = useRef('#6d28d9')
  const alphaRef = useRef(255)
  useEffect(() => { toolRef.current = tool }, [tool])
  useEffect(() => { colorRef.current = color }, [color])
  useEffect(() => { alphaRef.current = alpha }, [alpha])

  const paintPixel = useCallback((x: number, y: number) => {
    const { w, h } = sizeRef.current
    if (x < 0 || x >= w || y < 0 || y >= h) return
    const i = (y * w + x) * 4
    const t = toolRef.current
    if (t === 'brush') {
      const [r, g, b, a] = hexToRgba(colorRef.current, alphaRef.current)
      pixelsRef.current[i] = r; pixelsRef.current[i + 1] = g
      pixelsRef.current[i + 2] = b; pixelsRef.current[i + 3] = a
    } else if (t === 'eraser') {
      pixelsRef.current[i] = 0; pixelsRef.current[i + 1] = 0
      pixelsRef.current[i + 2] = 0; pixelsRef.current[i + 3] = 0
    }
    redraw()
  }, [redraw])

  const getPixelCoords = useCallback((e: MouseEvent): [number, number] => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const { w, h } = sizeRef.current
    const cell = Math.max(1, Math.floor(DISPLAY_SIZE / Math.max(w, h)))
    const scaleX = (w * cell) / rect.width
    const scaleY = (h * cell) / rect.height
    const x = Math.floor((e.clientX - rect.left) * scaleX / cell)
    const y = Math.floor((e.clientY - rect.top) * scaleY / cell)
    return [x, y]
  }, [])

  // ── Canvas mouse events ───────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      const [x, y] = getPixelCoords(e)
      const t = toolRef.current
      if (t === 'eyedrop') {
        const i = (y * sizeRef.current.w + x) * 4
        const px = pixelsRef.current
        if (px[i + 3] > 0) setColor(rgbaToHex(px[i], px[i + 1], px[i + 2]))
        return
      }
      if (t === 'fill') {
        pushHistory()
        floodFill(pixelsRef.current, sizeRef.current.w, sizeRef.current.h, x, y, hexToRgba(colorRef.current, alphaRef.current))
        redraw()
        return
      }
      isPainting.current = true
      pushHistory()
      paintPixel(x, y)
    }
    const onMove = (e: MouseEvent) => {
      if (!isPainting.current) return
      const [x, y] = getPixelCoords(e)
      paintPixel(x, y)
    }
    const onUp = () => { isPainting.current = false }

    canvas.addEventListener('mousedown', onDown)
    canvas.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      canvas.removeEventListener('mousedown', onDown)
      canvas.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [getPixelCoords, paintPixel, pushHistory, redraw])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); return }
      if ((e.metaKey || e.ctrlKey) && e.key === 'y') { e.preventDefault(); redo(); return }
      switch (e.key.toLowerCase()) {
        case 'b': setTool('brush'); break
        case 'e': setTool('eraser'); break
        case 'f': setTool('fill'); break
        case 'i': setTool('eyedrop'); break
        case 'g': setShowGrid(v => !v); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  // ── Load vanilla texture ──────────────────────────────────────────────────
  const loadVanillaTexture = useCallback(async (cat: TextureCategory, path: string, label: string) => {
    setLoadingTex(true)
    try {
      const url = `/mc-assets/${VERSION}/${cat.assetPath}/${path}`
      const { px, w, h } = await loadImagePixels(url)
      undoStack.current = []; redoStack.current = []
      setHistLen(0); setFutureLen(0)
      pixelsRef.current = px
      sizeRef.current = { w, h }
      setCurrentEntry({ label, catId: cat.id, rpPath: path })
      redraw()
    } catch {
      // texture failed to load — start blank 16x16
      pixelsRef.current = makeBlank(16, 16)
      sizeRef.current = { w: 16, h: 16 }
      setCurrentEntry({ label, catId: cat.id, rpPath: path })
      redraw()
    } finally {
      setLoadingTex(false)
    }
  }, [redraw])

  // ── Add to pack ───────────────────────────────────────────────────────────
  const addToPack = useCallback(() => {
    if (!currentEntry) return
    const { w, h } = sizeRef.current
    const dataUrl = pixelsToDataUrl(pixelsRef.current, w, h)

    if (mode === 'custom') {
      if (!customName.trim() || !baseItemName.trim()) return
      const id = `custom/${baseItemName}/${customModelData}`
      setCustomItems(prev => {
        const filtered = prev.filter(e => e.id !== id)
        return [...filtered, {
          id,
          customName: customName.trim(),
          baseItem: baseItemName.trim(),
          customModelData,
          parentModel,
          dataUrl, w, h,
        }]
      })
    } else {
      const id = currentEntry.catId + '/' + currentEntry.rpPath
      setPackEntries(prev => {
        const filtered = prev.filter(e => e.id !== id)
        return [...filtered, {
          id,
          label: currentEntry.label,
          catId: currentEntry.catId,
          rpPath: currentEntry.rpPath,
          dataUrl, w, h,
        }]
      })
    }
  }, [currentEntry, mode, customName, baseItemName, customModelData, parentModel])

  // ── Export ────────────────────────────────────────────────────────────────
  const exportPack = useCallback(async () => {
    const zip = new JSZip()
    zip.file('pack.mcmeta', JSON.stringify({
      pack: { pack_format: packFormat, description: packDesc }
    }, null, 2))

    // Vanilla texture replacements
    for (const entry of packEntries) {
      const cat = TEXTURE_CATEGORIES.find(c => c.id === entry.catId)
      if (!cat) continue
      zip.file(`assets/minecraft/textures/${cat.rpPath}/${entry.rpPath}`, entry.dataUrl.split(',')[1], { base64: true })
    }

    // Custom model data items
    // Group by base item to merge overrides
    const byBase = new Map<string, CustomItemEntry[]>()
    for (const item of customItems) {
      const list = byBase.get(item.baseItem) ?? []
      list.push(item)
      byBase.set(item.baseItem, list)
    }
    for (const [base, items] of byBase) {
      // Override model for the base item (e.g. diamond_chestplate.json)
      zip.file(
        `assets/minecraft/models/item/${base}.json`,
        JSON.stringify({
          parent: items[0].parentModel,
          textures: { layer0: `item/${base}` },
          overrides: items
            .sort((a, b) => a.customModelData - b.customModelData)
            .map(i => ({ predicate: { custom_model_data: i.customModelData }, model: `item/${i.customName}` })),
        }, null, 2),
      )
      // Per-variant texture + model
      for (const item of items) {
        zip.file(`assets/minecraft/textures/item/${item.customName}.png`, item.dataUrl.split(',')[1], { base64: true })
        zip.file(
          `assets/minecraft/models/item/${item.customName}.json`,
          JSON.stringify({ parent: item.parentModel, textures: { layer0: `item/${item.customName}` } }, null, 2),
        )
      }
    }

    const blob = await zip.generateAsync({ type: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = (packName || 'resource-pack') + '.zip'
    a.click()
  }, [packEntries, customItems, packName, packDesc, packFormat])

  // ── Texture browser entries ───────────────────────────────────────────────
  const allEntries = useMemo(() => {
    if (selectedCat) return selectedCat.entries.map(e => ({ ...e, cat: selectedCat }))
    return TEXTURE_CATEGORIES.flatMap(cat => cat.entries.map(e => ({ ...e, cat })))
  }, [selectedCat])

  const filteredEntries = useMemo(() => {
    const q = search.toLowerCase()
    const filtered = q
      ? allEntries.filter(e => e.label.toLowerCase().includes(q) || e.path.toLowerCase().includes(q))
      : allEntries
    return filtered.slice(0, 120)
  }, [allEntries, search])

  const totalFiltered = useMemo(() => {
    const q = search.toLowerCase()
    return q
      ? allEntries.filter(e => e.label.toLowerCase().includes(q) || e.path.toLowerCase().includes(q)).length
      : allEntries.length
  }, [allEntries, search])

  // ── Render ────────────────────────────────────────────────────────────────
  const { w, h } = sizeRef.current
  const cell = Math.max(1, Math.floor(DISPLAY_SIZE / Math.max(w, h)))
  const canvasW = w * cell
  const canvasH = h * cell

  return (
    <div className="section container">
      <div className="mb-8">
        <span className="badge-muted">Tool</span>
        <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>Resource Pack Maker</h1>
        <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
          Pick a vanilla texture, draw your changes, add to pack, export.
        </p>
        {/* Mode toggle */}
        <div className="flex gap-2 mt-5">
          {([['replace', 'Replace Textures'], ['custom', 'Custom Model Data (CMD)']] as const).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="px-4 py-1.5 rounded-xl text-sm font-medium transition-all"
              style={{
                border: `1px solid ${mode === m ? 'rgb(var(--accent))' : 'rgb(var(--border))'}`,
                background: mode === m ? 'rgb(var(--accent) / 0.1)' : 'transparent',
                color: mode === m ? 'rgb(var(--accent))' : 'rgb(var(--muted))',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === 'custom' && (
          <p className="mt-2 text-sm" style={{ color: 'rgb(var(--muted))' }}>
            Load a base item texture, customise it, fill in the form on the right, then add to pack.
            The server sends the item with <code style={{ color: 'rgb(var(--accent))' }}>custom_model_data</code> to trigger your texture.
          </p>
        )}
      </div>

      <div className="flex gap-4" style={{ alignItems: 'flex-start' }}>

        {/* ── LEFT: texture browser ──────────────────────────────────────── */}
        <div className="flex flex-col gap-3" style={{ width: 220, flexShrink: 0, position: 'sticky', top: 80 }}>
          {/* Category tabs */}
          <div className="card" style={{ padding: '0.5rem' }}>
            <div className="space-y-0.5">
              <button
                onClick={() => { setSelectedCat(null); setSearch('') }}
                className="w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors"
                style={{
                  background: selectedCat === null ? 'rgb(var(--accent) / 0.12)' : 'transparent',
                  color: selectedCat === null ? 'rgb(var(--accent))' : 'rgb(var(--muted))',
                  fontWeight: selectedCat === null ? 600 : 400,
                }}
              >
                All
                <span className="ml-1 text-xs opacity-50">
                  ({TEXTURE_CATEGORIES.reduce((n, c) => n + c.entries.length, 0)})
                </span>
              </button>
              {TEXTURE_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => { setSelectedCat(cat); setSearch('') }}
                  className="w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors"
                  style={{
                    background: selectedCat?.id === cat.id ? 'rgb(var(--accent) / 0.12)' : 'transparent',
                    color: selectedCat?.id === cat.id ? 'rgb(var(--accent))' : 'rgb(var(--muted))',
                    fontWeight: selectedCat?.id === cat.id ? 600 : 400,
                  }}
                >
                  {cat.label}
                  <span className="ml-1 text-xs opacity-50">({cat.entries.length})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'rgb(var(--muted))' }} />
            <input
              className="form-input pl-8 text-sm"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Texture grid */}
          <div className="card" style={{ padding: '0.5rem', maxHeight: 480, overflowY: 'auto' }}>
            {search && (
              <p className="text-xs mb-2" style={{ color: 'rgb(var(--muted))' }}>
                {filteredEntries.length < totalFiltered
                  ? `Showing ${filteredEntries.length} of ${totalFiltered}`
                  : `${totalFiltered} results`}
              </p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
              {filteredEntries.map(entry => {
                const isCurrent = currentEntry?.catId === entry.cat.id && currentEntry?.rpPath === entry.path
                return (
                  <button
                    key={entry.cat.id + '/' + entry.path}
                    title={entry.label}
                    onClick={() => loadVanillaTexture(entry.cat, entry.path, entry.label)}
                    className="rounded-lg overflow-hidden transition-all"
                    style={{
                      aspectRatio: '1',
                      background: 'rgba(0,0,0,0.15)',
                      border: `2px solid ${isCurrent ? 'rgb(var(--accent))' : 'transparent'}`,
                      padding: 2,
                    }}
                  >
                    <img
                      src={`/mc-assets/${VERSION}/${entry.cat.assetPath}/${entry.path}`}
                      alt={entry.label}
                      style={{ width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated' }}
                      onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2' }}
                    />
                  </button>
                )
              })}
            </div>
            {totalFiltered > 120 && !search && (
              <p className="text-xs mt-2 text-center" style={{ color: 'rgb(var(--muted))' }}>
                Showing 120 of {totalFiltered} — search to filter
              </p>
            )}
          </div>
        </div>

        {/* ── CENTER: pixel editor ──────────────────────────────────────── */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          {/* Toolbar */}
          <div className="card flex items-center gap-1 flex-wrap" style={{ padding: '0.5rem 0.75rem' }}>
            {/* Drawing tools */}
            <ToolBtn icon={Brush} active={tool === 'brush'} title="Brush (B)" onClick={() => setTool('brush')} />
            <ToolBtn icon={Eraser} active={tool === 'eraser'} title="Eraser (E)" onClick={() => setTool('eraser')} />
            <ToolBtn icon={PaintBucket} active={tool === 'fill'} title="Fill (F)" onClick={() => setTool('fill')} />
            <ToolBtn icon={Pipette} active={tool === 'eyedrop'} title="Eyedropper (I)" onClick={() => setTool('eyedrop')} />

            <div className="w-px h-6 mx-1" style={{ background: 'rgb(var(--border))' }} />

            {/* History */}
            <ToolBtn icon={Undo2} title="Undo (⌘Z)" onClick={undo} disabled={histLen === 0} />
            <ToolBtn icon={Redo2} title="Redo (⌘Y)" onClick={redo} disabled={futureLen === 0} />

            <div className="w-px h-6 mx-1" style={{ background: 'rgb(var(--border))' }} />

            {/* Grid */}
            <ToolBtn icon={Grid3x3} active={showGrid} title="Toggle grid (G)" onClick={() => setShowGrid(v => !v)} />

            <div className="flex-1" />

            {/* Color */}
            <div className="flex items-center gap-2">
              <label
                className="relative cursor-pointer rounded-lg overflow-hidden"
                style={{ width: 32, height: 32, border: '2px solid rgb(var(--border))' }}
              >
                <div style={{ width: '100%', height: '100%', background: color }} />
                <input
                  type="color"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                />
              </label>
              <input
                className="form-input font-mono text-xs w-24"
                value={color}
                onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) setColor(e.target.value) }}
                maxLength={7}
              />
              <div className="flex flex-col gap-0.5">
                <label className="text-xs" style={{ color: 'rgb(var(--muted))' }}>Opacity</label>
                <input
                  type="range" min={0} max={255} value={alpha}
                  onChange={e => setAlpha(Number(e.target.value))}
                  className="w-20"
                />
              </div>
            </div>
          </div>

          {/* Canvas area — canvas stays mounted so event listeners are preserved */}
          <div className="card flex items-center justify-center" style={{ padding: '1.5rem', minHeight: 300 }}>
            <div style={{ position: 'relative' }}>
              <canvas
                ref={canvasRef}
                style={{
                  display: 'block',
                  imageRendering: 'pixelated',
                  cursor: tool === 'eyedrop' ? 'crosshair' : tool === 'fill' ? 'cell' : 'crosshair',
                  maxWidth: '100%',
                  boxShadow: '0 0 0 1px rgb(var(--border))',
                  borderRadius: 2,
                  width: canvasW,
                  height: canvasH,
                }}
              />
              {loadingTex && (
                <div
                  style={{
                    position: 'absolute', inset: 0, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    background: 'rgb(var(--panel) / 0.8)',
                    borderRadius: 2, color: 'rgb(var(--muted))',
                    fontSize: '0.875rem',
                  }}
                >
                  Loading…
                </div>
              )}
            </div>
          </div>

          {/* Status bar */}
          <div className="flex items-center justify-between">
            <div className="text-xs" style={{ color: 'rgb(var(--muted))' }}>
              {currentEntry
                ? <><span style={{ color: 'rgb(var(--text))' }}>{currentEntry.label}</span> · {w}×{h}px</>
                : <span>Select a texture from the browser to start editing</span>
              }
            </div>
            <button
              onClick={addToPack}
              disabled={mode === 'custom' ? (!currentEntry || !customName.trim() || !baseItemName.trim()) : !currentEntry}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-30"
              style={{ backgroundColor: 'rgb(var(--accent))', color: 'rgb(var(--accent-fg, #fff))' }}
            >
              <Plus className="w-4 h-4" />
              {mode === 'custom' ? 'Add Custom Item' : 'Add to Pack'}
            </button>
          </div>
        </div>

        {/* ── RIGHT: panel ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3" style={{ width: 240, flexShrink: 0, position: 'sticky', top: 80 }}>

          {/* ── Custom Model Data form (custom mode only) ─────────────── */}
          {mode === 'custom' && (
            <div className="card space-y-3">
              <h3 className="text-sm font-semibold" style={{ color: 'rgb(var(--text))' }}>Custom Item</h3>

              <div>
                <label className="form-label">Custom Name</label>
                <input
                  className="form-input text-sm font-mono"
                  placeholder="ruby_chestplate"
                  value={customName}
                  onChange={e => setCustomName(e.target.value.replace(/\s+/g, '_').toLowerCase())}
                />
                <p className="text-xs mt-0.5" style={{ color: 'rgb(var(--muted))' }}>Unique ID for this texture variant</p>
              </div>

              <div>
                <label className="form-label">Base Item</label>
                <input
                  className="form-input text-sm font-mono"
                  placeholder="diamond_chestplate"
                  value={baseItemName}
                  onChange={e => setBaseItemName(e.target.value.replace(/\s+/g, '_').toLowerCase())}
                />
                <p className="text-xs mt-0.5" style={{ color: 'rgb(var(--muted))' }}>Vanilla item this overrides</p>
              </div>

              <div>
                <label className="form-label">Custom Model Data #</label>
                <input
                  type="number"
                  min={1}
                  className="form-input text-sm font-mono"
                  value={customModelData}
                  onChange={e => setCustomModelData(Math.max(1, Number(e.target.value)))}
                />
              </div>

              <div>
                <label className="form-label">Parent Model</label>
                <select className="form-input text-sm" value={parentModel} onChange={e => setParentModel(e.target.value)}>
                  <option value="item/generated">item/generated (most items)</option>
                  <option value="item/handheld">item/handheld (tools/weapons)</option>
                  <option value="item/handheld_rod">item/handheld_rod (fishing rod)</option>
                </select>
              </div>

              {/* Server command hint */}
              {baseItemName && customModelData > 0 && (
                <div className="rounded-lg p-2 space-y-1.5" style={{ background: 'rgb(var(--bg))', border: '1px solid rgb(var(--border))' }}>
                  <p className="text-xs font-medium" style={{ color: 'rgb(var(--text))' }}>Server gives player:</p>
                  <code className="block text-xs break-all" style={{ color: 'rgb(var(--accent))' }}>
                    /give @p {baseItemName}[custom_model_data={customModelData}]
                  </code>
                  <p className="text-xs" style={{ color: 'rgb(var(--muted))' }}>Legacy (≤1.20.4):</p>
                  <code className="block text-xs break-all" style={{ color: 'rgb(var(--muted))' }}>
                    {'{'}CustomModelData:{customModelData}{'}'}
                  </code>
                </div>
              )}
            </div>
          )}

          {/* Pack metadata */}
          <div className="card space-y-3">
            <h3 className="text-sm font-semibold" style={{ color: 'rgb(var(--text))' }}>Pack Settings</h3>
            <div>
              <label className="form-label">Name</label>
              <input className="form-input text-sm" value={packName} onChange={e => setPackName(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Description</label>
              <input className="form-input text-sm" value={packDesc} onChange={e => setPackDesc(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Format</label>
              <select className="form-input text-sm" value={packFormat} onChange={e => setPackFormat(Number(e.target.value))}>
                {PACK_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          </div>

          {/* Pack contents */}
          <div className="card" style={{ padding: '0.75rem' }}>
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'rgb(var(--text))' }}>
              Pack Contents
              <span className="ml-1.5 text-xs font-normal" style={{ color: 'rgb(var(--muted))' }}>
                {packEntries.length + customItems.length}
              </span>
            </h3>

            {packEntries.length === 0 && customItems.length === 0 ? (
              <p className="text-xs" style={{ color: 'rgb(var(--muted))' }}>Nothing added yet.</p>
            ) : (
              <div className="space-y-1.5">
                {packEntries.map(entry => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer group"
                    style={{ border: '1px solid rgb(var(--border))' }}
                    onClick={() => {
                      loadImagePixels(entry.dataUrl).then(({ px, w, h }) => {
                        pixelsRef.current = px; sizeRef.current = { w, h }
                        undoStack.current = []; redoStack.current = []
                        setHistLen(0); setFutureLen(0)
                        setCurrentEntry({ label: entry.label, catId: entry.catId, rpPath: entry.rpPath })
                        redraw()
                      })
                    }}
                  >
                    <img src={entry.dataUrl} alt={entry.label} style={{ width: 24, height: 24, imageRendering: 'pixelated', objectFit: 'contain', flexShrink: 0 }} />
                    <span className="text-xs flex-1 truncate" style={{ color: 'rgb(var(--text))' }} title={entry.label}>{entry.label}</span>
                    <button onClick={e => { e.stopPropagation(); setPackEntries(p => p.filter(x => x.id !== entry.id)) }}
                      className="opacity-0 group-hover:opacity-100" style={{ color: 'rgb(var(--muted))' }}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {customItems.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer group"
                    style={{ border: '1px solid rgb(var(--accent) / 0.3)', background: 'rgb(var(--accent) / 0.04)' }}
                    onClick={() => {
                      loadImagePixels(item.dataUrl).then(({ px, w, h }) => {
                        pixelsRef.current = px; sizeRef.current = { w, h }
                        undoStack.current = []; redoStack.current = []
                        setHistLen(0); setFutureLen(0)
                        setCurrentEntry({ label: item.customName, catId: 'item', rpPath: `${item.baseItem}.png` })
                        setCustomName(item.customName)
                        setBaseItemName(item.baseItem)
                        setCustomModelData(item.customModelData)
                        setParentModel(item.parentModel)
                        redraw()
                      })
                    }}
                  >
                    <img src={item.dataUrl} alt={item.customName} style={{ width: 24, height: 24, imageRendering: 'pixelated', objectFit: 'contain', flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs truncate" style={{ color: 'rgb(var(--text))' }} title={item.customName}>{item.customName}</div>
                      <div className="text-xs truncate" style={{ color: 'rgb(var(--muted))' }}>CMD:{item.customModelData} · {item.baseItem}</div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); setCustomItems(p => p.filter(x => x.id !== item.id)) }}
                      className="opacity-0 group-hover:opacity-100" style={{ color: 'rgb(var(--muted))' }}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Export */}
          <button
            onClick={exportPack}
            disabled={packEntries.length === 0 && customItems.length === 0}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-30"
            style={{ backgroundColor: 'rgb(var(--accent))', color: 'rgb(var(--accent-fg, #fff))' }}
          >
            <Download className="w-4 h-4" />
            Export .zip
          </button>

          {/* Keyboard hints */}
          <div className="card" style={{ padding: '0.5rem 0.75rem' }}>
            <p className="text-xs font-medium mb-1" style={{ color: 'rgb(var(--text))' }}>Shortcuts</p>
            {[['B', 'Brush'], ['E', 'Eraser'], ['F', 'Fill'], ['I', 'Eyedropper'], ['G', 'Grid'], ['⌘Z', 'Undo'], ['⌘Y', 'Redo']].map(([k, v]) => (
              <div key={k} className="flex justify-between text-xs" style={{ color: 'rgb(var(--muted))' }}>
                <span style={{ fontFamily: 'monospace', color: 'rgb(var(--accent))' }}>{k}</span>
                <span>{v}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
