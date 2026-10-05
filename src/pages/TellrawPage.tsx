import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Copy, Check, MousePointerClick } from 'lucide-react'
import { RichLineEditor } from '../components/RichTextEditor'
import { segmentStyle, type RichLine, type TextEvents, type TextSegment } from '../types/richText'
import { useVersion } from '../contexts/VersionContext'
import { buildTellraw, tellrawFormatFor } from '../tools/tellraw/tellraw'
import { RunBtn } from '../components/RunBtn'
import { TargetInput } from '../components/TargetInput'

function uid() { return Math.random().toString(36).slice(2) }

interface LineState { id: string; segments: RichLine }

const TARGETS = [
  { id: '@a', label: '@a — all players' },
  { id: '@p', label: '@p — nearest player' },
  { id: '@s', label: '@s — yourself' },
  { id: '@r', label: '@r — random player' },
  { id: 'custom', label: 'Player name / custom selector' },
]

const CHAT_LIMIT = 256

const DEFAULT_LINES: LineState[] = [
  {
    id: uid(),
    segments: [
      { text: 'Welcome to the server! ', color: '#ffaa00' },
      {
        text: '[Join our Discord]', color: '#5865f2', underlined: true,
        events: {
          click: { action: 'open_url', value: 'https://discord.com' },
          hover: { action: 'show_text', lines: [[{ text: 'Click to open the invite', color: '#aaaaaa' }]] },
        },
      },
    ],
  },
  {
    id: uid(),
    segments: [
      { text: 'Type ', color: '#aaaaaa' },
      {
        text: '/spawn', color: '#55ff55',
        events: {
          click: { action: 'suggest_command', value: '/spawn' },
          hover: { action: 'show_text', lines: [[{ text: 'Click to put ', color: '#aaaaaa' }, { text: '/spawn', color: '#55ff55' }, { text: ' in chat', color: '#aaaaaa' }]] },
        },
      },
      { text: ' to get started.', color: '#aaaaaa' },
    ],
  },
]

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

// ── Minecraft-style preview ───────────────────────────────────────────────────

