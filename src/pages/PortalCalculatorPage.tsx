import { useState } from 'react'
import { ArrowRightLeft, Copy, Check, Flame, Snowflake } from 'lucide-react'

// ── Helpers ──────────────────────────────────────────────────────────────────────

const owToNether = (n: number) => Math.floor(n / 8)
const netherToOw = (n: number) => n * 8

function num(s: string): number {
  const v = Number(s.trim())
  return Number.isFinite(v) ? v : 0
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200) }}
      className="btn-ghost p-1 flex items-center gap-1 text-xs"
    >
      {copied ? <><Check className="w-3 h-3" />Copied</> : <><Copy className="w-3 h-3" />Copy</>}
    </button>
  )
}

// ── Coordinate Converter ────────────────────────────────────────────────────────

function Converter() {
  // Overworld is the source of truth; Y is shared (not scaled).
  const [ox, setOx] = useState('0')
  const [oy, setOy] = useState('64')
  const [oz, setOz] = useState('0')

  // Derived nether values (string mirrors so the Nether fields are editable too).
  const nx = owToNether(num(ox))
  const ny = num(oy)
  const nz = owToNether(num(oz))

  const setNether = (axis: 'x' | 'z', v: string) => {
    const ow = String(netherToOw(num(v)))
    if (axis === 'x') setOx(ow); else setOz(ow)
  }

  const owStr = `${num(ox)} ${num(oy)} ${num(oz)}`
  const netherStr = `${nx} ${ny} ${nz}`

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2">
        <ArrowRightLeft className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} />
        <h2 className="font-semibold" style={{ color: 'rgb(var(--text))' }}>Coordinate Converter</h2>
      </div>
      <p className="text-sm" style={{ color: 'rgb(var(--muted))' }}>
        Edit either dimension — the other updates live (1 Nether block = 8 Overworld blocks; Y is unchanged).
      </p>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-center">
        {/* Overworld */}
        <div className="rounded-xl p-3 space-y-2" style={{ border: '1px solid rgb(var(--border))', background: 'rgb(80 200 120 / 0.05)' }}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold" style={{ color: '#3fb368' }}>Overworld</span>
            <CopyBtn text={owStr} />
          </div>
          <Axis label="X" value={ox} onChange={setOx} />
          <Axis label="Y" value={oy} onChange={setOy} />
          <Axis label="Z" value={oz} onChange={setOz} />
        </div>

        <div className="flex md:flex-col items-center justify-center" style={{ color: 'rgb(var(--muted))' }}>
          <ArrowRightLeft className="w-5 h-5" />
        </div>

        {/* Nether */}
        <div className="rounded-xl p-3 space-y-2" style={{ border: '1px solid rgb(var(--border))', background: 'rgb(220 70 50 / 0.05)' }}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold flex items-center gap-1" style={{ color: '#d9543b' }}>
              <Flame className="w-3.5 h-3.5" /> Nether
            </span>
            <CopyBtn text={netherStr} />
          </div>
          <Axis label="X" value={String(nx)} onChange={v => setNether('x', v)} />
          <Axis label="Y" value={String(ny)} onChange={v => setOy(v)} />
          <Axis label="Z" value={String(nz)} onChange={v => setNether('z', v)} />
        </div>
      </div>

      <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgb(var(--accent) / 0.06)', border: '1px solid rgb(var(--accent) / 0.15)', color: 'rgb(var(--muted))' }}>
        Build your portal in the Overworld at <span className="font-mono" style={{ color: 'rgb(var(--text))' }}>{owStr}</span>, then place the
        Nether portal at <span className="font-mono" style={{ color: 'rgb(var(--text))' }}>{netherStr}</span> for a perfect link.
      </div>
    </div>
  )
}

function Axis({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-4 text-xs font-mono" style={{ color: 'rgb(var(--muted))' }}>{label}</span>
      <input
        type="number"
        className="form-input text-sm font-mono py-1.5"
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </label>
  )
}

// ── Distance / Highway Calculator ────────────────────────────────────────────────

type Dim = 'overworld' | 'nether'

function dist3(dx: number, dy: number, dz: number) { return Math.sqrt(dx * dx + dy * dy + dz * dz) }

