import { useState, useRef, useCallback, KeyboardEvent } from 'react'
import { ChevronRight, Upload, FileCode, Plus, Trash2, X, Download } from 'lucide-react'
import type { NbtDocument, NbtNode, TagId } from '../tools/nbt/nbtTypes'
import { TAG_LABELS, TAG_COLORS, TAG_NAMES, defaultNode } from '../tools/nbt/nbtTypes'
import { parseNbt } from '../tools/nbt/nbtParser'
import { serializeNbt, serializeNbtGzip } from '../tools/nbt/nbtSerializer'

const TYPE_OPTIONS: TagId[] = [1, 2, 3, 4, 5, 6, 8, 9, 10, 7, 11, 12]

function Badge({ t }: { t: number }) {
  const color = TAG_COLORS[t] ?? '#888'
  return (
    <span style={{
      backgroundColor: color + '33',
      color,
      fontSize: '0.65rem',
      padding: '1px 5px',
      borderRadius: '4px',
      fontFamily: 'monospace',
      flexShrink: 0,
    }}>
      {TAG_LABELS[t]}
    </span>
  )
}

function valueDisplay(node: NbtNode): React.ReactNode {
  switch (node.t) {
    case 1: case 2: case 3: case 5: case 6:
      return <span className="font-mono" style={{ color: 'rgb(var(--text))' }}>{node.v}</span>
    case 4:
      return <span className="font-mono" style={{ color: 'rgb(var(--text))' }}>{node.v.toString()}</span>
    case 8:
      return <span className="font-mono" style={{ color: '#22c55e' }}>"{node.v}"</span>
    case 7:
      return <span className="font-mono" style={{ color: 'rgb(var(--muted))' }}>[{node.v.length} entries]</span>
    case 11:
      return <span className="font-mono" style={{ color: 'rgb(var(--muted))' }}>[{node.v.length} entries]</span>
    case 12:
      return <span className="font-mono" style={{ color: 'rgb(var(--muted))' }}>[{node.v.length} entries]</span>
    case 9:
      return <span className="font-mono" style={{ color: 'rgb(var(--muted))' }}>[{node.v.length} entries · {TAG_NAMES[node.et] ?? '?'}]</span>
    case 10:
      return <span className="font-mono" style={{ color: 'rgb(var(--muted))' }}>{'{' + node.v.length + ' entries}'}</span>
  }
}

function valueToString(node: NbtNode): string {
  switch (node.t) {
    case 1: case 2: case 3: case 5: case 6: return String(node.v)
    case 4: return node.v.toString()
    case 8: return node.v
    default: return ''
  }
}

function parseValue(node: NbtNode, str: string): NbtNode | null {
  switch (node.t) {
    case 1: { const v = parseInt(str); if (isNaN(v)) return null; return { t: 1, v } }
    case 2: { const v = parseInt(str); if (isNaN(v)) return null; return { t: 2, v } }
    case 3: { const v = parseInt(str); if (isNaN(v)) return null; return { t: 3, v } }
    case 4: { try { return { t: 4, v: BigInt(str) } } catch { return null } }
    case 5: { const v = parseFloat(str); if (isNaN(v)) return null; return { t: 5, v } }
    case 6: { const v = parseFloat(str); if (isNaN(v)) return null; return { t: 6, v } }
    case 8: return { t: 8, v: str }
    default: return null
  }
}

function isLeaf(node: NbtNode): boolean {
  return node.t !== 9 && node.t !== 10 && node.t !== 7 && node.t !== 11 && node.t !== 12
}

interface NodeRowProps {
  node: NbtNode
  onChange: (n: NbtNode) => void
  onDelete?: () => void
  keyName?: string
  onRenameKey?: (newKey: string) => void
  depth: number
  indexLabel?: string
}

