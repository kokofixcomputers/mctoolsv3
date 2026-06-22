// Datapack entry models + JSON serializers. Each entry produces one file under
// data/<namespace>/<folder>/<name>.json.

export type EntryKind =
  | 'dialog' | 'advancement' | 'recipe' | 'loot_table'
  | 'block_drops' | 'tick' | 'load' | 'join' | 'timer' | 'custom_item'

export interface BaseEntry {
  id: string
  kind: EntryKind
  name: string   // file name (no extension)
}

// ── Dialogs (1.21.6+) ────────────────────────────────────────────────────────────

export type DialogType = 'notice' | 'confirmation' | 'multi_action' | 'server_links'
export type ActionKind = 'none' | 'run_command' | 'open_url' | 'show_dialog'

export interface DialogAction {
  label: string
  kind: ActionKind
  value: string  // command / url / dialog id depending on kind
}

export interface DialogEntry extends BaseEntry {
  kind: 'dialog'
  dtype: DialogType
  title: string
  body: string[]
  noticeLabel: string             // notice: action label
  yes: DialogAction               // confirmation
  no: DialogAction
  actions: DialogAction[]         // multi_action
  columns: number
}

function bodyJson(body: string[]) {
  return body.filter(b => b.trim()).map(contents => ({ type: 'minecraft:plain_message', contents }))
}

function actionJson(a: DialogAction): Record<string, unknown> | null {
  if (a.kind === 'none') return null
  if (a.kind === 'run_command') return { action: 'run_command', command: a.value }
  if (a.kind === 'open_url') return { action: 'open_url', url: a.value }
  if (a.kind === 'show_dialog') return { action: 'show_dialog', dialog: a.value }
  return null
}

export function serializeDialog(d: DialogEntry): Record<string, unknown> {
  const base: Record<string, unknown> = {
    type: `minecraft:${d.dtype}`,
    title: d.title,
    body: bodyJson(d.body),
  }
  if (d.dtype === 'notice') {
    base.action = { label: d.noticeLabel || 'Ok' }
  } else if (d.dtype === 'confirmation') {
    const yes: Record<string, unknown> = { label: d.yes.label || 'Yes' }
    const ya = actionJson(d.yes); if (ya) yes.action = ya
    const no: Record<string, unknown> = { label: d.no.label || 'No' }
    const na = actionJson(d.no); if (na) no.action = na
    base.yes = yes
    base.no = no
  } else if (d.dtype === 'multi_action') {
    base.actions = d.actions.map(a => {
      const o: Record<string, unknown> = { label: a.label || 'Button' }
      const ax = actionJson(a); if (ax) o.action = ax
      return o
    })
    if (d.columns > 1) base.columns = d.columns
  }
  // server_links: just type/title/body
  return base
}

// ── Advancements ─────────────────────────────────────────────────────────────────

export type Frame = 'task' | 'goal' | 'challenge'
export type Trigger = 'impossible' | 'tick' | 'inventory_changed' | 'consume_item' | 'player_killed_entity'

export interface AdvancementEntry extends BaseEntry {
  kind: 'advancement'
  title: string
  description: string
  iconItem: string
  frame: Frame
  showToast: boolean
  announceToChat: boolean
  hidden: boolean
  parent: string
  trigger: Trigger
  triggerItem: string   // for inventory_changed / consume_item
  rewardXp: number
  rewardFunction: string
  rewardRecipes: string  // comma-separated
}

export function serializeAdvancement(a: AdvancementEntry): Record<string, unknown> {
  const criteria: Record<string, unknown> = {}
  const cond: Record<string, unknown> = {}
  if ((a.trigger === 'inventory_changed' || a.trigger === 'consume_item') && a.triggerItem.trim()) {
    if (a.trigger === 'inventory_changed') cond.items = [{ items: [withNs(a.triggerItem)] }]
    else cond.item = { items: [withNs(a.triggerItem)] }
  }
  criteria.requirement = {
    trigger: `minecraft:${a.trigger}`,
    ...(Object.keys(cond).length ? { conditions: cond } : {}),
  }

  const out: Record<string, unknown> = {
    display: {
      title: a.title,
      description: a.description,
      icon: { id: withNs(a.iconItem || 'minecraft:stone') },
      frame: a.frame,
      show_toast: a.showToast,
      announce_to_chat: a.announceToChat,
      hidden: a.hidden,
    },
    criteria,
  }
  if (a.parent.trim()) out.parent = withNs(a.parent)
  const rewards: Record<string, unknown> = {}
  if (a.rewardXp) rewards.experience = a.rewardXp
  if (a.rewardFunction.trim()) rewards.function = withNs(a.rewardFunction)
  const recipes = a.rewardRecipes.split(',').map(s => s.trim()).filter(Boolean).map(withNs)
  if (recipes.length) rewards.recipes = recipes
  if (Object.keys(rewards).length) out.rewards = rewards
  return out
}

