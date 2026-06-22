import { useMemo, useReducer, useState } from 'react'
import { Dices, Coins, RotateCcw, TrendingUp } from 'lucide-react'

// ── Java Edition piglin bartering loot table ────────────────────────────────────
// Each gold ingot yields exactly one entry, chosen by weight, then a random count
// within the entry's range. Weights/ranges follow the vanilla
// `minecraft:gameplay/piglin_bartering` loot table.

interface BarterEntry {
  id: string
  name: string
  emoji: string
  weight: number
  min: number
  max: number
  desc: string
  rare?: boolean
}

const TABLE: BarterEntry[] = [
  { id: 'soul_speed_book',  name: 'Soul Speed Book',                  emoji: '📕', weight: 5,  min: 1, max: 1,  desc: 'Enchanted book — best boots enchant', rare: true },
  { id: 'soul_speed_boots', name: 'Iron Boots (Soul Speed)',          emoji: '👢', weight: 8,  min: 1, max: 1,  desc: 'Pre-enchanted Soul Speed boots', rare: true },
  { id: 'splash_fire_res',  name: 'Splash Potion of Fire Resistance', emoji: '🧪', weight: 8,  min: 1, max: 1,  desc: '8:00 of Fire Resistance (splash)' },
  { id: 'fire_res',         name: 'Potion of Fire Resistance',        emoji: '🧪', weight: 8,  min: 1, max: 1,  desc: '8:00 of Fire Resistance' },
  { id: 'iron_nugget',      name: 'Iron Nugget',                      emoji: '⚙️', weight: 10, min: 10, max: 36, desc: 'Craft into iron ingots' },
  { id: 'ender_pearl',      name: 'Ender Pearl',                      emoji: '🟢', weight: 10, min: 2, max: 4,  desc: 'Essential for End access', rare: true },
  { id: 'string',           name: 'String',                          emoji: '🧵', weight: 20, min: 3, max: 9,  desc: 'Bows, fishing rods, wool' },
  { id: 'quartz',           name: 'Nether Quartz',                    emoji: '⬜', weight: 20, min: 5, max: 12, desc: 'Crafting & redstone components' },
  { id: 'nether_brick',     name: 'Nether Brick',                     emoji: '🧱', weight: 20, min: 2, max: 8,  desc: 'Nether brick blocks' },
  { id: 'spectral_arrow',   name: 'Spectral Arrow',                   emoji: '🏹', weight: 20, min: 6, max: 12, desc: 'Makes entities glow when hit' },
  { id: 'obsidian',         name: 'Obsidian',                         emoji: '🟪', weight: 40, min: 1, max: 1,  desc: 'Portals & enchanting tables', rare: true },
  { id: 'crying_obsidian',  name: 'Crying Obsidian',                  emoji: '💜', weight: 40, min: 1, max: 3,  desc: 'Respawn anchors', rare: true },
  { id: 'fire_charge',      name: 'Fire Charge',                      emoji: '🔥', weight: 40, min: 1, max: 1,  desc: 'Light fires & dispensers' },
  { id: 'leather',          name: 'Leather',                         emoji: '🟫', weight: 40, min: 2, max: 4,  desc: 'Armor and books' },
  { id: 'soul_sand',        name: 'Soul Sand',                       emoji: '🟤', weight: 40, min: 2, max: 8,  desc: 'Slows movement; Wither building' },
  { id: 'gravel',           name: 'Gravel',                          emoji: '⬛', weight: 40, min: 8, max: 16, desc: 'Mine for flint' },
  { id: 'blackstone',       name: 'Blackstone',                      emoji: '◼️', weight: 40, min: 8, max: 16, desc: 'Nether stone variant' },
]

const TOTAL_WEIGHT = TABLE.reduce((s, e) => s + e.weight, 0)
const BY_ID = new Map(TABLE.map(e => [e.id, e]))

