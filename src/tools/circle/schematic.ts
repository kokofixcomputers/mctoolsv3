import { NbtWriter, varint, gzip } from './nbtWriter'

// Sponge Schematic Version 3
// https://github.com/SpongePowered/Schematic-Specification/blob/master/versions/schematic-3.md
//
// Root NBT layout:
//   TAG_Compound("") {
//     TAG_Compound("Schematic") {
//       Version = 3
//       DataVersion
//       Metadata { ... }
//       Width / Height / Length
//       Offset
//       Blocks {          <-- Block Container (new in v3)
//         Palette { blockstate → index }
//         Data    varint[]
//         BlockEntities []
//       }
//       Entities []
//     }
//   }

// Minecraft Java data versions (needed by importing tools)
const DATA_VERSIONS: Record<string, number> = {
  '1.21.1':  3953,
  '1.21.4':  4189,
  '1.21.5':  4325,
}
function dataVersion(mcVersion?: string): number {
  return (mcVersion ? DATA_VERSIONS[mcVersion] : undefined) ?? 3953
}

export interface SchematicOptions {
  grid: boolean[]     // flat row-major (z outer, x inner) boolean array
  width: number       // X
  height: number      // Y (always 1 for flat circle)
  length: number      // Z
  blockId: string     // e.g. "minecraft:stone"
  name?: string
  mcVersion?: string  // e.g. "1.21.5"
}

export async function buildSchematic(opts: SchematicOptions): Promise<Uint8Array> {
  const { grid, width, height, length, blockId, name = 'Circle', mcVersion } = opts

  const airId = 'minecraft:air'

  // Encode block data as varint[] in index order: x + z * Width + y * Width * Length
  const blockDataArr: number[] = []
  for (let y = 0; y < height; y++) {
    for (let z = 0; z < length; z++) {
      for (let x = 0; x < width; x++) {
        const paletteIdx = grid[z * width + x] ? 1 : 0
        blockDataArr.push(...varint(paletteIdx))
      }
    }
  }

  const now = Date.now()
  const dateHi = Math.floor(now / 0x100000000)
  const dateLo = now >>> 0

  const w = new NbtWriter()

  // Root unnamed compound — required by NBT file format and the spec
  w.compound('', () => {
    w.compound('Schematic', () => {
      w.int('Version', 3)
      w.int('DataVersion', dataVersion(mcVersion))

      w.compound('Metadata', () => {
        w.string('Name', name)
        w.string('Author', 'MCTools')
        w.long('Date', dateHi, dateLo)
        w.emptyList('RequiredMods', 8) // TAG_String list
      })

      w.short('Width',  width)
      w.short('Height', height)
      w.short('Length', length)
      w.intArray('Offset', [0, 0, 0])

      // Block Container (v3: Palette + Data + BlockEntities nested here)
      w.compound('Blocks', () => {
        w.compound('Palette', () => {
          w.int(airId,  0)
          w.int(blockId, 1)
        })
        w.byteArray('Data', blockDataArr)
        w.emptyList('BlockEntities') // TAG_Compound list
      })

      w.emptyList('Entities') // TAG_Compound list, at Schematic root per spec
    })
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
