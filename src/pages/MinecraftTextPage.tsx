import { useState, useEffect, useRef, useCallback } from 'react'
import { Download, Copy, Check, RefreshCw } from 'lucide-react'
import * as THREE from 'three'

const GH = 'https://raw.githubusercontent.com/ewanhowell5195/MinecraftTitleGenerator/main'

interface FontMeta {
  name: string
  forcedTerminators: boolean
  spaceWidth: number
  defaultTexture: string
}

const FONTS: Record<string, FontMeta> = {
  'minecraft-five-bold-block': {
    name: 'Five Bold Block',
    forcedTerminators: true,
    spaceWidth: 12,
    defaultTexture: 'live',
  },
  'minecraft-ten-v2': {
    name: 'Ten (Cracked)',
    forcedTerminators: false,
    spaceWidth: 8,
    defaultTexture: 'cracked',
  },
  'minecraft-ten': {
    name: 'Ten (Classic)',
    forcedTerminators: false,
    spaceWidth: 8,
    defaultTexture: 'flat',
  },
  'minecraft-five-bold': {
    name: 'Five Bold',
    forcedTerminators: false,
    spaceWidth: 8,
    defaultTexture: 'flat',
  },
  'minecraft-seven': {
    name: 'Seven',
    forcedTerminators: false,
    spaceWidth: 8,
    defaultTexture: 'flat',
  },
}

const DEFAULT_ORBIT_YAW   = 9.43
const DEFAULT_ORBIT_PITCH = -0.5
const DEFAULT_ORBIT_DIST  = 300
const CHAR_GAP            = 0.5

interface CharElement {
  from: [number, number, number]
  to:   [number, number, number]
  faces: Partial<Record<'north'|'south'|'east'|'west'|'up'|'down', [number,number,number,number]>>
}

interface TextureInfo {
  textures: Record<string, { name?: string; author?: string; variants?: Record<string, { name?: string }> }>
}

const charCache:   Record<string, Record<string, CharElement[]>> = {}
const texInfoCache: Record<string, TextureInfo> = {}
const imgCache:    Record<string, HTMLImageElement> = {}

async function fetchChars(fontId: string) {
  if (!charCache[fontId]) {
    const r = await fetch(`${GH}/fonts/${fontId}/characters.json`)
    charCache[fontId] = await r.json()
  }
  return charCache[fontId]
}

async function fetchTexInfo(fontId: string): Promise<TextureInfo> {
  if (!texInfoCache[fontId]) {
    const r = await fetch(`${GH}/fonts/${fontId}/textures.json`)
    texInfoCache[fontId] = await r.json()
  }
  return texInfoCache[fontId]
}

async function loadImg(url: string): Promise<HTMLImageElement> {
  if (!imgCache[url]) {
    imgCache[url] = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.crossOrigin = 'anonymous'
      i.onload  = () => res(i)
      i.onerror = rej
      i.src = url
    })
  }
  return imgCache[url]
}

const FACE_UV_OFFSETS: Record<string, number> = {
  east: 0, west: 8, up: 16, down: 24, south: 32, north: 40,
}

function isInvertedElement(el: CharElement): boolean {
  return (
    el.from[0] > el.to[0] ||
    el.from[1] > el.to[1] ||
    el.from[2] > el.to[2]
  )
}

interface SceneData {
  scene:   THREE.Scene
  totalW:  number
  yMin:    number
  yMax:    number
  zMin:    number
  zMax:    number
  centerY: number
  zCenter: number
}

