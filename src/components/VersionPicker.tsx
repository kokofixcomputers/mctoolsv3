import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search, Check } from 'lucide-react'
import { MC_VERSIONS, useVersion, type McVersion } from '../contexts/VersionContext'

export function VersionPicker() {
  const { version, setVersion } = useVersion()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // Focus search when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  const filtered = MC_VERSIONS.filter((v) =>
    v.label.toLowerCase().includes(query.toLowerCase())
  )

  function select(v: McVersion) {
    setVersion(v)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all"
        style={{
          border: '1px solid rgb(var(--border))',
          backgroundColor: open ? 'rgb(var(--border) / 0.5)' : 'transparent',
          color: 'rgb(var(--text))',
        }}
      >
        <span className="text-xs font-semibold rounded px-1.5 py-0.5"
          style={{ backgroundColor: 'rgb(var(--accent) / 0.12)', color: 'rgb(var(--accent))' }}>
          MC
        </span>
        {version.label}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          style={{ color: 'rgb(var(--muted))' }} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 z-50 w-52 rounded-xl overflow-hidden"
          style={{
            backgroundColor: 'rgb(var(--panel))',
            border: '1px solid rgb(var(--border))',
            boxShadow: '0 16px 40px rgba(0,0,0,.14), inset 0 1px 0 rgba(255,255,255,.12)',
          }}
        >
          {/* Search */}
          <div className="p-2" style={{ borderBottom: '1px solid rgb(var(--border))' }}>
            <div className="flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ backgroundColor: 'rgb(var(--bg))', border: '1px solid rgb(var(--border))' }}>
              <Search className="w-3.5 h-3.5 shrink-0" style={{ color: 'rgb(var(--muted))' }} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search version…"
                className="bg-transparent text-sm outline-none flex-1 min-w-0"
                style={{ color: 'rgb(var(--text))' }}
              />
            </div>
          </div>

          {/* List */}
          <div className="py-1 max-h-52 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-4 py-3 text-sm" style={{ color: 'rgb(var(--muted))' }}>
                No versions found
              </div>
            )}
            {filtered.map((v) => (
              <button
                key={v.id}
                onClick={() => select(v)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors"
                style={{ color: 'rgb(var(--text))' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgb(var(--border) / 0.4)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Java {v.label}</span>
                {version.id === v.id && (
                  <Check className="w-3.5 h-3.5" style={{ color: 'rgb(var(--accent))' }} />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
