// Schematic format conversion powered by the `nucleation` WASM library.
// Loads the WASM once, parses any supported input format, and re-exports to another.

let initPromise: Promise<unknown> | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SchematicWrapperCtor: any = null

async function ensureWasm() {
  if (!initPromise) {
    initPromise = (async () => {
      const mod = await import('nucleation')
      // Default export is the async init() that instantiates the WASM.
      await (mod as unknown as { default: () => Promise<unknown> }).default()
      SchematicWrapperCtor = (mod as unknown as { SchematicWrapper: unknown }).SchematicWrapper
    })()
  }
  await initPromise
  return SchematicWrapperCtor
}

export interface InputFormat {
  id: string
  label: string
  method: string         // SchematicWrapper.from_* method
  exts: string[]
}

export interface OutputFormat {
  id: string
  label: string
  method: string         // SchematicWrapper.to_* method
  ext: string
}

export const INPUT_FORMATS: InputFormat[] = [
  { id: 'litematic',   label: 'Litematica (.litematic)',        method: 'from_litematic',   exts: ['litematic'] },
  { id: 'schematic',   label: 'Sponge / WorldEdit (.schem)',    method: 'from_schematic',   exts: ['schem', 'schematic'] },
  { id: 'mcstructure', label: 'Bedrock Structure (.mcstructure)', method: 'from_mcstructure', exts: ['mcstructure'] },
  { id: 'world_zip',   label: 'World region (.zip)',            method: 'from_world_zip',   exts: ['zip'] },
]

export const OUTPUT_FORMATS: OutputFormat[] = [
  { id: 'schematic',   label: 'Sponge / WorldEdit (.schem)',      method: 'to_schematic',   ext: 'schem' },
  { id: 'litematic',   label: 'Litematica (.litematic)',          method: 'to_litematic',   ext: 'litematic' },
  { id: 'mcstructure', label: 'Bedrock Structure (.mcstructure)', method: 'to_mcstructure', ext: 'mcstructure' },
  { id: 'world_zip',   label: 'World region (.zip)',              method: 'to_world_zip',   ext: 'zip' },
]

export interface ParsedSchematic {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wrapper: any
  dimensions: [number, number, number]
  blockCount: number
  detectedFormat: string | null   // input format id, or null if auto-detected
}

function extOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

/**
 * Parse a schematic file into a nucleation wrapper, trying the extension-matched
 * importer first and then a generic auto-detect (`from_data`). Each attempt uses a
 * fresh wrapper so a failed parse can't leave a half-populated one behind.
 */
export async function parseSchematic(bytes: Uint8Array, fileName: string): Promise<ParsedSchematic> {
  const SW = await ensureWasm()
  const ext = extOf(fileName)

  // Build the attempt order: extension match → auto-detect → every other importer.
  const matched = INPUT_FORMATS.find(f => f.exts.includes(ext))
  const order: { method: string; id: string | null }[] = []
  if (matched) order.push({ method: matched.method, id: matched.id })
  order.push({ method: 'from_data', id: null })
  for (const f of INPUT_FORMATS) {
    if (!order.some(o => o.method === f.method)) order.push({ method: f.method, id: f.id })
  }

  let lastErr: unknown = null
  for (const attempt of order) {
    try {
      const wrapper = new SW()
      if (typeof wrapper[attempt.method] !== 'function') continue
      wrapper[attempt.method](bytes)
      const dims = wrapper.get_dimensions?.() ?? [0, 0, 0]
      const dimensions: [number, number, number] = [dims[0] ?? 0, dims[1] ?? 0, dims[2] ?? 0]
      const blockCount = wrapper.get_block_count?.() ?? 0
      // Reject empty/garbage parses so we keep trying other importers.
      if (dimensions[0] <= 0 && dimensions[1] <= 0 && dimensions[2] <= 0 && blockCount <= 0) {
        continue
      }
      return { wrapper, dimensions, blockCount, detectedFormat: attempt.id }
    } catch (e) {
      lastErr = e
    }
  }
  throw new Error(
    lastErr instanceof Error
      ? `Could not parse schematic: ${lastErr.message}`
      : 'Could not parse this file as a supported schematic format.',
  )
}

/** Export a parsed schematic to the chosen output format, returning the bytes. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function exportSchematic(wrapper: any, output: OutputFormat): Uint8Array {
  const fn = wrapper[output.method]
  if (typeof fn !== 'function') throw new Error(`This build can't export to ${output.label}`)
  const out = output.method === 'to_world_zip' ? wrapper[output.method](null) : wrapper[output.method]()
  if (!(out instanceof Uint8Array)) throw new Error('Conversion produced no data')
  return out
}
