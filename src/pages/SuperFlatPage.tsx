import { useState, useId, useRef, useEffect } from 'react'
import { ChevronUp, ChevronDown, Trash2, Plus, Copy, Check, Search, X } from 'lucide-react'
import { useVersion } from '../contexts/VersionContext'
import { BlockThumb } from '../components/BlockRenderer'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Layer {
  uid: string
  block: string   // full id e.g. "minecraft:bedrock"
  count: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BIOMES = [
  'minecraft:plains', 'minecraft:desert', 'minecraft:forest', 'minecraft:taiga',
  'minecraft:swamp', 'minecraft:river', 'minecraft:frozen_river', 'minecraft:snowy_plains',
  'minecraft:mushroom_fields', 'minecraft:beach', 'minecraft:jungle', 'minecraft:sparse_jungle',
  'minecraft:deep_ocean', 'minecraft:stone_shore', 'minecraft:savanna', 'minecraft:badlands',
  'minecraft:dark_forest', 'minecraft:snowy_taiga', 'minecraft:birch_forest',
  'minecraft:old_growth_birch_forest', 'minecraft:old_growth_pine_taiga',
  'minecraft:old_growth_spruce_taiga', 'minecraft:windswept_hills',
  'minecraft:windswept_gravelly_hills', 'minecraft:flower_forest', 'minecraft:ice_spikes',
  'minecraft:grove', 'minecraft:snowy_slopes', 'minecraft:frozen_peaks', 'minecraft:jagged_peaks',
  'minecraft:stony_peaks', 'minecraft:meadow', 'minecraft:cherry_grove', 'minecraft:deep_dark',
  'minecraft:dripstone_caves', 'minecraft:lush_caves', 'minecraft:nether_wastes',
  'minecraft:soul_sand_valley', 'minecraft:crimson_forest', 'minecraft:warped_forest',
  'minecraft:basalt_deltas', 'minecraft:the_end', 'minecraft:void',
]

const PRESETS: { label: string; layers: Omit<Layer, 'uid'>[]; biome: string }[] = [
  {
    label: 'Classic Flat',
    biome: 'minecraft:plains',
    layers: [
      { block: 'minecraft:bedrock',     count: 1 },
      { block: 'minecraft:dirt',        count: 2 },
      { block: 'minecraft:grass_block', count: 1 },
    ],
  },
  {
    label: 'Tunnelers\' Dream',
    biome: 'minecraft:windswept_hills',
    layers: [
      { block: 'minecraft:bedrock', count: 1 },
      { block: 'minecraft:stone',   count: 230 },
      { block: 'minecraft:gravel',  count: 10 },
    ],
  },
  {
    label: 'Water World',
    biome: 'minecraft:deep_ocean',
    layers: [
      { block: 'minecraft:bedrock', count: 1 },
      { block: 'minecraft:gravel',  count: 5 },
      { block: 'minecraft:dirt',    count: 5 },
      { block: 'minecraft:water',   count: 90 },
    ],
  },
  {
    label: 'Overworld',
    biome: 'minecraft:plains',
    layers: [
      { block: 'minecraft:bedrock',     count: 1 },
      { block: 'minecraft:stone',       count: 59 },
      { block: 'minecraft:dirt',        count: 3 },
      { block: 'minecraft:grass_block', count: 1 },
    ],
  },
  {
    label: 'Snowy Kingdom',
    biome: 'minecraft:snowy_plains',
    layers: [
      { block: 'minecraft:bedrock',     count: 1 },
      { block: 'minecraft:dirt',        count: 2 },
      { block: 'minecraft:grass_block', count: 1 },
      { block: 'minecraft:snow',        count: 1 },
    ],
  },
  {
    label: 'Bottomless Pit',
    biome: 'minecraft:plains',
    layers: [
      { block: 'minecraft:air',         count: 1 },
      { block: 'minecraft:dirt',        count: 2 },
      { block: 'minecraft:grass_block', count: 1 },
    ],
  },
  {
    label: 'Desert',
    biome: 'minecraft:desert',
    layers: [
      { block: 'minecraft:bedrock',    count: 1 },
      { block: 'minecraft:stone',      count: 52 },
      { block: 'minecraft:sandstone',  count: 3 },
      { block: 'minecraft:sand',       count: 8 },
    ],
  },
  {
    label: 'Redstone Ready',
    biome: 'minecraft:desert',
    layers: [
      { block: 'minecraft:bedrock', count: 1 },
      { block: 'minecraft:stone',   count: 3 },
    ],
  },
]

// Common blocks for the search dropdown
const COMMON_BLOCKS = [
  'minecraft:air', 'minecraft:bedrock', 'minecraft:stone', 'minecraft:granite',
  'minecraft:diorite', 'minecraft:andesite', 'minecraft:dirt', 'minecraft:coarse_dirt',
  'minecraft:grass_block', 'minecraft:gravel', 'minecraft:sand', 'minecraft:sandstone',
  'minecraft:cobblestone', 'minecraft:oak_planks', 'minecraft:spruce_planks',
  'minecraft:birch_planks', 'minecraft:oak_log', 'minecraft:spruce_log',
  'minecraft:glass', 'minecraft:lapis_block', 'minecraft:gold_block', 'minecraft:iron_block',
  'minecraft:diamond_block', 'minecraft:netherite_block', 'minecraft:emerald_block',
  'minecraft:water', 'minecraft:lava', 'minecraft:ice', 'minecraft:packed_ice',
  'minecraft:snow_block', 'minecraft:snow', 'minecraft:clay', 'minecraft:netherrack',
  'minecraft:soul_sand', 'minecraft:glowstone', 'minecraft:obsidian', 'minecraft:moss_block',
  'minecraft:deepslate', 'minecraft:tuff', 'minecraft:calcite', 'minecraft:dripstone_block',
  'minecraft:mud', 'minecraft:muddy_mangrove_roots', 'minecraft:mangrove_roots',
  'minecraft:end_stone', 'minecraft:purpur_block',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function blockBaseName(id: string): string {
  return id.replace(/^minecraft:/, '')
}

function layerToken(l: Layer): string {
  const base = l.block
  return l.count === 1 ? base : `${l.count}*${base}`
}

function buildString(layers: Layer[], biome: string): string {
  if (!layers.length) return ''
  return layers.map(layerToken).join(',') + ';' + biome
}

let _uidCounter = 0
function uid(): string { return String(++_uidCounter) }

function makeLayers(defs: Omit<Layer, 'uid'>[]): Layer[] {
  return defs.map(d => ({ ...d, uid: uid() }))
}

// ── Block search dropdown ─────────────────────────────────────────────────────

function BlockSearch({
  value, onChange,
}: { value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Sync typed value back if parent changes it
  useEffect(() => { setQuery(value) }, [value])

  const matches = query.length >= 1
    ? COMMON_BLOCKS.filter(b => b.includes(query.replace(/^minecraft:/, '')))
    : COMMON_BLOCKS

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  function commit(v: string) {
    const full = v.includes(':') ? v : `minecraft:${v}`
    setQuery(full)
    onChange(full)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'rgb(var(--muted))' }} />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={e => { if (e.key === 'Enter') { commit(query); e.preventDefault() } }}
          placeholder="minecraft:stone"
          className="w-full pl-7 pr-3 py-1.5 rounded-lg text-sm outline-none font-mono"
          style={{
            background: 'rgb(var(--panel))',
            border: '1px solid rgb(var(--border))',
            color: 'rgb(var(--text))',
          }}
        />
      </div>
      {open && matches.length > 0 && (
        <div
          className="absolute left-0 right-0 top-full mt-1 rounded-lg overflow-y-auto z-50 shadow-xl"
          style={{
            background: 'rgb(var(--panel))',
            border: '1px solid rgb(var(--border))',
            maxHeight: 200,
          }}
        >
          {matches.slice(0, 30).map(b => (
            <button
              key={b}
              onMouseDown={() => commit(b)}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs font-mono hover:bg-[rgba(var(--border),.5)] transition-colors"
            >
              {b}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Layer row ─────────────────────────────────────────────────────────────────

function LayerRow({
  layer, version, index, total,
  onMoveUp, onMoveDown, onDelete, onChangeBlock, onChangeCount,
}: {
  layer: Layer
  version: string
  index: number
  total: number
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  onChangeBlock: (b: string) => void
  onChangeCount: (n: number) => void
}) {
  const isBottom = index === total - 1
  const isTop = index === 0

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg"
      style={{ background: 'rgb(var(--panel))', border: '1px solid rgb(var(--border))' }}
    >
      {/* Position badge */}
      <span
        className="text-xs font-mono w-5 text-right flex-shrink-0"
        style={{ color: 'rgb(var(--muted))' }}
      >
        {total - index}
      </span>

      {/* Block thumbnail */}
      <div className="flex-shrink-0" style={{ width: 32, height: 32 }}>
        <BlockThumb name={blockBaseName(layer.block)} version={version} size={32} />
      </div>

      {/* Block search */}
      <BlockSearch value={layer.block} onChange={onChangeBlock} />

      {/* Count */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className="text-xs" style={{ color: 'rgb(var(--muted))' }}>×</span>
        <input
          type="number"
          min={1}
          max={1024}
          value={layer.count}
          onChange={e => {
            const n = parseInt(e.target.value)
            if (!isNaN(n) && n >= 1) onChangeCount(n)
          }}
          className="text-sm font-mono text-center rounded outline-none"
          style={{
            width: 52,
            background: 'rgb(var(--panel))',
            border: '1px solid rgb(var(--border))',
            color: 'rgb(var(--text))',
            padding: '2px 4px',
          }}
        />
      </div>

      {/* Move / delete */}
      <div className="flex gap-0.5 flex-shrink-0">
        <button
          onClick={onMoveUp}
          disabled={isTop}
          title="Move up (closer to surface)"
          className="p-1 rounded disabled:opacity-25 transition-opacity"
          style={{ color: 'rgb(var(--muted))' }}
        >
          <ChevronUp size={15} />
        </button>
        <button
          onClick={onMoveDown}
          disabled={isBottom}
          title="Move down (deeper)"
          className="p-1 rounded disabled:opacity-25 transition-opacity"
          style={{ color: 'rgb(var(--muted))' }}
        >
          <ChevronDown size={15} />
        </button>
        <button
          onClick={onDelete}
          title="Remove layer"
          className="p-1 rounded transition-colors hover:text-red-400"
          style={{ color: 'rgb(var(--muted))' }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SuperFlatPage() {
  const { version } = useVersion()

  const [layers, setLayers] = useState<Layer[]>(() =>
    makeLayers(PRESETS[0].layers)
  )
  const [biome, setBiome] = useState(PRESETS[0].biome)
  const [biomeSearch, setBiomeSearch] = useState('')
  const [copied, setCopied] = useState(false)
  const [activePreset, setActivePreset] = useState(0)

  // Add-layer form
  const [newBlock, setNewBlock] = useState('minecraft:stone')
  const [newCount, setNewCount] = useState(1)

  const output = buildString(layers, biome)

  function applyPreset(idx: number) {
    setActivePreset(idx)
    setLayers(makeLayers(PRESETS[idx].layers))
    setBiome(PRESETS[idx].biome)
  }

  function moveUp(i: number) {
    if (i === 0) return
    setLayers(ls => { const a = [...ls]; [a[i-1], a[i]] = [a[i], a[i-1]]; return a })
  }
  function moveDown(i: number) {
    setLayers(ls => {
      if (i === ls.length - 1) return ls
      const a = [...ls]; [a[i], a[i+1]] = [a[i+1], a[i]]; return a
    })
  }
  function deleteLayer(i: number) {
    setLayers(ls => ls.filter((_, idx) => idx !== i))
  }
  function changeBlock(i: number, block: string) {
    setLayers(ls => ls.map((l, idx) => idx === i ? { ...l, block } : l))
  }
  function changeCount(i: number, count: number) {
    setLayers(ls => ls.map((l, idx) => idx === i ? { ...l, count } : l))
  }
  function addLayer() {
    if (!newBlock.trim()) return
    const block = newBlock.includes(':') ? newBlock.trim() : `minecraft:${newBlock.trim()}`
    setLayers(ls => [...ls, { uid: uid(), block, count: newCount }])
  }

  async function copyOutput() {
    await navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const filteredBiomes = biomeSearch
    ? BIOMES.filter(b => b.includes(biomeSearch.replace(/^minecraft:/, '')))
    : BIOMES

  return (
    <div className="section py-10">
      <div className="container">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-semibold mb-1">Superflat Generator</h1>
          <p className="text-sm" style={{ color: 'rgb(var(--muted))' }}>
            Build a custom superflat world preset. Layers go from bottom (bedrock) to top (surface).
          </p>
        </div>

        <div className="flex gap-6 items-start flex-wrap xl:flex-nowrap">

          {/* ── Left: layer editor ── */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Presets */}
            <div className="card p-4">
              <p className="text-xs uppercase tracking-widest font-semibold mb-3" style={{ color: 'rgb(var(--muted))' }}>
                Presets
              </p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p, i) => (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(i)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      activePreset === i
                        ? 'bg-violet-600 text-white'
                        : 'btn btn-ghost'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Layer list */}
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'rgb(var(--muted))' }}>
                  Layers — top to bottom
                </p>
                <span className="badge badge-muted text-xs font-mono">
                  {layers.reduce((s, l) => s + l.count, 0)} blocks tall
                </span>
              </div>

              {layers.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: 'rgb(var(--muted))' }}>
                  No layers yet. Add one below.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {layers.map((layer, i) => (
                    <LayerRow
                      key={layer.uid}
                      layer={layer}
                      version={version.id}
                      index={i}
                      total={layers.length}
                      onMoveUp={() => moveUp(i)}
                      onMoveDown={() => moveDown(i)}
                      onDelete={() => deleteLayer(i)}
                      onChangeBlock={b => changeBlock(i, b)}
                      onChangeCount={n => changeCount(i, n)}
                    />
                  ))}
                </div>
              )}

              {/* Add layer */}
              <div className="mt-3 pt-3 flex items-center gap-2" style={{ borderTop: '1px solid rgb(var(--border))' }}>
                <BlockSearch value={newBlock} onChange={setNewBlock} />
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-xs" style={{ color: 'rgb(var(--muted))' }}>×</span>
                  <input
                    type="number"
                    min={1}
                    max={1024}
                    value={newCount}
                    onChange={e => { const n = parseInt(e.target.value); if (!isNaN(n) && n >= 1) setNewCount(n) }}
                    className="text-sm font-mono text-center rounded outline-none"
                    style={{
                      width: 52,
                      background: 'rgb(var(--panel))',
                      border: '1px solid rgb(var(--border))',
                      color: 'rgb(var(--text))',
                      padding: '2px 4px',
                    }}
                  />
                </div>
                <button
                  onClick={addLayer}
                  className="btn btn-primary flex items-center gap-1.5 px-3 py-1.5 text-sm flex-shrink-0"
                >
                  <Plus size={14} />
                  Add Layer
                </button>
              </div>
            </div>

          </div>

          {/* ── Right: biome + output ── */}
          <div className="flex flex-col gap-4" style={{ width: 300 }}>

            {/* Biome picker */}
            <div className="card p-4">
              <p className="text-xs uppercase tracking-widest font-semibold mb-3" style={{ color: 'rgb(var(--muted))' }}>
                Biome
              </p>
              <div className="relative mb-2">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'rgb(var(--muted))' }} />
                <input
                  value={biomeSearch}
                  onChange={e => setBiomeSearch(e.target.value)}
                  placeholder="Filter biomes…"
                  className="w-full pl-7 pr-3 py-1.5 rounded-lg text-sm outline-none"
                  style={{
                    background: 'rgb(var(--bg))',
                    border: '1px solid rgb(var(--border))',
                    color: 'rgb(var(--text))',
                  }}
                />
                {biomeSearch && (
                  <button onClick={() => setBiomeSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: 'rgb(var(--muted))' }}>
                    <X size={13} />
                  </button>
                )}
              </div>
              <div className="overflow-y-auto rounded-lg" style={{ maxHeight: 220, border: '1px solid rgb(var(--border))' }}>
                {filteredBiomes.map(b => (
                  <button
                    key={b}
                    onClick={() => setBiome(b)}
                    className={`w-full text-left px-3 py-1.5 text-xs font-mono transition-colors ${
                      biome === b
                        ? 'bg-violet-600 text-white'
                        : 'hover:bg-[rgba(var(--border),.5)]'
                    }`}
                  >
                    {b.replace('minecraft:', '')}
                  </button>
                ))}
                {filteredBiomes.length === 0 && (
                  <p className="text-xs text-center py-6" style={{ color: 'rgb(var(--muted))' }}>No match.</p>
                )}
              </div>
            </div>

            {/* Output */}
            <div className="card p-4">
              <p className="text-xs uppercase tracking-widest font-semibold mb-3" style={{ color: 'rgb(var(--muted))' }}>
                Preset String
              </p>
              <div
                className="text-xs font-mono rounded-lg p-3 break-all mb-3 select-all"
                style={{
                  background: 'rgb(var(--bg))',
                  border: '1px solid rgb(var(--border))',
                  color: 'rgb(var(--text))',
                  minHeight: 64,
                  lineHeight: 1.6,
                  wordBreak: 'break-all',
                }}
              >
                {output || <span style={{ color: 'rgb(var(--muted))' }}>Add at least one layer…</span>}
              </div>
              <button
                onClick={copyOutput}
                disabled={!output}
                className="btn btn-primary w-full flex items-center justify-center gap-2 py-2 text-sm disabled:opacity-40"
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? 'Copied!' : 'Copy to Clipboard'}
              </button>
              <p className="text-xs mt-3 leading-relaxed" style={{ color: 'rgb(var(--muted))' }}>
                In-game: <span className="font-mono">Create World → World Type → Superflat → Customize</span>, then paste this string.
              </p>
            </div>

            {/* Visual stack */}
            {layers.length > 0 && (
              <div className="card p-4">
                <p className="text-xs uppercase tracking-widest font-semibold mb-3" style={{ color: 'rgb(var(--muted))' }}>
                  Layer Stack
                </p>
                <div className="space-y-px">
                  {[...layers].reverse().map((layer, i) => (
                    <div
                      key={layer.uid}
                      className="flex items-center gap-2 px-2 py-1 rounded text-xs"
                      style={{ background: i % 2 === 0 ? 'rgb(var(--bg))' : 'transparent' }}
                    >
                      <BlockThumb name={blockBaseName(layer.block)} version={version.id} size={20} />
                      <span className="flex-1 font-mono truncate" style={{ color: 'rgb(var(--text))' }}>
                        {layer.block.replace('minecraft:', '')}
                      </span>
                      {layer.count > 1 && (
                        <span className="font-mono flex-shrink-0" style={{ color: 'rgb(var(--muted))' }}>
                          ×{layer.count}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
