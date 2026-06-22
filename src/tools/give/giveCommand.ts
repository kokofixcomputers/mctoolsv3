import type { GiveFormat } from './versions'
import { OLD_ATTR_NAMES } from './versions'

// ── shared types ──────────────────────────────────────────────────────────────

export type TextStyle = {
  bold?: boolean
  italic?: boolean
  underlined?: boolean
  strikethrough?: boolean
  obfuscated?: boolean
}

export type GiveEnchantment = { id: string; level: number }

export type GiveAttributeModifier = {
  attribute: string
  amount: number
  operation: 'add_value' | 'add_multiplied_base' | 'add_multiplied_total'
  slot: 'mainhand' | 'offhand' | 'head' | 'chest' | 'legs' | 'feet'
}

export type PotionEffect = { id: string; amplifier: number; duration: number }

export type FoodEffect = { id: string; amplifier: number; duration: number; probability: number }

export type PotionOptions = {
  target?: string
  count?: number
  effects: PotionEffect[]
  customColor?: number
}

export type FireworkExplosion = {
  shape: 'small_ball' | 'large_ball' | 'star' | 'creeper' | 'burst'
  colors: string[]
  fadeColors: string[]
  trail: boolean
  twinkle: boolean
}

export type FireworkOptions = {
  target?: string
  count?: number
  flightDuration: number
  explosions: FireworkExplosion[]
}

export type ContainerItem = { slot: number; itemId: string; count: number }

export type ContainerOptions = {
  target?: string
  count?: number
  containerType: string
  items: ContainerItem[]
}

export type SummonOptions = {
  mobType: string
  customName?: string
  nameColor?: string
  nameStyle?: TextStyle
  isBaby?: boolean
  noAI?: boolean
  invulnerable?: boolean
  silent?: boolean
  persistent?: boolean
  equipment?: Record<string, { id: string; count: number }>
  effects?: Array<{ id: string; amplifier: number; duration: number }>
}

export type TellrawTextComponent = {
  text: string
  color?: string
  bold?: boolean
  italic?: boolean
  underlined?: boolean
  strikethrough?: boolean
  obfuscated?: boolean
  clickEvent?: { action: 'open_url' | 'run_command' | 'suggest_command' | 'copy_to_clipboard'; value: string }
  hoverEvent?: { action: 'show_text'; value: string }
}

export type TellrawOptions = { target?: string; components: TellrawTextComponent[] }

export type EquippableSlot = 'head' | 'chest' | 'legs' | 'feet' | 'mainhand' | 'offhand'
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic'

export type GiveOptions = {
  format?: GiveFormat
  target?: string
  itemId: string
  count?: number

  // Pre-built component strings (from RichTextEditor) — inserted at the front
  _extraComponents?: string[]

  // Display (plain text fallback when _extraComponents not provided)
  customName?: string
  itemName?: string
  loreLines?: string[]
  color?: string
  style?: TextStyle
  rarity?: ItemRarity

  // Mechanics
  enchantments?: GiveEnchantment[]
  attributes?: GiveAttributeModifier[]

  // Food / consumable
  nutrition?: number
  saturation?: number
  canAlwaysEat?: boolean
  consumeSeconds?: number   // modern-new: consumable={consume_seconds:X}; modern-old: food.eat_seconds
  foodEffects?: FoodEffect[]  // effects applied when eaten

  // Equippable (modern-new only)
  equippableSlot?: EquippableSlot
  damageOnHurt?: boolean    // default true; set false to disable damage when worn

  // Boolean toggles
  glider?: boolean          // modern-new only
  deathProtection?: boolean // modern-new only

  maxStackSize?: number
}

// ── low-level helpers ─────────────────────────────────────────────────────────

function normalizeId(raw: string) {
  const v = raw.trim()
  if (!v) return ''
  return v.includes(':') ? v : `minecraft:${v}`
}

