import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Grid3x3, RotateCcw, Camera, Download, Upload, Link2,
  Box, Loader2, AlertTriangle, MousePointer2, Move, ZoomIn, Package, X, Check,
} from 'lucide-react'
import * as THREE from 'three'
import { useVersion } from '../contexts/VersionContext'
import { loadVanillaPack } from '../tools/schematic/vanillaPack'

// The schematic-renderer ESM build is lazy-loaded via dynamic import so its
// Three.js + WASM payload only downloads when this page is opened.

// ── Types ────────────────────────────────────────────────────────────────────────

type Status = 'init' | 'ready' | 'loading' | 'error' | 'empty'

interface AxisBounds { min: number; max: number; lo: number; hi: number }

interface SelectedBlock {
  x: number; y: number; z: number
  name: string                       // e.g. "minecraft:oak_stairs"
  full: string                       // e.g. "minecraft:oak_stairs[facing=east,half=bottom]"
  properties: [string, string][]     // [["facing","east"], ...]
  entity: unknown | null             // block-entity NBT, if any
}

const ACCEPTED = ['.schem', '.schematic', '.litematic', '.nbt', '.schematica']

// ── Component ──────────────────────────────────────────────────────────────────────

export default function SchematicViewerPage() {
  const { version } = useVersion()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<any>(null)
  const currentIdRef = useRef<string | null>(null)
  const lastFileRef = useRef<{ name: string; buffer: ArrayBuffer } | null>(null)
  // Holds the latest loadBuffer so pack handlers (defined earlier) can trigger a rebuild.
  const loadBufferRef = useRef<((b: ArrayBuffer, n: string) => Promise<void>) | null>(null)

  const [status, setStatus] = useState<Status>('init')
  const [packReady, setPackReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSchematic, setHasSchematic] = useState(false)
  const [fileName, setFileName] = useState<string>('')
  const [urlInput, setUrlInput] = useState('')
  const [showGrid, setShowGrid] = useState(true)
  const [boundsWireframe, setBoundsWireframe] = useState(true)
  const [cameraMode, setCameraMode] = useState<'perspective' | 'isometric'>('perspective')

  const [bx, setBx] = useState<AxisBounds | null>(null)
  const [by, setBy] = useState<AxisBounds | null>(null)
  const [bz, setBz] = useState<AxisBounds | null>(null)

  const [selBlock, setSelBlock] = useState<SelectedBlock | null>(null)
  const [userPacks, setUserPacks] = useState<{ name: string; enabled: boolean }[]>([])
  const [packBusy, setPackBusy] = useState(false)

  // ── Initialize renderer once ──────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const mod: any = await import('schematic-renderer')
        if (cancelled || !canvasRef.current) return

        const Ctor = mod.SchematicRenderer ?? mod.default?.SchematicRenderer ?? mod.default
        if (typeof Ctor !== 'function') throw new Error('SchematicRenderer export not found')

        const isDark = document.documentElement.classList.contains('dark') ||
          window.matchMedia('(prefers-color-scheme: dark)').matches

        const renderer = new Ctor(
          canvasRef.current,
          {},
          // Vanilla resource pack (Mojang client jar) so blocks resolve to real models/textures.
          { vanilla: () => loadVanillaPack(version.id) },
          {
            backgroundColor: isDark ? 0x0b0b14 : 0x0b0b14,
            showGrid: true,
            showAxes: false,
            enableInteraction: true,
            enableDragAndDrop: true,
            enableProgressBar: false,
            cameraOptions: { position: [20, 20, 20], useTightBounds: true },
            sidebarOptions: { enabled: false },
            callbacks: {
              onResourcePackLoaded: () => {
                if (cancelled) return
                setPackReady(true)
                setStatus(prev => (prev === 'init' ? 'empty' : prev))
                refreshPacks()
              },
              onSchematicLoaded: (id: string) => {
                if (cancelled) return
                currentIdRef.current = id
                setHasSchematic(true)
                setStatus('ready')
                refreshBounds()
                try { renderer.cameraManager?.focusOnSchematics?.() } catch { /* noop */ }
              },
              onInvalidFileType: () => {
                if (cancelled) return
                setError('Unsupported file. Use .schem, .schematic, .litematic, or .nbt')
                setStatus('error')
              },
              onSchematicDropped: () => { if (!cancelled) setStatus('loading') },
            },
          }
        )

        rendererRef.current = renderer

        // Drive readiness ourselves too, in case the callback shape differs across
        // versions — the loader is cached so this doesn't double-download.
        loadVanillaPack(version.id)
          .then(() => { if (!cancelled) { setPackReady(true); setStatus(prev => (prev === 'init' ? 'empty' : prev)) } })
          .catch(e => {
            if (!cancelled) {
              setError(`Could not load Minecraft block textures: ${e instanceof Error ? e.message : 'unknown error'}`)
              // Still let the user view (blocks will be untextured fallbacks)
              setPackReady(true)
              setStatus(prev => (prev === 'init' ? 'empty' : prev))
            }
          })
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to initialize 3D renderer')
          setStatus('error')
        }
      }
    })()

    return () => {
      cancelled = true
      try { rendererRef.current?.dispose?.() } catch { /* noop */ }
      rendererRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Query a block from the loaded schematic ─────────────────────────────────────

  const queryBlock = useCallback((x: number, y: number, z: number): SelectedBlock | null => {
    const renderer = rendererRef.current
    const id = currentIdRef.current
    if (!renderer || !id) return null
    try {
      const wrapper = renderer.schematicManager?.getSchematic?.(id)?.schematicWrapper
      if (!wrapper) return null

      const full: string = wrapper.get_block_string?.(x, y, z) ?? wrapper.get_block?.(x, y, z) ?? ''
      if (!full || full === 'minecraft:air') return null

      // Parse "name[k=v,k2=v2]" — prefer the structured wrapper when available.
      let name = full.replace(/\[.*$/, '')
      let properties: [string, string][] = []
      const bsw = wrapper.get_block_with_properties?.(x, y, z)
      if (bsw) {
        try {
          name = bsw.name?.() ?? name
          const props = bsw.properties?.()
          if (props instanceof Map) properties = [...props.entries()].map(([k, v]) => [String(k), String(v)])
          else if (props && typeof props === 'object') properties = Object.entries(props).map(([k, v]) => [k, String(v)])
        } catch { /* noop */ }
        try { bsw.free?.() } catch { /* noop */ }
      }
      if (properties.length === 0) {
        const m = full.match(/\[(.+)\]$/)
        if (m) properties = m[1].split(',').map(p => { const [k, v] = p.split('='); return [k, v] as [string, string] })
      }

      let entity: unknown | null = null
      try { entity = wrapper.get_block_entity?.(x, y, z) ?? null } catch { /* noop */ }

      return { x, y, z, name, full, properties, entity }
    } catch {
      return null
    }
  }, [])

  // ── Raycast a block from a screen-space click ───────────────────────────────────
  // The library only fires block-level clicks during redstone simulation, so we
  // raycast the schematic's mesh group ourselves and convert the hit to block coords.

  const pointerDownRef = useRef<{ x: number; y: number } | null>(null)

  const pickBlockAt = useCallback((clientX: number, clientY: number) => {
    const renderer = rendererRef.current
    const canvas = canvasRef.current
    const id = currentIdRef.current
    if (!renderer || !canvas || !id) return
    try {
      const scene = renderer.sceneManager?.scene
      const cam = renderer.cameraManager?.activeCamera?.camera
      const obj = renderer.schematicManager?.getSchematic?.(id)
      const group = obj?.group
      if (!scene || !cam || !group) return

      const rect = canvas.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      )
      const ray = new THREE.Raycaster()
      ray.setFromCamera(ndc, cam)
      const hits = ray.intersectObject(group, true).filter(h => h.face)
      if (!hits.length) { setSelBlock(null); return }

      const hit = hits[0]
      // Step half a block along the hit normal into the block, then to local space.
      const nWorld = hit.face!.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
      const inside = hit.point.clone().addScaledVector(nWorld, -0.5)
      const inv = new THREE.Matrix4().copy(group.matrixWorld).invert()
      const local = inside.applyMatrix4(inv)
      const bx = Math.floor(local.x + 1e-4)
      const by = Math.floor(local.y + 1e-4)
      const bz = Math.floor(local.z + 1e-4)
      setSelBlock(queryBlock(bx, by, bz))
    } catch {
      /* noop */
    }
  }, [queryBlock])

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    const down = pointerDownRef.current
    // Ignore clicks that were actually camera drags.
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return
    pickBlockAt(e.clientX, e.clientY)
  }, [pickBlockAt])

  // ── Resource packs ──────────────────────────────────────────────────────────────
  // The base vanilla pack is loaded internally under the name "vanilla"; we hide it
  // and only surface user-added packs.

  const refreshPacks = useCallback(async () => {
    const renderer = rendererRef.current
    if (!renderer?.getResourcePacks) return
    try {
      const list = await renderer.getResourcePacks()
      setUserPacks(
        (list ?? [])
          .filter((p: { name: string }) => p.name && p.name.toLowerCase() !== 'vanilla')
          .map((p: { name: string; enabled: boolean }) => ({ name: p.name, enabled: p.enabled })),
      )
    } catch { /* noop */ }
  }, [])

  // The library's addResourcePack updates the texture atlas but never rebuilds the
  // already-generated schematic meshes (a no-op line in its source), so the change is
  // invisible. We force a rebuild by re-loading the current schematic's buffer, which
  // regenerates the meshes against the new atlas.
  const rebuildSchematic = useCallback(async () => {
    const lf = lastFileRef.current
    if (lf && loadBufferRef.current) await loadBufferRef.current(lf.buffer.slice(0), lf.name)
  }, [])

  const addResourcePack = useCallback(async (file: File) => {
    const renderer = rendererRef.current
    if (!renderer?.addResourcePack) return
    setPackBusy(true)
    setError(null)
    try {
      await renderer.addResourcePack(file)
      await refreshPacks()
      await rebuildSchematic()
    } catch (e) {
      setError(`Failed to load resource pack: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally {
      setPackBusy(false)
    }
  }, [refreshPacks, rebuildSchematic])

  const removeResourcePack = useCallback(async (name: string) => {
    const renderer = rendererRef.current
    if (!renderer?.removeResourcePack) return
    setPackBusy(true)
    try {
      await renderer.removeResourcePack(name)
      await refreshPacks()
      await rebuildSchematic()
    } catch { /* noop */ } finally {
      setPackBusy(false)
    }
  }, [refreshPacks, rebuildSchematic])

  // ── Read dimensions / bounds from the loaded schematic ──────────────────────────

  const refreshBounds = useCallback(() => {
    const renderer = rendererRef.current
    const id = currentIdRef.current
    if (!renderer || !id) return
    try {
      const s = renderer.schematicManager?.getSchematic?.(id)
      const b = s?.bounds
      if (!b) return
      const mk = (lo: number, hi: number): AxisBounds => ({ min: lo, max: hi, lo, hi })
      setBx(mk(b.minX ?? 0, b.maxX ?? 0))
      setBy(mk(b.minY ?? 0, b.maxY ?? 0))
      setBz(mk(b.minZ ?? 0, b.maxZ ?? 0))
    } catch { /* noop */ }
  }, [])

  // ── Loading schematics ──────────────────────────────────────────────────────────

  const removeCurrent = useCallback(() => {
    const renderer = rendererRef.current
    const id = currentIdRef.current
    if (renderer && id) {
      try { renderer.schematicManager?.removeSchematic?.(id) } catch { /* noop */ }
    }
  }, [])

  const loadBuffer = useCallback(async (buffer: ArrayBuffer, name: string) => {
    const renderer = rendererRef.current
    if (!renderer) return
    setStatus('loading')
    setError(null)
    setSelBlock(null)
    removeCurrent()
    lastFileRef.current = { name, buffer: buffer.slice(0) }
    setFileName(name)
    const id = `schematic-${Date.now()}`
    try {
      const mgr = renderer.schematicManager
      // The renderer expects a raw ArrayBuffer (a typed array serializes to a
      // numeric-keyed object and is rejected).
      if (mgr?.loadSchematic) {
        await mgr.loadSchematic(id, buffer)
      } else if (mgr?.loadSchematicFromData) {
        await mgr.loadSchematicFromData(buffer, id)
      } else {
        throw new Error('Renderer has no schematic loading method')
      }
      currentIdRef.current = id
      setHasSchematic(true)
      setStatus('ready')
      refreshBounds()
      try { renderer.cameraManager?.focusOnSchematics?.() } catch { /* noop */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse schematic')
      setStatus('error')
    }
  }, [removeCurrent, refreshBounds])
  loadBufferRef.current = loadBuffer

  const handleFile = useCallback(async (file: File) => {
    const ok = ACCEPTED.some(ext => file.name.toLowerCase().endsWith(ext))
    if (!ok) {
      setError(`Unsupported file. Use ${ACCEPTED.join(', ')}`)
      setStatus('error')
      return
    }
    const buffer = await file.arrayBuffer()
    await loadBuffer(buffer, file.name)
  }, [loadBuffer])

  const handleLoadUrl = useCallback(async () => {
    const url = urlInput.trim()
    if (!url) return
    const renderer = rendererRef.current
    if (!renderer) return
    setStatus('loading')
    setError(null)
    const name = url.split('/').pop()?.split('?')[0] || 'schematic'
    try {
      // Always fetch the bytes ourselves so we keep a buffer for resource-pack rebuilds.
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = await res.arrayBuffer()
      await loadBuffer(buf, name)
    } catch (e) {
      setError(
        e instanceof Error && /fetch|CORS|Failed|HTTP/.test(e.message)
          ? 'Could not fetch that URL (it may block cross-origin requests). Try downloading and uploading the file instead.'
          : e instanceof Error ? e.message : 'Failed to load from URL'
      )
      setStatus('error')
    }
  }, [urlInput, loadBuffer])

  // ── Toolbar actions ──────────────────────────────────────────────────────────────

  function toggleGrid() {
    const renderer = rendererRef.current
    const next = !showGrid
    setShowGrid(next)
    try {
      // Try a few API shapes for grid visibility
      if (renderer?.gridManager?.setVisible) renderer.gridManager.setVisible(next)
      else if (renderer?.setGridVisible) renderer.setGridVisible(next)
      else if (renderer?.sceneManager?.setGridVisible) renderer.sceneManager.setGridVisible(next)
    } catch { /* noop */ }
  }

  function resetCamera() {
    const renderer = rendererRef.current
    try {
      renderer?.cameraManager?.focusOnSchematics?.()
    } catch { /* noop */ }
  }

  async function screenshot() {
    const renderer = rendererRef.current
    if (!renderer) return
    try {
      const base = (fileName || 'schematic').replace(/\.[^.]+$/, '')
      if (renderer.downloadScreenshot) {
        await renderer.downloadScreenshot(base, { format: 'image/png' })
      } else if (renderer.takeScreenshot) {
        const blob: Blob = await renderer.takeScreenshot({ format: 'image/png' })
        triggerDownload(blob, `${base}.png`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Screenshot failed')
    }
  }

  function downloadSchematic() {
    const f = lastFileRef.current
    if (!f) return
    triggerDownload(new Blob([f.buffer]), f.name)
  }

  function toggleCameraMode() {
    const renderer = rendererRef.current
    const next = cameraMode === 'perspective' ? 'isometric' : 'perspective'
    setCameraMode(next)
    try { renderer?.cameraManager?.switchCameraPreset?.(next) } catch { /* noop */ }
  }

  // ── Bounds slicing ────────────────────────────────────────────────────────────────

  function applyBounds(axis: 'x' | 'y' | 'z', lo: number, hi: number) {
    const renderer = rendererRef.current
    const id = currentIdRef.current
    if (!renderer || !id) return
    try {
      const s = renderer.schematicManager?.getSchematic?.(id)
      if (!s?.bounds) return
      if (axis === 'x') { s.bounds.minX = lo; s.bounds.maxX = hi }
      if (axis === 'y') { s.bounds.minY = lo; s.bounds.maxY = hi }
      if (axis === 'z') { s.bounds.minZ = lo; s.bounds.maxZ = hi }
      renderer.invalidate?.()
    } catch { /* noop */ }
  }

  function resetBounds() {
    const renderer = rendererRef.current
    const id = currentIdRef.current
    if (!renderer || !id) return
    try {
      const s = renderer.schematicManager?.getSchematic?.(id)
      s?.bounds?.reset?.()
      renderer.invalidate?.()
    } catch { /* noop */ }
    refreshBounds()
  }

  function toggleBoundsWireframe() {
    const renderer = rendererRef.current
    const next = !boundsWireframe
    setBoundsWireframe(next)
    try {
      if (renderer?.setRenderingBoundsHelper) renderer.setRenderingBoundsHelper(next)
      else if (renderer?.sceneManager?.setRenderingBoundsHelper) renderer.sceneManager.setRenderingBoundsHelper(next)
    } catch { /* noop */ }
  }

  // ── Render ──────────────────────────────────────────────────────────────────────

  const fileInputRef = useRef<HTMLInputElement>(null)
  const packInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="section container">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
        <div>
          <span className="badge-muted">Tool</span>
          <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>Schematic Viewer</h1>
          <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
            View <code className="font-mono">.schem</code>, <code className="font-mono">.litematic</code>, and{' '}
            <code className="font-mono">.nbt</code> structures in 3D. Drag to rotate, scroll to zoom.
          </p>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <ToolbarBtn onClick={toggleGrid} active={showGrid} icon={<Grid3x3 className="w-4 h-4" />} label="Grid" />
          <ToolbarBtn onClick={toggleCameraMode} active={cameraMode === 'isometric'} icon={<Box className="w-4 h-4" />} label={cameraMode === 'isometric' ? 'Iso' : 'Persp'} disabled={!hasSchematic} />
          <ToolbarBtn onClick={resetCamera} icon={<RotateCcw className="w-4 h-4" />} label="Reset" disabled={!hasSchematic} />
          <ToolbarBtn onClick={screenshot} icon={<Camera className="w-4 h-4" />} label="Screenshot" disabled={!hasSchematic} />
          <button
            onClick={downloadSchematic}
            disabled={!lastFileRef.current}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-30"
            style={{ backgroundColor: 'rgb(var(--accent))', color: 'rgb(var(--accent-fg, #fff))' }}
          >
            <Download className="w-4 h-4" /> Download
          </button>
        </div>
      </div>

      {/* Resource pack status bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4 px-3 py-2 rounded-xl"
        style={{ border: '1px solid rgb(var(--border))', background: 'rgb(var(--accent) / 0.03)' }}>
        <Package className="w-4 h-4 shrink-0" style={{ color: 'rgb(var(--accent))' }} />
        {userPacks.length === 0 ? (
          <span className="text-sm" style={{ color: 'rgb(var(--muted))' }}>
            Vanilla textures{packReady ? '' : ' (loading…)'} — no custom resource pack loaded
          </span>
        ) : (
          <>
            <span className="text-sm font-medium" style={{ color: 'rgb(var(--text))' }}>
              Resource pack{userPacks.length > 1 ? 's' : ''} loaded:
            </span>
            {userPacks.map(p => (
              <span key={p.name}
                className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg"
                style={{ background: 'rgb(var(--accent) / 0.12)', color: 'rgb(var(--accent))', border: '1px solid rgb(var(--accent) / 0.25)' }}>
                <Check className="w-3 h-3" />
                <span className="font-medium">{p.name}</span>
                <button onClick={() => removeResourcePack(p.name)} title="Remove pack" disabled={packBusy}
                  style={{ opacity: 0.7 }}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </>
        )}
        <button
          onClick={() => packInputRef.current?.click()}
          disabled={!packReady || packBusy}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
          style={{ border: '1px solid rgb(var(--border))', color: 'rgb(var(--text))' }}
        >
          {packBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Load Resource Pack
        </button>
        <input
          ref={packInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={async e => { const f = e.target.files?.[0]; if (f) await addResourcePack(f); e.target.value = '' }}
        />
      </div>

      {/* Canvas area */}
      <div
        className="relative rounded-2xl overflow-hidden mb-4"
        style={{ border: '1px solid rgb(var(--border))', background: '#0b0b14', aspectRatio: '16 / 9' }}
        onDragOver={e => e.preventDefault()}
        onDrop={async e => {
          e.preventDefault()
          const file = e.dataTransfer.files?.[0]
          if (!file) return
          // .zip → resource pack; everything else → schematic
          if (file.name.toLowerCase().endsWith('.zip')) await addResourcePack(file)
          else await handleFile(file)
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block' }}
          onPointerDown={e => { pointerDownRef.current = { x: e.clientX, y: e.clientY } }}
          onClick={hasSchematic ? handleCanvasClick : undefined}
        />

        {/* Controls hint (top-left) */}
        {hasSchematic && (
          <div className="absolute top-3 left-3 flex gap-2 text-xs select-none pointer-events-none">
            {[
              { icon: <MousePointer2 className="w-3 h-3" />, k: 'Left Drag', v: 'Rotate' },
              { icon: <Move className="w-3 h-3" />, k: 'Right Drag', v: 'Pan' },
              { icon: <ZoomIn className="w-3 h-3" />, k: 'Scroll', v: 'Zoom' },
            ].map(({ icon, k, v }) => (
              <div key={k} className="flex items-center gap-1.5 px-2 py-1 rounded-lg backdrop-blur"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>{icon}</span>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>{k}</span>
                <span style={{ color: 'rgba(255,255,255,0.9)' }}>{v}</span>
              </div>
            ))}
          </div>
        )}

        {/* Bounds panel (top-right) */}
        {hasSchematic && bx && by && bz && (
          <div className="absolute top-3 right-3 w-64 rounded-xl p-4 backdrop-blur space-y-3"
            style={{ background: 'rgba(20,20,32,0.8)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <AxisSlider label="X" color="#ef4444" bounds={bx} onChange={(lo, hi) => { setBx({ ...bx, lo, hi }); applyBounds('x', lo, hi) }} />
            <AxisSlider label="Y" color="#22c55e" bounds={by} onChange={(lo, hi) => { setBy({ ...by, lo, hi }); applyBounds('y', lo, hi) }} />
            <AxisSlider label="Z" color="#3b82f6" bounds={bz} onChange={(lo, hi) => { setBz({ ...bz, lo, hi }); applyBounds('z', lo, hi) }} />
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>Bounds wireframe</span>
              <button onClick={toggleBoundsWireframe}
                className="relative w-9 h-5 rounded-full transition-colors"
                style={{ background: boundsWireframe ? 'rgb(var(--accent))' : 'rgba(255,255,255,0.2)' }}>
                <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                  style={{ left: boundsWireframe ? '18px' : '2px' }} />
              </button>
            </div>
            <button onClick={resetBounds} className="w-full text-xs text-right" style={{ color: 'rgba(255,255,255,0.5)' }}>
              reset
            </button>
          </div>
        )}

        {/* Selected block panel (bottom-left) */}
        {selBlock && (
          <div className="absolute bottom-3 left-3 w-72 rounded-xl p-3 backdrop-blur"
            style={{ background: 'rgba(20,20,32,0.85)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-widest mb-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Selected Block</div>
                <div className="text-sm font-semibold font-mono truncate" style={{ color: '#fff' }} title={selBlock.name}>
                  {selBlock.name.replace(/^minecraft:/, '')}
                </div>
              </div>
              <button onClick={() => setSelBlock(null)} className="shrink-0" style={{ color: 'rgba(255,255,255,0.5)' }} title="Close">
                ✕
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs mb-2" style={{ color: 'rgba(255,255,255,0.6)' }}>
              <span className="font-mono">x:{selBlock.x}</span>
              <span className="font-mono">y:{selBlock.y}</span>
              <span className="font-mono">z:{selBlock.z}</span>
            </div>

            {selBlock.properties.length > 0 && (
              <div className="mb-2">
                <div className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>States</div>
                <div className="flex flex-wrap gap-1">
                  {selBlock.properties.map(([k, v]) => (
                    <span key={k} className="text-xs px-1.5 py-0.5 rounded font-mono"
                      style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)' }}>
                      {k}=<span style={{ color: '#7dd3fc' }}>{v}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selBlock.entity != null && (
              <details className="mb-2">
                <summary className="text-xs cursor-pointer" style={{ color: 'rgba(255,255,255,0.4)' }}>Block entity NBT</summary>
                <pre className="text-xs mt-1 p-2 rounded overflow-auto max-h-32"
                  style={{ background: 'rgba(0,0,0,0.4)', color: 'rgba(255,255,255,0.7)' }}>
                  {safeJson(selBlock.entity)}
                </pre>
              </details>
            )}

            <button
              onClick={() => navigator.clipboard.writeText(selBlock.full)}
              className="w-full text-xs py-1.5 rounded-lg font-medium transition-colors"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)' }}
            >
              Copy block state
            </button>
          </div>
        )}

        {/* Status overlays */}
        {(status === 'init' || status === 'loading') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: 'rgba(11,11,20,0.6)' }}>
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'rgb(var(--accent))' }} />
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
              {status === 'init'
                ? (packReady ? 'Loading 3D renderer…' : 'Downloading Minecraft block textures (one-time)…')
                : 'Parsing schematic…'}
            </p>
          </div>
        )}

        {status === 'empty' && !hasSchematic && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
            <Box className="w-12 h-12" style={{ color: 'rgba(255,255,255,0.2)' }} />
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Drop a schematic file here, or use the controls below
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-x-0 bottom-3 mx-3 flex items-center gap-2 px-4 py-3 rounded-xl"
            style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.3)' }}>
            <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: '#f87171' }} />
            <span className="text-sm" style={{ color: '#fca5a5' }}>{error}</span>
          </div>
        )}
      </div>

      {/* Bottom bar: URL + upload */}
      <div className="card flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'rgb(var(--muted))' }} />
          <input
            className="form-input pl-9"
            placeholder="Paste schematic URL (e.g. from Discord or GitHub raw)…"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLoadUrl()}
          />
        </div>
        <button
          onClick={handleLoadUrl}
          disabled={!urlInput.trim() || !packReady}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
          style={{ backgroundColor: 'rgb(var(--accent))', color: 'rgb(var(--accent-fg, #fff))' }}
        >
          Load URL
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!packReady}
          title={!packReady ? 'Loading Minecraft block textures…' : undefined}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
          style={{ border: '1px solid rgb(var(--border))', color: 'rgb(var(--text))' }}
        >
          <Upload className="w-4 h-4" /> Upload File
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED.join(',')}
          className="hidden"
          onChange={async e => { const f = e.target.files?.[0]; if (f) await handleFile(f); e.target.value = '' }}
        />
      </div>

      <p className="text-xs mt-3" style={{ color: 'rgb(var(--muted))' }}>
        Rendering powered by the open-source <span className="font-mono">schematic-renderer</span> (Three.js + WASM).
        Supported formats: {ACCEPTED.join(', ')}.
      </p>
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function safeJson(v: unknown): string {
  try { return JSON.stringify(v, null, 2) } catch { return String(v) }
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function ToolbarBtn({ onClick, icon, label, active, disabled }: {
  onClick: () => void; icon: React.ReactNode; label: string; active?: boolean; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-30"
      style={{
        border: `1px solid ${active ? 'rgb(var(--accent))' : 'rgb(var(--border))'}`,
        background: active ? 'rgb(var(--accent) / 0.1)' : 'transparent',
        color: active ? 'rgb(var(--accent))' : 'rgb(var(--muted))',
      }}
    >
      {icon} {label}
    </button>
  )
}

function AxisSlider({ label, color, bounds, onChange }: {
  label: string; color: string; bounds: AxisBounds; onChange: (lo: number, hi: number) => void
}) {
  const { min, max, lo, hi } = bounds
  const span = Math.max(1, max - min)
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-bold w-3" style={{ color }}>{label}</span>
      <div className="relative flex-1 h-5">
        {/* track */}
        <div className="absolute top-1/2 -translate-y-1/2 w-full h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
        {/* active range */}
        <div className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full"
          style={{ background: color, left: `${((lo - min) / span) * 100}%`, right: `${((max - hi) / span) * 100}%` }} />
        {/* min handle */}
        <input type="range" min={min} max={max} value={lo}
          onChange={e => onChange(Math.min(Number(e.target.value), hi), hi)}
          className="absolute w-full appearance-none bg-transparent pointer-events-none range-thumb"
          style={{ top: 0, height: '20px' }} />
        {/* max handle */}
        <input type="range" min={min} max={max} value={hi}
          onChange={e => onChange(lo, Math.max(Number(e.target.value), lo))}
          className="absolute w-full appearance-none bg-transparent pointer-events-none range-thumb"
          style={{ top: 0, height: '20px' }} />
      </div>
      <span className="text-xs tabular-nums w-10 text-right" style={{ color: 'rgba(255,255,255,0.5)' }}>{lo}–{hi}</span>
    </div>
  )
}