function buildScene(
  chars: Record<string, CharElement[]>,
  text: string,
  meta: FontMeta,
  material: THREE.Material,
  blackMaterial: THREE.Material,
): SceneData {
  let str = text.trim() || 'Text'
  if (meta.forcedTerminators) str = `┫${str}┣`

  const GLYPH_DEPTH_MULTIPLIER = 1.1
  const GLYPH_Z_OFFSET         = 0.2

  type LayoutChar  = { type: 'char';  elements: CharElement[]; maxX: number; width: number }
  type LayoutSpace = { type: 'space'; width: number }
  const layout: (LayoutChar | LayoutSpace)[] = []

  for (const char of Array.from(str)) {
    const rawEls = chars[char] ?? chars[char.toLowerCase()] ?? null
    if (!rawEls) {
      if (char === ' ') layout.push({ type: 'space', width: meta.spaceWidth })
      continue
    }

    // Use the cage (inverted) element for true character width measurement
    const cageEl  = rawEls.find(el => isInvertedElement(el))
    const measEls = cageEl ? [cageEl] : rawEls.filter(el => !isInvertedElement(el))

    const xs   = measEls.flatMap(e => [
      Math.min(e.from[0], e.to[0]),
      Math.max(e.from[0], e.to[0]),
    ])
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)

    layout.push({ type: 'char', elements: rawEls, maxX, width: maxX - minX })
  }

  let totalW = 0
  for (let i = 0; i < layout.length; i++) {
    totalW += layout[i].width
    if (i < layout.length - 1) totalW += CHAR_GAP
  }

  // Measure bounds from non-inverted elements only
  const normalEls = layout.flatMap(l =>
    l.type === 'char' ? l.elements.filter(el => !isInvertedElement(el)) : []
  )
  const yMin = Math.min(...normalEls.flatMap(e => [e.from[1], e.to[1]]))
  const yMax = Math.max(...normalEls.flatMap(e => [e.from[1], e.to[1]]))
  const zMin = Math.min(...normalEls.flatMap(e => [e.from[2], e.to[2]]))
  const zMax = Math.max(...normalEls.flatMap(e => [e.from[2], e.to[2]]))

  const scene    = new THREE.Scene()
  const allMeshes: THREE.Mesh[] = []
  let   cursorX  = 0

  for (let li = 0; li < layout.length; li++) {
    const item = layout[li]
    if (item.type === 'space') {
      cursorX += item.width
      if (li < layout.length - 1) cursorX += CHAR_GAP
      continue
    }

    const { elements, maxX } = item

    for (const el of elements) {
      const inverted = isInvertedElement(el)

      const fx1 = Math.min(el.from[0], el.to[0])
      const fx2 = Math.max(el.from[0], el.to[0])
      const fy1 = Math.min(el.from[1], el.to[1])
      const fy2 = Math.max(el.from[1], el.to[1])
      const fz1 = Math.min(el.from[2], el.to[2])
      const fz2 = Math.max(el.from[2], el.to[2])

      const w0 = fx2 - fx1
      const h0 = fy2 - fy1
      const d0 = (fz2 - fz1) || 1
      if (w0 === 0 || h0 === 0) continue

      const posX = (fx1 + fx2) / 2 - (cursorX + maxX)
      const posY = (fy1 + fy2) / 2
      const posZ = (fz1 + fz2) / 2 + GLYPH_Z_OFFSET

      if (inverted) {
        const dx = w0, dy = h0, dz = d0 * GLYPH_DEPTH_MULTIPLIER
        const x1 = -dx/2, x2 = dx/2
        const y1 = -dy/2, y2 = dy/2
        const z1 = -dz/2, z2 = dz/2

        // All 6 faces: sides give edge outline, front/back fill gaps between letters
        const verts = new Float32Array([
          // left
          x1, y1, z1,  x1, y2, z1,  x1, y2, z2,  x1, y1, z2,
          // right
          x2, y1, z2,  x2, y2, z2,  x2, y2, z1,  x2, y1, z1,
          // top
          x1, y2, z2,  x1, y2, z1,  x2, y2, z1,  x2, y2, z2,
          // bottom
          x1, y1, z1,  x1, y1, z2,  x2, y1, z2,  x2, y1, z1,
          // front (z = z2)
          x1, y1, z2,  x1, y2, z2,  x2, y2, z2,  x2, y1, z2,
          // back (z = z1)
          x2, y1, z1,  x2, y2, z1,  x1, y2, z1,  x1, y1, z1,
        ])
        const indices: number[] = []
        for (let f = 0; f < 6; f++) {
          const b = f * 4
          indices.push(b, b+1, b+2, b, b+2, b+3)
        }
        const cageGeo = new THREE.BufferGeometry()
        cageGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3))
        cageGeo.setIndex(indices)
        cageGeo.computeVertexNormals()

        const mesh = new THREE.Mesh(cageGeo, blackMaterial)
        mesh.position.set(posX, posY, posZ)
        mesh.renderOrder = 0
        allMeshes.push(mesh)
        scene.add(mesh)
      } else {
        const d   = d0 * GLYPH_DEPTH_MULTIPLIER
        const geo = new THREE.BoxGeometry(w0, h0, d)
        const uvArr  = geo.attributes.uv.array as Float32Array
        const idxBuf = geo.index!

        for (const [face, offset] of Object.entries(FACE_UV_OFFSETS)) {
          const uv = el.faces[face as keyof CharElement['faces']]
          if (uv) {
            const [fu1, fv1, fu2, fv2] = uv
            uvArr[offset + 0] = fu1 / 16;  uvArr[offset + 1] = 1 - fv1 / 16
            uvArr[offset + 2] = fu2 / 16;  uvArr[offset + 3] = 1 - fv1 / 16
            uvArr[offset + 4] = fu1 / 16;  uvArr[offset + 5] = 1 - fv2 / 16
            uvArr[offset + 6] = fu2 / 16;  uvArr[offset + 7] = 1 - fv2 / 16
          } else {
            const idxOff = (offset / 8) * 6
            const ia = idxBuf.array as unknown as { [k: number]: number }
            for (let k = 0; k < 6; k++) ia[idxOff + k] = 0
            idxBuf.needsUpdate = true
          }
        }
        geo.attributes.uv.needsUpdate = true

        const mesh = new THREE.Mesh(geo, material)
        mesh.position.set(posX, posY, posZ)
        mesh.renderOrder = 1  // always draws on top of cage
        allMeshes.push(mesh)
        scene.add(mesh)
      }
    }

    cursorX += item.width
    if (li < layout.length - 1) cursorX += CHAR_GAP
  }

  for (const m of allMeshes) m.position.x += totalW / 2

  return {
    scene, totalW,
    yMin, yMax, zMin, zMax,
    centerY: (yMin + yMax) / 2,
    zCenter: (zMin + zMax) / 2,
  }
}

