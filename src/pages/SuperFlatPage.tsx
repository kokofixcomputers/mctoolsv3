import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, GripVertical, Minus, Plus, Search, Trash2, Upload } from 'lucide-react'
import { useVersion } from '../contexts/VersionContext'
import { BlockThumb, listBlockNames } from '../components/BlockRenderer'
import LayerStack from '../components/LayerStack'
import { embedded, saveSuperflat, usePanel } from '../lib/panel'
import {
  type FlatWorld, type Layer, MAX_LAYER, STRUCTURES, fromGeneratorSettings, layerOf, toGeneratorSettings,
  toPresetString, totalHeight, WORLD_HEIGHT,
} from '../lib/superflat'

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

interface Preset { label: string; layers: { block: string; count: number }[]; biome: string }

const PRESETS: Preset[] = [
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

/** The presets list their layers from the bedrock up, the editor from the surface down. */
const presetWorld = (p: Preset): FlatWorld => ({
  layers: [...p.layers].reverse().map((l) => layerOf(l.block, l.count)),
  biome: p.biome,
  features: false,
  lakes: false,
  structures: [],
})

const card = { background: 'rgb(var(--panel))', border: '1px solid rgb(var(--border))' }
const muted = { color: 'rgb(var(--muted))' }
const heading = 'text-xs uppercase tracking-widest font-semibold mb-3'

// ── Block picker ──────────────────────────────────────────────────────────────

function BlockPicker({ value, version, names, onChange }: {
  value: string
  version: string
  names: string[]
  onChange: (block: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const q = query.trim().toLowerCase().replace(/^minecraft:/, '').replace(/ /g, '_')
  const matches = useMemo(() => ['air', ...names].filter((n) => !q || n.includes(q)).slice(0, 36), [names, q])
  const choose = (name: string) => { onChange(name.includes(':') ? name : `minecraft:${name}`); setOpen(false); setQuery('') }

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-2 py-1 rounded-lg text-left"
        style={card}
      >
        <BlockThumb name={value.replace(/^minecraft:/, '')} version={version} size={28} />
        <span className="font-mono text-sm truncate">{value.replace(/^minecraft:/, '')}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 rounded-lg shadow-xl p-2 w-72" style={card}>
          <div className="relative mb-2">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={muted} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && query.trim()) { choose(matches[0] ?? query.trim()); e.preventDefault() } }}
              placeholder="Search blocks"
              className="w-full pl-7 pr-2 py-1.5 rounded-lg text-sm outline-none"
              style={{ background: 'rgb(var(--bg))', border: '1px solid rgb(var(--border))', color: 'rgb(var(--text))' }}
            />
          </div>
          <div className="grid grid-cols-2 gap-1 overflow-y-auto" style={{ maxHeight: 260 }}>
            {matches.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => choose(name)}
                className="flex items-center gap-1.5 px-1.5 py-1 rounded text-left text-xs font-mono hover:bg-[rgba(var(--border),.5)]"
              >
                <BlockThumb name={name} version={version} size={22} />
                <span className="truncate">{name}</span>
              </button>
            ))}
            {matches.length === 0 && <p className="col-span-2 text-xs text-center py-4" style={muted}>No block like that.</p>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SuperFlatPage() {
  const { version } = useVersion()
  const panel = usePanel()

  const [world, setWorld] = useState<FlatWorld>(() => presetWorld(PRESETS[0]))
  const [names, setNames] = useState<string[]>([])
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const [copied, setCopied] = useState<'json' | 'preset' | null>(null)
  const [biomeQuery, setBiomeQuery] = useState('')
  const [sent, setSent] = useState<{ ok: boolean; message: string } | null>(null)
  const [sending, setSending] = useState(false)
  const loaded = useRef(false)

  useEffect(() => { let alive = true; listBlockNames(version.id).then((n) => alive && setNames(n)); return () => { alive = false } }, [version.id])

  // Inside the panel, start from the layers the server has now.
  useEffect(() => {
    if (loaded.current || !panel.flat) return
    const parsed = fromGeneratorSettings(panel.flat)
    if (parsed) { loaded.current = true; setWorld(parsed) }
  }, [panel.flat])

  const patch = (next: Partial<FlatWorld>) => setWorld((w) => ({ ...w, ...next }))
  const setLayers = (fn: (layers: Layer[]) => Layer[]) => setWorld((w) => ({ ...w, layers: fn(w.layers) }))
  const update = (uid: string, change: Partial<Layer>) =>
    setLayers((ls) => ls.map((l) => (l.uid === uid ? { ...l, ...change } : l)))
  const setCount = (uid: string, count: number) => update(uid, { count: Math.max(1, Math.min(MAX_LAYER, Math.floor(count) || 1)) })

  const move = (uid: string, to: number) =>
    setLayers((ls) => {
      const from = ls.findIndex((l) => l.uid === uid)
      if (from < 0) return ls
      const next = [...ls]
      const [item] = next.splice(from, 1)
      next.splice(to > from ? to - 1 : to, 0, item)
      return next
    })

  const json = toGeneratorSettings(world)
  const preset = toPresetString(world)
  const height = totalHeight(world.layers)

  const copy = async (what: 'json' | 'preset') => {
    await navigator.clipboard.writeText(what === 'json' ? json : preset)
    setCopied(what)
    setTimeout(() => setCopied(null), 1600)
  }

  const apply = async () => {
    setSending(true)
    setSent(null)
    try {
      await saveSuperflat(json)
      setSent({ ok: true, message: 'Saved. Restart the server and reset the world for it to take effect.' })
    } catch (e) {
      setSent({ ok: false, message: (e as Error).message })
    } finally {
      setSending(false)
    }
  }

  const biomes = BIOMES.filter((b) => b.includes(biomeQuery.trim().toLowerCase().replace(/^minecraft:/, '')))

  return (
    <div className="section py-6">
      <div className="container">
        {!embedded && (
          <div className="mb-6">
            <h1 className="text-3xl font-semibold mb-1">Superflat Generator</h1>
            <p className="text-sm" style={muted}>
              Build the layers of a flat world, drag them around and look at them in 3D.
            </p>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
          {/* Layers */}
          <div className="space-y-4 min-w-0">
            <div className="card p-4">
              <p className={heading} style={muted}>Presets</p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button key={p.label} onClick={() => setWorld(presetWorld(p))} className="btn btn-ghost px-3 py-1.5 text-xs font-medium">
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs uppercase tracking-widest font-semibold" style={muted}>Layers, surface first</p>
                <span className="badge badge-muted text-xs font-mono" title={`The world is ${WORLD_HEIGHT} blocks tall`}>
                  {height} blocks tall
                </span>
              </div>

              <div onDragLeave={() => setOver(null)}>
                {world.layers.map((layer, i) => (
                  <div key={layer.uid}>
                    <div className="h-1 rounded" style={{ background: over === i && dragging ? 'rgb(var(--accent, 124 58 237))' : 'transparent' }} />
                    <div
                      onDragOver={(e) => {
                        if (!dragging) return
                        e.preventDefault()
                        const r = e.currentTarget.getBoundingClientRect()
                        setOver(e.clientY < r.top + r.height / 2 ? i : i + 1)
                      }}
                      onDrop={(e) => { e.preventDefault(); if (dragging && over !== null) move(dragging, over); setDragging(null); setOver(null) }}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                      style={{ ...card, opacity: dragging === layer.uid ? 0.4 : 1 }}
                    >
                      <span
                        draggable
                        onDragStart={(e) => { setDragging(layer.uid); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', layer.uid) }}
                        onDragEnd={() => { setDragging(null); setOver(null) }}
                        className="cursor-grab flex-shrink-0 p-1"
                        style={muted}
                        title="Drag to reorder"
                      >
                        <GripVertical size={16} />
                      </span>
                      <BlockPicker value={layer.block} version={version.id} names={names} onChange={(block) => update(layer.uid, { block })} />
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => setCount(layer.uid, layer.count - 1)} className="p-1 rounded" style={muted} aria-label="Thinner"><Minus size={13} /></button>
                        <input
                          type="number"
                          min={1}
                          max={MAX_LAYER}
                          value={layer.count}
                          onChange={(e) => setCount(layer.uid, parseInt(e.target.value, 10))}
                          aria-label="Height"
                          className="text-sm font-mono text-center rounded outline-none"
                          style={{ width: 52, ...card, color: 'rgb(var(--text))', padding: '2px 4px' }}
                        />
                        <button onClick={() => setCount(layer.uid, layer.count + 1)} className="p-1 rounded" style={muted} aria-label="Thicker"><Plus size={13} /></button>
                      </div>
                      <button onClick={() => setLayers((ls) => ls.filter((l) => l.uid !== layer.uid))} className="p-1 rounded hover:text-red-400 flex-shrink-0" style={muted} title="Remove layer">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                <div
                  className="h-3"
                  onDragOver={(e) => { if (dragging) { e.preventDefault(); setOver(world.layers.length) } }}
                  onDrop={(e) => { e.preventDefault(); if (dragging) move(dragging, world.layers.length); setDragging(null); setOver(null) }}
                  style={{ borderTop: over === world.layers.length && dragging ? '4px solid rgb(var(--accent, 124 58 237))' : undefined }}
                />
              </div>

              {world.layers.length === 0 && (
                <p className="text-sm text-center py-6" style={muted}>No layers, the game builds its own. Add one below.</p>
              )}

              <button
                onClick={() => setLayers((ls) => [...ls, layerOf('stone')])}
                className="btn btn-ghost w-full flex items-center justify-center gap-1.5 py-1.5 text-sm mt-1"
              >
                <Plus size={14} /> Add a layer at the bottom
              </button>
            </div>
          </div>

          {/* Preview and settings */}
          <div className="space-y-4 min-w-0 lg:sticky lg:top-4">
            <div className="card p-2">
              <LayerStack layers={world.layers} version={version.id} style={{ width: '100%', height: 380, display: 'block' }} />
              <p className="text-xs text-center pb-1" style={muted}>Drag to turn, scroll to zoom</p>
            </div>

            <div className="card p-4">
              <p className={heading} style={muted}>World</p>
              <div className="relative mb-2">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={muted} />
                <input
                  value={biomeQuery}
                  onChange={(e) => setBiomeQuery(e.target.value)}
                  placeholder="Filter biomes"
                  className="w-full pl-7 pr-2 py-1.5 rounded-lg text-sm outline-none"
                  style={{ background: 'rgb(var(--bg))', border: '1px solid rgb(var(--border))', color: 'rgb(var(--text))' }}
                />
              </div>
              <select
                value={world.biome}
                onChange={(e) => patch({ biome: e.target.value })}
                aria-label="Biome"
                className="w-full rounded-lg text-sm px-2 py-1.5 mb-3"
                style={{ background: 'rgb(var(--bg))', border: '1px solid rgb(var(--border))', color: 'rgb(var(--text))' }}
              >
                {[...new Set([world.biome, ...biomes])].map((b) => <option key={b} value={b}>{b.replace('minecraft:', '')}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm mb-1"><input type="checkbox" checked={world.features} onChange={(e) => patch({ features: e.target.checked })} /> Trees, ores and other decoration</label>
              <label className="flex items-center gap-2 text-sm mb-3"><input type="checkbox" checked={world.lakes} onChange={(e) => patch({ lakes: e.target.checked })} /> Lakes of water and lava</label>
              <p className="text-xs font-semibold mb-1" style={muted}>Structures</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 overflow-y-auto" style={{ maxHeight: 150 }}>
                {STRUCTURES.map((s) => (
                  <label key={s.id} className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={world.structures.includes(s.id)}
                      onChange={(e) => patch({ structures: e.target.checked ? [...world.structures, s.id] : world.structures.filter((x) => x !== s.id) })}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="card p-4">
              <p className={heading} style={muted}>Result</p>
              {embedded && panel.connected ? (
                <>
                  <button onClick={apply} disabled={sending || !panel.canEdit} className="btn btn-primary w-full flex items-center justify-center gap-2 py-2 text-sm disabled:opacity-40">
                    <Upload size={15} /> {sending ? 'Saving' : 'Use these layers on the server'}
                  </button>
                  {sent && <p className="text-xs mt-2" style={{ color: sent.ok ? 'rgb(var(--text))' : '#f87171' }}>{sent.message}</p>}
                </>
              ) : null}
              <div className="flex gap-2 mt-3">
                <button onClick={() => copy('json')} className="btn btn-ghost flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs">
                  {copied === 'json' ? <Check size={13} /> : <Copy size={13} />} generator-settings
                </button>
                <button onClick={() => copy('preset')} disabled={!preset} className="btn btn-ghost flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs disabled:opacity-40">
                  {copied === 'preset' ? <Check size={13} /> : <Copy size={13} />} Create World string
                </button>
              </div>
              <p className="text-xs mt-2 font-mono break-all select-all rounded-lg p-2" style={{ background: 'rgb(var(--bg))', border: '1px solid rgb(var(--border))', ...muted }}>{preset || 'No layers'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
