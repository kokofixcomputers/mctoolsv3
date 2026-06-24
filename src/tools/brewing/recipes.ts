// Brewing reference data. Colours are the approximate vanilla potion tints.

export const ASSET_BASE = '/mc-assets/1.21.11'
export const ITEM = (id: string) => `${ASSET_BASE}/items/${id}.png`
export const pretty = (id: string) => id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

export interface Potion {
  id: string
  name: string
  color: string
  ingredient?: string          // main ingredient added to the Awkward Potion
  invertFrom?: string          // built from another potion via fermented spider eye
  extended?: boolean           // supports Redstone (longer)
  upgraded?: boolean           // supports Glowstone (level II)
  negative?: boolean
  note?: string
  effect?: string              // short description of what it does
  special?: boolean            // not obtained via standard brewing
  sourceNote?: string          // where it actually comes from (for `special`)
}

export const POTIONS: Potion[] = [
  { id: 'regeneration', name: 'Regeneration', color: '#cd5cab', ingredient: 'ghast_tear', extended: true, upgraded: true },
  { id: 'swiftness', name: 'Swiftness', color: '#7cafc6', ingredient: 'sugar', extended: true, upgraded: true },
  { id: 'strength', name: 'Strength', color: '#932423', ingredient: 'blaze_powder', extended: true, upgraded: true },
  { id: 'leaping', name: 'Leaping', color: '#22ff4c', ingredient: 'rabbit_foot', extended: true, upgraded: true },
  { id: 'healing', name: 'Healing', color: '#f82423', ingredient: 'glistering_melon_slice', upgraded: true },
  { id: 'fire_resistance', name: 'Fire Resistance', color: '#e49a3a', ingredient: 'magma_cream', extended: true },
  { id: 'night_vision', name: 'Night Vision', color: '#1f1fa1', ingredient: 'golden_carrot', extended: true },
  { id: 'water_breathing', name: 'Water Breathing', color: '#2e5299', ingredient: 'pufferfish', extended: true },
  { id: 'slow_falling', name: 'Slow Falling', color: '#f3cfb2', ingredient: 'phantom_membrane', extended: true },
  { id: 'turtle_master', name: 'the Turtle Master', color: '#9a9d81', ingredient: 'turtle_helmet', extended: true, upgraded: true },
  { id: 'poison', name: 'Poison', color: '#4e9331', ingredient: 'spider_eye', extended: true, upgraded: true, negative: true },
  { id: 'weakness', name: 'Weakness', color: '#484d48', ingredient: 'fermented_spider_eye', extended: true, negative: true, note: 'Fermented spider eye in a Water Bottle (no nether wart needed)' },
  { id: 'harming', name: 'Harming', color: '#430a09', invertFrom: 'healing', upgraded: true, negative: true },
  { id: 'slowness', name: 'Slowness', color: '#5a6c81', invertFrom: 'swiftness', extended: true, negative: true },
  { id: 'invisibility', name: 'Invisibility', color: '#7f8392', invertFrom: 'night_vision', extended: true },

  // Brewing dead-ends (no effect)
  { id: 'mundane', name: 'Mundane', color: '#385dc6', effect: 'No effect — a brewing dead-end.' },
  { id: 'thick', name: 'Thick', color: '#385dc6', effect: 'No effect — a brewing dead-end.' },

  // 1.21 effect potions — not obtained through normal brewing
  { id: 'wind_charging', name: 'Wind Charging', color: '#bcaed0', special: true, note: '1.21', effect: 'Bursts of wind are released when you take damage / die.', sourceNote: 'Applied by the Breeze and obtainable via /give — no survival brewing recipe.' },
  { id: 'weaving', name: 'Weaving', color: '#a8b0bd', special: true, note: '1.21', effect: 'Cobwebs spawn around you when you die.', sourceNote: 'From Trial Chamber sources (e.g. the Bogged) and /give — no survival brewing recipe.' },
  { id: 'oozing', name: 'Oozing', color: '#6c9a3e', special: true, note: '1.21', effect: 'Two slimes spawn when you die.', sourceNote: 'From Trial Chamber sources and /give — no survival brewing recipe.' },
  { id: 'infestation', name: 'Infestation', color: '#759086', special: true, note: '1.21', effect: 'A chance to spawn silverfish when you take damage.', sourceNote: 'From Trial Chamber sources and /give — no survival brewing recipe.' },

  // Creative-only
  { id: 'luck', name: 'Luck', color: '#5cb000', special: true, effect: 'Improves loot from certain loot tables.', sourceNote: 'Creative inventory / commands only — not brewable in survival.' },
]

