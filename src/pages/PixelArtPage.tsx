import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Upload, Download, ZoomIn, ZoomOut, Maximize2, RefreshCw } from 'lucide-react'
import { NbtWriter, varint, gzip } from '../tools/circle/nbtWriter'
import { downloadBlob } from '../tools/circle/schematic'
import { useVersion } from '../contexts/VersionContext'

// ── Block palette ──────────────────────────────────────────────────────────────

interface BlockDef {
  id: string
  label: string
  color: [number, number, number]
  category: string
}

const BLOCKS: BlockDef[] = [
  // Concrete (best for pixel art — saturated, clean)
  { id: 'minecraft:white_concrete',      label: 'White Concrete',      color: [207,213,214], category: 'Concrete' },
  { id: 'minecraft:orange_concrete',     label: 'Orange Concrete',     color: [224, 97,  1], category: 'Concrete' },
  { id: 'minecraft:magenta_concrete',    label: 'Magenta Concrete',    color: [169, 48,159], category: 'Concrete' },
  { id: 'minecraft:light_blue_concrete', label: 'Light Blue Concrete', color: [ 36,137,199], category: 'Concrete' },
  { id: 'minecraft:yellow_concrete',     label: 'Yellow Concrete',     color: [240,175, 21], category: 'Concrete' },
  { id: 'minecraft:lime_concrete',       label: 'Lime Concrete',       color: [ 94,168, 52], category: 'Concrete' },
  { id: 'minecraft:pink_concrete',       label: 'Pink Concrete',       color: [213,101,142], category: 'Concrete' },
  { id: 'minecraft:gray_concrete',       label: 'Gray Concrete',       color: [ 54, 57, 61], category: 'Concrete' },
  { id: 'minecraft:light_gray_concrete', label: 'Light Gray Concrete', color: [125,125,115], category: 'Concrete' },
  { id: 'minecraft:cyan_concrete',       label: 'Cyan Concrete',       color: [ 21,119,136], category: 'Concrete' },
  { id: 'minecraft:purple_concrete',     label: 'Purple Concrete',     color: [100, 32,156], category: 'Concrete' },
  { id: 'minecraft:blue_concrete',       label: 'Blue Concrete',       color: [ 45, 47,143], category: 'Concrete' },
  { id: 'minecraft:brown_concrete',      label: 'Brown Concrete',      color: [ 96, 59, 32], category: 'Concrete' },
  { id: 'minecraft:green_concrete',      label: 'Green Concrete',      color: [ 73, 91, 36], category: 'Concrete' },
  { id: 'minecraft:red_concrete',        label: 'Red Concrete',        color: [142, 33, 33], category: 'Concrete' },
  { id: 'minecraft:black_concrete',      label: 'Black Concrete',      color: [  8, 10, 15], category: 'Concrete' },
  // Wool
  { id: 'minecraft:white_wool',          label: 'White Wool',          color: [233,236,236], category: 'Wool' },
  { id: 'minecraft:orange_wool',         label: 'Orange Wool',         color: [240,118, 19], category: 'Wool' },
  { id: 'minecraft:magenta_wool',        label: 'Magenta Wool',        color: [189, 68,179], category: 'Wool' },
  { id: 'minecraft:light_blue_wool',     label: 'Light Blue Wool',     color: [ 58,175,217], category: 'Wool' },
  { id: 'minecraft:yellow_wool',         label: 'Yellow Wool',         color: [248,197, 39], category: 'Wool' },
  { id: 'minecraft:lime_wool',           label: 'Lime Wool',           color: [112,185, 25], category: 'Wool' },
  { id: 'minecraft:pink_wool',           label: 'Pink Wool',           color: [237,141,172], category: 'Wool' },
  { id: 'minecraft:gray_wool',           label: 'Gray Wool',           color: [ 62, 68, 71], category: 'Wool' },
  { id: 'minecraft:light_gray_wool',     label: 'Light Gray Wool',     color: [142,142,134], category: 'Wool' },
  { id: 'minecraft:cyan_wool',           label: 'Cyan Wool',           color: [ 21,137,145], category: 'Wool' },
  { id: 'minecraft:purple_wool',         label: 'Purple Wool',         color: [121, 42,172], category: 'Wool' },
  { id: 'minecraft:blue_wool',           label: 'Blue Wool',           color: [ 53, 57,157], category: 'Wool' },
  { id: 'minecraft:brown_wool',          label: 'Brown Wool',          color: [114, 71, 40], category: 'Wool' },
  { id: 'minecraft:green_wool',          label: 'Green Wool',          color: [ 84,109, 27], category: 'Wool' },
  { id: 'minecraft:red_wool',            label: 'Red Wool',            color: [161, 39, 34], category: 'Wool' },
  { id: 'minecraft:black_wool',          label: 'Black Wool',          color: [ 20, 21, 25], category: 'Wool' },
  // Terracotta
  { id: 'minecraft:white_terracotta',        label: 'White Terracotta',      color: [210,178,161], category: 'Terracotta' },
  { id: 'minecraft:orange_terracotta',       label: 'Orange Terracotta',     color: [162, 84, 38], category: 'Terracotta' },
  { id: 'minecraft:yellow_terracotta',       label: 'Yellow Terracotta',     color: [186,133, 36], category: 'Terracotta' },
  { id: 'minecraft:light_blue_terracotta',   label: 'Lt Blue Terracotta',    color: [113,108,137], category: 'Terracotta' },
  { id: 'minecraft:lime_terracotta',         label: 'Lime Terracotta',       color: [103,117, 53], category: 'Terracotta' },
  { id: 'minecraft:pink_terracotta',         label: 'Pink Terracotta',       color: [161, 78, 78], category: 'Terracotta' },
  { id: 'minecraft:gray_terracotta',         label: 'Gray Terracotta',       color: [ 57, 42, 35], category: 'Terracotta' },
  { id: 'minecraft:light_gray_terracotta',   label: 'Lt Gray Terracotta',    color: [135,107, 98], category: 'Terracotta' },
  { id: 'minecraft:cyan_terracotta',         label: 'Cyan Terracotta',       color: [ 87, 91, 91], category: 'Terracotta' },
  { id: 'minecraft:purple_terracotta',       label: 'Purple Terracotta',     color: [118, 70, 86], category: 'Terracotta' },
  { id: 'minecraft:blue_terracotta',         label: 'Blue Terracotta',       color: [ 74, 59, 91], category: 'Terracotta' },
  { id: 'minecraft:brown_terracotta',        label: 'Brown Terracotta',      color: [ 77, 51, 35], category: 'Terracotta' },
  { id: 'minecraft:green_terracotta',        label: 'Green Terracotta',      color: [ 76, 83, 42], category: 'Terracotta' },
  { id: 'minecraft:red_terracotta',          label: 'Red Terracotta',        color: [143, 61, 46], category: 'Terracotta' },
  { id: 'minecraft:black_terracotta',        label: 'Black Terracotta',      color: [ 37, 22, 16], category: 'Terracotta' },
  { id: 'minecraft:terracotta',              label: 'Terracotta',            color: [152, 94, 68], category: 'Terracotta' },
  // Stone / natural
  { id: 'minecraft:stone',          label: 'Stone',           color: [128,128,128], category: 'Natural' },
  { id: 'minecraft:cobblestone',    label: 'Cobblestone',     color: [127,127,127], category: 'Natural' },
  { id: 'minecraft:granite',        label: 'Granite',         color: [153,114, 99], category: 'Natural' },
  { id: 'minecraft:diorite',        label: 'Diorite',         color: [188,184,185], category: 'Natural' },
  { id: 'minecraft:andesite',       label: 'Andesite',        color: [136,136,136], category: 'Natural' },
  { id: 'minecraft:deepslate',      label: 'Deepslate',       color: [ 76, 76, 84], category: 'Natural' },
  { id: 'minecraft:sand',           label: 'Sand',            color: [219,207,163], category: 'Natural' },
  { id: 'minecraft:red_sand',       label: 'Red Sand',        color: [190,102, 33], category: 'Natural' },
  { id: 'minecraft:gravel',         label: 'Gravel',          color: [136,126,126], category: 'Natural' },
  { id: 'minecraft:dirt',           label: 'Dirt',            color: [134, 96, 67], category: 'Natural' },
  { id: 'minecraft:netherrack',     label: 'Netherrack',      color: [ 97, 38, 38], category: 'Natural' },
  { id: 'minecraft:obsidian',       label: 'Obsidian',        color: [ 15, 10, 25], category: 'Natural' },
  { id: 'minecraft:snow_block',     label: 'Snow Block',      color: [249,252,252], category: 'Natural' },
  { id: 'minecraft:ice',            label: 'Ice',             color: [145,183,210], category: 'Natural' },
  // Planks
  { id: 'minecraft:oak_planks',     label: 'Oak Planks',      color: [162,130, 78], category: 'Wood' },
  { id: 'minecraft:spruce_planks',  label: 'Spruce Planks',   color: [114, 84, 48], category: 'Wood' },
  { id: 'minecraft:birch_planks',   label: 'Birch Planks',    color: [192,175,121], category: 'Wood' },
  { id: 'minecraft:jungle_planks',  label: 'Jungle Planks',   color: [160,115, 80], category: 'Wood' },
  { id: 'minecraft:acacia_planks',  label: 'Acacia Planks',   color: [168, 90, 50], category: 'Wood' },
  { id: 'minecraft:dark_oak_planks',label: 'Dark Oak Planks', color: [ 66, 43, 20], category: 'Wood' },
  { id: 'minecraft:mangrove_planks',label: 'Mangrove Planks', color: [114, 42, 38], category: 'Wood' },
  // Ore/mineral blocks
  { id: 'minecraft:iron_block',     label: 'Iron Block',      color: [220,220,220], category: 'Mineral' },
  { id: 'minecraft:gold_block',     label: 'Gold Block',      color: [249,236, 79], category: 'Mineral' },
  { id: 'minecraft:diamond_block',  label: 'Diamond Block',   color: [ 92,216,210], category: 'Mineral' },
  { id: 'minecraft:emerald_block',  label: 'Emerald Block',   color: [ 71,208, 94], category: 'Mineral' },
  { id: 'minecraft:lapis_block',    label: 'Lapis Block',     color: [ 29, 66,140], category: 'Mineral' },
  { id: 'minecraft:redstone_block', label: 'Redstone Block',  color: [175, 25,  6], category: 'Mineral' },
  { id: 'minecraft:coal_block',     label: 'Coal Block',      color: [ 16, 16, 16], category: 'Mineral' },
  { id: 'minecraft:quartz_block',   label: 'Quartz Block',    color: [235,229,222], category: 'Mineral' },
  { id: 'minecraft:netherite_block',label: 'Netherite Block', color: [ 68, 61, 64], category: 'Mineral' },
  // Misc
  { id: 'minecraft:sandstone',      label: 'Sandstone',       color: [219,199,144], category: 'Misc' },
  { id: 'minecraft:bricks',         label: 'Bricks',          color: [151, 98, 83], category: 'Misc' },
  { id: 'minecraft:pumpkin',        label: 'Pumpkin',         color: [198,118, 23], category: 'Misc' },
  { id: 'minecraft:melon',          label: 'Melon',           color: [113,147, 56], category: 'Misc' },
  { id: 'minecraft:hay_block',      label: 'Hay Block',       color: [165,138, 22], category: 'Misc' },
  { id: 'minecraft:packed_ice',     label: 'Packed Ice',      color: [162,198,228], category: 'Misc' },
  { id: 'minecraft:end_stone',      label: 'End Stone',       color: [219,222,158], category: 'Misc' },
]

