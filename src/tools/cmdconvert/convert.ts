import { parseSnbt, serializeSnbt, type SnbtTag } from './snbt'

type JsVal = string | number | boolean | null | JsVal[] | { [k: string]: JsVal }

// ── value helpers ─────────────────────────────────────────────────────────────

function numVal(t?: SnbtTag): number | null {
  if (!t) return null
  return (t.type === 'byte' || t.type === 'short' || t.type === 'int' || t.type === 'long' || t.type === 'float' || t.type === 'double') ? t.value : null
}
function strVal(t?: SnbtTag): string | null {
  return t?.type === 'string' ? t.value : null
}
// Any tag that can represent a string — includes unquoted SNBT identifiers parsed as strings
function anyStr(t?: SnbtTag): string | null {
  if (!t) return null
  if (t.type === 'string') return t.value
  return null
}
function cmpVal(t?: SnbtTag): Record<string, SnbtTag> | null {
  return t?.type === 'compound' ? t.value : null
}
function lstVal(t?: SnbtTag): SnbtTag[] | null {
  return t?.type === 'list' ? t.value : null
}
// booleans: 1b/0b byte, or unquoted "true"/"false" string
function boolVal(t?: SnbtTag): boolean | null {
  if (!t) return null
  const n = numVal(t); if (n !== null) return n !== 0
  const s = strVal(t)
  if (s === 'true') return true
  if (s === 'false') return false
  return null
}
// Any numeric-or-string value (for CustomModelData etc.)
function anyVal(t?: SnbtTag): string | number | null {
  if (!t) return null
  const n = numVal(t); if (n !== null) return n
  const s = strVal(t); if (s !== null) return s
  return null
}

// ── serialization helpers ─────────────────────────────────────────────────────

// Serialize to SNBT-like component value (without outer quoting special cases)
function ser(v: JsVal): string {
  if (v === null) return 'null'
  if (typeof v === 'boolean') return String(v)
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  if (Array.isArray(v)) return `[${v.map(ser).join(',')}]`
  const pairs = Object.entries(v).map(([k, val]) => `${/^[a-zA-Z_:][a-zA-Z0-9_:.]*$/.test(k) ? k : `"${k}"`}:${ser(val)}`)
  return `{${pairs.join(',')}}`
}

