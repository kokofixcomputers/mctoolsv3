import { useState, useMemo, useCallback } from 'react'
import JSZip from 'jszip'
import {
  Plus, X, Download, MessageSquare, Trophy, Hammer, Box, FileJson, Trash2,
  Pickaxe, Clock, Power, Sparkles, LogIn, Timer,
} from 'lucide-react'
import {
  entryFiles, functionTagFiles,
  type AnyEntry, type EntryKind, type DialogEntry, type AdvancementEntry,
  type RecipeEntry, type LootEntry, type DialogAction, type ActionKind,
  type BlockDropsEntry, type FunctionEntry, type JoinEntry, type TimerEntry, type CustomItemEntry,
} from '../tools/datapack/types'

// ── Pack formats ─────────────────────────────────────────────────────────────────
const PACK_FORMATS = [
  { value: 80, label: '1.21.6+ (80) — dialogs' },
  { value: 71, label: '1.21.5 (71)' },
  { value: 61, label: '1.21.4 (61)' },
  { value: 57, label: '1.21.2 (57)' },
  { value: 48, label: '1.21 (48)' },
]

const COMMON_ITEMS = [
  'diamond', 'iron_ingot', 'gold_ingot', 'emerald', 'netherite_ingot', 'stick', 'stone',
  'oak_planks', 'diamond_sword', 'diamond_pickaxe', 'golden_apple', 'enchanted_golden_apple',
  'cooked_beef', 'bread', 'ender_pearl', 'grass_block', 'chest', 'tnt', 'redstone', 'glass',
]

let _id = 0
const uid = () => `e${Date.now()}_${_id++}`

// ── defaults ─────────────────────────────────────────────────────────────────────
function newEntry(kind: EntryKind): AnyEntry {
  if (kind === 'dialog') return {
    id: uid(), kind, name: 'welcome', dtype: 'notice', title: 'Welcome',
    body: ['Thanks for joining the server!'], noticeLabel: 'Got it',
    yes: { label: 'Yes', kind: 'run_command', value: 'say yes' },
    no: { label: 'No', kind: 'none', value: '' },
    actions: [
      { label: 'Spawn', kind: 'run_command', value: 'tp @s 0 100 0' },
      { label: 'Shop', kind: 'show_dialog', value: 'mymap:shop' },
    ],
    columns: 1,
  }
  if (kind === 'advancement') return {
    id: uid(), kind, name: 'root', title: 'First Steps', description: 'Get a diamond',
    iconItem: 'diamond', frame: 'task', showToast: true, announceToChat: true, hidden: false,
    parent: '', trigger: 'inventory_changed', triggerItem: 'diamond',
    rewardXp: 0, rewardFunction: '', rewardRecipes: '',
  }
  if (kind === 'recipe') return {
    id: uid(), kind, name: 'my_recipe', rtype: 'crafting_shaped',
    grid: ['diamond', 'diamond', 'diamond', 'diamond', 'stick', 'diamond', '', 'stick', ''],
    shapeless: ['diamond', 'stick'], cookIngredient: 'iron_ore', cookExp: 0.7, cookTime: 200,
    resultItem: 'diamond_pickaxe', resultCount: 1,
  }
  if (kind === 'loot_table') return {
    id: uid(), kind: 'loot_table', name: 'reward', ltype: 'chest', rolls: 1, bonusRolls: 0,
    items: [{ item: 'diamond', weight: 1, min: 1, max: 3 }, { item: 'gold_ingot', weight: 3, min: 1, max: 5 }],
  }
  if (kind === 'block_drops') return {
    id: uid(), kind: 'block_drops', name: 'stone', mode: 'self_plus',
    drops: [{ item: 'diamond', weight: 1, min: 1, max: 1 }],
  }
  if (kind === 'tick') return { id: uid(), kind: 'tick', name: 'loop', commands: ['effect give @a minecraft:glowing 2 0 true'] }
  if (kind === 'load') return { id: uid(), kind: 'load', name: 'setup', commands: ['say Datapack loaded!'] }
  if (kind === 'join') return { id: uid(), kind: 'join', name: 'on_join', commands: ['title @s title {"text":"Welcome!"}', 'give @s minecraft:bread 8'] }
  if (kind === 'timer') return { id: uid(), kind: 'timer', name: 'every_5min', intervalValue: 5, intervalUnit: 'minutes', commands: ['say 5 minutes have passed!'] }
  return {
    id: uid(), kind: 'custom_item', name: 'give_ruby_sword', baseItem: 'diamond_sword',
    cmdType: 'string', cmdValue: 'ruby_sword', itemName: 'Ruby Sword', glint: true, unbreakable: false,
  }
}

