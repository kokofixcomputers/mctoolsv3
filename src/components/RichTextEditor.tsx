import { useState, useRef, useEffect, useMemo, useCallback, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Plus, X } from 'lucide-react'
import {
  type TextSegment, type RichLine, type RichLines,
  lerpColor, toSegments, fromSegments, segmentStyle,
} from '../types/richText'
import { interpolateColors } from '../tools/gradient/gradient'

const GRADIENT_PRESETS = [
  { name: 'Ocean',  stops: ['#00d2ff', '#3a7bd5'] },
  { name: 'Sunset', stops: ['#ff6b6b', '#feca57', '#ff9ff3'] },
  { name: 'Forest', stops: ['#56ab2f', '#a8e063'] },
  { name: 'Violet', stops: ['#7b2ff7', '#f107a3'] },
  { name: 'Fire',   stops: ['#f12711', '#f5af19'] },
  { name: 'Ice',    stops: ['#74ebd5', '#acb6e5'] },
]

export type { TextSegment, RichLine, RichLines }

// ── shared padding must match form-input ──────────────────────────────────────
const PAD = '0.375rem 0.625rem' // py-1.5 px-2.5 — compact for this editor

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
        <p className="text-xs font-medium mb-1.5" style={{ color: 'rgb(var(--muted))' }}>Presets</p>
        <div className="grid grid-cols-2 gap-1.5">
          {GRADIENT_PRESETS.map(p => (
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
}

export function RichLineEditor({ value, onChange, placeholder, onDelete, autoFocus, defaultItalic }: LineEditorProps) {
  const defaultFmt = useMemo(() => (defaultItalic ? { italic: true } : {}), [defaultItalic])
  const { text: initText, fmts: initFmts } = useMemo(() => fromSegments(value), [])
  const [text, setText] = useState(initText)
  // If defaultItalic and no existing fmts, each char will inherit defaultFmt on first keystroke
  const [fmts, setFmts] = useState(initFmts)
  const [sel, setSel] = useState<{ s: number; e: number } | null>(null)
  const [gradStops, setGradStops] = useState<string[]>(['#ff0000', '#0000ff'])
  const [gradOpen, setGradOpen] = useState(false)
  const [focused, setFocused] = useState(false)

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
        gradPopoverRef.current && !gradPopoverRef.current.contains(t)
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

    const inheritFmt = fmts[ps > 0 ? ps - 1 : 0] ?? defaultFmt
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
      for (let i = sel.s; i < sel.e; i++) next[i] = {}
      return next
    })
  }

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
            ? segments.map((seg, i) => <span key={i} style={segmentStyle(seg)}>{seg.text}</span>)
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
          Select text to apply formatting
        </p>
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
}

export function RichLoreEditor({ value, onChange }: LoreEditorProps) {
  const addLine = () => onChange([...value, []])
  const removeLine = (i: number) => onChange(value.filter((_, j) => j !== i))
  const updateLine = (i: number, line: RichLine) => onChange(value.map((l, j) => j === i ? line : l))

  return (
    <div className="space-y-1">
      <label className="form-label">Lore</label>
      <div className="space-y-2">
        {value.map((line, i) => (
          <RichLineEditor
            key={i}
            value={line}
            onChange={l => updateLine(i, l)}
            placeholder={`Lore line ${i + 1}`}
            onDelete={() => removeLine(i)}
          />
        ))}
        <button
          type="button"
          onClick={addLine}
          className="btn-ghost rounded-lg px-3 py-1.5 text-xs flex items-center gap-1.5"
        >
          <Plus className="w-3 h-3" /> Add lore line
        </button>
      </div>
    </div>
  )
}
