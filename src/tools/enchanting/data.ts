export const ASSET_BASE = '/mc-assets/1.21.11'
export const ITEM = (id: string) => `${ASSET_BASE}/items/${id}.png`

export interface Enchantment {
  id: string
  name: string
  maxLevel: number
  bookMult: number
  itemMult: number
  desc: string
  incompatibleWith?: string[]
  curse?: boolean
}

export const ENCHANTMENTS: Record<string, Enchantment> = {
  // Armor — general
  protection:            { id: 'protection',            name: 'Protection',           maxLevel: 4, bookMult: 1, itemMult: 2,  desc: 'Reduces all damage taken.',                  incompatibleWith: ['fire_protection','blast_protection','projectile_protection'] },
  fire_protection:       { id: 'fire_protection',       name: 'Fire Protection',      maxLevel: 4, bookMult: 1, itemMult: 2,  desc: 'Reduces fire and lava damage.',              incompatibleWith: ['protection','blast_protection','projectile_protection'] },
  blast_protection:      { id: 'blast_protection',      name: 'Blast Protection',     maxLevel: 4, bookMult: 2, itemMult: 4,  desc: 'Reduces explosion damage and knockback.',    incompatibleWith: ['protection','fire_protection','projectile_protection'] },
  projectile_protection: { id: 'projectile_protection', name: 'Proj. Protection',     maxLevel: 4, bookMult: 1, itemMult: 2,  desc: 'Reduces projectile damage.',                 incompatibleWith: ['protection','fire_protection','blast_protection'] },
  thorns:                { id: 'thorns',                name: 'Thorns',               maxLevel: 3, bookMult: 4, itemMult: 8,  desc: 'Damages attackers on hit.' },
  unbreaking:            { id: 'unbreaking',            name: 'Unbreaking',           maxLevel: 3, bookMult: 1, itemMult: 2,  desc: 'Reduces durability loss.' },
  mending:               { id: 'mending',               name: 'Mending',              maxLevel: 1, bookMult: 2, itemMult: 4,  desc: 'Repairs item using XP orbs.',                incompatibleWith: ['infinity'] },
  vanishing_curse:       { id: 'vanishing_curse',       name: 'Curse of Vanishing',   maxLevel: 1, bookMult: 1, itemMult: 2,  desc: 'Item disappears on death.', curse: true },
  binding_curse:         { id: 'binding_curse',         name: 'Curse of Binding',     maxLevel: 1, bookMult: 2, itemMult: 4,  desc: 'Cannot remove from armor slot.', curse: true },
  // Helmet
  respiration:           { id: 'respiration',           name: 'Respiration',          maxLevel: 3, bookMult: 2, itemMult: 4,  desc: 'Extends underwater breathing time.' },
  aqua_affinity:         { id: 'aqua_affinity',         name: 'Aqua Affinity',        maxLevel: 1, bookMult: 2, itemMult: 4,  desc: 'Normal mining speed underwater.' },
  // Boots
  feather_falling:       { id: 'feather_falling',       name: 'Feather Falling',      maxLevel: 4, bookMult: 1, itemMult: 2,  desc: 'Reduces fall damage.' },
  depth_strider:         { id: 'depth_strider',         name: 'Depth Strider',        maxLevel: 3, bookMult: 2, itemMult: 4,  desc: 'Faster movement underwater.',                incompatibleWith: ['frost_walker'] },
  frost_walker:          { id: 'frost_walker',          name: 'Frost Walker',         maxLevel: 2, bookMult: 2, itemMult: 4,  desc: 'Turns water to ice when walked on.',         incompatibleWith: ['depth_strider'] },
  soul_speed:            { id: 'soul_speed',            name: 'Soul Speed',           maxLevel: 3, bookMult: 5, itemMult: 10, desc: 'Faster movement on soul sand/soil.' },
  // Leggings
  swift_sneak:           { id: 'swift_sneak',           name: 'Swift Sneak',          maxLevel: 3, bookMult: 4, itemMult: 8,  desc: 'Faster movement while sneaking.' },
  // Sword
  sharpness:             { id: 'sharpness',             name: 'Sharpness',            maxLevel: 5, bookMult: 1, itemMult: 2,  desc: 'Increases melee damage.',                    incompatibleWith: ['smite','bane_of_arthropods'] },
  smite:                 { id: 'smite',                 name: 'Smite',                maxLevel: 5, bookMult: 1, itemMult: 2,  desc: 'Extra damage to undead mobs.',               incompatibleWith: ['sharpness','bane_of_arthropods'] },
  bane_of_arthropods:    { id: 'bane_of_arthropods',    name: 'Bane of Arthropods',   maxLevel: 5, bookMult: 1, itemMult: 2,  desc: 'Extra damage to spiders & silverfish.',      incompatibleWith: ['sharpness','smite'] },
  knockback:             { id: 'knockback',             name: 'Knockback',            maxLevel: 2, bookMult: 1, itemMult: 2,  desc: 'Knocks enemies back further on hit.' },
  fire_aspect:           { id: 'fire_aspect',           name: 'Fire Aspect',          maxLevel: 2, bookMult: 2, itemMult: 4,  desc: 'Sets targets on fire.' },
  looting:               { id: 'looting',               name: 'Looting',              maxLevel: 3, bookMult: 2, itemMult: 4,  desc: 'More drops from mobs.',                      incompatibleWith: ['silk_touch'] },
  // Tools
  efficiency:            { id: 'efficiency',            name: 'Efficiency',           maxLevel: 5, bookMult: 1, itemMult: 2,  desc: 'Increases mining speed.' },
  silk_touch:            { id: 'silk_touch',            name: 'Silk Touch',           maxLevel: 1, bookMult: 4, itemMult: 8,  desc: 'Drops blocks as-is.',                        incompatibleWith: ['fortune','looting'] },
  fortune:               { id: 'fortune',               name: 'Fortune',              maxLevel: 3, bookMult: 2, itemMult: 4,  desc: 'More drops from ore/blocks.',                incompatibleWith: ['silk_touch'] },
  // Bow
  power:                 { id: 'power',                 name: 'Power',                maxLevel: 5, bookMult: 1, itemMult: 2,  desc: 'Increases arrow damage.' },
  punch:                 { id: 'punch',                 name: 'Punch',                maxLevel: 2, bookMult: 2, itemMult: 4,  desc: 'Knocks back arrow targets.' },
  flame:                 { id: 'flame',                 name: 'Flame',                maxLevel: 1, bookMult: 2, itemMult: 4,  desc: 'Arrows set targets on fire.' },
  infinity:              { id: 'infinity',              name: 'Infinity',             maxLevel: 1, bookMult: 4, itemMult: 8,  desc: 'Never consume arrows.',                      incompatibleWith: ['mending'] },
  // Crossbow
  multishot:             { id: 'multishot',             name: 'Multishot',            maxLevel: 1, bookMult: 2, itemMult: 4,  desc: 'Fires 3 arrows at once.',                    incompatibleWith: ['piercing'] },
  quick_charge:          { id: 'quick_charge',          name: 'Quick Charge',         maxLevel: 3, bookMult: 1, itemMult: 2,  desc: 'Faster crossbow loading.' },
  piercing:              { id: 'piercing',              name: 'Piercing',             maxLevel: 4, bookMult: 1, itemMult: 2,  desc: 'Arrows pass through entities.',              incompatibleWith: ['multishot'] },
  // Trident
  loyalty:               { id: 'loyalty',               name: 'Loyalty',              maxLevel: 3, bookMult: 1, itemMult: 2,  desc: 'Trident returns after throwing.',             incompatibleWith: ['riptide'] },
  riptide:               { id: 'riptide',               name: 'Riptide',              maxLevel: 3, bookMult: 2, itemMult: 4,  desc: 'Propels player when thrown in water/rain.',  incompatibleWith: ['loyalty','channeling'] },
  channeling:            { id: 'channeling',            name: 'Channeling',           maxLevel: 1, bookMult: 4, itemMult: 8,  desc: 'Summons lightning strike in storms.',         incompatibleWith: ['riptide'] },
  impaling:              { id: 'impaling',              name: 'Impaling',             maxLevel: 5, bookMult: 2, itemMult: 4,  desc: 'Extra damage to aquatic mobs.' },
  // Fishing rod
  luck_of_the_sea:       { id: 'luck_of_the_sea',       name: 'Luck of the Sea',      maxLevel: 3, bookMult: 2, itemMult: 4,  desc: 'Better treasure when fishing.' },
  lure:                  { id: 'lure',                  name: 'Lure',                 maxLevel: 3, bookMult: 2, itemMult: 4,  desc: 'Faster bite rate when fishing.' },
  // Mace (1.21+)
  density:               { id: 'density',               name: 'Density',              maxLevel: 5, bookMult: 1, itemMult: 2,  desc: 'More smash damage the farther you fall.',    incompatibleWith: ['breach'] },
  breach:                { id: 'breach',                name: 'Breach',               maxLevel: 4, bookMult: 3, itemMult: 6,  desc: 'Reduces enemy armor effectiveness.',         incompatibleWith: ['density'] },
  wind_burst:            { id: 'wind_burst',            name: 'Wind Burst',           maxLevel: 3, bookMult: 4, itemMult: 8,  desc: 'Emits wind burst on smash attack.' },
}

