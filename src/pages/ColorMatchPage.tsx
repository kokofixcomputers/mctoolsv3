import { useState, useMemo } from 'react'
import { Pipette, FlaskConical } from 'lucide-react'
import { BlockThumb } from '../components/BlockRenderer'
import { ALL_BLOCKS } from '../tools/colorMatch/allBlocks'

const VERSION = '1.21.11'

// ── Curated wool/concrete palette (averaged from actual textures) ─────────────

interface McColor { key: string; name: string; concrete: [number,number,number]; wool: [number,number,number] }

const MC_COLORS: McColor[] = [
  { key: 'white',      name: 'White',      concrete: [207,213,214], wool: [233,236,236] },
  { key: 'orange',     name: 'Orange',     concrete: [224,97,0],    wool: [240,118,19]  },
  { key: 'magenta',    name: 'Magenta',    concrete: [169,48,159],  wool: [189,68,179]  },
  { key: 'light_blue', name: 'Light Blue', concrete: [35,137,198],  wool: [58,175,217]  },
  { key: 'yellow',     name: 'Yellow',     concrete: [240,175,21],  wool: [248,197,39]  },
  { key: 'lime',       name: 'Lime',       concrete: [94,168,24],   wool: [112,185,25]  },
  { key: 'pink',       name: 'Pink',       concrete: [213,101,142], wool: [237,141,172] },
  { key: 'gray',       name: 'Gray',       concrete: [54,57,61],    wool: [62,68,71]    },
  { key: 'light_gray', name: 'Light Gray', concrete: [125,125,115], wool: [142,142,134] },
  { key: 'cyan',       name: 'Cyan',       concrete: [21,119,136],  wool: [21,137,145]  },
  { key: 'purple',     name: 'Purple',     concrete: [100,31,156],  wool: [121,42,172]  },
  { key: 'blue',       name: 'Blue',       concrete: [44,46,143],   wool: [53,57,157]   },
  { key: 'brown',      name: 'Brown',      concrete: [96,59,31],    wool: [114,71,40]   },
  { key: 'green',      name: 'Green',      concrete: [73,91,36],    wool: [84,109,27]   },
  { key: 'red',        name: 'Red',        concrete: [142,32,32],   wool: [160,39,34]   },
  { key: 'black',      name: 'Black',      concrete: [8,10,15],     wool: [20,21,25]    },
]

// ── Color math ────────────────────────────────────────────────────────────────

function srgbToLab(r: number, g: number, b: number): [number,number,number] {
  const lin = (c: number) => { const s = c/255; return s <= 0.04045 ? s/12.92 : Math.pow((s+0.055)/1.055, 2.4) }
  const rl = lin(r), gl = lin(g), bl = lin(b)
  const X = (rl*0.4124564 + gl*0.3575761 + bl*0.1804375) / 0.95047
  const Y = (rl*0.2126729 + gl*0.7151522 + bl*0.0721750) / 1.00000
  const Z = (rl*0.0193339 + gl*0.1191920 + bl*0.9503041) / 1.08883
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787*t + 16/116
  return [116*f(Y)-16, 500*(f(X)-f(Y)), 200*(f(Y)-f(Z))]
}

function deltaE([L1,a1,b1]: [number,number,number], [L2,a2,b2]: [number,number,number]) {
  return Math.sqrt((L1-L2)**2 + (a1-a2)**2 + (b1-b2)**2)
}

function hexToRgb(hex: string): [number,number,number] | null {
  const clean = hex.replace('#','')
  if (clean.length !== 6) return null
  const n = parseInt(clean, 16)
  if (isNaN(n)) return null
  return [(n>>16)&255, (n>>8)&255, n&255]
}

function rgbToHex([r,g,b]: [number,number,number]) {
  return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('')
}

