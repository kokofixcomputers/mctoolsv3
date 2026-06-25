import { useState, useEffect, useMemo, useRef } from 'react'
import { Search, Loader2, AlertTriangle, ArrowRight, Flame, ChevronLeft, ChevronRight } from 'lucide-react'
import { useVersion } from '../contexts/VersionContext'
import { BlockRenderer, BlockThumb, blockRawUrl, itemRawUrl, guessBlockTextures, guessBlockModel, useBlockTextures, useIsBlock, resolveBlockSpriteUrl } from '../components/BlockRenderer'

// ── Data types ────────────────────────────────────────────────────────────────

interface McItem {
  id: number
  name: string
  displayName: string
  stackSize: number
}

// inShape: rows × cols of numeric item IDs (null = empty slot)
// ingredients: flat array of numeric item IDs (shapeless)
interface McRecipe {
  inShape?: (number | null)[][]
  ingredients?: number[]
  result: { id: number; count?: number }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RAW_BASE = 'https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/pc'

// ── Helpers ───────────────────────────────────────────────────────────────────

function itemName(id: number, items: Map<number, McItem>): string {
  return items.get(id)?.name ?? `id:${id}`
}

function itemDisplay(id: number, items: Map<number, McItem>): string {
  return items.get(id)?.displayName ?? `#${id}`
}

// ── ItemSprite ─────────────────────────────────────────────────────────────────

function ItemSprite({
  name, version, size = 36,
}: { name: string; version: string; size?: number }) {
  const [src, setSrc] = useState(() => blockRawUrl(version, name))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setSrc(blockRawUrl(version, name))
    setFailed(false)
  }, [name, version])

  if (failed) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex items-center justify-center text-xs rounded"
        title={name}
      >
        <span style={{ color: 'rgb(var(--muted))', fontSize: 9 }}>?</span>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={name}
      title={name}
      width={size}
      height={size}
      style={{ imageRendering: 'pixelated', display: 'block' }}
      onError={() => {
        const blockUrl = blockRawUrl(version, name)
        const itemUrl = itemRawUrl(version, name)
        if (src === blockUrl) {
          setSrc(itemUrl)
        } else if (src === itemUrl) {
          // Neither block nor item sprite exists — try the models JSON primary texture
          resolveBlockSpriteUrl(version, name).then(url => {
            if (url) setSrc(url)
            else setFailed(true)
          })
        } else {
          setFailed(true)
        }
      }}
    />
  )
}

// ── LazySprite — only loads image when element scrolls into view ──────────────

function LazySprite({ name, version, size = 20 }: { name: string; version: string; size?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect() } },
      { rootMargin: '120px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Reset when name changes (e.g. search result changes which items appear)
  useEffect(() => { setInView(false) }, [name])

  return (
    <div ref={ref} style={{ width: size, height: size, flexShrink: 0 }}>
      {inView && <BlockThumb name={name} version={version} size={size} />}
    </div>
  )
}

// ── CraftingSlot ──────────────────────────────────────────────────────────────

function CraftingSlot({ name, displayName, version }: { name: string | null; displayName?: string; version: string }) {
  return (
    <div
      className="flex items-center justify-center rounded"
      title={displayName ?? name ?? undefined}
      style={{
        width: 48, height: 48,
        background: name ? 'rgb(var(--panel))' : 'rgb(var(--bg))',
        border: '1px solid rgb(var(--border))',
        boxShadow: name ? 'inset 0 1px 3px rgba(0,0,0,0.3)' : undefined,
      }}
    >
      {name && <BlockThumb name={name} version={version} size={36} />}
    </div>
  )
}

// ── OutputSlot ────────────────────────────────────────────────────────────────

