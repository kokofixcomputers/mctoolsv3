// Model + version-aware SNBT/command builder for the /summon generator.
//
// Minecraft restructures entity equipment NBT across versions:
//   ≥ 1.21.5  : equipment:{mainhand:{…},head:{…},…} + drop_chances:{…}
//   1.20.5–1.21.4 : HandItems:[…]/ArmorItems:[…] + Hand/ArmorDropChances:[…], items use components:{…}
//   < 1.20.5  : same arrays, but legacy items {Count:1b,id:"…",tag:{display,Enchantments}}

export interface EquipItem {
  id: string
  count: string
  customName: string
  lore: string          // newline-separated lore lines
  enchantments: string  // "power:2, flame:1"
  dropChance: string    // optional float, e.g. "0.1"
}

export interface Effect { id: string; amplifier: string; duration: string }
export interface Attr { id: string; base: string }

export interface SummonEntity {
  id: string
  baby: boolean
  customName: string
  customNameVisible: boolean
  noAI: boolean
  silent: boolean
  invulnerable: boolean
  noGravity: boolean
  glowing: boolean
  persistent: boolean
  canPickUpLoot: boolean
  canBreakDoors: boolean
  health: string
  fire: string
  tags: string
  head: EquipItem
  chest: EquipItem
  legs: EquipItem
  feet: EquipItem
  mainHand: EquipItem
  offHand: EquipItem
  effects: Effect[]
  attributes: Attr[]
  passengers: SummonEntity[]
}

export type EntityMode = 'summon' | 'give'

export function newEquip(id = ''): EquipItem {
  return { id, count: '1', customName: '', lore: '', enchantments: '', dropChance: '' }
}
export function newEffect(): Effect { return { id: 'glowing', amplifier: '0', duration: '999999' } }
export function newAttr(): Attr { return { id: 'max_health', base: '40' } }

export function newEntity(id = 'zombie'): SummonEntity {
  return {
    id, baby: false, customName: '', customNameVisible: false,
    noAI: false, silent: false, invulnerable: false, noGravity: false,
    glowing: false, persistent: false, canPickUpLoot: false, canBreakDoors: false,
    health: '', fire: '', tags: '',
    head: newEquip(), chest: newEquip(), legs: newEquip(), feet: newEquip(),
    mainHand: newEquip(), offHand: newEquip(),
    effects: [], attributes: [], passengers: [],
  }
}

export function stripNs(id: string) { return id.trim().replace(/^minecraft:/, '') }
export function withNs(id: string) {
  const v = id.trim()
  if (!v) return 'minecraft:zombie'
  return v.includes(':') ? v : `minecraft:${v}`
}

const IS_BABY = new Set(['zombie', 'husk', 'drowned', 'zombie_villager', 'piglin', 'zombified_piglin', 'zoglin', 'hoglin'])

export const FLAGS: { key: keyof SummonEntity; label: string }[] = [
  { key: 'noAI', label: 'No AI' },
  { key: 'silent', label: 'Silent' },
  { key: 'invulnerable', label: 'Invulnerable' },
  { key: 'noGravity', label: 'No gravity' },
  { key: 'glowing', label: 'Glowing' },
  { key: 'customNameVisible', label: 'Name always visible' },
  { key: 'persistent', label: "Don't despawn" },
  { key: 'canPickUpLoot', label: 'Pick up loot' },
  { key: 'canBreakDoors', label: 'Break doors' },
]

// ── version era ──────────────────────────────────────────────────────────────────
export type Era = 'equipment' | 'components' | 'legacy'

