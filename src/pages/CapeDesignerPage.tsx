import { useState, useRef, useEffect, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  Brush, Eraser, PaintBucket, Pipette, Hand,
  Undo2, Redo2, Download, Upload, RotateCcw,
  Wind, Sparkles,
} from 'lucide-react'

// ── Canvas dimensions ────────────────────────────────────────────────────────
const CW = 64
const CH = 32

// ── Types ────────────────────────────────────────────────────────────────────
type Tool = 'brush' | 'erase' | 'fill' | 'eyedrop' | 'hand'
type Tab = 'cape' | 'elytra'
interface HSV { h: number; s: number; v: number }

// ── Colour helpers ────────────────────────────────────────────────────────────
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  s /= 100; v /= 100
  const i = Math.floor(h / 60) % 6
  const f = h / 60 - Math.floor(h / 60)
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s)
  const table: [number, number, number][] = [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]]
  const [r, g, b] = table[i]
  return [Math.round(r*255), Math.round(g*255), Math.round(b*255)]
}
function rgbToHsv(r: number, g: number, b: number): HSV {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min
  let h = 0
  const s = max === 0 ? 0 : d / max
  const v = max
  if (d !== 0) {
    if (max === r) h = ((g-b)/d)%6
    else if (max === g) h = (b-r)/d+2
    else h = (r-g)/d+4
    h = Math.round(h*60); if (h < 0) h += 360
  }
  return { h, s: Math.round(s*100), v: Math.round(v*100) }
}
function hexToRgb(hex: string): [number, number, number] | null {
  const c = hex.replace('#','').replace(/^(\w)(\w)(\w)$/,'$1$1$2$2$3$3')
  const m = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(c)
  return m ? [parseInt(m[1],16), parseInt(m[2],16), parseInt(m[3],16)] : null
}
function rgbToHex(r: number, g: number, b: number): string {
  return '#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('')
}
function hsvToHex(h: HSV): string { const [r,g,b]=hsvToRgb(h.h,h.s,h.v); return rgbToHex(r,g,b) }

// ── UV layout helpers ─────────────────────────────────────────────────────────
type FaceUV = [number, number, number, number, boolean?]

// setBoxUVs: assigns UV coordinates to a BoxGeometry using pixel regions in a W×H texture.
// Three.js BoxGeometry face order: +x, -x, +y, -y, +z, -z
function setBoxUVs(geo: THREE.BoxGeometry, faces: FaceUV[], W = CW, H = CH) {
  const arr = geo.attributes.uv.array as Float32Array
  faces.forEach(([px1, py1, px2, py2, flipU], i) => {
    const base = i * 8
    let ul = px1/W, ur = px2/W
    if (flipU) [ul, ur] = [ur, ul]
    const vt = 1 - py1/H
    const vb = 1 - py2/H
    arr[base+0]=ul; arr[base+1]=vt
    arr[base+2]=ur; arr[base+3]=vt
    arr[base+4]=ul; arr[base+5]=vb
    arr[base+6]=ur; arr[base+7]=vb
  })
  geo.attributes.uv.needsUpdate = true
}

// ── Cape UV faces ─────────────────────────────────────────────────────────────
// Cape model: 10×16×1, texture 64×32
// UV box offset (0,0): right(1×16)@(0,1), top(10×1)@(1,0), outer(10×16)@(1,1),
//                      left(1×16)@(11,1), bottom(10×1)@(11,0), inner(10×16)@(12,1)
const CAPE_FACES: FaceUV[] = [
  [11,  1, 12, 17],       // +X  left strip
  [0,   1,  1, 17],       // -X  right strip
  [1,   0, 11,  1],       // +Y  top
  [11,  0, 21,  1],       // -Y  bottom
  [12,  1, 22, 17],       // +Z  inner face
  [1,   1, 11, 17, true], // -Z  outer face (flip for correct orientation)
]

// ── Elytra wing UV faces ──────────────────────────────────────────────────────
// Standard Minecraft elytra.png layout, texOffset(22,0), box 10×20×2
// Both left and right wings share these UV coords (left wing is mirrored in model)
const ELYTRA_WING_FACES: FaceUV[] = [
  [22,  2, 24, 22],        // +X  right edge strip 2×20
  [34,  2, 36, 22],        // -X  left edge strip 2×20
  [24,  0, 34,  2],        // +Y  top 10×2
  [34,  0, 44,  2],        // -Y  bottom 10×2
  [36,  2, 46, 22],        // +Z  inner face 10×20
  [24,  2, 34, 22, true],  // -Z  outer/visible face 10×20 (flip)
]

// ── Flood fill ───────────────────────────────────────────────────────────────
function floodFill(ctx: CanvasRenderingContext2D, sx: number, sy: number, r: number, g: number, b: number, alpha: number) {
  const img = ctx.getImageData(0, 0, CW, CH)
  const d = img.data
  const idx = (x: number, y: number) => (y*CW+x)*4
  const si = idx(sx, sy)
  const [tr, tg, tb, ta] = [d[si], d[si+1], d[si+2], d[si+3]]
  const nr = r, ng = g, nb = b, na = Math.round(alpha*255)
  if (tr===nr && tg===ng && tb===nb && ta===na) return
  const stack = [[sx, sy]]
  while (stack.length) {
    const [x, y] = stack.pop()!
    if (x<0||x>=CW||y<0||y>=CH) continue
    const i = idx(x, y)
    if (d[i]!==tr||d[i+1]!==tg||d[i+2]!==tb||d[i+3]!==ta) continue
    d[i]=nr; d[i+1]=ng; d[i+2]=nb; d[i+3]=na
    stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1])
  }
  ctx.putImageData(img, 0, 0)
}