const CATEGORIES = ['All', ...Array.from(new Set(BLOCKS.map(b => b.category)))]

// ── Color matching ─────────────────────────────────────────────────────────────

function colorDist(a: [number,number,number], b: [number,number,number]): number {
  // Weighted RGB (human perceptual approximation)
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2]
  return (2 + a[0] / 256) * dr * dr + 4 * dg * dg + (2 + (255 - a[0]) / 256) * db * db
}

function closestBlock(r: number, g: number, b: number, palette: BlockDef[]): number {
  let best = 0, bestDist = Infinity
  for (let i = 0; i < palette.length; i++) {
    const d = colorDist([r,g,b], palette[i].color)
    if (d < bestDist) { bestDist = d; best = i }
  }
  return best
}

// Floyd-Steinberg dithering
function quantize(
  pixels: Uint8ClampedArray,
  srcW: number, srcH: number,
  palette: BlockDef[],
  dither: boolean,
): number[] {
  // Work in floating-point RGB
  const buf = new Float32Array(srcW * srcH * 3)
  for (let i = 0; i < srcW * srcH; i++) {
    buf[i * 3]     = pixels[i * 4]
    buf[i * 3 + 1] = pixels[i * 4 + 1]
    buf[i * 3 + 2] = pixels[i * 4 + 2]
  }

  const result = new Array<number>(srcW * srcH)

  for (let y = 0; y < srcH; y++) {
    for (let x = 0; x < srcW; x++) {
      const idx = (y * srcW + x) * 3
      const r = Math.max(0, Math.min(255, buf[idx]))
      const g = Math.max(0, Math.min(255, buf[idx + 1]))
      const b = Math.max(0, Math.min(255, buf[idx + 2]))
      const bi = closestBlock(r, g, b, palette)
      result[y * srcW + x] = bi

      if (dither) {
        const [pr, pg, pb] = palette[bi].color
        const er = r - pr, eg = g - pg, eb = b - pb
        const push = (dx: number, dy: number, factor: number) => {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || nx >= srcW || ny >= srcH) return
          const ni = (ny * srcW + nx) * 3
          buf[ni]     += er * factor
          buf[ni + 1] += eg * factor
          buf[ni + 2] += eb * factor
        }
        push(1, 0, 7/16); push(-1, 1, 3/16); push(0, 1, 5/16); push(1, 1, 1/16)
      }
    }
  }
  return result
}