function rank(v: string): number {
  const [a, b = 0, c = 0] = v.split('.').map(n => parseInt(n, 10) || 0)
  return a * 10000 + b * 100 + c
}
export function eraFor(version: string): Era {
  const n = rank(version)
  if (n >= 260000 || n >= rank('1.21.5')) return 'equipment'   // 1.21.5+ and 26.x
  if (n >= rank('1.20.5')) return 'components'                 // 1.20.5 – 1.21.4
  return 'legacy'                                              // ≤ 1.20.4
}
// Attributes switched from Attributes/Name/Base ("generic.max_health") to
// attributes/id/base ("minecraft:max_health") in 1.21.
export function attrNewFormat(version: string): boolean {
  const n = rank(version)
  return n >= 260000 || n >= rank('1.21')
}

// ── helpers ──────────────────────────────────────────────────────────────────────
const num = (s: string, d: number) => { const n = Number(s); return isNaN(n) ? d : n }
const lines = (s: string) => s.split('\n').map(l => l.trim()).filter(Boolean)
const ench = (s: string) => s.split(',').map(p => p.trim()).filter(Boolean).map(p => {
  const [k, v] = p.split(':'); return [stripNs(k || ''), num(v, 1)] as const
}).filter(([k]) => k)
const floatStr = (s: string) => { const n = num(s, 0); return `${Number.isInteger(n) ? n.toFixed(1) : n}f` }
// short id token like the vanilla output (id:bow), quoted only if it has odd chars
const idTok = (id: string) => { const s = stripNs(id); return /^[a-z0-9_]+$/.test(s) ? s : JSON.stringify(withNs(id)) }

function itemSnbt(it: EquipItem, era: Era): string {
  if (era === 'legacy') {
    const disp: string[] = []
    if (it.customName.trim()) disp.push(`Name:'${JSON.stringify({ text: it.customName })}'`)
    const lo = lines(it.lore)
    if (lo.length) disp.push(`Lore:[${lo.map(l => `'${JSON.stringify({ text: l })}'`).join(',')}]`)
    const tag: string[] = []
    if (disp.length) tag.push(`display:{${disp.join(',')}}`)
    const en = ench(it.enchantments)
    if (en.length) tag.push(`Enchantments:[${en.map(([k, v]) => `{id:"${withNs(k)}",lvl:${v}s}`).join(',')}]`)
    const t = tag.length ? `,tag:{${tag.join(',')}}` : ''
    return `{Count:${num(it.count, 1)}b,id:"${withNs(it.id)}"${t}}`
  }
  // component-based item (1.20.5+)
  const comps: string[] = []
  if (it.customName.trim()) comps.push(`custom_name:${JSON.stringify(it.customName)}`)
  const lo = lines(it.lore)
  if (lo.length) comps.push(`lore:[${lo.map(l => JSON.stringify(l)).join(',')}]`)
  const en = ench(it.enchantments)
  if (en.length) comps.push(`enchantments:{${en.map(([k, v]) => `${k}:${v}`).join(',')}}`)
  const c = comps.length ? `,components:{${comps.join(',')}}` : ''
  return `{count:${num(it.count, 1)},id:${idTok(it.id)}${c}}`
}

function equipmentNbt(e: SummonEntity, era: Era): string[] {
  const out: string[] = []
  if (era === 'equipment') {
    const slots: [string, EquipItem][] = [
      ['mainhand', e.mainHand], ['offhand', e.offHand],
      ['head', e.head], ['chest', e.chest], ['legs', e.legs], ['feet', e.feet],
    ]
    const filled = slots.filter(([, it]) => it.id.trim())
    if (filled.length) out.push(`equipment:{${filled.map(([s, it]) => `${s}:${itemSnbt(it, era)}`).join(',')}}`)
    const dc = slots.filter(([, it]) => it.dropChance.trim())
    if (dc.length) out.push(`drop_chances:{${dc.map(([s, it]) => `${s}:${floatStr(it.dropChance)}`).join(',')}}`)
    return out
  }
  // arrays (components or legacy items)
  const slot = (it: EquipItem) => it.id.trim() ? itemSnbt(it, era) : '{}'
  const hands = [e.mainHand, e.offHand]
  const armor = [e.feet, e.legs, e.chest, e.head] // vanilla order
  if (hands.some(i => i.id.trim())) out.push(`HandItems:[${hands.map(slot).join(',')}]`)
  if (armor.some(i => i.id.trim())) out.push(`ArmorItems:[${armor.map(slot).join(',')}]`)
  if (hands.some(i => i.dropChance.trim())) out.push(`HandDropChances:[${hands.map(i => floatStr(i.dropChance || '0')).join(',')}]`)
  if (armor.some(i => i.dropChance.trim())) out.push(`ArmorDropChances:[${armor.map(i => floatStr(i.dropChance || '0')).join(',')}]`)
  return out
}