// ── Recipes ──────────────────────────────────────────────────────────────────────

export type RecipeType = 'crafting_shaped' | 'crafting_shapeless' | 'smelting' | 'blasting' | 'smoking' | 'campfire_cooking'

export interface RecipeEntry extends BaseEntry {
  kind: 'recipe'
  rtype: RecipeType
  grid: string[]          // 9 cells (shaped)
  shapeless: string[]     // ingredient list
  cookIngredient: string  // smelting input
  cookExp: number
  cookTime: number
  resultItem: string
  resultCount: number
}

function trimPattern(grid: string[]): { pattern: string[]; key: Record<string, { item: string }> } {
  // map distinct non-empty items to letters
  const letters = 'ABCDEFGHI'
  const map = new Map<string, string>()
  const key: Record<string, { item: string }> = {}
  let li = 0
  const rows = [0, 1, 2].map(r => {
    let s = ''
    for (let c = 0; c < 3; c++) {
      const item = grid[r * 3 + c].trim()
      if (!item) { s += ' '; continue }
      let letter = map.get(item)
      if (!letter) { letter = letters[li++]; map.set(item, letter); key[letter] = { item: withNs(item) } }
      s += letter
    }
    return s
  })
  // trim fully-empty outer rows/cols
  let pattern = rows
  while (pattern.length && pattern[pattern.length - 1].trim() === '') pattern = pattern.slice(0, -1)
  while (pattern.length && pattern[0].trim() === '') pattern = pattern.slice(1)
  // trim leading/trailing empty columns
  const trimCols = (rs: string[]) => {
    if (!rs.length) return rs
    let lead = Math.min(...rs.map(r => r.length - r.trimStart().length))
    let trail = Math.min(...rs.map(r => r.length - r.trimEnd().length))
    if (!isFinite(lead)) lead = 0
    if (!isFinite(trail)) trail = 0
    return rs.map(r => r.slice(lead, r.length - trail))
  }
  pattern = trimCols(pattern)
  return { pattern, key }
}

export function serializeRecipe(r: RecipeEntry): Record<string, unknown> {
  if (r.rtype === 'crafting_shaped') {
    const { pattern, key } = trimPattern(r.grid)
    return {
      type: 'minecraft:crafting_shaped',
      pattern,
      key,
      result: { id: withNs(r.resultItem || 'minecraft:stone'), count: r.resultCount || 1 },
    }
  }
  if (r.rtype === 'crafting_shapeless') {
    return {
      type: 'minecraft:crafting_shapeless',
      ingredients: r.shapeless.filter(s => s.trim()).map(s => ({ item: withNs(s) })),
      result: { id: withNs(r.resultItem || 'minecraft:stone'), count: r.resultCount || 1 },
    }
  }
  // cooking
  return {
    type: `minecraft:${r.rtype}`,
    ingredient: { item: withNs(r.cookIngredient || 'minecraft:stone') },
    result: { id: withNs(r.resultItem || 'minecraft:stone') },
    experience: r.cookExp,
    cookingtime: r.cookTime,
  }
}

// ── Loot tables ──────────────────────────────────────────────────────────────────

export type LootType = 'chest' | 'block' | 'entity' | 'gift' | 'fishing' | 'generic'

export interface LootItem { item: string; weight: number; min: number; max: number }

export interface LootEntry extends BaseEntry {
  kind: 'loot_table'
  ltype: LootType
  rolls: number
  bonusRolls: number
  items: LootItem[]
}

