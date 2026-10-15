/**
 * What a Superflat world is made of, and the two ways to write it down: the JSON of generator-settings (Minecraft 1.16 and
 * newer, what a server uses) and the preset string of the Create World screen ("2*minecraft:dirt,minecraft:grass_block;
 * minecraft:plains").
 *
 * Layers are kept from the surface down, the way they look on screen. Both formats list them from the bottom up.
 */

export interface Layer {
  uid: string
  block: string // a full id such as "minecraft:bedrock"
  count: number // how many blocks tall
}

export interface FlatWorld {
  layers: Layer[]
  biome: string
  /** Trees, ores and the other decoration of the biome. */
  features: boolean
  /** Lakes of water and lava on the surface. */
  lakes: boolean
  /** Ids of structure sets, such as "minecraft:villages". */
  structures: string[]
}

/** The structure sets Superflat can generate. */
export const STRUCTURES: { id: string; label: string }[] = [
  { id: 'minecraft:villages', label: 'Villages' },
  { id: 'minecraft:mineshafts', label: 'Mineshafts' },
  { id: 'minecraft:strongholds', label: 'Strongholds' },
  { id: 'minecraft:pillager_outposts', label: 'Pillager outposts' },
  { id: 'minecraft:ruined_portals', label: 'Ruined portals' },
  { id: 'minecraft:desert_pyramids', label: 'Desert pyramids' },
  { id: 'minecraft:jungle_temples', label: 'Jungle temples' },
  { id: 'minecraft:igloos', label: 'Igloos' },
  { id: 'minecraft:swamp_huts', label: 'Swamp huts' },
  { id: 'minecraft:woodland_mansions', label: 'Woodland mansions' },
  { id: 'minecraft:ocean_monuments', label: 'Ocean monuments' },
  { id: 'minecraft:ocean_ruins', label: 'Ocean ruins' },
  { id: 'minecraft:shipwrecks', label: 'Shipwrecks' },
  { id: 'minecraft:buried_treasures', label: 'Buried treasure' },
  { id: 'minecraft:ancient_cities', label: 'Ancient cities' },
  { id: 'minecraft:trail_ruins', label: 'Trail ruins' },
  { id: 'minecraft:trial_chambers', label: 'Trial chambers' },
  { id: 'minecraft:nether_complexes', label: 'Nether fortresses and bastions' },
  { id: 'minecraft:nether_fossils', label: 'Nether fossils' },
]

/** From bedrock (-64) to the build limit (320). More layers than this are built over the top of the world. */
export const WORLD_HEIGHT = 384
export const MAX_LAYER = 384

let counter = 0
export const uid = (): string => `layer-${++counter}`

const withNamespace = (block: string): string => {
  const trimmed = block.trim()

  return trimmed.includes(':') ? trimmed : `minecraft:${trimmed}`
}

export const layerOf = (block: string, count = 1): Layer => ({
  uid: uid(),
  block: withNamespace(block),
  count: Math.max(1, Math.min(MAX_LAYER, Math.floor(count) || 1)),
})

export const totalHeight = (layers: Layer[]): number => layers.reduce((sum, layer) => sum + layer.count, 0)

/** The JSON for generator-settings. Empty when there is nothing to build with, which makes the game use its own layers. */
export const toGeneratorSettings = (world: FlatWorld): string =>
  JSON.stringify({
    biome: world.biome,
    features: world.features,
    lakes: world.lakes,
    layers: [...world.layers].reverse().map((layer) => ({ block: layer.block, height: layer.count })),
    structure_overrides: world.structures,
  })

/** Reads generator-settings back. Null when it is not the JSON of a Superflat world (the preset string is another reader). */
export const fromGeneratorSettings = (raw: string): FlatWorld | null => {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object' || !Array.isArray((data as { layers?: unknown }).layers)) return null

  const source = data as {
    biome?: string
    features?: boolean
    lakes?: boolean
    layers: { block?: string; height?: number }[]
    structure_overrides?: string[] | string
  }
  const layers = source.layers
    .filter((l) => typeof l?.block === 'string' && l.block !== '')
    .map((l) => layerOf(l.block as string, Number(l.height) || 1))
    .reverse()

  return {
    layers,
    biome: typeof source.biome === 'string' && source.biome ? withNamespace(source.biome) : 'minecraft:plains',
    features: !!source.features,
    lakes: !!source.lakes,
    structures: Array.isArray(source.structure_overrides)
      ? source.structure_overrides
      : typeof source.structure_overrides === 'string'
        ? [source.structure_overrides]
        : [],
  }
}

/** The preset string of the Create World screen. */
export const toPresetString = (world: FlatWorld): string =>
  world.layers.length === 0
    ? ''
    : [...world.layers]
        .reverse()
        .map((layer) => (layer.count === 1 ? layer.block : `${layer.count}*${layer.block}`))
        .join(',') +
      ';' +
      world.biome

/** How tall a layer is drawn: as it is up to three blocks, after that it grows slowly so a 230 high stone does not hide the rest. */
export const visualHeight = (count: number): number =>
  count <= 3 ? count : 3 + Math.log2(count / 3) * 1.1
