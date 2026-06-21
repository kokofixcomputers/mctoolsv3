import { NbtWriter, varint, gzip } from './nbtWriter'

// WorldEdit Sponge Schematic v2
// https://github.com/EngineHub/WorldEdit/blob/master/worldedit-core/src/main/java/com/sk89q/worldedit/extent/clipboard/io/SpongeSchematicWriter.java

export interface SchematicOptions {
  grid: boolean[]        // flat row-major (z outer, x inner) boolean array
  width: number          // X
  height: number         // Y (always 1 for flat circle)
  length: number         // Z
  blockId: string        // e.g. "minecraft:stone"
  name?: string
}

export async function buildSchematic(opts: SchematicOptions): Promise<Uint8Array> {
  const { grid, width, height, length, blockId, name = 'Circle' } = opts

  // Palette: 0 = air, 1 = chosen block
  const airId = 'minecraft:air'
  const blockCount = width * height * length

  // BlockData: varint-encoded palette indices
  // Sponge v2 index order: y * width * length + z * width + x
  // For height=1 (y=0): index = z * width + x
  const blockDataArr: number[] = []
  for (let z = 0; z < length; z++) {
    for (let x = 0; x < width; x++) {
      // Our grid is stored as y outer, x inner (row-major 2D)
      // grid[y * W + x] but we treat y→z for the horizontal plane
      const idx = z * width + x
      const paletteIdx = grid[idx] ? 1 : 0
      blockDataArr.push(...varint(paletteIdx))
    }
  }

  const w = new NbtWriter()
  w.compound('Schematic', () => {
    w.int('Version', 2)
    w.int('DataVersion', 3953)  // 1.21.1

    w.compound('Metadata', () => {
      w.string('Name', name)
      w.string('Author', 'MCTools v3')
      w.long('Date', 0, Date.now())
      w.emptyList('RequiredMods', 8) // list of strings
    })

    w.short('Width', width)
    w.short('Height', height)
    w.short('Length', length)

    w.intArray('Offset', [0, 0, 0])

    w.int('PaletteMax', 2)

    w.compound('Palette', () => {
      w.int(airId, 0)
      w.int(blockId, 1)
    })

    w.byteArray('BlockData', blockDataArr)

    w.emptyList('BlockEntities')
    w.emptyList('Entities')
  })

  return gzip(w.bytes())
}

export function downloadBlob(data: Uint8Array, filename: string) {
  const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
