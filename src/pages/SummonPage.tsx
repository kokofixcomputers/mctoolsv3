import { useState, useMemo } from 'react'
import {
  Plus, Trash2, Copy, Check, Users, Settings2, Sparkles, Gauge, ChevronDown,
  Shield, Swords, Baby, Skull, Terminal,
} from 'lucide-react'
import {
  newEntity, newEquip, newEffect, newAttr, buildCommand, eraFor, FLAGS, MOBS, ITEMS, EFFECTS, ATTRIBUTES,
  type SummonEntity, type EntityMode, type EquipItem, type Effect, type Attr,
} from '../tools/summon/summon'

const VERSIONS = ['26.2', '26.1', '1.21.11', '1.21.9', '1.21.5', '1.21.4', '1.21.3', '1.21.1', '1.20.6', '1.20', '1.19.4', '1.18', '1.17', '1.16.5', '1.15', '1.14', '1.13', '1.12', '1.8', '1.7']
const ERA_LABEL: Record<string, string> = {
  equipment: 'equipment:{} · 1.21.5+',
  components: 'HandItems + components · 1.20.5–1.21.4',
  legacy: 'HandItems + tag · ≤1.20.4',
}

export default function SummonPage() {
  const [mode, setMode] = useState<EntityMode>('summon')
  const [version, setVersion] = useState('1.21.11')
  const [pos, setPos] = useState('~ ~ ~')
  const [target, setTarget] = useState('@p')
  const [root, setRoot] = useState<SummonEntity>(() => {
    const z = newEntity('zombie')
    z.customName = 'Tank'
    z.mainHand = { ...newEquip('diamond_sword'), enchantments: 'sharpness:3' }
    z.passengers = [newEntity('chicken')]
    return z
  })

  const command = useMemo(() => buildCommand(root, mode, pos, target, version), [root, mode, pos, target, version])
  const [copied, setCopied] = useState(false)
  const era = eraFor(version)

  return (
    <div className="section container">
      <div className="mb-8">
        <span className="badge-accent"><Skull className="w-3.5 h-3.5" /> Command Generator</span>
        <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>/summon Generator</h1>
        <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
          Mobs with babies, names, behaviour flags, fully-enchanted gear, attributes, potion effects, and stacked
          passengers — with NBT that adapts to your version.
        </p>
      </div>

      {/* Top bar */}
      <div className="card flex flex-wrap items-center gap-4 mb-6">
        <div className="tab-nav">
          {(['summon', 'give'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} className={mode === m ? 'tab-active' : 'tab'}>
              {m === 'summon' ? 'Summon' : 'Spawn egg'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: 'rgb(var(--muted))' }}>Version</span>
          <select className="form-input text-sm !w-auto !py-2" value={version} onChange={e => setVersion(e.target.value)}>
            {VERSIONS.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        {mode === 'summon' ? (
          <div className="flex items-center gap-2">
            <span className="text-sm" style={{ color: 'rgb(var(--muted))' }}>At</span>
            <input className="form-input font-mono text-sm !w-32 !py-2" value={pos} onChange={e => setPos(e.target.value)} placeholder="~ ~ ~" />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm" style={{ color: 'rgb(var(--muted))' }}>To</span>
            <input className="form-input font-mono text-sm !w-24 !py-2" value={target} onChange={e => setTarget(e.target.value)} placeholder="@p" />
          </div>
        )}
        <span className="badge-muted ml-auto font-mono">{ERA_LABEL[era]}</span>
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
        {/* Editor */}
        <div>
          <EntityEditor entity={root} onChange={setRoot} isRoot depth={0} />
        </div>

        {/* Sticky command preview */}
        <div className="lg:sticky lg:top-20">
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="flex items-center gap-2" style={{ color: 'rgb(var(--text))' }}>
                <Terminal className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} /> Command
              </h3>
              <button
                onClick={async () => { await navigator.clipboard.writeText(command); setCopied(true); setTimeout(() => setCopied(false), 1200) }}
                className="btn-primary !px-3 !py-1.5 !text-xs">
                {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
              </button>
            </div>
            <pre className="output-box max-h-[60vh] overflow-auto" style={{ whiteSpace: 'pre-wrap' }}>{command}</pre>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── building blocks ────────────────────────────────────────────────────────────────
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="px-3 py-1 rounded-full text-xs font-medium transition-all"
      style={{
        border: `1px solid ${active ? 'rgb(var(--accent))' : 'rgb(var(--border))'}`,
        background: active ? 'rgb(var(--accent) / 0.12)' : 'transparent',
        color: active ? 'rgb(var(--accent))' : 'rgb(var(--muted))',
      }}>
      {children}
    </button>
  )
}

function Section({ icon, title, count, defaultOpen, children }: {
  icon: React.ReactNode; title: string; count?: number; defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgb(var(--border))' }}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium"
        style={{ color: 'rgb(var(--text))', background: 'rgb(var(--border) / 0.25)' }}>
        <span style={{ color: 'rgb(var(--accent))' }}>{icon}</span>
        {title}
        {count ? <span className="badge-accent !px-2 !py-0">{count}</span> : null}
        <ChevronDown className="w-4 h-4 ml-auto transition-transform" style={{ color: 'rgb(var(--muted))', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && <div className="p-3">{children}</div>}
    </div>
  )
}

// ── Equipment slot ──────────────────────────────────────────────────────────────────
function EquipSlot({ label, icon, item, onChange }: { label: string; icon: React.ReactNode; item: EquipItem; onChange: (i: EquipItem) => void }) {
  const [open, setOpen] = useState(false)
  const filled = !!item.id.trim()
  const set = (p: Partial<EquipItem>) => onChange({ ...item, ...p })
  return (
    <div className="rounded-xl p-2.5 transition-all"
      style={{ border: `1px solid ${filled ? 'rgb(var(--accent) / 0.45)' : 'rgb(var(--border))'}`, background: filled ? 'rgb(var(--accent) / 0.06)' : 'transparent' }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: 'rgb(var(--muted))' }}>
          <span style={{ color: filled ? 'rgb(var(--accent))' : 'rgb(var(--muted))' }}>{icon}</span>{label}
        </span>
        {filled && (
          <button onClick={() => setOpen(o => !o)} title="Item details (count, enchants, lore, drop chance)"
            style={{ color: open ? 'rgb(var(--accent))' : 'rgb(var(--muted))' }}>
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <input className="form-input font-mono text-xs !py-2" list="summon-items" value={item.id}
        onChange={e => set({ id: e.target.value.replace(/[^a-z0-9_:]/g, '').toLowerCase() })} placeholder="empty" />
      {open && filled && (
        <div className="mt-2 space-y-1.5 pl-2.5" style={{ borderLeft: '2px solid rgb(var(--accent) / 0.4)' }}>
          <div className="flex gap-1.5">
            <input className="form-input text-xs !py-1.5 w-16" type="number" min={1} value={item.count} onChange={e => set({ count: e.target.value })} title="Count" />
            <input className="form-input text-xs !py-1.5 w-24" value={item.dropChance} onChange={e => set({ dropChance: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="drop 0–1" title="Drop chance" />
          </div>
          <input className="form-input text-xs !py-1.5" value={item.customName} onChange={e => set({ customName: e.target.value })} placeholder="custom name" />
          <textarea className="form-input text-xs !py-1.5 font-mono" rows={2} value={item.lore} onChange={e => set({ lore: e.target.value })} placeholder="lore (one line each)" />
          <input className="form-input text-xs !py-1.5 font-mono" value={item.enchantments} onChange={e => set({ enchantments: e.target.value })} placeholder="sharpness:5, unbreaking:3" />
        </div>
      )}
    </div>
  )
}

// ── Recursive entity editor ────────────────────────────────────────────────────────
function EntityEditor({ entity, onChange, onRemove, isRoot, depth }: {
  entity: SummonEntity
  onChange: (e: SummonEntity) => void
  onRemove?: () => void
  isRoot?: boolean
  depth: number
}) {
  const set = (patch: Partial<SummonEntity>) => onChange({ ...entity, ...patch })
  const setEffect = (i: number, p: Partial<Effect>) => set({ effects: entity.effects.map((x, j) => j === i ? { ...x, ...p } : x) })
  const setAttr = (i: number, p: Partial<Attr>) => set({ attributes: entity.attributes.map((x, j) => j === i ? { ...x, ...p } : x) })
  const equipCount = [entity.head, entity.chest, entity.legs, entity.feet, entity.mainHand, entity.offHand].filter(i => i.id.trim()).length

  return (
    <div className="rounded-2xl p-4"
      style={{
        border: `1px solid ${isRoot ? 'rgb(var(--accent) / 0.35)' : 'rgb(var(--border))'}`,
        background: isRoot ? 'rgb(var(--accent) / 0.04)' : 'rgb(var(--panel) / 0.5)',
        marginTop: depth > 0 ? 10 : 0,
      }}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="badge-accent">{isRoot ? <Skull className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}{isRoot ? 'Entity' : 'Passenger'}</span>
        <input className="form-input font-mono text-sm !py-2 !w-44" list="summon-mobs" value={entity.id}
          onChange={e => set({ id: e.target.value.replace(/[^a-z0-9_:]/g, '').toLowerCase() })} placeholder="zombie" />
        <input className="form-input text-sm !py-2 flex-1 min-w-[140px]" value={entity.customName} onChange={e => set({ customName: e.target.value })} placeholder="Custom name (optional)" />
        {onRemove && (
          <button onClick={onRemove} className="btn-ghost !p-2" title="Remove"><Trash2 className="w-4 h-4" /></button>
        )}
      </div>

      {/* Behaviour chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <Chip active={entity.baby} onClick={() => set({ baby: !entity.baby })}><span className="inline-flex items-center gap-1"><Baby className="w-3 h-3" /> Baby</span></Chip>
        {FLAGS.map(f => (
          <Chip key={f.key} active={entity[f.key] as boolean} onClick={() => set({ [f.key]: !entity[f.key] } as Partial<SummonEntity>)}>{f.label}</Chip>
        ))}
      </div>

      {/* Quick stats */}
      <div className="flex flex-wrap gap-2 mb-3">
        <label className="flex items-center gap-2 text-sm rounded-lg px-3 py-1.5" style={{ border: '1px solid rgb(var(--border))', color: 'rgb(var(--muted))' }}>
          ❤ Health <input className="form-input text-sm !py-1 !px-2 w-16" value={entity.health} onChange={e => set({ health: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="max" />
        </label>
        <label className="flex items-center gap-2 text-sm rounded-lg px-3 py-1.5" style={{ border: '1px solid rgb(var(--border))', color: 'rgb(var(--muted))' }}>
          🔥 Fire <input className="form-input text-sm !py-1 !px-2 w-16" value={entity.fire} onChange={e => set({ fire: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="sec" />
        </label>
        <label className="flex items-center gap-2 text-sm rounded-lg px-3 py-1.5 flex-1 min-w-[160px]" style={{ border: '1px solid rgb(var(--border))', color: 'rgb(var(--muted))' }}>
          🏷 Tags <input className="form-input font-mono text-sm !py-1 !px-2 flex-1" value={entity.tags} onChange={e => set({ tags: e.target.value })} placeholder="my_tag, boss" />
        </label>
      </div>

      {/* Collapsible sections */}
      <div className="space-y-2">
        <Section icon={<Swords className="w-4 h-4" />} title="Equipment" count={equipCount} defaultOpen>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <EquipSlot label="Main hand" icon={<Swords className="w-3 h-3" />} item={entity.mainHand} onChange={i => set({ mainHand: i })} />
            <EquipSlot label="Off hand" icon={<Shield className="w-3 h-3" />} item={entity.offHand} onChange={i => set({ offHand: i })} />
            <EquipSlot label="Head" icon={<Shield className="w-3 h-3" />} item={entity.head} onChange={i => set({ head: i })} />
            <EquipSlot label="Chest" icon={<Shield className="w-3 h-3" />} item={entity.chest} onChange={i => set({ chest: i })} />
            <EquipSlot label="Legs" icon={<Shield className="w-3 h-3" />} item={entity.legs} onChange={i => set({ legs: i })} />
            <EquipSlot label="Feet" icon={<Shield className="w-3 h-3" />} item={entity.feet} onChange={i => set({ feet: i })} />
          </div>
          <p className="text-xs mt-2" style={{ color: 'rgb(var(--muted))' }}>Click the <Settings2 className="w-3 h-3 inline" /> on a filled slot for count, enchants, lore &amp; drop chance.</p>
        </Section>

        <Section icon={<Sparkles className="w-4 h-4" />} title="Potion effects" count={entity.effects.length}>
          {entity.effects.map((fx, i) => (
            <div key={i} className="flex items-center gap-2 mb-2 flex-wrap">
              <input className="form-input text-sm font-mono !py-2 !w-40" list="summon-effects" value={fx.id} onChange={e => setEffect(i, { id: e.target.value.replace(/[^a-z0-9_:]/g, '').toLowerCase() })} />
              <label className="text-xs flex items-center gap-1" style={{ color: 'rgb(var(--muted))' }}>amp<input className="form-input text-sm !py-1.5 w-14" type="number" value={fx.amplifier} onChange={e => setEffect(i, { amplifier: e.target.value })} /></label>
              <label className="text-xs flex items-center gap-1" style={{ color: 'rgb(var(--muted))' }}>ticks<input className="form-input text-sm !py-1.5 w-24" type="number" value={fx.duration} onChange={e => setEffect(i, { duration: e.target.value })} /></label>
              <button onClick={() => set({ effects: entity.effects.filter((_, j) => j !== i) })} className="btn-ghost !p-1.5"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <button onClick={() => set({ effects: [...entity.effects, newEffect()] })} className="btn-secondary !rounded-lg !px-3 !py-1.5 !text-xs"><Plus className="w-3.5 h-3.5" /> Add effect</button>
        </Section>

        <Section icon={<Gauge className="w-4 h-4" />} title="Attributes" count={entity.attributes.length}>
          {entity.attributes.map((a, i) => (
            <div key={i} className="flex items-center gap-2 mb-2 flex-wrap">
              <input className="form-input text-sm font-mono !py-2 !w-48" list="summon-attrs" value={a.id} onChange={e => setAttr(i, { id: e.target.value.replace(/[^a-z0-9_:.]/g, '').toLowerCase() })} />
              <label className="text-xs flex items-center gap-1" style={{ color: 'rgb(var(--muted))' }}>base<input className="form-input text-sm !py-1.5 w-24" value={a.base} onChange={e => setAttr(i, { base: e.target.value.replace(/[^0-9.-]/g, '') })} placeholder="40" /></label>
              <button onClick={() => set({ attributes: entity.attributes.filter((_, j) => j !== i) })} className="btn-ghost !p-1.5"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <button onClick={() => set({ attributes: [...entity.attributes, newAttr()] })} className="btn-secondary !rounded-lg !px-3 !py-1.5 !text-xs"><Plus className="w-3.5 h-3.5" /> Add attribute</button>
          <p className="text-xs mt-2" style={{ color: 'rgb(var(--muted))' }}>e.g. <span className="font-mono">max_health → 40</span>. Current health is the Health field above.</p>
        </Section>
      </div>

      {/* Passengers */}
      {entity.passengers.length > 0 && (
        <div className="text-xs mt-3 mb-1 flex items-center gap-1.5" style={{ color: 'rgb(var(--muted))' }}>
          <Users className="w-3.5 h-3.5" /> Riders sit on top, in order
        </div>
      )}
      {entity.passengers.map((p, i) => (
        <EntityEditor key={i} entity={p} depth={depth + 1}
          onChange={np => set({ passengers: entity.passengers.map((x, j) => j === i ? np : x) })}
          onRemove={() => set({ passengers: entity.passengers.filter((_, j) => j !== i) })} />
      ))}
      <button onClick={() => set({ passengers: [...entity.passengers, newEntity()] })}
        className="btn-secondary !rounded-lg !px-3 !py-1.5 !text-xs mt-3">
        <Plus className="w-3.5 h-3.5" /> Add passenger
      </button>

      {isRoot && <>
        <datalist id="summon-mobs">{MOBS.map(m => <option key={m} value={m} />)}</datalist>
        <datalist id="summon-items">{ITEMS.map(m => <option key={m} value={m} />)}</datalist>
        <datalist id="summon-effects">{EFFECTS.map(m => <option key={m} value={m} />)}</datalist>
        <datalist id="summon-attrs">{ATTRIBUTES.map(m => <option key={m} value={m} />)}</datalist>
      </>}
    </div>
  )
}
