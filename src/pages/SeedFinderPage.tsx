import { useState, useRef, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2, Search, Loader2, Copy, Check, MapPinned, X } from 'lucide-react'
import { STRUCTURES } from '../tools/seedmap/structures'

const VERSIONS = ['26.2', '26.1', '1.21.11', '1.21.9', '1.21.5', '1.21.4', '1.21.3', '1.21.1', '1.20.6', '1.20', '1.19.4', '1.18', '1.17', '1.16.5', '1.15', '1.14', '1.13', '1.12', '1.8', '1.7']
// Overworld region structures that can be searched for.
const STRUCT_OPTIONS = STRUCTURES.filter(s => s.dims.includes(0) && s.type >= 0)
const labelOf = (type: number) => STRUCT_OPTIONS.find(s => s.type === type)?.label ?? `#${type}`
const iconOf = (type: number) => STRUCT_OPTIONS.find(s => s.type === type)?.icon

interface Crit { type: number; within: number }
interface Result { seed: number; positions: { type: number; x: number; z: number }[] }

export default function SeedFinderPage() {
  const [version, setVersion] = useState('1.21.11')
  const [large, setLarge] = useState(false)
  const [searchRadius, setSearchRadius] = useState(2000)
  const [maxSeeds, setMaxSeeds] = useState('') // '' = infinite
  const [criteria, setCriteria] = useState<Crit[]>([
    { type: 5, within: 0 },      // anchor: village
    { type: 11, within: 500 },   // ruined portal within 500
  ])

  const [searching, setSearching] = useState(false)
  const [count, setCount] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const [exhausted, setExhausted] = useState(false)
  const [copied, setCopied] = useState(false)

  // Worker pool — one per CPU core for parallel searching.
  const workerCount = Math.max(1, Math.min(16, navigator.hardwareConcurrency || 4))
  const workersRef = useRef<Worker[]>([])
  const countsRef = useRef<number[]>([])
  const finishedRef = useRef(0)
  const foundRef = useRef(false)

  useEffect(() => {
    const workers: Worker[] = []
    for (let i = 0; i < workerCount; i++) {
      const w = new Worker(new URL('../tools/seedmap/seedFinderWorker.ts', import.meta.url), { type: 'module' })
      w.onmessage = (e: MessageEvent) => {
        const m = e.data
        if (m.type === 'progress') {
          countsRef.current[i] = m.count
          setCount(countsRef.current.reduce((a, b) => a + (b || 0), 0))
        } else if (m.type === 'found') {
          if (foundRef.current) return
          foundRef.current = true
          countsRef.current[i] = m.count
          setCount(countsRef.current.reduce((a, b) => a + (b || 0), 0))
          setResult({ seed: m.seed, positions: m.positions })
          setSearching(false)
          workers.forEach(x => x.postMessage({ type: 'stop' }))
        } else if (m.type === 'exhausted') {
          finishedRef.current++
          if (finishedRef.current >= workers.length && !foundRef.current) { setExhausted(true); setSearching(false) }
        }
      }
      workers.push(w)
    }
    workersRef.current = workers
    return () => { workers.forEach(w => w.terminate()); workersRef.current = [] }
  }, [workerCount])

  const start = useCallback(() => {
    setResult(null); setExhausted(false); setCount(0); setSearching(true)
    foundRef.current = false; finishedRef.current = 0
    countsRef.current = new Array(workersRef.current.length).fill(0)
    const base = Math.floor(Math.random() * 2 ** 32)
    const n = workersRef.current.length
    const totalMax = maxSeeds.trim() ? Math.max(1, parseInt(maxSeeds, 10) || 0) : 0
    const perWorkerMax = totalMax ? Math.ceil(totalMax / n) : 0
    workersRef.current.forEach((w, i) => {
      w.postMessage({
        type: 'start', version, large, searchRadius, criteria,
        maxSeeds: perWorkerMax,
        startSeed: (base + i) >>> 0,
        stride: n,
      })
    })
  }, [version, large, searchRadius, maxSeeds, criteria])

  const stop = useCallback(() => { workersRef.current.forEach(w => w.postMessage({ type: 'stop' })); setSearching(false) }, [])

  // ── criteria editing ───────────────────────────────────────────────────────────
  const addCrit = () => setCriteria(c => [...c, { type: STRUCT_OPTIONS[0].type, within: 100 }])
  const removeCrit = (i: number) => setCriteria(c => c.filter((_, j) => j !== i))
  const setCrit = (i: number, patch: Partial<Crit>) => setCriteria(c => c.map((x, j) => j === i ? { ...x, ...patch } : x))

  return (
    <div className="section container">
      <div className="mb-6">
        <span className="badge-muted">Tool</span>
        <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>Seed Finder</h1>
        <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
          Brute-force seeds for a cluster of structures near spawn. Build your criteria, hit search, and it churns through
          seeds until one matches. Powered by <span className="font-mono">cubiomes</span>.
        </p>
      </div>

      {/* Config */}
      <div className="card flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="form-label">Version</label>
          <select className="form-input text-sm" value={version} onChange={e => setVersion(e.target.value)}>
            {VERSIONS.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Anchor within (blocks of spawn)</label>
          <input type="number" min={100} step={100} className="form-input text-sm w-36" value={searchRadius} onChange={e => setSearchRadius(Math.max(100, Number(e.target.value)))} />
        </div>
        <div>
          <label className="form-label">Max seeds (blank = ∞)</label>
          <input className="form-input text-sm w-36 font-mono" value={maxSeeds} onChange={e => setMaxSeeds(e.target.value.replace(/[^0-9]/g, ''))} placeholder="∞" />
        </div>
        <label className="flex items-center gap-1.5 text-sm cursor-pointer pb-1.5" style={{ color: 'rgb(var(--muted))' }}>
          <input type="checkbox" checked={large} onChange={e => setLarge(e.target.checked)} style={{ accentColor: 'rgb(var(--accent))' }} />
          Large Biomes
        </label>
      </div>

      {/* Criteria */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 style={{ color: 'rgb(var(--text))' }}>Criteria</h3>
          <button onClick={addCrit} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium" style={{ border: '1px solid rgb(var(--accent))', color: 'rgb(var(--accent))' }}>
            <Plus className="w-3.5 h-3.5" /> Add structure
          </button>
        </div>
        <div className="space-y-2">
          {criteria.map((c, i) => (
            <div key={i} className="flex items-center gap-2 flex-wrap">
              <span className="text-xs w-16 shrink-0" style={{ color: i === 0 ? 'rgb(var(--accent))' : 'rgb(var(--muted))' }}>{i === 0 ? 'Anchor' : `#${i + 1}`}</span>
              {iconOf(c.type) && <img src={iconOf(c.type)} alt="" width={18} height={18} style={{ imageRendering: 'pixelated' }} />}
              <select className="form-input text-sm" value={c.type} onChange={e => setCrit(i, { type: Number(e.target.value) })} style={{ minWidth: 150 }}>
                {STRUCT_OPTIONS.map(s => <option key={`${s.type}-${s.label}`} value={s.type}>{s.label}</option>)}
              </select>
              {i === 0 ? (
                <span className="text-xs" style={{ color: 'rgb(var(--muted))' }}>near spawn (anchor of the cluster)</span>
              ) : (
                <span className="flex items-center gap-1.5 text-sm" style={{ color: 'rgb(var(--muted))' }}>
                  within
                  <input type="number" min={1} step={50} className="form-input text-sm w-24" value={c.within} onChange={e => setCrit(i, { within: Math.max(1, Number(e.target.value)) })} />
                  blocks of anchor
                </span>
              )}
              {criteria.length > 1 && (
                <button onClick={() => removeCrit(i)} className="btn-ghost p-1 ml-auto" style={{ color: 'rgb(var(--muted))' }}><Trash2 className="w-3.5 h-3.5" /></button>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs mt-3" style={{ color: 'rgb(var(--muted))' }}>
          The anchor must generate within {searchRadius} blocks of spawn; every other structure must be within its distance of the anchor.
          Duplicate types match distinct structures. <b style={{ color: 'rgb(var(--text))' }}>Use realistic distances</b> — same-type structures are
          region-spaced hundreds of blocks apart, so e.g. two villages within 100 blocks essentially never generates.
        </p>
      </div>

      {/* Action */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={start} disabled={searching}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
          style={{ background: 'rgb(var(--accent))', color: 'rgb(var(--accent-fg,#fff))' }}>
          <Search className="w-4 h-4" /> Find seed
        </button>
        {exhausted && <span className="text-sm" style={{ color: '#d98a1e' }}>Searched {count.toLocaleString()} seeds — no match. Loosen the criteria or raise the limit.</span>}
      </div>

      {/* Result */}
      {result && (
        <div className="card">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <div className="text-xs uppercase tracking-wide" style={{ color: 'rgb(var(--muted))' }}>Match found after {count.toLocaleString()} seeds</div>
              <div className="text-2xl font-bold font-mono" style={{ color: 'rgb(var(--text))' }}>{result.seed}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={async () => { await navigator.clipboard.writeText(String(result.seed)); setCopied(true); setTimeout(() => setCopied(false), 1200) }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium" style={{ border: '1px solid rgb(var(--border))', color: 'rgb(var(--text))' }}>
                {copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy seed</>}
              </button>
              <Link to={`/seed-map?seed=${result.seed}&v=${encodeURIComponent(version)}&x=${result.positions[0].x}&z=${result.positions[0].z}`}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
                style={{ background: 'rgb(var(--accent))', color: 'rgb(var(--accent-fg,#fff))' }}>
                <MapPinned className="w-4 h-4" /> Open in Seed Map
              </Link>
            </div>
          </div>
          <div className="space-y-1.5">
            {result.positions.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                {iconOf(p.type) && <img src={iconOf(p.type)} alt="" width={16} height={16} style={{ imageRendering: 'pixelated' }} />}
                <span style={{ color: 'rgb(var(--text))' }}>{labelOf(p.type)}</span>
                <span className="font-mono text-xs" style={{ color: 'rgb(var(--muted))' }}>x {p.x} · z {p.z}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Searching overlay */}
      {searching && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ background: 'rgba(10,10,18,0.55)', backdropFilter: 'blur(10px)' }}>
          <Loader2 className="w-12 h-12 animate-spin mb-5" style={{ color: 'rgb(var(--accent))' }} />
          <div className="text-2xl font-semibold mb-1" style={{ color: '#fff' }}>Finding seeds…</div>
          <div className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Total seeds searched: <span className="font-mono font-bold" style={{ color: '#fff' }}>{count.toLocaleString()}</span>
          </div>
          <div className="text-xs mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>across {workerCount} CPU thread{workerCount > 1 ? 's' : ''}</div>
          <button onClick={stop} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: '#ef4444', color: '#fff' }}>
            <X className="w-4 h-4" /> Stop
          </button>
        </div>
      )}
    </div>
  )
}