function DistanceCalc() {
  const [dim, setDim] = useState<Dim>('overworld')
  const [a, setA] = useState({ x: '0', y: '64', z: '0' })
  const [b, setB] = useState({ x: '1000', y: '64', z: '1000' })

  const ax = num(a.x), ay = num(a.y), az = num(a.z)
  const bx = num(b.x), by = num(b.y), bz = num(b.z)
  const dx = bx - ax, dy = by - ay, dz = bz - az

  // Distances in the entered dimension
  const straight = dist3(dx, dy, dz)
  const horizontal = Math.hypot(dx, dz)

  // Equivalent in the other dimension: horizontal axes scale by 8, Y is shared.
  const scale = dim === 'overworld' ? 1 / 8 : 8
  const otherDx = dx * scale, otherDz = dz * scale
  const otherStraight = dist3(otherDx, dy, otherDz)
  const otherHorizontal = Math.hypot(otherDx, otherDz)
  const otherLabel = dim === 'overworld' ? 'Nether' : 'Overworld'

  const linkLimit = dim === 'overworld' ? 1024 : 128
  const willLink = straight <= linkLimit

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold" style={{ color: 'rgb(var(--text))' }}>Distance &amp; Highway Calculator</h2>
        <div className="flex gap-1.5">
          {(['overworld', 'nether'] as const).map(d => (
            <button
              key={d}
              onClick={() => setDim(d)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-all"
              style={{
                border: `1px solid ${dim === d ? 'rgb(var(--accent))' : 'rgb(var(--border))'}`,
                background: dim === d ? 'rgb(var(--accent) / 0.1)' : 'transparent',
                color: dim === d ? 'rgb(var(--accent))' : 'rgb(var(--muted))',
              }}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm" style={{ color: 'rgb(var(--muted))' }}>
        Coordinates entered as <b style={{ color: 'rgb(var(--text))' }}>{dim}</b> positions.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <PointInput label="Origin" pt={a} onChange={setA} />
        <PointInput label="Destination" pt={b} onChange={setB} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label={`Straight (${dim})`} value={`${straight.toFixed(1)}`} unit="blocks" />
        <Metric label={`Horizontal (${dim})`} value={`${horizontal.toFixed(1)}`} unit="blocks" />
        <Metric label={`Straight (${otherLabel})`} value={`${otherStraight.toFixed(1)}`} unit="blocks" />
        <Metric label={`Highway in ${otherLabel}`} value={`${otherHorizontal.toFixed(1)}`} unit="blocks" />
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <DeltaCell axis="ΔX" v={dx} />
        <DeltaCell axis="ΔY" v={dy} />
        <DeltaCell axis="ΔZ" v={dz} />
      </div>

      {/* Link check */}
      <div
        className="rounded-xl px-4 py-3 text-sm flex items-center gap-2"
        style={{
          background: willLink ? 'rgb(74 222 128 / 0.1)' : 'rgb(245 158 11 / 0.1)',
          border: `1px solid ${willLink ? 'rgb(74 222 128 / 0.25)' : 'rgb(245 158 11 / 0.25)'}`,
          color: willLink ? '#3fb368' : '#d98a1e',
        }}
      >
        {willLink
          ? <>✓ Within the {linkLimit}-block {dim} link radius — portals at these points may link to each other.</>
          : <>⚠ Beyond the {linkLimit}-block {dim} link radius ({straight.toFixed(0)} blocks) — separate portals will stay independent.</>}
      </div>

      <div className="rounded-xl px-4 py-3 text-sm flex items-start gap-2" style={{ background: 'rgb(var(--accent) / 0.06)', border: '1px solid rgb(var(--accent) / 0.15)', color: 'rgb(var(--muted))' }}>
        <Snowflake className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'rgb(var(--accent))' }} />
        <span>
          A {otherLabel === 'Nether' ? 'Nether' : 'highway'} of <span className="font-mono" style={{ color: 'rgb(var(--text))' }}>{otherHorizontal.toFixed(0)}</span> blocks
          covers this {dim} trip{otherLabel === 'Nether' && <> — an <b>87.5%</b> shorter walk</>}. On blue ice
          (~72 blk/s in the Nether) that's roughly <span className="font-mono" style={{ color: 'rgb(var(--text))' }}>
          {dim === 'overworld' ? (otherHorizontal / 72).toFixed(1) : (horizontal / 72).toFixed(1)}s</span>.
        </span>
      </div>
    </div>
  )
}

function PointInput({ label, pt, onChange }: {
  label: string
  pt: { x: string; y: string; z: string }
  onChange: (p: { x: string; y: string; z: string }) => void
}) {
  return (
    <div className="rounded-xl p-3 space-y-2" style={{ border: '1px solid rgb(var(--border))' }}>
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgb(var(--muted))' }}>{label}</div>
      {(['x', 'y', 'z'] as const).map(ax => (
        <Axis key={ax} label={ax.toUpperCase()} value={pt[ax]} onChange={v => onChange({ ...pt, [ax]: v })} />
      ))}
    </div>
  )
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ border: '1px solid rgb(var(--border))' }}>
      <div className="text-xs mb-0.5" style={{ color: 'rgb(var(--muted))' }}>{label}</div>
      <div className="font-mono text-lg font-semibold leading-none" style={{ color: 'rgb(var(--text))' }}>{value}</div>
      <div className="text-xs mt-0.5" style={{ color: 'rgb(var(--muted))' }}>{unit}</div>
    </div>
  )
}

function DeltaCell({ axis, v }: { axis: string; v: number }) {
  return (
    <div className="rounded-lg px-3 py-2 flex items-center justify-between" style={{ border: '1px solid rgb(var(--border))' }}>
      <span className="text-xs font-mono" style={{ color: 'rgb(var(--muted))' }}>{axis}</span>
      <span className="font-mono font-semibold" style={{ color: 'rgb(var(--text))' }}>{v > 0 ? '+' : ''}{v}</span>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────────

export default function PortalCalculatorPage() {
  return (
    <div className="section container">
      <div className="mb-8">
        <span className="badge-muted">Tool</span>
        <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>Nether Portal Calculator</h1>
        <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
          Convert coordinates between the Overworld and Nether, check portal linking, and plan Nether highways.
        </p>
      </div>

      <div className="max-w-3xl space-y-5">
        <Converter />
        <DistanceCalc />

        <div className="card text-sm space-y-2" style={{ color: 'rgb(var(--muted))' }}>
          <p className="font-semibold" style={{ color: 'rgb(var(--text))' }}>Portal linking rules</p>
          <p>• Entering a portal searches for an existing one within <b>128 blocks</b> in the Nether (<b>1024</b> in the Overworld); the closest match is used, otherwise a new portal is generated.</p>
          <p>• To force a precise link, build both frames manually at the converted coordinates and remove any auto-generated portal.</p>
          <p>• Highways on the Nether roof (Y ≥ 128) avoid terrain and lava; 1 Nether block = 8 Overworld blocks, so they cut travel by up to 87.5%.</p>
        </div>
      </div>
    </div>
  )
}
