import { useState, useRef, useEffect, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  Brush, Eraser, PaintBucket, Pipette, Hand,
  Undo2, Redo2, Download, Upload, RotateCcw, Grid3x3,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────
type Tool = 'brush' | 'erase' | 'fill' | 'eyedrop' | 'hand'

interface HSV { h: number; s: number; v: number }

// ── Color helpers ──────────────────────────────────────────────────────────────
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  s /= 100; v /= 100
  const i = Math.floor(h / 60) % 6
  const f = h / 60 - Math.floor(h / 60)
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s)
  const table: [number, number, number][] = [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]]
  const [r, g, b] = table[i]
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

function rgbToHsv(r: number, g: number, b: number): HSV {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  const s = max === 0 ? 0 : d / max
  const v = max
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h = Math.round(h * 60)
    if (h < 0) h += 360
  }
  return { h, s: Math.round(s * 100), v: Math.round(v * 100) }
}

function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace('#', '').replace(/^(\w)(\w)(\w)$/, '$1$1$2$2$3$3')
  const m = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(clean)
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')
}

function hsvToHex(hsv: HSV): string {
  const [r, g, b] = hsvToRgb(hsv.h, hsv.s, hsv.v)
  return rgbToHex(r, g, b)
}

// ── Skin UV layout ─────────────────────────────────────────────────────────────
// Each entry: [px1, py1, px2, py2, flipU?]
// Face order for BoxGeometry: +x, -x, +y, -y, +z, -z
type FaceUV = [number, number, number, number, boolean?]

function setBoxUVs(geo: THREE.BoxGeometry, faces: FaceUV[]) {
  const S = 64
  const arr = geo.attributes.uv.array as Float32Array
  faces.forEach(([px1, py1, px2, py2, flipU], i) => {
    const base = i * 8
    let ul = px1 / S, ur = px2 / S
    if (flipU) { [ul, ur] = [ur, ul] }
    const vt = 1 - py1 / S
    const vb = 1 - py2 / S
    // Three.js BoxGeometry UV order per face: top-left, top-right, bottom-left, bottom-right
    arr[base + 0] = ul; arr[base + 1] = vt
    arr[base + 2] = ur; arr[base + 3] = vt
    arr[base + 4] = ul; arr[base + 5] = vb
    arr[base + 6] = ur; arr[base + 7] = vb
  })
  geo.attributes.uv.needsUpdate = true
}

// ── Load skin from URL onto a canvas ──────────────────────────────────────────
function loadSkinImage(src: string, ctx: CanvasRenderingContext2D): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      ctx.clearRect(0, 0, 64, 64)
      ctx.drawImage(img, 0, 0, 64, 64)
      resolve()
    }
    img.onerror = reject
    img.src = src
  })
}

// ── Flood fill ─────────────────────────────────────────────────────────────────
function floodFill(
  ctx: CanvasRenderingContext2D,
  startX: number, startY: number,
  fillR: number, fillG: number, fillB: number, fillA: number,
) {
  const img = ctx.getImageData(0, 0, 64, 64)
  const d = img.data
  const si = (startY * 64 + startX) * 4
  const tr = d[si], tg = d[si+1], tb = d[si+2], ta = d[si+3]
  const na = Math.round(fillA * 255)
  if (tr===fillR && tg===fillG && tb===fillB && ta===na) return
  const stack = [[startX, startY]]
  const visited = new Uint8Array(64 * 64)
  while (stack.length) {
    const [x, y] = stack.pop()!
    if (x < 0 || x >= 64 || y < 0 || y >= 64) continue
    const idx = y * 64 + x
    if (visited[idx]) continue
    visited[idx] = 1
    const i = idx * 4
    if (d[i]!==tr || d[i+1]!==tg || d[i+2]!==tb || d[i+3]!==ta) continue
    d[i]=fillR; d[i+1]=fillG; d[i+2]=fillB; d[i+3]=na
    stack.push([x-1,y],[x+1,y],[x,y-1],[x,y+1])
  }
  ctx.putImageData(img, 0, 0)
}

// ── Palette ────────────────────────────────────────────────────────────────────
const PALETTE = [
  '#000000','#3d3d3d','#7f7f7f','#c0c0c0','#ffffff',
  '#c00000','#e07000','#c8b400','#228b22',
  '#006080','#003090','#5000a0','#801060',
  '#c68642','#8b6542','#4a3728','#e8c090',
  '#1dbfbc','#7148c9','#e74c3c','#3498db',
  '#2ecc71','#f39c12','#9b59b6','#1abc9c',
]