function AddChildForm({
  node,
  onAdd,
  onCancel,
}: {
  node: NbtNode
  onAdd: (key: string, child: NbtNode) => void
  onCancel: () => void
}) {
  const [tagType, setTagType] = useState<TagId>(
    node.t === 9 && node.v.length > 0 ? node.et : 1
  )
  const [keyInput, setKeyInput] = useState('')
  const [valInput, setValInput] = useState('0')

  const isCompound = node.t === 10
  const isList = node.t === 9
  const isArray = node.t === 7 || node.t === 11 || node.t === 12

  const showTypeSelector = isCompound || (isList && node.v.length === 0)
  const effectiveType: TagId = isList && node.v.length > 0 ? node.et : tagType
  const isContainer = effectiveType === 9 || effectiveType === 10 || effectiveType === 7 || effectiveType === 11 || effectiveType === 12
  const showValueInput = !isContainer

  function getArrayItemType(): TagId {
    if (node.t === 7) return 1
    if (node.t === 11) return 3
    if (node.t === 12) return 4
    return 1
  }

  function submit() {
    let child: NbtNode
    if (isArray) {
      const itemType = getArrayItemType()
      const temp = defaultNode(itemType)
      const parsed = parseValue(temp, valInput)
      if (!parsed) return
      child = parsed
    } else if (isContainer) {
      child = defaultNode(effectiveType)
    } else {
      const temp = defaultNode(effectiveType)
      const parsed = parseValue(temp, valInput)
      if (!parsed) return
      child = parsed
    }
    onAdd(isCompound ? keyInput : '', child)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1 p-1.5 rounded" style={{ backgroundColor: 'rgb(var(--border)/0.2)' }}>
      {showTypeSelector && (
        <select
          className="form-input py-0.5 px-1.5 text-xs"
          value={tagType}
          onChange={e => setTagType(Number(e.target.value) as TagId)}
        >
          {TYPE_OPTIONS.map(t => (
            <option key={t} value={t}>{TAG_NAMES[t]}</option>
          ))}
        </select>
      )}
      {isCompound && (
        <input
          className="form-input py-0.5 px-1.5 text-xs font-mono"
          placeholder="key name"
          value={keyInput}
          onChange={e => setKeyInput(e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }}
          autoFocus
        />
      )}
      {showValueInput && (
        <input
          className="form-input py-0.5 px-1.5 text-xs font-mono"
          placeholder="value"
          value={valInput}
          onChange={e => setValInput(e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }}
          autoFocus={!isCompound}
        />
      )}
      <button className="btn-secondary py-0.5 px-2 text-xs" onClick={submit}>Add</button>
      <button className="btn-ghost py-0.5 px-2 text-xs" onClick={onCancel}><X className="w-3 h-3" /></button>
    </div>
  )
}

