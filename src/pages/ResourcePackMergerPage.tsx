import { useState, useCallback, useRef } from 'react'
import JSZip from 'jszip'
import {
  Upload, X, Download, AlertTriangle, ChevronDown, ChevronRight,
  FileText, FileImage, File, GripVertical, Check, ArrowUp, ArrowDown,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PackFile {
  path: string
  data: Uint8Array | string   // string for text files
  isText: boolean
}

interface LoadedPack {
  id: string
  name: string       // filename without .zip
  files: Map<string, PackFile>
  color: string
}

interface Conflict {
  path: string
  packIndices: number[]        // which packs have this file
  resolution: 'first' | 'last' | 'pack' | 'manual'
  winnerPackIdx: number        // for 'pack' resolution
  manualContent: string        // for 'manual' resolution (text only)
  expanded: boolean
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PACK_COLORS = [
  'rgb(99 102 241)',  // indigo
  'rgb(234 88 12)',   // orange
  'rgb(16 185 129)',  // emerald
  'rgb(217 70 239)',  // fuchsia
  'rgb(245 158 11)',  // amber
  'rgb(59 130 246)',  // blue
]

const TEXT_EXTENSIONS = new Set([
  'json', 'mcmeta', 'txt', 'lang', 'fsh', 'vsh', 'glsl', 'properties', 'yml', 'yaml', 'toml',
])

function isTextFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return TEXT_EXTENSIONS.has(ext)
}

function fileIcon(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'tga'].includes(ext)) return <FileImage className="w-3.5 h-3.5" />
  if (TEXT_EXTENSIONS.has(ext)) return <FileText className="w-3.5 h-3.5" />
  return <File className="w-3.5 h-3.5" />
}

// ── Load a zip into a LoadedPack ───────────────────────────────────────────────

async function loadZip(file: File, id: string, color: string): Promise<LoadedPack> {
  const zip = await JSZip.loadAsync(file)
  const files = new Map<string, PackFile>()

  await Promise.all(
    Object.entries(zip.files).map(async ([path, entry]) => {
      if (entry.dir) return
      const text = isTextFile(path)
      if (text) {
        const content = await entry.async('string')
        files.set(path, { path, data: content, isText: true })
      } else {
        const content = await entry.async('uint8array')
        files.set(path, { path, data: content, isText: false })
      }
    })
  )

  const name = file.name.replace(/\.zip$/i, '')
  return { id, name, files, color }
}

// ── Merge packs given conflict resolutions ─────────────────────────────────────