function pretty(name: string) {
  return name.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ── Types ─────────────────────────────────────────────────────────────────────

type BlockType = 'both' | 'concrete' | 'wool'

interface Match {
  blockId: string
  displayName: string
  rgb: [number,number,number]
  dE: number
}

const BETA_SHOW = 48   // how many blocks to display in beta grid

// Pre-compute Lab for ALL_BLOCKS once at module load (avoids recomputing per keystroke)
const ALL_BLOCKS_LAB = ALL_BLOCKS.map(b => ({ ...b, lab: srgbToLab(...b.rgb) }))

// ── Component ─────────────────────────────────────────────────────────────────

export default function ColorMatchPage() {
  const [hex, setHex] = useState('#3a8fd4')
  const [filter, setFilter] = useState<BlockType>('both')
  const [beta, setBeta] = useState(false)

  const rgb = useMemo(() => hexToRgb(hex), [hex])
  const inputLab = useMemo(() => rgb ? srgbToLab(...rgb) : null, [rgb])

  // Normal mode: wool + concrete only
  const normalMatches = useMemo((): Match[] => {
    if (!inputLab) return []
    const out: Match[] = []
    for (const color of MC_COLORS) {
      if (filter !== 'wool') out.push({ blockId: `${color.key}_concrete`, displayName: `${color.name} Concrete`, rgb: color.concrete, dE: deltaE(inputLab, srgbToLab(...color.concrete)) })
      if (filter !== 'concrete') out.push({ blockId: `${color.key}_wool`,     displayName: `${color.name} Wool`,     rgb: color.wool,     dE: deltaE(inputLab, srgbToLab(...color.wool))     })
    }
    return out.sort((a,b) => a.dE - b.dE)
  }, [inputLab, filter])

  // Beta mode: all 1082 blocks, top BETA_SHOW
  const betaMatches = useMemo((): Match[] => {
    if (!inputLab || !beta) return []
    return ALL_BLOCKS_LAB
      .map(b => ({ blockId: b.name, displayName: pretty(b.name), rgb: b.rgb, dE: deltaE(inputLab, b.lab) }))
      .sort((a,b) => a.dE - b.dE)
      .slice(0, BETA_SHOW)
  }, [inputLab, beta])

  const matches = beta ? betaMatches : normalMatches
  const best = matches[0]

  function handleHexInput(val: string) {
    setHex(val.startsWith('#') ? val : '#' + val)
  }

  return (
    <div className="section container">
      <div className="mb-8">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="badge-accent"><Pipette className="w-3.5 h-3.5" /> Color Tools</span>
          {beta && <span className="badge-warning flex items-center gap-1"><FlaskConical className="w-3 h-3" /> Beta</span>}
        </div>
        <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>Block Color Matcher</h1>
        <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
          Enter any color and find the closest Minecraft block by perceptual similarity (CIE ΔE).
        </p>
      </div>

      <div className="grid lg:grid-cols-[340px_1fr] gap-6 items-start">
        {/* Left panel */}
        <div className="space-y-4">
          <div className="card">
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'rgb(var(--muted))' }}>
              Your Color
            </p>

            {/* Color swatch + hex input */}
            <div className="flex items-center gap-3 mb-5">
              <label className="relative cursor-pointer flex-shrink-0">
                <input type="color"
                  value={hex.length === 7 && hex.startsWith('#') ? hex : '#3a8fd4'}
                  onChange={e => setHex(e.target.value)}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                />
                <div className="w-14 h-14 rounded-xl border-2 transition-all"
                  style={{ background: rgb ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : '#ccc', borderColor: 'rgb(var(--border))' }} />
              </label>
              <div className="flex-1">
                <input type="text" value={hex} onChange={e => handleHexInput(e.target.value)}
                  maxLength={7} className="form-input font-mono uppercase text-sm w-full"
                  placeholder="#RRGGBB" spellCheck={false} />
                {rgb && <p className="text-xs mt-1.5" style={{ color: 'rgb(var(--muted))' }}>rgb({rgb[0]}, {rgb[1]}, {rgb[2]})</p>}
              </div>
            </div>

            {/* Block type filter (normal mode only) */}
            {!beta && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'rgb(var(--muted))' }}>Block Type</p>
                <div className="flex gap-2 mb-5">
                  {(['both','concrete','wool'] as BlockType[]).map(t => (
                    <button key={t} onClick={() => setFilter(t)}
                      className="flex-1 py-1.5 rounded-lg text-sm font-medium capitalize transition-all"
                      style={{
                        background: filter === t ? 'rgb(var(--accent))' : 'rgb(var(--accent) / 0.08)',
                        color: filter === t ? 'rgb(var(--accent-fg))' : 'rgb(var(--accent))',
                      }}>
                      {t}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Beta toggle */}
            <div className="rounded-xl p-3 flex items-center justify-between gap-3"
              style={{ border: `1px solid ${beta ? 'rgb(var(--warning) / 0.4)' : 'rgb(var(--border))'}`, background: beta ? 'rgb(var(--warning) / 0.06)' : 'transparent' }}>
              <div>
                <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: beta ? 'rgb(var(--warning))' : 'rgb(var(--text))' }}>
                  <FlaskConical className="w-3.5 h-3.5" /> All Blocks Beta
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'rgb(var(--muted))' }}>
                  Match against all {ALL_BLOCKS.length} block textures
                </p>
              </div>
              <button onClick={() => setBeta(v => !v)}
                className="w-11 h-6 rounded-full transition-all flex-shrink-0 relative"
                style={{ background: beta ? 'rgb(var(--warning))' : 'rgb(var(--border))' }}>
                <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow"
                  style={{ left: beta ? '22px' : '2px' }} />
              </button>
            </div>
          </div>

          {/* Best match hero */}
          {best && (
            <div className="card text-center">
              <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'rgb(var(--muted))' }}>
                Best Match
              </p>
              <div className="flex justify-center mb-3">
                <BlockThumb name={best.blockId} version={VERSION} size={120} />
              </div>
              <p className="font-bold text-lg leading-tight" style={{ color: 'rgb(var(--text))' }}>
                {best.displayName}
              </p>
              <p className="text-sm font-mono mt-1" style={{ color: 'rgb(var(--muted))' }}>
                {rgbToHex(best.rgb)}
              </p>
              <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                style={{ background: 'rgb(var(--accent) / 0.1)', color: 'rgb(var(--accent))' }}>
                ΔE = {best.dE.toFixed(1)}
                <span style={{ color: 'rgb(var(--muted))' }}>·</span>
                {best.dE < 5 ? 'Near-perfect' : best.dE < 15 ? 'Good match' : best.dE < 30 ? 'Approximate' : 'Distant'}
              </div>

              <div className="flex mt-4 rounded-xl overflow-hidden h-10">
                <div className="flex-1" style={{ background: rgb ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : '#ccc' }} />
                <div className="flex-1" style={{ background: `rgb(${best.rgb[0]},${best.rgb[1]},${best.rgb[2]})` }} />
              </div>
              <div className="flex text-xs mt-1" style={{ color: 'rgb(var(--muted))' }}>
                <span className="flex-1">Your color</span>
                <span className="flex-1">Block avg</span>
              </div>
            </div>
          )}
        </div>

        {/* Results grid */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgb(var(--muted))' }}>
              {beta ? `Top ${BETA_SHOW} of ${ALL_BLOCKS.length} blocks` : 'All Blocks'} — sorted by closeness
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {matches.map((m, i) => (
              <div key={m.blockId}
                className="rounded-xl p-3 flex flex-col items-center gap-2 transition-all"
                style={{
                  border: `1px solid ${i === 0 ? 'rgb(var(--accent))' : 'rgb(var(--border))'}`,
                  background: i === 0 ? 'rgb(var(--accent) / 0.05)' : 'transparent',
                }}>
                <BlockThumb name={m.blockId} version={VERSION} size={72} />
                <div className="text-center w-full">
                  <p className="text-xs font-semibold leading-tight" style={{ color: i === 0 ? 'rgb(var(--accent))' : 'rgb(var(--text))' }}>
                    {m.displayName}
                  </p>
                  <div className="w-full h-2 rounded mt-1.5" style={{ background: `rgb(${m.rgb[0]},${m.rgb[1]},${m.rgb[2]})` }} />
                  <p className="text-xs mt-1 font-mono" style={{ color: 'rgb(var(--muted))' }}>ΔE {m.dE.toFixed(1)}</p>
                </div>
              </div>
            ))}
          </div>

          {beta && (
            <p className="text-xs mt-4 text-center" style={{ color: 'rgb(var(--muted))' }}>
              Note: some textures use biome tinting (leaves, grass) — their raw average color will differ from how they look in-game.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
