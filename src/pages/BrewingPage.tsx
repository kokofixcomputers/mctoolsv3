import { useState, useEffect, useRef } from 'react'
import { ArrowRight, FlaskConical, Droplets, Copy, Check } from 'lucide-react'
import {
  POTIONS, byId, buildSteps, modifiersFor, ITEM, ASSET_BASE, pretty, giveCommand,
} from '../tools/brewing/recipes'

// ── tinted potion icon (overlay liquid tinted + glass on top) ─────────────────────────
let basesPromise: Promise<{ glass: HTMLImageElement; overlay: HTMLImageElement }> | null = null
function loadBases() {
  if (basesPromise) return basesPromise
  const load = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src
  })
  basesPromise = Promise.all([load(`${ASSET_BASE}/items/potion.png`), load(`${ASSET_BASE}/items/potion_overlay.png`)])
    .then(([glass, overlay]) => ({ glass, overlay }))
  return basesPromise
}

function PotionIcon({ color, size = 40 }: { color: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let alive = true
    loadBases().then(({ glass, overlay }) => {
      if (!alive) return
      const c = ref.current; if (!c) return
      const ctx = c.getContext('2d')!
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, size, size)
      // tinted liquid: overlay → multiply colour → mask back to overlay alpha
      ctx.drawImage(overlay, 0, 0, size, size)
      ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = color; ctx.fillRect(0, 0, size, size)
      ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(overlay, 0, 0, size, size)
      ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(glass, 0, 0, size, size)
    })
    return () => { alive = false }
  }, [color, size])
  return <canvas ref={ref} width={size} height={size} style={{ width: size, height: size, imageRendering: 'pixelated' }} />
}

function ItemIcon({ id, size = 36 }: { id: string; size?: number }) {
  return <img src={ITEM(id)} alt={pretty(id)} title={pretty(id)} width={size} height={size} style={{ imageRendering: 'pixelated' }} />
}

export default function BrewingPage() {
  const [selId, setSelId] = useState('strength')
  const [copied, setCopied] = useState(false)
  const potion = byId(selId)!
  const steps = buildSteps(potion)
  const mods = modifiersFor(potion)

  function copyGive() {
    navigator.clipboard.writeText(giveCommand(potion)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  return (
    <div className="section container">
      <div className="mb-8">
        <span className="badge-accent"><FlaskConical className="w-3.5 h-3.5" /> Reference</span>
        <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>Potion Brewing Guide</h1>
        <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
          Pick a potion to see exactly what to brew, step by step — every ingredient in, every bottle out.
        </p>
      </div>

      <div className="grid lg:grid-cols-[300px_1fr] gap-6 items-start">
        {/* Potion picker */}
        <div className="card !p-3">
          <div className="grid grid-cols-2 gap-1.5">
            {POTIONS.map(p => {
              const active = p.id === selId
              return (
                <button key={p.id} onClick={() => setSelId(p.id)}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all"
                  style={{
                    border: `1px solid ${active ? 'rgb(var(--accent))' : 'transparent'}`,
                    background: active ? 'rgb(var(--accent) / 0.1)' : 'transparent',
                  }}>
                  <PotionIcon color={p.color} size={28} />
                  <span className="text-xs font-medium leading-tight" style={{ color: active ? 'rgb(var(--accent))' : 'rgb(var(--text))' }}>{p.name}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center gap-3 mb-5">
              <PotionIcon color={potion.color} size={48} />
              <div>
                <h2 className="text-2xl" style={{ color: 'rgb(var(--text))' }}>Potion of {potion.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  {potion.note && <span className="badge-muted">{potion.note}</span>}
                  {potion.effect && <span className="text-xs" style={{ color: 'rgb(var(--muted))' }}>{potion.effect}</span>}
                </div>
              </div>
            </div>

            {potion.special ? (
              <div className="rounded-xl p-4 text-sm flex items-start gap-2"
                style={{ background: 'rgb(var(--warning) / 0.08)', border: '1px solid rgb(var(--warning) / 0.25)', color: 'rgb(var(--muted))' }}>
                <FlaskConical className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'rgb(var(--warning))' }} />
                <span>{potion.sourceNote}</span>
              </div>
            ) : (
            <ol className="space-y-3">
              {steps.map((s, i) => (
                <li key={i} className="flex items-center gap-3 flex-wrap rounded-xl p-3"
                  style={{ border: '1px solid rgb(var(--border))', background: 'rgb(var(--bg))' }}>
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: 'rgb(var(--accent) / 0.15)', color: 'rgb(var(--accent))' }}>{i + 1}</span>

                  {s.kind === 'water' ? (
                    <span className="flex items-center gap-2 text-sm" style={{ color: 'rgb(var(--text))' }}>
                      <ItemIcon id="glass_bottle" /> <Droplets className="w-4 h-4" style={{ color: '#3b82f6' }} />
                      Fill <b>3 glass bottles</b> at water
                      <ArrowRight className="w-4 h-4" style={{ color: 'rgb(var(--muted))' }} />
                      <PotionIcon color={s.color} size={32} /> <b>Water Bottle</b>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 text-sm flex-wrap" style={{ color: 'rgb(var(--text))' }}>
                      Add <ItemIcon id={s.ingredient!} /> <b>{pretty(s.ingredient!)}</b>
                      <ArrowRight className="w-4 h-4" style={{ color: 'rgb(var(--muted))' }} />
                      <PotionIcon color={s.color} size={32} /> <b>{s.result}</b>
                      {s.note && <span className="text-xs" style={{ color: 'rgb(var(--muted))' }}>· {s.note}</span>}
                    </span>
                  )}
                </li>
              ))}
            </ol>
            )}
          </div>

          {/* Modifiers */}
          {mods.length > 0 && (
          <div className="card">
            <h3 className="mb-3" style={{ color: 'rgb(var(--text))' }}>Then optionally…</h3>
            <div className="grid sm:grid-cols-2 gap-2">
              {mods.map(m => (
                <div key={m.label} className="flex items-center gap-3 rounded-xl p-3" style={{ border: '1px solid rgb(var(--border))' }}>
                  <ItemIcon id={m.ingredient} />
                  <div>
                    <div className="text-sm font-medium" style={{ color: 'rgb(var(--text))' }}>{m.label}</div>
                    <div className="text-xs" style={{ color: 'rgb(var(--muted))' }}>{m.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs mt-3" style={{ color: 'rgb(var(--muted))' }}>
              Brew the base potion first, then add one modifier per brew. Redstone and Glowstone can't be combined.
            </p>
          </div>
          )}

          {/* /give command */}
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm" style={{ color: 'rgb(var(--text))' }}>/give command <span className="text-xs font-normal" style={{ color: 'rgb(var(--muted))' }}>(1.20.5+, OP)</span></h3>
              <button onClick={copyGive} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
                style={{ background: 'rgb(var(--accent) / 0.1)', color: 'rgb(var(--accent))' }}>
                {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
              </button>
            </div>
            <pre className="text-sm font-mono break-all whitespace-pre-wrap rounded-xl px-4 py-3"
              style={{ background: 'rgb(var(--bg))', border: '1px solid rgb(var(--border))', color: 'rgb(var(--text))' }}>
              {giveCommand(potion)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}
