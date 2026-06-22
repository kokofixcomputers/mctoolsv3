import { useState } from 'react'
import { ArrowLeftRight, Copy, Check } from 'lucide-react'

// ── Java Edition XP formulas ────────────────────────────────────────────────────
// Total experience points to reach a given level (cumulative).
function totalXpForLevel(level: number): number {
  if (level <= 16) return level * level + 6 * level
  if (level <= 31) return Math.round(2.5 * level * level - 40.5 * level + 360)
  return Math.round(4.5 * level * level - 162.5 * level + 2220)
}

// XP points required to advance from `level` to `level + 1`.
function xpToNextLevel(level: number): number {
  if (level <= 15) return 2 * level + 7
  if (level <= 30) return 5 * level - 38
  return 9 * level - 158
}

// Boundary totals (level 16 = 352, level 31 = 1507).
const T16 = totalXpForLevel(16)
const T31 = totalXpForLevel(31)

// Given a total number of XP points, find the whole level reached.
function levelFromXp(points: number): number {
  if (points <= 0) return 0
  let level: number
  if (points <= T16) {
    level = Math.sqrt(points + 9) - 3
  } else if (points <= T31) {
    level = (40.5 + Math.sqrt(1640.25 - 10 * (360 - points))) / 5
  } else {
    level = (162.5 + Math.sqrt(26406.25 - 18 * (2220 - points))) / 9
  }
  return Math.floor(level + 1e-9)
}

function fmt(n: number): string {
  return n.toLocaleString()
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200) }}
      className="btn-ghost p-1.5 flex items-center gap-1 text-xs"
    >
      {copied ? <><Check className="w-3.5 h-3.5" />Copied</> : <><Copy className="w-3.5 h-3.5" />Copy</>}
    </button>
  )
}

type Mode = 'level-to-xp' | 'xp-to-level'