// ── Color Wheel Canvas ─────────────────────────────────────────────────────────
function ColorWheel({ hsv, onChange }: { hsv: HSV; onChange: (h: HSV) => void }) {
  const wheelRef = useRef<HTMLCanvasElement>(null)
  const svRef = useRef<HTMLCanvasElement>(null)
  const draggingWheel = useRef(false)
  const draggingSV = useRef(false)

  const drawWheel = useCallback(() => {
    const c = wheelRef.current; if (!c) return
    const size = c.width
    const cx = size / 2, cy = size / 2, r = size / 2 - 2
    const img = new ImageData(size, size)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx, dy = y - cy
        const dist = Math.sqrt(dx*dx + dy*dy)
        if (dist > r) continue
        const angle = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360
        const sat = (dist / r) * 100
        const [rr, gg, bb] = hsvToRgb(angle, sat, 100)
        const i = (y * size + x) * 4
        img.data[i]=rr; img.data[i+1]=gg; img.data[i+2]=bb; img.data[i+3]=255
      }
    }
    const ctx = c.getContext('2d')!
    ctx.putImageData(img, 0, 0)

    // indicator
    const angle = (hsv.h * Math.PI / 180)
    const sat = hsv.s / 100
    const ix = cx + Math.cos(angle) * sat * r
    const iy = cy + Math.sin(angle) * sat * r
    ctx.beginPath(); ctx.arc(ix, iy, 5, 0, Math.PI * 2)
    ctx.strokeStyle = 'white'; ctx.lineWidth = 2.5; ctx.stroke()
    ctx.beginPath(); ctx.arc(ix, iy, 5, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.stroke()
  }, [hsv])

  const drawSV = useCallback(() => {
    const c = svRef.current; if (!c) return
    const ctx = c.getContext('2d')!
    const w = c.width, h = c.height
    const [r, g, b] = hsvToRgb(hsv.h, 100, 100)
    const gH = ctx.createLinearGradient(0, 0, w, 0)
    gH.addColorStop(0, 'white')
    gH.addColorStop(1, `rgb(${r},${g},${b})`)
    ctx.fillStyle = gH; ctx.fillRect(0, 0, w, h)
    const gV = ctx.createLinearGradient(0, 0, 0, h)
    gV.addColorStop(0, 'transparent')
    gV.addColorStop(1, 'black')
    ctx.fillStyle = gV; ctx.fillRect(0, 0, w, h)

    const x = (hsv.s / 100) * w
    const y = (1 - hsv.v / 100) * h
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2)
    ctx.strokeStyle = 'white'; ctx.lineWidth = 2.5; ctx.stroke()
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.stroke()
  }, [hsv])

  useEffect(() => { drawWheel(); drawSV() }, [drawWheel, drawSV])

  const pickWheel = (e: MouseEvent) => {
    const c = wheelRef.current!
    const rect = c.getBoundingClientRect()
    const cx = c.width / 2, cy = c.height / 2
    const dx = (e.clientX - rect.left) * (c.width / rect.width) - cx
    const dy = (e.clientY - rect.top) * (c.height / rect.height) - cy
    const r = c.width / 2 - 2
    const dist = Math.sqrt(dx*dx + dy*dy)
    if (dist > r && !draggingWheel.current) return
    const h = Math.round(((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360)
    const s = Math.round(Math.min(dist / r, 1) * 100)
    onChange({ ...hsv, h, s })
  }

  const pickSV = (e: MouseEvent) => {
    const c = svRef.current!
    const rect = c.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    const s = Math.round(Math.max(0, Math.min(1, x)) * 100)
    const v = Math.round(Math.max(0, Math.min(1, 1 - y)) * 100)
    onChange({ ...hsv, s, v })
  }

  useEffect(() => {
    const mm = (e: MouseEvent) => {
      if (draggingWheel.current) pickWheel(e)
      if (draggingSV.current) pickSV(e)
    }
    const mu = () => { draggingWheel.current = false; draggingSV.current = false }
    window.addEventListener('mousemove', mm)
    window.addEventListener('mouseup', mu)
    return () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu) }
  })

  return (
    <div className="relative w-full aspect-square select-none">
      <canvas
        ref={wheelRef}
        width={220} height={220}
        className="w-full h-full rounded-full cursor-crosshair"
        onMouseDown={e => { draggingWheel.current = true; pickWheel(e.nativeEvent) }}
      />
      <canvas
        ref={svRef}
        width={140} height={140}
        className="absolute rounded cursor-crosshair"
        style={{ inset: '18%', width: '64%', height: '64%' }}
        onMouseDown={e => { e.stopPropagation(); draggingSV.current = true; pickSV(e.nativeEvent) }}
      />
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function SkinPage() {
  const mountRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const meshesRef = useRef<THREE.Mesh[]>([])
  const skinCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'))
  const skinTextureRef = useRef<THREE.CanvasTexture | null>(null)
  const rafRef = useRef<number>(0)

  const gridMeshesRef = useRef<THREE.LineSegments[]>([])
  const showGridRef = useRef(false)

  const [tool, setTool] = useState<Tool>('brush')
  const [hsv, setHsv] = useState<HSV>({ h: 0, s: 80, v: 80 })
  const [opacity, setOpacity] = useState(100)
  const [brushSize, setBrushSize] = useState(1)
  const [hexVal, setHexVal] = useState('#cc2222')
  const [showGrid, setShowGrid] = useState(false)
  const [undoStack, setUndoStack] = useState<ImageData[]>([])
  const [redoStack, setRedoStack] = useState<ImageData[]>([])
  const [recentColors, setRecentColors] = useState<string[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))

  const isPainting = useRef(false)
  const toolRef = useRef<Tool>('brush')
  const hsvRef = useRef<HSV>({ h: 0, s: 80, v: 80 })
  const opacityRef = useRef(1)
  const brushSizeRef = useRef(1)

  // Keep refs in sync
  useEffect(() => { toolRef.current = tool }, [tool])
  useEffect(() => { hsvRef.current = hsv; setHexVal(hsvToHex(hsv)) }, [hsv])
  useEffect(() => { opacityRef.current = opacity / 100 }, [opacity])
  useEffect(() => { brushSizeRef.current = brushSize }, [brushSize])

  // Detect dark mode
  useEffect(() => {
    const update = () => setIsDark(document.documentElement.classList.contains('dark'))
    update()
    const obs = new MutationObserver(update)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  // ── Skin canvas init ─────────────────────────────────────────────────────────
  const skin2dRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const sc = skinCanvasRef.current
    sc.width = sc.height = 64
    const ctx = sc.getContext('2d')!
    loadSkinImage('/steve.png', ctx).then(() => {
      if (skinTextureRef.current) skinTextureRef.current.needsUpdate = true
      saveUndo()
      update2D()
    })
  }, [])

  function update2D() {
    const c = skin2dRef.current; if (!c) return
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, 64, 64)
    ctx.drawImage(skinCanvasRef.current, 0, 0)
  }

  // ── Undo ─────────────────────────────────────────────────────────────────────
  function saveUndo() {
    const ctx = skinCanvasRef.current.getContext('2d')!
    const data = ctx.getImageData(0, 0, 64, 64)
    setUndoStack(prev => {
      const next = [...prev, data]
      return next.length > 50 ? next.slice(next.length - 50) : next
    })
    setRedoStack([])
  }

  function undo() {
    setUndoStack(prev => {
      if (prev.length < 2) return prev
      const newStack = prev.slice(0, -1)
      const state = newStack[newStack.length - 1]
      setRedoStack(r => [...r, prev[prev.length - 1]])
      const ctx = skinCanvasRef.current.getContext('2d')!
      ctx.putImageData(state, 0, 0)
      if (skinTextureRef.current) skinTextureRef.current.needsUpdate = true
      update2D()
      return newStack
    })
  }

  function redo() {
    setRedoStack(prev => {
      if (!prev.length) return prev
      const state = prev[prev.length - 1]
      const newRedo = prev.slice(0, -1)
      setUndoStack(u => [...u, state])
      const ctx = skinCanvasRef.current.getContext('2d')!
      ctx.putImageData(state, 0, 0)
      if (skinTextureRef.current) skinTextureRef.current.needsUpdate = true
      update2D()
      return newRedo
    })
  }

  // ── Paint ─────────────────────────────────────────────────────────────────────
  function paintAtUV(uv: THREE.Vector2) {
    const ctx = skinCanvasRef.current.getContext('2d')!
    const px = Math.floor(uv.x * 64)
    const py = Math.floor((1 - uv.y) * 64)
    const { h, s, v } = hsvRef.current
    const [r, g, b] = hsvToRgb(h, s, v)
    const alpha = opacityRef.current
    const size = brushSizeRef.current
    const rad = Math.max(0, Math.floor((size - 1) / 2))

    if (toolRef.current === 'fill') {
      floodFill(ctx, px, py, r, g, b, alpha)
    } else {
      for (let dy = -rad; dy <= rad; dy++) {
        for (let dx = -rad; dx <= rad; dx++) {
          if (rad > 0 && dx*dx + dy*dy > rad*rad) continue
          const x = px + dx, y = py + dy
          if (x < 0 || x >= 64 || y < 0 || y >= 64) continue
          if (toolRef.current === 'erase') {
            ctx.clearRect(x, y, 1, 1)
          } else {
            ctx.globalAlpha = alpha
            ctx.fillStyle = `rgb(${r},${g},${b})`
            ctx.fillRect(x, y, 1, 1)
            ctx.globalAlpha = 1
          }
        }
      }
    }

    if (skinTextureRef.current) skinTextureRef.current.needsUpdate = true
    update2D()
  }

  function eyedropAtUV(uv: THREE.Vector2) {
    const ctx = skinCanvasRef.current.getContext('2d')!
    const px = Math.floor(uv.x * 64)
    const py = Math.floor((1 - uv.y) * 64)
    const d = ctx.getImageData(px, py, 1, 1).data
    if (d[3] === 0) return
    setHsv(rgbToHsv(d[0], d[1], d[2]))
  }

  function addRecent() {
    const hex = hsvToHex(hsvRef.current)
    setRecentColors(prev => {
      if (prev[0] === hex) return prev
      return [hex, ...prev].slice(0, 16)
    })
  }

  // ── Three.js ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = mountRef.current!
    const w = el.clientWidth, h = el.clientHeight

    // Scene
    const scene = new THREE.Scene()
    sceneRef.current = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 1000)
    camera.position.set(0, 4, 55)
    cameraRef.current = camera

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(w, h)
    renderer.setClearColor(0x1a1a1a, 1)
    el.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 1.0))
    const sun = new THREE.DirectionalLight(0xffffff, 0.6)
    sun.position.set(4, 8, 6); scene.add(sun)
    const fill = new THREE.DirectionalLight(0xaaccff, 0.2)
    fill.position.set(-4, 2, -6); scene.add(fill)

    // Subtle floor grid
    const gridHelper = new THREE.GridHelper(60, 12, 0x333333, 0x2a2a2a)
    gridHelper.position.y = -18.5
    scene.add(gridHelper)

    // Skin texture
    const tex = new THREE.CanvasTexture(skinCanvasRef.current)
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.NearestFilter
    tex.colorSpace = THREE.SRGBColorSpace
    skinTextureRef.current = tex

    const mat = new THREE.MeshLambertMaterial({ map: tex })

    // Grid line material
    const gridLineMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.3,
      depthTest: true,
    })

    // Build per-pixel grid lines for all 6 faces of a box.
    // Each face's lines are pushed 0.02 units outward to avoid z-fighting.
    function makePixelGridGeo(w: number, h: number, d: number, segW: number, segH: number, segD: number) {
      const pts: number[] = []
      const hw = w / 2, hh = h / 2, hd = d / 2
      const e = 0.02 // outward offset

      // Front (+Z) — x: segW pixels, y: segH pixels
      for (let i = 0; i <= segW; i++) {
        const x = -hw + w * i / segW
        pts.push(x, -hh, hd + e,  x, hh, hd + e)
      }
      for (let j = 0; j <= segH; j++) {
        const y = -hh + h * j / segH
        pts.push(-hw, y, hd + e,  hw, y, hd + e)
      }

      // Back (-Z)
      for (let i = 0; i <= segW; i++) {
        const x = -hw + w * i / segW
        pts.push(x, -hh, -hd - e,  x, hh, -hd - e)
      }
      for (let j = 0; j <= segH; j++) {
        const y = -hh + h * j / segH
        pts.push(-hw, y, -hd - e,  hw, y, -hd - e)
      }

      // Right (+X) — z: segD pixels, y: segH pixels
      for (let k = 0; k <= segD; k++) {
        const z = -hd + d * k / segD
        pts.push(hw + e, -hh, z,  hw + e, hh, z)
      }
      for (let j = 0; j <= segH; j++) {
        const y = -hh + h * j / segH
        pts.push(hw + e, y, -hd,  hw + e, y, hd)
      }

      // Left (-X)
      for (let k = 0; k <= segD; k++) {
        const z = -hd + d * k / segD
        pts.push(-hw - e, -hh, z,  -hw - e, hh, z)
      }
      for (let j = 0; j <= segH; j++) {
        const y = -hh + h * j / segH
        pts.push(-hw - e, y, -hd,  -hw - e, y, hd)
      }

      // Top (+Y) — x: segW pixels, z: segD pixels
      for (let i = 0; i <= segW; i++) {
        const x = -hw + w * i / segW
        pts.push(x, hh + e, -hd,  x, hh + e, hd)
      }
      for (let k = 0; k <= segD; k++) {
        const z = -hd + d * k / segD
        pts.push(-hw, hh + e, z,  hw, hh + e, z)
      }

      // Bottom (-Y)
      for (let i = 0; i <= segW; i++) {
        const x = -hw + w * i / segW
        pts.push(x, -hh - e, -hd,  x, -hh - e, hd)
      }
      for (let k = 0; k <= segD; k++) {
        const z = -hd + d * k / segD
        pts.push(-hw, -hh - e, z,  hw, -hh - e, z)
      }

      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
      return geo
    }

    // segW/segH/segD = pixel count per axis
    function makePart(
      w: number, h: number, d: number,
      px: number, py: number, pz: number,
      uvFaces: FaceUV[],
      segW: number, segH: number, segD: number,
    ) {
      const geo = new THREE.BoxGeometry(w, h, d)
      setBoxUVs(geo, uvFaces)
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(px, py, pz)
      scene.add(mesh)
      meshesRef.current.push(mesh)

      const gridGeo = makePixelGridGeo(w, h, d, segW, segH, segD)
      const lines = new THREE.LineSegments(gridGeo, gridLineMat)
      lines.position.set(px, py, pz)
      lines.visible = false
      scene.add(lines)
      gridMeshesRef.current.push(lines)
    }

    // HEAD — 8×8×8 pixels
    makePart(8, 8, 8, 0, 10, 0, [
      [16, 8, 24, 16],
      [0,  8,  8, 16],
      [8,  0, 16,  8],
      [16, 0, 24,  8],
      [8,  8, 16, 16],
      [24, 8, 32, 16, true],
    ], 8, 8, 8)

    // BODY — 8 wide, 12 tall, 4 deep
    makePart(8, 12, 4, 0, 0, 0, [
      [28, 20, 32, 32],
      [16, 20, 20, 32],
      [20, 16, 28, 20],
      [28, 16, 36, 20],
      [20, 20, 28, 32],
      [32, 20, 40, 32, true],
    ], 8, 12, 4)

    // RIGHT ARM — 4×12×4
    makePart(4, 12, 4, -6, 0, 0, [
      [48, 20, 52, 32],
      [40, 20, 44, 32],
      [44, 16, 48, 20],
      [48, 16, 52, 20],
      [44, 20, 48, 32],
      [52, 20, 56, 32, true],
    ], 4, 12, 4)

    // LEFT ARM — 4×12×4
    makePart(4, 12, 4, 6, 0, 0, [
      [40, 52, 44, 64],
      [32, 52, 36, 64],
      [36, 48, 40, 52],
      [40, 48, 44, 52],
      [36, 52, 40, 64],
      [44, 52, 48, 64, true],
    ], 4, 12, 4)

    // RIGHT LEG — 4×12×4
    makePart(4, 12, 4, -2, -12, 0, [
      [8,  20, 12, 32],
      [0,  20,  4, 32],
      [4,  16,  8, 20],
      [8,  16, 12, 20],
      [4,  20,  8, 32],
      [12, 20, 16, 32, true],
    ], 4, 12, 4)

    // LEFT LEG — 4×12×4
    makePart(4, 12, 4, 2, -12, 0, [
      [24, 52, 28, 64],
      [16, 52, 20, 64],
      [20, 48, 24, 52],
      [24, 48, 28, 52],
      [20, 52, 24, 64],
      [28, 52, 32, 64, true],
    ], 4, 12, 4)

    // Controls — always enabled; left click reserved for painting unless hand tool
    const orb = new OrbitControls(camera, renderer.domElement)
    orb.target.set(0, 0, 0)
    orb.enableDamping = true
    orb.dampingFactor = 0.1
    orb.mouseButtons = { LEFT: undefined as any, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
    orb.touches = { ONE: undefined as any, TWO: THREE.TOUCH.DOLLY_PAN }
    orb.enabled = true
    controlsRef.current = orb

    // Animation
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate)
      orb.update()
      renderer.render(scene, camera)
    }
    animate()

    // Resize
    const ro = new ResizeObserver(() => {
      const w2 = el.clientWidth, h2 = el.clientHeight
      renderer.setSize(w2, h2)
      camera.aspect = w2 / h2
      camera.updateProjectionMatrix()
    })
    ro.observe(el)

    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
      renderer.dispose()
      el.removeChild(renderer.domElement)
      meshesRef.current = []
      gridMeshesRef.current = []
      skinTextureRef.current = null
    }
  }, [])

  // ── Canvas mouse events ───────────────────────────────────────────────────────
  useEffect(() => {
    const el = mountRef.current!
    const canvas = el.querySelector('canvas')!
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()

    function getHit(e: MouseEvent) {
      const rect = canvas.getBoundingClientRect()
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(mouse, cameraRef.current!)
      const hits = raycaster.intersectObjects(meshesRef.current)
      return hits.length > 0 ? hits[0] : null
    }

    function onDown(e: MouseEvent) {
      // Right-click always handled by OrbitControls (rotate)
      if (e.button === 2) return
      if (e.button !== 0) return

      const t = toolRef.current
      if (t === 'hand') return // OrbitControls handles left too when hand tool

      const hit = getHit(e)
      if (!hit || !hit.uv) return
      if (t === 'eyedrop') { eyedropAtUV(hit.uv); return }
      isPainting.current = true
      saveUndo()
      paintAtUV(hit.uv)
      addRecent()
    }

    function onMove(e: MouseEvent) {
      if (!isPainting.current) return
      const hit = getHit(e)
      if (hit?.uv) paintAtUV(hit.uv)
    }

    function onUp() {
      isPainting.current = false
    }

    canvas.addEventListener('mousedown', onDown)
    canvas.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    canvas.addEventListener('contextmenu', e => e.preventDefault())

    return () => {
      canvas.removeEventListener('mousedown', onDown)
      canvas.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      switch (e.key.toLowerCase()) {
        case 'b': setTool('brush'); break
        case 'e': setTool('erase'); break
        case 'g': setTool('fill'); break
        case 'i': setTool('eyedrop'); break
        case 'v': setTool('hand'); break
        case '[': setBrushSize(s => Math.max(1, s - 1)); break
        case ']': setBrushSize(s => Math.min(16, s + 1)); break
        case 'z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            e.shiftKey ? redo() : undo()
          }
          break
        case 'y':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); redo() }
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Tool → left-click orbit toggle
  useEffect(() => {
    const orb = controlsRef.current
    if (!orb) return
    orb.mouseButtons.LEFT = tool === 'hand' ? THREE.MOUSE.ROTATE as any : undefined as any
  }, [tool])

  // Grid visibility
  useEffect(() => {
    showGridRef.current = showGrid
    gridMeshesRef.current.forEach(m => { m.visible = showGrid })
  }, [showGrid])

  // ── Import / Export ───────────────────────────────────────────────────────────
  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const img = new Image()
    img.onload = () => {
      const ctx = skinCanvasRef.current.getContext('2d')!
      ctx.clearRect(0, 0, 64, 64)
      ctx.drawImage(img, 0, 0, 64, 64)
      if (skinTextureRef.current) skinTextureRef.current.needsUpdate = true
      update2D()
      saveUndo()
      showToast('Skin imported!')
    }
    img.src = URL.createObjectURL(file)
    e.target.value = ''
  }

  function handleExport() {
    const a = document.createElement('a')
    a.download = 'skin.png'
    a.href = skinCanvasRef.current.toDataURL('image/png')
    a.click()
    showToast('Exported as skin.png')
  }

  function handleReset() {
    const ctx = skinCanvasRef.current.getContext('2d')!
    loadSkinImage('/steve.png', ctx).then(() => {
      if (skinTextureRef.current) skinTextureRef.current.needsUpdate = true
      update2D()
      saveUndo()
      showToast('Reset to Steve skin')
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  const cursorClass = {
    brush: 'cursor-crosshair',
    erase: 'cursor-crosshair',
    fill: 'cursor-crosshair',
    eyedrop: 'cursor-crosshair',
    hand: 'cursor-grab',
  }[tool]

  const toolItems: { id: Tool; icon: React.ReactNode; label: string; key: string }[] = [
    { id: 'brush',   icon: <Brush size={17} />,      label: 'Brush',      key: 'B' },
    { id: 'erase',   icon: <Eraser size={17} />,     label: 'Eraser',     key: 'E' },
    { id: 'fill',    icon: <PaintBucket size={17} />, label: 'Fill',       key: 'G' },
    { id: 'eyedrop', icon: <Pipette size={17} />,    label: 'Eyedropper', key: 'I' },
    { id: 'hand',    icon: <Hand size={17} />,       label: 'Rotate',     key: 'V' },
  ]

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 57px)' }}>

      {/* ── Top bar ── */}
      <div
        className="flex items-center gap-2 px-4 flex-shrink-0 border-b"
        style={{
          height: 48,
          borderColor: 'rgb(var(--border))',
          background: 'rgb(var(--panel))',
        }}
      >
        {/* Undo / Redo */}
        <button
          onClick={undo}
          disabled={undoStack.length < 2}
          className="btn btn-ghost px-2.5 py-1.5 text-xs gap-1 rounded-lg disabled:opacity-40"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 size={14} />
        </button>
        <button
          onClick={redo}
          disabled={redoStack.length === 0}
          className="btn btn-ghost px-2.5 py-1.5 text-xs gap-1 rounded-lg disabled:opacity-40"
          title="Redo (Ctrl+Y)"
        >
          <Redo2 size={14} />
        </button>

        <div className="w-px h-5 mx-1" style={{ background: 'rgb(var(--border))' }} />

        {/* Size */}
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'rgb(var(--muted))' }}>Size</span>
          <input
            type="range" min={1} max={16} value={brushSize}
            onChange={e => setBrushSize(+e.target.value)}
            className="w-20 accent-violet-600"
          />
          <span className="text-xs font-mono font-semibold w-5">{brushSize}</span>
          <span className="text-xs" style={{ color: 'rgb(var(--muted))' }}>px</span>
        </div>

        <div className="w-px h-5 mx-1" style={{ background: 'rgb(var(--border))' }} />

        {/* Opacity */}
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'rgb(var(--muted))' }}>Opacity</span>
          <input
            type="range" min={1} max={100} value={opacity}
            onChange={e => setOpacity(+e.target.value)}
            className="w-20 accent-violet-600"
          />
          <span className="text-xs font-mono font-semibold w-8">{opacity}%</span>
        </div>

        <div className="flex-1" />

        {/* Import */}
        <label className="btn btn-secondary px-3 py-1.5 text-xs rounded-full cursor-pointer gap-1.5">
          <Upload size={13} />
          Import
          <input type="file" accept=".png" className="hidden" onChange={handleImport} />
        </label>

        {/* Reset */}
        <button onClick={handleReset} className="btn btn-ghost px-3 py-1.5 text-xs rounded-full gap-1.5" title="Reset to Steve">
          <RotateCcw size={13} />
          Reset
        </button>

        {/* Export */}
        <button onClick={handleExport} className="btn btn-primary px-3 py-1.5 text-sm rounded-full gap-1.5">
          <Download size={13} />
          Export
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left toolbar */}
        <div
          className="flex flex-col items-center py-3 gap-1 flex-shrink-0 border-r"
          style={{ width: 50, borderColor: 'rgb(var(--border))', background: 'rgb(var(--panel))' }}
        >
          {toolItems.map((t, idx) => (
            <div key={t.id}>
              {idx === 4 && (
                <div className="w-6 my-1" style={{ height: 1, background: 'rgb(var(--border))' }} />
              )}
              <button
                onClick={() => setTool(t.id)}
                title={`${t.label} (${t.key})`}
                className={`
                  relative w-9 h-9 rounded-lg flex items-center justify-center transition-all
                  ${tool === t.id
                    ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400'
                    : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-700 dark:hover:text-gray-200'}
                `}
              >
                {t.icon}
              </button>
            </div>
          ))}

          {/* Grid toggle */}
          <div className="w-6 my-1" style={{ height: 1, background: 'rgb(var(--border))' }} />
          <button
            onClick={() => setShowGrid(g => !g)}
            title="Toggle pixel grid (G)"
            className={`
              relative w-9 h-9 rounded-lg flex items-center justify-center transition-all
              ${showGrid
                ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400'
                : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-700 dark:hover:text-gray-200'}
            `}
          >
            <Grid3x3 size={17} />
          </button>
        </div>

        {/* 3D Viewport */}
        <div
          ref={mountRef}
          className={`flex-1 relative overflow-hidden ${cursorClass}`}
          style={{ background: '#1a1a1a' }}
        >
          {/* Hint overlay */}
          <div
            className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white text-xs px-3 py-1.5 rounded-full pointer-events-none z-10"
            style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)' }}
          >
            Right-click or V to rotate · Scroll to zoom
          </div>
        </div>

        {/* Right panel */}
        <div
          className="flex flex-col overflow-y-auto overflow-x-hidden flex-shrink-0 border-l"
          style={{ width: 272, borderColor: 'rgb(var(--border))', background: 'rgb(var(--panel))' }}
        >

          {/* Color wheel */}
          <div className="p-4 border-b" style={{ borderColor: 'rgb(var(--border))' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'rgb(var(--muted))' }}>Color</p>
            <ColorWheel hsv={hsv} onChange={setHsv} />

            {/* HSV sliders */}
            <div className="mt-3 space-y-2">
              {([['H', 'h', 360], ['S', 's', 100], ['V', 'v', 100]] as const).map(([label, key, max]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-xs font-bold w-3.5" style={{ color: 'rgb(var(--muted))' }}>{label}</span>
                  <input
                    type="range" min={0} max={max}
                    value={hsv[key]}
                    onChange={e => setHsv({ ...hsv, [key]: +e.target.value })}
                    className="flex-1 accent-violet-600"
                  />
                  <span className="text-xs font-mono font-semibold w-8 text-right">
                    {hsv[key]}{key === 'h' ? '°' : ''}
                  </span>
                </div>
              ))}
            </div>

            {/* Hex + preview */}
            <div className="flex items-center gap-2 mt-3">
              <div
                className="w-8 h-8 rounded-lg border flex-shrink-0"
                style={{ background: hsvToHex(hsv), borderColor: 'rgb(var(--border))' }}
              />
              <input
                value={hexVal}
                onChange={e => {
                  setHexVal(e.target.value)
                  const rgb = hexToRgb(e.target.value)
                  if (rgb) setHsv(rgbToHsv(...rgb))
                }}
                className="flex-1 h-8 px-2 text-xs font-mono font-semibold rounded-lg border outline-none focus:border-violet-500 transition-colors"
                style={{
                  background: 'rgb(var(--bg))',
                  borderColor: 'rgb(var(--border))',
                  color: 'rgb(var(--text))',
                }}
              />
            </div>
          </div>

          {/* Palette */}
          <div className="p-4 border-b" style={{ borderColor: 'rgb(var(--border))' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'rgb(var(--muted))' }}>Palette</p>
            <div className="grid grid-cols-8 gap-1">
              {PALETTE.map(c => (
                <button
                  key={c}
                  onClick={() => {
                    const rgb = hexToRgb(c)
                    if (rgb) setHsv(rgbToHsv(...rgb))
                  }}
                  className="aspect-square rounded transition-transform hover:scale-110 active:scale-95"
                  style={{
                    background: c,
                    outline: hsvToHex(hsv) === c ? '2px solid rgb(var(--accent))' : '2px solid transparent',
                    outlineOffset: 1,
                  }}
                  title={c}
                />
              ))}
            </div>
          </div>

          {/* Recent */}
          {recentColors.length > 0 && (
            <div className="p-4 border-b" style={{ borderColor: 'rgb(var(--border))' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'rgb(var(--muted))' }}>Recent</p>
              <div className="flex flex-wrap gap-1.5">
                {recentColors.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      const rgb = hexToRgb(c)
                      if (rgb) setHsv(rgbToHsv(...rgb))
                    }}
                    className="w-5 h-5 rounded-full border-2 border-transparent hover:scale-125 transition-transform"
                    style={{ background: c }}
                    title={c}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 2D skin preview */}
          <div className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'rgb(var(--muted))' }}>
              Skin Texture
            </p>
            <div
              className="rounded-lg border p-2 flex items-center justify-center"
              style={{
                borderColor: 'rgb(var(--border))',
                background: showGrid
                  ? `repeating-conic-gradient(#8882 0% 25%, transparent 0% 50%) 0 0 / 8px 8px`
                  : isDark ? 'rgb(9 9 13)' : '#f5f5f5',
              }}
            >
              <canvas
                ref={skin2dRef}
                width={64}
                height={64}
                style={{
                  imageRendering: 'pixelated',
                  width: '100%',
                  maxWidth: 240,
                }}
              />
            </div>
          </div>

        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-5 right-5 z-50 text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg"
          style={{ background: 'rgb(15 15 20)', color: 'white' }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}