function NodeRow({ node, onChange, onDelete, keyName, onRenameKey, depth, indexLabel }: NodeRowProps) {
  const [expanded, setExpanded] = useState(depth < 2)
  const [editingValue, setEditingValue] = useState(false)
  const [editStr, setEditStr] = useState('')
  const [editingKey, setEditingKey] = useState(false)
  const [keyStr, setKeyStr] = useState('')
  const [addingChild, setAddingChild] = useState(false)

  const hasChildren = !isLeaf(node)
  const canAdd = node.t === 10 || node.t === 9 || node.t === 7 || node.t === 11 || node.t === 12

  function confirmDelete() {
    if (!onDelete) return
    if (hasChildren) {
      const count = node.t === 10 ? node.v.length : (node.t === 9 ? node.v.length : (node as { v: unknown[] }).v.length)
      if (!window.confirm(`Delete this ${TAG_NAMES[node.t]} with ${count} children?`)) return
    }
    onDelete()
  }

  function startEditValue() {
    if (!isLeaf(node)) return
    setEditStr(valueToString(node))
    setEditingValue(true)
  }

  function commitValue() {
    const parsed = parseValue(node, editStr)
    if (parsed) onChange(parsed)
    setEditingValue(false)
  }

  function startEditKey() {
    if (keyName === undefined) return
    setKeyStr(keyName)
    setEditingKey(true)
  }

  function commitKey() {
    if (onRenameKey && keyStr.trim()) onRenameKey(keyStr.trim())
    setEditingKey(false)
  }

  function handleAddChild(key: string, child: NbtNode) {
    if (node.t === 10) {
      if (node.v.some(([k]) => k === key)) return
      onChange({ t: 10, v: [...node.v, [key, child]] })
    } else if (node.t === 9) {
      const et = node.v.length > 0 ? node.et : child.t as TagId
      onChange({ t: 9, et, v: [...node.v, child] })
    } else if (node.t === 7) {
      const c = child as { t: 1; v: number }
      onChange({ t: 7, v: [...node.v, c.v] })
    } else if (node.t === 11) {
      const c = child as { t: 3; v: number }
      onChange({ t: 11, v: [...node.v, c.v] })
    } else if (node.t === 12) {
      const c = child as { t: 4; v: bigint }
      onChange({ t: 12, v: [...node.v, c.v] })
    }
    setAddingChild(false)
  }

  function updateChild(i: number, child: NbtNode) {
    if (node.t === 10) {
      const v = [...node.v] as [string, NbtNode][]
      v[i] = [v[i][0], child]
      onChange({ t: 10, v })
    } else if (node.t === 9) {
      const v = [...node.v]
      v[i] = child
      onChange({ t: 9, et: node.et, v })
    } else if (node.t === 7) {
      const nv = [...node.v]
      nv[i] = (child as { t: 1; v: number }).v
      onChange({ t: 7, v: nv })
    } else if (node.t === 11) {
      const nv = [...node.v]
      nv[i] = (child as { t: 3; v: number }).v
      onChange({ t: 11, v: nv })
    } else if (node.t === 12) {
      const nv = [...node.v]
      nv[i] = (child as { t: 4; v: bigint }).v
      onChange({ t: 12, v: nv })
    }
  }

  function renameChild(i: number, newKey: string) {
    if (node.t !== 10) return
    if (node.v.some(([k], idx) => k === newKey && idx !== i)) return
    const v = [...node.v] as [string, NbtNode][]
    v[i] = [newKey, v[i][1]]
    onChange({ t: 10, v })
  }

  function deleteChild(i: number) {
    if (node.t === 10) {
      const v = [...node.v]
      v.splice(i, 1)
      onChange({ t: 10, v })
    } else if (node.t === 9) {
      const v = [...node.v]
      v.splice(i, 1)
      onChange({ t: 9, et: node.et, v })
    } else if (node.t === 7) {
      const v = [...node.v]; v.splice(i, 1); onChange({ t: 7, v })
    } else if (node.t === 11) {
      const v = [...node.v]; v.splice(i, 1); onChange({ t: 11, v })
    } else if (node.t === 12) {
      const v = [...node.v]; v.splice(i, 1); onChange({ t: 12, v })
    }
  }

  // Build children list for rendering
  let children: Array<{ key: string; node: NbtNode; index: number }> = []
  if (node.t === 10) {
    children = node.v.map(([k, n], i) => ({ key: k, node: n, index: i }))
  } else if (node.t === 9) {
    children = node.v.map((n, i) => ({ key: String(i), node: n, index: i }))
  } else if (node.t === 7) {
    children = node.v.map((v, i) => ({ key: String(i), node: { t: 1 as const, v }, index: i }))
  } else if (node.t === 11) {
    children = node.v.map((v, i) => ({ key: String(i), node: { t: 3 as const, v }, index: i }))
  } else if (node.t === 12) {
    children = node.v.map((v, i) => ({ key: String(i), node: { t: 4 as const, v }, index: i }))
  }

  const indentPx = depth * 16 + 8

  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-0.5 rounded group"
        style={{ paddingLeft: `${indentPx}px` }}
      >
        {/* Expand toggle */}
        {hasChildren ? (
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded transition-colors"
            style={{ color: 'rgb(var(--muted))' }}
          >
            <ChevronRight
              className="w-3.5 h-3.5 transition-transform"
              style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
            />
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        {/* Badge */}
        <Badge t={node.t} />

        {/* Key/index label */}
        {indexLabel !== undefined ? (
          <span className="font-mono text-xs" style={{ color: 'rgb(var(--muted))' }}>[{indexLabel}]</span>
        ) : keyName !== undefined ? (
          editingKey ? (
            <input
              className="form-input py-0 px-1 text-xs font-mono w-28"
              value={keyStr}
              onChange={e => setKeyStr(e.target.value)}
              onBlur={commitKey}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') commitKey(); if (e.key === 'Escape') setEditingKey(false) }}
              autoFocus
            />
          ) : (
            <span
              className="font-mono text-xs cursor-pointer hover:underline"
              style={{ color: 'rgb(var(--text))' }}
              onClick={startEditKey}
            >
              {keyName}:
            </span>
          )
        ) : null}

        {/* Value */}
        <span className="text-xs flex-1 min-w-0">
          {isLeaf(node) ? (
            editingValue ? (
              <input
                className="form-input py-0 px-1 text-xs font-mono w-40"
                value={editStr}
                onChange={e => setEditStr(e.target.value)}
                onBlur={commitValue}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') commitValue(); if (e.key === 'Escape') setEditingValue(false) }}
                autoFocus
              />
            ) : (
              <span className="cursor-pointer" onClick={startEditValue}>
                {valueDisplay(node)}
              </span>
            )
          ) : (
            valueDisplay(node)
          )}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 pr-2">
          {canAdd && (
            <button
              onClick={() => { setExpanded(true); setAddingChild(true) }}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-[rgb(var(--border)/0.5)]"
              style={{ color: 'rgb(var(--muted))' }}
              title="Add child"
            >
              <Plus className="w-3 h-3" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={confirmDelete}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-[rgb(var(--border)/0.5)]"
              style={{ color: '#ef4444' }}
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div style={{ borderLeft: '1px solid rgb(var(--border))', marginLeft: `${indentPx + 10}px` }}>
          {children.map(({ key, node: childNode, index }) => (
            <NodeRow
              key={`${key}-${index}`}
              node={childNode}
              onChange={n => updateChild(index, n)}
              onDelete={() => deleteChild(index)}
              keyName={node.t === 10 ? key : undefined}
              onRenameKey={node.t === 10 ? (nk) => renameChild(index, nk) : undefined}
              indexLabel={node.t !== 10 ? key : undefined}
              depth={depth + 1}
            />
          ))}
          {addingChild && (
            <div style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
              <AddChildForm node={node} onAdd={handleAddChild} onCancel={() => setAddingChild(false)} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TreeEditor({ doc, onChange }: { doc: NbtDocument; onChange: (d: NbtDocument) => void }) {
  const [editingName, setEditingName] = useState(false)
  const [nameStr, setNameStr] = useState(doc.name)

  function commitName() {
    onChange({ ...doc, name: nameStr })
    setEditingName(false)
  }

  return (
    <div className="card p-0 overflow-hidden">
      {/* Doc name row */}
      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'rgb(var(--border))' }}>
        <FileCode className="w-4 h-4 flex-shrink-0" style={{ color: '#f97316' }} />
        {editingName ? (
          <input
            className="form-input py-0.5 px-1.5 text-sm font-mono flex-1"
            value={nameStr}
            onChange={e => setNameStr(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditingName(false) }}
            autoFocus
          />
        ) : (
          <span
            className="font-mono text-sm cursor-pointer hover:underline flex-1"
            style={{ color: 'rgb(var(--text))' }}
            onClick={() => { setNameStr(doc.name); setEditingName(true) }}
          >
            {doc.name || '(unnamed)'}
          </span>
        )}
        <span className="text-xs" style={{ color: 'rgb(var(--muted))' }}>root compound</span>
      </div>

      {/* Tree */}
      <div className="py-1">
        <NodeRow
          node={doc.root}
          onChange={root => onChange({ ...doc, root: root as Extract<typeof root, { t: 10 }> })}
          depth={0}
        />
      </div>
    </div>
  )
}

function UploadZone({
  onFile,
  onNew,
  error,
  dragging,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  onFile: (f: File) => void
  onNew: () => void
  error: string | null
  dragging: boolean
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="max-w-xl mx-auto px-4 py-16">
      <div
        className="card flex flex-col items-center justify-center gap-4 py-12 px-8 text-center cursor-pointer transition-colors"
        style={{
          borderStyle: 'dashed',
          borderColor: dragging ? 'rgb(var(--accent))' : 'rgb(var(--border))',
          backgroundColor: dragging ? 'rgb(var(--accent)/0.05)' : undefined,
        }}
        onClick={() => inputRef.current?.click()}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={e => { e.preventDefault(); onDrop(e) }}
      >
        <Upload className="w-10 h-10" style={{ color: 'rgb(var(--muted))' }} />
        <div>
          <p className="font-semibold" style={{ color: 'rgb(var(--text))' }}>Drop an NBT file here</p>
          <p className="text-sm mt-1" style={{ color: 'rgb(var(--muted))' }}>Supports .nbt and gzip-compressed .nbt.gz files</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".nbt,.gz"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }}
        />
      </div>
      {error && (
        <p className="mt-3 text-sm text-center" style={{ color: '#ef4444' }}>{error}</p>
      )}
      <div className="flex justify-center mt-4">
        <button className="btn-secondary" onClick={onNew}>
          <Plus className="w-4 h-4" />
          New empty file
        </button>
      </div>
    </div>
  )
}

export default function NbtPage() {
  const [doc, setDoc] = useState<NbtDocument | null>(null)
  const [fileName, setFileName] = useState('untitled.nbt')
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const handleFile = useCallback(async (file: File) => {
    try {
      const buf = await file.arrayBuffer()
      const data = new Uint8Array(buf)
      const parsed = await parseNbt(data)
      setDoc(parsed)
      setFileName(file.name)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse NBT file')
    }
  }, [])

  function handleNew() {
    setDoc({ name: 'root', root: { t: 10, v: [] } })
    setFileName('untitled.nbt')
    setError(null)
  }

  function downloadRaw() {
    if (!doc) return
    const bytes = serializeNbt(doc)
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = fileName.replace(/\.gz$/, ''); a.click()
    URL.revokeObjectURL(url)
  }

  async function downloadGzip() {
    if (!doc) return
    const bytes = await serializeNbtGzip(doc)
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const name = fileName.endsWith('.gz') ? fileName : fileName + '.gz'
    a.href = url; a.download = name; a.click()
    URL.revokeObjectURL(url)
  }

  if (!doc) {
    return (
      <UploadZone
        onFile={handleFile}
        onNew={handleNew}
        error={error}
        dragging={dragging}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          setDragging(false)
          const file = e.dataTransfer.files[0]
          if (file) handleFile(file)
        }}
      />
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="font-mono text-sm px-2 py-1 rounded" style={{ backgroundColor: 'rgb(var(--border)/0.4)', color: 'rgb(var(--muted))' }}>
          {fileName}
        </span>
        <div className="flex items-center gap-2 ml-auto">
          <button className="btn-secondary flex items-center gap-1.5" onClick={downloadRaw}>
            <Download className="w-3.5 h-3.5" />
            Download .nbt
          </button>
          <button className="btn-secondary flex items-center gap-1.5" onClick={downloadGzip}>
            <Download className="w-3.5 h-3.5" />
            Download .nbt.gz
          </button>
          <button className="btn-ghost flex items-center gap-1.5" onClick={() => setDoc(null)}>
            <X className="w-3.5 h-3.5" />
            Close
          </button>
        </div>
      </div>

      <TreeEditor doc={doc} onChange={setDoc} />
    </div>
  )
}