// ── 2D region overlay definitions ─────────────────────────────────────────────
const CAPE_REGIONS = [
  { label: 'Back (outer)', x: 1, y: 1, w: 10, h: 16, color: 'rgba(99,102,241,0.15)', border: 'rgba(99,102,241,0.5)' },
  { label: 'Front (inner)', x: 12, y: 1, w: 10, h: 16, color: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.35)' },
  { label: 'Top', x: 1, y: 0, w: 10, h: 1, color: 'rgba(251,191,36,0.15)', border: 'rgba(251,191,36,0.5)' },
  { label: 'Bottom', x: 11, y: 0, w: 10, h: 1, color: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.35)' },
  { label: 'R', x: 0, y: 1, w: 1, h: 16, color: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.4)' },
  { label: 'L', x: 11, y: 1, w: 1, h: 16, color: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.35)' },
]

const ELYTRA_REGIONS = [
  { label: 'Outer face', x: 24, y: 2, w: 10, h: 20, color: 'rgba(99,102,241,0.15)', border: 'rgba(99,102,241,0.5)' },
  { label: 'Inner face', x: 36, y: 2, w: 10, h: 20, color: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.35)' },
  { label: 'Top', x: 24, y: 0, w: 10, h: 2, color: 'rgba(251,191,36,0.15)', border: 'rgba(251,191,36,0.5)' },
  { label: 'Bottom', x: 34, y: 0, w: 10, h: 2, color: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.35)' },
  { label: 'R', x: 22, y: 2, w: 2, h: 20, color: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.4)' },
  { label: 'L', x: 34, y: 2, w: 2, h: 20, color: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.35)' },
]

