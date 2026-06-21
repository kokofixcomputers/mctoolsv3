import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Search, ArrowRight, Palette, Radio, Gift, Gem, Wand2, Sparkles } from 'lucide-react'
import { TOOLS, CATEGORIES, type ToolDef } from '../data/tools'

const ICON_MAP: Record<string, typeof Palette> = {
  'gradient':       Palette,
  'motd':           Radio,
  'give-item':      Gift,
  'give-potion':    Sparkles,
  'give-firework':  Sparkles,
  'give-container': Gift,
  'ore-finder':     Gem,
  'totem':          Wand2,
}

function ToolCard({ tool }: { tool: ToolDef }) {
  const Icon = ICON_MAP[tool.id] ?? Gift
  return (
    <Link to={tool.path} className="card-hover group block">
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: 'rgb(var(--accent) / 0.1)' }}>
          <Icon className="w-5 h-5" style={{ color: 'rgb(var(--accent))' }} />
        </div>
        <div className="flex items-center gap-2">
          <span className="badge-muted">{tool.category}</span>
          {tool.badge === 'Popular' && <span className="badge-accent">Popular</span>}
          {tool.badge === 'New'     && <span className="badge-success">New</span>}
          {tool.badge === 'Beta'    && <span className="badge-warning">Beta</span>}
        </div>
      </div>
      <div className="font-semibold mb-1.5 group-hover:text-[rgb(var(--accent))] transition-colors"
        style={{ color: 'rgb(var(--text))' }}>
        {tool.title}
      </div>
      <p className="text-sm leading-relaxed" style={{ color: 'rgb(var(--muted))' }}>{tool.desc}</p>
      <div className="mt-4 flex items-center gap-1 text-xs font-medium transition-all group-hover:gap-2"
        style={{ color: 'rgb(var(--accent))' }}>
        Open <ArrowRight className="w-3 h-3" />
      </div>
    </Link>
  )
}

export default function ToolsPage() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return TOOLS.filter((t) => {
      const matchCat = category === 'All' || t.category === category
      const matchQ = !q || t.title.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q) || t.tags.some((tag) => tag.includes(q))
      return matchCat && matchQ
    })
  }, [query, category])

  return (
    <div className="section container">
      {/* Header */}
      <div className="mb-10">
        <span className="badge-muted">MCTools</span>
        <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>All Tools</h1>
        <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
          {TOOLS.length} free browser-based Minecraft utilities.
        </p>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
            style={{ color: 'rgb(var(--muted))' }} />
          <input
            className="form-input pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools…"
          />
        </div>

        {/* Category pills */}
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className="btn rounded-full px-4 py-1.5 text-sm font-medium transition-all"
              style={{
                backgroundColor: category === cat ? 'rgb(var(--accent))' : 'transparent',
                color: category === cat ? 'rgb(var(--accent-fg))' : 'rgb(var(--muted))',
                border: `1px solid ${category === cat ? 'rgb(var(--accent))' : 'rgb(var(--border))'}`,
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      {query || category !== 'All' ? (
        <p className="text-sm mb-6" style={{ color: 'rgb(var(--muted))' }}>
          {filtered.length === 0 ? 'No tools found' : `${filtered.length} tool${filtered.length !== 1 ? 's' : ''} found`}
          {query && <> for <span style={{ color: 'rgb(var(--text))' }}>"{query}"</span></>}
        </p>
      ) : null}

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20" style={{ color: 'rgb(var(--muted))' }}>
          <Search className="w-10 h-10 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No tools match your search</p>
          <button
            onClick={() => { setQuery(''); setCategory('All') }}
            className="btn-secondary mt-4 px-5 py-2"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  )
}