function OutputSlot({ name, displayName, count, version }: { name: string; displayName?: string; count: number; version: string }) {
  return (
    <div
      className="relative flex items-center justify-center rounded-xl"
      title={displayName ?? name}
      style={{
        width: 56, height: 56,
        background: 'rgb(var(--panel))',
        border: '2px solid rgb(var(--accent))',
        boxShadow: '0 0 12px rgba(109,40,217,0.25)',
      }}
    >
      <BlockThumb name={name} version={version} size={40} />
      {count > 1 && (
        <span
          className="absolute bottom-0.5 right-1 text-xs font-bold leading-none"
          style={{ color: 'white', textShadow: '1px 1px 0 #000' }}
        >
          {count}
        </span>
      )}
    </div>
  )
}

// ── ShapedGrid ────────────────────────────────────────────────────────────────

function ShapedGrid({
  recipe, items, version,
}: { recipe: McRecipe; items: Map<number, McItem>; version: string }) {
  const shape = recipe.inShape!
  // Pad to 3×3
  const grid: { name: string | null; display: string | null }[][] = Array.from({ length: 3 }, (_, r) =>
    Array.from({ length: 3 }, (__, c) => {
      const row = shape[r]
      const cell = row?.[c]
      return cell != null
        ? { name: itemName(cell, items), display: itemDisplay(cell, items) }
        : { name: null, display: null }
    })
  )
  const resultName = itemName(recipe.result.id, items)
  const resultDisplay = itemDisplay(recipe.result.id, items)
  const count = recipe.result.count ?? 1

  return (
    <div className="flex items-center gap-5">
      <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(3, 48px)' }}>
        {grid.flat().map((cell, i) => (
          <CraftingSlot key={i} name={cell.name} displayName={cell.display ?? undefined} version={version} />
        ))}
      </div>
      <ArrowRight size={22} style={{ color: 'rgb(var(--muted))', flexShrink: 0 }} />
      <OutputSlot name={resultName} displayName={resultDisplay} count={count} version={version} />
    </div>
  )
}

// ── ShapelessGrid ─────────────────────────────────────────────────────────────

function ShapelessGrid({
  recipe, items, version,
}: { recipe: McRecipe; items: Map<number, McItem>; version: string }) {
  const ings = recipe.ingredients!.map(id => ({ name: itemName(id, items), display: itemDisplay(id, items) }))
  const padded = [...ings, ...Array(Math.max(0, 9 - ings.length)).fill(null)]
  const resultName = itemName(recipe.result.id, items)
  const resultDisplay = itemDisplay(recipe.result.id, items)
  const count = recipe.result.count ?? 1

  return (
    <div className="flex items-center gap-5">
      <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(3, 48px)' }}>
        {padded.slice(0, 9).map((cell, i) => (
          <CraftingSlot key={i} name={cell?.name ?? null} displayName={cell?.display ?? undefined} version={version} />
        ))}
      </div>
      <ArrowRight size={22} style={{ color: 'rgb(var(--muted))', flexShrink: 0 }} />
      <OutputSlot name={resultName} displayName={resultDisplay} count={count} version={version} />
    </div>
  )
}

// ── RecipeCard ────────────────────────────────────────────────────────────────

function RecipeCard({
  recipe, items, version, index, total,
}: { recipe: McRecipe; items: Map<number, McItem>; version: string; index: number; total: number }) {
  const isShapeless = !!recipe.ingredients && !recipe.inShape
  const resultName = itemName(recipe.result.id, items)

  return (
    <div>
      {total > 1 && (
        <p className="text-xs mb-3" style={{ color: 'rgb(var(--muted))' }}>
          Recipe {index + 1} of {total} — {isShapeless ? 'Shapeless' : 'Shaped'}
        </p>
      )}
      {isShapeless
        ? <ShapelessGrid recipe={recipe} items={items} version={version} />
        : <ShapedGrid recipe={recipe} items={items} version={version} />
      }
    </div>
  )
}

// ── Detail Panel ──────────────────────────────────────────────────────────────


