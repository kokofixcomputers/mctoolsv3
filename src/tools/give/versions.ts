export type GiveFormat = 'modern-new' | 'modern-old' | 'legacy' | 'bedrock'

export interface VersionDef {
  id: string
  label: string
  edition: 'java' | 'bedrock'
  format: GiveFormat
}

export const VERSIONS: VersionDef[] = [
  // Java 26.x (snapshot era)
  { id: '26.2', label: 'Java 26.2+', edition: 'java', format: 'modern-new' },
  { id: '26.1', label: 'Java 26.1',  edition: 'java', format: 'modern-new' },
  // Java 1.21.x
  { id: '1.21.11', label: 'Java 1.21.11', edition: 'java', format: 'modern-new' },
  { id: '1.21.5',  label: 'Java 1.21.5',  edition: 'java', format: 'modern-new' },
  { id: '1.21.4',  label: 'Java 1.21.4',  edition: 'java', format: 'modern-new' },
  { id: '1.21.1',  label: 'Java 1.21.1',  edition: 'java', format: 'modern-old' },
  { id: '1.20.6',  label: 'Java 1.20.6',  edition: 'java', format: 'modern-old' },
  // Java legacy NBT (1.13–1.20.4)
  { id: '1.20.4', label: 'Java 1.20.4', edition: 'java', format: 'legacy' },
  { id: '1.20.1', label: 'Java 1.20.1', edition: 'java', format: 'legacy' },
  { id: '1.19.4', label: 'Java 1.19.4', edition: 'java', format: 'legacy' },
  { id: '1.18.2', label: 'Java 1.18.2', edition: 'java', format: 'legacy' },
  { id: '1.16.5', label: 'Java 1.16.5', edition: 'java', format: 'legacy' },
  // Bedrock
  { id: 'bedrock-1.21.10', label: 'Bedrock 1.21.10', edition: 'bedrock', format: 'bedrock' },
  { id: 'bedrock-1.21.0',  label: 'Bedrock 1.21.0',  edition: 'bedrock', format: 'bedrock' },
]

// Map global VersionContext IDs → give format
export const GLOBAL_VERSION_FORMAT: Record<string, GiveFormat> = {
  '1.21.11': 'modern-new',
  '1.21.5':  'modern-new',
  '1.21.1':  'modern-old',
}

export const ENCHANTMENTS: { id: string; label: string; max: number }[] = [
  { id: 'sharpness', label: 'Sharpness', max: 5 },
  { id: 'smite', label: 'Smite', max: 5 },
  { id: 'bane_of_arthropods', label: 'Bane of Arthropods', max: 5 },
  { id: 'knockback', label: 'Knockback', max: 2 },
  { id: 'fire_aspect', label: 'Fire Aspect', max: 2 },
  { id: 'looting', label: 'Looting', max: 3 },
  { id: 'sweeping_edge', label: 'Sweeping Edge', max: 3 },
  { id: 'unbreaking', label: 'Unbreaking', max: 3 },
  { id: 'mending', label: 'Mending', max: 1 },
  { id: 'efficiency', label: 'Efficiency', max: 5 },
  { id: 'fortune', label: 'Fortune', max: 3 },
  { id: 'silk_touch', label: 'Silk Touch', max: 1 },
  { id: 'protection', label: 'Protection', max: 4 },
  { id: 'fire_protection', label: 'Fire Protection', max: 4 },
  { id: 'blast_protection', label: 'Blast Protection', max: 4 },
  { id: 'projectile_protection', label: 'Projectile Protection', max: 4 },
  { id: 'thorns', label: 'Thorns', max: 3 },
  { id: 'feather_falling', label: 'Feather Falling', max: 4 },
  { id: 'depth_strider', label: 'Depth Strider', max: 3 },
  { id: 'frost_walker', label: 'Frost Walker', max: 2 },
  { id: 'power', label: 'Power', max: 5 },
  { id: 'punch', label: 'Punch', max: 2 },
  { id: 'flame', label: 'Flame', max: 1 },
  { id: 'infinity', label: 'Infinity', max: 1 },
  { id: 'luck_of_the_sea', label: 'Luck of the Sea', max: 3 },
  { id: 'lure', label: 'Lure', max: 3 },
  { id: 'swift_sneak', label: 'Swift Sneak', max: 3 },
  { id: 'soul_speed', label: 'Soul Speed', max: 3 },
  { id: 'curse_of_binding', label: 'Curse of Binding', max: 1 },
  { id: 'curse_of_vanishing', label: 'Curse of Vanishing', max: 1 },
]

// Short attribute id → old "generic." prefixed name for 1.21.1 and earlier
export const OLD_ATTR_NAMES: Record<string, string> = {
  armor:                 'generic.armor',
  armor_toughness:       'generic.armor_toughness',
  attack_damage:         'generic.attack_damage',
  attack_speed:          'generic.attack_speed',
  max_health:            'generic.max_health',
  movement_speed:        'generic.movement_speed',
  knockback_resistance:  'generic.knockback_resistance',
  luck:                  'generic.luck',
}
