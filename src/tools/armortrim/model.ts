import * as THREE from 'three'

// Minecraft box UV unwrap. For a box of size (w,h,d) whose texture region starts at
// (u,v), sets the BoxGeometry UVs to the standard MC layout. tw/th = texture size.
// THREE BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 verts each).
function setBoxUV(geo: THREE.BoxGeometry, u: number, v: number, w: number, h: number, d: number, tw: number, th: number) {
  const uv = geo.attributes.uv as THREE.BufferAttribute
  const X = (x: number) => x / tw
  const Y = (y: number) => 1 - y / th
  // face quad given top-left (x1,y1) and bottom-right (x2,y2) in texel space.
  // BoxGeometry per-face vertex order is: TL, TR, BL, BR.
  const face = (i: number, x1: number, y1: number, x2: number, y2: number) => {
    uv.setXY(i * 4 + 0, X(x1), Y(y1))
    uv.setXY(i * 4 + 1, X(x2), Y(y1))
    uv.setXY(i * 4 + 2, X(x1), Y(y2))
    uv.setXY(i * 4 + 3, X(x2), Y(y2))
  }
  //            face        x1        y1     x2          y2
  face(2 /*+y top*/,   u + d,       v,     u + d + w,     v + d)
  face(3 /*-y bot*/,   u + d + w,   v,     u + d + 2 * w, v + d)
  face(1 /*-x left*/,  u,           v + d, u + d,         v + d + h)
  face(4 /*+z front*/, u + d,       v + d, u + d + w,     v + d + h)
  face(0 /*+x right*/, u + d + w,   v + d, u + d + 2 * w, v + d + h)
  face(5 /*-z back*/,  u + d + 2 * w, v + d, u + 2 * d + 2 * w, v + d + h)
  uv.needsUpdate = true
}

function box(w: number, h: number, d: number, u: number, v: number, tw: number, th: number, inflate = 0) {
  const g = new THREE.BoxGeometry(w + inflate * 2, h + inflate * 2, d + inflate * 2)
  setBoxUV(g, u, v, w, h, d, tw, th)
  return g
}

function tex(canvas: HTMLCanvasElement): THREE.Texture {
  const t = new THREE.CanvasTexture(canvas)
  t.magFilter = THREE.NearestFilter
  t.minFilter = THREE.NearestFilter
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// part placement in MC pixels, feet at y=0
export interface Part { name: string; size: [number, number, number]; skin: [number, number]; pos: [number, number, number] }
export const PARTS: Part[] = [
  { name: 'head', size: [8, 8, 8], skin: [0, 0], pos: [0, 28, 0] },
  { name: 'body', size: [8, 12, 4], skin: [16, 16], pos: [0, 18, 0] },
  { name: 'rarm', size: [4, 12, 4], skin: [40, 16], pos: [-6, 18, 0] },
  { name: 'larm', size: [4, 12, 4], skin: [32, 48], pos: [6, 18, 0] },
  { name: 'rleg', size: [4, 12, 4], skin: [0, 16], pos: [-2, 6, 0] },
  { name: 'lleg', size: [4, 12, 4], skin: [16, 48], pos: [2, 6, 0] },
]
// armor uses the same geometry but its texture is 64x32 with limbs mirrored to one side
const ARMOR_UV: Record<string, [number, number]> = {
  head: [0, 0], body: [16, 16], rarm: [40, 16], larm: [40, 16], rleg: [0, 16], lleg: [0, 16],
}
// second skin layer (hat / jacket / sleeves / pants) — 64x64
const OVERLAY_UV: Record<string, [number, number]> = {
  head: [32, 0], body: [16, 32], rarm: [40, 32], larm: [48, 48], rleg: [0, 32], lleg: [0, 48],
}

export function buildPlayer(skin: HTMLCanvasElement): THREE.Group {
  const t = tex(skin)
  const mat = new THREE.MeshLambertMaterial({ map: t })
  const overlayMat = new THREE.MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.01, depthWrite: false, side: THREE.DoubleSide })
  const g = new THREE.Group()
  for (const p of PARTS) {
    const m = new THREE.Mesh(box(p.size[0], p.size[1], p.size[2], p.skin[0], p.skin[1], 64, 64), mat)
    m.position.set(...p.pos)
    g.add(m)
    // outer skin layer, slightly inflated
    const [ou, ov] = OVERLAY_UV[p.name]
    const o = new THREE.Mesh(box(p.size[0], p.size[1], p.size[2], ou, ov, 64, 64, 0.3), overlayMat)
    o.position.set(...p.pos)
    o.renderOrder = 1
    g.add(o)
  }
  return g
}

// Which body parts each armor slot covers, and the per-slot inflation.
const SLOT_PARTS: Record<string, { parts: string[]; inflate: number; layer2?: boolean }> = {
  helmet: { parts: ['head'], inflate: 1.0 },
  chestplate: { parts: ['body', 'rarm', 'larm'], inflate: 1.0 },
  leggings: { parts: ['body', 'rleg', 'lleg'], inflate: 0.5, layer2: true },
  boots: { parts: ['rleg', 'lleg'], inflate: 1.0 },
}

function partByName(name: string) { return PARTS.find(p => p.name === name)! }

export function buildArmorSlot(slot: string, baseCanvas: HTMLCanvasElement, trimCanvas: HTMLCanvasElement | null): THREE.Group {
  const cfg = SLOT_PARTS[slot]
  const g = new THREE.Group()
  const baseTex = tex(baseCanvas)
  const baseMat = new THREE.MeshLambertMaterial({ map: baseTex, transparent: true, alphaTest: 0.5 })
  const trimTex = trimCanvas ? tex(trimCanvas) : null
  const trimMat = trimTex ? new THREE.MeshLambertMaterial({ map: trimTex, transparent: true, alphaTest: 0.05, polygonOffset: true, polygonOffsetFactor: -1 }) : null

  for (const name of cfg.parts) {
    const p = partByName(name)
    const [au, av] = ARMOR_UV[name]
    const mkBox = (inf: number) => box(p.size[0], p.size[1], p.size[2], au, av, 64, 32, inf)

    const base = new THREE.Mesh(mkBox(cfg.inflate), baseMat)
    base.position.set(...p.pos)
    g.add(base)

    if (trimMat) {
      const tm = new THREE.Mesh(mkBox(cfg.inflate + 0.02), trimMat)
      tm.position.set(...p.pos)
      g.add(tm)
    }
  }
  return g
}

export { tex }
