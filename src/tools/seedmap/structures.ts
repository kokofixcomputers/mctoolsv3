import type { Dim } from './cubiomesApi'

export interface StructureDef {
  type: number      // cubiomes StructureType enum value (or special: see `mode`)
  label: string
  icon: string      // filename in /icons/structures/
  dims: Dim[]
  mode?: 'region' | 'stronghold' | 'spawn'  // how positions are found (default region)
  loot?: boolean    // chest-loot estimation supported (xpple fork)
}

const ICON = (name: string) => `/icons/structures/${name}.webp`

// Synthetic def for zombie (abandoned) villages — same cubiomes Village type, but
// rendered with a distinct icon. Not a separate filter toggle.
export const ZOMBIE_VILLAGE_DEF: StructureDef = {
  type: -200, label: 'Zombie Village', icon: ICON('zombie_village'), dims: [0],
}

// cubiomes enum values (from finders.h StructureType)
export const STRUCTURES: StructureDef[] = [
  { type: 5,  label: 'Village',          icon: ICON('village'),        dims: [0] },
  { type: 10, label: 'Pillager Outpost', icon: ICON('outpost'),        dims: [0], loot: true },
  { type: 1,  label: 'Desert Pyramid',   icon: ICON('desert_pyramid'), dims: [0], loot: true },
  { type: 2,  label: 'Jungle Temple',    icon: ICON('jungle_temple'),  dims: [0], loot: true },
  { type: 3,  label: 'Swamp Hut',        icon: ICON('swamp_hut'),      dims: [0] },
  { type: 4,  label: 'Igloo',            icon: ICON('igloo'),          dims: [0], loot: true },
  { type: 8,  label: 'Ocean Monument',   icon: ICON('monument'),       dims: [0] },
  { type: 9,  label: 'Woodland Mansion', icon: ICON('mansion'),        dims: [0] },
  { type: 7,  label: 'Shipwreck',        icon: ICON('shipwreck'),      dims: [0], loot: true },
  { type: 6,  label: 'Ocean Ruin',       icon: ICON('ocean_ruin'),     dims: [0] },
  { type: 14, label: 'Buried Treasure',  icon: ICON('treasure'),       dims: [0], loot: true },
  { type: 11, label: 'Ruined Portal',    icon: ICON('ruined_portal'),  dims: [0], loot: true },
  { type: 13, label: 'Ancient City',     icon: ICON('ancient_city'),   dims: [0] },
  { type: 23, label: 'Trail Ruins',      icon: ICON('trail_ruins'),    dims: [0] },
  { type: 24, label: 'Trial Chambers',   icon: ICON('trial_chambers'), dims: [0] },
  { type: 17, label: 'Amethyst Geode',   icon: ICON('geode'),          dims: [0] },
  { type: 15, label: 'Mineshaft',        icon: ICON('mineshaft'),      dims: [0] },
  { type: -100, label: 'Stronghold',     icon: ICON('stronghold'),     dims: [0], mode: 'stronghold' },
  { type: -101, label: 'World Spawn',    icon: ICON('spawn'),          dims: [0], mode: 'spawn' },
  { type: 18, label: 'Nether Fortress',  icon: ICON('fortress'),       dims: [-1], loot: true },
  { type: 19, label: 'Bastion Remnant',  icon: ICON('bastion'),        dims: [-1], loot: true },
  { type: 12, label: 'Ruined Portal',    icon: ICON('ruined_portal'),  dims: [-1], loot: true },
  { type: 20, label: 'End City',         icon: ICON('end_city'),       dims: [1], loot: true },
  { type: 21, label: 'End Gateway',      icon: ICON('end_gateway'),    dims: [1] },
]
