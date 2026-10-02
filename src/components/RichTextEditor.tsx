import { useState, useRef, useEffect, useMemo, useCallback, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Plus, X, Sparkles, MousePointerClick, Shuffle } from 'lucide-react'
import {
  type TextSegment, type RichLine, type RichLines, type TextEvents, type ClickAction,
  lerpColor, toSegments, fromSegments, segmentStyle, hasEvents, sameEvents,
} from '../types/richText'
import { interpolateColors } from '../tools/gradient/gradient'
import { ItemPicker } from './ItemPicker'

interface GradientPreset { name: string; stops: string[] }

const ALL_GRADIENT_PRESETS: GradientPreset[] = [
  // Nature
  { name: 'Ocean',         stops: ['#00d2ff', '#3a7bd5'] },
  { name: 'Forest',        stops: ['#56ab2f', '#a8e063'] },
  { name: 'Aurora',        stops: ['#00c9ff', '#92fe9d', '#00b4db'] },
  { name: 'Lagoon',        stops: ['#43c6ac', '#185a9d'] },
  { name: 'Tropical',      stops: ['#11998e', '#38ef7d'] },
  { name: 'Waterfall',     stops: ['#43cea2', '#185a9d'] },
  { name: 'Meadow',        stops: ['#134e5e', '#71b280'] },
  { name: 'Moss',          stops: ['#134e5e', '#a8c0a0'] },
  // Sky & Space
  { name: 'Sunset',        stops: ['#ff6b6b', '#feca57', '#ff9ff3'] },
  { name: 'Ice',           stops: ['#74ebd5', '#acb6e5'] },
  { name: 'Dawn',          stops: ['#fc4a1a', '#f7b733', '#ffecd2'] },
  { name: 'Midnight',      stops: ['#2c3e50', '#3498db'] },
  { name: 'Galaxy',        stops: ['#0f0c29', '#302b63', '#24243e'] },
  { name: 'Nebula',        stops: ['#ee0979', '#ff6a00'] },
  { name: 'Cosmic',        stops: ['#6366f1', '#a855f7', '#ec4899'] },
  { name: 'Moonlight',     stops: ['#0f3460', '#533483', '#e94560'] },
  { name: 'Starfall',      stops: ['#1a1a2e', '#16213e', '#0f3460', '#533483'] },
  { name: 'Horizon',       stops: ['#f7971e', '#ffd200', '#ff6ec7'] },
  // Vibrant
  { name: 'Fire',          stops: ['#f12711', '#f5af19'] },
  { name: 'Violet',        stops: ['#7b2ff7', '#f107a3'] },
  { name: 'Phoenix',       stops: ['#f83600', '#f9d423'] },
  { name: 'Neon',          stops: ['#f953c6', '#b91d73'] },
  { name: 'Cyber',         stops: ['#00f2fe', '#4facfe'] },
  { name: 'Blossom',       stops: ['#fd79a8', '#e84393', '#6c5ce7'] },
  { name: 'Coral',         stops: ['#ff6b6b', '#ee5a24'] },
  { name: 'Rainbow',       stops: ['#ff0000', '#ff7700', '#ffff00', '#00cc00', '#0000ff', '#8b00ff'] },
  { name: 'Candy',         stops: ['#f953c6', '#b91d73', '#00d2ff'] },
  { name: 'Electric',      stops: ['#00b09b', '#96c93d'] },
  // Soft & Pastel
  { name: 'Cotton Candy',  stops: ['#ff9a9e', '#fecfef', '#ffecd2'] },
  { name: 'Rose Gold',     stops: ['#f7797d', '#fbd786', '#c6ffdd'] },
  { name: 'Spring',        stops: ['#a8edea', '#fed6e3'] },
  { name: 'Peach',         stops: ['#ffecd2', '#fcb69f'] },
  { name: 'Lavender',      stops: ['#e0c3fc', '#8ec5fc'] },
  { name: 'Sakura',        stops: ['#f8cdda', '#fbb7c5'] },
  { name: 'Butter',        stops: ['#fffde7', '#ffd54f'] },
  { name: 'Mint',          stops: ['#e0f7fa', '#80deea'] },
  { name: 'Blush',         stops: ['#fce4ec', '#f48fb1'] },
  { name: 'Creamsicle',    stops: ['#ffecd2', '#ffb347'] },
  { name: 'Apricot',       stops: ['#ffd3b6', '#ffaaa5', '#ff8b94'] },
  { name: 'Powder Blue',   stops: ['#e3f2fd', '#90caf9'] },
  { name: 'Macaroon',      stops: ['#f8b4c8', '#c8f8b4', '#b4c8f8'] },
  { name: 'Lilac',         stops: ['#f3e5f5', '#ce93d8'] },
  { name: 'Honeydew',      stops: ['#f1f8e9', '#a5d6a7'] },
  { name: 'Cloud',         stops: ['#e3f2fd', '#fce4ec'] },
  { name: 'Vanilla',       stops: ['#fff8e1', '#ffe082'] },
  { name: 'Cake',          stops: ['#fce4ec', '#fff9c4', '#e8f5e9'] },
  { name: 'Fondant',       stops: ['#f8bbd0', '#e1bee7', '#bbdefb'] },
  { name: 'Sherbet',       stops: ['#ff9a9e', '#fad0c4', '#ffeaa7'] },
]