// ── Component ─────────────────────────────────────────────────────────────────
export default function CapeDesignerPage() {
  const mountRef = useRef<HTMLDivElement>(null!)

  // Cape canvas + texture
  const capeCanvasRef = useRef<HTMLCanvasElement>((() => {
    const c = document.createElement('canvas'); c.width=CW; c.height=CH; return c
  })())
  const capeTextureRef = useRef<THREE.CanvasTexture | null>(null)
  const skin2dRef = useRef<HTMLCanvasElement>(null!)
  const overlayRef = useRef<HTMLCanvasElement>(null!)

  // Elytra canvas + texture
  const elytraCanvasRef = useRef<HTMLCanvasElement>((() => {
    const c = document.createElement('canvas'); c.width=CW; c.height=CH; return c
  })())
  const elytraTextureRef = useRef<THREE.CanvasTexture | null>(null)
  const elytra2dRef = useRef<HTMLCanvasElement>(null!)
  const elytraOverlayRef = useRef<HTMLCanvasElement>(null!)

  // Three.js refs
  const capeMeshRef = useRef<THREE.Mesh | null>(null)
  const rightWingMeshRef = useRef<THREE.Mesh | null>(null)
  const leftWingMeshRef = useRef<THREE.Mesh | null>(null)
  const wingGroupRef = useRef<THREE.Group | null>(null)
  const gridMeshRef = useRef<THREE.LineSegments | null>(null)
  const capeGroupRef = useRef<THREE.Group | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const rafRef = useRef(0)

  const [tool, setTool] = useState<Tool>('brush')
  const [activeTab, setActiveTab] = useState<Tab>('cape')
  const [hsv, setHsv] = useState<HSV>({ h: 120, s: 80, v: 70 })
  const [opacity, setOpacity] = useState(100)
  const [brushSize, setBrushSize] = useState(1)
  const [showGrid] = useState(true)
  const [zoom, setZoom] = useState(8)
  const [undoStack, setUndoStack] = useState<ImageData[]>([])
  const [redoStack, setRedoStack] = useState<ImageData[]>([])
  const [elytraUndoStack, setElytraUndoStack] = useState<ImageData[]>([])
  const [elytraRedoStack, setElytraRedoStack] = useState<ImageData[]>([])
  const [recentColors, setRecentColors] = useState<string[]>(['#3b82f6','#22c55e','#ef4444','#f59e0b','#ffffff','#000000'])
  const [showRegions, setShowRegions] = useState(true)
  const [toast, setToast] = useState('')
  const [waveAnim] = useState(true)

  const toolRef = useRef(tool)
  const hsvRef = useRef(hsv)
  const opacityRef = useRef(opacity / 100)
  const brushSizeRef = useRef(brushSize)
  const showGridRef = useRef(true)
  const activeTabRef = useRef(activeTab)
  const isPainting = useRef(false)

  useEffect(() => { toolRef.current = tool }, [tool])
  useEffect(() => { hsvRef.current = hsv }, [hsv])
  useEffect(() => { opacityRef.current = opacity / 100 }, [opacity])
  useEffect(() => { brushSizeRef.current = brushSize }, [brushSize])
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2000) }

  // Active canvas/texture helpers
  function activeCanvas() { return activeTabRef.current === 'cape' ? capeCanvasRef.current : elytraCanvasRef.current }
  function activeTexture() { return activeTabRef.current === 'cape' ? capeTextureRef.current : elytraTextureRef.current }

  // ── Init canvases ─────────────────────────────────────────────────────────
  useEffect(() => {
    capeCanvasRef.current.getContext('2d')!.clearRect(0, 0, CW, CH)
    elytraCanvasRef.current.getContext('2d')!.clearRect(0, 0, CW, CH)
    saveUndoCape()
    saveUndoElytra()
    update2D()
    updateElytra2D()
  }, [])

  function update2D() {
    const c = skin2dRef.current; if (!c) return
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, CW, CH)
    ctx.drawImage(capeCanvasRef.current, 0, 0)
    if (capeTextureRef.current) capeTextureRef.current.needsUpdate = true
    drawOverlay(overlayRef.current, CAPE_REGIONS)
  }

  function updateElytra2D() {
    const c = elytra2dRef.current; if (!c) return
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, CW, CH)
    ctx.drawImage(elytraCanvasRef.current, 0, 0)
    if (elytraTextureRef.current) elytraTextureRef.current.needsUpdate = true
    drawOverlay(elytraOverlayRef.current, ELYTRA_REGIONS)
  }

  function drawOverlay(c: HTMLCanvasElement | null, regions: typeof CAPE_REGIONS) {
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    if (!showRegions) return
    const z = zoom
    for (const r of regions) {
      ctx.fillStyle = r.color
      ctx.fillRect(r.x*z, r.y*z, r.w*z, r.h*z)
      ctx.strokeStyle = r.border
      ctx.lineWidth = 1
      ctx.strokeRect(r.x*z + 0.5, r.y*z + 0.5, r.w*z - 1, r.h*z - 1)
      ctx.fillStyle = r.border.replace('0.5','0.9').replace('0.35','0.8')
      ctx.font = `${Math.min(z * 0.6, 10)}px monospace`
      ctx.fillText(r.label, r.x*z + 2, r.y*z + z * 0.7)
    }
  }

  useEffect(() => {
    drawOverlay(overlayRef.current, CAPE_REGIONS)
    drawOverlay(elytraOverlayRef.current, ELYTRA_REGIONS)
  }, [showRegions, zoom])

  // ── Undo / Redo ──────────────────────────────────────────────────────────
  function saveUndoCape() {
    const data = capeCanvasRef.current.getContext('2d')!.getImageData(0, 0, CW, CH)
    setUndoStack(prev => { const n = [...prev, data]; return n.length > 50 ? n.slice(-50) : n })
    setRedoStack([])
  }
  function saveUndoElytra() {
    const data = elytraCanvasRef.current.getContext('2d')!.getImageData(0, 0, CW, CH)
    setElytraUndoStack(prev => { const n = [...prev, data]; return n.length > 50 ? n.slice(-50) : n })
    setElytraRedoStack([])
  }
  function saveUndo() { activeTabRef.current === 'cape' ? saveUndoCape() : saveUndoElytra() }

  function undo() {
    if (activeTabRef.current === 'cape') {
      setUndoStack(prev => {
        if (prev.length < 2) return prev
        const next = prev.slice(0,-1)
        const state = next[next.length-1]
        setRedoStack(r => [...r, prev[prev.length-1]])
        capeCanvasRef.current.getContext('2d')!.putImageData(state, 0, 0)
        if (capeTextureRef.current) capeTextureRef.current.needsUpdate = true
        update2D(); return next
      })
    } else {
      setElytraUndoStack(prev => {
        if (prev.length < 2) return prev
        const next = prev.slice(0,-1)
        const state = next[next.length-1]
        setElytraRedoStack(r => [...r, prev[prev.length-1]])
        elytraCanvasRef.current.getContext('2d')!.putImageData(state, 0, 0)
        if (elytraTextureRef.current) elytraTextureRef.current.needsUpdate = true
        updateElytra2D(); return next
      })
    }
  }

  function redo() {
    if (activeTabRef.current === 'cape') {
      setRedoStack(prev => {
        if (!prev.length) return prev
        const state = prev[prev.length-1]
        const nr = prev.slice(0,-1)
        setUndoStack(u => [...u, state])
        capeCanvasRef.current.getContext('2d')!.putImageData(state, 0, 0)
        if (capeTextureRef.current) capeTextureRef.current.needsUpdate = true
        update2D(); return nr
      })
    } else {
      setElytraRedoStack(prev => {
        if (!prev.length) return prev
        const state = prev[prev.length-1]
        const nr = prev.slice(0,-1)
        setElytraUndoStack(u => [...u, state])
        elytraCanvasRef.current.getContext('2d')!.putImageData(state, 0, 0)
        if (elytraTextureRef.current) elytraTextureRef.current.needsUpdate = true
        updateElytra2D(); return nr
      })
    }
  }

  // ── Auto-generate elytra from cape ────────────────────────────────────────
  function autoGenerateElytra() {
    const capeCTX = capeCanvasRef.current.getContext('2d')!
    const elytraCTX = elytraCanvasRef.current.getContext('2d')!
    // Cape outer face: (1,1) size (10,16)
    const capeData = capeCTX.getImageData(1, 1, 10, 16)
    createImageBitmap(capeData).then(bm => {
      // Scale 10×16 → 10×20 and paste at elytra outer face (24,2)
      const tmp = document.createElement('canvas')
      tmp.width = 10; tmp.height = 20
      const tmpCtx = tmp.getContext('2d')!
      tmpCtx.drawImage(bm, 0, 0, 10, 20)
      elytraCTX.clearRect(0, 0, CW, CH)
      elytraCTX.drawImage(tmp, 24, 2)
      if (elytraTextureRef.current) elytraTextureRef.current.needsUpdate = true
      updateElytra2D()
      saveUndoElytra()
      showToast('Elytra generated from cape!')
    })
  }

  // ── Paint ────────────────────────────────────────────────────────────────
  function paintAtUV(uv: THREE.Vector2, canvas: HTMLCanvasElement, texture: THREE.CanvasTexture | null, updateFn: () => void) {
    const ctx = canvas.getContext('2d')!
    const px = Math.floor(uv.x * CW)
    const py = Math.floor((1-uv.y) * CH)
    const { h, s, v } = hsvRef.current
    const [r, g, b] = hsvToRgb(h, s, v)
    const alpha = opacityRef.current
    const size = brushSizeRef.current
    const rad = Math.max(0, Math.floor((size-1)/2))
    if (toolRef.current === 'fill') {
      floodFill(ctx, px, py, r, g, b, alpha)
    } else {
      for (let dy=-rad; dy<=rad; dy++) {
        for (let dx=-rad; dx<=rad; dx++) {
          if (rad > 0 && dx*dx+dy*dy > rad*rad) continue
          const x=px+dx, y=py+dy
          if (x<0||x>=CW||y<0||y>=CH) continue
          if (toolRef.current==='erase') { ctx.clearRect(x,y,1,1) }
          else { ctx.globalAlpha=alpha; ctx.fillStyle=`rgb(${r},${g},${b})`; ctx.fillRect(x,y,1,1); ctx.globalAlpha=1 }
        }
      }
    }
    if (texture) texture.needsUpdate = true
    updateFn()
  }

  function eyedropAtUV(uv: THREE.Vector2, canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')!
    const px = Math.floor(uv.x * CW)
    const py = Math.floor((1-uv.y) * CH)
    const d = ctx.getImageData(px, py, 1, 1).data
    if (d[3]===0) return
    setHsv(rgbToHsv(d[0], d[1], d[2]))
  }

  // Paint on 2D editor
  const paint2D = useCallback((e: React.MouseEvent<HTMLCanvasElement> | MouseEvent, isElytra: boolean) => {
    const ref2d = isElytra ? elytra2dRef.current : skin2dRef.current
    const canv = isElytra ? elytraCanvasRef.current : capeCanvasRef.current
    const tex = isElytra ? elytraTextureRef.current : capeTextureRef.current
    const updateFn = isElytra ? updateElytra2D : update2D
    if (!ref2d) return
    const rect = ref2d.getBoundingClientRect()
    const cx = Math.floor(((e as MouseEvent).clientX - rect.left) / zoom)
    const cy = Math.floor(((e as MouseEvent).clientY - rect.top) / zoom)
    if (cx<0||cx>=CW||cy<0||cy>=CH) return
    const ctx = canv.getContext('2d')!
    const { h, s, v } = hsvRef.current
    const [r, g, b] = hsvToRgb(h, s, v)
    const alpha = opacityRef.current
    const size = brushSizeRef.current
    const rad = Math.max(0, Math.floor((size-1)/2))
    if (toolRef.current === 'eyedrop') {
      const d = ctx.getImageData(cx, cy, 1, 1).data
      if (d[3]>0) setHsv(rgbToHsv(d[0], d[1], d[2]))
      return
    }
    if (toolRef.current === 'fill') {
      floodFill(ctx, cx, cy, r, g, b, alpha); updateFn(); return
    }
    for (let dy=-rad; dy<=rad; dy++) {
      for (let dx=-rad; dx<=rad; dx++) {
        if (rad>0 && dx*dx+dy*dy>rad*rad) continue
        const x=cx+dx, y=cy+dy
        if (x<0||x>=CW||y<0||y>=CH) continue
        if (toolRef.current==='erase') { ctx.clearRect(x,y,1,1) }
        else { ctx.globalAlpha=alpha; ctx.fillStyle=`rgb(${r},${g},${b})`; ctx.fillRect(x,y,1,1); ctx.globalAlpha=1 }
      }
    }
    if (tex) tex.needsUpdate = true
    updateFn()
  }, [zoom])

  // ── Three.js setup ────────────────────────────────────────────────────────
  useEffect(() => {
    const el = mountRef.current!
    const w = el.clientWidth, h = el.clientHeight

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, w/h, 0.1, 1000)
    camera.position.set(18, 4, -30)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(w, h)
    renderer.setClearColor(0x1a1a1a, 1)
    el.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 1.0))
    const sun = new THREE.DirectionalLight(0xffffff, 0.6)
    sun.position.set(4, 8, 6); scene.add(sun)
    const fill = new THREE.DirectionalLight(0xaaccff, 0.3)
    fill.position.set(-6, 2, -8); scene.add(fill)

    const grid = new THREE.GridHelper(60, 12, 0x333333, 0x2a2a2a)
    grid.position.y = -18.5; scene.add(grid)

    // Cape texture
    const capeTex = new THREE.CanvasTexture(capeCanvasRef.current)
    capeTex.magFilter = THREE.NearestFilter
    capeTex.minFilter = THREE.NearestFilter
    capeTex.colorSpace = THREE.SRGBColorSpace
    capeTextureRef.current = capeTex

    const capeMat = new THREE.MeshLambertMaterial({ map: capeTex, transparent: true, alphaTest: 0.01, side: THREE.DoubleSide })

    // Elytra texture
    const elytraTex = new THREE.CanvasTexture(elytraCanvasRef.current)
    elytraTex.magFilter = THREE.NearestFilter
    elytraTex.minFilter = THREE.NearestFilter
    elytraTex.colorSpace = THREE.SRGBColorSpace
    elytraTextureRef.current = elytraTex

    const elytraMat = new THREE.MeshLambertMaterial({ map: elytraTex, transparent: true, alphaTest: 0.01, side: THREE.DoubleSide })

    // ── Ghost player ─────────────────────────────────────────────────────────
    const ghostMat = new THREE.MeshLambertMaterial({ color: 0x888888, transparent: true, opacity: 0.18, depthWrite: false })
    const ghostOutline = new THREE.MeshLambertMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.BackSide })

    const addGhost = (gw: number, gh: number, gd: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, gd), ghostMat)
      m.position.set(x, y, z); scene.add(m)
      const mo = new THREE.Mesh(new THREE.BoxGeometry(gw+0.3, gh+0.3, gd+0.3), ghostOutline)
      mo.position.set(x, y, z); scene.add(mo)
    }
    addGhost(8, 8, 8, 0, 10, 0)
    addGhost(8,12, 4, 0,  0, 0)
    addGhost(4,12, 4,-6,  0, 0)
    addGhost(4,12, 4, 6,  0, 0)

    // ── Cape mesh ────────────────────────────────────────────────────────────
    const capeGroup = new THREE.Group()
    capeGroup.position.set(0, 8, -2.1)
    scene.add(capeGroup)
    capeGroupRef.current = capeGroup

    const capeGeo = new THREE.BoxGeometry(10, 16, 1)
    setBoxUVs(capeGeo, CAPE_FACES)
    const capeMesh = new THREE.Mesh(capeGeo, capeMat)
    capeMesh.position.set(0, -8, 0)
    capeGroup.add(capeMesh)
    capeMeshRef.current = capeMesh

    // Pixel grid helper — builds a grid overlay for a w×h×d box face
    const gridLineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 })
    function makeBoxGrid(boxW: number, boxH: number, boxD: number): THREE.LineSegments {
      const pts: number[] = []
      const hw = boxW/2, hh = boxH/2, hd = boxD/2, eps = 0.02
      // Outer face (-Z)
      for (let i=0; i<=boxW; i++) { const x=-hw+i; pts.push(x,-hh,-hd-eps, x,hh,-hd-eps) }
      for (let j=0; j<=boxH; j++) { const y=-hh+j; pts.push(-hw,y,-hd-eps, hw,y,-hd-eps) }
      // Inner face (+Z)
      for (let i=0; i<=boxW; i++) { const x=-hw+i; pts.push(x,-hh,hd+eps, x,hh,hd+eps) }
      for (let j=0; j<=boxH; j++) { const y=-hh+j; pts.push(-hw,y,hd+eps, hw,y,hd+eps) }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
      return new THREE.LineSegments(geo, gridLineMat)
    }

    const capeGrid = makeBoxGrid(10, 16, 1)
    capeGrid.position.set(0, -8, 0)
    capeGroup.add(capeGrid)
    gridMeshRef.current = capeGrid

    capeGroup.rotation.x = 0.12

    // ── Elytra wing meshes ───────────────────────────────────────────────────
    const wingGroup = new THREE.Group()
    wingGroup.position.set(0, 8, -2.3)
    scene.add(wingGroup)
    wingGroupRef.current = wingGroup

    const wingGeo = new THREE.BoxGeometry(10, 20, 2)
    setBoxUVs(wingGeo, ELYTRA_WING_FACES)

    // Right wing — player's right side (-X), angled slightly outward and back
    const rightWing = new THREE.Mesh(wingGeo, elytraMat)
    rightWing.position.set(-8, -10, -1)
    rightWing.rotation.set(0.05, -0.25, 0.15)
    const rightWingGrid = makeBoxGrid(10, 20, 2)
    rightWing.add(rightWingGrid)
    wingGroup.add(rightWing)
    rightWingMeshRef.current = rightWing

    // Left wing — mirrored (+X side), scale.x = -1 mirrors the UV
    const leftWing = new THREE.Mesh(wingGeo, elytraMat)
    leftWing.position.set(8, -10, -1)
    leftWing.rotation.set(0.05, 0.25, -0.15)
    leftWing.scale.x = -1
    const leftWingGrid = makeBoxGrid(10, 20, 2)
    leftWing.add(leftWingGrid)
    wingGroup.add(leftWing)
    leftWingMeshRef.current = leftWing

    wingGroup.rotation.x = 0.12

    // Controls
    const orb = new OrbitControls(camera, renderer.domElement)
    orb.target.set(0, 2, 0)
    orb.enableDamping = true
    orb.dampingFactor = 0.1
    orb.mouseButtons = { LEFT: undefined as any, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
    orb.touches = { ONE: undefined as any, TWO: THREE.TOUCH.DOLLY_PAN }
    controlsRef.current = orb

    let t = 0
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate)
      t += 0.016
      const wave = 0.12 + Math.sin(t * 0.8) * 0.04
      if (capeGroupRef.current) capeGroupRef.current.rotation.x = wave
      if (wingGroupRef.current) wingGroupRef.current.rotation.x = wave
      orb.update()
      renderer.render(scene, camera)
    }
    animate()

    const ro = new ResizeObserver(() => {
      const w2=el.clientWidth, h2=el.clientHeight
      renderer.setSize(w2, h2)
      camera.aspect = w2/h2
      camera.updateProjectionMatrix()
    })
    ro.observe(el)

    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [])

  // ── 3D click-to-paint ────────────────────────────────────────────────────
  useEffect(() => {
    const el = mountRef.current!
    const canvas = el.querySelector('canvas')!
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()

    function getHit(e: MouseEvent) {
      const rect = canvas.getBoundingClientRect()
      mouse.x = ((e.clientX-rect.left)/rect.width)*2-1
      mouse.y = -((e.clientY-rect.top)/rect.height)*2+1
      raycaster.setFromCamera(mouse, cameraRef.current!)
      const isElytra = activeTabRef.current === 'elytra'
      const targets: THREE.Mesh[] = isElytra
        ? [rightWingMeshRef.current!, leftWingMeshRef.current!].filter(Boolean)
        : [capeMeshRef.current!].filter(Boolean)
      const hits = raycaster.intersectObjects(targets)
      return hits.length ? hits[0] : null
    }

    function getCanvasForTab() {
      return activeTabRef.current === 'cape'
        ? { canvas: capeCanvasRef.current, texture: capeTextureRef.current, updateFn: update2D }
        : { canvas: elytraCanvasRef.current, texture: elytraTextureRef.current, updateFn: updateElytra2D }
    }

    function onDown(e: MouseEvent) {
      if (e.button !== 0) return
      if (toolRef.current==='hand') return
      const hit = getHit(e); if (!hit?.uv) return
      const { canvas, texture, updateFn } = getCanvasForTab()
      if (toolRef.current==='eyedrop') { eyedropAtUV(hit.uv, canvas); return }
      isPainting.current = true; saveUndo(); paintAtUV(hit.uv, canvas, texture, updateFn); addRecent()
    }
    function onMove(e: MouseEvent) {
      if (!isPainting.current) return
      const hit = getHit(e); if (hit?.uv) {
        const { canvas, texture, updateFn } = getCanvasForTab()
        paintAtUV(hit.uv, canvas, texture, updateFn)
      }
    }
    function onUp() { isPainting.current = false }

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

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName==='INPUT') return
      switch(e.key.toLowerCase()) {
        case 'b': setTool('brush'); break
        case 'e': setTool('erase'); break
        case 'g': setTool('fill'); break
        case 'i': setTool('eyedrop'); break
        case 'v': setTool('hand'); break
        case '[': setBrushSize(s=>Math.max(1,s-1)); break
        case ']': setBrushSize(s=>Math.min(16,s+1)); break
        case 'z': if (e.ctrlKey||e.metaKey) { e.preventDefault(); e.shiftKey ? redo() : undo() }; break
        case 'y': if (e.ctrlKey||e.metaKey) { e.preventDefault(); redo() }; break
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  useEffect(() => {
    const orb = controlsRef.current; if (!orb) return
    orb.mouseButtons.LEFT = tool==='hand' ? THREE.MOUSE.ROTATE as any : undefined as any
  }, [tool])


  // ── Import / Export ───────────────────────────────────────────────────────
  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const isElytra = activeTab === 'elytra'
    const img = new Image()
    img.onload = () => {
      const drawFlipped = (canvas: HTMLCanvasElement) => {
        const ctx = canvas.getContext('2d')!
        ctx.clearRect(0,0,CW,CH)
        ctx.save(); ctx.translate(0, CH); ctx.scale(1, -1)
        ctx.drawImage(img, 0, 0, CW, CH)
        ctx.restore()
      }
      if (isElytra) {
        drawFlipped(elytraCanvasRef.current)
        if (elytraTextureRef.current) elytraTextureRef.current.needsUpdate = true
        updateElytra2D(); saveUndoElytra()
      } else {
        drawFlipped(capeCanvasRef.current)
        if (capeTextureRef.current) capeTextureRef.current.needsUpdate = true
        update2D(); saveUndoCape()
      }
      showToast(`${isElytra ? 'Elytra' : 'Cape'} imported!`)
    }
    img.src = URL.createObjectURL(file); e.target.value = ''
  }

  function flippedDataURL(src: HTMLCanvasElement): string {
    const tmp = document.createElement('canvas')
    tmp.width = src.width; tmp.height = src.height
    const ctx = tmp.getContext('2d')!
    ctx.translate(0, src.height)
    ctx.scale(1, -1)
    ctx.drawImage(src, 0, 0)
    return tmp.toDataURL('image/png')
  }

  function handleExport() {
    if (activeTab === 'cape') {
      const a = document.createElement('a')
      a.download = 'cape.png'
      a.href = flippedDataURL(capeCanvasRef.current)
      a.click(); showToast('Exported as cape.png')
    } else {
      const a = document.createElement('a')
      a.download = 'elytra.png'
      a.href = flippedDataURL(elytraCanvasRef.current)
      a.click(); showToast('Exported as elytra.png')
    }
  }

  function handleReset() {
    if (activeTab === 'cape') {
      capeCanvasRef.current.getContext('2d')!.clearRect(0,0,CW,CH)
      if (capeTextureRef.current) capeTextureRef.current.needsUpdate = true
      update2D(); saveUndoCape()
    } else {
      elytraCanvasRef.current.getContext('2d')!.clearRect(0,0,CW,CH)
      if (elytraTextureRef.current) elytraTextureRef.current.needsUpdate = true
      updateElytra2D(); saveUndoElytra()
    }
    showToast('Cleared')
  }

  function addRecent() {
    const hex = hsvToHex(hsvRef.current)
    setRecentColors(prev => prev[0]===hex ? prev : [hex,...prev].slice(0,16))
  }

  const toolItems: { id: Tool; icon: React.ReactNode; label: string; key: string }[] = [
    { id: 'brush',   icon: <Brush size={17}/>,        label: 'Brush',      key: 'B' },
    { id: 'erase',   icon: <Eraser size={17}/>,       label: 'Eraser',     key: 'E' },
    { id: 'fill',    icon: <PaintBucket size={17}/>,  label: 'Fill',       key: 'G' },
    { id: 'eyedrop', icon: <Pipette size={17}/>,      label: 'Eyedropper', key: 'I' },
    { id: 'hand',    icon: <Hand size={17}/>,         label: 'Rotate',     key: 'V' },
  ]

  const cursorClass = { brush:'cursor-crosshair',erase:'cursor-crosshair',fill:'cursor-crosshair',eyedrop:'cursor-crosshair',hand:'cursor-grab' }[tool]

  const hexInput = hsvToHex(hsv)
  function onHexChange(val: string) {
    const rgb = hexToRgb(val); if (rgb) setHsv(rgbToHsv(...rgb))
  }

  const activeUndoLen = activeTab === 'cape' ? undoStack.length : elytraUndoStack.length
  const activeRedoLen = activeTab === 'cape' ? redoStack.length : elytraRedoStack.length
  const activeRegions = activeTab === 'cape' ? CAPE_REGIONS : ELYTRA_REGIONS

  return (
    <div className="flex flex-col" style={{ height:'calc(100vh - 57px)' }}>

      {/* ── Top bar ── */}
      <div className="flex items-center gap-2 px-4 flex-shrink-0 border-b" style={{ height:48, borderColor:'rgb(var(--border))', background:'rgb(var(--panel))' }}>
        {/* Tab switcher */}
        <div className="flex rounded-lg p-0.5 gap-0.5 mr-1" style={{ background:'rgb(var(--bg))' }}>
          <button onClick={() => setActiveTab('cape')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${activeTab==='cape' ? 'bg-violet-600 text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            Cape
          </button>
          <button onClick={() => setActiveTab('elytra')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${activeTab==='elytra' ? 'bg-violet-600 text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            <Wind size={12}/> Elytra
          </button>
        </div>

        <div className="w-px h-5" style={{background:'rgb(var(--border))'}}/>
        <button onClick={undo} disabled={activeUndoLen<2} className="btn btn-ghost px-2.5 py-1.5 rounded-lg disabled:opacity-40" title="Undo (Ctrl+Z)"><Undo2 size={14}/></button>
        <button onClick={redo} disabled={activeRedoLen===0} className="btn btn-ghost px-2.5 py-1.5 rounded-lg disabled:opacity-40" title="Redo (Ctrl+Y)"><Redo2 size={14}/></button>
        <div className="w-px h-5 mx-1" style={{background:'rgb(var(--border))'}}/>

        <div className="flex items-center gap-2">
          <span className="text-xs" style={{color:'rgb(var(--muted))'}}>Size</span>
          <input type="range" min={1} max={16} value={brushSize} onChange={e=>setBrushSize(+e.target.value)} className="w-20 accent-violet-600"/>
          <span className="text-xs font-mono font-semibold w-5">{brushSize}</span>
          <span className="text-xs" style={{color:'rgb(var(--muted))'}}>px</span>
        </div>
        <div className="w-px h-5 mx-1" style={{background:'rgb(var(--border))'}}/>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{color:'rgb(var(--muted))'}}>Opacity</span>
          <input type="range" min={1} max={100} value={opacity} onChange={e=>setOpacity(+e.target.value)} className="w-20 accent-violet-600"/>
          <span className="text-xs font-mono font-semibold w-8">{opacity}%</span>
        </div>
        <div className="flex-1"/>

        {activeTab === 'elytra' && (
          <button onClick={autoGenerateElytra}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full transition-all"
            style={{ background:'rgb(var(--accent) / 0.12)', color:'rgb(var(--accent))' }}
            title="Copy and scale the cape's outer face onto the elytra wings">
            <Sparkles size={12}/> Auto-fill from cape
          </button>
        )}

        <label className="btn btn-secondary px-3 py-1.5 text-xs rounded-full cursor-pointer gap-1.5">
          <Upload size={13}/> Import
          <input type="file" accept=".png" className="hidden" onChange={handleImport}/>
        </label>
        <button onClick={handleReset} className="btn btn-ghost px-3 py-1.5 text-xs rounded-full gap-1.5" title="Clear canvas">
          <RotateCcw size={13}/> Clear
        </button>
        <button onClick={handleExport} className="btn btn-primary px-3 py-1.5 text-sm rounded-full gap-1.5">
          <Download size={13}/> Export
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left toolbar */}
        <div className="flex flex-col items-center py-3 gap-1 flex-shrink-0 border-r" style={{width:50, borderColor:'rgb(var(--border))', background:'rgb(var(--panel))'}}>
          {toolItems.map((t,idx) => (
            <div key={t.id}>
              {idx===4 && <div className="w-6 my-1" style={{height:1, background:'rgb(var(--border))'}}/>}
              <button onClick={()=>setTool(t.id)} title={`${t.label} (${t.key})`}
                className={`relative w-9 h-9 rounded-lg flex items-center justify-center transition-all ${tool===t.id ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                {t.icon}
              </button>
            </div>
          ))}
        </div>

        {/* 3D Viewport */}
        <div ref={mountRef} className={`flex-1 relative overflow-hidden ${cursorClass}`} style={{background:'#1a1a1a', minWidth:0}}>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white text-xs px-3 py-1.5 rounded-full pointer-events-none z-10"
            style={{background:'rgba(0,0,0,0.35)', backdropFilter:'blur(6px)'}}>
            Right-click or V to rotate · Scroll to zoom · Click {activeTab === 'elytra' ? 'wings' : 'cape'} to paint
          </div>
          {toast && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white text-xs px-4 py-2 rounded-full z-20 pointer-events-none transition-all"
              style={{background:'rgba(0,0,0,0.6)', backdropFilter:'blur(8px)'}}>
              {toast}
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="flex flex-col border-l overflow-y-auto" style={{width:340, borderColor:'rgb(var(--border))', background:'rgb(var(--panel))'}}>

          {/* Colour picker */}
          <div className="p-3 border-b" style={{borderColor:'rgb(var(--border))'}}>
            <div className="text-xs font-semibold mb-2" style={{color:'rgb(var(--muted))'}}>COLOUR</div>
            <div className="relative rounded-lg overflow-hidden cursor-crosshair mb-2"
              style={{height:120, background:`hsl(${hsv.h},100%,50%)`}}
              onMouseDown={e => {
                const update = (ev: MouseEvent) => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  const s = Math.max(0,Math.min(100,Math.round(((ev.clientX-rect.left)/rect.width)*100)))
                  const v = Math.max(0,Math.min(100,Math.round((1-(ev.clientY-rect.top)/rect.height)*100)))
                  setHsv(p=>({...p,s,v}))
                }
                update(e.nativeEvent)
                const up = () => window.removeEventListener('mousemove',update as any)
                window.addEventListener('mousemove', update as any)
                window.addEventListener('mouseup', up, {once:true})
              }}>
              <div className="absolute inset-0" style={{background:'linear-gradient(to right,white,transparent)'}}/>
              <div className="absolute inset-0" style={{background:'linear-gradient(to bottom,transparent,black)'}}/>
              <div className="absolute w-3 h-3 rounded-full border-2 border-white -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{left:`${hsv.s}%`, top:`${100-hsv.v}%`, boxShadow:'0 0 0 1px rgba(0,0,0,0.4)'}}/>
            </div>
            <input type="range" min={0} max={359} value={hsv.h} className="w-full h-3 rounded mb-2"
              style={{background:'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)', accentColor:hexInput}}
              onChange={e=>setHsv(p=>({...p,h:+e.target.value}))}/>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg border flex-shrink-0" style={{background:hexInput, borderColor:'rgb(var(--border))'}}/>
              <input className="flex-1 text-sm font-mono px-2 py-1 rounded-lg border" value={hexInput}
                style={{background:'rgb(var(--bg))', borderColor:'rgb(var(--border))', color:'rgb(var(--text))'}}
                onChange={e=>onHexChange(e.target.value)}/>
            </div>
            {recentColors.length > 0 && (
              <div className="mt-2">
                <div className="text-xs mb-1" style={{color:'rgb(var(--muted))'}}>Recent</div>
                <div className="flex flex-wrap gap-1">
                  {recentColors.map(c=>(
                    <button key={c} onClick={()=>{const rgb=hexToRgb(c);if(rgb)setHsv(rgbToHsv(...rgb))}}
                      className="w-5 h-5 rounded border" style={{background:c, borderColor:'rgb(var(--border))'}}/>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 2D flat editor */}
          <div className="p-3 flex-1">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold" style={{color:'rgb(var(--muted))'}}>
                {activeTab === 'cape' ? 'CAPE' : 'ELYTRA'} FLAT EDITOR (64×32)
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs flex items-center gap-1 cursor-pointer" style={{color:'rgb(var(--muted))'}}>
                  <input type="checkbox" checked={showRegions} onChange={e=>setShowRegions(e.target.checked)} style={{accentColor:'rgb(var(--accent))'}}/>
                  Labels
                </label>
                <select value={zoom} onChange={e=>setZoom(+e.target.value)}
                  className="text-xs rounded px-1 py-0.5 border" style={{background:'rgb(var(--bg))', borderColor:'rgb(var(--border))', color:'rgb(var(--text))'}}>
                  {[4,6,8,10,12].map(z=><option key={z} value={z}>{z}x</option>)}
                </select>
              </div>
            </div>

            {/* Cape editor */}
            <div style={{ display: activeTab === 'cape' ? 'block' : 'none' }}>
              <div className="overflow-auto rounded-lg border" style={{borderColor:'rgb(var(--border))', maxHeight:280}}>
                <div className="relative" style={{width:CW*zoom, height:CH*zoom}}>
                  <div className="absolute inset-0" style={{
                    backgroundImage:'repeating-conic-gradient(#cccccc 0% 25%, #ffffff 0% 50%)',
                    backgroundSize:`${zoom*2}px ${zoom*2}px`,
                    imageRendering:'pixelated',
                  }}/>
                  <canvas ref={skin2dRef} width={CW} height={CH}
                    className="absolute inset-0 cursor-crosshair"
                    style={{width:CW*zoom, height:CH*zoom, imageRendering:'pixelated'}}
                    onMouseDown={e=>{
                      if (toolRef.current==='hand') return
                      saveUndoCape(); paint2D(e, false); addRecent()
                      const up = () => { isPainting.current = false; window.removeEventListener('mouseup', up) }
                      const move = (ev: MouseEvent) => { if (isPainting.current) paint2D(ev as any, false) }
                      isPainting.current = true
                      window.addEventListener('mousemove', move as any)
                      window.addEventListener('mouseup', up)
                    }}
                  />
                  <canvas ref={overlayRef} width={CW*zoom} height={CH*zoom}
                    className="absolute inset-0 pointer-events-none"
                    style={{width:CW*zoom, height:CH*zoom}}/>
                </div>
              </div>
            </div>

            {/* Elytra editor */}
            <div style={{ display: activeTab === 'elytra' ? 'block' : 'none' }}>
              <div className="overflow-auto rounded-lg border" style={{borderColor:'rgb(var(--border))', maxHeight:280}}>
                <div className="relative" style={{width:CW*zoom, height:CH*zoom}}>
                  <div className="absolute inset-0" style={{
                    backgroundImage:'repeating-conic-gradient(#cccccc 0% 25%, #ffffff 0% 50%)',
                    backgroundSize:`${zoom*2}px ${zoom*2}px`,
                    imageRendering:'pixelated',
                  }}/>
                  <canvas ref={elytra2dRef} width={CW} height={CH}
                    className="absolute inset-0 cursor-crosshair"
                    style={{width:CW*zoom, height:CH*zoom, imageRendering:'pixelated'}}
                    onMouseDown={e=>{
                      if (toolRef.current==='hand') return
                      saveUndoElytra(); paint2D(e, true); addRecent()
                      const up = () => { isPainting.current = false; window.removeEventListener('mouseup', up) }
                      const move = (ev: MouseEvent) => { if (isPainting.current) paint2D(ev as any, true) }
                      isPainting.current = true
                      window.addEventListener('mousemove', move as any)
                      window.addEventListener('mouseup', up)
                    }}
                  />
                  <canvas ref={elytraOverlayRef} width={CW*zoom} height={CH*zoom}
                    className="absolute inset-0 pointer-events-none"
                    style={{width:CW*zoom, height:CH*zoom}}/>
                </div>
              </div>
              <div className="mt-2 rounded-lg px-3 py-2 text-xs" style={{background:'rgb(var(--accent)/0.06)', border:'1px solid rgb(var(--accent)/0.15)', color:'rgb(var(--muted))'}}>
                <strong style={{color:'rgb(var(--text))'}}>Both wings</strong> share the outer face region. Paint once — both wings mirror it.
                Use <strong style={{color:'rgb(var(--text))'}}>Auto-fill from cape</strong> to generate wings automatically.
              </div>
            </div>

            {/* Region legend */}
            <div className="mt-3 grid grid-cols-2 gap-1">
              {activeRegions.filter(r=>r.w>1&&r.h>1).map(r=>(
                <div key={r.label} className="flex items-center gap-1.5 text-xs" style={{color:'rgb(var(--muted))'}}>
                  <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{background:r.color, border:`1px solid ${r.border}`}}/>
                  {r.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
