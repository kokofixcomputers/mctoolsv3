import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { ZoomIn, ZoomOut, Maximize2, Download } from 'lucide-react'
import { generateShape, rowCounts, colCounts, totalBlocks, type ShapeType, type FillMode } from '../tools/circle/circleGen'
import { buildSchematic, downloadBlob } from '../tools/circle/schematic'
import { ItemPicker } from '../components/ItemPicker'
import type { McItem } from '../hooks/useMinecraftItems'

// ── constants ─────────────────────────────────────────────────────────────────
const BLOCK_COLOR_LIGHT = '#6ee7b7'   // emerald-200
const BLOCK_COLOR_DARK  = '#34d399'   // emerald-400
const GRID_COLOR_LIGHT  = 'rgba(0,0,0,0.08)'
const GRID_COLOR_DARK   = 'rgba(255,255,255,0.06)'
const RULER_ALPHA       = 0.7

// ── canvas renderer ───────────────────────────────────────────────────────────
function renderCanvas(
  canvas: HTMLCanvasElement,
  grid: boolean[],
  W: number, H: number,
  cellSize: number,
  showGrid: boolean,
  isDark: boolean,
  rows: number[], cols: number[],
) {
  const RULER = 28   // px reserved for ruler labels
  const ctx = canvas.getContext('2d')!
  const dpr = window.devicePixelRatio || 1

  const totalW = RULER + W * cellSize + RULER
  const totalH = RULER + H * cellSize + RULER

  canvas.width  = totalW * dpr
  canvas.height = totalH * dpr
  canvas.style.width  = totalW + 'px'
  canvas.style.height = totalH + 'px'
  ctx.scale(dpr, dpr)

  ctx.clearRect(0, 0, totalW, totalH)

  const blockColor = isDark ? BLOCK_COLOR_DARK : BLOCK_COLOR_LIGHT
  const gridColor  = isDark ? GRID_COLOR_DARK  : GRID_COLOR_LIGHT
  const rulerColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.35)'

  // draw cells
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = RULER + x * cellSize
      const py = RULER + y * cellSize
      if (grid[y * W + x]) {
        ctx.fillStyle = blockColor
        ctx.fillRect(px, py, cellSize, cellSize)
      }
    }
  }

  // grid lines
  if (showGrid && cellSize >= 6) {
    ctx.strokeStyle = gridColor
    ctx.lineWidth = 0.5
    for (let x = 0; x <= W; x++) {
      const px = RULER + x * cellSize
      ctx.beginPath(); ctx.moveTo(px, RULER); ctx.lineTo(px, RULER + H * cellSize); ctx.stroke()
    }
    for (let y = 0; y <= H; y++) {
      const py = RULER + y * cellSize
      ctx.beginPath(); ctx.moveTo(RULER, py); ctx.lineTo(RULER + W * cellSize, py); ctx.stroke()
    }
  }

  // ruler: col counts (top + bottom)
  ctx.fillStyle = rulerColor
  ctx.font = `${Math.min(11, cellSize - 2)}px 'JetBrains Mono', monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let x = 0; x < W; x++) {
    if (cols[x] === 0) continue
    const px = RULER + x * cellSize + cellSize / 2
    ctx.fillText(String(cols[x]), px, RULER / 2)
    ctx.fillText(String(cols[x]), px, RULER + H * cellSize + RULER / 2)
  }

  // ruler: row counts (left + right)
  ctx.textAlign = 'center'
  for (let y = 0; y < H; y++) {
    if (rows[y] === 0) continue
    const py = RULER + y * cellSize + cellSize / 2
    ctx.fillText(String(rows[y]), RULER / 2, py)
    ctx.fillText(String(rows[y]), RULER + W * cellSize + RULER / 2, py)
  }
}

// ── CirclePage ────────────────────────────────────────────────────────────────
const SHAPES: { id: ShapeType; label: string }[] = [
  { id: 'circle',    label: 'Circle'    },
  { id: 'ellipse',   label: 'Ellipse'   },
  { id: 'square',    label: 'Square'    },
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'diamond',   label: 'Diamond'   },
]

const PRESETS = [16, 32, 64, 128]

export default function CirclePage() {
  const [shape, setShape]   = useState<ShapeType>('circle')
  const [mode, setMode]     = useState<FillMode>('outline')
  const [width, setWidth]   = useState(21)
  const [height, setHeight] = useState(21)
  const [cellSize, setCellSize] = useState(20)
  const [showGrid, setShowGrid] = useState(true)
  const [blockId, setBlockId]   = useState('minecraft:stone')
  const [exporting, setExporting] = useState(false)

  // Pan + zoom state
  const [pan, setPan]   = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const isDark = document.documentElement.classList.contains('dark')

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const panningRef   = useRef(false)
  const panStart     = useRef({ mx: 0, my: 0, px: 0, py: 0 })

  // Link width=height for circle/square/diamond
  const isSymmetric = shape === 'circle' || shape === 'square' || shape === 'diamond'
  const effectiveH = isSymmetric ? width : height

  const grid = useMemo(
    () => generateShape({ shape, width, height: effectiveH, mode }),
    [shape, width, effectiveH, mode],
  )

  const rows = useMemo(() => rowCounts(grid, width, effectiveH), [grid, width, effectiveH])
  const cols = useMemo(() => colCounts(grid, width, effectiveH), [grid, width, effectiveH])
  const total = useMemo(() => totalBlocks(grid), [grid])

  // Render canvas on changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    renderCanvas(canvas, grid, width, effectiveH, cellSize, showGrid, isDark, rows, cols)
  }, [grid, width, effectiveH, cellSize, showGrid, isDark, rows, cols])

  // Pan with mouse drag
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    panningRef.current = true
    panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
  }, [pan])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!panningRef.current) return
      const dx = e.clientX - panStart.current.mx
      const dy = e.clientY - panStart.current.my
      setPan({ x: panStart.current.px + dx, y: panStart.current.py + dy })
    }
    const onUp = () => { panningRef.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  // Zoom with scroll
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setZoom(z => Math.min(4, Math.max(0.2, z * (e.deltaY < 0 ? 1.1 : 0.9))))
  }, [])

  const resetView = () => { setPan({ x: 0, y: 0 }); setZoom(1) }

  // PNG export
  const exportPng = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url; a.download = `${shape}_${width}x${effectiveH}.png`; a.click()
  }

  // Schematic export
  const exportSchematic = async () => {
    setExporting(true)
    try {
      const data = await buildSchematic({
        grid, width, height: 1, length: effectiveH,
        blockId, name: `${shape} ${width}x${effectiveH}`,
      })
      downloadBlob(data, `${shape}_${width}x${effectiveH}.schem`)
    } finally {
      setExporting(false)
    }
  }

  const handleWidthChange = (v: number) => {
    setWidth(Math.max(3, Math.min(512, v)))
    if (isSymmetric) setHeight(v)
  }
  const handleHeightChange = (v: number) => {
    setHeight(Math.max(3, Math.min(512, v)))
  }

  return (
    <div className="section container">
      <div className="mb-8">
        <span className="badge-muted">Tool</span>
        <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>Circle Generator</h1>
        <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
          Generate pixel-perfect shapes and export as WorldEdit schematics.
        </p>
      </div>

      <div className="grid lg:grid-cols-[300px_1fr] gap-6">

        {/* ── Left: controls ── */}
        <div className="space-y-4">

          {/* Shape */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h3>Shape</h3>
              <span className="badge-accent text-xs">{total.toLocaleString()} blocks</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">Shape</label>
                <select className="form-input" value={shape} onChange={e => setShape(e.target.value as ShapeType)}>
                  {SHAPES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Mode</label>
                <select className="form-input" value={mode} onChange={e => setMode(e.target.value as FillMode)}>
                  <option value="outline">Outline</option>
                  <option value="filled">Filled</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">Width</label>
                <input type="number" min={3} max={512} className="form-input" value={width}
                  onChange={e => handleWidthChange(parseInt(e.target.value) || 3)} />
              </div>
              {!isSymmetric && (
                <div>
                  <label className="form-label">Height</label>
                  <input type="number" min={3} max={512} className="form-input" value={height}
                    onChange={e => handleHeightChange(parseInt(e.target.value) || 3)} />
                </div>
              )}
            </div>

            {isSymmetric && (
              <p className="text-xs" style={{ color: 'rgb(var(--muted))' }}>Width = Height for {shape}</p>
            )}

            {/* Preset sizes */}
            <div>
              <label className="form-label">Quick size</label>
              <div className="flex gap-2 flex-wrap">
                {PRESETS.map(p => (
                  <button key={p} onClick={() => handleWidthChange(p)}
                    className="btn-secondary px-3 py-1 text-xs rounded-lg">
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Display */}
          <div className="card space-y-4">
            <h3>Display</h3>
            <div>
              <label className="form-label">Cell size (px)</label>
              <div className="flex gap-2 items-center">
                <input type="range" min={4} max={48} value={cellSize}
                  onChange={e => setCellSize(Number(e.target.value))}
                  className="flex-1 accent-violet-500" />
                <span className="text-sm w-8 text-right" style={{ color: 'rgb(var(--muted))' }}>{cellSize}</span>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm"
              style={{ color: 'rgb(var(--muted))' }}>
              <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)}
                className="accent-violet-500" />
              Show grid lines
            </label>
          </div>

          {/* Export */}
          <div className="card space-y-4">
            <h3>Export</h3>
            <div>
              <label className="form-label">Block (for schematic)</label>
              <ItemPicker
                value={blockId.replace('minecraft:', '')}
                onChange={v => setBlockId(v.includes(':') ? v : `minecraft:${v}`)}
                placeholder="stone"
                filter={(item: McItem) => item.name !== 'air'}
              />
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={exportPng} className="btn-secondary flex items-center justify-center gap-2 py-2">
                <Download className="w-4 h-4" /> PNG
              </button>
              <button onClick={exportSchematic} disabled={exporting}
                className="btn-primary flex items-center justify-center gap-2 py-2">
                <Download className="w-4 h-4" />
                {exporting ? 'Building…' : 'WorldEdit Schematic (.schem)'}
              </button>
            </div>
            <p className="text-xs" style={{ color: 'rgb(var(--muted))' }}>
              Schematic is a flat 1-block-high layer. Load with WorldEdit's <code className="font-mono">//schem load</code> command.
            </p>
          </div>
        </div>

        {/* ── Right: canvas preview ── */}
        <div className="card p-0 overflow-hidden flex flex-col" style={{ minHeight: '520px' }}>
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid rgb(var(--border))' }}>
            <span className="text-sm font-medium" style={{ color: 'rgb(var(--text))' }}>Preview</span>
            <span className="text-xs ml-1" style={{ color: 'rgb(var(--muted))' }}>· Drag to pan · Scroll to zoom</span>
            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => setZoom(z => Math.min(4, z * 1.2))}
                className="btn-ghost rounded-lg p-1.5"><ZoomIn className="w-4 h-4" /></button>
              <span className="text-xs w-12 text-center font-mono" style={{ color: 'rgb(var(--muted))' }}>
                {Math.round(zoom * 100)}%
              </span>
              <button onClick={() => setZoom(z => Math.max(0.2, z / 1.2))}
                className="btn-ghost rounded-lg p-1.5"><ZoomOut className="w-4 h-4" /></button>
              <button onClick={resetView} className="btn-ghost rounded-lg p-1.5" title="Reset view">
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Canvas area */}
          <div
            ref={containerRef}
            className="flex-1 overflow-hidden relative"
            style={{ cursor: panningRef.current ? 'grabbing' : 'grab', userSelect: 'none' }}
            onMouseDown={onMouseDown}
            onWheel={onWheel}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: 'center',
                  transition: panningRef.current ? undefined : 'transform 0.05s',
                }}
              >
                <canvas
                  ref={canvasRef}
                  style={{ display: 'block', borderRadius: '4px' }}
                />
              </div>
            </div>

            {/* Block count overlay */}
            <div
              className="absolute bottom-3 right-3 px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{
                backgroundColor: 'rgb(var(--panel) / 0.9)',
                border: '1px solid rgb(var(--border))',
                color: 'rgb(var(--text))',
                backdropFilter: 'blur(6px)',
              }}
            >
              {total.toLocaleString()} blocks
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