// Wrap a text-component JSON string in single quotes for component syntax
function sqStr(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

// Normalize identifier to include minecraft: namespace if missing
function ns(id: string): string {
  return id.includes(':') ? id : `minecraft:${id}`
}

// ── attribute & operation maps ────────────────────────────────────────────────

const ATTR: Record<string, string> = {
  'generic.max_health': 'minecraft:max_health',
  'generic.max_absorption': 'minecraft:max_absorption',
  'generic.armor': 'minecraft:armor',
  'generic.armor_toughness': 'minecraft:armor_toughness',
  'generic.attack_damage': 'minecraft:attack_damage',
  'generic.attack_knockback': 'minecraft:attack_knockback',
  'generic.attack_speed': 'minecraft:attack_speed',
  'generic.block_break_speed': 'minecraft:block_break_speed',
  'generic.block_interaction_range': 'minecraft:block_interaction_range',
  'generic.entity_interaction_range': 'minecraft:entity_interaction_range',
  'generic.fall_damage_multiplier': 'minecraft:fall_damage_multiplier',
  'generic.flying_speed': 'minecraft:flying_speed',
  'generic.follow_range': 'minecraft:follow_range',
  'generic.gravity': 'minecraft:gravity',
  'generic.jump_strength': 'minecraft:jump_strength',
  'generic.knockback_resistance': 'minecraft:knockback_resistance',
  'generic.luck': 'minecraft:luck',
  'generic.movement_efficiency': 'minecraft:movement_efficiency',
  'generic.movement_speed': 'minecraft:movement_speed',
  'generic.oxygen_bonus': 'minecraft:oxygen_bonus',
  'generic.safe_fall_distance': 'minecraft:safe_fall_distance',
  'generic.scale': 'minecraft:scale',
  'generic.step_height': 'minecraft:step_height',
  'generic.submerged_mining_speed': 'minecraft:submerged_mining_speed',
  'generic.sweeping_damage_ratio': 'minecraft:sweeping_damage_ratio',
  'horse.jump_strength': 'minecraft:jump_strength',
  'zombie.spawn_reinforcements': 'minecraft:spawn_reinforcements',
  'player.block_break_speed': 'minecraft:block_break_speed',
  'player.block_interaction_range': 'minecraft:block_interaction_range',
  'player.entity_interaction_range': 'minecraft:entity_interaction_range',
}

const OP: Record<number, string> = { 0: 'add_value', 1: 'add_multiplied_base', 2: 'add_multiplied_total' }

function attrId(newName: string): string {
  const parts = newName.split(':')
  return parts.length === 2 ? `${parts[0]}:base_${parts[1]}` : `minecraft:base_${newName.replace(/\./g, '_')}`
}

const SLOT: Record<string, string> = {
  mainhand: 'mainhand', offhand: 'offhand',
  head: 'head', chest: 'chest', legs: 'legs', feet: 'feet',
  any: 'any', hand: 'mainhand', armor: 'any', body: 'body',
}

// ── HideFlags bitmask ─────────────────────────────────────────────────────────
// Bits: 1=enchantments 2=attribute_modifiers 4=unbreakable 8=can_destroy
//       16=can_place_on 32=additional(potion/etc) 64=dye 128=armor_trim

function hideComponents(flags: number): string[] {
  const out: string[] = []
  // hide_tooltip hides all; the individual hide_ flags mostly map to omitting the component,
  // but hide_additional_tooltip is the closest surviving one.
  if (flags & 32) out.push('hide_additional_tooltip={}')
  if (flags === 0b11111111 || (flags & ~32) === (0b11111111 & ~32)) out.push('hide_tooltip={}')
  return out
}

// ── main API ──────────────────────────────────────────────────────────────────

export interface ConvertResult {
  output: string
  converted: string[]
  skipped: string[]
}

function normalizeItem(item: string): string {
  return item.includes(':') ? item : `minecraft:${item}`
}

export function convertCommand(input: string): ConvertResult {
  const trimmed = input.trim()
  // Accept with or without leading slash, give command
  const m = trimmed.match(/^(?:\/)?give\s+(\S+)\s+([a-zA-Z0-9_:]+)\s*(\{[\s\S]*\})?\s*(\d+)?$/)
  if (m) return convertGive(m[1], m[2], m[3], m[4])
  throw new Error('Unrecognised command. Paste a /give command with NBT (pre-1.20.5 format).')
}

function convertGive(selector: string, rawItem: string, nbtStr: string | undefined, _trailingCount: string | undefined): ConvertResult {
  const item = normalizeItem(rawItem)
  const converted: string[] = []
  const skipped: string[] = []

  if (!nbtStr) {
    return { output: `/give ${selector} ${item}`, converted, skipped }
  }

  let nbt: SnbtTag
  try { nbt = parseSnbt(nbtStr) }
  catch (e) { throw new Error(`Failed to parse NBT: ${e instanceof Error ? e.message : e}`) }
  if (nbt.type !== 'compound') throw new Error('NBT must be a compound tag {}')

  const c = nbt.value
  const comp: string[] = []

  // ── display.Name / Lore / color ───────────────────────────────────────────
  const display = cmpVal(c['display'])
  if (display) {
    const name = anyStr(display['Name'])
    if (name !== null) { comp.push(`custom_name=${sqStr(name)}`); converted.push('display.Name → custom_name') }

    const lore = lstVal(display['Lore'])
    if (lore) {
      const entries = lore.map(t => sqStr(anyStr(t) ?? '')).join(',')
      comp.push(`lore=[${entries}]`)
      converted.push('display.Lore → lore')
    }

    const color = numVal(display['color'])
    if (color !== null) { comp.push(`dyed_color=${color}`); converted.push('display.color → dyed_color') }

    const knownDisplay = new Set(['Name', 'Lore', 'color', 'MapColor'])
    for (const k of Object.keys(display)) if (!knownDisplay.has(k)) skipped.push(`display.${k}`)
  }

  // ── enchantments & stored_enchantments ────────────────────────────────────
  // 1.21.4+ format: enchantments={levels:{"minecraft:sharpness":5,...}}
  for (const [tag, compName] of [['Enchantments', 'enchantments'], ['StoredEnchantments', 'stored_enchantments']] as const) {
    const list = lstVal(c[tag])
    if (list) {
      const levels: string[] = []
      for (const e of list) {
        const ec = cmpVal(e); if (!ec) continue
        const rawId = anyStr(ec['id'])
        if (!rawId) continue
        const id = ns(rawId)
        const lvl = numVal(ec['lvl']) ?? numVal(ec['Level']) ?? numVal(ec['lvl:']) ?? 1
        // key needs quoting if it contains ':'
        const key = `"${id}"`
        levels.push(`${key}:${lvl}`)
      }
      comp.push(`${compName}={levels:{${levels.join(',')}}}`)
      converted.push(`${tag} → ${compName}`)
    }
  }

  // ── enchantment_glint_override ────────────────────────────────────────────
  const glint = boolVal(c['enchantment_glint_override'])
  if (glint !== null) {
    comp.push(`enchantment_glint_override=${glint}`)
    converted.push('enchantment_glint_override → enchantment_glint_override')
  }

  // ── unbreakable ───────────────────────────────────────────────────────────
  const ub = boolVal(c['Unbreakable'])
  if (ub !== null) {
    if (ub) { comp.push('unbreakable={}'); converted.push('Unbreakable → unbreakable') }
  }

  // ── damage ────────────────────────────────────────────────────────────────
  const dmg = numVal(c['Damage']) ?? numVal(c['damage'])
  if (dmg !== null) { comp.push(`damage=${dmg}`); converted.push('Damage → damage') }

  // ── repair cost ───────────────────────────────────────────────────────────
  const rc = numVal(c['RepairCost'])
  if (rc !== null) { comp.push(`repair_cost=${rc}`); converted.push('RepairCost → repair_cost') }

  // ── custom model data ─────────────────────────────────────────────────────
  const cmdTag = c['CustomModelData']
  if (cmdTag) {
    const v = anyVal(cmdTag)
    if (v !== null) {
      comp.push(`custom_model_data=${typeof v === 'string' ? v : v}`)
      converted.push('CustomModelData → custom_model_data')
    }
  }

  // ── attribute modifiers ───────────────────────────────────────────────────
  const attrList = lstVal(c['AttributeModifiers'])
  if (attrList) {
    const attrs = attrList.map(e => {
      const ec = cmpVal(e); if (!ec) return null
      const oldName = anyStr(ec['AttributeName']) ?? ''
      const newName = ATTR[oldName] ?? (oldName.includes('.') ? `minecraft:${oldName.split('.').slice(1).join('_')}` : ns(oldName))
      const op = numVal(ec['Operation']) ?? 0
      const rawSlot = anyStr(ec['Slot']) ?? 'any'
      const slot = SLOT[rawSlot.toLowerCase()] ?? rawSlot
      return ser({ type: newName, id: attrId(newName), amount: numVal(ec['Amount']) ?? 0, operation: OP[op] ?? 'add_value', slot })
    }).filter(Boolean)
    comp.push(`attribute_modifiers=[${attrs.join(',')}]`)
    converted.push('AttributeModifiers → attribute_modifiers')
  }

  // ── skull owner / profile ─────────────────────────────────────────────────
  const skull = c['SkullOwner']
  if (skull) {
    if (skull.type === 'string') {
      comp.push(`profile={name:"${skull.value}"}`)
    } else {
      const sc = cmpVal(skull)
      if (sc) {
        const parts: string[] = []
        const n = anyStr(sc['Name']); if (n) parts.push(`name:"${n}"`)
        const idArr = lstVal(sc['Id']); if (idArr) parts.push(`id:[${idArr.map(t => numVal(t) ?? 0).join(',')}]`)
        const props = cmpVal(sc['Properties'])
        if (props) {
          const textures = lstVal(props['textures'])
          if (textures?.length) {
            const tc = cmpVal(textures[0]); const val = tc ? anyStr(tc['Value']) : null
            if (val) parts.push(`properties:[{name:"textures",value:"${val}"}]`)
          }
        }
        comp.push(`profile={${parts.join(',')}}`)
      }
    }
    converted.push('SkullOwner → profile')
  }

  // ── potion contents ───────────────────────────────────────────────────────
  const potionId = anyStr(c['Potion'])
  const customColor = numVal(c['CustomPotionColor'])
  const customEffects = lstVal(c['CustomPotionEffects'])
  if (potionId || customColor !== null || customEffects) {
    const parts: string[] = []
    if (potionId) parts.push(`potion:"${ns(potionId)}"`)
    if (customColor !== null) parts.push(`custom_color:${customColor}`)
    if (customEffects) {
      const effs = customEffects.map(e => {
        const ec = cmpVal(e); if (!ec) return null
        const eParts: string[] = []
        const id = anyStr(ec['id']); if (id) eParts.push(`id:"${ns(id)}"`)
        const amp = numVal(ec['Amplifier']); if (amp !== null) eParts.push(`amplifier:${amp}`)
        const dur = numVal(ec['Duration']); if (dur !== null) eParts.push(`duration:${dur}`)
        const showIcon = boolVal(ec['ShowIcon']); if (showIcon !== null) eParts.push(`show_icon:${showIcon}`)
        const showParticles = boolVal(ec['ShowParticles']); if (showParticles !== null) eParts.push(`show_particles:${showParticles}`)
        return `{${eParts.join(',')}}`
      }).filter(Boolean)
      parts.push(`custom_effects:[${effs.join(',')}]`)
    }
    comp.push(`potion_contents={${parts.join(',')}}`)
    converted.push('Potion/CustomPotionColor/CustomPotionEffects → potion_contents')
  }

  // ── BlockEntityTag → container (shulker/chest) or block_entity_data ───────
  const blockTag = cmpVal(c['BlockEntityTag'])
  if (blockTag) {
    const items = lstVal(blockTag['Items'])
    if (items) {
      // Container item (shulker box, chest, barrel, etc.)
      const slots = items.map(e => {
        const ec = cmpVal(e); if (!ec) return null
        const slot = numVal(ec['Slot']) ?? 0
        const id = anyStr(ec['id']) ?? ''
        const count = numVal(ec['Count']) ?? 1
        const nestedNbt = ec['tag']
        if (nestedNbt?.type === 'compound') {
          try {
            const nested = convertGive('_', id, serializeSnbt(nestedNbt), undefined)
            const m2 = nested.output.match(/\[(.+)\]$/)
            if (m2) return `{slot:${slot},item:{id:"${ns(id)}",count:${count},components:{${m2[1]}}}}`
          } catch { /* ignore nested errors */ }
        }
        return `{slot:${slot},item:{id:"${ns(id)}",count:${count}}}`
      }).filter(Boolean)
      comp.push(`container=[${slots.join(',')}]`)
      converted.push('BlockEntityTag.Items → container')
    }

    // Banner patterns
    const patterns = lstVal(blockTag['Patterns'])
    if (patterns) {
      const pats = patterns.map(p => {
        const pc = cmpVal(p); if (!pc) return null
        const color = numVal(pc['Color']) ?? 0
        const pat = anyStr(pc['Pattern'])
        return pat ? `{pattern:"minecraft:${pat}",color:${color}}` : null
      }).filter(Boolean)
      comp.push(`banner_patterns=[${pats.join(',')}]`)
      converted.push('BlockEntityTag.Patterns → banner_patterns')
    }

    // Bees in beehive/bee_nest
    const bees = lstVal(blockTag['Bees'])
    if (bees) {
      const beeList = bees.map(b => {
        const bc = cmpVal(b); if (!bc) return null
        const ent = cmpVal(bc['EntityData'])
        return ent ? `{entity_data:${serializeSnbt({ type: 'compound', value: ent })}}` : null
      }).filter(Boolean)
      comp.push(`bees=[${beeList.join(',')}]`)
      converted.push('BlockEntityTag.Bees → bees')
    }

    // Pot decorations / sherds
    const sherds = lstVal(blockTag['sherds'])
    if (sherds) {
      const decorations = sherds.map(s => `"${ns(anyStr(s) ?? '')}"`)
      comp.push(`pot_decorations=[${decorations.join(',')}]`)
      converted.push('BlockEntityTag.sherds → pot_decorations')
    }

    // Note block sound
    const sound = anyStr(blockTag['note_block_sound'])
    if (sound) { comp.push(`note_block_sound="${ns(sound)}"`); converted.push('BlockEntityTag.note_block_sound → note_block_sound') }

    // Generic block_entity_data for anything else (skulls, signs, etc.)
    const knownBET = new Set(['Items', 'Patterns', 'Bees', 'sherds', 'note_block_sound'])
    const extraKeys = Object.keys(blockTag).filter(k => !knownBET.has(k))
    if (extraKeys.length) {
      skipped.push(...extraKeys.map(k => `BlockEntityTag.${k} (use block_entity_data manually)`))
    }
  }

  // ── EntityTag → entity_data ───────────────────────────────────────────────
  const entityTag = cmpVal(c['EntityTag'])
  if (entityTag) {
    if (!('id' in entityTag)) {
      // Try to infer entity type from spawn egg item name
      const spawnEggMatch = rawItem.match(/^(?:minecraft:)?(.+)_spawn_egg$/)
      if (spawnEggMatch) entityTag['id'] = { type: 'string', value: `minecraft:${spawnEggMatch[1]}` }
    }
    comp.push(`entity_data=${serializeSnbt({ type: 'compound', value: entityTag })}`)
    converted.push('EntityTag → entity_data')
  }

  // ── BucketVariantTag → bucket_entity_data ─────────────────────────────────
  const bucketTag = cmpVal(c['BucketVariantTag'])
  if (bucketTag) {
    comp.push(`bucket_entity_data=${serializeSnbt({ type: 'compound', value: bucketTag })}`)
    converted.push('BucketVariantTag → bucket_entity_data')
  }

  // ── map ───────────────────────────────────────────────────────────────────
  const mapId = numVal(c['map'])
  if (mapId !== null) { comp.push(`map_id=${mapId}`); converted.push('map → map_id') }

  // ── fireworks ─────────────────────────────────────────────────────────────
  const fireworks = cmpVal(c['Fireworks'])
  if (fireworks) {
    const flight = numVal(fireworks['Flight'])
    const explosions = lstVal(fireworks['Explosions'])
    const fParts: string[] = []
    if (flight !== null) fParts.push(`flight_duration:${flight}`)
    if (explosions) {
      const exps = explosions.map(ex => {
        const ec = cmpVal(ex); if (!ec) return null
        const eParts: string[] = []
        const type = numVal(ec['Type']); if (type !== null) eParts.push(`shape:${['small_ball','large_ball','star','creeper','burst'][type] ?? 'small_ball'}`)
        const colors = ec['Colors']; if (colors) eParts.push(`colors:${serializeSnbt(colors)}`)
        const fadeColors = ec['FadeColors']; if (fadeColors) eParts.push(`fade_colors:${serializeSnbt(fadeColors)}`)
        const trail = boolVal(ec['Trail']); if (trail !== null) eParts.push(`has_trail:${trail}`)
        const flicker = boolVal(ec['Flicker']); if (flicker !== null) eParts.push(`has_twinkle:${flicker}`)
        return `{${eParts.join(',')}}`
      }).filter(Boolean)
      fParts.push(`explosions:[${exps.join(',')}]`)
    }
    comp.push(`fireworks={${fParts.join(',')}}`)
    converted.push('Fireworks → fireworks')
  }

  // Single firework star explosion (on firework_star item)
  const explosion = cmpVal(c['Explosion'])
  if (explosion) {
    const eParts: string[] = []
    const type = numVal(explosion['Type']); if (type !== null) eParts.push(`shape:${['small_ball','large_ball','star','creeper','burst'][type] ?? 'small_ball'}`)
    const colors = explosion['Colors']; if (colors) eParts.push(`colors:${serializeSnbt(colors)}`)
    const fadeColors = explosion['FadeColors']; if (fadeColors) eParts.push(`fade_colors:${serializeSnbt(fadeColors)}`)
    const trail = boolVal(explosion['Trail']); if (trail !== null) eParts.push(`has_trail:${trail}`)
    const flicker = boolVal(explosion['Flicker']); if (flicker !== null) eParts.push(`has_twinkle:${flicker}`)
    comp.push(`firework_explosion={${eParts.join(',')}}`)
    converted.push('Explosion → firework_explosion')
  }

  // ── book / written book ───────────────────────────────────────────────────
  const title = anyStr(c['title'])
  const author = anyStr(c['author'])
  const pages = lstVal(c['pages'])
  if (title || author || pages) {
    const parts: string[] = []
    if (title) parts.push(`title:"${title}"`)
    if (author) parts.push(`author:"${author}"`)
    if (pages) {
      const ps = pages.map(p => { const s = anyStr(p); return s ? sqStr(s) : null }).filter(Boolean)
      parts.push(`pages:[${ps.join(',')}]`)
    }
    comp.push(`written_book_content={${parts.join(',')}}`)
    converted.push('title/author/pages → written_book_content')
  }

  // ── suspicious stew effects ───────────────────────────────────────────────
  const stewEffects = lstVal(c['SuspiciousStewEffects'])
  if (stewEffects) {
    const effs = stewEffects.map(e => {
      const ec = cmpVal(e); if (!ec) return null
      const id = anyStr(ec['id']) ?? anyStr(ec['EffectId'])
      const dur = numVal(ec['duration']) ?? numVal(ec['EffectDuration']) ?? 160
      return id ? `{id:"${ns(id)}",duration:${dur}}` : null
    }).filter(Boolean)
    comp.push(`suspicious_stew_effects=[${effs.join(',')}]`)
    converted.push('SuspiciousStewEffects → suspicious_stew_effects')
  }

  // ── can_place_on / can_break ──────────────────────────────────────────────
  for (const [old, newC] of [['CanPlaceOn', 'can_place_on'], ['CanDestroy', 'can_break']] as const) {
    const list = lstVal(c[old])
    if (list) {
      const blocks = list.map(t => anyStr(t)).filter(Boolean).map(b => `{blocks:"${ns(b!)}"}`)
      comp.push(`${newC}={predicates:[${blocks.join(',')}]}`)
      converted.push(`${old} → ${newC}`)
    }
  }

  // ── HideFlags ─────────────────────────────────────────────────────────────
  const hideFlags = numVal(c['HideFlags'])
  if (hideFlags !== null) {
    const hc = hideComponents(hideFlags)
    if (hc.length) { comp.push(...hc); converted.push(`HideFlags(${hideFlags}) → ${hc.map(h => h.split('=')[0]).join(', ')}`) }
    else skipped.push(`HideFlags=${hideFlags} (most hide flags are now implicit — remove the component to show it)`)
  }

  // ── instrument (goat horn) ────────────────────────────────────────────────
  const instrument = anyStr(c['instrument'])
  if (instrument) {
    comp.push(`instrument="${ns(instrument)}"`)
    converted.push('instrument → instrument')
  }

  // ── trim ──────────────────────────────────────────────────────────────────
  const trim = cmpVal(c['Trim'])
  if (trim) {
    const mat = anyStr(trim['material'])
    const pat = anyStr(trim['pattern'])
    if (mat && pat) {
      comp.push(`trim={material:"${ns(mat)}",pattern:"${ns(pat)}"}`)
      converted.push('Trim → trim')
    }
  }

  // ── track unknown keys ────────────────────────────────────────────────────
  const KNOWN = new Set([
    'display', 'Enchantments', 'StoredEnchantments', 'enchantment_glint_override',
    'Unbreakable', 'AttributeModifiers', 'RepairCost', 'Damage', 'damage',
    'CustomModelData', 'SkullOwner', 'Potion', 'CustomPotionColor', 'CustomPotionEffects',
    'BlockEntityTag', 'EntityTag', 'BucketVariantTag', 'map',
    'Fireworks', 'Explosion', 'title', 'author', 'pages',
    'SuspiciousStewEffects', 'CanPlaceOn', 'CanDestroy', 'HideFlags',
    'instrument', 'Trim',
    // obsolete / not convertible
    'ench', 'generation', 'resolved',
  ])
  for (const k of Object.keys(c)) if (!KNOWN.has(k)) skipped.push(k)

  const compStr = comp.length ? `[${comp.join(',')}]` : ''
  return { output: `/give ${selector} ${item}${compStr}`, converted, skipped }
}

