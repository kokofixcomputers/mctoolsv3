import { useState, useCallback } from 'react'
import { Copy, Check, AlertTriangle, FlaskConical, Shield } from 'lucide-react'
import { ORE_TYPES } from '../tools/ore_finder/finder'

const VERSIONS = ['1.21.8','1.21.7','1.21.6','1.21.5','1.21.4','1.21.2','1.21','1.20','1.19','1.18']
const SOFT_CAP = 5000 // recommended max; higher is allowed but warned

interface Cluster { x: number; y: number; z: number; ores: number }
interface Result {
  clusters_found: number; ores_found: number; clusters: Cluster[]
  seed_used: string; search_center?: { x: number; z: number }
  center_x?: number; center_z?: number; search_radius?: number; radius?: number
}

type Engine = 'stable' | 'beta'

const ENGINES: { id: Engine; label: string; desc: string; icon: typeof Shield }[] = [
  { id: 'stable', label: 'Stable',  desc: 'Battle-tested, 3rd-party WASM engine', icon: Shield },
  { id: 'beta',   label: 'Beta',    desc: "cubiomes fork's native ore generation, clustered into veins", icon: FlaskConical },
]

function CopyTpBtn({ cluster }: { cluster: Cluster }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(`/tp @s ${cluster.x} ${cluster.y} ${cluster.z}`)
    setCopied(true); setTimeout(() => setCopied(false), 1000)
  }, [cluster])
  return (
    <button onClick={copy} className="btn-primary px-4 py-1.5 text-xs flex items-center gap-1.5">
      {copied ? <><Check className="w-3 h-3" />Copied</> : <><Copy className="w-3 h-3" />Copy TP</>}
    </button>
  )
}