export function serializeLoot(l: LootEntry): Record<string, unknown> {
  return {
    type: `minecraft:${l.ltype}`,
    pools: [{
      rolls: l.rolls,
      ...(l.bonusRolls ? { bonus_rolls: l.bonusRolls } : {}),
      entries: l.items.filter(i => i.item.trim()).map(i => {
        const functions: unknown[] = []
        if (i.min !== 1 || i.max !== 1) {
          functions.push({
            function: 'minecraft:set_count',
            count: i.min === i.max ? i.min : { min: i.min, max: i.max },
          })
        }
        return {
          type: 'minecraft:item',
          name: withNs(i.item),
          weight: i.weight,
          ...(functions.length ? { functions } : {}),
        }
      }),
    }],
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────────

export function withNs(id: string): string {
  const v = id.trim()
  if (!v) return v
  return v.includes(':') ? v : `minecraft:${v}`
}

export function stripNs(id: string): string {
  return id.trim().replace(/^minecraft:/, '')
}

// ── Block drops (overrides a vanilla block's loot table) ──────────────────────────

export type DropMode = 'replace' | 'self_plus'

export interface BlockDropsEntry extends BaseEntry {
  kind: 'block_drops'
  // `name` is the block id (e.g. "stone")
  mode: DropMode
  drops: LootItem[]
}

const survives = [{ condition: 'minecraft:survives_explosion' }]

export function serializeBlockDrops(e: BlockDropsEntry): Record<string, unknown> {
  const block = stripNs(e.name) || 'stone'
  const pools: unknown[] = []
  if (e.mode === 'self_plus') {
    pools.push({
      rolls: 1,
      entries: [{ type: 'minecraft:item', name: `minecraft:${block}` }],
      conditions: survives,
    })
  }
  pools.push({
    rolls: 1,
    entries: e.drops.filter(d => d.item.trim()).map(d => {
      const functions: unknown[] = []
      if (d.min !== 1 || d.max !== 1) {
        functions.push({ function: 'minecraft:set_count', count: d.min === d.max ? d.min : { min: d.min, max: d.max } })
      }
      return { type: 'minecraft:item', name: withNs(d.item), weight: d.weight, ...(functions.length ? { functions } : {}) }
    }),
    conditions: survives,
  })
  return { type: 'minecraft:block', pools }
}

// ── Functions (tick / load) ────────────────────────────────────────────────────────

export interface FunctionEntry extends BaseEntry {
  kind: 'tick' | 'load'
  commands: string[]
}

// Player-join: commands run for each player the first time they're seen online.
export interface JoinEntry extends BaseEntry {
  kind: 'join'
  commands: string[]
}

export function serializeFunction(e: { commands: string[] }): string {
  return e.commands.map(c => c.replace(/^\//, '').trimEnd()).filter(Boolean).join('\n') + '\n'
}

function sanitizeTag(s: string): string {
  return s.replace(/[^A-Za-z0-9_.+-]/g, '_')
}

// Repeating timer via self-rescheduling /schedule. Re-armed on load (schedule is
// cleared by /reload), so it survives reloads.
export type TimeUnit = 'ticks' | 'seconds' | 'minutes' | 'hours' | 'days'

export interface TimerEntry extends BaseEntry {
  kind: 'timer'
  intervalValue: number
  intervalUnit: TimeUnit
  commands: string[]
}

// Convert to a /schedule-valid time string (only t, s, d are accepted).
export function scheduleTime(value: number, unit: TimeUnit): string {
  const v = Math.max(1, Math.floor(value))
  switch (unit) {
    case 'ticks': return `${v}t`
    case 'seconds': return `${v}s`
    case 'minutes': return `${v * 60}s`
    case 'hours': return `${v * 3600}s`
    case 'days': return `${v}d`
  }
}

export function timerFunction(e: TimerEntry, ns: string): string {
  const interval = scheduleTime(e.intervalValue, e.intervalUnit)
  return serializeFunction(e).trimEnd() + `\nschedule function ${ns}:${e.name} ${interval} replace\n`
}

export function timerStarter(e: TimerEntry, ns: string): string {
  const interval = scheduleTime(e.intervalValue, e.intervalUnit)
  return `schedule function ${ns}:${e.name} ${interval} replace\n`
}

// Driver added to the tick tag: runs the join function once per player, then tags them.
export function joinDriver(e: JoinEntry, ns: string): string {
  const tag = sanitizeTag(`${ns}_${e.name}_joined`)
  return [
    `execute as @a[tag=!${tag}] at @s run function ${ns}:${e.name}`,
    `tag @a add ${tag}`,
  ].join('\n') + '\n'
}

// ── Custom items (vanilla base + custom_model_data) ──────────────────────────────────

export interface CustomItemEntry extends BaseEntry {
  kind: 'custom_item'
  baseItem: string
  cmdType: 'string' | 'number'
  cmdValue: string
  itemName: string
  glint: boolean
  unbreakable: boolean
}

export function customItemGive(e: CustomItemEntry): string {
  const comps: string[] = []
  if (e.cmdType === 'string') comps.push(`custom_model_data={strings:[${JSON.stringify(e.cmdValue)}]}`)
  else comps.push(`custom_model_data={floats:[${Number(e.cmdValue) || 0}]}`)
  if (e.itemName.trim()) comps.push(`item_name='${JSON.stringify(e.itemName)}'`)
  if (e.glint) comps.push('enchantment_glint_override=true')
  if (e.unbreakable) comps.push('unbreakable={}')
  const base = withNs(e.baseItem || 'minecraft:diamond_sword')
  return `give @s ${base}[${comps.join(',')}]\n`
}

// ── Unified entry → files ─────────────────────────────────────────────────────────

export type AnyEntry =
  | DialogEntry | AdvancementEntry | RecipeEntry | LootEntry
  | BlockDropsEntry | FunctionEntry | JoinEntry | TimerEntry | CustomItemEntry

export interface DatapackFile { path: string; content: string }

function jsonFile(path: string, obj: unknown): DatapackFile {
  return { path, content: JSON.stringify(obj, null, 2) }
}

/** All files a single entry produces (path relative to the zip root). */
export function entryFiles(e: AnyEntry, ns: string): DatapackFile[] {
  switch (e.kind) {
    case 'dialog': return [jsonFile(`data/${ns}/dialog/${e.name}.json`, serializeDialog(e))]
    case 'advancement': return [jsonFile(`data/${ns}/advancement/${e.name}.json`, serializeAdvancement(e))]
    case 'recipe': return [jsonFile(`data/${ns}/recipe/${e.name}.json`, serializeRecipe(e))]
    case 'loot_table': return [jsonFile(`data/${ns}/loot_table/${e.name}.json`, serializeLoot(e))]
    case 'block_drops': return [jsonFile(`data/minecraft/loot_table/blocks/${stripNs(e.name) || 'stone'}.json`, serializeBlockDrops(e))]
    case 'tick':
    case 'load': return [{ path: `data/${ns}/function/${e.name}.mcfunction`, content: serializeFunction(e) }]
    case 'join': return [
      { path: `data/${ns}/function/${e.name}.mcfunction`, content: serializeFunction(e) },
      { path: `data/${ns}/function/${e.name}__join.mcfunction`, content: joinDriver(e, ns) },
    ]
    case 'timer': return [
      { path: `data/${ns}/function/${e.name}.mcfunction`, content: timerFunction(e, ns) },
      { path: `data/${ns}/function/${e.name}__start.mcfunction`, content: timerStarter(e, ns) },
    ]
    case 'custom_item': return [{ path: `data/${ns}/function/${e.name}.mcfunction`, content: customItemGive(e) }]
  }
}

/** The minecraft function tags that wire tick/load (and join/timer drivers) to run automatically. */
export function functionTagFiles(entries: AnyEntry[], ns: string): DatapackFile[] {
  const tick = [
    ...entries.filter(e => e.kind === 'tick').map(e => `${ns}:${e.name}`),
    ...entries.filter(e => e.kind === 'join').map(e => `${ns}:${e.name}__join`),
  ]
  const load = [
    ...entries.filter(e => e.kind === 'load').map(e => `${ns}:${e.name}`),
    ...entries.filter(e => e.kind === 'timer').map(e => `${ns}:${e.name}__start`),
  ]
  const files: DatapackFile[] = []
  if (tick.length) files.push(jsonFile('data/minecraft/tags/function/tick.json', { values: tick }))
  if (load.length) files.push(jsonFile('data/minecraft/tags/function/load.json', { values: load }))
  return files
}