const KIND_META: Record<EntryKind, { label: string; Icon: typeof Box }> = {
  dialog: { label: 'Dialog', Icon: MessageSquare },
  advancement: { label: 'Advancement', Icon: Trophy },
  recipe: { label: 'Recipe', Icon: Hammer },
  loot_table: { label: 'Loot Table', Icon: Box },
  block_drops: { label: 'Block Drops', Icon: Pickaxe },
  tick: { label: 'On Tick', Icon: Clock },
  load: { label: 'On Load', Icon: Power },
  join: { label: 'On Join', Icon: LogIn },
  timer: { label: 'Timer', Icon: Timer },
  custom_item: { label: 'Custom Item', Icon: Sparkles },
}

export default function DatapackPage() {
  const [namespace, setNamespace] = useState('mypack')
  const [packName, setPackName] = useState('my-datapack')
  const [packDesc, setPackDesc] = useState('Created with MCTools')
  const [packFormat, setPackFormat] = useState(80)

  const [entries, setEntries] = useState<AnyEntry[]>([newEntry('dialog')])
  const [selId, setSelId] = useState<string>(entries[0].id)
  const [exporting, setExporting] = useState(false)

  const selected = entries.find(e => e.id === selId) ?? null

  const update = useCallback((patch: Partial<AnyEntry>) => {
    setEntries(es => es.map(e => e.id === selId ? { ...e, ...patch } as AnyEntry : e))
  }, [selId])

  function addEntry(kind: EntryKind) {
    const e = newEntry(kind)
    setEntries(es => [...es, e])
    setSelId(e.id)
  }
  function removeEntry(id: string) {
    setEntries(es => {
      const next = es.filter(e => e.id !== id)
      if (id === selId && next.length) setSelId(next[0].id)
      return next
    })
  }

  const files = useMemo(() => selected ? entryFiles(selected, namespace) : [], [selected, namespace])

  async function exportZip() {
    setExporting(true)
    try {
      const zip = new JSZip()
      zip.file('pack.mcmeta', JSON.stringify({ pack: { pack_format: packFormat, description: packDesc } }, null, 2))
      for (const e of entries) {
        for (const f of entryFiles(e, namespace)) zip.file(f.path, f.content)
      }
      for (const f of functionTagFiles(entries, namespace)) zip.file(f.path, f.content)
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${packName || 'datapack'}.zip`; a.click()
      URL.revokeObjectURL(url)
    } finally { setExporting(false) }
  }

  const hasDialog = entries.some(e => e.kind === 'dialog')
  const hasCustomItem = entries.some(e => e.kind === 'custom_item')
  const firstDialog = entries.find(e => e.kind === 'dialog')
  const firstItem = entries.find(e => e.kind === 'custom_item')

  return (
    <div className="section container">
      <div className="mb-6">
        <span className="badge-muted">Tool</span>
        <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>Datapack Creator</h1>
        <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
          Build datapacks with no code — dialogs (1.21.6+), advancements, recipes, and loot tables. Export a ready-to-use zip.
        </p>
      </div>

      {/* Pack settings */}
      <div className="card flex flex-wrap items-end gap-3 mb-4">
        <div><label className="form-label">Namespace</label>
          <input className="form-input font-mono text-sm w-36" value={namespace}
            onChange={e => setNamespace(e.target.value.replace(/[^a-z0-9_.-]/g, '').toLowerCase())} /></div>
        <div className="flex-1 min-w-[140px]"><label className="form-label">Pack name (file)</label>
          <input className="form-input text-sm" value={packName} onChange={e => setPackName(e.target.value)} /></div>
        <div className="flex-1 min-w-[160px]"><label className="form-label">Description</label>
          <input className="form-input text-sm" value={packDesc} onChange={e => setPackDesc(e.target.value)} /></div>
        <div><label className="form-label">Pack format</label>
          <select className="form-input text-sm" value={packFormat} onChange={e => setPackFormat(Number(e.target.value))}>
            {PACK_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select></div>
        <button onClick={exportZip} disabled={exporting || entries.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-40"
          style={{ background: 'rgb(var(--accent))', color: 'rgb(var(--accent-fg,#fff))' }}>
          <Download className="w-4 h-4" /> {exporting ? 'Building…' : 'Export Datapack'}
        </button>
      </div>

      <div className="grid lg:grid-cols-[220px_1fr_320px] gap-4">
        {/* Entries list */}
        <div className="space-y-3">
          <div className="card" style={{ padding: '0.75rem' }}>
            <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'rgb(var(--muted))' }}>Add</div>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(KIND_META) as EntryKind[]).map(k => {
                const { label, Icon } = KIND_META[k]
                return (
                  <button key={k} onClick={() => addEntry(k)}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium"
                    style={{ border: '1px solid rgb(var(--border))', color: 'rgb(var(--text))' }}>
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="card" style={{ padding: '0.5rem' }}>
            {entries.length === 0 && <p className="text-xs p-2" style={{ color: 'rgb(var(--muted))' }}>No entries.</p>}
            <div className="space-y-1">
              {entries.map(e => {
                const { Icon } = KIND_META[e.kind]
                const on = e.id === selId
                return (
                  <div key={e.id} onClick={() => setSelId(e.id)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer group"
                    style={{ background: on ? 'rgb(var(--accent) / 0.1)' : 'transparent', border: `1px solid ${on ? 'rgb(var(--accent))' : 'transparent'}` }}>
                    <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: on ? 'rgb(var(--accent))' : 'rgb(var(--muted))' }} />
                    <span className="text-xs flex-1 truncate font-mono" style={{ color: 'rgb(var(--text))' }}>{e.name}</span>
                    <button onClick={ev => { ev.stopPropagation(); removeEntry(e.id) }}
                      className="opacity-0 group-hover:opacity-100" style={{ color: 'rgb(var(--muted))' }}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Editor */}
        <div className="card space-y-4">
          {!selected ? <p className="text-sm" style={{ color: 'rgb(var(--muted))' }}>Add an entry to start.</p> : (
            <>
              <div className="flex items-center gap-3">
                <span className="text-xs uppercase tracking-wide" style={{ color: 'rgb(var(--muted))' }}>{KIND_META[selected.kind].label}</span>
                <input className="form-input font-mono text-sm flex-1" value={selected.name}
                  onChange={e => update({ name: e.target.value.replace(/[^a-z0-9_./-]/g, '').toLowerCase() })} placeholder="file name" />
              </div>
              {selected.kind === 'dialog' && <DialogEditor e={selected} update={update} />}
              {selected.kind === 'advancement' && <AdvancementEditor e={selected} update={update} />}
              {selected.kind === 'recipe' && <RecipeEditor e={selected} update={update} />}
              {selected.kind === 'loot_table' && <LootEditor e={selected} update={update} />}
              {selected.kind === 'block_drops' && <BlockDropsEditor e={selected} update={update} />}
              {(selected.kind === 'tick' || selected.kind === 'load') && <FunctionEditor e={selected} update={update} />}
              {selected.kind === 'join' && <JoinEditor e={selected} update={update} />}
              {selected.kind === 'timer' && <TimerEditor e={selected} update={update} />}
              {selected.kind === 'custom_item' && <CustomItemEditor e={selected} update={update} />}
            </>
          )}
        </div>

        {/* File preview(s) */}
        <div className="space-y-3">
          {files.map((f, i) => (
            <div key={i} className="card" style={{ padding: '0.75rem' }}>
              <div className="flex items-center gap-1.5 mb-2">
                <FileJson className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} />
                <span className="text-xs font-mono truncate" style={{ color: 'rgb(var(--muted))' }} title={f.path}>{f.path}</span>
              </div>
              <pre className="text-xs overflow-auto max-h-[28rem] rounded-lg p-2" style={{ background: 'rgb(var(--bg))', color: 'rgb(var(--text))' }}>{f.content}</pre>
            </div>
          ))}
        </div>
      </div>

      {/* Datalist for item fields */}
      <datalist id="dp-items">{COMMON_ITEMS.map(i => <option key={i} value={i} />)}</datalist>

      {/* Install instructions */}
      <div className="card mt-4 text-sm space-y-1.5" style={{ color: 'rgb(var(--muted))' }}>
        <p className="font-semibold" style={{ color: 'rgb(var(--text))' }}>Installing your datapack</p>
        <p>Copy the exported zip into <code className="font-mono">saves/&lt;world&gt;/datapacks/</code> (or the server's world folder), then run <code className="font-mono">/reload</code>. Check it loaded with <code className="font-mono">/datapack list</code>.</p>
        {hasDialog && (
          <p>• <b style={{ color: 'rgb(var(--text))' }}>Dialogs</b> live at <code className="font-mono">data/{namespace}/dialog/&lt;name&gt;.json</code> — open one with <code className="font-mono">/dialog show @p {namespace}:{firstDialog?.name ?? '<name>'}</code>.</p>
        )}
        {entries.some(e => e.kind === 'tick' || e.kind === 'load') && (
          <p>• <b style={{ color: 'rgb(var(--text))' }}>On Tick / On Load</b> functions run automatically (wired via the <code className="font-mono">minecraft:tick</code>/<code className="font-mono">load</code> tags) the moment the pack is enabled.</p>
        )}
        {entries.some(e => e.kind === 'join') && (
          <p>• <b style={{ color: 'rgb(var(--text))' }}>On Join</b> runs once per player the first time they're seen online (emulated via a tick driver + tag).</p>
        )}
        {entries.some(e => e.kind === 'timer') && (
          <p>• <b style={{ color: 'rgb(var(--text))' }}>Timers</b> fire on their interval forever (self-rescheduling, re-armed each load).</p>
        )}
        {entries.some(e => e.kind === 'block_drops') && (
          <p>• <b style={{ color: 'rgb(var(--text))' }}>Block Drops</b> override vanilla loot — just mine the block after <code className="font-mono">/reload</code>.</p>
        )}
        {hasCustomItem && (
          <p>• <b style={{ color: 'rgb(var(--text))' }}>Custom Items</b> are handed out by a function — get one with <code className="font-mono">/function {namespace}:{firstItem?.name ?? '<name>'}</code>.</p>
        )}
      </div>
    </div>
  )
}

// ── shared small inputs ────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="form-label">{label}</label>{children}</div>
}
function ItemInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input className="form-input font-mono text-sm" list="dp-items" value={value}
    onChange={e => onChange(e.target.value)} placeholder={placeholder ?? 'minecraft:item'} />
}
function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 text-sm" style={{ color: on ? 'rgb(var(--accent))' : 'rgb(var(--muted))' }}>
      <span className="w-8 h-4 rounded-full relative transition-colors" style={{ background: on ? 'rgb(var(--accent))' : 'rgb(var(--border))' }}>
        <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all" style={{ left: on ? '18px' : '2px' }} />
      </span>{label}
    </button>
  )
}

// ── Dialog editor ──────────────────────────────────────────────────────────────────
const ACTION_KINDS: { v: ActionKind; l: string }[] = [
  { v: 'none', l: 'Just close' },
  { v: 'run_command', l: 'Run command' },
  { v: 'show_dialog', l: 'Open dialog' },
  { v: 'open_url', l: 'Open URL' },
]
function ActionEditor({ a, onChange }: { a: DialogAction; onChange: (a: DialogAction) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg p-2" style={{ border: '1px solid rgb(var(--border))' }}>
      <input className="form-input text-sm" value={a.label} onChange={e => onChange({ ...a, label: e.target.value })} placeholder="Button label" />
      <select className="form-input text-sm" value={a.kind} onChange={e => onChange({ ...a, kind: e.target.value as ActionKind })}>
        {ACTION_KINDS.map(k => <option key={k.v} value={k.v}>{k.l}</option>)}
      </select>
      {a.kind !== 'none' && (
        <input className="form-input text-sm font-mono col-span-2" value={a.value} onChange={e => onChange({ ...a, value: e.target.value })}
          placeholder={a.kind === 'run_command' ? 'say hi (no leading /)' : a.kind === 'show_dialog' ? 'namespace:dialog' : 'https://…'} />
      )}
    </div>
  )
}
function DialogEditor({ e, update }: { e: DialogEntry; update: (p: Partial<DialogEntry>) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Dialog type">
          <select className="form-input text-sm" value={e.dtype} onChange={ev => update({ dtype: ev.target.value as DialogEntry['dtype'] })}>
            <option value="notice">Notice</option>
            <option value="confirmation">Confirmation</option>
            <option value="multi_action">Multi-action</option>
            <option value="server_links">Server links</option>
          </select>
        </Field>
        <Field label="Title"><input className="form-input text-sm" value={e.title} onChange={ev => update({ title: ev.target.value })} /></Field>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="form-label mb-0">Body messages</label>
          <button onClick={() => update({ body: [...e.body, ''] })} className="btn-ghost flex items-center gap-1 text-xs"><Plus className="w-3 h-3" />Add</button>
        </div>
        {e.body.map((b, i) => (
          <div key={i} className="flex gap-2 mb-1.5">
            <input className="form-input text-sm flex-1" value={b} onChange={ev => update({ body: e.body.map((x, j) => j === i ? ev.target.value : x) })} />
            <button onClick={() => update({ body: e.body.filter((_, j) => j !== i) })} className="btn-ghost p-1" style={{ color: 'rgb(var(--muted))' }}><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>

      {e.dtype === 'notice' && (
        <Field label="Button label"><input className="form-input text-sm" value={e.noticeLabel} onChange={ev => update({ noticeLabel: ev.target.value })} /></Field>
      )}
      {e.dtype === 'confirmation' && (
        <div className="grid grid-cols-1 gap-3">
          <div><label className="form-label">Yes button</label><ActionEditor a={e.yes} onChange={a => update({ yes: a })} /></div>
          <div><label className="form-label">No button</label><ActionEditor a={e.no} onChange={a => update({ no: a })} /></div>
        </div>
      )}
      {e.dtype === 'multi_action' && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="form-label mb-0">Buttons</label>
            <button onClick={() => update({ actions: [...e.actions, { label: 'Button', kind: 'run_command', value: '' }] })} className="btn-ghost flex items-center gap-1 text-xs"><Plus className="w-3 h-3" />Add</button>
          </div>
          <div className="space-y-2">
            {e.actions.map((a, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1"><ActionEditor a={a} onChange={na => update({ actions: e.actions.map((x, j) => j === i ? na : x) })} /></div>
                <button onClick={() => update({ actions: e.actions.filter((_, j) => j !== i) })} className="btn-ghost p-1 mt-1" style={{ color: 'rgb(var(--muted))' }}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
          <div className="mt-2 w-32"><Field label="Columns"><input type="number" min={1} max={4} className="form-input text-sm" value={e.columns} onChange={ev => update({ columns: Number(ev.target.value) })} /></Field></div>
        </div>
      )}
      {e.dtype === 'server_links' && (
        <p className="text-sm" style={{ color: 'rgb(var(--muted))' }}>Renders the links configured on the server (via <code className="font-mono">server-links</code>). No extra fields.</p>
      )}
    </div>
  )
}

// ── Advancement editor ──────────────────────────────────────────────────────────────
function AdvancementEditor({ e, update }: { e: AdvancementEntry; update: (p: Partial<AdvancementEntry>) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Title"><input className="form-input text-sm" value={e.title} onChange={ev => update({ title: ev.target.value })} /></Field>
        <Field label="Frame">
          <select className="form-input text-sm" value={e.frame} onChange={ev => update({ frame: ev.target.value as AdvancementEntry['frame'] })}>
            <option value="task">Task (advancement)</option>
            <option value="goal">Goal</option>
            <option value="challenge">Challenge</option>
          </select>
        </Field>
      </div>
      <Field label="Description"><input className="form-input text-sm" value={e.description} onChange={ev => update({ description: ev.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Icon item"><ItemInput value={e.iconItem} onChange={v => update({ iconItem: v })} /></Field>
        <Field label="Parent (optional)"><input className="form-input text-sm font-mono" value={e.parent} onChange={ev => update({ parent: ev.target.value })} placeholder="namespace:advancement" /></Field>
      </div>
      <div className="flex flex-wrap gap-4">
        <Toggle label="Show toast" on={e.showToast} onClick={() => update({ showToast: !e.showToast })} />
        <Toggle label="Announce to chat" on={e.announceToChat} onClick={() => update({ announceToChat: !e.announceToChat })} />
        <Toggle label="Hidden" on={e.hidden} onClick={() => update({ hidden: !e.hidden })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Trigger">
          <select className="form-input text-sm" value={e.trigger} onChange={ev => update({ trigger: ev.target.value as AdvancementEntry['trigger'] })}>
            <option value="inventory_changed">Get item (inventory_changed)</option>
            <option value="consume_item">Eat/drink item</option>
            <option value="player_killed_entity">Kill entity</option>
            <option value="tick">Every tick</option>
            <option value="impossible">Impossible (manual grant)</option>
          </select>
        </Field>
        {(e.trigger === 'inventory_changed' || e.trigger === 'consume_item') && (
          <Field label="Item"><ItemInput value={e.triggerItem} onChange={v => update({ triggerItem: v })} /></Field>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Reward XP"><input type="number" className="form-input text-sm" value={e.rewardXp} onChange={ev => update({ rewardXp: Number(ev.target.value) })} /></Field>
        <Field label="Reward function"><input className="form-input text-sm font-mono" value={e.rewardFunction} onChange={ev => update({ rewardFunction: ev.target.value })} placeholder="ns:fn" /></Field>
        <Field label="Reward recipes"><input className="form-input text-sm font-mono" value={e.rewardRecipes} onChange={ev => update({ rewardRecipes: ev.target.value })} placeholder="ns:recipe, …" /></Field>
      </div>
    </div>
  )
}

// ── Recipe editor ───────────────────────────────────────────────────────────────────
function RecipeEditor({ e, update }: { e: RecipeEntry; update: (p: Partial<RecipeEntry>) => void }) {
  const cooking = e.rtype === 'smelting' || e.rtype === 'blasting' || e.rtype === 'smoking' || e.rtype === 'campfire_cooking'
  return (
    <div className="space-y-3">
      <Field label="Recipe type">
        <select className="form-input text-sm" value={e.rtype} onChange={ev => update({ rtype: ev.target.value as RecipeEntry['rtype'] })}>
          <option value="crafting_shaped">Crafting (shaped)</option>
          <option value="crafting_shapeless">Crafting (shapeless)</option>
          <option value="smelting">Smelting (furnace)</option>
          <option value="blasting">Blasting</option>
          <option value="smoking">Smoking</option>
          <option value="campfire_cooking">Campfire</option>
        </select>
      </Field>

      {e.rtype === 'crafting_shaped' && (
        <div>
          <label className="form-label">3×3 grid (leave cells empty for air)</label>
          <div className="grid grid-cols-3 gap-1.5 w-fit">
            {e.grid.map((c, i) => (
              <input key={i} className="form-input font-mono text-xs" style={{ width: 90 }} list="dp-items" value={c}
                onChange={ev => update({ grid: e.grid.map((x, j) => j === i ? ev.target.value : x) })} placeholder="—" />
            ))}
          </div>
        </div>
      )}
      {e.rtype === 'crafting_shapeless' && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="form-label mb-0">Ingredients</label>
            <button onClick={() => update({ shapeless: [...e.shapeless, ''] })} className="btn-ghost flex items-center gap-1 text-xs"><Plus className="w-3 h-3" />Add</button>
          </div>
          {e.shapeless.map((s, i) => (
            <div key={i} className="flex gap-2 mb-1.5">
              <ItemInput value={s} onChange={v => update({ shapeless: e.shapeless.map((x, j) => j === i ? v : x) })} />
              <button onClick={() => update({ shapeless: e.shapeless.filter((_, j) => j !== i) })} className="btn-ghost p-1" style={{ color: 'rgb(var(--muted))' }}><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
      {cooking && (
        <div className="grid grid-cols-3 gap-3">
          <Field label="Ingredient"><ItemInput value={e.cookIngredient} onChange={v => update({ cookIngredient: v })} /></Field>
          <Field label="Experience"><input type="number" step={0.1} className="form-input text-sm" value={e.cookExp} onChange={ev => update({ cookExp: Number(ev.target.value) })} /></Field>
          <Field label="Cook time (ticks)"><input type="number" className="form-input text-sm" value={e.cookTime} onChange={ev => update({ cookTime: Number(ev.target.value) })} /></Field>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Result item"><ItemInput value={e.resultItem} onChange={v => update({ resultItem: v })} /></Field>
        {!cooking && <Field label="Result count"><input type="number" min={1} max={64} className="form-input text-sm" value={e.resultCount} onChange={ev => update({ resultCount: Number(ev.target.value) })} /></Field>}
      </div>
    </div>
  )
}

// ── Block drops editor ──────────────────────────────────────────────────────────────
function BlockDropsEditor({ e, update }: { e: BlockDropsEntry; update: (p: Partial<BlockDropsEntry>) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Block to override (the entry name is the block id)">
        <ItemInput value={e.name} onChange={v => update({ name: v.replace(/^minecraft:/, '') })} placeholder="stone" />
      </Field>
      <Field label="Drop mode">
        <select className="form-input text-sm" value={e.mode} onChange={ev => update({ mode: ev.target.value as BlockDropsEntry['mode'] })}>
          <option value="replace">Drop only these (replace)</option>
          <option value="self_plus">Drop itself + these</option>
        </select>
      </Field>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="form-label mb-0">Drops</label>
          <button onClick={() => update({ drops: [...e.drops, { item: 'diamond', weight: 1, min: 1, max: 1 }] })} className="btn-ghost flex items-center gap-1 text-xs"><Plus className="w-3 h-3" />Add</button>
        </div>
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 text-xs font-medium pb-1" style={{ color: 'rgb(var(--muted))' }}>
          <span>Item</span><span className="w-14">Weight</span><span className="w-12">Min</span><span className="w-12">Max</span><span></span>
        </div>
        <div className="space-y-1.5">
          {e.drops.map((it, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center">
              <ItemInput value={it.item} onChange={v => update({ drops: e.drops.map((x, j) => j === i ? { ...x, item: v } : x) })} />
              <input type="number" min={1} className="form-input text-sm w-14" value={it.weight} onChange={ev => update({ drops: e.drops.map((x, j) => j === i ? { ...x, weight: Number(ev.target.value) } : x) })} />
              <input type="number" min={1} className="form-input text-sm w-12" value={it.min} onChange={ev => update({ drops: e.drops.map((x, j) => j === i ? { ...x, min: Number(ev.target.value) } : x) })} />
              <input type="number" min={1} className="form-input text-sm w-12" value={it.max} onChange={ev => update({ drops: e.drops.map((x, j) => j === i ? { ...x, max: Number(ev.target.value) } : x) })} />
              <button onClick={() => update({ drops: e.drops.filter((_, j) => j !== i) })} className="btn-ghost p-1" style={{ color: 'rgb(var(--muted))' }}><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs" style={{ color: 'rgb(var(--muted))' }}>Overrides the vanilla block at <code className="font-mono">minecraft:loot_table/blocks/{e.name || 'stone'}</code>. Mining it will now drop the above{e.mode === 'self_plus' ? ' plus the block itself' : ''}.</p>
    </div>
  )
}

// ── Function editor (tick / load) ────────────────────────────────────────────────────
function FunctionEditor({ e, update }: { e: FunctionEntry; update: (p: Partial<FunctionEntry>) => void }) {
  return (
    <div className="space-y-3">
      <Field label={`Commands — run ${e.kind === 'tick' ? 'every tick (20×/sec)' : 'once when the pack loads / on /reload'} (one per line, no leading /)`}>
        <textarea className="form-input text-sm font-mono w-full" rows={8} spellCheck={false}
          value={e.commands.join('\n')}
          onChange={ev => update({ commands: ev.target.value.split('\n') })}
          placeholder={e.kind === 'tick' ? 'effect give @a minecraft:night_vision 12 0 true' : 'say Server started!'} />
      </Field>
      <p className="text-xs" style={{ color: 'rgb(var(--muted))' }}>
        Auto-wired via the <code className="font-mono">minecraft:{e.kind}</code> function tag — runs automatically once the pack is enabled.
        {e.kind === 'tick' && ' Tip: heavy logic every tick can lag; gate it with /schedule or conditions.'}
      </p>
    </div>
  )
}

// ── Join editor ──────────────────────────────────────────────────────────────────────
function JoinEditor({ e, update }: { e: JoinEntry; update: (p: Partial<JoinEntry>) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Commands — run as the player the first time they're seen (one per line, no leading /)">
        <textarea className="form-input text-sm font-mono w-full" rows={8} spellCheck={false}
          value={e.commands.join('\n')}
          onChange={ev => update({ commands: ev.target.value.split('\n') })}
          placeholder={'title @s title {"text":"Welcome!"}\ngive @s minecraft:bread 8'} />
      </Field>
      <p className="text-xs" style={{ color: 'rgb(var(--muted))' }}>
        Vanilla has no real join event, so this is emulated: a tick driver runs your commands for any player without a
        tag, then tags them — so it fires <b>once per player</b> (first time they're seen). Commands run as <code className="font-mono">@s</code> (the player).
        Reliable per-login "join", "leave", and "chat" events aren't possible in vanilla datapacks (they need a plugin/mod).
      </p>
    </div>
  )
}

// ── Timer editor ─────────────────────────────────────────────────────────────────────
function TimerEditor({ e, update }: { e: TimerEntry; update: (p: Partial<TimerEntry>) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Every"><input type="number" min={1} className="form-input text-sm" value={e.intervalValue} onChange={ev => update({ intervalValue: Number(ev.target.value) })} /></Field>
        <Field label="Unit">
          <select className="form-input text-sm" value={e.intervalUnit} onChange={ev => update({ intervalUnit: ev.target.value as TimerEntry['intervalUnit'] })}>
            <option value="ticks">ticks</option>
            <option value="seconds">seconds</option>
            <option value="minutes">minutes</option>
            <option value="hours">hours</option>
            <option value="days">days</option>
          </select>
        </Field>
      </div>
      <Field label="Commands (one per line, no leading /)">
        <textarea className="form-input text-sm font-mono w-full" rows={7} spellCheck={false}
          value={e.commands.join('\n')}
          onChange={ev => update({ commands: ev.target.value.split('\n') })}
          placeholder={'say 5 minutes have passed!'} />
      </Field>
      <p className="text-xs" style={{ color: 'rgb(var(--muted))' }}>
        The function runs your commands then re-schedules itself, looping forever. It's auto-armed on load (the
        <code className="font-mono"> /schedule</code> queue is wiped by <code className="font-mono">/reload</code>, so it re-arms every reload).
        Commands run at the world (use <code className="font-mono">@a</code>/<code className="font-mono">@p</code> for players).
      </p>
    </div>
  )
}

// ── Custom item editor ───────────────────────────────────────────────────────────────
function CustomItemEditor({ e, update }: { e: CustomItemEntry; update: (p: Partial<CustomItemEntry>) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Base (vanilla) item"><ItemInput value={e.baseItem} onChange={v => update({ baseItem: v })} placeholder="diamond_sword" /></Field>
        <Field label="Display name"><input className="form-input text-sm" value={e.itemName} onChange={ev => update({ itemName: ev.target.value })} placeholder="Ruby Sword" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Custom model data type">
          <select className="form-input text-sm" value={e.cmdType} onChange={ev => update({ cmdType: ev.target.value as CustomItemEntry['cmdType'] })}>
            <option value="string">String / id (1.21.4+)</option>
            <option value="number">Number (float)</option>
          </select>
        </Field>
        <Field label="Custom model data value"><input className="form-input text-sm font-mono" value={e.cmdValue} onChange={ev => update({ cmdValue: ev.target.value })} placeholder={e.cmdType === 'string' ? 'ruby_sword' : '1'} /></Field>
      </div>
      <div className="flex gap-4">
        <Toggle label="Enchantment glint" on={e.glint} onClick={() => update({ glint: !e.glint })} />
        <Toggle label="Unbreakable" on={e.unbreakable} onClick={() => update({ unbreakable: !e.unbreakable })} />
      </div>
      <p className="text-xs" style={{ color: 'rgb(var(--muted))' }}>
        It's a real <code className="font-mono">{e.baseItem || 'diamond_sword'}</code> with a <code className="font-mono">custom_model_data</code> tag — pair the same value in a resource pack (see the Resource Pack Maker's CMD feature) to give it a unique model. Get it in-game with <code className="font-mono">/function {`<namespace>`}:{e.name}</code>.
      </p>
    </div>
  )
}

// ── Loot editor ─────────────────────────────────────────────────────────────────────
function LootEditor({ e, update }: { e: LootEntry; update: (p: Partial<LootEntry>) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Table type">
          <select className="form-input text-sm" value={e.ltype} onChange={ev => update({ ltype: ev.target.value as LootEntry['ltype'] })}>
            <option value="chest">Chest</option>
            <option value="block">Block</option>
            <option value="entity">Entity</option>
            <option value="gift">Gift</option>
            <option value="fishing">Fishing</option>
            <option value="generic">Generic</option>
          </select>
        </Field>
        <Field label="Rolls"><input type="number" min={0} className="form-input text-sm" value={e.rolls} onChange={ev => update({ rolls: Number(ev.target.value) })} /></Field>
        <Field label="Bonus rolls"><input type="number" min={0} step={0.1} className="form-input text-sm" value={e.bonusRolls} onChange={ev => update({ bonusRolls: Number(ev.target.value) })} /></Field>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="form-label mb-0">Items</label>
          <button onClick={() => update({ items: [...e.items, { item: 'diamond', weight: 1, min: 1, max: 1 }] })} className="btn-ghost flex items-center gap-1 text-xs"><Plus className="w-3 h-3" />Add</button>
        </div>
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 text-xs font-medium pb-1" style={{ color: 'rgb(var(--muted))' }}>
          <span>Item</span><span className="w-14">Weight</span><span className="w-12">Min</span><span className="w-12">Max</span><span></span>
        </div>
        <div className="space-y-1.5">
          {e.items.map((it, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center">
              <ItemInput value={it.item} onChange={v => update({ items: e.items.map((x, j) => j === i ? { ...x, item: v } : x) })} />
              <input type="number" min={1} className="form-input text-sm w-14" value={it.weight} onChange={ev => update({ items: e.items.map((x, j) => j === i ? { ...x, weight: Number(ev.target.value) } : x) })} />
              <input type="number" min={1} className="form-input text-sm w-12" value={it.min} onChange={ev => update({ items: e.items.map((x, j) => j === i ? { ...x, min: Number(ev.target.value) } : x) })} />
              <input type="number" min={1} className="form-input text-sm w-12" value={it.max} onChange={ev => update({ items: e.items.map((x, j) => j === i ? { ...x, max: Number(ev.target.value) } : x) })} />
              <button onClick={() => update({ items: e.items.filter((_, j) => j !== i) })} className="btn-ghost p-1" style={{ color: 'rgb(var(--muted))' }}><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