function pickEntry(): BarterEntry {
  let r = Math.random() * TOTAL_WEIGHT
  for (const e of TABLE) { r -= e.weight; if (r < 0) return e }
  return TABLE[TABLE.length - 1]
}
const randCount = (e: BarterEntry) => Math.floor(Math.random() * (e.max - e.min + 1)) + e.min
const chance = (e: BarterEntry) => e.weight / TOTAL_WEIGHT

// ── Results state ────────────────────────────────────────────────────────────────

interface Tally { trades: number; items: number }
interface State { results: Record<string, Tally>; totalTrades: number }
type Action = { type: 'barter'; n: number } | { type: 'reset'; n: number } | { type: 'clear' }

function barterInto(results: Record<string, Tally>, n: number) {
  for (let i = 0; i < n; i++) {
    const e = pickEntry()
    const cur = results[e.id] ?? { trades: 0, items: 0 }
    results[e.id] = { trades: cur.trades + 1, items: cur.items + randCount(e) }
  }
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'barter': {
      const results = { ...state.results }
      barterInto(results, action.n)
      return { results, totalTrades: state.totalTrades + action.n }
    }
    case 'reset': {
      const results: Record<string, Tally> = {}
      barterInto(results, action.n)
      return { results, totalTrades: action.n }
    }
    case 'clear':
      return { results: {}, totalTrades: 0 }
  }
}

// ── Stat highlights (computed from the real weights) ────────────────────────────

const STAT_IDS = ['ender_pearl', 'soul_speed_book', 'obsidian', 'crying_obsidian', 'iron_nugget', 'string', 'spectral_arrow']