function attributesNbt(e: SummonEntity, attrNew: boolean): string | null {
  const attrs = e.attributes.filter(a => a.id.trim() && a.base.trim() && !isNaN(Number(a.base)))
  if (!attrs.length) return null
  if (attrNew) {
    return `attributes:[${attrs.map(a => `{id:"${a.id.includes(':') ? a.id.trim() : 'minecraft:' + stripNs(a.id)}",base:${Number(a.base)}}`).join(',')}]`
  }
  // legacy: generic.<name> (best-effort prefix for the common attributes)
  const oldName = (id: string) => { const s = stripNs(id); return s.includes('.') ? s : `generic.${s}` }
  return `Attributes:[${attrs.map(a => `{Name:"${oldName(a.id)}",Base:${Number(a.base)}}`).join(',')}]`
}

export function buildNbt(e: SummonEntity, includeId: boolean, era: Era, attrNew: boolean): string {
  const p: string[] = []
  if (includeId) p.push(`id:"${withNs(e.id)}"`)
  if (e.baby) p.push(IS_BABY.has(stripNs(e.id)) ? 'IsBaby:1b' : 'Age:-24000')
  if (e.customName.trim()) {
    p.push(era === 'legacy' ? `CustomName:'${JSON.stringify(e.customName)}'` : `CustomName:${JSON.stringify(e.customName)}`)
  }
  if (e.customNameVisible) p.push('CustomNameVisible:1b')
  if (e.noAI) p.push('NoAI:1b')
  if (e.silent) p.push('Silent:1b')
  if (e.invulnerable) p.push('Invulnerable:1b')
  if (e.noGravity) p.push('NoGravity:1b')
  if (e.glowing) p.push('Glowing:1b')
  if (e.persistent) p.push('PersistenceRequired:1b')
  if (e.canPickUpLoot) p.push('CanPickUpLoot:1b')
  if (e.canBreakDoors) p.push('CanBreakDoors:1b')
  if (e.health.trim() && !isNaN(Number(e.health))) p.push(`Health:${Number(e.health)}f`)
  if (e.fire.trim() && !isNaN(Number(e.fire))) p.push(`Fire:${Math.round(Number(e.fire) * 20)}s`)
  const tags = e.tags.split(',').map(s => s.trim()).filter(Boolean)
  if (tags.length) p.push(`Tags:[${tags.map(t => JSON.stringify(t)).join(',')}]`)
  p.push(...equipmentNbt(e, era))
  const fx = e.effects.filter(x => x.id.trim())
  if (fx.length) {
    p.push(`active_effects:[${fx.map(x => `{id:${idTok(x.id)},amplifier:${num(x.amplifier, 0)},duration:${num(x.duration, 999999)}}`).join(',')}]`)
  }
  const attrs = attributesNbt(e, attrNew)
  if (attrs) p.push(attrs)
  if (e.passengers.length) p.push(`Passengers:[${e.passengers.map(c => buildNbt(c, true, era, attrNew)).join(',')}]`)
  return `{${p.join(',')}}`
}

