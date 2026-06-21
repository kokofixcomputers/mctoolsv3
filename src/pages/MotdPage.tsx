import { useState, useCallback } from 'react'
import { Plus, X, Copy, Check } from 'lucide-react'
import { buildMotd, renderMotdPreview, type MotdFormat, type MotdLine } from '../tools/motd/motd'
import type { GradientType } from '../tools/gradient/gradient'

function uid() { return Math.random().toString(36).slice(2) }
interface LineState extends MotdLine { id: string }
interface Stop { id: string; hex: string }

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

export default function MotdPage() {
  const [lines, setLines] = useState<LineState[]>([
    { id: uid(), text: 'Welcome to the server!', useGradient: true, center: false },
    { id: uid(), text: 'Play now on mc.example.com', useGradient: false, center: false },
  ])
  const [stops, setStops] = useState<Stop[]>([
    { id: uid(), hex: '#6d28d9' },
    { id: uid(), hex: '#f59e0b' },
  ])
  const [format, setFormat] = useState<MotdFormat>('vanilla')
  const [gradType, setGradType] = useState<GradientType>('rgb')
  const [centerAll, setCenterAll] = useState(false)

  const hexStops = stops.map((s) => s.hex)
  const output = buildMotd(lines, hexStops, gradType, format, centerAll)
  const preview = renderMotdPreview(lines, hexStops, gradType)

  const updateLine = (id: string, patch: Partial<MotdLine>) =>
    setLines((p) => p.map((l) => l.id === id ? { ...l, ...patch } : l))
  const addStop = () => setStops((p) => [...p, { id: uid(), hex: '#ffffff' }])
  const removeStop = (id: string) => { if (stops.length > 1) setStops((p) => p.filter((s) => s.id !== id)) }
  const updateStop = (id: string, hex: string) => setStops((p) => p.map((s) => s.id === id ? { ...s, hex } : s))

  return (
    <div className="section container">
      <div className="mb-10">
        <span className="badge-muted">Tool</span>
        <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>MOTD Generator</h1>
        <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
          Create server list MOTDs with gradient support for multiple server formats.
        </p>
      </div>

      {/* Preview mock */}
      <div className="card mb-6">
        <p className="form-label mb-3">Server List Preview</p>
        <div className="rounded-xl p-5 font-mono text-sm leading-7"
          style={{ backgroundColor: '#1a1a2e', border: '1px solid #2a2a4a' }}>
          {preview.map((segs, li) => (
            <div key={li} className={centerAll ? 'text-center' : ''}>
              {segs.length === 0
                ? <span>&nbsp;</span>
                : segs.map((s, i) => <span key={i} style={{ color: s.color }}>{s.char}</span>)}
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="card">
            <h3 className="mb-5">MOTD Lines</h3>
            <div className="space-y-5">
              {lines.map((line, i) => (
                <div key={line.id} className="pb-5" style={{ borderBottom: i < lines.length - 1 ? '1px solid rgb(var(--border))' : 'none' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs w-14" style={{ color: 'rgb(var(--muted))' }}>Line {i + 1}</span>
                    <input
                      className="form-input font-mono text-sm flex-1"
                      value={line.text}
                      onChange={(e) => updateLine(line.id, { text: e.target.value })}
                      placeholder={`Line ${i + 1}…`}
                    />
                  </div>
                  <div className="flex items-center gap-5 ml-14 text-sm">
                    <label className="flex items-center gap-2 cursor-pointer" style={{ color: 'rgb(var(--muted))' }}>
                      <input type="checkbox" checked={line.useGradient} onChange={(e) => updateLine(line.id, { useGradient: e.target.checked })} className="accent-violet-600" />
                      Apply gradient
                    </label>
                    {(format === 'vanilla' || format === 'legacy') && (
                      <label className="flex items-center gap-2 cursor-pointer" style={{ color: 'rgb(var(--muted))' }}>
                        <input type="checkbox" checked={line.center} onChange={(e) => updateLine(line.id, { center: e.target.checked })} className="accent-violet-600" />
                        Center
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3>Output</h3>
              <CopyBtn text={output} />
            </div>
            <pre className="output-box text-xs overflow-x-auto whitespace-pre-wrap break-all">{output}</pre>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card">
            <h3 className="mb-4">Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="form-label">Output Format</label>
                <select className="form-input" value={format} onChange={(e) => setFormat(e.target.value as MotdFormat)}>
                  <option value="vanilla">Vanilla (server.properties)</option>
                  <option value="paper">Paper (config.yml)</option>
                  <option value="velocity">Velocity (velocity.toml)</option>
                  <option value="simplemotd">SimpleMOTD plugin</option>
                  <option value="legacy">Raw legacy §</option>
                </select>
              </div>
              <div>
                <label className="form-label">Gradient Mode</label>
                <select className="form-input" value={gradType} onChange={(e) => setGradType(e.target.value as GradientType)}>
                  <option value="rgb">RGB</option>
                  <option value="hsv">HSV</option>
                </select>
              </div>
              {(format === 'vanilla' || format === 'legacy') && (
                <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'rgb(var(--muted))' }}>
                  <input type="checkbox" checked={centerAll} onChange={(e) => setCenterAll(e.target.checked)} className="accent-violet-600" />
                  Auto-center all lines
                </label>
              )}
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3>Gradient Colors</h3>
              <button onClick={addStop} className="btn-ghost flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
            <div className="space-y-2">
              {stops.map((stop) => (
                <div key={stop.id} className="flex items-center gap-2">
                  <input type="color" value={stop.hex} onChange={(e) => updateStop(stop.id, e.target.value)}
                    className="rounded-lg" style={{ border: '1px solid rgb(var(--border))' }} />
                  <input
                    className="form-input font-mono text-xs flex-1"
                    value={stop.hex}
                    onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) updateStop(stop.id, e.target.value) }}
                    maxLength={7}
                  />
                  <button onClick={() => removeStop(stop.id)} disabled={stops.length <= 1}
                    className="btn-ghost p-1 disabled:opacity-30 text-red-400">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
