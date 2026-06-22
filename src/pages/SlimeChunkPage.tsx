import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Download, Link, X, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react'

// ── Java LCG slime chunk algorithm ────────────────────────────────────────────
// Implements: new Random(seed + cx²×4987142 + cx×5947611 + cz²×4392871 + cz×389711 ^ 987234911).nextInt(10) == 0

function isSlimeChunk(worldSeed: bigint, cx: number, cz: number): boolean {
  const x = BigInt(cx)
  const z = BigInt(cz)
  const L = (n: bigint) => BigInt.asIntN(64, n)
  // Java operator precedence: XOR lower than +, so XOR applies to the whole sum
  const rSeed = L(L(worldSeed + x * x * 4987142n + x * 5947611n + z * z * 4392871n + z * 389711n) ^ 987234911n)
  // Java Random init: (seed ^ 0x5DEECE66DL) & ((1L << 48) - 1)
  let state = BigInt.asUintN(48, rSeed ^ 0x5DEECE66Dn)
  // next(31): state = (state * mult + add) & mask; return state >>> 17
  state = BigInt.asUintN(48, state * 0x5DEECE66Dn + 11n)
  return Number(state >> 17n) % 10 === 0
}

function parseSeedInput(raw: string): bigint {
  const t = raw.trim()
  if (!t) return 0n
  try { return BigInt.asIntN(64, BigInt(t)) } catch { return 0n }
}

function parseF3(raw: string): { x: number; z: number } | null {
  // Accepts "X / Y / Z" or "X Y Z" or just "X Z"
  const nums = raw.match(/-?\d+(\.\d+)?/g)
  if (!nums || nums.length < 2) return null
  if (nums.length >= 3) return { x: Math.floor(Number(nums[0])), z: Math.floor(Number(nums[2])) }
  return { x: Math.floor(Number(nums[0])), z: Math.floor(Number(nums[1])) }
}

// ── Cluster detection ─────────────────────────────────────────────────────────

function findClusters(slimeSet: Set<string>): Map<string, number> {
  // BFS connected components of adjacent slime chunks
  const clusterOf = new Map<string, number>()
  let id = 0
  for (const key of slimeSet) {
    if (clusterOf.has(key)) continue
    const [cx, cz] = key.split(',').map(Number)
    const queue = [[cx, cz]]
    const members: string[] = []
    while (queue.length) {
      const [x, z] = queue.pop()!
      const k = `${x},${z}`
      if (clusterOf.has(k)) continue
      clusterOf.set(k, id)
      members.push(k)
      for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nk = `${x+dx},${z+dz}`
        if (slimeSet.has(nk) && !clusterOf.has(nk)) queue.push([x+dx, z+dz])
      }
    }
    if (members.length < 2) {
      // singleton — remove from cluster map (solo chunks aren't "in a cluster")
      for (const m of members) clusterOf.delete(m)
    } else {
      id++
    }
  }
  return clusterOf
}

// ── Canvas renderer ───────────────────────────────────────────────────────────

const LABEL_PAD = 32
const COLORS = {
  slime:   '#4ade80',
  cluster: '#16a34a',
  swamp:   'rgba(168,85,247,0.18)',
  simRing: 'rgba(234,179,8,0.18)',
  simStroke: 'rgba(234,179,8,0.6)',
  center:  '#3b82f6',
  selected:'rgba(59,130,246,0.25)',
  grid:    'rgba(128,128,128,0.2)',
  label:   'rgba(128,128,128,0.8)',
  text:    '#fff',
}

interface DrawParams {
  canvas: HTMLCanvasElement
  seedBig: bigint
  centerCX: number
  centerCZ: number
  radius: number
  simDistance: number
  cellSize: number
  showClusters: boolean
  showGridLabels: boolean
  selectedChunk: { cx: number; cz: number } | null
  slimeSet: Set<string>
  clusterOf: Map<string, number>
  isDark: boolean
}