export function buildCommand(root: SummonEntity, mode: EntityMode, pos: string, target: string, version: string): string {
  const era = eraFor(version)
  const attrNew = attrNewFormat(version)
  const id = withNs(root.id)
  if (mode === 'give') {
    const nbt = buildNbt(root, true, era, attrNew)
    return `/give ${target || '@p'} minecraft:${stripNs(id)}_spawn_egg[entity_data=${nbt}]`
  }
  const nbt = buildNbt(root, false, era, attrNew)
  return `/summon ${id} ${pos || '~ ~ ~'}${nbt === '{}' ? '' : ' ' + nbt}`
}

// ── option lists ─────────────────────────────────────────────────────────────────
const ARMOR_MATS = ['leather', 'chainmail', 'iron', 'golden', 'diamond', 'netherite']
export const ITEMS = [
  ...ARMOR_MATS.flatMap(m => [`${m}_helmet`, `${m}_chestplate`, `${m}_leggings`, `${m}_boots`]),
  'turtle_helmet',
  'wooden_sword', 'stone_sword', 'iron_sword', 'golden_sword', 'diamond_sword', 'netherite_sword',
  'wooden_axe', 'iron_axe', 'diamond_axe', 'netherite_axe', 'mace', 'bow', 'crossbow', 'trident', 'shield',
  'totem_of_undying', 'fishing_rod', 'stick', 'torch', 'shears', 'carved_pumpkin',
  'player_head', 'skeleton_skull', 'elytra', 'firework_rocket', 'apple', 'golden_apple', 'bread',
]

export const ATTRIBUTES = [
  'max_health', 'movement_speed', 'attack_damage', 'attack_speed', 'attack_knockback', 'armor',
  'armor_toughness', 'knockback_resistance', 'follow_range', 'luck', 'max_absorption', 'scale',
  'step_height', 'gravity', 'jump_strength', 'flying_speed', 'safe_fall_distance', 'fall_damage_multiplier',
  'block_interaction_range', 'entity_interaction_range', 'burning_time', 'explosion_knockback_resistance',
  'water_movement_efficiency', 'oxygen_bonus', 'mining_efficiency', 'sneaking_speed', 'sweeping_damage_ratio',
]

export const EFFECTS = [
  'speed', 'slowness', 'haste', 'mining_fatigue', 'strength', 'instant_health', 'instant_damage',
  'jump_boost', 'nausea', 'regeneration', 'resistance', 'fire_resistance', 'water_breathing',
  'invisibility', 'blindness', 'night_vision', 'hunger', 'weakness', 'poison', 'wither',
  'health_boost', 'absorption', 'saturation', 'glowing', 'levitation', 'luck', 'unluck',
  'slow_falling', 'conduit_power', 'dolphins_grace', 'bad_omen', 'hero_of_the_village', 'darkness',
  'wind_charged', 'weaving', 'oozing', 'infested',
]

export const MOBS = [
  'allay', 'armadillo', 'armor_stand', 'axolotl', 'bat', 'bee', 'blaze', 'bogged', 'breeze', 'camel',
  'cat', 'cave_spider', 'chicken', 'cod', 'cow', 'creeper', 'dolphin', 'donkey', 'drowned', 'elder_guardian',
  'enderman', 'endermite', 'ender_dragon', 'evoker', 'fox', 'frog', 'ghast', 'glow_squid', 'goat', 'guardian',
  'hoglin', 'horse', 'husk', 'iron_golem', 'llama', 'magma_cube', 'mooshroom', 'mule', 'ocelot', 'panda',
  'parrot', 'phantom', 'pig', 'piglin', 'piglin_brute', 'pillager', 'polar_bear', 'pufferfish', 'rabbit',
  'ravager', 'salmon', 'sheep', 'shulker', 'silverfish', 'skeleton', 'slime', 'sniffer', 'snow_golem',
  'spider', 'squid', 'stray', 'strider', 'tadpole', 'trader_llama', 'tropical_fish', 'turtle', 'vex',
  'villager', 'vindicator', 'wandering_trader', 'warden', 'witch', 'wither', 'wither_skeleton', 'wolf',
  'zoglin', 'zombie', 'zombie_villager', 'zombified_piglin',
]