function updateCameraAndRender(
  renderer: THREE.WebGLRenderer,
  canvas: HTMLCanvasElement,
  scale: number,
  orbitYaw: number,
  orbitPitch: number,
  orbitDistance: number,
  sceneData: SceneData,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  bgColor: string | null,
) {
  const { centerY, zCenter } = sceneData
  const cx = Math.cos(orbitPitch) * Math.sin(orbitYaw) * orbitDistance
  const cy = Math.sin(orbitPitch) * orbitDistance + centerY
  const cz = Math.cos(orbitPitch) * Math.cos(orbitYaw) * orbitDistance + zCenter
  camera.position.set(cx, cy, cz)
  camera.lookAt(0, centerY, zCenter)

  const width  = canvas.clientWidth  || 800
  const height = canvas.clientHeight || 400
  canvas.width  = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  renderer.setSize(canvas.width, canvas.height, false)
  renderer.setPixelRatio(1)
  renderer.setClearColor(0x000000, 0)
  if (bgColor) renderer.setClearColor(parseInt(bgColor.slice(1), 16), 1)
  renderer.render(scene, camera)
}

function flattenTextures(info: TextureInfo): { id: string; name: string }[] {
  const list: { id: string; name: string }[] = []
  const fmt = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  for (const [id, meta] of Object.entries(info.textures)) {
    list.push({ id, name: meta.name ?? fmt(id) })
    if (meta.variants) {
      for (const [vid, vmeta] of Object.entries(meta.variants)) {
        list.push({ id: vid, name: (vmeta as { name?: string }).name ?? fmt(vid) })
      }
    }
  }
  return list
}