function RecipeDetail({
  resultId, recipes, items, version,
}: {
  resultId: number
  recipes: McRecipe[]
  items: Map<number, McItem>
  version: string
}) {
  const [page, setPage] = useState(0)
  const recipe = recipes[Math.min(page, recipes.length - 1)]
  const resultName = itemName(resultId, items)
  const displayName = itemDisplay(resultId, items)
  const textures = useBlockTextures(version, resultName)
  const isBlock = useIsBlock(version, resultName)

  // reset page when selection changes
  useEffect(() => { setPage(0) }, [resultId])

  return (
    <div className="space-y-4">
      {/* Title */}
      <div className="flex items-center gap-3">
        <ItemSprite name={resultName} version={version} size={28} />
        <div>
          <h2 className="font-semibold text-lg leading-tight">{displayName}</h2>
          <p className="text-xs font-mono" style={{ color: 'rgb(var(--muted))' }}>{resultName}</p>
        </div>
        <span className="ml-auto badge badge-muted font-mono text-xs">#{resultId}</span>
      </div>

      <div className="flex gap-5 items-start flex-wrap">
        {/* Crafting grid */}
        <div className="card p-5 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'rgb(var(--muted))' }}>
              Crafting Recipe
            </p>
            {recipes.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="btn btn-ghost px-1 py-1 rounded disabled:opacity-30"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs font-mono px-1" style={{ color: 'rgb(var(--muted))' }}>
                  {page + 1}/{recipes.length}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(recipes.length - 1, p + 1))}
                  disabled={page === recipes.length - 1}
                  className="btn btn-ghost px-1 py-1 rounded disabled:opacity-30"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
          <RecipeCard
            recipe={recipe}
            items={items}
            version={version}
            index={page}
            total={recipes.length}
          />
        </div>

        {/* 3D block preview — only shown for real blocks (confirmed via models JSON) */}
        {isBlock === true && (
          <div className="card p-5 flex flex-col items-center gap-3">
            <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'rgb(var(--muted))' }}>
              3D Preview
            </p>
            <BlockRenderer textures={textures} model={guessBlockModel(resultName)} blockId={resultName} blockVersion={version} size={120} style={{ borderRadius: 8 }} />
            <p className="text-xs font-mono text-center" style={{ color: 'rgb(var(--muted))' }}>
              {resultName}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sidebar item ──────────────────────────────────────────────────────────────

function RecipeListItem({
  id, items, version, selected, onClick,
}: { id: number; items: Map<number, McItem>; version: string; selected: boolean; onClick: () => void }) {
  const name = itemName(id, items)
  const display = itemDisplay(id, items)

  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-all
        ${selected ? 'bg-violet-600 text-white' : 'hover:bg-[rgba(var(--border),.5)]'}
      `}
    >
      <LazySprite name={name} version={version} size={20} />
      <span className="truncate flex-1 text-xs font-medium">{display}</span>
    </button>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function RecipePage() {
  const { version } = useVersion()

  // Raw data
  const [items, setItems] = useState<Map<number, McItem>>(new Map())
  const [recipesMap, setRecipesMap] = useState<Record<string, McRecipe[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // UI state
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Fetch both files when version changes
  useEffect(() => {
    setLoading(true); setError(null)
    setItems(new Map()); setRecipesMap({}); setSelectedId(null); setSearch('')

    const base = `${RAW_BASE}/${version.id}`
    Promise.all([
      fetch(`${base}/items.json`).then(r => { if (!r.ok) throw new Error(`items.json: HTTP ${r.status}`); return r.json() }),
      fetch(`${base}/recipes.json`).then(r => { if (!r.ok) throw new Error(`recipes.json: HTTP ${r.status}`); return r.json() }),
    ])
      .then(([itemsArr, recipesData]: [McItem[], Record<string, McRecipe[]>]) => {
        const map = new Map<number, McItem>()
        for (const item of itemsArr) map.set(item.id, item)
        setItems(map)
        setRecipesMap(recipesData)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [version.id])

  // Sorted list of result IDs with display names for filtering
  const sortedIds = useMemo(() => {
    return Object.keys(recipesMap)
      .map(k => parseInt(k))
      .sort((a, b) => {
        const na = items.get(a)?.displayName ?? ''
        const nb = items.get(b)?.displayName ?? ''
        return na.localeCompare(nb)
      })
  }, [recipesMap, items])

  const filtered = useMemo(() => {
    if (!search.trim()) return sortedIds
    const q = search.toLowerCase()
    return sortedIds.filter(id => {
      const item = items.get(id)
      return item?.name.includes(q) || item?.displayName.toLowerCase().includes(q)
    })
  }, [sortedIds, search, items])

  return (
    <div className="section py-10">
      <div className="container">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-semibold mb-1">Recipe Viewer</h1>
          <p className="text-sm" style={{ color: 'rgb(var(--muted))' }}>
            All crafting recipes for Minecraft {version.label}.
            Data from <code className="font-mono text-xs">PrismarineJS/minecraft-data</code>.
          </p>
        </div>

        {loading && (
          <div className="card flex items-center justify-center gap-3 py-20">
            <Loader2 size={20} className="animate-spin" style={{ color: 'rgb(var(--muted))' }} />
            <span style={{ color: 'rgb(var(--muted))' }}>Loading {version.label} data…</span>
          </div>
        )}

        {error && (
          <div className="card p-5 flex gap-3 items-start">
            <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-1">Failed to load data</p>
              <p className="text-sm" style={{ color: 'rgb(var(--muted))' }}>{error}</p>
              <p className="text-xs mt-2" style={{ color: 'rgb(var(--muted))' }}>
                Version <code>{version.id}</code> may not be in the minecraft-data repo yet.
              </p>
            </div>
          </div>
        )}

        {!loading && !error && (
          <div className="flex gap-5 items-start">

            {/* ── Sidebar ── */}
            <div className="flex-shrink-0 flex flex-col gap-2" style={{ width: 244 }}>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'rgb(var(--muted))' }} />
                <input
                  ref={searchRef}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={`Search ${sortedIds.length} recipes…`}
                  className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none"
                  style={{
                    background: 'rgb(var(--panel))',
                    border: '1px solid rgb(var(--border))',
                    color: 'rgb(var(--text))',
                  }}
                />
              </div>

              <div className="card overflow-y-auto" style={{ maxHeight: 560 }}>
                {filtered.length === 0 ? (
                  <p className="text-sm text-center py-10" style={{ color: 'rgb(var(--muted))' }}>No matches.</p>
                ) : (
                  <div className="p-2 space-y-0.5">
                    {filtered.map(id => (
                      <RecipeListItem
                        key={id}
                        id={id}
                        items={items}
                        version={version.id}
                        selected={selectedId === id}
                        onClick={() => setSelectedId(id)}
                      />
                    ))}
                  </div>
                )}
                <p className="text-center text-xs pb-2 pt-1" style={{ color: 'rgb(var(--muted))' }}>
                  {filtered.length} item{filtered.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* ── Detail panel ── */}
            <div className="flex-1 min-w-0">
              {selectedId == null ? (
                <div
                  className="card flex flex-col items-center justify-center gap-5 text-center"
                  style={{ minHeight: 400 }}
                >
                  <div style={{ opacity: 0.15 }}>
                    <BlockRenderer
                      textures={{
                        top:   blockRawUrl(version.id, 'crafting_table_top'),
                        side:  blockRawUrl(version.id, 'crafting_table_front'),
                        right: blockRawUrl(version.id, 'crafting_table_side'),
                      }}
                      size={90}
                    />
                  </div>
                  <p style={{ color: 'rgb(var(--muted))' }} className="text-sm">
                    Select an item from the list to see its recipe.
                  </p>
                </div>
              ) : (
                <RecipeDetail
                  resultId={selectedId}
                  recipes={recipesMap[String(selectedId)] ?? []}
                  items={items}
                  version={version.id}
                />
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