export default function PiglinBarterPage() {
  const [gold, setGold] = useState(64)
  const [state, dispatch] = useReducer(reducer, { results: {}, totalTrades: 0 })

  const sorted = useMemo(() =>
    Object.entries(state.results)
      .map(([id, t]) => ({ entry: BY_ID.get(id)!, ...t }))
      .sort((a, b) => b.items - a.items),
    [state.results])

  // Fire-resistance combined chance for the headline
  const fireResChance = chance(BY_ID.get('splash_fire_res')!) + chance(BY_ID.get('fire_res')!)

  return (
    <div className="section container">
      <div className="mb-8">
        <span className="badge-muted">Tool</span>
        <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>Piglin Bartering Simulator</h1>
        <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
          Roll piglin barters using Minecraft's real loot-table weights. Plan your gold before the Nether.
        </p>
      </div>

      {/* Headline odds */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8 max-w-3xl">
        <OddsCard label="Ender Pearl" pct={chance(BY_ID.get('ender_pearl')!)} />
        <OddsCard label="Soul Speed Book" pct={chance(BY_ID.get('soul_speed_book')!)} />
        <OddsCard label="Fire Resistance" pct={fireResChance} />
        <OddsCard label="Obsidian" pct={chance(BY_ID.get('obsidian')!)} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Controls + results */}
        <div className="lg:col-span-2 space-y-5">
          <div className="card space-y-4">
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="form-label">Gold Ingots to Trade</label>
                <input
                  type="number" min={1} max={100000}
                  className="form-input font-mono w-32"
                  value={gold}
                  onChange={e => setGold(Math.max(1, Math.min(100000, parseInt(e.target.value) || 1)))}
                />
              </div>
              <button
                onClick={() => dispatch({ type: 'reset', n: gold })}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: 'rgb(var(--accent))', color: 'rgb(var(--accent-fg,#fff))' }}
              >
                <Dices className="w-4 h-4" /> Simulate All
              </button>
              <button
                onClick={() => dispatch({ type: 'barter', n: 1 })}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
                style={{ border: '1px solid rgb(var(--border))', color: 'rgb(var(--text))' }}
              >
                <Coins className="w-4 h-4" /> Barter 1 Ingot
              </button>
              <button
                onClick={() => dispatch({ type: 'clear' })}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium"
                style={{ border: '1px solid rgb(var(--border))', color: 'rgb(var(--muted))' }}
              >
                <RotateCcw className="w-4 h-4" /> Reset
              </button>
            </div>
            <p className="text-xs" style={{ color: 'rgb(var(--muted))' }}>
              <b>Simulate All</b> trades your gold count in one go. <b>Barter 1 Ingot</b> adds a single trade to the
              running total. Each ingot yields exactly one stack from the loot table.
            </p>
          </div>

          {/* Results */}
          <div className="card">
            <h3 className="mb-3" style={{ color: 'rgb(var(--text))' }}>
              Bartering Results
              {state.totalTrades > 0 && (
                <span className="ml-2 text-sm font-normal" style={{ color: 'rgb(var(--muted))' }}>
                  {state.totalTrades.toLocaleString()} gold traded
                </span>
              )}
            </h3>

            {sorted.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center" style={{ color: 'rgb(var(--muted))' }}>
                <Coins className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">Set your gold count and hit Simulate All to start bartering.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sorted.map(({ entry, trades, items }) => (
                  <div key={entry.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                    style={{ border: `1px solid ${entry.rare ? 'rgb(var(--accent) / 0.3)' : 'rgb(var(--border))'}`, background: entry.rare ? 'rgb(var(--accent) / 0.04)' : 'transparent' }}>
                    <span className="text-2xl shrink-0">{entry.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold" style={{ color: 'rgb(var(--text))' }}>{entry.name}</span>
                        {entry.rare && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgb(var(--accent) / 0.12)', color: 'rgb(var(--accent))' }}>rare</span>}
                      </div>
                      <div className="text-xs truncate" style={{ color: 'rgb(var(--muted))' }}>{entry.desc}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono font-semibold" style={{ color: 'rgb(var(--text))' }}>{items.toLocaleString()}</div>
                      <div className="text-xs" style={{ color: 'rgb(var(--muted))' }}>
                        {trades} trade{trades !== 1 ? 's' : ''}
                        {entry.max > entry.min ? ` · ${entry.min}–${entry.max}/trade` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Statistics sidebar */}
        <div className="space-y-5">
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} />
              <h3 style={{ color: 'rgb(var(--text))' }}>Drop Odds</h3>
            </div>
            <div className="space-y-2.5">
              {STAT_IDS.map(id => {
                const e = BY_ID.get(id)!
                const p = chance(e)
                const got = state.results[id]?.trades ?? 0
                const observed = state.totalTrades > 0 ? (got / state.totalTrades) : null
                return (
                  <div key={id}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span style={{ color: 'rgb(var(--text))' }}>{e.emoji} {e.name}</span>
                      <span className="font-mono" style={{ color: 'rgb(var(--accent))' }}>{(p * 100).toFixed(2)}%</span>
                    </div>
                    <div className="flex items-center justify-between text-xs" style={{ color: 'rgb(var(--muted))' }}>
                      <span>~{Math.round(1 / p)} trades each</span>
                      {observed !== null && <span>you: {(observed * 100).toFixed(1)}%</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="card text-sm space-y-2" style={{ color: 'rgb(var(--muted))' }}>
            <p className="font-semibold flex items-center gap-1.5" style={{ color: 'rgb(var(--text))' }}>💡 Speedrun gold allocation</p>
            <p>• <b style={{ color: 'rgb(var(--text))' }}>Conservative</b> — 150 gold (~12–13 pearls)</p>
            <p>• <b style={{ color: 'rgb(var(--text))' }}>Balanced</b> — 200 gold (~16–18 pearls)</p>
            <p>• <b style={{ color: 'rgb(var(--text))' }}>Aggressive</b> — 300 gold (~24–27 pearls)</p>
            <p className="pt-1 text-xs">Wear gold armor so piglins stay neutral; only adult piglins barter.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function OddsCard({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="card text-center" style={{ padding: '1rem' }}>
      <div className="text-2xl font-bold" style={{ color: 'rgb(var(--accent))' }}>{(pct * 100).toFixed(1)}%</div>
      <div className="text-xs mt-0.5" style={{ color: 'rgb(var(--muted))' }}>{label}</div>
    </div>
  )
}