async function buildMergedZip(
  packs: LoadedPack[],
  conflicts: Conflict[],
  packName: string,
  packDesc: string,
  packFormat: number,
): Promise<Blob> {
  const zip = new JSZip()
  const conflictMap = new Map<string, Conflict>(conflicts.map(c => [c.path, c]))

  // Collect all unique paths across packs
  const allPaths = new Set<string>()
  for (const pack of packs) {
    for (const path of pack.files.keys()) allPaths.add(path)
  }

  for (const path of allPaths) {
    if (path === 'pack.mcmeta') continue  // we'll write our own

    const conflict = conflictMap.get(path)

    if (!conflict) {
      // No conflict — only one pack has this file
      const ownerPack = packs.find(p => p.files.has(path))!
      const f = ownerPack.files.get(path)!
      zip.file(path, f.data)
    } else {
      // Resolve conflict
      let chosen: PackFile | null = null
      if (conflict.resolution === 'manual') {
        const f = packs[conflict.packIndices[0]].files.get(path)!
        chosen = { ...f, data: conflict.manualContent, isText: true }
      } else if (conflict.resolution === 'first') {
        chosen = packs[conflict.packIndices[0]].files.get(path)!
      } else if (conflict.resolution === 'last') {
        const lastIdx = conflict.packIndices[conflict.packIndices.length - 1]
        chosen = packs[lastIdx].files.get(path)!
      } else {
        // 'pack' — specific pack index chosen
        chosen = packs[conflict.winnerPackIdx].files.get(path)!
      }
      if (chosen) zip.file(path, chosen.data)
    }
  }

  // Write pack.mcmeta
  zip.file('pack.mcmeta', JSON.stringify({
    pack: { pack_format: packFormat, description: packDesc }
  }, null, 2))

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

// ── Drag-reorder helper ────────────────────────────────────────────────────────

function useDragOrder<T>(items: T[], setItems: (v: T[]) => void) {
  const dragIdx = useRef<number | null>(null)

  const onDragStart = (i: number) => { dragIdx.current = i }
  const onDrop = (i: number) => {
    if (dragIdx.current === null || dragIdx.current === i) return
    const next = [...items]
    const [moved] = next.splice(dragIdx.current, 1)
    next.splice(i, 0, moved)
    setItems(next)
    dragIdx.current = null
  }
  const onDragOver = (e: React.DragEvent) => e.preventDefault()

  return { onDragStart, onDrop, onDragOver }
}

// ── Pack Format options ────────────────────────────────────────────────────────

const PACK_FORMATS = [
  { value: 46, label: '46 — 1.21.4' },
  { value: 42, label: '42 — 1.21.2–1.21.3' },
  { value: 34, label: '34 — 1.21–1.21.1' },
  { value: 32, label: '32 — 1.20.5–1.20.6' },
  { value: 22, label: '22 — 1.20.3–1.20.4' },
  { value: 18, label: '18 — 1.20–1.20.1' },
  { value: 15, label: '15 — 1.19.4' },
  { value: 13, label: '13 — 1.19.3' },
  { value: 12, label: '12 — 1.19–1.19.2' },
  { value: 9,  label: '9 — 1.18–1.18.2' },
  { value: 8,  label: '8 — 1.18 (pre)' },
  { value: 7,  label: '7 — 1.17–1.17.1' },
  { value: 6,  label: '6 — 1.16.2–1.16.5' },
]

// ── Main component ─────────────────────────────────────────────────────────────

export default function ResourcePackMergerPage() {
  const [packs, setPacks] = useState<LoadedPack[]>([])
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [packName, setPackName] = useState('merged-pack')
  const [packDesc, setPackDesc] = useState('Merged resource pack')
  const [packFormat, setPackFormat] = useState(46)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [defaultResolution, setDefaultResolution] = useState<'first' | 'last'>('first')
  const nextId = useRef(0)

  const drag = useDragOrder(packs, (newPacks) => {
    setPacks(newPacks)
    recomputeConflicts(newPacks)
  })

  // ── Conflict detection ────────────────────────────────────────────────────────

  function recomputeConflicts(ps: LoadedPack[], defRes: 'first' | 'last' = defaultResolution) {
    const pathMap = new Map<string, number[]>()
    ps.forEach((pack, i) => {
      for (const path of pack.files.keys()) {
        if (path === 'pack.mcmeta') continue
        if (!pathMap.has(path)) pathMap.set(path, [])
        pathMap.get(path)!.push(i)
      }
    })

    const newConflicts: Conflict[] = []
    for (const [path, indices] of pathMap) {
      if (indices.length < 2) continue
      // Preserve existing resolutions if the path already has one
      const existing = conflicts.find(c => c.path === path)
      newConflicts.push(existing && existing.packIndices.join(',') === indices.join(',') ? existing : {
        path,
        packIndices: indices,
        resolution: defRes,
        winnerPackIdx: defRes === 'first' ? indices[0] : indices[indices.length - 1],
        manualContent: '',
        expanded: false,
      })
    }
    newConflicts.sort((a, b) => a.path.localeCompare(b.path))
    setConflicts(newConflicts)
  }

  // ── Drop zone ─────────────────────────────────────────────────────────────────

  const [dragOver, setDragOver] = useState(false)

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    setError(null)
    setLoading(true)
    const arr = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.zip'))
    if (!arr.length) { setLoading(false); setError('Only .zip files are supported.'); return }

    try {
      const loaded = await Promise.all(
        arr.map(f => loadZip(f, String(nextId.current++), PACK_COLORS[packs.length % PACK_COLORS.length]))
      )
      const newPacks = [...packs, ...loaded]
      setPacks(newPacks)
      recomputeConflicts(newPacks)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to read zip')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packs, defaultResolution])

  function removePack(id: string) {
    const next = packs.filter(p => p.id !== id)
    setPacks(next)
    recomputeConflicts(next)
  }

  function movePack(id: string, dir: -1 | 1) {
    const i = packs.findIndex(p => p.id === id)
    if (i < 0) return
    const next = [...packs]
    const j = i + dir
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]]
    setPacks(next)
    recomputeConflicts(next)
  }

  // ── Conflict helpers ──────────────────────────────────────────────────────────

  function updateConflict(path: string, patch: Partial<Conflict>) {
    setConflicts(cs => cs.map(c => c.path === path ? { ...c, ...patch } : c))
  }

  function applyDefaultToAll(res: 'first' | 'last') {
    setDefaultResolution(res)
    setConflicts(cs => cs.map(c => ({
      ...c,
      resolution: res,
      winnerPackIdx: res === 'first' ? c.packIndices[0] : c.packIndices[c.packIndices.length - 1],
    })))
  }

  // Open the text for manual editing, pre-populating from winner
  function openManual(conflict: Conflict) {
    const winner = conflict.resolution === 'last'
      ? packs[conflict.packIndices[conflict.packIndices.length - 1]]
      : packs[conflict.packIndices[0]]
    const file = winner.files.get(conflict.path)
    const content = typeof file?.data === 'string' ? file.data : ''
    updateConflict(conflict.path, { resolution: 'manual', manualContent: content, expanded: true })
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  async function handleExport() {
    if (packs.length < 2) return
    setExporting(true)
    try {
      const blob = await buildMergedZip(packs, conflicts, packName, packDesc, packFormat)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${packName || 'merged-pack'}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────────

  const totalUnique = (() => {
    const s = new Set<string>()
    packs.forEach(p => p.files.forEach((_, k) => s.add(k)))
    return s.size
  })()

  const unresolvedCount = conflicts.filter(c =>
    c.resolution === 'manual' && c.manualContent === ''
  ).length

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="section container">
      {/* Header */}
      <div className="mb-10">
        <span className="badge-muted">Tool</span>
        <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>Resource Pack Merger</h1>
        <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
          Combine multiple resource packs into one. Drag to reorder priority, then resolve any file conflicts.
        </p>
      </div>

      <div className="flex flex-col xl:flex-row gap-6">

        {/* ── LEFT: packs + conflicts ── */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault(); setDragOver(false)
              handleFiles(e.dataTransfer.files)
            }}
            onClick={() => document.getElementById('rp-file-input')?.click()}
            className="rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 cursor-pointer transition-all py-10"
            style={{
              borderColor: dragOver ? 'rgb(var(--accent))' : 'rgb(var(--border))',
              background: dragOver ? 'rgb(var(--accent) / 0.04)' : 'transparent',
            }}
          >
            <Upload className="w-8 h-8" style={{ color: dragOver ? 'rgb(var(--accent))' : 'rgb(var(--muted))' }} />
            <div className="text-center">
              <p className="text-sm font-medium" style={{ color: 'rgb(var(--text))' }}>
                {loading ? 'Loading…' : 'Drop resource pack .zip files here'}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'rgb(var(--muted))' }}>or click to browse</p>
            </div>
            <input
              id="rp-file-input"
              type="file"
              accept=".zip"
              multiple
              className="hidden"
              onChange={e => { if (e.target.files) handleFiles(e.target.files) }}
            />
          </div>

          {error && (
            <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2"
              style={{ background: 'rgb(220 38 38 / 0.1)', border: '1px solid rgb(220 38 38 / 0.2)', color: 'rgb(220 38 38)' }}>
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Loaded packs list */}
          {packs.length > 0 && (
            <div className="card space-y-2">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold" style={{ color: 'rgb(var(--text))' }}>
                  Packs
                  <span className="ml-1.5 text-xs font-normal" style={{ color: 'rgb(var(--muted))' }}>
                    {packs.length} · {totalUnique} unique files
                  </span>
                </h3>
                <p className="text-xs" style={{ color: 'rgb(var(--muted))' }}>
                  Top = highest priority
                </p>
              </div>

              {packs.map((pack, i) => (
                <div
                  key={pack.id}
                  draggable
                  onDragStart={() => drag.onDragStart(i)}
                  onDrop={() => drag.onDrop(i)}
                  onDragOver={drag.onDragOver}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 group transition-colors"
                  style={{ border: '1px solid rgb(var(--border))', cursor: 'grab' }}
                >
                  <GripVertical className="w-4 h-4 shrink-0" style={{ color: 'rgb(var(--muted))' }} />
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: pack.color }}
                  />
                  <span className="flex-1 text-sm font-medium truncate" style={{ color: 'rgb(var(--text))' }}>
                    {pack.name}
                  </span>
                  <span className="text-xs" style={{ color: 'rgb(var(--muted))' }}>
                    {pack.files.size} files
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => movePack(pack.id, -1)}
                      disabled={i === 0}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 disabled:opacity-0 transition-opacity"
                      style={{ color: 'rgb(var(--muted))' }}
                      title="Move up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => movePack(pack.id, 1)}
                      disabled={i === packs.length - 1}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 disabled:opacity-0 transition-opacity"
                      style={{ color: 'rgb(var(--muted))' }}
                      title="Move down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => removePack(pack.id)}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: 'rgb(var(--muted))' }}
                      title="Remove"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Conflicts */}
          {conflicts.length > 0 && (
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'rgb(var(--text))' }}>
                  <AlertTriangle className="w-4 h-4" style={{ color: 'rgb(245 158 11)' }} />
                  Conflicts
                  <span className="text-xs font-normal" style={{ color: 'rgb(var(--muted))' }}>
                    {conflicts.length} file{conflicts.length !== 1 ? 's' : ''}
                  </span>
                </h3>
                <div className="flex items-center gap-2 text-xs">
                  <span style={{ color: 'rgb(var(--muted))' }}>Default:</span>
                  {(['first', 'last'] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => applyDefaultToAll(r)}
                      className="px-2 py-1 rounded-lg font-medium capitalize transition-all"
                      style={{
                        border: `1px solid ${defaultResolution === r ? 'rgb(var(--accent))' : 'rgb(var(--border))'}`,
                        background: defaultResolution === r ? 'rgb(var(--accent) / 0.1)' : 'transparent',
                        color: defaultResolution === r ? 'rgb(var(--accent))' : 'rgb(var(--muted))',
                      }}
                    >
                      {r === 'first' ? 'First wins' : 'Last wins'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5 max-h-[32rem] overflow-y-auto pr-1">
                {conflicts.map(conflict => (
                  <ConflictRow
                    key={conflict.path}
                    conflict={conflict}
                    packs={packs}
                    onUpdate={patch => updateConflict(conflict.path, patch)}
                    onOpenManual={() => openManual(conflict)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: settings + export ── */}
        <div className="flex flex-col gap-4" style={{ width: 240, flexShrink: 0 }}>

          {/* Pack settings */}
          <div className="card space-y-3">
            <h3 className="text-sm font-semibold" style={{ color: 'rgb(var(--text))' }}>Output Pack</h3>
            <div>
              <label className="form-label">Name</label>
              <input className="form-input text-sm" value={packName} onChange={e => setPackName(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Description</label>
              <input className="form-input text-sm" value={packDesc} onChange={e => setPackDesc(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Format</label>
              <select className="form-input text-sm" value={packFormat} onChange={e => setPackFormat(Number(e.target.value))}>
                {PACK_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          </div>

          {/* Summary */}
          {packs.length > 0 && (
            <div className="card space-y-2 text-sm">
              <div className="flex justify-between">
                <span style={{ color: 'rgb(var(--muted))' }}>Packs</span>
                <span style={{ color: 'rgb(var(--text))' }}>{packs.length}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'rgb(var(--muted))' }}>Unique files</span>
                <span style={{ color: 'rgb(var(--text))' }}>{totalUnique}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'rgb(var(--muted))' }}>Conflicts</span>
                <span style={{ color: conflicts.length > 0 ? 'rgb(245 158 11)' : 'rgb(var(--text))' }}>
                  {conflicts.length}
                </span>
              </div>
              {unresolvedCount > 0 && (
                <div className="flex justify-between">
                  <span style={{ color: 'rgb(var(--muted))' }}>Unresolved</span>
                  <span style={{ color: 'rgb(220 38 38)' }}>{unresolvedCount}</span>
                </div>
              )}
            </div>
          )}

          {/* Export */}
          <button
            onClick={handleExport}
            disabled={packs.length < 2 || exporting || unresolvedCount > 0}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
            style={{ backgroundColor: 'rgb(var(--accent))', color: 'rgb(var(--accent-fg, #fff))' }}
            title={
              packs.length < 2 ? 'Add at least 2 packs' :
              unresolvedCount > 0 ? 'Resolve all manual conflicts first' : undefined
            }
          >
            <Download className="w-4 h-4" />
            {exporting ? 'Exporting…' : 'Export Merged .zip'}
          </button>

          {packs.length < 2 && (
            <p className="text-xs text-center" style={{ color: 'rgb(var(--muted))' }}>
              Add at least 2 resource packs to merge.
            </p>
          )}
        </div>

      </div>
    </div>
  )
}

// ── ConflictRow ────────────────────────────────────────────────────────────────

function ConflictRow({
  conflict,
  packs,
  onUpdate,
  onOpenManual,
}: {
  conflict: Conflict
  packs: LoadedPack[]
  onUpdate: (patch: Partial<Conflict>) => void
  onOpenManual: () => void
}) {
  const isText = isTextFile(conflict.path)
  const { path, packIndices, winnerPackIdx, expanded, manualContent } = conflict
  const resolution = conflict.resolution
  const isManual = resolution === 'manual'

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgb(var(--border))' }}>
      {/* Header row */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
        style={{ background: 'rgb(var(--bg) / 0.4)' }}
        onClick={() => onUpdate({ expanded: !expanded })}
      >
        <span style={{ color: 'rgb(var(--muted))', flexShrink: 0 }}>
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
        <span style={{ color: 'rgb(var(--muted))', flexShrink: 0 }}>{fileIcon(path)}</span>
        <span className="text-xs font-mono flex-1 truncate" style={{ color: 'rgb(var(--text))' }} title={path}>
          {path}
        </span>
        {/* Colored dots for which packs conflict */}
        <div className="flex gap-0.5 shrink-0">
          {packIndices.map(i => (
            <div key={i} className="w-2 h-2 rounded-full" style={{ background: packs[i]?.color }} title={packs[i]?.name} />
          ))}
        </div>
        {/* Current resolution badge */}
        <span
          className="text-xs px-1.5 py-0.5 rounded-md font-medium shrink-0"
          style={{
            background: resolution === 'manual'
              ? 'rgb(99 102 241 / 0.15)'
              : 'rgb(var(--accent) / 0.1)',
            color: resolution === 'manual'
              ? 'rgb(99 102 241)'
              : 'rgb(var(--accent))',
          }}
        >
          {resolution === 'manual' ? 'manual' : resolution === 'pack' ? packs[winnerPackIdx]?.name : resolution}
        </span>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="px-3 pb-3 pt-2 space-y-3" style={{ borderTop: '1px solid rgb(var(--border))' }}>

          {/* Resolution choice buttons */}
          <div className="flex flex-wrap gap-1.5">
            {/* First / Last */}
            {(['first', 'last'] as const).map(r => (
              <button
                key={r}
                onClick={() => onUpdate({ resolution: r, winnerPackIdx: r === 'first' ? packIndices[0] : packIndices[packIndices.length - 1] })}
                className="px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-all"
                style={{
                  border: `1px solid ${resolution === r ? 'rgb(var(--accent))' : 'rgb(var(--border))'}`,
                  background: resolution === r ? 'rgb(var(--accent) / 0.1)' : 'transparent',
                  color: resolution === r ? 'rgb(var(--accent))' : 'rgb(var(--muted))',
                }}
              >
                {r === 'first' ? 'First wins' : 'Last wins'}
              </button>
            ))}

            {/* Per-pack buttons */}
            {packIndices.map(pi => (
              <button
                key={pi}
                onClick={() => onUpdate({ resolution: 'pack', winnerPackIdx: pi })}
                className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
                style={{
                  border: `1px solid ${resolution === 'pack' && winnerPackIdx === pi ? packs[pi]?.color : 'rgb(var(--border))'}`,
                  background: resolution === 'pack' && winnerPackIdx === pi ? `${packs[pi]?.color}22` : 'transparent',
                  color: resolution === 'pack' && winnerPackIdx === pi ? packs[pi]?.color : 'rgb(var(--muted))',
                }}
              >
                <div className="w-2 h-2 rounded-full" style={{ background: packs[pi]?.color }} />
                {packs[pi]?.name}
              </button>
            ))}

            {/* Manual (text only) */}
            {isText && (
              <button
                onClick={onOpenManual}
                className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                style={{
                  border: `1px solid ${resolution === 'manual' ? 'rgb(99 102 241)' : 'rgb(var(--border))'}`,
                  background: resolution === 'manual' ? 'rgb(99 102 241 / 0.1)' : 'transparent',
                  color: resolution === 'manual' ? 'rgb(99 102 241)' : 'rgb(var(--muted))',
                }}
              >
                Edit manually
              </button>
            )}
          </div>

          {/* Show file contents for comparison */}
          <div className="space-y-2">
            {packIndices.map(pi => {
              const file = packs[pi]?.files.get(path)
              if (!file) return null
              const isWinner =
                (resolution === 'first' && pi === packIndices[0]) ||
                (resolution === 'last' && pi === packIndices[packIndices.length - 1]) ||
                (resolution === 'pack' && pi === winnerPackIdx)

              return (
                <div key={pi}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-2 h-2 rounded-full" style={{ background: packs[pi]?.color }} />
                    <span className="text-xs font-medium" style={{ color: packs[pi]?.color }}>{packs[pi]?.name}</span>
                    {isWinner && !isManual && (
                      <span className="flex items-center gap-0.5 text-xs" style={{ color: 'rgb(16 185 129)' }}>
                        <Check className="w-3 h-3" /> winner
                      </span>
                    )}
                  </div>
                  {file.isText ? (
                    <pre
                      className="text-xs rounded-lg p-2 overflow-x-auto max-h-28 overflow-y-auto"
                      style={{
                        background: 'rgb(var(--bg))',
                        border: `1px solid ${isWinner && !isManual ? packs[pi]?.color : 'rgb(var(--border))'}`,
                        color: 'rgb(var(--muted))',
                        fontFamily: 'monospace',
                        opacity: !isWinner && !isManual ? 0.5 : 1,
                      }}
                    >
                      {String(file.data)}
                    </pre>
                  ) : (
                    <div
                      className="text-xs rounded-lg px-3 py-2"
                      style={{ background: 'rgb(var(--bg))', border: `1px solid ${isWinner && !isManual ? packs[pi]?.color : 'rgb(var(--border))'}`, color: 'rgb(var(--muted))', opacity: !isWinner && !isManual ? 0.5 : 1 }}
                    >
                      {path.match(/\.(png|jpg|jpeg|gif|tga)$/i) ? (
                        <img
                          src={URL.createObjectURL(new Blob([new Uint8Array(file.data as Uint8Array)]))}
                          alt={path}
                          style={{ imageRendering: 'pixelated', maxHeight: 64, maxWidth: 128, objectFit: 'contain' }}
                        />
                      ) : (
                        `Binary file · ${(file.data as Uint8Array).byteLength} bytes`
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Manual editor */}
          {resolution === 'manual' && (
            <div>
              <label className="form-label mb-1">Manual merge — edit the final content:</label>
              <textarea
                className="form-input text-xs font-mono w-full"
                rows={10}
                value={manualContent}
                onChange={e => onUpdate({ manualContent: e.target.value })}
                spellCheck={false}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
