import { useState, useRef, useCallback } from 'react'
import {
  Upload, Download, ArrowRight, FileBox, Loader2, AlertTriangle, X, RefreshCw,
} from 'lucide-react'
import {
  parseSchematic, exportSchematic, INPUT_FORMATS, OUTPUT_FORMATS,
  type ParsedSchematic, type OutputFormat,
} from '../tools/schematic/convert'

const ACCEPT = INPUT_FORMATS.flatMap(f => f.exts.map(e => `.${e}`))

function formatLabel(id: string | null): string {
  if (!id) return 'Auto-detected'
  return INPUT_FORMATS.find(f => f.id === id)?.label ?? id
}

function triggerDownload(bytes: Uint8Array, name: string) {
  const ab = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(ab).set(bytes)
  const url = URL.createObjectURL(new Blob([ab], { type: 'application/octet-stream' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export default function SchematicConverterPage() {
  const [parsed, setParsed] = useState<ParsedSchematic | null>(null)
  const [fileName, setFileName] = useState('')
  const [outputId, setOutputId] = useState<string>(OUTPUT_FORMATS[0].id)
  const [parsing, setParsing] = useState(false)
  const [converting, setConverting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const baseName = fileName.replace(/\.[^.]+$/, '') || 'converted'

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    setParsing(true)
    setParsed(null)
    setFileName(file.name)
    try {
      const buf = await file.arrayBuffer()
      const result = await parseSchematic(new Uint8Array(buf), file.name)
      setParsed(result)
      // Default the output to something different from the detected input.
      const inExt = file.name.split('.').pop()?.toLowerCase()
      const firstDifferent = OUTPUT_FORMATS.find(f => f.ext !== inExt) ?? OUTPUT_FORMATS[0]
      setOutputId(firstDifferent.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse schematic')
    } finally {
      setParsing(false)
    }
  }, [])

  const handleConvert = useCallback(async () => {
    if (!parsed) return
    const output = OUTPUT_FORMATS.find(f => f.id === outputId)
    if (!output) return
    setConverting(true)
    setError(null)
    try {
      const bytes = exportSchematic(parsed.wrapper, output)
      triggerDownload(bytes, `${baseName}.${output.ext}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Conversion failed')
    } finally {
      setConverting(false)
    }
  }, [parsed, outputId, baseName])

  function reset() {
    setParsed(null)
    setFileName('')
    setError(null)
  }

  const output = OUTPUT_FORMATS.find(f => f.id === outputId) as OutputFormat

  return (
    <div className="section container">
      {/* Header */}
      <div className="mb-8">
        <span className="badge-muted">Tool</span>
        <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>Schematic Converter</h1>
        <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
          Convert between Litematica, Sponge/WorldEdit, Bedrock structure, and world-region formats.
        </p>
      </div>

      <div className="max-w-2xl space-y-5">
        {/* Drop zone / file */}
        {!parsed && (
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={async e => {
              e.preventDefault(); setDragOver(false)
              const f = e.dataTransfer.files?.[0]
              if (f) await handleFile(f)
            }}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 cursor-pointer transition-all py-14"
            style={{
              borderColor: dragOver ? 'rgb(var(--accent))' : 'rgb(var(--border))',
              background: dragOver ? 'rgb(var(--accent) / 0.04)' : 'transparent',
            }}
          >
            {parsing ? (
              <>
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'rgb(var(--accent))' }} />
                <p className="text-sm" style={{ color: 'rgb(var(--muted))' }}>Parsing {fileName}…</p>
              </>
            ) : (
              <>
                <Upload className="w-8 h-8" style={{ color: dragOver ? 'rgb(var(--accent))' : 'rgb(var(--muted))' }} />
                <div className="text-center">
                  <p className="text-sm font-medium" style={{ color: 'rgb(var(--text))' }}>
                    Drop a schematic file here
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgb(var(--muted))' }}>
                    or click to browse · {ACCEPT.join(', ')}
                  </p>
                </div>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT.join(',')}
              className="hidden"
              onChange={async e => { const f = e.target.files?.[0]; if (f) await handleFile(f); e.target.value = '' }}
            />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl px-4 py-3 text-sm flex items-start gap-2"
            style={{ background: 'rgb(220 38 38 / 0.1)', border: '1px solid rgb(220 38 38 / 0.2)', color: 'rgb(220 38 38)' }}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Parsed info + conversion */}
        {parsed && (
          <>
            <div className="card flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgb(var(--accent) / 0.1)' }}>
                <FileBox className="w-5 h-5" style={{ color: 'rgb(var(--accent))' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate" style={{ color: 'rgb(var(--text))' }} title={fileName}>
                  {fileName}
                </div>
                <div className="text-xs" style={{ color: 'rgb(var(--muted))' }}>
                  {formatLabel(parsed.detectedFormat)} · {parsed.dimensions.join(' × ')} ·{' '}
                  {parsed.blockCount.toLocaleString()} blocks
                </div>
              </div>
              <button onClick={reset} title="Choose another file" style={{ color: 'rgb(var(--muted))' }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Format flow */}
            <div className="card space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="form-label">From</label>
                  <div className="form-input text-sm flex items-center" style={{ color: 'rgb(var(--muted))' }}>
                    {formatLabel(parsed.detectedFormat)}
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 shrink-0 mt-5" style={{ color: 'rgb(var(--accent))' }} />
                <div className="flex-1">
                  <label className="form-label">To</label>
                  <select className="form-input text-sm" value={outputId} onChange={e => setOutputId(e.target.value)}>
                    {OUTPUT_FORMATS.map(f => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleConvert}
                  disabled={converting}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                  style={{ backgroundColor: 'rgb(var(--accent))', color: 'rgb(var(--accent-fg, #fff))' }}
                >
                  {converting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Convert & Download {baseName}.{output.ext}
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                  style={{ border: '1px solid rgb(var(--border))', color: 'rgb(var(--text))' }}
                  title="Convert another file"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPT.join(',')}
                  className="hidden"
                  onChange={async e => { const f = e.target.files?.[0]; if (f) await handleFile(f); e.target.value = '' }}
                />
              </div>
            </div>
          </>
        )}

        {/* Format reference */}
        <div className="card text-sm space-y-2" style={{ color: 'rgb(var(--muted))' }}>
          <p className="font-semibold" style={{ color: 'rgb(var(--text))' }}>Supported formats</p>
          <p><span style={{ color: 'rgb(var(--accent))' }}>Input:</span> {INPUT_FORMATS.map(f => f.label).join(' · ')}</p>
          <p><span style={{ color: 'rgb(var(--accent))' }}>Output:</span> {OUTPUT_FORMATS.map(f => f.label).join(' · ')}</p>
          <p className="text-xs pt-1">
            Conversion runs entirely in your browser — files never leave your device. Block entities and
            entities are preserved where the target format supports them.
          </p>
        </div>
      </div>
    </div>
  )
}