function drawGrid(p: DrawParams) {
  const { canvas, centerCX, centerCZ, radius, simDistance, cellSize,
          showClusters, showGridLabels, selectedChunk, slimeSet, clusterOf, isDark } = p
  const ctx = canvas.getContext('2d')!
  const w = LABEL_PAD + (2 * radius + 1) * cellSize
  const h = LABEL_PAD + (2 * radius + 1) * cellSize
  canvas.width = w
  canvas.height = h

  // Background
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = isDark ? 'rgba(15,15,25,0.0)' : 'rgba(245,245,255,0.0)'
  ctx.fillRect(0, 0, w, h)

  const chunkToPixel = (cx: number, cz: number) => ({
    px: LABEL_PAD + (cx - centerCX + radius) * cellSize,
    py: LABEL_PAD + (cz - centerCZ + radius) * cellSize,
  })

  // Sim distance circle
  const centerPx = LABEL_PAD + radius * cellSize + cellSize / 2
  const centerPy = LABEL_PAD + radius * cellSize + cellSize / 2
  const simR = simDistance * cellSize

  ctx.beginPath()
  ctx.arc(centerPx, centerPy, simR, 0, Math.PI * 2)
  ctx.fillStyle = COLORS.simRing
  ctx.fill()
  ctx.strokeStyle = COLORS.simStroke
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Grid lines
  ctx.strokeStyle = COLORS.grid
  ctx.lineWidth = 0.5
  for (let i = 0; i <= 2 * radius + 1; i++) {
    const x = LABEL_PAD + i * cellSize
    const y = LABEL_PAD + i * cellSize
    ctx.beginPath(); ctx.moveTo(x, LABEL_PAD); ctx.lineTo(x, h); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(LABEL_PAD, y); ctx.lineTo(w, y); ctx.stroke()
  }

  // Chunks
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      const cx = centerCX + dx
      const cz = centerCZ + dz
      const key = `${cx},${cz}`
      const { px, py } = chunkToPixel(cx, cz)
      const isSlime = slimeSet.has(key)
      const inCluster = showClusters && clusterOf.has(key)

      if (isSlime) {
        ctx.fillStyle = inCluster ? COLORS.cluster : COLORS.slime
        ctx.fillRect(px + 1, py + 1, cellSize - 2, cellSize - 2)
        // Label "S"
        if (cellSize >= 14) {
          ctx.fillStyle = COLORS.text
          ctx.font = `bold ${Math.min(10, cellSize * 0.5)}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('S', px + cellSize / 2, py + cellSize / 2)
        }
      }

      // Selected chunk highlight
      if (selectedChunk && cx === selectedChunk.cx && cz === selectedChunk.cz) {
        ctx.fillStyle = COLORS.selected
        ctx.fillRect(px + 1, py + 1, cellSize - 2, cellSize - 2)
        ctx.strokeStyle = COLORS.center
        ctx.lineWidth = 2
        ctx.strokeRect(px + 1.5, py + 1.5, cellSize - 3, cellSize - 3)
      }
    }
  }

  // Center marker (blue border on center chunk)
  const { px: cpx, py: cpy } = chunkToPixel(centerCX, centerCZ)
  ctx.strokeStyle = COLORS.center
  ctx.lineWidth = 2
  ctx.strokeRect(cpx + 1, cpy + 1, cellSize - 2, cellSize - 2)

  // Axis labels
  if (showGridLabels) {
    ctx.fillStyle = isDark ? 'rgba(180,180,200,0.9)' : 'rgba(60,60,80,0.9)'
    ctx.font = `${Math.max(9, Math.min(11, cellSize * 0.55))}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const step = Math.max(1, Math.ceil(4 / (cellSize / 20))) * 2  // label every N chunks
    for (let dx = -radius; dx <= radius; dx += step) {
      const cx = centerCX + dx
      const px = LABEL_PAD + (dx + radius) * cellSize + cellSize / 2
      ctx.fillText(String(cx), px, LABEL_PAD / 2)
    }
    ctx.textAlign = 'right'
    for (let dz = -radius; dz <= radius; dz += step) {
      const cz = centerCZ + dz
      const py = LABEL_PAD + (dz + radius) * cellSize + cellSize / 2
      ctx.fillText(String(cz), LABEL_PAD - 4, py)
    }
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SelectedChunkInfo {
  cx: number
  cz: number
  isSlime: boolean
  blockX1: number; blockX2: number
  blockZ1: number; blockZ2: number
  centerBlock: { x: number; z: number }
  adjacentSlime: { cx: number; cz: number }[]
  distFromCenter: number
  distFromSpawn: number
  withinSim: boolean
}

// ── CopyBtn ────────────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200) }}
      className="btn-ghost p-1 flex items-center gap-1 text-xs">
      {copied ? <><Check className="w-3 h-3" />Copied</> : <><Copy className="w-3 h-3" />Copy</>}
    </button>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

const SIM_PRESETS = [6, 8, 10, 12, 16]
const PACK_FORMATS_UNUSED = null as unknown as null // silence unused import warning
void PACK_FORMATS_UNUSED

export default function SlimeChunkPage() {
  const [seedInput, setSeedInput] = useState('12345')
  const [seedBig, setSeedBig] = useState(12345n)
  const [centerX, setCenterX] = useState(0)
  const [centerZ, setCenterZ] = useState(0)
  const [radius, setRadius] = useState(16)
  const [simDistance, setSimDistance] = useState(10)
  const [cellSize, setCellSize] = useState(20)
  const [showClusters, setShowClusters] = useState(false)
  const [showGridLabels, setShowGridLabels] = useState(true)
  const [selectedChunk, setSelectedChunk] = useState<{ cx: number; cz: number } | null>(null)
  const [f3Input, setF3Input] = useState('')
  const [swampOverlay, setSwampOverlay] = useState(false)
  const [showInfo, setShowInfo] = useState(true)
  const [platformExpanded, setPlatformExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const centerCX = Math.floor(centerX / 16)
  const centerCZ = Math.floor(centerZ / 16)

  // Compute slime set
  const { slimeSet, slimeCount } = useMemo(() => {
    const set = new Set<string>()
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const cx = centerCX + dx
        const cz = centerCZ + dz
        if (isSlimeChunk(seedBig, cx, cz)) set.add(`${cx},${cz}`)
      }
    }
    return { slimeSet: set, slimeCount: set.size }
  }, [seedBig, centerCX, centerCZ, radius])

  const clusterOf = useMemo(() => showClusters ? findClusters(slimeSet) : new Map<string, number>(), [slimeSet, showClusters])

  const totalChunks = (2 * radius + 1) ** 2

  // Draw canvas
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const isDark = document.documentElement.classList.contains('dark') ||
      window.matchMedia('(prefers-color-scheme: dark)').matches
    drawGrid({
      canvas, seedBig, centerCX, centerCZ, radius, simDistance,
      cellSize, showClusters, showGridLabels, selectedChunk,
      slimeSet, clusterOf, isDark,
    })
  }, [seedBig, centerCX, centerCZ, radius, simDistance, cellSize, showClusters, showGridLabels, selectedChunk, slimeSet, clusterOf])

  useEffect(() => { redraw() }, [redraw])

  // Canvas click → select chunk
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const px = (e.clientX - rect.left) * scaleX
    const py = (e.clientY - rect.top) * scaleY
    if (px < LABEL_PAD || py < LABEL_PAD) return
    const gx = Math.floor((px - LABEL_PAD) / cellSize)
    const gz = Math.floor((py - LABEL_PAD) / cellSize)
    if (gx < 0 || gx > 2 * radius || gz < 0 || gz > 2 * radius) return
    const cx = centerCX + gx - radius
    const cz = centerCZ + gz - radius
    setSelectedChunk(prev => prev?.cx === cx && prev?.cz === cz ? null : { cx, cz })
  }, [centerCX, centerCZ, radius, cellSize])

  // Selected chunk info
  const selInfo = useMemo((): SelectedChunkInfo | null => {
    if (!selectedChunk) return null
    const { cx, cz } = selectedChunk
    const isSlime = isSlimeChunk(seedBig, cx, cz)
    const blockX1 = cx * 16, blockX2 = cx * 16 + 15
    const blockZ1 = cz * 16, blockZ2 = cz * 16 + 15
    const centerBlock = { x: cx * 16 + 8, z: cz * 16 + 8 }
    const adjacentSlime = ([[-1,0],[1,0],[0,-1],[0,1]] as const)
      .map(([dx, dz]) => ({ cx: cx+dx, cz: cz+dz }))
      .filter(n => isSlimeChunk(seedBig, n.cx, n.cz))
    const distFromCenter = Math.sqrt((cx - centerCX) ** 2 + (cz - centerCZ) ** 2)
    const distFromSpawn = Math.sqrt(cx ** 2 + cz ** 2)
    const withinSim = distFromCenter <= simDistance
    return { cx, cz, isSlime, blockX1, blockX2, blockZ1, blockZ2, centerBlock, adjacentSlime, distFromCenter, distFromSpawn, withinSim }
  }, [selectedChunk, seedBig, centerCX, centerCZ, simDistance])

  // Platform grid (12×12 interior, 2-block margin, platforms every 2 blocks)
  const platformGrid = useMemo(() => {
    if (!selInfo) return []
    const { blockX1, blockZ1 } = selInfo
    const rows: string[][] = []
    for (let x = blockX1 + 2; x <= blockX1 + 13; x += 2) {
      const row: string[] = []
      for (let z = blockZ1 + 2; z <= blockZ1 + 13; z += 2) {
        row.push(`(${x},${z})`)
      }
      rows.push(row)
    }
    return rows
  }, [selInfo])

  // Handlers
  function handleGo() {
    setSeedBig(parseSeedInput(seedInput))
    setSelectedChunk(null)
  }

  function handleF3() {
    const r = parseF3(f3Input)
    if (r) { setCenterX(r.x); setCenterZ(r.z); setF3Input('') }
  }

  function exportJSON() {
    const chunks: { chunkX: number; chunkZ: number; blockX: number; blockZ: number }[] = []
    slimeSet.forEach(key => {
      const [cx, cz] = key.split(',').map(Number)
      chunks.push({ chunkX: cx, chunkZ: cz, blockX: cx * 16 + 8, blockZ: cz * 16 + 8 })
    })
    const blob = new Blob([JSON.stringify({ seed: seedInput, centerX, centerZ, radius, chunks }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `slime-chunks-${seedInput}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  function shareLink() {
    const params = new URLSearchParams({ seed: seedInput, x: String(centerX), z: String(centerZ), r: String(radius), sim: String(simDistance) })
    const url = `${location.origin}${location.pathname}?${params}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // Load from URL params on mount
  useEffect(() => {
    const p = new URLSearchParams(location.search)
    if (p.get('seed')) { const s = p.get('seed')!; setSeedInput(s); setSeedBig(parseSeedInput(s)) }
    if (p.get('x')) setCenterX(Number(p.get('x')))
    if (p.get('z')) setCenterZ(Number(p.get('z')))
    if (p.get('r')) setRadius(Number(p.get('r')))
    if (p.get('sim')) setSimDistance(Number(p.get('sim')))
  }, [])

  return (
    <div className="section container">
      {/* Header */}
      <div className="mb-8">
        <span className="badge-muted">Tool</span>
        <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>Slime Chunk Finder</h1>
        <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
          Find slime chunks in any Java Edition world using the exact Minecraft LCG algorithm.
        </p>
      </div>

      {/* Top section: inputs + stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Inputs */}
        <div className="card space-y-4">
          <div>
            <label className="form-label">World Seed</label>
            <div className="flex gap-2">
              <input
                className="form-input flex-1 font-mono"
                value={seedInput}
                onChange={e => setSeedInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleGo()}
                placeholder="Enter seed…"
              />
              <button
                onClick={handleGo}
                className="px-5 py-2 rounded-xl text-sm font-semibold"
                style={{ background: 'rgb(var(--accent))', color: 'rgb(var(--accent-fg,#fff))' }}
              >
                Go
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Center X (block)</label>
              <input type="number" className="form-input font-mono" value={centerX}
                onChange={e => setCenterX(Number(e.target.value))} />
            </div>
            <div>
              <label className="form-label">Center Z (block)</label>
              <input type="number" className="form-input font-mono" value={centerZ}
                onChange={e => setCenterZ(Number(e.target.value))} />
            </div>
          </div>

          <div>
            <label className="form-label">Quick Navigate</label>
            <div className="flex gap-2">
              <button
                onClick={() => { setCenterX(0); setCenterZ(0) }}
                className="flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all"
                style={{ border: '1px solid rgb(var(--border))', color: 'rgb(var(--muted))' }}
              >
                Spawn (0, 0)
              </button>
              {selectedChunk && (
                <button
                  onClick={() => { setCenterX(selectedChunk.cx * 16); setCenterZ(selectedChunk.cz * 16) }}
                  className="flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all"
                  style={{ border: '1px solid rgb(var(--accent))', color: 'rgb(var(--accent))' }}
                >
                  Center Selected
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="form-label">Paste F3 Coordinates</label>
            <div className="flex gap-2">
              <input
                className="form-input flex-1 font-mono text-sm"
                value={f3Input}
                onChange={e => setF3Input(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleF3()}
                placeholder="e.g. 123.45 / 67.89 / −234.56"
              />
              <button
                onClick={handleF3}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{ border: '1px solid rgb(var(--border))', color: 'rgb(var(--muted))' }}
              >
                Parse
              </button>
            </div>
          </div>
        </div>

        {/* Stats + info */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="card">
              <div className="text-sm mb-1" style={{ color: 'rgb(var(--muted))' }}>Slime Chunks</div>
              <div className="text-3xl font-bold" style={{ color: '#4ade80' }}>{slimeCount}</div>
              <div className="text-xs mt-0.5" style={{ color: 'rgb(var(--muted))' }}>
                {((slimeCount / totalChunks) * 100).toFixed(1)}% of visible
              </div>
            </div>
            <div className="card">
              <div className="text-sm mb-1" style={{ color: 'rgb(var(--muted))' }}>View Area</div>
              <div className="text-3xl font-bold" style={{ color: 'rgb(var(--text))' }}>{totalChunks}</div>
              <div className="text-xs mt-0.5" style={{ color: 'rgb(var(--muted))' }}>
                {2 * radius + 1}×{2 * radius + 1} chunks
              </div>
            </div>
          </div>

          <div className="card" style={{ border: '1px solid rgb(var(--accent) / 0.2)', background: 'rgb(var(--accent) / 0.04)' }}>
            <div className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'rgb(var(--accent))' }}>
              <span>💡</span> Slime Spawning Requirements
            </div>
            <ul className="text-xs space-y-1" style={{ color: 'rgb(var(--muted))' }}>
              <li>• Y-level: Below Y=40 (any light level)</li>
              <li>• Space: 2.04×2.04×2.04 block volume minimum</li>
              <li>• Distance: Player within simulation distance</li>
              <li>• Chunks: Must be a slime chunk (shown in green)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="card mb-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2">
            <label className="text-sm" style={{ color: 'rgb(var(--muted))' }}>Radius</label>
            <input
              type="number" min={4} max={64}
              className="form-input text-sm font-mono w-16"
              value={radius}
              onChange={e => setRadius(Math.max(4, Math.min(64, Number(e.target.value))))}
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm" style={{ color: 'rgb(var(--muted))' }}>Sim Distance</label>
            <div className="flex gap-1">
              {SIM_PRESETS.map(v => (
                <button
                  key={v}
                  onClick={() => setSimDistance(v)}
                  className="w-8 h-8 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: simDistance === v ? 'rgb(var(--accent))' : 'transparent',
                    color: simDistance === v ? 'rgb(var(--accent-fg,#fff))' : 'rgb(var(--muted))',
                    border: `1px solid ${simDistance === v ? 'rgb(var(--accent))' : 'rgb(var(--border))'}`,
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm" style={{ color: 'rgb(var(--muted))' }}>Cell Size</label>
            <input
              type="number" min={8} max={48} step={2}
              className="form-input text-sm font-mono w-16"
              value={cellSize}
              onChange={e => setCellSize(Math.max(8, Math.min(48, Number(e.target.value))))}
            />
          </div>

          <div className="flex items-center gap-4">
            {[
              { label: 'Show Clusters', val: showClusters, set: setShowClusters },
              { label: 'Grid Labels', val: showGridLabels, set: setShowGridLabels },
              { label: 'Swamp Overlay', val: swampOverlay, set: setSwampOverlay },
            ].map(({ label, val, set }) => (
              <label key={label} className="flex items-center gap-1.5 cursor-pointer text-sm" style={{ color: 'rgb(var(--muted))' }}>
                <input type="checkbox" checked={val} onChange={e => set(e.target.checked)}
                  className="rounded" style={{ accentColor: 'rgb(var(--accent))' }} />
                {label}
              </label>
            ))}
          </div>

          <div className="flex gap-2 ml-auto">
            <button onClick={exportJSON} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{ border: '1px solid rgb(var(--border))', color: 'rgb(var(--muted))' }}>
              <Download className="w-3.5 h-3.5" /> Export JSON
            </button>
            <button onClick={shareLink} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{ border: '1px solid rgb(var(--border))', color: 'rgb(var(--muted))' }}>
              {copied ? <><Check className="w-3.5 h-3.5" />Copied!</> : <><Link className="w-3.5 h-3.5" />Share Link</>}
            </button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="card mb-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {[
            { color: '#4ade80', label: 'Slime Chunk', fill: true },
            { color: '#16a34a', label: 'In Cluster', fill: true },
            { color: 'rgba(168,85,247,0.4)', label: 'Swamp Overlay', fill: true },
            { color: 'rgba(234,179,8,0.5)', label: 'Sim Range', fill: true },
            { color: '#3b82f6', label: 'Center', fill: false },
            { color: 'rgba(59,130,246,0.4)', label: 'Selected', fill: true },
          ].map(({ color, label, fill }) => (
            <div key={label} className="flex items-center gap-1.5 text-sm" style={{ color: 'rgb(var(--muted))' }}>
              <div
                className="w-4 h-4 rounded-sm"
                style={{
                  background: fill ? color : 'transparent',
                  border: `2px solid ${color}`,
                }}
              />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="rounded-2xl overflow-auto mb-4"
        style={{
          border: '1px solid rgb(var(--border))',
          background: 'rgb(var(--bg-card, var(--bg)))',
          maxHeight: 640,
        }}
      >
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          style={{ display: 'block', cursor: 'crosshair', imageRendering: 'pixelated' }}
        />
      </div>

      {/* Selected chunk panel */}
      {selInfo && (
        <div className="card mb-4 space-y-4" style={{ border: '1px solid rgb(var(--border))' }}>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold" style={{ color: 'rgb(var(--text))' }}>
                Selected Chunk ({selInfo.cx}, {selInfo.cz})
              </h2>
              {selInfo.isSlime ? (
                <span className="inline-flex items-center gap-1 text-sm font-medium px-2 py-0.5 rounded-full mt-1"
                  style={{ background: '#4ade8022', color: '#4ade80', border: '1px solid #4ade8044' }}>
                  ✓ Slime Chunk
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-sm font-medium px-2 py-0.5 rounded-full mt-1"
                  style={{ background: 'rgb(var(--border))', color: 'rgb(var(--muted))' }}>
                  Not a Slime Chunk
                </span>
              )}
            </div>
            <button onClick={() => setSelectedChunk(null)} style={{ color: 'rgb(var(--muted))' }}>
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Coordinates */}
            <div className="rounded-xl p-4 space-y-2" style={{ border: '1px solid rgb(var(--border))' }}>
              <div className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'rgb(var(--muted))' }}>Coordinates</div>
              <div>
                <div className="text-xs" style={{ color: 'rgb(var(--muted))' }}>Chunk Coords</div>
                <div className="font-mono font-bold" style={{ color: 'rgb(var(--text))' }}>X: {selInfo.cx}, Z: {selInfo.cz}</div>
              </div>
              <div>
                <div className="text-xs" style={{ color: 'rgb(var(--muted))' }}>Block Range X</div>
                <div className="font-mono font-bold" style={{ color: 'rgb(var(--text))' }}>{selInfo.blockX1} to {selInfo.blockX2}</div>
              </div>
              <div>
                <div className="text-xs" style={{ color: 'rgb(var(--muted))' }}>Block Range Z</div>
                <div className="font-mono font-bold" style={{ color: 'rgb(var(--text))' }}>{selInfo.blockZ1} to {selInfo.blockZ2}</div>
              </div>
              <div>
                <div className="text-xs" style={{ color: 'rgb(var(--muted))' }}>Center Block</div>
                <div className="font-mono font-bold" style={{ color: 'rgb(var(--text))' }}>{selInfo.centerBlock.x}, {selInfo.centerBlock.z}</div>
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(`${selInfo.centerBlock.x}, ${selInfo.centerBlock.z}`)}
                className="w-full mt-2 py-1.5 rounded-lg text-xs font-medium"
                style={{ border: '1px solid rgb(var(--border))', color: 'rgb(var(--muted))' }}
              >
                Copy Coordinates
              </button>
            </div>

            {/* Farm planning */}
            <div className="rounded-xl p-4 space-y-2" style={{ border: '1px solid rgb(var(--border))' }}>
              <div className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'rgb(var(--muted))' }}>Farm Planning</div>
              <div>
                <div className="text-xs" style={{ color: 'rgb(var(--muted))' }}>Adjacent Slime Chunks</div>
                <div className="text-3xl font-bold" style={{ color: selInfo.adjacentSlime.length > 0 ? '#4ade80' : 'rgb(var(--text))' }}>
                  {selInfo.adjacentSlime.length} / 4
                </div>
              </div>
              {selInfo.adjacentSlime.length > 0 && (
                <div>
                  <div className="text-xs mb-1" style={{ color: 'rgb(var(--muted))' }}>Neighbors</div>
                  {selInfo.adjacentSlime.map(n => (
                    <button
                      key={`${n.cx},${n.cz}`}
                      onClick={() => setSelectedChunk(n)}
                      className="block w-full text-left px-2 py-1 rounded-lg text-xs font-mono mb-1 transition-colors"
                      style={{ border: '1px solid rgb(var(--border))', color: 'rgb(var(--text))' }}
                    >
                      ({n.cx}, {n.cz})
                    </button>
                  ))}
                </div>
              )}
              <div className="rounded-lg p-2.5 mt-2 text-xs space-y-1" style={{ background: 'rgb(74 222 128 / 0.08)', border: '1px solid rgb(74 222 128 / 0.2)' }}>
                <div className="font-medium" style={{ color: '#4ade80' }}>Build Tips:</div>
                <div style={{ color: 'rgb(var(--muted))' }}>• Clear Y=0 to Y=39 fully</div>
                <div style={{ color: 'rgb(var(--muted))' }}>• Stack platforms every 3–4 blocks</div>
                <div style={{ color: 'rgb(var(--muted))' }}>• Use slabs for spawn surfaces</div>
                <div style={{ color: 'rgb(var(--muted))' }}>• Light level doesn't matter</div>
              </div>
            </div>

            {/* Distance */}
            <div className="rounded-xl p-4 space-y-3" style={{ border: '1px solid rgb(var(--border))' }}>
              <div className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'rgb(var(--muted))' }}>Distance</div>
              <div>
                <div className="text-xs" style={{ color: 'rgb(var(--muted))' }}>From Center ({centerCX}, {centerCZ})</div>
                <div className="text-2xl font-bold" style={{ color: 'rgb(var(--text))' }}>{selInfo.distFromCenter.toFixed(1)} chunks</div>
                <div className="text-xs" style={{ color: 'rgb(var(--muted))' }}>~{Math.round(selInfo.distFromCenter * 16)} blocks</div>
              </div>
              <div>
                <div className="text-xs" style={{ color: 'rgb(var(--muted))' }}>From Spawn (0, 0)</div>
                <div className="text-2xl font-bold" style={{ color: 'rgb(var(--text))' }}>{selInfo.distFromSpawn.toFixed(1)} chunks</div>
              </div>
              <div
                className="flex items-center gap-1.5 text-sm px-2 py-1.5 rounded-lg"
                style={{
                  background: selInfo.withinSim ? 'rgb(74 222 128 / 0.1)' : 'rgb(239 68 68 / 0.1)',
                  border: `1px solid ${selInfo.withinSim ? 'rgb(74 222 128 / 0.3)' : 'rgb(239 68 68 / 0.3)'}`,
                  color: selInfo.withinSim ? '#4ade80' : '#f87171',
                }}
              >
                {selInfo.withinSim ? '✓' : '✗'} {selInfo.withinSim ? 'Within' : 'Outside'} sim distance ({simDistance})
              </div>
            </div>
          </div>

          {/* Platform grid */}
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgb(var(--border))' }}>
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium"
              style={{ color: 'rgb(var(--text))', background: 'rgb(var(--bg) / 0.5)' }}
              onClick={() => setPlatformExpanded(p => !p)}
            >
              <span>SUGGESTED PLATFORM GRID (12×12 interior)</span>
              {platformExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {platformExpanded && (
              <div className="px-4 pb-4 pt-2">
                <div className="font-mono text-xs space-y-0.5" style={{ color: 'rgb(var(--muted))' }}>
                  {platformGrid.map((row, i) => (
                    <div key={i} className="flex flex-wrap gap-x-1">{row.map(c => <span key={c}>{c}</span>)}</div>
                  ))}
                </div>
                <p className="text-xs mt-3" style={{ color: 'rgb(var(--muted))' }}>
                  Place blocks at these coordinates for a 12×12 spawning platform with 2-block margins. Repeat on multiple Y-levels.
                </p>
                <CopyBtn text={platformGrid.map(row => row.join(' ')).join('\n')} />
              </div>
            )}
          </div>

          {/* Swamp overlay info */}
          {swampOverlay && (
            <details className="rounded-xl overflow-hidden" style={{ border: '1px solid rgb(var(--border))' }}>
              <summary className="px-4 py-3 text-sm font-medium cursor-pointer" style={{ color: 'rgb(var(--text))' }}>
                ▶ Advanced: Swamp Biome Overlay
              </summary>
              <div className="px-4 pb-4 pt-2 text-sm" style={{ color: 'rgb(var(--muted))' }}>
                <p>Slimes also spawn in swamp biomes between Y=51–69 at night when the moon is at least half-full. This is independent of chunk type.</p>
                <p className="mt-2">Swamp spawns don't require slime chunks — any swamp chunk works. Moon phase cycles every 8 Minecraft days.</p>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
