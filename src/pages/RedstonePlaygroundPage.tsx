import { useRef, useReducer, useEffect, useState, useCallback } from 'react'
import { Play, Pause, StepForward, Trash2, RotateCw, MousePointer2, Eraser, Gauge } from 'lucide-react'
import {
  RedstoneSim, WOOL_COLORS, DIRS, dustConnectionsOf, dustPointsInto, isMechanism,
  type BlockType, type Dir, type Cell,
} from '../tools/redstone/engine'

// ── Visual constants ─────────────────────────────────────────────────────────────

const GRID_W = 28
const GRID_H = 18
const CELL = 28

const WOOL_HEX: Record<string, string> = {
  white: '#e9ecec', orange: '#f07613', magenta: '#bd44b3', light_blue: '#3aafd9',
  yellow: '#f8c627', lime: '#70b919', pink: '#ed8dac', gray: '#3e4447',
  light_gray: '#8e8e86', cyan: '#158991', purple: '#792aac', blue: '#35399d',
  brown: '#724728', green: '#546d1b', red: '#a12722', black: '#141519',
}

interface PaletteItem { type: BlockType; label: string }
const PALETTE_GROUPS: { name: string; items: PaletteItem[] }[] = [
  {
    name: 'Power & Logic', items: [
      { type: 'dust', label: 'Redstone Dust' },
      { type: 'redstone_block', label: 'Block of Redstone' },
      { type: 'torch', label: 'Redstone Torch' },
      { type: 'lever', label: 'Lever' },
      { type: 'button', label: 'Button' },
      { type: 'repeater', label: 'Repeater' },
      { type: 'comparator', label: 'Comparator' },
      { type: 'target', label: 'Target Block' },
    ],
  },
  {
    name: 'Mechanisms', items: [
      { type: 'piston', label: 'Piston' },
      { type: 'sticky_piston', label: 'Sticky Piston' },
      { type: 'redstone_lamp', label: 'Redstone Lamp' },
      { type: 'tnt', label: 'TNT' },
    ],
  },
  {
    name: 'Blocks', items: [
      { type: 'cobblestone', label: 'Cobblestone' },
      { type: 'obsidian', label: 'Obsidian' },
    ],
  },
]

type Tool = BlockType | 'interact' | 'erase'

const DIRECTIONAL = new Set<BlockType>(['repeater', 'comparator', 'piston', 'sticky_piston', 'torch'])

// ── Rendering ────────────────────────────────────────────────────────────────────

function drawArrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, dir: Dir, color: string) {
  const [dx, dy] = DIRS[dir]
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx - dx * 7, cy - dy * 7)
  ctx.lineTo(cx + dx * 7, cy + dy * 7)
  // arrow head
  const perpX = -dy, perpY = dx
  ctx.lineTo(cx + dx * 7 - dx * 4 + perpX * 4, cy + dy * 7 - dy * 4 + perpY * 4)
  ctx.moveTo(cx + dx * 7, cy + dy * 7)
  ctx.lineTo(cx + dx * 7 - dx * 4 - perpX * 4, cy + dy * 7 - dy * 4 - perpY * 4)
  ctx.stroke()
}

// Visual arms for a dust cell: the redstone-wire connections plus any directions
// where it points straight into a mechanism (piston/TNT/lamp) — drawn so the wire
// visibly runs through into that block.
function dustArms(sim: RedstoneSim, x: number, y: number): boolean[] {
  const arms = dustConnectionsOf(sim, x, y).slice()
  for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
    const n = sim.at(x + DIRS[d][0], y + DIRS[d][1])
    if (n && isMechanism(n.type) && dustPointsInto(sim, x, y, d)) arms[d] = true
  }
  return arms
}