export default function XpCalculatorPage() {
  const [mode, setMode] = useState<Mode>('level-to-xp')
  const [input, setInput] = useState('30')

  const raw = Number(input.trim())
  const valid = input.trim() !== '' && Number.isFinite(raw) && raw >= 0

  // ── Level → XP ──
  const level = Math.floor(raw)
  const totalAtLevel = totalXpForLevel(level)
  const costToNext = xpToNextLevel(level)

  // ── XP → Level ──
  const points = Math.floor(raw)
  const reachedLevel = levelFromXp(points)
  const totalAtReached = totalXpForLevel(reachedLevel)
  const intoLevel = points - totalAtReached
  const nextCost = xpToNextLevel(reachedLevel)
  const remaining = nextCost - intoLevel
  const progressPct = nextCost > 0 ? Math.min(100, (intoLevel / nextCost) * 100) : 0

  return (
    <div className="section container">
      <div className="mb-10">
        <span className="badge-muted">Tool</span>
        <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>XP Calculator</h1>
        <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
          Convert between Minecraft experience levels and total XP points (Java Edition).
        </p>
      </div>

      <div className="max-w-lg space-y-6">
        {/* Mode toggle */}
        <div className="card">
          <label className="form-label">Conversion</label>
          <div className="flex gap-2">
            {(['level-to-xp', 'xp-to-level'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setInput(m === 'level-to-xp' ? '30' : '1395') }}
                className="flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all"
                style={{
                  border: `1px solid ${mode === m ? 'rgb(var(--accent))' : 'rgb(var(--border))'}`,
                  backgroundColor: mode === m ? 'rgb(var(--accent) / 0.1)' : 'transparent',
                  color: mode === m ? 'rgb(var(--accent))' : 'rgb(var(--muted))',
                }}
              >
                {m === 'level-to-xp' ? 'Level → XP Points' : 'XP Points → Level'}
              </button>
            ))}
          </div>
        </div>

        {/* Input + result */}
        <div className="card space-y-4">
          <div>
            <label className="form-label">{mode === 'level-to-xp' ? 'Experience Level' : 'Total XP Points'}</label>
            <input
              className="form-input font-mono text-lg"
              type="number"
              min={0}
              placeholder={mode === 'level-to-xp' ? 'e.g. 30' : 'e.g. 1395'}
              value={input}
              onChange={e => setInput(e.target.value)}
              autoFocus
            />
          </div>

          {!valid ? (
            <div className="rounded-xl p-4 text-sm" style={{ backgroundColor: 'rgb(var(--border) / 0.3)', color: 'rgb(var(--muted))' }}>
              Enter a non-negative number.
            </div>
          ) : mode === 'level-to-xp' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <ArrowLeftRight className="w-4 h-4 shrink-0" style={{ color: 'rgb(var(--accent))' }} />
                <div className="flex-1">
                  <div className="text-xs mb-1" style={{ color: 'rgb(var(--muted))' }}>
                    Total XP points to reach level {level}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-2xl font-semibold" style={{ color: 'rgb(var(--text))' }}>
                      {fmt(totalAtLevel)}
                    </span>
                    <CopyBtn text={String(totalAtLevel)} />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Stat label={`XP for level ${level} → ${level + 1}`} value={`${fmt(costToNext)} pts`} />
                <Stat label="Orbs (avg ~7 each)" value={`~${Math.ceil(totalAtLevel / 7)}`} />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <ArrowLeftRight className="w-4 h-4 shrink-0" style={{ color: 'rgb(var(--accent))' }} />
                <div className="flex-1">
                  <div className="text-xs mb-1" style={{ color: 'rgb(var(--muted))' }}>
                    {fmt(points)} XP points reaches
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-2xl font-semibold" style={{ color: 'rgb(var(--text))' }}>
                      Level {reachedLevel}
                    </span>
                    <CopyBtn text={String(reachedLevel)} />
                  </div>
                </div>
              </div>

              {/* Progress bar to next level */}
              <div>
                <div className="flex justify-between text-xs mb-1" style={{ color: 'rgb(var(--muted))' }}>
                  <span>{fmt(intoLevel)} / {fmt(nextCost)} into level {reachedLevel}</span>
                  <span>{fmt(remaining)} to level {reachedLevel + 1}</span>
                </div>
                <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'rgb(var(--border) / 0.5)' }}>
                  <div className="h-full rounded-full" style={{ width: `${progressPct}%`, background: 'rgb(var(--accent))' }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Formula reference */}
        <div className="card text-sm space-y-2" style={{ color: 'rgb(var(--muted))' }}>
          <p className="font-semibold" style={{ color: 'rgb(var(--text))' }}>How it works (Java Edition)</p>
          <p>Total XP to reach a level:</p>
          <ul className="space-y-0.5 font-mono text-xs pl-3">
            <li>Levels 1–16: <span style={{ color: 'rgb(var(--accent))' }}>L² + 6L</span></li>
            <li>Levels 17–31: <span style={{ color: 'rgb(var(--accent))' }}>2.5L² − 40.5L + 360</span></li>
            <li>Levels 32+: <span style={{ color: 'rgb(var(--accent))' }}>4.5L² − 162.5L + 2220</span></li>
          </ul>
          <p className="pt-1">XP to advance one level:</p>
          <ul className="space-y-0.5 font-mono text-xs pl-3">
            <li>0–15: <span style={{ color: 'rgb(var(--accent))' }}>2L + 7</span></li>
            <li>16–30: <span style={{ color: 'rgb(var(--accent))' }}>5L − 38</span></li>
            <li>31+: <span style={{ color: 'rgb(var(--accent))' }}>9L − 158</span></li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ border: '1px solid rgb(var(--border))' }}>
      <div className="text-xs mb-0.5" style={{ color: 'rgb(var(--muted))' }}>{label}</div>
      <div className="font-mono text-sm font-semibold" style={{ color: 'rgb(var(--text))' }}>{value}</div>
    </div>
  )
}