function snbtStr(s: string) {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function randId() {
  // Random 13-digit number (similar to what the game generates)
  return String(Math.floor(1_000_000_000_000 + Math.random() * 9_000_000_000_000))
}

// ── text component helpers ────────────────────────────────────────────────────

function textObj(text: string, style?: TextStyle, color?: string): Record<string, unknown> {
  const obj: Record<string, unknown> = { text, italic: false }
  if (color) obj.color = color
  if (style?.bold) obj.bold = true
  if (style?.underlined) obj.underlined = true
  if (style?.strikethrough) obj.strikethrough = true
  if (style?.obfuscated) obj.obfuscated = true
  return obj
}

// Serialize a single text component as a JSON array string: [{"text":"...","italic":false}]
function jsonArray(text: string, style?: TextStyle, color?: string) {
  return JSON.stringify([textObj(text, style, color)])
}

// modern-new: bare JSON array as the component value
// custom_name=[{"text":"...","italic":false}]
function compNew(text: string, style?: TextStyle, color?: string) {
  return jsonArray(text, style, color)
}

// modern-old: single-quoted JSON string
// custom_name='[{"text":"...","italic":false}]'
function compOld(text: string, style?: TextStyle, color?: string) {
  return `'${jsonArray(text, style, color)}'`
}

// Lore: modern-new → [[{...}],[{...}]]  |  modern-old → ['[{...}]','[{...}]']
function buildLoreNew(lines: string[], style?: TextStyle, color?: string) {
  const entries = lines.map((l) => JSON.stringify([textObj(l, style, color)]))
  return `[${entries.join(',')}]`
}

function buildLoreOld(lines: string[], style?: TextStyle, color?: string) {
  const entries = lines.map((l) => `'${JSON.stringify([textObj(l, style, color)])}'`)
  return `[${entries.join(',')}]`
}

// ── attribute modifiers ───────────────────────────────────────────────────────

function buildAttrsNew(attrs: GiveAttributeModifier[]) {
  const items = attrs.map((a) => {
    const id = randId()
    // type is unquoted short name: armor, attack_damage, etc.
    return `{type:${a.attribute},amount:${a.amount},operation:${a.operation},id:"${id}"}`
  })
  return `[${items.join(',')}]`
}

function buildAttrsOld(attrs: GiveAttributeModifier[]) {
  const items = attrs.map((a) => {
    const type = OLD_ATTR_NAMES[a.attribute] ?? `generic.${a.attribute}`
    const id = randId()
    // type is quoted, id is unquoted number
    return `{type:"${type}",amount:${a.amount},operation:${a.operation},id:${id}}`
  })
  return `{modifiers:[${items.join(',')}]}`
}

// ── enchantments ──────────────────────────────────────────────────────────────

function buildEnchants(enchants: GiveEnchantment[]) {
  const pairs = enchants
    .filter((e) => e.id.trim() && Number(e.level) > 0)
    .map((e) => `${snbtStr(normalizeId(e.id))}:${Math.floor(Number(e.level))}`)
  if (!pairs.length) return null
  return `{${pairs.join(',')}}`
}

// ── main builders ─────────────────────────────────────────────────────────────

export function buildGiveCommand(opts: GiveOptions): string {
  const fmt = opts.format ?? 'modern-new'
  const target = (opts.target ?? '@p').trim() || '@p'

  const rawId = (opts.itemId ?? '').trim()
  if (!rawId) throw new Error('Item ID is required.')
  if (/\s/.test(rawId)) throw new Error('Item ID cannot contain spaces.')
  const itemId = normalizeId(rawId)

  const c: string[] = [...(opts._extraComponents ?? [])]

  // custom_name / lore / item_name plain text (only when no _extraComponents provided)
  if (!opts._extraComponents?.length && opts.customName?.trim()) {
    const v = fmt === 'modern-new' ? compNew(opts.customName, opts.style, opts.color)
            : fmt === 'modern-old' ? compOld(opts.customName, opts.style, opts.color)
            : null
    if (v) c.push(`custom_name=${v}`)
  }

  const loreLines = (opts.loreLines ?? []).map((l) => l.trim()).filter(Boolean)
  if (!opts._extraComponents?.length && loreLines.length) {
    const v = fmt === 'modern-new' ? buildLoreNew(loreLines, opts.style, opts.color)
            : fmt === 'modern-old' ? buildLoreOld(loreLines, opts.style, opts.color)
            : null
    if (v) c.push(`lore=${v}`)
  }

  if (!opts._extraComponents?.length && opts.itemName?.trim()) {
    const v = fmt === 'modern-new' ? compNew(opts.itemName, opts.style, opts.color)
            : fmt === 'modern-old' ? compOld(opts.itemName, opts.style, opts.color)
            : null
    if (v) c.push(`item_name=${v}`)
  }

  // rarity
  if (opts.rarity) c.push(`rarity=${opts.rarity}`)

  // enchantments
  if (opts.enchantments?.length) {
    const e = buildEnchants(opts.enchantments)
    if (e) c.push(`minecraft:enchantments=${e}`)
  }

  // attribute_modifiers
  const validAttrs = (opts.attributes ?? []).filter((a) => a.attribute.trim())
  if (validAttrs.length) {
    c.push(`attribute_modifiers=${
      fmt === 'modern-new' ? buildAttrsNew(validAttrs) :
      fmt === 'modern-old' ? buildAttrsOld(validAttrs) : ''
    }`)
  }

  const validFoodEffects = (opts.foodEffects ?? []).filter((e) => e.id.trim())

  // food component
  const hasFood = opts.nutrition !== undefined || opts.saturation !== undefined || opts.canAlwaysEat
  if (hasFood) {
    const fp: string[] = []
    if (opts.nutrition !== undefined) fp.push(`nutrition:${opts.nutrition}`)
    if (opts.saturation !== undefined) fp.push(`saturation:${opts.saturation}`)
    if (opts.canAlwaysEat) fp.push('can_always_eat:1b')
    // 1.21.1: eat_seconds + effects live inside food
    if (fmt === 'modern-old' && opts.consumeSeconds !== undefined) {
      fp.push(`eat_seconds:${opts.consumeSeconds}`)
    }
    if (fmt === 'modern-old' && validFoodEffects.length) {
      const eff = validFoodEffects.map((e) =>
        `{effect:{id:${snbtStr(normalizeId(e.id))},amplifier:${e.amplifier},duration:${e.duration}},probability:${e.probability}}`
      )
      fp.push(`effects:[${eff.join(',')}]`)
    }
    c.push(`food={${fp.join(',')}}`)
  }

  // consumable (modern-new only — 1.21.2+): holds eat time AND on-eat effects
  if (fmt === 'modern-new') {
    const cp: string[] = []
    if (opts.consumeSeconds !== undefined) cp.push(`consume_seconds:${opts.consumeSeconds}`)
    if (validFoodEffects.length) {
      const eff = validFoodEffects.map((e) =>
        `{type:"minecraft:apply_effects",effects:[{id:${snbtStr(normalizeId(e.id))},amplifier:${e.amplifier},duration:${e.duration}}],probability:${e.probability}}`
      )
      cp.push(`on_consume_effects:[${eff.join(',')}]`)
    }
    if (cp.length) c.push(`consumable={${cp.join(',')}}`)
  }

  // equippable (modern-new only)
  if (fmt === 'modern-new' && opts.equippableSlot) {
    const ep: string[] = [`slot:${opts.equippableSlot}`]
    if (opts.damageOnHurt === false) ep.push('damage_on_hurt:0b')
    c.push(`equippable={${ep.join(',')}}`)
  }

  // glider (modern-new only)
  if (fmt === 'modern-new' && opts.glider) c.push('glider={}')

  // death_protection (modern-new only)
  if (fmt === 'modern-new' && opts.deathProtection) c.push('death_protection={}')

  // max_stack_size
  if (opts.maxStackSize !== undefined) c.push(`max_stack_size=${opts.maxStackSize}`)

  const count = typeof opts.count === 'number' && opts.count > 0 ? Math.floor(opts.count) : undefined
  const compPart = c.length ? `[${c.join(',')}]` : ''
  const countPart = count && count !== 1 ? ` ${count}` : ''

  return `/give ${target} ${itemId}${compPart}${countPart}`
}

// ── potion ────────────────────────────────────────────────────────────────────

export function buildPotionCommand(opts: PotionOptions): string {
  const target = (opts.target ?? '@p').trim() || '@p'
  const count = typeof opts.count === 'number' && opts.count > 0 ? Math.floor(opts.count) : 1

  const effectsArr = opts.effects.map((e) => {
    const id = normalizeId(e.id.trim())
    return `{id:${snbtStr(id)},amplifier:${e.amplifier},duration:${e.duration}}`
  })

  const parts: string[] = []
  if (effectsArr.length) parts.push(`custom_effects:[${effectsArr.join(',')}]`)
  if (opts.customColor !== undefined) parts.push(`custom_color:${opts.customColor}`)

  const compPart = parts.length ? `[potion_contents={${parts.join(',')}}]` : ''
  return `/give ${target} potion${compPart} ${count}`
}

// ── firework ──────────────────────────────────────────────────────────────────

export function buildFireworkCommand(opts: FireworkOptions): string {
  const target = (opts.target ?? '@p').trim() || '@p'
  const count = typeof opts.count === 'number' && opts.count > 0 ? Math.floor(opts.count) : 1

  const explosionsArr = opts.explosions.map((e) => {
    const colors = e.colors.map((c) => parseInt(c.slice(1), 16)).join(',')
    const fadeColors = e.fadeColors.map((c) => parseInt(c.slice(1), 16)).join(',')
    let exp = `{shape:${snbtStr(e.shape)},colors:[${colors}],fade_colors:[${fadeColors}]`
    if (e.trail) exp += ',has_trail:1b'
    if (e.twinkle) exp += ',has_twinkle:1b'
    return exp + '}'
  })

  const compPart = `[fireworks={flight_duration:${opts.flightDuration},explosions:[${explosionsArr.join(',')}]}]`
  return `/give ${target} minecraft:firework_rocket${compPart} ${count}`
}

// ── container ─────────────────────────────────────────────────────────────────

export function buildContainerCommand(opts: ContainerOptions): string {
  const target = (opts.target ?? '@p').trim() || '@p'
  const count = typeof opts.count === 'number' && opts.count > 0 ? Math.floor(opts.count) : 1

  const itemsArr = opts.items.map((item) => {
    const id = normalizeId(item.itemId.trim())
    return `{slot:${item.slot},item:{id:${snbtStr(id)},count:${item.count}}}`
  })

  const compPart = `[minecraft:container=[${itemsArr.join(',')}]]`
  return `/give ${target} minecraft:${opts.containerType}${compPart} ${count}`
}

// ── summon ────────────────────────────────────────────────────────────────────

export function buildSummonCommand(opts: SummonOptions): string {
  const parts: string[] = []
  if (opts.customName) {
    const nameObj = { text: opts.customName, color: opts.nameColor || '#ffffff', ...opts.nameStyle }
    parts.push(`CustomName:${JSON.stringify(nameObj)}`)
  }
  if (opts.isBaby) parts.push('IsBaby:1b')
  if (opts.noAI) parts.push('NoAI:1b')
  if (opts.invulnerable) parts.push('Invulnerable:1b')
  if (opts.silent) parts.push('Silent:1b')
  if (opts.persistent) parts.push('PersistenceRequired:1b')
  if (opts.equipment && Object.keys(opts.equipment).length) {
    const eq = Object.entries(opts.equipment)
      .filter(([, item]) => item.id)
      .map(([slot, item]) => `${slot}:{id:${snbtStr(normalizeId(item.id))},count:${item.count}}`)
    if (eq.length) parts.push(`equipment:{${eq.join(',')}}`)
  }
  if (opts.effects?.length) {
    const eff = opts.effects.map((e) =>
      `{id:${snbtStr(normalizeId(e.id))},amplifier:${e.amplifier},duration:${e.duration}}`
    )
    parts.push(`active_effects:[${eff.join(',')}]`)
  }
  return `/summon minecraft:${opts.mobType} ~ ~ ~${parts.length ? ` {${parts.join(',')}}` : ''}`
}

// ── tellraw ───────────────────────────────────────────────────────────────────

export function buildTellrawCommand(opts: TellrawOptions): string {
  const target = (opts.target ?? '@a').trim() || '@a'
  if (!opts.components.length) throw new Error('At least one text component is required.')

  const json = opts.components.map((comp) => {
    const obj: Record<string, unknown> = { text: comp.text }
    if (comp.color) obj.color = comp.color
    if (comp.bold) obj.bold = true
    if (comp.italic) obj.italic = true
    if (comp.underlined) obj.underlined = true
    if (comp.strikethrough) obj.strikethrough = true
    if (comp.obfuscated) obj.obfuscated = true
    if (comp.clickEvent?.action && comp.clickEvent?.value?.trim()) {
      const v = comp.clickEvent.value.trim()
      obj.click_event = {
        action: comp.clickEvent.action,
        ...(comp.clickEvent.action === 'run_command' || comp.clickEvent.action === 'suggest_command'
          ? { command: v }
          : comp.clickEvent.action === 'open_url'
          ? { url: v }
          : { value: v }),
      }
    }
    if (comp.hoverEvent?.action && comp.hoverEvent?.value?.trim()) {
      obj.hover_event = { action: comp.hoverEvent.action, contents: { text: comp.hoverEvent.value.trim() } }
    }
    return obj
  })

  return `/tellraw ${target} ${JSON.stringify(json)}`
}