export default function OreFinderPage() {
  const [seed, setSeed] = useState('')
  const [x, setX] = useState('0')
  const [z, setZ] = useState('0')
  const [radius, setRadius] = useState('5')
  const [oreType, setOreType] = useState(4)
  const [edition, setEdition] = useState<'Java'|'Bedrock'>('Java')
  const [version, setVersion] = useState('1.21')
  const [engine, setEngine] = useState<Engine>('stable')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [sortBy, setSortBy] = useState<'near' | 'far' | 'most' | 'fewest'>('near')
  const [cap, setCap] = useState('200')
  // which engine produced the current result (so display rules don't change when toggling)
  const [resultEngine, setResultEngine] = useState<Engine>('stable')

  async function handleFind() {
    if (!seed.trim()) { setError('Please enter a seed'); return }
    setLoading(true); setError(''); setResult(null)
    try {
      if (engine === 'beta') {
        const { findOresBeta } = await import('../tools/ore_finder/betaFinder')
        const res = await findOresBeta(seed.trim(), parseInt(x) || 0, parseInt(z) || 0, parseInt(radius) || 5, oreType)
        // Beta engine result uses center_x/center_z/radius; normalise to common shape
        setResult({
          clusters_found: (res as any).clusters_found,
          ores_found: (res as any).ores_found,
          clusters: (res as any).clusters,
          seed_used: String((res as any).seed_used ?? seed),
          search_center: { x: (res as any).center_x ?? parseInt(x), z: (res as any).center_z ?? parseInt(z) },
          search_radius: (res as any).radius ?? parseInt(radius),
        })
      } else {
        const { findOres } = await import('../tools/ore_finder/finder')
        const res = await findOres(seed.trim(), parseInt(x)||0, parseInt(z)||0, parseInt(radius)||5, oreType, edition, version)
        setResult(res as any)
      }
      setResultEngine(engine)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed — check WASM files') }
    setLoading(false)
  }

  const centerX = result?.search_center?.x ?? result?.center_x
  const centerZ = result?.search_center?.z ?? result?.center_z
  const searchRadius = result?.search_radius ?? result?.radius

  // sort (both engines) + cap (Beta only) for display
  const displayClusters = (() => {
    if (!result) return []
    const cx = centerX ?? 0, cz = centerZ ?? 0
    const dist = (c: Cluster) => (c.x - cx) ** 2 + (c.z - cz) ** 2
    const arr = [...result.clusters]
    if (sortBy === 'near') arr.sort((a, b) => dist(a) - dist(b))
    else if (sortBy === 'far') arr.sort((a, b) => dist(b) - dist(a))
    else if (sortBy === 'most') arr.sort((a, b) => b.ores - a.ores)
    else arr.sort((a, b) => a.ores - b.ores)
    if (resultEngine === 'beta') {
      const n = Math.max(1, parseInt(cap) || 200)
      return arr.slice(0, n)
    }
    return arr
  })()

  return (
    <div className="section container">
      <div className="mb-10">
        <span className="badge-muted">Tool</span>
        <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>Ore Finder</h1>
        <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
          Find ore clusters in your Minecraft world using your seed.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">

          {/* Engine selector */}
          <div className="card">
            <label className="form-label mb-3">Engine</label>
            <div className="grid grid-cols-2 gap-2">
              {ENGINES.map(eng => {
                const Icon = eng.icon
                const active = engine === eng.id
                return (
                  <button
                    key={eng.id}
                    onClick={() => { setEngine(eng.id); setResult(null); setError('') }}
                    className="flex items-start gap-3 p-3 rounded-xl text-left transition-all"
                    style={{
                      border: `1px solid ${active ? 'rgb(var(--accent))' : 'rgb(var(--border))'}`,
                      backgroundColor: active ? 'rgb(var(--accent) / 0.08)' : 'transparent',
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{ backgroundColor: active ? 'rgb(var(--accent) / 0.15)' : 'rgb(var(--border) / 0.4)' }}
                    >
                      <Icon className="w-4 h-4" style={{ color: active ? 'rgb(var(--accent))' : 'rgb(var(--muted))' }} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold flex items-center gap-1.5" style={{ color: active ? 'rgb(var(--accent))' : 'rgb(var(--text))' }}>
                        {eng.label}
                        {eng.id === 'beta' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide"
                            style={{ backgroundColor: 'rgb(var(--accent) / 0.15)', color: 'rgb(var(--accent))' }}>
                            Beta
                          </span>
                        )}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'rgb(var(--muted))' }}>{eng.desc}</div>
                    </div>
                  </button>
                )
              })}
            </div>

            {engine === 'beta' && (
              <div className="mt-3 px-3 py-2 rounded-lg text-xs flex items-start gap-2"
                style={{ backgroundColor: 'rgb(var(--accent) / 0.06)', border: '1px solid rgb(var(--accent) / 0.2)', color: 'rgb(var(--muted))' }}>
                <FlaskConical className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'rgb(var(--accent))' }} />
                <span>
                  Powered by the <span className="font-mono">cubiomes</span> fork's native ore generation — the same
                  per-chunk seeding the game uses, clustered into veins. Java 1.21.11; version and edition selectors are not used in Beta mode.
                </span>
              </div>
            )}
          </div>

          <div className="card space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Seed</label>
                <input className="form-input" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="12345 or MySeed" />
              </div>
              <div>
                <label className="form-label">Ore Type</label>
                <select className="form-input" value={oreType} onChange={(e) => setOreType(parseInt(e.target.value))}>
                  {ORE_TYPES.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><label className="form-label">X</label><input type="number" className="form-input" value={x} onChange={(e) => setX(e.target.value)} /></div>
              <div><label className="form-label">Z</label><input type="number" className="form-input" value={z} onChange={(e) => setZ(e.target.value)} /></div>
              <div><label className="form-label">Radius (chunks)</label><input type="number" min={1} max={20} className="form-input" value={radius} onChange={(e) => setRadius(e.target.value)} /></div>
            </div>

            {engine === 'stable' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Edition</label>
                  <select className="form-input" value={edition} onChange={(e) => setEdition(e.target.value as 'Java'|'Bedrock')}>
                    <option>Java</option><option>Bedrock</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Version</label>
                  <select className="form-input" value={version} onChange={(e) => setVersion(e.target.value)}>
                    {VERSIONS.map((v) => <option key={v}>{v}</option>)}
                  </select>
                </div>
              </div>
            )}

            <button className="btn-primary w-full py-3" onClick={handleFind} disabled={loading}>
              {loading ? 'Searching…' : 'Find Ores'}
            </button>
            {error && <div className="alert-danger"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{error}</div>}
          </div>

          {result && (
            <div className="card">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <h3>Clusters Found</h3>
                  {engine === 'beta' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide"
                      style={{ backgroundColor: 'rgb(var(--accent) / 0.15)', color: 'rgb(var(--accent))' }}>
                      Beta
                    </span>
                  )}
                </div>
                <div className="flex gap-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold" style={{ color: 'rgb(var(--accent))' }}>{result.clusters_found}</div>
                    <div className="text-xs" style={{ color: 'rgb(var(--muted))' }}>Clusters</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold" style={{ color: 'rgb(var(--accent))' }}>{result.ores_found}</div>
                    <div className="text-xs" style={{ color: 'rgb(var(--muted))' }}>Total Ores</div>
                  </div>
                </div>
              </div>
              {/* Sort + cap controls */}
              <div className="flex flex-wrap items-end gap-3 mb-4">
                <div>
                  <label className="form-label">Sort by</label>
                  <select className="form-input text-sm !py-2" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
                    <option value="near">Closest first</option>
                    <option value="far">Farthest first</option>
                    <option value="most">Most ores</option>
                    <option value="fewest">Fewest ores</option>
                  </select>
                </div>
                {resultEngine === 'beta' && (
                  <div>
                    <label className="form-label">Max results</label>
                    <input type="number" min={1} className="form-input text-sm !py-2 w-28" value={cap} onChange={(e) => setCap(e.target.value)} />
                  </div>
                )}
                <span className="text-xs pb-2.5" style={{ color: 'rgb(var(--muted))' }}>
                  Showing {displayClusters.length} of {result.clusters_found}
                </span>
              </div>
              {resultEngine === 'beta' && (parseInt(cap) || 0) > SOFT_CAP && (
                <div className="alert-danger mb-4" style={{ backgroundColor: 'rgb(var(--warning) / 0.08)', color: 'rgb(var(--warning))', borderColor: 'rgb(var(--warning) / 0.25)' }}>
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Caps above {SOFT_CAP.toLocaleString()} are applied, but rendering that many rows can make the page sluggish.</span>
                </div>
              )}
              <div className="space-y-2 max-h-[460px] overflow-y-auto">
                {displayClusters.map((c, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl transition-all"
                    style={{ backgroundColor: 'rgb(var(--bg))', border: '1px solid rgb(var(--border))' }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgb(var(--accent) / 0.4)')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgb(var(--border))')}>
                    <div className="flex items-center gap-4">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold"
                        style={{ backgroundColor: 'rgb(var(--accent) / 0.1)', color: 'rgb(var(--accent))' }}>
                        {i + 1}
                      </div>
                      <div className="flex gap-2 font-mono text-sm">
                        {[['X', c.x], ['Y', c.y], ['Z', c.z]].map(([l, v]) => (
                          <span key={l as string} className="px-2 py-0.5 rounded-lg text-xs"
                            style={{ backgroundColor: 'rgb(var(--border) / 0.5)', color: 'rgb(var(--text))' }}>
                            {l}: {v}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: 'rgb(var(--accent) / 0.1)', color: 'rgb(var(--accent))' }}>
                        {c.ores} ore{c.ores !== 1 ? 's' : ''}
                      </span>
                      <CopyTpBtn cluster={c} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card text-sm">
            <h3 className="mb-3">How to use</h3>
            <ol className="space-y-1.5 list-decimal list-inside" style={{ color: 'rgb(var(--muted))' }}>
              <li>Choose your engine</li>
              <li>Enter your world seed</li>
              <li>Select the ore type</li>
              <li>Enter your coordinates</li>
              <li>Set search radius</li>
              <li>Click Find Ores</li>
            </ol>
          </div>

          <div className="card text-sm space-y-3">
            <h3>Engine Comparison</h3>
            <div className="space-y-2" style={{ color: 'rgb(var(--muted))' }}>
              <div className="flex items-start gap-2">
                <Shield className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'rgb(var(--accent))' }} />
                <div>
                  <span className="font-medium" style={{ color: 'rgb(var(--text))' }}>Stable</span>
                  <span> — supports all versions and Bedrock edition</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <FlaskConical className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'rgb(var(--accent))' }} />
                <div>
                  <span className="font-medium" style={{ color: 'rgb(var(--text))' }}>Beta</span>
                  <span> — Xpple's Cubiomes fork's Implementation. Faster.</span>
                </div>
              </div>
            </div>
          </div>

          {result && (
            <div className="card text-sm">
              <h3 className="mb-3">Search Info</h3>
              <div className="space-y-1.5" style={{ color: 'rgb(var(--muted))' }}>
                <div className="flex justify-between"><span>Seed</span><span className="font-mono" style={{ color: 'rgb(var(--text))' }}>{result.seed_used}</span></div>
                {centerX !== undefined && <div className="flex justify-between"><span>Center</span><span className="font-mono" style={{ color: 'rgb(var(--text))' }}>{centerX}, {centerZ}</span></div>}
                {searchRadius !== undefined && <div className="flex justify-between"><span>Radius</span><span style={{ color: 'rgb(var(--text))' }}>{searchRadius} chunks</span></div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