// ── Schematic builder (multi-block palette) ───────────────────────────────────

const DATA_VERSIONS: Record<string, number> = { '1.21.1': 3953, '1.21.4': 4189, '1.21.5': 4325 }

async function buildPixelSchematic(
  blockIndices: number[],   // palette index per cell, row-major (z outer, x inner)
  palette: BlockDef[],
  width: number,
  length: number,
  name: string,
  mcVersion?: string,
): Promise<Uint8Array> {
  const dataVer = (mcVersion ? DATA_VERSIONS[mcVersion] : undefined) ?? 3953

  // Build actual block id palette (deduplicate)
  const usedIds = new Set<string>(['minecraft:air'])
  for (const i of blockIndices) usedIds.add(palette[i].id)
  const palArr = Array.from(usedIds)
  const palIdx = new Map<string, number>(palArr.map((id, i) => [id, i]))

  const blockDataArr: number[] = []
  for (let z = 0; z < length; z++) {
    for (let x = 0; x < width; x++) {
      const bi = blockIndices[z * width + x]
      blockDataArr.push(...varint(palIdx.get(palette[bi].id)!))
    }
  }

  const now = Date.now()
  const w = new NbtWriter()
  w.compound('', () => {
    w.compound('Schematic', () => {
      w.int('Version', 3)
      w.int('DataVersion', dataVer)
      w.compound('Metadata', () => {
        w.string('Name', name)
        w.string('Author', 'MCTools')
        w.long('Date', Math.floor(now / 0x100000000), now >>> 0)
        w.emptyList('RequiredMods', 8)
      })
      w.short('Width', width)
      w.short('Height', 1)
      w.short('Length', length)
      w.intArray('Offset', [0, 0, 0])
      w.compound('Blocks', () => {
        w.compound('Palette', () => {
          for (const [id, idx] of palIdx) w.int(id, idx)
        })
        w.byteArray('Data', blockDataArr)
        w.emptyList('BlockEntities')
      })
      w.emptyList('Entities')
    })
  })
  return gzip(w.bytes())
}

