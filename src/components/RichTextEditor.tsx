import { useState, useRef, useEffect, useMemo, useCallback, type CSSProperties } from 'react'
import { Plus, X } from 'lucide-react'
import {
  type TextSegment, type RichLine, type RichLines,
  lerpColor, toSegments, fromSegments, segmentStyle,
} from '../types/richText'

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
  const [gradFrom, setGradFrom] = useState('#ff0000')
  const [gradTo, setGradTo] = useState('#0000ff')
  const [gradOpen, setGradOpen] = useState(false)
  const [focused, setFocused] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const prevSel = useRef({ s: 0, e: 0 })
  const gradRef = useRef<HTMLDivElement>(null)

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
      if (gradRef.current && !gradRef.current.contains(e.target as Node)) setGradOpen(false)
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

  const applyGradient = () => {
    if (!sel) return
    const len = sel.e - sel.s
    setFmts(prev => {
      const next = [...prev]
      for (let i = sel.s; i < sel.e; i++) {
        const t = len <= 1 ? 0 : (i - sel.s) / (len - 1)
        next[i] = { ...next[i], color: lerpColor(gradFrom, gradTo, t) }
      }
      return next
    })
    setGradOpen(false)
  }

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
          <TB onClick={() => { if (hasSel) setGradOpen(v => !v) }} disabled={!hasSel} active={gradOpen} title="Gradient">
            Gradient
          </TB>
          {gradOpen && (
            <div
              className="absolute top-full left-0 mt-1 p-3 rounded-xl z-[9999] w-56 space-y-2.5"
              style={{ backgroundColor: 'rgb(var(--panel))', border: '1px solid rgb(var(--border))', boxShadow: '0 8px 32px rgba(0,0,0,.2)' }}
            >
              <p className="text-xs font-medium" style={{ color: 'rgb(var(--muted))' }}>Gradient colors</p>
              <div className="flex items-center gap-2">
                <input type="color" value={gradFrom} onChange={e => setGradFrom(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
                <div className="flex-1 h-5 rounded-md" style={{ background: `linear-gradient(to right, ${gradFrom}, ${gradTo})` }} />
                <input type="color" value={gradTo} onChange={e => setGradTo(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
              </div>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={applyGradient}
                className="w-full text-xs py-1.5 rounded-lg font-medium"
                style={{ backgroundColor: 'rgb(var(--accent))', color: 'rgb(var(--accent-fg))' }}
              >
                Apply to selection
              </button>
            </div>
          )}
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
