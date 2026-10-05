import { useState, useCallback } from 'react'
import { Plus, Copy, Check, Save } from 'lucide-react'
import { embedded, saveProperty, usePanel } from '../lib/panel'
import { buildMotdFromRich, type MotdFormat } from '../tools/motd/motd'
import { RichLineEditor } from '../components/RichTextEditor'
import type { RichLine } from '../types/richText'

function uid() { return Math.random().toString(36).slice(2) }

interface LineState {
  id: string
  segments: RichLine
  center: boolean
}

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

/** server.properties keeps non-ASCII characters (the section sign of the color codes) as \uXXXX escapes. */
function toPropertyValue(output: string) {
  return output
    .replace(/^motd=/, '')
    .replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`)
}

/** Writes the MOTD into the server's server.properties through the panel. Only exists inside the panel. */
function SaveBtn({ output, format }: { output: string; format: MotdFormat }) {
  const panel = usePanel()
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'failed'>('idle')
  const [error, setError] = useState('')

  if (!embedded || !panel.connected) return null

  const blocked = !panel.canEdit
    ? 'You cannot edit files on this server'
    : format !== 'vanilla'
      ? 'Only the Vanilla (server.properties) format can be saved to the server'
      : ''

  const save = async () => {
    setState('busy')
    try {
      await saveProperty('motd', toPropertyValue(output))
      setState('saved')
      setError('')
    } catch (e) {
      setState('failed')
      setError((e as Error).message)
    }
    setTimeout(() => setState('idle'), 4000)
  }

  return (
    <span className="inline-flex items-center gap-2">
      {state === 'saved' && (
        <span className="text-xs" style={{ color: 'rgb(var(--muted))' }}>
          {panel.running ? 'Saved. Restart the server to show it.' : 'Saved.'}
        </span>
      )}
      {state === 'failed' && <span className="text-xs" style={{ color: 'rgb(var(--danger))' }}>{error}</span>}
      <button
        onClick={save}
        disabled={!!blocked || state === 'busy'}
        title={blocked || 'Write this MOTD into server.properties'}
        className="btn-primary px-4 py-2 text-xs flex items-center gap-1.5"
      >
        {state === 'saved' ? <><Check className="w-3 h-3" />Saved</> : <><Save className="w-3 h-3" />Save to server</>}
      </button>
    </span>
  )
}

export default function MotdPage() {
  const [lines, setLines] = useState<LineState[]>([
    { id: uid(), segments: [{ text: 'Welcome to the server!', color: '#6d28d9' }], center: false },
    { id: uid(), segments: [{ text: 'Play now on mc.example.com' }], center: false },
  ])
  const [format, setFormat] = useState<MotdFormat>('vanilla')
  const [centerAll, setCenterAll] = useState(false)

  const output = buildMotdFromRich(lines, format, centerAll)

  const updateLine = (id: string, segments: RichLine) =>
    setLines(p => p.map(l => l.id === id ? { ...l, segments } : l))
  const toggleCenter = (id: string) =>
    setLines(p => p.map(l => l.id === id ? { ...l, center: !l.center } : l))
  const addLine = () => setLines(p => [...p, { id: uid(), segments: [], center: false }])
  const removeLine = (id: string) => { if (lines.length > 1) setLines(p => p.filter(l => l.id !== id)) }

  const showCenterOpt = format === 'vanilla' || format === 'legacy'

  return (
    <div className="section container">
      <div className="mb-10">
        <span className="badge-muted">Tool</span>
        <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>MOTD Generator</h1>
        <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
          Select text to apply bold, underline, obfuscate, gradient and more — per character.
        </p>
      </div>

      {/* Lines editor */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3>MOTD Lines</h3>
          <button onClick={addLine} className="btn-ghost flex items-center gap-1 text-xs">
            <Plus className="w-3 h-3" /> Add line
          </button>
        </div>

        <div className="space-y-4">
          {lines.map((line, i) => (
            <div key={line.id}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs w-12 shrink-0" style={{ color: 'rgb(var(--muted))' }}>Line {i + 1}</span>
                {showCenterOpt && (
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer ml-auto" style={{ color: 'rgb(var(--muted))' }}>
                    <input type="checkbox" checked={line.center} onChange={() => toggleCenter(line.id)} className="accent-violet-600" />
                    Center
                  </label>
                )}
                {lines.length > 1 && (
                  <button
                    onClick={() => removeLine(line.id)}
                    className="text-xs px-2 py-0.5 rounded"
                    style={{ color: 'rgb(var(--muted))', marginLeft: showCenterOpt ? undefined : 'auto' }}
                  >
                    Remove
                  </button>
                )}
              </div>
              <RichLineEditor
                value={line.segments}
                onChange={segs => updateLine(line.id, segs)}
                placeholder={`Line ${i + 1}…`}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Output */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3>Output</h3>
              <div className="flex items-center gap-2">
                <SaveBtn output={output} format={format} />
                <CopyBtn text={output} />
              </div>
            </div>
            <pre className="output-box text-xs overflow-x-auto whitespace-pre-wrap break-all">{output}</pre>
          </div>
        </div>

        {/* Settings */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="mb-4">Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="form-label">Output Format</label>
                <select className="form-input" value={format} onChange={e => setFormat(e.target.value as MotdFormat)}>
                  <option value="vanilla">Vanilla (server.properties)</option>
                  <option value="paper">Paper (config.yml)</option>
                  <option value="velocity">Velocity (velocity.toml)</option>
                  <option value="simplemotd">SimpleMOTD plugin</option>
                  <option value="legacy">Raw legacy §</option>
                </select>
              </div>
              {showCenterOpt && (
                <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'rgb(var(--muted))' }}>
                  <input type="checkbox" checked={centerAll} onChange={e => setCenterAll(e.target.checked)} className="accent-violet-600" />
                  Auto-center all lines
                </label>
              )}
            </div>
          </div>

          <div className="card text-sm space-y-2" style={{ color: 'rgb(var(--muted))' }}>
            <p className="font-semibold" style={{ color: 'rgb(var(--text))' }}>Formatting tip</p>
            <p>Select any part of a line to apply bold, underline, obfuscated, per-char color or gradient from the toolbar.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