const QUICK_PRESET_NAMES = ['Ocean', 'Sunset', 'Forest', 'Ice', 'Cosmic', 'Fire']
const QUICK_PRESETS = ALL_GRADIENT_PRESETS.filter(p => QUICK_PRESET_NAMES.includes(p.name))

export type { TextSegment, RichLine, RichLines }

// ── shared padding must match form-input ──────────────────────────────────────
const PAD = '0.375rem 0.625rem' // py-1.5 px-2.5 — compact for this editor

// ── preset browser modal ──────────────────────────────────────────────────────
function PresetBrowser({ onSelect, onClose }: { onSelect: (stops: string[]) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handle)
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('mousedown', handle); document.removeEventListener('keydown', handleKey) }
  }, [onClose])

  const filtered = ALL_GRADIENT_PRESETS.filter(p =>
    p.name.toLowerCase().includes(query.toLowerCase())
  )

  return createPortal(
    <div data-grad-browser className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 999999, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div ref={ref} className="rounded-2xl p-5 w-[520px] max-w-[95vw] max-h-[80vh] flex flex-col gap-4"
        style={{ backgroundColor: 'rgb(var(--panel))', border: '1px solid rgb(var(--border))', boxShadow: '0 24px 60px rgba(0,0,0,.4)' }}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} />
            <span className="font-semibold text-sm" style={{ color: 'rgb(var(--text))' }}>Gradient Presets</span>
            <span className="text-xs rounded-full px-2 py-0.5" style={{ backgroundColor: 'rgb(var(--border))', color: 'rgb(var(--muted))' }}>{filtered.length}</span>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 transition-colors"
            style={{ color: 'rgb(var(--muted))' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgb(var(--border))')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Search */}
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search presets…"
          className="form-input text-sm"
        />
        {/* Grid */}
        <div className="overflow-y-auto flex-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {filtered.map(p => {
              const grad = `linear-gradient(90deg, ${p.stops.join(',')})`
              return (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => { onSelect(p.stops); onClose() }}
                  className="rounded-xl overflow-hidden text-left transition-all hover:scale-[1.03] hover:shadow-lg"
                  style={{ border: '1px solid rgb(var(--border))' }}
                >
                  <div className="h-10" style={{ background: grad }} />
                  <div className="px-2.5 py-1.5" style={{ backgroundColor: 'rgb(var(--bg))' }}>
                    <span className="text-xs font-medium" style={{ color: 'rgb(var(--text))' }}>{p.name}</span>
                  </div>
                </button>
              )
            })}
          </div>
          {filtered.length === 0 && (
            <p className="text-sm text-center py-8" style={{ color: 'rgb(var(--muted))' }}>No presets found</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── toolbar button ────────────────────────────────────────────────────────────
function TB({
  onClick, disabled, active, style, children, title,
}: {
  onClick: () => void
  disabled?: boolean
  active?: boolean
  style?: CSSProperties
  children: React.ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="h-7 min-w-[1.75rem] px-1.5 rounded-md text-xs font-medium transition-all select-none"
      style={{
        backgroundColor: active ? 'rgb(var(--accent) / 0.15)' : 'transparent',
        color: active ? 'rgb(var(--accent))' : disabled ? 'rgb(var(--border))' : 'rgb(var(--muted))',
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span className="w-px h-4 mx-0.5 self-center" style={{ backgroundColor: 'rgb(var(--border))' }} />
}

// ── gradient popover (portalled to body to escape stacking contexts) ──────────

function GradientPopover({
  anchorRef,
  popoverRef,
  stops,
  onStopsChange,
  onApply,
  onApplyPreset,
}: {
  anchorRef: React.RefObject<HTMLDivElement | null>
  popoverRef: React.RefObject<HTMLDivElement>
  stops: string[]
  onStopsChange: (stops: string[]) => void
  onApply: () => void
  onApplyPreset: (stops: string[]) => void
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [browseOpen, setBrowseOpen] = useState(false)

  useEffect(() => {
    const el = anchorRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX })
  }, [])

  const updateStop = (i: number, hex: string) =>
    onStopsChange(stops.map((s, j) => j === i ? hex : s))
  const addStop = () => onStopsChange([...stops, stops[stops.length - 1] ?? '#ffffff'])
  const removeStop = (i: number) => { if (stops.length > 2) onStopsChange(stops.filter((_, j) => j !== i)) }

  const gradCss = stops.length > 1 ? `linear-gradient(to right, ${stops.join(',')})` : stops[0]

  return createPortal(
    <>
    <div
      ref={popoverRef}
      className="p-3 rounded-xl w-60 space-y-3"
      style={{
        position: 'absolute',
        top: pos.top,
        left: pos.left,
        zIndex: 99999,
        backgroundColor: 'rgb(var(--panel))',
        border: '1px solid rgb(var(--border))',
        boxShadow: '0 8px 32px rgba(0,0,0,.25)',
      }}
      onMouseDown={e => e.preventDefault()}
    >
      {/* Presets */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-medium" style={{ color: 'rgb(var(--muted))' }}>Presets</p>
          <button
            type="button"
            onClick={() => setBrowseOpen(true)}
            className="text-xs flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors"
            style={{ color: 'rgb(var(--accent))' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgb(var(--accent) / 0.1)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <Sparkles className="w-3 h-3" /> Browse
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {QUICK_PRESETS.map(p => (
            <button
              key={p.name}
              type="button"
              onClick={() => onApplyPreset(p.stops)}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-left transition-all hover:scale-[1.03]"
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

      {/* Custom stops */}
      <div style={{ borderTop: '1px solid rgb(var(--border))', paddingTop: '0.75rem' }}>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-medium" style={{ color: 'rgb(var(--muted))' }}>Colors</p>
          <button
            type="button"
            onClick={addStop}
            className="text-xs flex items-center gap-0.5"
            style={{ color: 'rgb(var(--accent))' }}
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>

        {/* Preview bar */}
        <div className="h-3 rounded-md mb-2" style={{ background: gradCss }} />

        <div className="space-y-1.5">
          {stops.map((hex, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs w-3 text-center" style={{ color: 'rgb(var(--muted))' }}>{i + 1}</span>
              <input
                type="color"
                value={hex}
                onChange={e => updateStop(i, e.target.value)}
                className="w-7 h-7 rounded cursor-pointer border-0 p-0 shrink-0"
              />
              <input
                className="form-input font-mono text-xs flex-1 py-0.5"
                value={hex}
                onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) updateStop(i, e.target.value) }}
                maxLength={7}
              />
              <button
                type="button"
                onClick={() => removeStop(i)}
                disabled={stops.length <= 2}
                className="disabled:opacity-20"
                style={{ color: 'rgb(var(--muted))' }}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onApply}
          className="w-full text-xs py-1.5 rounded-lg font-medium mt-3"
          style={{ backgroundColor: 'rgb(var(--accent))', color: 'rgb(var(--accent-fg))' }}
        >
          Apply to selection
        </button>
      </div>
    </div>
    {browseOpen && (
      <PresetBrowser
        onSelect={(stops) => { onApplyPreset(stops); setBrowseOpen(false) }}
        onClose={() => setBrowseOpen(false)}
      />
    )}
    </>,
    document.body,
  )
}

// ── click / hover events modal ────────────────────────────────────────────────

const CLICK_ACTIONS: { id: ClickAction; label: string; placeholder: string }[] = [
  { id: 'open_url',          label: 'Open URL',          placeholder: 'https://example.com' },
  { id: 'run_command',       label: 'Run command',       placeholder: '/say Hello!' },
  { id: 'suggest_command',   label: 'Suggest command',   placeholder: '/msg @p ' },
  { id: 'copy_to_clipboard', label: 'Copy to clipboard', placeholder: 'Text to copy' },
  { id: 'change_page',       label: 'Change page (books)', placeholder: '2' },
]

type HoverKind = 'none' | 'show_text' | 'show_item' | 'show_entity'

function randomUuid() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : '00000000-0000-4000-8000-000000000000'.replace(/0/g, () => Math.floor(Math.random() * 16).toString(16))
}

function EventsModal({
  initial, selectedText, onApply, onClose,
}: {
  initial: TextEvents | undefined
  selectedText: string
  onApply: (ev: TextEvents | undefined) => void
  onClose: () => void
}) {
  const [clickAction, setClickAction] = useState<ClickAction | 'none'>(initial?.click?.action ?? 'none')
  const [clickValue, setClickValue] = useState(initial?.click?.value ?? '')
  const h = initial?.hover
  const [hoverKind, setHoverKind] = useState<HoverKind>(h?.action ?? 'none')
  const [hoverLines, setHoverLines] = useState<RichLines>(h?.action === 'show_text' ? h.lines : [[]])
  const [itemId, setItemId] = useState(h?.action === 'show_item' ? h.id : 'diamond_sword')
  const [itemCount, setItemCount] = useState(h?.action === 'show_item' ? h.count : 1)
  const [entityId, setEntityId] = useState(h?.action === 'show_entity' ? h.id : 'minecraft:zombie')
  const [entityUuid, setEntityUuid] = useState(h?.action === 'show_entity' ? h.uuid : randomUuid)
  const [entityName, setEntityName] = useState<RichLine>(h?.action === 'show_entity' ? h.name : [])
  const [insertion, setInsertion] = useState(initial?.insertion ?? '')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Let nested popups (gradient preset browser) consume Escape first
      if (e.key === 'Escape' && !document.querySelector('[data-grad-browser]')) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const clickMeta = CLICK_ACTIONS.find(a => a.id === clickAction)
  const urlInvalid = clickAction === 'open_url' && clickValue !== '' && !/^https?:\/\//i.test(clickValue)
  const pageInvalid = clickAction === 'change_page' && clickValue !== '' && !/^[1-9]\d*$/.test(clickValue)

  const build = (): TextEvents | undefined => {
    const ev: TextEvents = {}
    if (clickAction !== 'none' && clickValue) ev.click = { action: clickAction, value: clickValue }
    if (hoverKind === 'show_text') {
      const lines = hoverLines.filter(l => l.some(seg => seg.text))
      if (lines.length) ev.hover = { action: 'show_text', lines }
    } else if (hoverKind === 'show_item' && itemId) {
      ev.hover = { action: 'show_item', id: itemId, count: Math.max(1, Math.min(99, itemCount || 1)) }
    } else if (hoverKind === 'show_entity' && entityId) {
      ev.hover = { action: 'show_entity', id: entityId, uuid: entityUuid, name: entityName }
    }
    if (insertion) ev.insertion = insertion
    return hasEvents(ev) ? ev : undefined
  }

  const section = 'space-y-2 pt-4'
  const sectionStyle = { borderTop: '1px solid rgb(var(--border))' }

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 9000, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onMouseDown={e => { e.stopPropagation(); if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="rounded-2xl p-5 w-[560px] max-w-full max-h-[90vh] overflow-y-auto space-y-4"
        style={{ backgroundColor: 'rgb(var(--panel))', border: '1px solid rgb(var(--border))', boxShadow: '0 24px 60px rgba(0,0,0,.4)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <MousePointerClick className="w-4 h-4 shrink-0" style={{ color: 'rgb(var(--accent))' }} />
            <span className="font-semibold text-sm shrink-0" style={{ color: 'rgb(var(--text))' }}>Click &amp; hover events</span>
            <span className="text-xs font-mono truncate rounded px-1.5 py-0.5" style={{ backgroundColor: 'rgb(var(--border) / 0.5)', color: 'rgb(var(--muted))' }}>
              {selectedText}
            </span>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1" style={{ color: 'rgb(var(--muted))' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Click */}
        <div className="space-y-2">
          <label className="form-label">On click</label>
          <select className="form-input" value={clickAction} onChange={e => setClickAction(e.target.value as ClickAction | 'none')}>
            <option value="none">Nothing</option>
            {CLICK_ACTIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          {clickMeta && (
            <>
              <input
                className="form-input font-mono text-sm"
                value={clickValue}
                onChange={e => setClickValue(e.target.value)}
                placeholder={clickMeta.placeholder}
                autoFocus
              />
              {urlInvalid && <p className="text-xs text-red-500">URLs must start with http:// or https://</p>}
              {pageInvalid && <p className="text-xs text-red-500">Page must be a positive number</p>}
            </>
          )}
        </div>

        {/* Hover */}
        <div className={section} style={sectionStyle}>
          <label className="form-label">On hover</label>
          <select className="form-input" value={hoverKind} onChange={e => setHoverKind(e.target.value as HoverKind)}>
            <option value="none">Nothing</option>
            <option value="show_text">Show text (tooltip)</option>
            <option value="show_item">Show item</option>
            <option value="show_entity">Show entity</option>
          </select>
          {hoverKind === 'show_text' && (
            <RichLoreEditor
              value={hoverLines}
              onChange={setHoverLines}
              label="Tooltip lines"
              addLabel="Add tooltip line"
              linePlaceholder={i => `Tooltip line ${i + 1}`}
            />
          )}
          {hoverKind === 'show_item' && (
            <div className="flex gap-2">
              <ItemPicker value={itemId} onChange={setItemId} className="flex-1" />
              <input
                type="number" min={1} max={99}
                className="form-input w-20"
                value={itemCount}
                onChange={e => setItemCount(parseInt(e.target.value) || 1)}
                title="Count"
              />
            </div>
          )}
          {hoverKind === 'show_entity' && (
            <div className="space-y-2">
              <input className="form-input font-mono text-sm" value={entityId} onChange={e => setEntityId(e.target.value)} placeholder="minecraft:zombie" />
              <div className="flex gap-2">
                <input className="form-input font-mono text-xs flex-1" value={entityUuid} onChange={e => setEntityUuid(e.target.value)} placeholder="UUID" />
                <button type="button" className="btn-ghost px-2" title="Random UUID" onClick={() => setEntityUuid(randomUuid())}>
                  <Shuffle className="w-3.5 h-3.5" />
                </button>
              </div>
              <RichNameEditor label="Entity name" hint="(optional)" value={entityName} onChange={setEntityName} placeholder="Name shown in tooltip" />
            </div>
          )}
        </div>

        {/* Insertion */}
        <div className={section} style={sectionStyle}>
          <label className="form-label">
            On shift-click <span className="font-normal" style={{ color: 'rgb(var(--muted))' }}>(insert into chat)</span>
          </label>
          <input className="form-input text-sm" value={insertion} onChange={e => setInsertion(e.target.value)} placeholder="Optional" />
        </div>

        <div className="flex items-center gap-2 pt-2">
          {hasEvents(initial) && (
            <button type="button" className="btn-ghost text-xs px-3 py-1.5" onClick={() => onApply(undefined)}>
              Remove events
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" className="btn-secondary text-xs px-3 py-1.5" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="text-xs px-4 py-1.5 rounded-lg font-medium disabled:opacity-40"
              style={{ backgroundColor: 'rgb(var(--accent))', color: 'rgb(var(--accent-fg))' }}
              disabled={urlInvalid || pageInvalid}
              onClick={() => onApply(build())}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── single rich line editor ───────────────────────────────────────────────────

interface LineEditorProps {
  value: RichLine
  onChange: (line: RichLine) => void
  placeholder?: string
  onDelete?: () => void
  autoFocus?: boolean
  /** When true, new characters default to italic (matches Minecraft's custom_name behavior) */
  defaultItalic?: boolean
  /** Show the click / hover events button (tellraw-style output) */
  enableEvents?: boolean
}

export function RichLineEditor({ value, onChange, placeholder, onDelete, autoFocus, defaultItalic, enableEvents }: LineEditorProps) {
  const defaultFmt = useMemo(() => (defaultItalic ? { italic: true } : {}), [defaultItalic])
  const { text: initText, fmts: initFmts } = useMemo(() => fromSegments(value), [])
  const [text, setText] = useState(initText)
  // If defaultItalic and no existing fmts, each char will inherit defaultFmt on first keystroke
  const [fmts, setFmts] = useState(initFmts)
  const [sel, setSel] = useState<{ s: number; e: number } | null>(null)
  const [gradStops, setGradStops] = useState<string[]>(['#ff0000', '#0000ff'])
  const [gradOpen, setGradOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [caret, setCaret] = useState(0)
  const [eventsOpen, setEventsOpen] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const prevSel = useRef({ s: 0, e: 0 })
  const gradRef = useRef<HTMLDivElement>(null)
  const gradPopoverRef = useRef<HTMLDivElement>(null)

  // Emit changes upward
  useEffect(() => {
    onChange(toSegments(text, fmts))
  }, [text, fmts])

  // Capture selection BEFORE input changes value
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const onBI = () => {
      prevSel.current = { s: el.selectionStart ?? 0, e: el.selectionEnd ?? 0 }
    }
    el.addEventListener('beforeinput', onBI)
    return () => el.removeEventListener('beforeinput', onBI)
  }, [])

  // Close gradient popover on outside click
  useEffect(() => {
    if (!gradOpen) return
    const fn = (e: MouseEvent) => {
      const t = e.target as Node
      if (
        gradRef.current && !gradRef.current.contains(t) &&
        gradPopoverRef.current && !gradPopoverRef.current.contains(t) &&
        !(t as Element).closest?.('[data-grad-browser]')
      ) setGradOpen(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [gradOpen])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const nv = e.target.value
    const { s: ps, e: pe } = prevSel.current
    const deletedLen = pe - ps
    const insertedLen = nv.length - text.length + deletedLen

    const prevFmt = fmts[ps > 0 ? ps - 1 : 0] ?? defaultFmt
    // Only stay inside a click/hover range when typing strictly within it
    const inheritFmt = prevFmt.events && !sameEvents(prevFmt.events, fmts[pe]?.events)
      ? (({ events: _ev, ...rest }) => rest)(prevFmt)
      : prevFmt
    const next = [
      ...fmts.slice(0, ps),
      ...Array(Math.max(0, insertedLen)).fill({ ...inheritFmt }),
      ...fmts.slice(pe),
    ].slice(0, nv.length)

    setText(nv)
    setFmts(next)
  }, [text, fmts])

  const updateSel = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    const s = el.selectionStart ?? 0, e = el.selectionEnd ?? 0
    setSel(s < e ? { s, e } : null)
    setCaret(s)
  }, [])

  const hasSel = sel !== null

  const applyPatch = useCallback((patch: Partial<Omit<TextSegment, 'text'>>) => {
    if (!sel) return
    setFmts(prev => {
      const next = [...prev]
      for (let i = sel.s; i < sel.e; i++) next[i] = { ...next[i], ...patch }
      return next
    })
  }, [sel])

  const toggle = useCallback((prop: 'bold' | 'italic' | 'underlined' | 'strikethrough' | 'obfuscated') => {
    if (!sel) return
    const allSet = fmts.slice(sel.s, sel.e).every(f => !!f[prop])
    applyPatch({ [prop]: allSet ? undefined : true })
  }, [sel, fmts, applyPatch])

  const selHas = (prop: keyof Omit<TextSegment, 'text'>) =>
    hasSel && fmts.slice(sel!.s, sel!.e).every(f => !!f[prop])

  const applyStops = useCallback((stops: string[]) => {
    if (!sel) return
    const len = sel.e - sel.s
    const colors = interpolateColors(stops, Math.max(len, 1), 'rgb')
    setFmts(prev => {
      const next = [...prev]
      for (let i = sel.s; i < sel.e; i++) next[i] = { ...next[i], color: colors[i - sel.s] }
      return next
    })
    setGradOpen(false)
  }, [sel])

  const applyGradient = () => applyStops(gradStops)

  const applyPresetGradient = useCallback((stops: string[]) => {
    setGradStops(stops)
    applyStops(stops)
  }, [applyStops])

  const openGradient = useCallback(() => {
    if (!sel) return
    // Read existing colors from selection to pre-populate stops
    const selColors = fmts.slice(sel.s, sel.e).map(f => f.color).filter(Boolean) as string[]
    if (selColors.length >= 2) {
      // Deduplicate consecutive, then sample first + last (+ optionally middle)
      const deduped = selColors.filter((c, i) => i === 0 || c !== selColors[i - 1])
      if (deduped.length === 2) {
        setGradStops(deduped)
      } else if (deduped.length > 2) {
        // Keep first, evenly-spaced midpoints, last — up to 5 stops
        const step = (deduped.length - 1) / Math.min(deduped.length - 1, 4)
        const sampled = Array.from({ length: Math.min(deduped.length, 5) }, (_, k) =>
          deduped[Math.round(k * step)]
        )
        setGradStops(sampled)
      } else {
        setGradStops([deduped[0], deduped[0]])
      }
    }
    setGradOpen(v => !v)
  }, [sel, fmts])

  const clearFmt = () => {
    if (!sel) return
    setFmts(prev => {
      const next = [...prev]
      // Keep click/hover events — they have their own remove button
      for (let i = sel.s; i < sel.e; i++) next[i] = next[i]?.events ? { events: next[i].events } : {}
      return next
    })
  }

  // Range of the click/hover span the caret sits in (when nothing is selected)
  const caretEventRange = useMemo(() => {
    if (!enableEvents || sel) return null
    const at = [caret, caret - 1].find(i => i >= 0 && i < text.length && hasEvents(fmts[i]?.events))
    if (at === undefined) return null
    const ev = fmts[at].events
    let s = at, e = at + 1
    while (s > 0 && sameEvents(fmts[s - 1]?.events, ev)) s--
    while (e < text.length && sameEvents(fmts[e]?.events, ev)) e++
    return { s, e }
  }, [enableEvents, sel, caret, text, fmts])

  const eventTarget = sel ?? caretEventRange

  const openEvents = () => {
    if (!eventTarget) return
    if (!sel) {
      inputRef.current?.setSelectionRange(eventTarget.s, eventTarget.e)
      setSel(eventTarget)
    }
    setEventsOpen(true)
  }

  const applyEvents = (ev: TextEvents | undefined) => {
    if (eventTarget) {
      const { s, e } = eventTarget
      setFmts(prev => {
        const next = [...prev]
        for (let i = s; i < e; i++) {
          const { events: _old, ...rest } = next[i] ?? {}
          next[i] = ev ? { ...rest, events: ev } : rest
        }
        return next
      })
    }
    setEventsOpen(false)
    inputRef.current?.focus()
  }

  const selHasEvents = !!eventTarget && fmts.slice(eventTarget.s, eventTarget.e).some(f => hasEvents(f?.events))

  // Overlay spans
  const segments = useMemo(() => toSegments(text, fmts), [text, fmts])

  return (
    <div className="rounded-xl overflow-visible" style={{ border: '1px solid rgb(var(--border))' }}>
      {/* Toolbar — onMouseDown preventDefault keeps input focus + selection intact */}
      <div
        className="flex flex-wrap gap-0.5 items-center px-2 py-1"
        style={{ borderBottom: '1px solid rgb(var(--border))' }}
        onMouseDown={e => e.preventDefault()}
      >
        <TB onClick={() => toggle('bold')} disabled={!hasSel} active={selHas('bold')} title="Bold" style={{ fontWeight: 'bold' }}>B</TB>
        <TB onClick={() => toggle('italic')} disabled={!hasSel} active={selHas('italic')} title="Italic" style={{ fontStyle: 'italic' }}>I</TB>
        <TB onClick={() => toggle('underlined')} disabled={!hasSel} active={selHas('underlined')} title="Underline" style={{ textDecoration: 'underline' }}>U</TB>
        <TB onClick={() => toggle('strikethrough')} disabled={!hasSel} active={selHas('strikethrough')} title="Strikethrough" style={{ textDecoration: 'line-through' }}>S</TB>
        <TB onClick={() => toggle('obfuscated')} disabled={!hasSel} active={selHas('obfuscated')} title="Obfuscated">Obf</TB>

        <Divider />

        {/* Color picker — save selection on mousedown before color picker steals focus */}
        <label
          title="Color"
          className="relative h-7 w-7 rounded-md overflow-hidden cursor-pointer flex items-center justify-center"
          style={{ opacity: hasSel ? 1 : 0.3, pointerEvents: hasSel ? 'auto' : 'none' }}
          onMouseDown={e => {
            e.preventDefault()           // keep input focused
            updateSel()                  // snapshot selection now
          }}
        >
          <span className="w-4 h-4 rounded-sm border" style={{ backgroundColor: (hasSel && fmts[sel!.s]?.color) || '#aaaaaa', borderColor: 'rgb(var(--border))' }} />
          <input
            type="color"
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            value={(hasSel && fmts[sel!.s]?.color) || '#aaaaaa'}
            onChange={e => applyPatch({ color: e.target.value })}
          />
        </label>

        {/* Gradient */}
        <div ref={gradRef} className="relative">
          <TB onClick={openGradient} disabled={!hasSel} active={gradOpen} title="Gradient">
            Gradient
          </TB>
          {gradOpen && <GradientPopover
            anchorRef={gradRef}
            popoverRef={gradPopoverRef}
            stops={gradStops}
            onStopsChange={setGradStops}
            onApply={applyGradient}
            onApplyPreset={applyPresetGradient}
          />}
        </div>

        {enableEvents && (
          <>
            <Divider />
            <TB onClick={openEvents} disabled={!eventTarget} active={selHasEvents} title="Click & hover events">
              <span className="flex items-center gap-1"><MousePointerClick className="w-3.5 h-3.5" /> Events</span>
            </TB>
          </>
        )}

        <Divider />
        <TB onClick={clearFmt} disabled={!hasSel} title="Clear formatting">Clear</TB>

        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="ml-auto h-7 w-7 rounded-md flex items-center justify-center transition-colors"
            style={{ color: 'rgb(var(--muted))' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgb(var(--border) / 0.5)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Editor area: CSS grid overlay trick */}
      <div style={{ display: 'grid', padding: 0 }}>
        {/* Styled overlay (aria-hidden) */}
        <div
          aria-hidden
          className="text-sm font-mono whitespace-pre select-none overflow-hidden"
          style={{
            gridArea: '1/1',
            padding: PAD,
            color: 'rgb(var(--text))',
            pointerEvents: 'none',
            zIndex: 1,
            minHeight: '2rem',
          }}
        >
          {text
            ? segments.map((seg, i) => (
                <span
                  key={i}
                  style={seg.events
                    ? { ...segmentStyle(seg), backgroundColor: 'rgb(var(--accent) / 0.18)', borderRadius: 2 }
                    : segmentStyle(seg)}
                >{seg.text}</span>
              ))
            : <span style={{ color: 'rgb(var(--muted))', opacity: 0.5 }}>{placeholder}</span>}
        </div>

        {/* Real input — transparent text, visible caret */}
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={text}
          onChange={handleChange}
          onSelect={updateSel}
          onMouseUp={updateSel}
          onKeyUp={updateSel}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false) }}  // keep sel so toolbar clicks can still read it
          className="text-sm font-mono rounded-b-xl outline-none"
          style={{
            gridArea: '1/1',
            padding: PAD,
            color: 'transparent',
            caretColor: 'rgb(var(--text))',
            backgroundColor: 'transparent',
            border: 'none',
            zIndex: 2,
            position: 'relative',
            boxShadow: focused ? '0 0 0 2px rgb(var(--accent) / 0.4) inset' : undefined,
            borderRadius: '0 0 0.75rem 0.75rem',
          }}
        />
      </div>

      {/* Selection hint */}
      {focused && !hasSel && text && (
        <p className="px-2 pb-1.5 text-xs" style={{ color: 'rgb(var(--muted))' }}>
          Select text to apply formatting{enableEvents ? ' or click & hover events' : ''}
        </p>
      )}

      {eventsOpen && eventTarget && (
        <EventsModal
          initial={fmts[eventTarget.s]?.events}
          selectedText={text.slice(eventTarget.s, eventTarget.e)}
          onApply={applyEvents}
          onClose={() => setEventsOpen(false)}
        />
      )}
    </div>
  )
}

// ── name editor (single line) ─────────────────────────────────────────────────

interface NameEditorProps {
  label: string
  value: RichLine
  onChange: (line: RichLine) => void
  placeholder?: string
  hint?: string
  defaultItalic?: boolean
}

export function RichNameEditor({ label, value, onChange, placeholder, hint, defaultItalic }: NameEditorProps) {
  return (
    <div className="space-y-1">
      <label className="form-label">
        {label}
        {hint && <span style={{ color: 'rgb(var(--muted))' }} className="font-normal ml-1">{hint}</span>}
      </label>
      <RichLineEditor value={value} onChange={onChange} placeholder={placeholder} defaultItalic={defaultItalic} />
    </div>
  )
}

// ── lore editor (multiple lines) ──────────────────────────────────────────────

interface LoreEditorProps {
  value: RichLines
  onChange: (lines: RichLines) => void
  label?: string
  addLabel?: string
  linePlaceholder?: (i: number) => string
  enableEvents?: boolean
}

export function RichLoreEditor({ value, onChange, label = 'Lore', addLabel = 'Add lore line', linePlaceholder, enableEvents }: LoreEditorProps) {
  const addLine = () => onChange([...value, []])
  const removeLine = (i: number) => onChange(value.filter((_, j) => j !== i))
  const updateLine = (i: number, line: RichLine) => onChange(value.map((l, j) => j === i ? line : l))

  return (
    <div className="space-y-1">
      <label className="form-label">{label}</label>
      <div className="space-y-2">
        {value.map((line, i) => (
          <RichLineEditor
            key={i}
            value={line}
            onChange={l => updateLine(i, l)}
            placeholder={linePlaceholder ? linePlaceholder(i) : `${label} line ${i + 1}`}
            onDelete={() => removeLine(i)}
            enableEvents={enableEvents}
          />
        ))}
        <button
          type="button"
          onClick={addLine}
          className="btn-ghost rounded-lg px-3 py-1.5 text-xs flex items-center gap-1.5"
        >
          <Plus className="w-3 h-3" /> {addLabel}
        </button>
      </div>
    </div>
  )
}