// ── Canvas renderer ────────────────────────────────────────────────────────────

const RULER = 32

function renderPreview(
  canvas: HTMLCanvasElement,
  blockIndices: number[],
  palette: BlockDef[],
  w: number, h: number,
  cellSize: number,
  showGrid: boolean,
  isDark: boolean,
) {
  const ctx = canvas.getContext('2d')!
  const dpr = window.devicePixelRatio || 1
  const totalW = RULER + w * cellSize + RULER
  const totalH = RULER + h * cellSize + RULER
  canvas.width = totalW * dpr
  canvas.height = totalH * dpr
  canvas.style.width = totalW + 'px'
  canvas.style.height = totalH + 'px'
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, totalW, totalH)

  // Cells
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const bi = blockIndices[y * w + x]
      const [r, g, b] = palette[bi].color
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.fillRect(RULER + x * cellSize, RULER + y * cellSize, cellSize, cellSize)
    }
  }

  // Grid lines
  if (showGrid && cellSize >= 4) {
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)'
    ctx.lineWidth = 0.5
    for (let x = 0; x <= w; x++) {
      const px = RULER + x * cellSize
      ctx.beginPath(); ctx.moveTo(px, RULER); ctx.lineTo(px, RULER + h * cellSize); ctx.stroke()
    }
    for (let y = 0; y <= h; y++) {
      const py = RULER + y * cellSize
      ctx.beginPath(); ctx.moveTo(RULER, py); ctx.lineTo(RULER + w * cellSize, py); ctx.stroke()
    }
  }

  // Row counts (unique blocks per row, left + right rulers)
  const rulerColor = isDark ? 'rgba(200,200,220,0.7)' : 'rgba(40,40,60,0.6)'
  ctx.fillStyle = rulerColor
  ctx.font = `${Math.max(8, Math.min(11, cellSize - 2))}px 'JetBrains Mono', monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // Col counts (blocks per column, top + bottom)
  for (let x = 0; x < w; x++) {
    let count = 0
    for (let y = 0; y < h; y++) {
      const bi = blockIndices[y * w + x]
      if (palette[bi].id !== 'minecraft:air') count++
    }
    if (count === 0) continue
    const px = RULER + x * cellSize + cellSize / 2
    ctx.fillText(String(count), px, RULER / 2)
    ctx.fillText(String(count), px, RULER + h * cellSize + RULER / 2)
  }

  // Row counts
  for (let y = 0; y < h; y++) {
    let count = 0
    for (let x = 0; x < w; x++) {
      const bi = blockIndices[y * w + x]
      if (palette[bi].id !== 'minecraft:air') count++
    }
    if (count === 0) continue
    const py = RULER + y * cellSize + cellSize / 2
    ctx.fillText(String(count), RULER / 2, py)
    ctx.fillText(String(count), RULER + w * cellSize + RULER / 2, py)
  }
}

// ── Resize image using offscreen canvas ───────────────────────────────────────

function resizeImageData(src: HTMLImageElement | ImageBitmap, targetW: number, targetH: number): Uint8ClampedArray {
  const c = document.createElement('canvas')
  c.width = targetW; c.height = targetH
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src as CanvasImageSource, 0, 0, targetW, targetH)
  return ctx.getImageData(0, 0, targetW, targetH).data
}

// ── Size presets ───────────────────────────────────────────────────────────────

const SIZE_PRESETS = [16, 32, 48, 64, 96, 128]

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PixelArtPage() {
  const { version } = useVersion()

  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null)
  const [imgName, setImgName] = useState('')
  const [targetW, setTargetW] = useState(64)
  const [targetH, setTargetH] = useState(64)
  const [lockAspect, setLockAspect] = useState(true)
  const [dither, setDither] = useState(true)
  const [showGrid, setShowGrid] = useState(true)
  const [cellSize, setCellSize] = useState(10)
  const [catFilter, setCatFilter] = useState<string>('Concrete')
  const [enabledIds, setEnabledIds] = useState<Set<string>>(
    new Set(BLOCKS.filter(b => b.category === 'Concrete').map(b => b.id))
  )
  const [exporting, setExporting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const panRef = useRef(false)
  const panStart = useRef({ mx: 0, my: 0, px: 0, py: 0 })

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const aspectRef = useRef(1)

  // Active palette = enabled blocks
  const palette = useMemo(
    () => BLOCKS.filter(b => enabledIds.has(b.id)),
    [enabledIds]
  )

  // Quantized block indices
  const blockIndices = useMemo(() => {
    if (!imgEl || palette.length === 0) return null
    const pixels = resizeImageData(imgEl, targetW, targetH)
    return quantize(pixels, targetW, targetH, palette, dither)
  }, [imgEl, targetW, targetH, palette, dither])

  // Block usage counts
  const usage = useMemo(() => {
    if (!blockIndices) return new Map<string, number>()
    const m = new Map<string, number>()
    for (const i of blockIndices) {
      const id = palette[i].id
      m.set(id, (m.get(id) ?? 0) + 1)
    }
    return m
  }, [blockIndices, palette])

  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !blockIndices || palette.length === 0) return
    const isDark = document.documentElement.classList.contains('dark') ||
      window.matchMedia('(prefers-color-scheme: dark)').matches
    renderPreview(canvas, blockIndices, palette, targetW, targetH, cellSize, showGrid, isDark)
  }, [blockIndices, palette, targetW, targetH, cellSize, showGrid])

  // Load image from file
  function loadFile(file: File) {
    if (!file.type.startsWith('image/')) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      aspectRef.current = img.naturalWidth / img.naturalHeight
      setImgEl(img)
      setImgName(file.name.replace(/\.[^.]+$/, ''))
      // Auto-set size to 64 but respect aspect
      const w = 64
      const h = Math.max(1, Math.round(w / aspectRef.current))
      setTargetW(w); setTargetH(h)
      setZoom(1); setPan({ x: 0, y: 0 })
    }
    img.src = url
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) loadFile(file)
  }, [])

  function handleWidthChange(w: number) {
    const clamped = Math.max(4, Math.min(256, w))
    setTargetW(clamped)
    if (lockAspect) setTargetH(Math.max(1, Math.round(clamped / aspectRef.current)))
  }

  function handleHeightChange(h: number) {
    const clamped = Math.max(4, Math.min(256, h))
    setTargetH(clamped)
    if (lockAspect) setTargetW(Math.max(1, Math.round(clamped * aspectRef.current)))
  }

  function applyPreset(size: number) {
    const ar = aspectRef.current || 1
    const w = size
    const h = lockAspect ? Math.max(1, Math.round(size / ar)) : size
    setTargetW(w); setTargetH(h)
  }

  // Toggle category blocks
  function toggleCategory(cat: string) {
    const catBlocks = BLOCKS.filter(b => b.category === cat).map(b => b.id)
    const allEnabled = catBlocks.every(id => enabledIds.has(id))
    setEnabledIds(prev => {
      const next = new Set(prev)
      if (allEnabled) catBlocks.forEach(id => { if (next.size > 1) next.delete(id) })
      else catBlocks.forEach(id => next.add(id))
      return next
    })
  }

  function toggleBlock(id: string) {
    setEnabledIds(prev => {
      if (prev.has(id) && prev.size <= 1) return prev
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Pan/zoom handlers
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    panRef.current = true
    panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
  }, [pan])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!panRef.current) return
    setPan({ x: panStart.current.px + e.clientX - panStart.current.mx, y: panStart.current.py + e.clientY - panStart.current.my })
  }, [])

  const onMouseUp = useCallback(() => { panRef.current = false }, [])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setZoom(z => Math.max(0.2, Math.min(8, z * (e.deltaY < 0 ? 1.15 : 0.87))))
  }, [])

  function resetView() { setZoom(1); setPan({ x: 0, y: 0 }) }

  // Export schematic
  async function exportSchematic() {
    if (!blockIndices || palette.length === 0) return
    setExporting(true)
    try {
      const data = await buildPixelSchematic(blockIndices, palette, targetW, targetH, imgName || 'pixel-art', version.id)
      downloadBlob(data, `${imgName || 'pixel-art'}.schem`)
    } finally {
      setExporting(false)
    }
  }

  // Export PNG of the preview
  function exportPng() {
    const canvas = canvasRef.current
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `${imgName || 'pixel-art'}-preview.png`
    a.click()
  }

  const totalBlocks = blockIndices ? blockIndices.length : 0
  const visCategories = CATEGORIES.filter(c => c !== 'All')

  return (
    <div className="section container">
      <div className="mb-8">
        <span className="badge-muted">Tool</span>
        <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>Pixel Art Generator</h1>
        <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
          Convert any image into a Minecraft pixel art build plan. Export a WorldEdit schematic.
        </p>
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-6">

        {/* ── Left: controls ── */}
        <div className="space-y-4">

          {/* Image upload */}
          <div className="card space-y-3">
            <h3 className="font-semibold" style={{ color: 'rgb(var(--text))' }}>Image</h3>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById('pa-file-input')?.click()}
              className="rounded-xl border-2 border-dashed flex flex-col items-center gap-2 py-6 cursor-pointer transition-all"
              style={{
                borderColor: dragOver ? 'rgb(var(--accent))' : 'rgb(var(--border))',
                background: dragOver ? 'rgb(var(--accent) / 0.04)' : 'transparent',
              }}
            >
              <Upload className="w-6 h-6" style={{ color: dragOver ? 'rgb(var(--accent))' : 'rgb(var(--muted))' }} />
              <div className="text-center">
                <p className="text-sm font-medium" style={{ color: 'rgb(var(--text))' }}>
                  {imgName ? imgName : 'Drop an image here'}
                </p>
                <p className="text-xs" style={{ color: 'rgb(var(--muted))' }}>PNG, JPG, GIF, WebP</p>
              </div>
              <input id="pa-file-input" type="file" accept="image/*" className="hidden"
                onChange={e => { if (e.target.files?.[0]) loadFile(e.target.files[0]) }} />
            </div>

            {imgEl && (
              <img src={imgEl.src} alt="source" className="rounded-lg w-full object-contain"
                style={{ maxHeight: 120, imageRendering: 'pixelated' }} />
            )}
          </div>

          {/* Size */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold" style={{ color: 'rgb(var(--text))' }}>Size</h3>
              <span className="badge-accent text-xs">{targetW}×{targetH} = {targetW * targetH} blocks</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="form-label">Width</label>
                <input type="number" min={4} max={256} className="form-input font-mono"
                  value={targetW} onChange={e => handleWidthChange(Number(e.target.value))} />
              </div>
              <div>
                <label className="form-label">Height</label>
                <input type="number" min={4} max={256} className="form-input font-mono"
                  value={targetH} onChange={e => handleHeightChange(Number(e.target.value))} />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'rgb(var(--muted))' }}>
              <input type="checkbox" checked={lockAspect} onChange={e => setLockAspect(e.target.checked)}
                style={{ accentColor: 'rgb(var(--accent))' }} />
              Lock aspect ratio
            </label>

            <div>
              <label className="form-label">Quick size</label>
              <div className="flex flex-wrap gap-1.5">
                {SIZE_PRESETS.map(s => (
                  <button key={s} onClick={() => applyPreset(s)}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                    style={{
                      border: `1px solid ${targetW === s ? 'rgb(var(--accent))' : 'rgb(var(--border))'}`,
                      background: targetW === s ? 'rgb(var(--accent) / 0.1)' : 'transparent',
                      color: targetW === s ? 'rgb(var(--accent))' : 'rgb(var(--muted))',
                    }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Block palette */}
          <div className="card space-y-3">
            <h3 className="font-semibold" style={{ color: 'rgb(var(--text))' }}>Block Palette
              <span className="ml-2 text-xs font-normal" style={{ color: 'rgb(var(--muted))' }}>{enabledIds.size} blocks</span>
            </h3>

            {/* Category tabs */}
            <div className="flex flex-wrap gap-1">
              {visCategories.map(cat => {
                const catBlocks = BLOCKS.filter(b => b.category === cat)
                const allOn = catBlocks.every(b => enabledIds.has(b.id))
                return (
                  <button key={cat}
                    onClick={() => { setCatFilter(cat); toggleCategory(cat) }}
                    className="px-2 py-0.5 rounded-md text-xs font-medium transition-all"
                    style={{
                      border: `1px solid ${catFilter === cat ? 'rgb(var(--accent))' : 'rgb(var(--border))'}`,
                      background: allOn ? 'rgb(var(--accent) / 0.12)' : catFilter === cat ? 'rgb(var(--accent) / 0.06)' : 'transparent',
                      color: catFilter === cat ? 'rgb(var(--accent))' : 'rgb(var(--muted))',
                    }}>
                    {cat}
                  </button>
                )
              })}
            </div>

            {/* Block grid for current category */}
            <div className="grid grid-cols-4 gap-1 max-h-48 overflow-y-auto pr-1">
              {BLOCKS.filter(b => b.category === catFilter).map(block => {
                const on = enabledIds.has(block.id)
                const [r, g, b] = block.color
                return (
                  <button key={block.id} onClick={() => toggleBlock(block.id)}
                    title={block.label}
                    className="rounded-lg p-1 flex flex-col items-center gap-0.5 transition-all text-center"
                    style={{
                      border: `2px solid ${on ? `rgb(${r},${g},${b})` : 'rgb(var(--border))'}`,
                      background: on ? `rgba(${r},${g},${b},0.15)` : 'transparent',
                      opacity: on ? 1 : 0.45,
                    }}>
                    <div className="w-6 h-6 rounded" style={{ background: `rgb(${r},${g},${b})` }} />
                    <span className="text-[9px] leading-tight" style={{ color: 'rgb(var(--muted))' }}>
                      {block.label.replace(/ Concrete| Wool| Terracotta| Block| Planks/g, '').replace('Light ', 'Lt ').replace('Dark ', 'Dk ')}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Display */}
          <div className="card space-y-3">
            <h3 className="font-semibold" style={{ color: 'rgb(var(--text))' }}>Display</h3>
            <div>
              <label className="form-label">Cell size (px)</label>
              <div className="flex items-center gap-2">
                <input type="range" min={2} max={32} value={cellSize}
                  onChange={e => setCellSize(Number(e.target.value))}
                  className="flex-1" style={{ accentColor: 'rgb(var(--accent))' }} />
                <span className="text-sm w-6 font-mono text-right" style={{ color: 'rgb(var(--muted))' }}>{cellSize}</span>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'rgb(var(--muted))' }}>
              <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)}
                style={{ accentColor: 'rgb(var(--accent))' }} />
              Show grid lines
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'rgb(var(--muted))' }}>
              <input type="checkbox" checked={dither} onChange={e => setDither(e.target.checked)}
                style={{ accentColor: 'rgb(var(--accent))' }} />
              Floyd-Steinberg dithering
            </label>
          </div>

          {/* Export */}
          <div className="card space-y-3">
            <h3 className="font-semibold" style={{ color: 'rgb(var(--text))' }}>Export</h3>
            <div className="flex flex-col gap-2">
              <button onClick={exportPng} disabled={!blockIndices}
                className="btn-secondary flex items-center justify-center gap-2 py-2 disabled:opacity-40">
                <Download className="w-4 h-4" /> Preview PNG
              </button>
              <button onClick={exportSchematic} disabled={!blockIndices || exporting}
                className="btn-primary flex items-center justify-center gap-2 py-2 disabled:opacity-40">
                <Download className="w-4 h-4" />
                {exporting ? 'Building…' : 'WorldEdit Schematic (.schem)'}
              </button>
            </div>
            <p className="text-xs" style={{ color: 'rgb(var(--muted))' }}>
              Flat 1-layer schematic. Load with <code className="font-mono">//schem load</code> in WorldEdit.
            </p>
          </div>

          {/* Block usage */}
          {usage.size > 0 && (
            <div className="card space-y-2">
              <h3 className="font-semibold text-sm" style={{ color: 'rgb(var(--text))' }}>
                Block Usage · {totalBlocks.toLocaleString()} total
              </h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {[...usage.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([id, count]) => {
                    const block = BLOCKS.find(b => b.id === id)
                    if (!block) return null
                    const [r, g, b2] = block.color
                    const pct = ((count / totalBlocks) * 100).toFixed(1)
                    return (
                      <div key={id} className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded shrink-0" style={{ background: `rgb(${r},${g},${b2})` }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs truncate" style={{ color: 'rgb(var(--text))' }}>{block.label}</div>
                          <div className="h-1 rounded-full mt-0.5" style={{ background: 'rgb(var(--border))' }}>
                            <div className="h-1 rounded-full" style={{ width: pct + '%', background: `rgb(${r},${g},${b2})` }} />
                          </div>
                        </div>
                        <span className="text-xs font-mono shrink-0" style={{ color: 'rgb(var(--muted))' }}>
                          {count.toLocaleString()}
                        </span>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: canvas preview ── */}
        <div className="card p-0 overflow-hidden flex flex-col" style={{ minHeight: 520 }}>
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid rgb(var(--border))' }}>
            <span className="text-sm font-medium" style={{ color: 'rgb(var(--text))' }}>Preview</span>
            <span className="text-xs ml-1" style={{ color: 'rgb(var(--muted))' }}>· Drag to pan · Scroll to zoom · Numbers = blocks per row/col</span>
            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => setZoom(z => Math.min(8, z * 1.2))} className="btn-ghost p-1.5 rounded-lg">
                <ZoomIn className="w-4 h-4" />
              </button>
              <span className="text-xs w-12 text-center font-mono" style={{ color: 'rgb(var(--muted))' }}>
                {Math.round(zoom * 100)}%
              </span>
              <button onClick={() => setZoom(z => Math.max(0.2, z / 1.2))} className="btn-ghost p-1.5 rounded-lg">
                <ZoomOut className="w-4 h-4" />
              </button>
              <button onClick={resetView} className="btn-ghost p-1.5 rounded-lg" title="Reset view">
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div
            ref={containerRef}
            className="flex-1 overflow-hidden relative"
            style={{ cursor: panRef.current ? 'grabbing' : 'grab', userSelect: 'none' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onWheel={onWheel}
          >
            {!imgEl ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3"
                style={{ color: 'rgb(var(--muted))' }}>
                <RefreshCw className="w-10 h-10 opacity-20" />
                <p className="text-sm">Upload an image to see the pixel art preview</p>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: 'center',
                  transition: panRef.current ? undefined : 'transform 0.05s',
                }}>
                  <canvas ref={canvasRef} style={{ display: 'block', borderRadius: 4 }} />
                </div>
              </div>
            )}

            {blockIndices && (
              <div className="absolute bottom-3 right-3 px-3 py-1.5 rounded-lg text-sm font-medium"
                style={{ background: 'rgb(var(--panel, var(--bg)) / 0.9)', border: '1px solid rgb(var(--border))', color: 'rgb(var(--text))', backdropFilter: 'blur(6px)' }}>
                {targetW}×{targetH} · {totalBlocks.toLocaleString()} blocks · {usage.size} types
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