export default function MinecraftTextPage() {
  const [text,      setText]      = useState('EXAMPLE')
  const [fontId,    setFontId]    = useState('minecraft-five-bold-block')
  const [textureId, setTextureId] = useState('live')
  const [scale,     setScale]     = useState(3)
  const [bgBlack,   setBgBlack]   = useState(false)
  const [textures,  setTextures]  = useState<{ id: string; name: string }[]>([])
  const [loading,   setLoading]   = useState(false)
  const [copied,    setCopied]    = useState(false)

  const previewRef  = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef    = useRef<THREE.Scene | null>(null)
  const cameraRef   = useRef<THREE.PerspectiveCamera | null>(null)
  const sceneDataRef = useRef<SceneData | null>(null)

  const [orbitYaw,      setOrbitYaw]      = useState(DEFAULT_ORBIT_YAW)
  const [orbitPitch,    setOrbitPitch]    = useState(DEFAULT_ORBIT_PITCH)
  const [orbitDistance, setOrbitDistance] = useState(DEFAULT_ORBIT_DIST)

  const draggingRef = useRef(false)
  const lastPosRef  = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = previewRef.current
    if (!canvas) return
    const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, preserveDrawingBuffer: true })
    r.setPixelRatio(1)
    rendererRef.current = r
    return () => { r.dispose(); rendererRef.current = null }
  }, [])

  useEffect(() => {
    fetchTexInfo(fontId).then(info => {
      const list = flattenTextures(info)
      setTextures(list)
      const def = FONTS[fontId].defaultTexture
      setTextureId(list.some(t => t.id === def) ? def : (list[0]?.id ?? 'flat'))
    })
  }, [fontId])

  const PREVIEW_SCALE = 3

  const buildAndRender = useCallback(async (
    targetCanvas: HTMLCanvasElement | null,
    renderScale: number,
  ) => {
    if (!targetCanvas) return
    const renderer = rendererRef.current
    if (!renderer) return

    setLoading(true)
    try {
      const [chars, texImg] = await Promise.all([
        fetchChars(fontId),
        loadImg(`${GH}/fonts/${fontId}/textures/${textureId}.png`),
      ])

      const meta   = FONTS[fontId]
      let source: HTMLImageElement | HTMLCanvasElement = texImg

      const texture = new THREE.Texture(source)
      texture.colorSpace  = THREE.SRGBColorSpace
      texture.magFilter   = THREE.NearestFilter
      texture.minFilter   = THREE.NearestFilter
      texture.flipY       = true
      texture.needsUpdate = true

      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.01,
      })

      const blackMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: false,
      })

      const data = buildScene(chars, text, meta, material, blackMaterial)
      sceneDataRef.current = data
      sceneRef.current     = data.scene

      const width  = targetCanvas.clientWidth  || 800
      const height = targetCanvas.clientHeight || 400
      const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 5000)
      cameraRef.current = camera

      setOrbitDistance(DEFAULT_ORBIT_DIST)

      updateCameraAndRender(
        renderer, targetCanvas, renderScale,
        orbitYaw, orbitPitch, DEFAULT_ORBIT_DIST,
        data, data.scene, camera,
        bgBlack ? '#000000' : null,
      )
    } finally {
      setLoading(false)
    }
  }, [fontId, textureId, text, bgBlack, orbitYaw, orbitPitch])

  useEffect(() => {
    const t = setTimeout(() => {
      if (previewRef.current) buildAndRender(previewRef.current, PREVIEW_SCALE)
    }, 80)
    return () => clearTimeout(t)
  }, [buildAndRender])

  useEffect(() => {
    const canvas    = previewRef.current
    const renderer  = rendererRef.current
    const scene     = sceneRef.current
    const data      = sceneDataRef.current
    const camera    = cameraRef.current
    if (!canvas || !renderer || !scene || !data || !camera) return
    updateCameraAndRender(
      renderer, canvas, PREVIEW_SCALE,
      orbitYaw, orbitPitch, orbitDistance,
      data, scene, camera,
      bgBlack ? '#000000' : null,
    )
  }, [orbitYaw, orbitPitch, orbitDistance, PREVIEW_SCALE, bgBlack])

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = true
    lastPosRef.current = { x: e.clientX, y: e.clientY }
    ;(e.target as HTMLCanvasElement).style.cursor = 'grabbing'
  }
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = false
    lastPosRef.current  = null
    ;(e.target as HTMLCanvasElement).style.cursor = 'grab'
  }
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current || !lastPosRef.current) return
    const dx = e.clientX - lastPosRef.current.x
    const dy = e.clientY - lastPosRef.current.y
    lastPosRef.current = { x: e.clientX, y: e.clientY }
    setOrbitYaw(y => y + dx * 0.01)
    setOrbitPitch(p => Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, p + dy * 0.01)))
  }
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    setOrbitDistance(d => Math.max(50, d + e.deltaY * 0.5))
  }

  async function download() {
    const tmp = document.createElement('canvas')
    await buildAndRender(tmp, scale)
    const a = document.createElement('a')
    a.href = tmp.toDataURL('image/png')
    a.download = 'minecraft-text.png'
    a.click()
  }

  async function copyImg() {
    const tmp = document.createElement('canvas')
    await buildAndRender(tmp, scale)
    tmp.toBlob(async blob => {
      if (!blob) return
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      } catch {}
    })
  }

  const thumbUrl = (fId: string, tId: string) =>
    `${GH}/fonts/${fId}/thumbnails/${tId}.png`

  return (
    <div className="section py-10">
      <div className="container">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold mb-1">3D Minecraft Text</h1>
          <p className="text-sm" style={{ color: 'rgb(var(--muted))' }}>
            Generate 3D Minecraft-style text. Drag to orbit, scroll to zoom.
          </p>
        </div>

        <div className="flex gap-6 items-start flex-wrap xl:flex-nowrap">
          {/* Controls */}
          <div className="flex flex-col gap-4" style={{ width: 300, flexShrink: 0 }}>
            <div className="card p-4 space-y-2">
              <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'rgb(var(--muted))' }}>Text</p>
              <input
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Enter text…"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none font-mono tracking-wider"
                style={{ background: 'rgb(var(--bg))', border: '1px solid rgb(var(--border))', color: 'rgb(var(--text))' }}
              />
              <p className="text-xs" style={{ color: 'rgb(var(--muted))' }}>
                Lowercase a–z plus digits and common symbols are supported.
              </p>
            </div>

            <div className="card p-4 space-y-3">
              <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'rgb(var(--muted))' }}>Font</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(FONTS).map(([id, meta]) => (
                  <button key={id} onClick={() => setFontId(id)} title={meta.name}
                    className={`relative overflow-hidden rounded-lg border transition-all ${
                      fontId === id ? 'border-violet-500 ring-2 ring-violet-500/30' : 'border-transparent hover:border-[rgb(var(--border))]'
                    }`}
                    style={{ background: 'rgb(var(--bg))', aspectRatio: '5/3' }}>
                    <img src={thumbUrl(id, meta.defaultTexture)} alt={meta.name}
                      className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} />
                    <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 text-center"
                      style={{ background: 'rgba(0,0,0,.65)', fontSize: 10, color: '#fff', lineHeight: 1.3 }}>
                      {meta.name}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {textures.length > 0 && (
              <div className="card p-4 space-y-3">
                <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'rgb(var(--muted))' }}>Texture</p>
                <div className="grid grid-cols-2 gap-2 overflow-y-auto" style={{ maxHeight: 260 }}>
                  {textures.map(t => (
                    <button key={t.id} onClick={() => setTextureId(t.id)} title={t.name}
                      className={`relative overflow-hidden rounded-lg border transition-all ${
                        textureId === t.id ? 'border-violet-500 ring-2 ring-violet-500/30' : 'border-transparent hover:border-[rgb(var(--border))]'
                      }`}
                      style={{ background: 'rgb(var(--bg))', aspectRatio: '5/3' }}>
                      <img src={thumbUrl(fontId, t.id)} alt={t.name}
                        className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} />
                      <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 text-center"
                        style={{ background: 'rgba(0,0,0,.65)', fontSize: 10, color: '#fff', lineHeight: 1.3 }}>
                        {t.name}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="card p-4 space-y-3">
              <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'rgb(var(--muted))' }}>Export</p>
              <div>
                <p className="text-xs mb-1.5" style={{ color: 'rgb(var(--muted))' }}>Scale</p>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 6, 8].map(s => (
                    <button key={s} onClick={() => setScale(s)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        scale === s ? 'bg-violet-600 text-white' : 'btn btn-ghost'}`}>
                      {s}×
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={bgBlack} onChange={e => setBgBlack(e.target.checked)} className="rounded" />
                <span className="text-xs" style={{ color: 'rgb(var(--muted))' }}>Black background</span>
              </label>
            </div>

            <div className="card p-4 space-y-3">
              <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'rgb(var(--muted))' }}>View</p>
              <button
                onClick={() => {
                  setOrbitYaw(DEFAULT_ORBIT_YAW)
                  setOrbitPitch(DEFAULT_ORBIT_PITCH)
                  setOrbitDistance(DEFAULT_ORBIT_DIST)
                }}
                className="btn btn-ghost w-full text-xs">
                Reset angle &amp; zoom
              </button>
            </div>

            <div className="flex gap-2">
              <button onClick={download} className="btn btn-primary flex-1 flex items-center justify-center gap-2 py-2.5">
                <Download size={15} /> Download PNG
              </button>
              <button onClick={copyImg} title="Copy" className="btn btn-ghost px-3 py-2.5 rounded-lg">
                {copied ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
              </button>
            </div>
          </div>

          {/* Preview */}
          <div className="flex-1 card p-8 flex flex-col items-center justify-center gap-4" style={{ minHeight: 320 }}>
            <div className="rounded-xl flex items-center justify-center p-10 w-full overflow-auto"
              style={{
                backgroundImage: 'repeating-conic-gradient(#444 0% 25%, #555 0% 50%)',
                backgroundSize: '20px 20px',
                minHeight: 200,
              }}>
              {loading && (
                <div className="absolute flex items-center gap-2" style={{ color: 'rgba(255,255,255,.6)' }}>
                  <RefreshCw size={16} className="animate-spin" />
                  <span className="text-sm">Rendering…</span>
                </div>
              )}
              <canvas
                ref={previewRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onWheel={handleWheel}
                style={{ imageRendering: 'pixelated', maxWidth: '100%', display: 'block', cursor: 'grab' }}
              />
            </div>
            <p className="text-xs" style={{ color: 'rgb(var(--muted))' }}>
              Drag to orbit · Scroll to zoom · Export at {scale}×
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}