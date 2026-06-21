import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search, Loader2, AlertCircle } from 'lucide-react'
import { useMinecraftItems, type McItem } from '../hooks/useMinecraftItems'

interface ItemPickerProps {
  value: string
  onChange: (name: string) => void
  filter?: (item: McItem) => boolean
  placeholder?: string
  className?: string
}

export function ItemPicker({ value, onChange, filter, placeholder = 'Select item…', className = '' }: ItemPickerProps) {
  const { items, loading, error } = useMinecraftItems()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [rect, setRect] = useState<DOMRect | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const base = filter ? items.filter(filter) : items
    const q = query.trim().toLowerCase()
    if (!q) return base.slice(0, 100)
    return base
      .filter((it) => it.name.includes(q) || it.displayName.toLowerCase().includes(q))
      .slice(0, 100)
  }, [items, filter, query])

  function openDropdown() {
    setRect(btnRef.current?.getBoundingClientRect() ?? null)
    setOpen(true)
  }

  // Update rect on scroll/resize while open
  useEffect(() => {
    if (!open) return
    const update = () => setRect(btnRef.current?.getBoundingClientRect() ?? null)
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const id = setTimeout(() => inputRef.current?.focus(), 30)
    return () => clearTimeout(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (!btnRef.current?.contains(t) && !dropRef.current?.contains(t)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function select(name: string) {
    onChange(name)
    setOpen(false)
    setQuery('')
  }

  const displayLabel = value
    ? items.find((it) => it.name === value)?.displayName ?? value
    : null

  const dropStyle: React.CSSProperties = rect
    ? {
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      }
    : { display: 'none' }

  return (
    <div className={className}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openDropdown())}
        className="form-input w-full flex items-center gap-2 text-left"
        style={{ paddingRight: '2.25rem', position: 'relative' }}
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" style={{ color: 'rgb(var(--muted))' }} />
        ) : error ? (
          <AlertCircle className="w-3.5 h-3.5 shrink-0" style={{ color: 'rgb(var(--accent))' }} />
        ) : null}
        <span className={`flex-1 truncate font-mono text-sm ${!displayLabel ? 'opacity-50' : ''}`}>
          {displayLabel ?? placeholder}
        </span>
        <ChevronDown
          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
          style={{
            color: 'rgb(var(--muted))',
            transform: open ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)',
            transition: 'transform 150ms',
          }}
        />
      </button>

      {open && createPortal(
        <div
          ref={dropRef}
          style={{
            ...dropStyle,
            backgroundColor: 'rgb(var(--panel))',
            border: '1px solid rgb(var(--border))',
            borderRadius: '0.75rem',
            boxShadow: '0 8px 32px rgba(0,0,0,.22)',
            overflow: 'hidden',
          }}
        >
          {/* Search */}
          <div className="p-2" style={{ borderBottom: '1px solid rgb(var(--border))' }}>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'rgb(var(--muted))' }} />
              <input
                ref={inputRef}
                className="form-input pl-8 text-sm py-1.5"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search items…"
              />
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-56">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm" style={{ color: 'rgb(var(--muted))' }}>
                <Loader2 className="w-4 h-4 animate-spin" /> Loading items…
              </div>
            )}
            {error && (
              <div className="py-4 px-3 text-sm" style={{ color: 'rgb(var(--muted))' }}>
                Failed to load items: {error}
              </div>
            )}
            {!loading && !error && filtered.length === 0 && (
              <div className="py-4 px-3 text-sm" style={{ color: 'rgb(var(--muted))' }}>No items found.</div>
            )}
            {!loading && !error && filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => select(item.name)}
                className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm"
                style={{
                  backgroundColor: item.name === value ? 'rgb(var(--accent) / 0.1)' : 'transparent',
                  color: item.name === value ? 'rgb(var(--accent))' : 'rgb(var(--text))',
                }}
                onMouseEnter={(e) => { if (item.name !== value) e.currentTarget.style.backgroundColor = 'rgb(var(--border) / 0.4)' }}
                onMouseLeave={(e) => { if (item.name !== value) e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                <span className="font-mono text-xs shrink-0" style={{ color: 'rgb(var(--muted))' }}>{item.name}</span>
                <span className="truncate ml-auto text-xs" style={{ color: item.name === value ? 'rgb(var(--accent))' : 'rgb(var(--muted))' }}>
                  {item.displayName}
                </span>
              </button>
            ))}
            {!loading && !error && filtered.length === 100 && (
              <p className="text-center text-xs py-2" style={{ color: 'rgb(var(--muted))' }}>
                Type to narrow results…
              </p>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// Preset filters
export const CONTAINER_ITEMS = new Set([
  'chest','trapped_chest','barrel','shulker_box',
  'white_shulker_box','orange_shulker_box','magenta_shulker_box','light_blue_shulker_box',
  'yellow_shulker_box','lime_shulker_box','pink_shulker_box','gray_shulker_box',
  'light_gray_shulker_box','cyan_shulker_box','purple_shulker_box','blue_shulker_box',
  'brown_shulker_box','green_shulker_box','red_shulker_box','black_shulker_box',
  'hopper','dropper','dispenser','furnace','blast_furnace','smoker',
  'brewing_stand','chiseled_bookshelf',
])

export function containerFilter(item: McItem) {
  return CONTAINER_ITEMS.has(item.name)
}