const prettyId = (id: string) =>
  id.replace(/^minecraft:/, '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

function Segs({ line }: { line: RichLine }) {
  return <>{line.map((seg, i) => <span key={i} style={segmentStyle(seg)}>{seg.text}</span>)}</>
}

function Tooltip({ events, x, y }: { events: TextEvents; x: number; y: number }) {
  const h = events.hover
  if (!h) return null
  // Portalled: .card's backdrop-filter would otherwise trap position:fixed under later cards
  return createPortal(
    <div
      className="fixed pointer-events-none font-mono text-sm px-2 py-1.5 whitespace-pre max-w-[480px]"
      style={{
        left: x + 14, top: y - 10, zIndex: 9999,
        backgroundColor: 'rgba(16, 0, 16, 0.94)',
        border: '2px solid #25015b',
        outline: '1px solid #100010',
        borderRadius: 3,
        color: '#ffffff',
        textShadow: '2px 2px 0 rgba(0,0,0,0.35)',
      }}
    >
      {h.action === 'show_text' && h.lines.map((line, i) => <div key={i}><Segs line={line} /></div>)}
      {h.action === 'show_item' && (
        <>
          <div>{prettyId(h.id)}{h.count > 1 ? ` x${h.count}` : ''}</div>
          <div style={{ color: '#555555' }}>{h.id.includes(':') ? h.id : `minecraft:${h.id}`}</div>
        </>
      )}
      {h.action === 'show_entity' && (
        <>
          <div>{h.name.some(s => s.text) ? <Segs line={h.name} /> : prettyId(h.id)}</div>
          <div style={{ color: '#aaaaaa' }}>Type: {h.id}</div>
          <div style={{ color: '#aaaaaa' }}>{h.uuid}</div>
        </>
      )}
    </div>,
    document.body,
  )
}

function ChatPreview({ lines }: { lines: RichLine[] }) {
  const [hover, setHover] = useState<{ events: TextEvents; x: number; y: number } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number>()

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  // mouseleave doesn't fire when something (e.g. the events modal) covers the span
  useEffect(() => {
    if (!hover) return
    const hide = (e: Event) => {
      if (e.type === 'scroll' || !(e.target as Element).closest?.('[data-tellraw-ev]')) setHover(null)
    }
    document.addEventListener('pointermove', hide)
    window.addEventListener('scroll', hide, true)
    return () => { document.removeEventListener('pointermove', hide); window.removeEventListener('scroll', hide, true) }
  }, [hover])

  const flash = (msg: string) => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2200)
  }

  const onClick = (e: React.MouseEvent, ev: TextEvents) => {
    if (e.shiftKey && ev.insertion) { flash(`Inserted into chat: ${ev.insertion}`); return }
    const c = ev.click
    if (!c) return
    switch (c.action) {
      case 'open_url':
        if (/^https?:\/\//i.test(c.value)) window.open(c.value, '_blank', 'noopener,noreferrer')
        else flash('Invalid URL — must start with http(s)://')
        break
      case 'run_command': flash(`Runs: ${c.value}`); break
      case 'suggest_command': flash(`Suggested in chat: ${c.value}`); break
      case 'copy_to_clipboard':
        navigator.clipboard.writeText(c.value).then(() => flash('Copied to clipboard'), () => flash('Copy failed'))
        break
      case 'change_page': flash(`Turns book to page ${c.value}`); break
    }
  }

  const renderSeg = (seg: TextSegment, i: number) => {
    const ev = seg.events
    if (!ev) return <span key={i} style={segmentStyle(seg)}>{seg.text}</span>
    const clickable = !!ev.click || !!ev.insertion
    return (
      <span
        key={i}
        data-tellraw-ev
        style={{ ...segmentStyle(seg), cursor: clickable ? 'pointer' : 'default' }}
        onMouseMove={e => setHover({ events: ev, x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setHover(null)}
        onClick={e => onClick(e, ev)}
      >{seg.text}</span>
    )
  }

  const empty = lines.every(l => !l.some(s => s.text))

  return (
    <div className="relative">
      <div
        className="rounded-lg p-3 font-mono text-sm min-h-[4.5rem]"
        style={{
          background: 'linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27%3E%3Crect width=%2716%27 height=%2716%27 fill=%27%23597d3a%27/%3E%3Crect width=%278%27 height=%278%27 fill=%27%23649142%27/%3E%3Crect x=%278%27 y=%278%27 width=%278%27 height=%278%27 fill=%27%234e7034%27/%3E%3C/svg%3E")',
          backgroundSize: 'auto, 32px 32px',
          color: '#ffffff',
          textShadow: '2px 2px 0 rgba(0,0,0,0.35)',
        }}
      >
        {empty
          ? <span style={{ color: '#aaaaaa' }}>Your message will appear here…</span>
          : lines.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-words min-h-[1.25rem]">{line.map(renderSeg)}</div>
            ))}
      </div>
      {toast && (
        <div
          className="absolute left-3 bottom-3 rounded-md px-2.5 py-1 text-xs font-mono"
          style={{ backgroundColor: 'rgba(0,0,0,0.8)', color: '#ffff55' }}
        >{toast}</div>
      )}
      {hover && <Tooltip {...hover} />}
    </div>
  )
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function TellrawPage() {
  const { version } = useVersion()
  const fmt = tellrawFormatFor(version.id)
  const [lines, setLines] = useState<LineState[]>(DEFAULT_LINES)
  const [target, setTarget] = useState('@a')
  const [customTarget, setCustomTarget] = useState('')
  const [showJson, setShowJson] = useState(false)

  const updateLine = (id: string, segments: RichLine) =>
    setLines(p => p.map(l => l.id === id ? { ...l, segments } : l))
  const addLine = () => setLines(p => [...p, { id: uid(), segments: [] }])
  const removeLine = (id: string) => { if (lines.length > 1) setLines(p => p.filter(l => l.id !== id)) }

  const richLines = useMemo(() => lines.map(l => l.segments), [lines])
  const { json, command } = useMemo(
    () => buildTellraw(richLines, target === 'custom' ? customTarget.trim() : target, fmt),
    [richLines, target, customTarget, fmt],
  )
  const output = showJson ? json : command
  const tooLongForChat = command.length > CHAT_LIMIT

  return (
    <div className="section container">
      <div className="mb-10">
        <span className="badge-muted">Tool</span>
        <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>Tellraw Generator</h1>
        <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
          Build <code>/tellraw</code> messages with gradients, formatting, clickable links, commands and hover tooltips.
        </p>
      </div>

      {/* Message editor */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3>Message</h3>
          <button onClick={addLine} className="btn-ghost flex items-center gap-1 text-xs">
            <Plus className="w-3 h-3" /> Add line
          </button>
        </div>
        <div className="space-y-4">
          {lines.map((line, i) => (
            <div key={line.id}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs" style={{ color: 'rgb(var(--muted))' }}>Line {i + 1}</span>
                {lines.length > 1 && (
                  <button
                    onClick={() => removeLine(line.id)}
                    className="text-xs px-2 py-0.5 rounded ml-auto"
                    style={{ color: 'rgb(var(--muted))' }}
                  >
                    Remove
                  </button>
                )}
              </div>
              <RichLineEditor
                value={line.segments}
                onChange={segs => updateLine(line.id, segs)}
                placeholder={`Line ${i + 1}…`}
                enableEvents
              />
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Preview */}
          <div className="card">
            <h3 className="mb-1">Preview</h3>
            <p className="text-xs mb-4" style={{ color: 'rgb(var(--muted))' }}>
              Hover and click the highlighted parts to test them. Shift-click triggers insertion.
            </p>
            <ChatPreview lines={richLines} />
          </div>

          {/* Output */}
          <div className="card">
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <h3>Output</h3>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'rgb(var(--muted))' }}>
                  <input type="checkbox" checked={showJson} onChange={e => setShowJson(e.target.checked)} className="accent-violet-600" />
                  Component only
                </label>
                <RunBtn text={output} />
                <CopyBtn text={output} />
              </div>
            </div>
            <pre className="output-box text-xs overflow-x-auto whitespace-pre-wrap break-all">{output}</pre>
            <p className="text-xs mt-2" style={{ color: tooLongForChat ? 'rgb(234 179 8)' : 'rgb(var(--muted))' }}>
              {command.length} characters
              {tooLongForChat && ` — over the ${CHAT_LIMIT}-character chat limit, paste it into a command block instead.`}
            </p>
          </div>
        </div>

        {/* Settings */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="mb-4">Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="form-label">Target</label>
                <select className="form-input" value={target} onChange={e => setTarget(e.target.value)}>
                  {TARGETS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                {target === 'custom' && (
                  <TargetInput
                    wrapperClassName="mt-2"
                    className="form-input font-mono text-sm"
                    value={customTarget}
                    onChange={setCustomTarget}
                    placeholder="Steve or @a[team=red]"
                  />
                )}
              </div>
              <div className="text-xs space-y-1" style={{ color: 'rgb(var(--muted))' }}>
                <p>
                  Version <span className="font-mono" style={{ color: 'rgb(var(--text))' }}>{version.label}</span> —{' '}
                  {fmt === 'snbt'
                    ? <>uses <code>click_event</code> / <code>hover_event</code> (1.21.5+)</>
                    : <>uses <code>clickEvent</code> / <code>hoverEvent</code> (pre-1.21.5)</>}
                </p>
                <p>Change it with the version picker in the header.</p>
              </div>
            </div>
          </div>

          <div className="card text-sm space-y-2" style={{ color: 'rgb(var(--muted))' }}>
            <p className="font-semibold flex items-center gap-1.5" style={{ color: 'rgb(var(--text))' }}>
              <MousePointerClick className="w-4 h-4" /> Adding links &amp; tooltips
            </p>
            <p>Select part of a line and press <strong>Events</strong> in the toolbar to choose what happens on click (open URL, run / suggest command, copy text) and what shows on hover (rich tooltip, item or entity).</p>
            <p>Place the cursor inside an existing link and press <strong>Events</strong> again to edit it.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