function drawCell(ctx: CanvasRenderingContext2D, c: Cell, x: number, y: number, dark: boolean, conn?: boolean[]) {
  const px = x * CELL, py = y * CELL
  const cx = px + CELL / 2, cy = py + CELL / 2
  const t = c.type

  const base = dark ? '#16181d' : '#f3f4f8'
  ctx.fillStyle = base
  ctx.fillRect(px, py, CELL, CELL)

  if (t === 'air') return

  const drawSolid = (color: string, powered: boolean) => {
    ctx.fillStyle = color
    ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2)
    if (powered) {
      ctx.fillStyle = 'rgba(255,40,40,0.28)'
      ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2)
    }
  }

  switch (t) {
    case 'cobblestone': drawSolid('#7d7d7d', c.blockPowered); break
    case 'redstone_lamp': {
      if (c.blockPowered) {
        drawSolid('#f6c66b', false)
        ctx.fillStyle = '#fff6d8'
        ctx.fillRect(px + CELL * 0.28, py + CELL * 0.28, CELL * 0.44, CELL * 0.44)
        ctx.fillStyle = 'rgba(255,220,120,0.4)'
        ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2)
      } else {
        drawSolid('#6a5230', false)
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1
        ctx.strokeRect(px + CELL * 0.3, py + CELL * 0.3, CELL * 0.4, CELL * 0.4)
      }
      break
    }
    case 'obsidian': drawSolid('#1a1326', c.blockPowered); break
    case 'redstone_block':
      drawSolid('#c81e10', false)
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1
      for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(px + i * CELL / 4, py); ctx.lineTo(px + i * CELL / 4, py + CELL); ctx.stroke() }
      break
    case 'target': {
      drawSolid('#d98a78', c.blockPowered)
      ctx.fillStyle = '#b33b27'
      ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.28, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#e9d2c8'
      ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.12, 0, Math.PI * 2); ctx.fill()
      break
    }
    case 'tnt': {
      drawSolid('#b13a2e', false)
      ctx.fillStyle = '#e8e3da'
      ctx.fillRect(px + 1, cy - 3, CELL - 2, 6)
      ctx.fillStyle = '#2a2a2a'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('TNT', cx, cy)
      if (c.tntFuse >= 0 && c.tntFuse % 4 < 2) { ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2) }
      break
    }
    case 'piston':
    case 'sticky_piston': {
      drawSolid('#6a5536', false)
      // face plate on the facing side
      const [dx, dy] = DIRS[c.dir]
      ctx.fillStyle = t === 'sticky_piston' ? '#9ca84e' : '#caa66a'
      const fw = dx !== 0 ? 5 : CELL - 2, fh = dy !== 0 ? 5 : CELL - 2
      const fx = dx > 0 ? px + CELL - 6 : px + 1, fy = dy > 0 ? py + CELL - 6 : py + 1
      ctx.fillRect(fx, fy, fw, fh)
      break
    }
    case 'piston_arm': {
      const [dx, dy] = DIRS[c.armDir]
      ctx.fillStyle = c.armSticky ? '#9ca84e' : '#caa66a'
      // shaft
      ctx.fillRect(cx - 3 + dx * -2, cy - 3 + dy * -2, 6 + Math.abs(dx) * 10, 6 + Math.abs(dy) * 10)
      // head plate at the far edge
      ctx.fillStyle = '#6a5536'
      const fw = dx !== 0 ? 5 : CELL - 2, fh = dy !== 0 ? 5 : CELL - 2
      const hx = dx > 0 ? px + CELL - 6 : px + 1, hy = dy > 0 ? py + CELL - 6 : py + 1
      ctx.fillRect(hx, hy, fw, fh)
      break
    }
    case 'dust': {
      const p = c.power
      const lvl = p / 15
      const col = p > 0 ? `rgb(${Math.round(120 + 135 * lvl)},${Math.round(20 * lvl)},${Math.round(20 * lvl)})` : (dark ? '#5a2a2a' : '#7a3b3b')
      const hasAny = !!conn && conn.some(Boolean)
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineCap = 'round'
      if (hasAny) {
        for (let d = 0; d < 4; d++) {
          if (!conn![d]) continue
          const [dx, dy] = DIRS[d]
          ctx.beginPath()
          ctx.moveTo(cx, cy)
          ctx.lineTo(cx + dx * (CELL / 2), cy + dy * (CELL / 2))
          ctx.stroke()
        }
      }
      ctx.lineCap = 'butt'
      // center node — a lone dot when nothing connects, slightly smaller when wired
      ctx.fillStyle = col
      ctx.beginPath(); ctx.arc(cx, cy, hasAny ? 3 : 4.5, 0, Math.PI * 2); ctx.fill()
      if (p > 0) { ctx.fillStyle = '#fff'; ctx.font = '8px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(p), cx, cy) }
      break
    }
    case 'torch': {
      ctx.strokeStyle = '#7a5a36'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(cx, cy + 6); ctx.lineTo(cx, cy - 2); ctx.stroke()
      ctx.fillStyle = c.torchLit ? '#ff3b30' : '#5a2a2a'
      ctx.beginPath(); ctx.arc(cx, cy - 5, 4, 0, Math.PI * 2); ctx.fill()
      if (c.torchLit) { ctx.fillStyle = 'rgba(255,80,60,0.25)'; ctx.beginPath(); ctx.arc(cx, cy - 5, 8, 0, Math.PI * 2); ctx.fill() }
      break
    }
    case 'lever': {
      drawSolid(dark ? '#3a3f46' : '#cfd3da', false)
      ctx.strokeStyle = c.leverOn ? '#34d399' : '#8a8f98'; ctx.lineWidth = 4; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(cx, cy + 4); ctx.lineTo(cx + (c.leverOn ? 6 : -6), cy - 5); ctx.stroke()
      ctx.lineCap = 'butt'
      break
    }
    case 'button': {
      ctx.fillStyle = c.buttonTimer > 0 ? '#34d399' : (dark ? '#4a4f56' : '#b9bdc6')
      ctx.fillRect(cx - 5, cy - 3, 10, 6)
      break
    }
    case 'repeater': {
      drawSolid(dark ? '#9aa0a6' : '#b9bec6', false)
      // input/output torches along facing axis
      const [dx, dy] = DIRS[c.dir]
      const inT = { x: cx - dx * 8, y: cy - dy * 8 }
      const outT = { x: cx + dx * 8, y: cy + dy * 8 }
      ctx.fillStyle = c.repOn ? '#ff3b30' : '#7a2a2a'
      ctx.beginPath(); ctx.arc(outT.x, outT.y, 2.6, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#7a2a2a'
      ctx.beginPath(); ctx.arc(inT.x, inT.y, 2.6, 0, Math.PI * 2); ctx.fill()
      drawArrow(ctx, cx, cy, c.dir, 'rgba(0,0,0,0.5)')
      ctx.fillStyle = '#222'; ctx.font = '7px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(String(c.delay), cx - dy * 7, cy + dx * 7)
      break
    }
    case 'comparator': {
      drawSolid(dark ? '#9aa0a6' : '#b9bec6', false)
      drawArrow(ctx, cx, cy, c.dir, 'rgba(0,0,0,0.5)')
      ctx.fillStyle = c.cmpOut > 0 ? '#ff3b30' : '#7a2a2a'
      const [dx, dy] = DIRS[c.dir]
      ctx.beginPath(); ctx.arc(cx + dx * 8, cy + dy * 8, 2.6, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = c.cmpMode === 1 ? '#ff3b30' : '#444'
      ctx.font = '7px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(c.cmpMode === 1 ? '−' : '=', cx, cy - 9)
      break
    }
    default:
      if (t.startsWith('wool_')) drawSolid(WOOL_HEX[t.slice(5)] ?? '#888', c.blockPowered)
  }
}

// ── Component ────────────────────────────────────────────────────────────────────

const SPEEDS = [
  { label: '0.5×', ms: 400 },
  { label: '1×', ms: 200 },
  { label: '2×', ms: 100 },
  { label: '4×', ms: 50 },
]

export default function RedstonePlaygroundPage() {
  const simRef = useRef<RedstoneSim>(new RedstoneSim(GRID_W, GRID_H))
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [, force] = useReducer((x: number) => x + 1, 0)

  const [tool, setTool] = useState<Tool>('interact')
  const [placeDir, setPlaceDir] = useState<Dir>(1)
  const [woolColor, setWoolColor] = useState<string>('red')
  const [playing, setPlaying] = useState(false)
  const [speedIdx, setSpeedIdx] = useState(1)
  const [qc, setQc] = useState(true)
  const paintingRef = useRef<null | 'place' | 'erase'>(null)

  // keep QC option in sync
  useEffect(() => { simRef.current.opts.quasiConnectivity = qc }, [qc])

  // tick loop
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => { simRef.current.step(); force() }, SPEEDS[speedIdx].ms)
    return () => clearInterval(id)
  }, [playing, speedIdx])

  // draw
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = GRID_W * CELL * dpr
    canvas.height = GRID_H * CELL * dpr
    canvas.style.width = GRID_W * CELL + 'px'
    canvas.style.height = GRID_H * CELL + 'px'
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const dark = document.documentElement.classList.contains('dark') ||
      window.matchMedia('(prefers-color-scheme: dark)').matches

    const sim = simRef.current
    // background
    ctx.fillStyle = dark ? '#0e0f13' : '#eceef3'
    ctx.fillRect(0, 0, GRID_W * CELL, GRID_H * CELL)
    // cells
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
      const cell = sim.grid[sim.idx(x, y)]
      const conn = cell.type === 'dust' ? dustArms(sim, x, y) : undefined
      drawCell(ctx, cell, x, y, dark, conn)
    }
    // grid lines
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'
    ctx.lineWidth = 1
    for (let x = 0; x <= GRID_W; x++) { ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, GRID_H * CELL); ctx.stroke() }
    for (let y = 0; y <= GRID_H; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(GRID_W * CELL, y * CELL); ctx.stroke() }
  })

  // ── interaction ──────────────────────────────────────────────────────────────

  const cellFromEvent = useCallback((e: React.MouseEvent): [number, number] | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = Math.floor((e.clientX - rect.left) / (rect.width / GRID_W))
    const y = Math.floor((e.clientY - rect.top) / (rect.height / GRID_H))
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return null
    return [x, y]
  }, [])

  const applyTool = useCallback((x: number, y: number, override?: 'place' | 'erase') => {
    const sim = simRef.current
    const mode = override ?? (tool === 'erase' ? 'erase' : tool === 'interact' ? 'interact' : 'place')
    if (mode === 'erase') { sim.remove(x, y) }
    else if (mode === 'interact') { sim.interact(x, y) }
    else {
      let t = tool as BlockType
      if (t === ('wool' as BlockType)) t = `wool_${woolColor}` as BlockType
      sim.place(x, y, t, placeDir)
    }
    force()
  }, [tool, placeDir, woolColor])

  const onDown = useCallback((e: React.MouseEvent) => {
    const cell = cellFromEvent(e)
    if (!cell) return
    if (e.button === 2) { paintingRef.current = 'erase'; applyTool(cell[0], cell[1], 'erase'); return }
    if (tool === 'interact') { applyTool(cell[0], cell[1]); return }
    paintingRef.current = tool === 'erase' ? 'erase' : 'place'
    applyTool(cell[0], cell[1])
  }, [cellFromEvent, applyTool, tool])

  const onMove = useCallback((e: React.MouseEvent) => {
    if (!paintingRef.current) return
    // don't drag-paint dust over itself repeatedly for interact; only place/erase
    const cell = cellFromEvent(e)
    if (!cell) return
    applyTool(cell[0], cell[1], paintingRef.current)
  }, [cellFromEvent, applyTool])

  const endPaint = useCallback(() => { paintingRef.current = null }, [])

  // keyboard: R rotate, [ ] etc
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') setPlaceDir(d => ((d + 1) % 4) as Dir)
      if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p) }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [])

  function clearAll() {
    simRef.current = new RedstoneSim(GRID_W, GRID_H, { quasiConnectivity: qc })
    setPlaying(false)
    force()
  }

  // ── render ──────────────────────────────────────────────────────────────────

  const isWoolTool = tool === ('wool' as BlockType)

  return (
    <div className="section container">
      <div className="mb-6">
        <span className="badge-muted">Tool</span>
        <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>Redstone Playground</h1>
        <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
          A 2D top-down redstone sandbox with real signal-strength simulation, dust connection rules,
          pistons, and quasi-connectivity.
        </p>
      </div>

      <div className="flex flex-col xl:flex-row gap-5">
        {/* Palette */}
        <div className="xl:w-60 shrink-0 space-y-4">
          <div className="card space-y-3">
            {/* Tools */}
            <div className="flex gap-2">
              <ToolBtn active={tool === 'interact'} onClick={() => setTool('interact')} icon={<MousePointer2 className="w-4 h-4" />} label="Interact" />
              <ToolBtn active={tool === 'erase'} onClick={() => setTool('erase')} icon={<Eraser className="w-4 h-4" />} label="Erase" />
            </div>

            {PALETTE_GROUPS.map(group => (
              <div key={group.name}>
                <div className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'rgb(var(--muted))' }}>{group.name}</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {group.items.map(it => (
                    <button
                      key={it.type}
                      onClick={() => setTool(it.type)}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium text-left transition-all"
                      style={{
                        border: `1px solid ${tool === it.type ? 'rgb(var(--accent))' : 'rgb(var(--border))'}`,
                        background: tool === it.type ? 'rgb(var(--accent) / 0.1)' : 'transparent',
                        color: tool === it.type ? 'rgb(var(--accent))' : 'rgb(var(--text))',
                      }}
                    >
                      <Swatch type={it.type} />
                      <span className="truncate">{it.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* Wool */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'rgb(var(--muted))' }}>Wool</div>
              <div className="grid grid-cols-8 gap-1">
                {WOOL_COLORS.map(c => (
                  <button
                    key={c}
                    title={c}
                    onClick={() => { setWoolColor(c); setTool('wool' as BlockType) }}
                    className="aspect-square rounded"
                    style={{
                      background: WOOL_HEX[c],
                      outline: isWoolTool && woolColor === c ? '2px solid rgb(var(--accent))' : '1px solid rgba(0,0,0,0.2)',
                      outlineOffset: isWoolTool && woolColor === c ? '1px' : '0',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Direction / rotate */}
          {DIRECTIONAL.has(tool as BlockType) && (
            <div className="card flex items-center justify-between">
              <span className="text-sm" style={{ color: 'rgb(var(--muted))' }}>
                Facing: <span style={{ color: 'rgb(var(--text))' }}>{['North', 'East', 'South', 'West'][placeDir]}</span>
              </span>
              <button onClick={() => setPlaceDir(d => ((d + 1) % 4) as Dir)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium"
                style={{ border: '1px solid rgb(var(--border))', color: 'rgb(var(--text))' }}>
                <RotateCw className="w-3.5 h-3.5" /> Rotate (R)
              </button>
            </div>
          )}
        </div>

        {/* Canvas + controls */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Controls */}
          <div className="card flex flex-wrap items-center gap-3">
            <button onClick={() => setPlaying(p => !p)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: 'rgb(var(--accent))', color: 'rgb(var(--accent-fg,#fff))' }}>
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {playing ? 'Pause' : 'Play'}
            </button>
            <button onClick={() => { simRef.current.step(); force() }} disabled={playing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium disabled:opacity-40"
              style={{ border: '1px solid rgb(var(--border))', color: 'rgb(var(--text))' }}>
              <StepForward className="w-4 h-4" /> Step
            </button>

            <div className="flex items-center gap-1.5">
              <Gauge className="w-4 h-4" style={{ color: 'rgb(var(--muted))' }} />
              {SPEEDS.map((s, i) => (
                <button key={s.label} onClick={() => setSpeedIdx(i)}
                  className="px-2 py-1 rounded-lg text-xs font-medium"
                  style={{
                    border: `1px solid ${speedIdx === i ? 'rgb(var(--accent))' : 'rgb(var(--border))'}`,
                    background: speedIdx === i ? 'rgb(var(--accent) / 0.1)' : 'transparent',
                    color: speedIdx === i ? 'rgb(var(--accent))' : 'rgb(var(--muted))',
                  }}>{s.label}</button>
              ))}
            </div>

            <label className="flex items-center gap-1.5 text-sm cursor-pointer" style={{ color: 'rgb(var(--muted))' }}>
              <input type="checkbox" checked={qc} onChange={e => setQc(e.target.checked)} style={{ accentColor: 'rgb(var(--accent))' }} />
              Quasi-connectivity
            </label>

            <button onClick={clearAll}
              className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
              style={{ border: '1px solid rgb(var(--border))', color: 'rgb(var(--text))' }}>
              <Trash2 className="w-4 h-4" /> Clear
            </button>
          </div>

          {/* Canvas */}
          <div className="rounded-2xl overflow-auto" style={{ border: '1px solid rgb(var(--border))' }}>
            <canvas
              ref={canvasRef}
              onContextMenu={e => e.preventDefault()}
              onMouseDown={onDown}
              onMouseMove={onMove}
              onMouseUp={endPaint}
              onMouseLeave={endPaint}
              style={{ display: 'block', cursor: 'crosshair', imageRendering: 'pixelated' }}
            />
          </div>

          <p className="text-xs" style={{ color: 'rgb(var(--muted))' }}>
            Left-click to place · Right-click to erase · <b>Interact</b> tool toggles levers/buttons, cycles
            repeater delay, and flips comparator mode · <b>R</b> rotates · <b>Space</b> play/pause.
            A <b>straight</b> dust line pointing into a piston, TNT, or lamp powers it directly (the wire runs
            through the block). A <b>bent or branched</b> wire doesn't point in — feed those via a target block,
            lever, torch, block of redstone, or a powered solid block.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Small UI bits ────────────────────────────────────────────────────────────────

function ToolBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
      className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-all"
      style={{
        border: `1px solid ${active ? 'rgb(var(--accent))' : 'rgb(var(--border))'}`,
        background: active ? 'rgb(var(--accent) / 0.1)' : 'transparent',
        color: active ? 'rgb(var(--accent))' : 'rgb(var(--text))',
      }}>
      {icon}{label}
    </button>
  )
}

function Swatch({ type }: { type: BlockType }) {
  let bg = '#888'
  if (type === 'redstone_block') bg = '#c81e10'
  else if (type === 'dust') bg = '#a33'
  else if (type === 'torch') bg = '#ff3b30'
  else if (type === 'target') bg = '#d98a78'
  else if (type === 'tnt') bg = '#b13a2e'
  else if (type === 'cobblestone') bg = '#7d7d7d'
  else if (type === 'obsidian') bg = '#1a1326'
  else if (type === 'piston') bg = '#caa66a'
  else if (type === 'sticky_piston') bg = '#9ca84e'
  else if (type === 'redstone_lamp') bg = '#f6c66b'
  else if (type === 'lever' || type === 'button') bg = '#8a8f98'
  else if (type === 'repeater' || type === 'comparator') bg = '#b9bec6'
  return <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: bg, border: '1px solid rgba(0,0,0,0.25)' }} />
}