export interface ItemDef {
  id: string
  name: string
  icon: string
  enchants: string[]
}

export const ITEMS: ItemDef[] = [
  { id: 'sword',         name: 'Sword',         icon: 'diamond_sword',      enchants: ['sharpness','smite','bane_of_arthropods','knockback','fire_aspect','looting','unbreaking','mending','vanishing_curse'] },
  { id: 'pickaxe',       name: 'Pickaxe',       icon: 'diamond_pickaxe',    enchants: ['efficiency','silk_touch','fortune','unbreaking','mending','vanishing_curse'] },
  { id: 'axe',           name: 'Axe',           icon: 'diamond_axe',        enchants: ['sharpness','smite','bane_of_arthropods','efficiency','silk_touch','fortune','unbreaking','mending','vanishing_curse'] },
  { id: 'shovel',        name: 'Shovel',        icon: 'diamond_shovel',     enchants: ['efficiency','silk_touch','fortune','unbreaking','mending','vanishing_curse'] },
  { id: 'hoe',           name: 'Hoe',           icon: 'diamond_hoe',        enchants: ['efficiency','silk_touch','fortune','unbreaking','mending','vanishing_curse'] },
  { id: 'bow',           name: 'Bow',           icon: 'bow',                enchants: ['power','punch','flame','infinity','unbreaking','mending','vanishing_curse'] },
  { id: 'crossbow',      name: 'Crossbow',      icon: 'crossbow_standby',   enchants: ['multishot','quick_charge','piercing','unbreaking','mending','vanishing_curse'] },
  { id: 'trident',       name: 'Trident',       icon: 'trident',            enchants: ['loyalty','riptide','channeling','impaling','unbreaking','mending','vanishing_curse'] },
  { id: 'mace',          name: 'Mace',          icon: 'mace',               enchants: ['density','breach','wind_burst','smite','bane_of_arthropods','fire_aspect','unbreaking','mending','vanishing_curse'] },
  { id: 'fishing_rod',   name: 'Fishing Rod',   icon: 'fishing_rod',        enchants: ['luck_of_the_sea','lure','unbreaking','mending','vanishing_curse'] },
  { id: 'shears',        name: 'Shears',        icon: 'shears',             enchants: ['efficiency','unbreaking','mending','vanishing_curse'] },
  { id: 'helmet',        name: 'Helmet',        icon: 'diamond_helmet',     enchants: ['protection','fire_protection','blast_protection','projectile_protection','respiration','aqua_affinity','thorns','unbreaking','mending','binding_curse','vanishing_curse'] },
  { id: 'chestplate',    name: 'Chestplate',    icon: 'diamond_chestplate', enchants: ['protection','fire_protection','blast_protection','projectile_protection','thorns','unbreaking','mending','binding_curse','vanishing_curse'] },
  { id: 'leggings',      name: 'Leggings',      icon: 'diamond_leggings',   enchants: ['protection','fire_protection','blast_protection','projectile_protection','swift_sneak','thorns','unbreaking','mending','binding_curse','vanishing_curse'] },
  { id: 'boots',         name: 'Boots',         icon: 'diamond_boots',      enchants: ['protection','fire_protection','blast_protection','projectile_protection','feather_falling','depth_strider','frost_walker','soul_speed','thorns','unbreaking','mending','binding_curse','vanishing_curse'] },
  { id: 'flint_steel',   name: 'Flint & Steel', icon: 'flint_and_steel',    enchants: ['unbreaking','mending','vanishing_curse'] },
]
