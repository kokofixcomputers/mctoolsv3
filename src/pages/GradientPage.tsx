import { useState, useRef, useCallback, useMemo } from 'react'
import { Plus, X, Copy, Check } from 'lucide-react'
import {
  buildOutput,
  interpolateColors,
  type ColorFormat,
  type GradientType,
  type TextStyle,
} from '../tools/gradient/gradient'

interface Stop { id: string; hex: string }
function uid() { return Math.random().toString(36).slice(2) }

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true); setTimeout(() => setCopied(false), 1200)
  }, [text])
  return (
    <button onClick={copy} className="btn-secondary px-4 py-2 text-xs flex items-center gap-1.5">
      {copied ? <><Check className="w-3 h-3" />Copied</> : <><Copy className="w-3 h-3" />Copy</>}
    </button>
  )
}

const PRESETS = [
  { name: 'Ocean', stops: ['#00d2ff', '#3a7bd5'] },
  { name: 'Sunset', stops: ['#ff6b6b', '#feca57', '#ff9ff3'] },
  { name: 'Forest', stops: ['#56ab2f', '#a8e063'] },
  { name: 'Violet', stops: ['#7b2ff7', '#f107a3'] },
  { name: 'Fire', stops: ['#f12711', '#f5af19'] },
  { name: 'Ice', stops: ['#74ebd5', '#acb6e5'] },
]

const PAD = '0.5rem 0.75rem'