export const byId = (id: string) => POTIONS.find(p => p.id === id)

// A few potion registry ids differ from our display ids.
const POTION_ID_OVERRIDE: Record<string, string> = { wind_charging: 'wind_charged', infestation: 'infested' }
export const potionRegistryId = (p: Potion) => POTION_ID_OVERRIDE[p.id] ?? p.id

// OP give command (1.20.5+ component form) for the drinkable potion.
export const giveCommand = (p: Potion) =>
  `/give @p minecraft:potion[potion_contents={potion:"minecraft:${potionRegistryId(p)}"}]`

export interface Step {
  kind: 'water' | 'brew'
  ingredient?: string   // item id added in the brewing stand
  result: string        // resulting bottle label
  color: string         // tint of the resulting bottle
  note?: string
}

export const AWKWARD_COLOR = '#385dc6'

// The ordered brewing steps to reach a potion (starting from filling water bottles).
export function buildSteps(p: Potion): Step[] {
  if (p.special) return []
  // Thick & Mundane are brewed straight off a Water Bottle (no Awkward base).
  if (p.id === 'thick') {
    return [
      { kind: 'water', result: 'Water Bottle', color: '#385dc6' },
      { kind: 'brew', ingredient: 'glowstone_dust', result: 'Thick Potion', color: p.color },
    ]
  }
  if (p.id === 'mundane') {
    return [
      { kind: 'water', result: 'Water Bottle', color: '#385dc6' },
      { kind: 'brew', ingredient: 'sugar', result: 'Mundane Potion', color: p.color, note: 'Any base ingredient on a Water Bottle (no Nether Wart) — e.g. Sugar, Spider Eye, Magma Cream…' },
    ]
  }
  // Weakness is the odd one — fermented spider eye straight into a water bottle.
  if (p.id === 'weakness') {
    return [
      { kind: 'water', result: 'Water Bottle', color: '#385dc6' },
      { kind: 'brew', ingredient: 'fermented_spider_eye', result: 'Potion of Weakness', color: p.color },
    ]
  }
  if (p.invertFrom) {
    const src = byId(p.invertFrom)!
    return [
      ...buildSteps(src),
      { kind: 'brew', ingredient: 'fermented_spider_eye', result: `Potion of ${p.name}`, color: p.color, note: `Corrupts ${src.name} → ${p.name}` },
    ]
  }
  return [
    { kind: 'water', result: 'Water Bottle', color: '#385dc6' },
    { kind: 'brew', ingredient: 'nether_wart', result: 'Awkward Potion', color: AWKWARD_COLOR },
    { kind: 'brew', ingredient: p.ingredient!, result: `Potion of ${p.name}`, color: p.color },
  ]
}

export interface Modifier { ingredient: string; label: string; desc: string }
export function modifiersFor(p: Potion): Modifier[] {
  if (p.special || p.id === 'thick' || p.id === 'mundane') return []
  const mods: Modifier[] = []
  if (p.extended) mods.push({ ingredient: 'redstone', label: 'Extended duration', desc: 'Longer effect (removes level II)' })
  if (p.upgraded) mods.push({ ingredient: 'glowstone_dust', label: 'Level II', desc: 'Stronger effect (shorter duration)' })
  mods.push({ ingredient: 'gunpowder', label: 'Splash', desc: 'Throwable — affects nearby entities' })
  mods.push({ ingredient: 'dragon_breath', label: 'Lingering', desc: 'From a Splash potion — leaves a cloud' })
  return mods
}