function GradientEditor({
  text,
  onChange,
  hexStops,
  gradType,
  style,
}: {
  text: string
  onChange: (v: string) => void
  hexStops: string[]
  gradType: GradientType
  style: TextStyle
}) {
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const chars = [...text]
  const colors = useMemo(
    () => interpolateColors(hexStops, chars.length, gradType),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, hexStops, gradType],
  )

  const textDecoration = [
    style.underline ? 'underline' : '',
    style.strikethrough ? 'line-through' : '',
  ].filter(Boolean).join(' ') || undefined

  return (
    <div
      style={{ display: 'grid', cursor: 'text' }}
      onClick={() => inputRef.current?.focus()}
    >
      {/* Styled overlay */}
      <div
        aria-hidden
        className="text-2xl font-bold whitespace-pre select-none overflow-hidden font-sans"
        style={{
          gridArea: '1/1',
          padding: PAD,
          pointerEvents: 'none',
          zIndex: 1,
          minHeight: '3.5rem',
          lineHeight: '1.4',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {chars.length > 0
          ? chars.map((ch, i) => (
            <span
              key={i}
              style={{
                color: colors[i] ?? '#ffffff',
                fontWeight: style.bold ? 'bold' : undefined,
                fontStyle: style.italic ? 'italic' : undefined,
                textDecoration,
              }}
            >
              {ch}
            </span>
          ))
          : <span style={{ color: 'rgb(var(--muted))', opacity: 0.4, fontWeight: 'normal', fontSize: '1rem' }}>
              Type your text here…
            </span>
        }
      </div>

      {/* Transparent real input */}
      <input
        ref={inputRef}
        value={text}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder=""
        className="text-2xl font-bold font-sans outline-none rounded-xl"
        style={{
          gridArea: '1/1',
          padding: PAD,
          color: 'transparent',
          caretColor: colors[Math.max(0, chars.length - 1)] || 'rgb(var(--text))',
          backgroundColor: 'transparent',
          border: 'none',
          zIndex: 2,
          position: 'relative',
          lineHeight: '1.4',
          minHeight: '3.5rem',
          boxShadow: focused ? '0 0 0 2px rgb(var(--accent) / 0.4) inset' : undefined,
        }}
      />
    </div>
  )
}

export default function GradientPage() {
  const [text, setText] = useState('MCTools')
  const [stops, setStops] = useState<Stop[]>([
    { id: uid(), hex: '#6d28d9' },
    { id: uid(), hex: '#3b82f6' },
  ])
  const [format, setFormat] = useState<ColorFormat>('minimessage')
  const [gradType, setGradType] = useState<GradientType>('rgb')
  const [style, setStyle] = useState<TextStyle>({})

  const hexStops = stops.map((s) => s.hex)
  const output = buildOutput(text, hexStops, format, gradType, style)

  const addStop = () => setStops((p) => [...p, { id: uid(), hex: '#ffffff' }])
  const removeStop = (id: string) => setStops((p) => p.length > 1 ? p.filter((s) => s.id !== id) : p)
  const updateStop = (id: string, hex: string) => setStops((p) => p.map((s) => s.id === id ? { ...s, hex } : s))
  const applyPreset = (p: typeof PRESETS[0]) => setStops(p.stops.map((hex) => ({ id: uid(), hex })))
  const toggleStyle = (k: keyof TextStyle) => setStyle((s) => ({ ...s, [k]: !s[k] }))

  const gradientCss = hexStops.length > 1
    ? `linear-gradient(to right, ${hexStops.join(', ')})`
    : hexStops[0]

  return (
    <div className="section container">
      <div className="mb-10">
        <span className="badge-muted">Tool</span>
        <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>Gradient Generator</h1>
        <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
          Type below — your text shows the live gradient as you edit it.
        </p>
      </div>

      {/* Main editor card */}
      <div className="card mb-6">
        <div
          className="rounded-xl mb-4 overflow-hidden"
          style={{ border: '1px solid rgb(var(--border))', backgroundColor: 'rgb(var(--bg))' }}
        >
          <GradientEditor
            text={text}
            onChange={setText}
            hexStops={hexStops}
            gradType={gradType}
            style={style}
          />
        </div>

        {/* Live gradient bar */}
        <div className="h-2 rounded-full" style={{ background: gradientCss }} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: colors + presets */}
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3>Colors</h3>
              <button onClick={addStop} className="btn-ghost flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
            <div className="space-y-2">
              {stops.map((stop, i) => (
                <div key={stop.id} className="flex items-center gap-2">
                  <span className="text-xs w-4 text-center" style={{ color: 'rgb(var(--muted))' }}>{i + 1}</span>
                  <input
                    type="color"
                    value={stop.hex}
                    onChange={(e) => updateStop(stop.id, e.target.value)}
                    className="rounded-lg border"
                    style={{ borderColor: 'rgb(var(--border))' }}
                  />
                  <input
                    className="form-input font-mono text-xs flex-1"
                    value={stop.hex}
                    onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) updateStop(stop.id, e.target.value) }}
                    maxLength={7}
                  />
                  <button
                    onClick={() => removeStop(stop.id)}
                    disabled={stops.length <= 1}
                    className="btn-ghost p-1 disabled:opacity-30 text-red-400"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-5 pt-4" style={{ borderTop: '1px solid rgb(var(--border))' }}>
              <p className="form-label">Text Style</p>
              <div className="flex gap-2 flex-wrap">
                {(['bold', 'italic', 'underline', 'strikethrough'] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => toggleStyle(k)}
                    className="btn rounded-full px-3 py-1 text-xs transition-all"
                    style={{
                      border: `1px solid ${style[k] ? 'rgb(var(--accent))' : 'rgb(var(--border))'}`,
                      backgroundColor: style[k] ? 'rgb(var(--accent) / 0.1)' : 'transparent',
                      color: style[k] ? 'rgb(var(--accent))' : 'rgb(var(--muted))',
                    }}
                  >
                    {k.charAt(0).toUpperCase() + k.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="mb-3">Presets</h3>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => applyPreset(p)}
                  className="rounded-xl px-3 py-2 text-sm font-semibold text-left transition-all hover:scale-[1.02]"
                  style={{
                    border: '1px solid rgb(var(--border))',
                    background: `linear-gradient(90deg, ${p.stops.join(',')})`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: output */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card">
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div>
                <label className="form-label">Format</label>
                <select className="form-input" value={format} onChange={(e) => setFormat(e.target.value as ColorFormat)}>
                  <option value="minimessage">MiniMessage</option>
                  <option value="legacy">Legacy (§x)</option>
                  <option value="hex">Raw Hex</option>
                </select>
              </div>
              <div>
                <label className="form-label">Gradient Mode</label>
                <select className="form-input" value={gradType} onChange={(e) => setGradType(e.target.value as GradientType)}>
                  <option value="rgb">RGB</option>
                  <option value="hsv">HSV</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between mb-2">
              <label className="form-label mb-0">Output</label>
              <CopyBtn text={output} />
            </div>
            <div className="output-box min-h-16">{output || <span style={{ color: 'rgb(var(--muted))' }}>—</span>}</div>
          </div>

          <div className="card text-sm space-y-2" style={{ color: 'rgb(var(--muted))' }}>
            <p className="font-semibold" style={{ color: 'rgb(var(--text))' }}>Format notes</p>
            <div><span style={{ color: 'rgb(var(--accent))' }}>MiniMessage</span> — Paper / Velocity plugins using Adventure API</div>
            <div><span style={{ color: 'rgb(var(--accent))' }}>Legacy §x</span> — Spigot ChatColor, BungeeCord</div>
            <div><span style={{ color: 'rgb(var(--accent))' }}>Raw Hex</span> — per-character hex, paste into custom scripts</div>
          </div>
        </div>
      </div>
    </div>
  )
}
