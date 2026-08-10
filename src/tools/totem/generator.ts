export enum TopLayer {
  HEAD = 1 << 0,
  TORSO = 1 << 1,
  HANDS = 1 << 2,
  LEGS = 1 << 3,
}

export const ALL_TOP_LAYERS: TopLayer[] = [
  TopLayer.HEAD,
  TopLayer.TORSO,
  TopLayer.HANDS,
  TopLayer.LEGS,
]

class Skin {
  readonly image: ImageBitmap
  readonly version: 'new' | 'old'
  readonly availableSecond: boolean
  readonly isSlim: boolean
  private _baseCtx: CanvasRenderingContext2D

  private constructor(img: ImageBitmap, isSlim: boolean) {
    this.image = img
    this.version = img.height === 64 ? 'new' : 'old'
    this.availableSecond = this.version === 'new'
    this.isSlim = isSlim
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, 0, 0)
    this._baseCtx = ctx
  }

  static async fromBlob(blob: Blob, slim: boolean | 'auto' = 'auto'): Promise<Skin> {
    const img = await createImageBitmap(blob)
    const isSlim = slim === 'auto' ? Skin.detectSlim(img) : slim
    return new Skin(img, isSlim)
  }

  private static detectSlim(img: ImageBitmap): boolean {
    if (img.height === 32) return false
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    return ctx.getImageData(46, 52, 1, 1).data[3] === 0
  }

  crop(x: number, y: number, w: number, h: number): ImageData {
    return this._baseCtx.getImageData(x, y, w, h)
  }

  get head_front() { return this.crop(8, 8, 8, 8) }
  get head_second_front() { return this.availableSecond ? this.crop(40, 8, 8, 8) : null }
  get body_front() { return this.crop(20, 20, 8, 12) }
  get body_second_front() { return this.availableSecond ? this.crop(20, 36, 8, 12) : null }
  get right_leg_front() { return this.crop(4, 20, 4, 12) }
  get right_leg_second_front() { return this.availableSecond ? this.crop(4, 36, 4, 12) : null }
  get left_leg_front() { return this.version === 'old' ? this.right_leg_front : this.crop(20, 52, 4, 12) }
  get left_leg_second_front() { return this.availableSecond ? this.crop(4, 52, 4, 12) : null }
  get right_hand_front() { return this.isSlim ? this.crop(44, 20, 3, 12) : this.crop(44, 20, 4, 12) }
  get right_hand_second_front() { return this.availableSecond ? (this.isSlim ? this.crop(44, 36, 3, 12) : this.crop(44, 36, 4, 12)) : null }
  get left_hand_front() { return this.version === 'old' ? this.right_hand_front : (this.isSlim ? this.crop(36, 52, 3, 12) : this.crop(36, 52, 4, 12)) }
  get left_hand_second_front() { return this.availableSecond ? (this.isSlim ? this.crop(52, 52, 3, 12) : this.crop(52, 52, 4, 12)) : null }
}

function fromImageDataToCanvas(src: ImageData): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = src.width; c.height = src.height
  c.getContext('2d')!.putImageData(src, 0, 0)
  return c
}

export type TotemStyle = 'wavy' | 'stt'

export interface PackVersion {
  label: string
  packFormat: number
}

export const PACK_VERSIONS: PackVersion[] = [
  { label: '1.21.4',          packFormat: 46 },
  { label: '1.21.2 – 1.21.3', packFormat: 42 },
  { label: '1.21 – 1.21.1',   packFormat: 34 },
  { label: '1.20.5 – 1.20.6', packFormat: 32 },
  { label: '1.20.3 – 1.20.4', packFormat: 22 },
  { label: '1.20.2',          packFormat: 18 },
  { label: '1.20 – 1.20.1',   packFormat: 15 },
  { label: '1.19.4',          packFormat: 13 },
  { label: '1.19 – 1.19.3',   packFormat: 12 },
  { label: '1.18.2',          packFormat: 9  },
  { label: '1.18 – 1.18.1',   packFormat: 8  },
  { label: '1.17 – 1.17.1',   packFormat: 7  },
  { label: '1.16.2 – 1.16.5', packFormat: 6  },
  { label: '1.15 – 1.16.1',   packFormat: 5  },
  { label: '1.13 – 1.14.4',   packFormat: 4  },
  { label: '1.11 – 1.12.2',   packFormat: 3  },
  { label: '1.9 – 1.10.2',    packFormat: 2  },
  { label: '1.6.1 – 1.8.9',   packFormat: 1  },
]

function rotateCanvas90(src: HTMLCanvasElement, dir: 'cw' | 'ccw'): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = src.height; c.height = src.width
  const rctx = c.getContext('2d')!; rctx.imageSmoothingEnabled = false
  rctx.translate(c.width / 2, c.height / 2)
  rctx.rotate(dir === 'cw' ? Math.PI / 2 : -Math.PI / 2)
  rctx.drawImage(src, -src.width / 2, -src.height / 2)
  return c
}

function roundHeadCorners(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(4, 1, 1, 1)
  ctx.clearRect(11, 1, 1, 1)
}

function buildSTTTotem(skin: Skin, topLayers: TopLayer[] = ALL_TOP_LAYERS, roundHead = false): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 16; canvas.height = 16
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, 16, 16)

  function cropToCanvas(x: number, y: number, w: number, h: number): HTMLCanvasElement {
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    c.getContext('2d')!.putImageData(skin.crop(x, y, w, h), 0, 0)
    return c
  }

  // HEAD
  ctx.drawImage(fromImageDataToCanvas(skin.head_front), 4, 1)
  if (skin.availableSecond && topLayers.includes(TopLayer.HEAD)) {
    const h2 = skin.head_second_front
    if (h2) ctx.drawImage(fromImageDataToCanvas(h2), 4, 1)
  }
  if (roundHead) roundHeadCorners(ctx)

  // BODY — 8×4 composite pasted at (4, 9)
  {
    const body = document.createElement('canvas')
    body.width = 8; body.height = 4
    const bctx = body.getContext('2d')!; bctx.imageSmoothingEnabled = false
    bctx.drawImage(cropToCanvas(20, 21, 8, 1), 0, 0)
    bctx.drawImage(cropToCanvas(20, 23, 8, 1), 0, 1)
    bctx.drawImage(cropToCanvas(20, 29, 8, 1), 0, 2)
    bctx.drawImage(cropToCanvas(20, 31, 8, 1), 0, 3)
    if (topLayers.includes(TopLayer.TORSO)) {
      bctx.drawImage(cropToCanvas(20, 37, 8, 1), 0, 0)
      bctx.drawImage(cropToCanvas(20, 39, 8, 1), 0, 1)
      bctx.drawImage(cropToCanvas(20, 45, 8, 1), 0, 2)
      bctx.drawImage(cropToCanvas(20, 47, 8, 1), 0, 3)
    }
    ctx.drawImage(body, 4, 9)
  }

  // LEGS — 6×3 composite pasted at (5, 13)
  {
    const legs = document.createElement('canvas')
    legs.width = 6; legs.height = 3
    const lctx = legs.getContext('2d')!; lctx.imageSmoothingEnabled = false
    lctx.drawImage(cropToCanvas(4, 20, 1, 2), 0, 0)
    lctx.drawImage(cropToCanvas(6, 20, 2, 2), 1, 0)
    lctx.drawImage(cropToCanvas(20, 52, 2, 2), 3, 0)
    lctx.drawImage(cropToCanvas(23, 52, 1, 2), 5, 0)
    lctx.drawImage(cropToCanvas(4, 31, 1, 1), 1, 2)
    lctx.drawImage(cropToCanvas(7, 31, 1, 1), 2, 2)
    lctx.drawImage(cropToCanvas(20, 63, 1, 1), 3, 2)
    lctx.drawImage(cropToCanvas(23, 63, 1, 1), 4, 2)
    if (topLayers.includes(TopLayer.LEGS)) {
      lctx.drawImage(cropToCanvas(4, 36, 1, 2), 0, 0)
      lctx.drawImage(cropToCanvas(6, 36, 2, 2), 1, 0)
      lctx.drawImage(cropToCanvas(4, 52, 2, 2), 3, 0)
      lctx.drawImage(cropToCanvas(7, 52, 1, 2), 5, 0)
      lctx.drawImage(cropToCanvas(4, 47, 1, 1), 1, 2)
      lctx.drawImage(cropToCanvas(7, 47, 1, 1), 2, 2)
      lctx.drawImage(cropToCanvas(4, 63, 1, 1), 3, 2)
      lctx.drawImage(cropToCanvas(7, 63, 1, 1), 4, 2)
    }
    ctx.drawImage(legs, 5, 13)
  }

  // ARMS — 14×3 composite pasted at (1, 8)
  {
    const slim = skin.isSlim
    const arms = document.createElement('canvas')
    arms.width = 14; arms.height = 3
    const actx = arms.getContext('2d')!; actx.imageSmoothingEnabled = false
    // PIL rotate(90) = CCW; PIL rotate(-90) = CW
    actx.drawImage(rotateCanvas90(cropToCanvas(37, 52, slim ? 2 : 3, 2), 'ccw'), 11, 0)
    actx.drawImage(rotateCanvas90(cropToCanvas(44, 20, slim ? 2 : 3, 2), 'cw'), 1, 0)
    actx.drawImage(cropToCanvas(39, 63, 1, 1), 13, 0)
    actx.drawImage(cropToCanvas(36, 63, 1, 1), 13, 1)
    actx.drawImage(cropToCanvas(44, 31, 1, 1), 0, 0)
    actx.drawImage(cropToCanvas(47, 31, 1, 1), 0, 1)
    if (topLayers.includes(TopLayer.HANDS)) {
      actx.drawImage(rotateCanvas90(cropToCanvas(53, 52, 3, 2), 'ccw'), 11, 0)
      actx.drawImage(rotateCanvas90(cropToCanvas(44, 36, 3, 2), 'cw'), 1, 0)
      actx.drawImage(cropToCanvas(55, 63, 1, 1), 13, 0)
      actx.drawImage(cropToCanvas(52, 63, 1, 1), 13, 1)
      actx.drawImage(cropToCanvas(44, 47, 1, 1), 0, 0)
      actx.drawImage(cropToCanvas(47, 47, 1, 1), 0, 1)
    }
    ctx.drawImage(arms, 1, 8)
  }

  if (skin.version === 'old') {
    const leftHalf = ctx.getImageData(0, 0, 8, 16)
    const tmp = document.createElement('canvas'); tmp.width = 8; tmp.height = 16
    tmp.getContext('2d')!.putImageData(leftHalf, 0, 0)
    const mirrored = document.createElement('canvas'); mirrored.width = 8; mirrored.height = 16
    const mctx = mirrored.getContext('2d')!; mctx.translate(8, 0); mctx.scale(-1, 1)
    mctx.drawImage(tmp, 0, 0)
    ctx.drawImage(mirrored, 8, 0)
  }

  return canvas
}

function buildWavyTotem(skin: Skin, topLayers: TopLayer[] = ALL_TOP_LAYERS, roundHead = false): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 16; canvas.height = 16
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, 16, 16)

  // HEAD
  {
    ctx.drawImage(fromImageDataToCanvas(skin.head_front), 4, 1)
    if (skin.availableSecond && topLayers.includes(TopLayer.HEAD)) {
      const h2 = skin.head_second_front
      if (h2) ctx.drawImage(fromImageDataToCanvas(h2), 4, 1)
    }
    if (roundHead) roundHeadCorners(ctx)
  }

  // HANDS
  {
    const slim = skin.isSlim
    const skin_map: [[number, number, number, number], [number, number]][] = slim
      ? [[[0, 0, 3, 1], [2, 1]], [[0, 5, 3, 6], [2, 1]], [[0, 11, 3, 12], [2, 1]]]
      : [[[0, 0, 4, 1], [3, 1]], [[0, 5, 4, 6], [3, 1]], [[0, 11, 4, 12], [2, 1]]]
    const dest_left: [number, number][] = [[3, 8], [2, 8], [1, 8]]
    const dest_right: [number, number][] = [[12, 8], [13, 8], [14, 8]]

    function handLine(hand: ImageData, srcRect: [number, number, number, number], size: [number, number]): HTMLCanvasElement {
      const [sx, sy, ex, ey] = srcRect
      const w = ex - sx, h = ey - sy
      const [rw, rh] = size
      const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h
      tmp.getContext('2d')!.putImageData(hand, -sx, -sy)
      const resized = document.createElement('canvas'); resized.width = rw; resized.height = rh
      const rctx = resized.getContext('2d')!; rctx.imageSmoothingEnabled = false
      rctx.drawImage(tmp, 0, 0, w, h, 0, 0, rw, rh)
      const rotated = document.createElement('canvas'); rotated.width = rh; rotated.height = rw
      const roctx = rotated.getContext('2d')!; roctx.imageSmoothingEnabled = false
      roctx.translate(rotated.width / 2, rotated.height / 2)
      roctx.rotate(Math.PI / 2)
      roctx.drawImage(resized, -rw / 2, -rh / 2)
      return rotated
    }

    const lhCtx = fromImageDataToCanvas(skin.left_hand_front).getContext('2d')!
    const rhCtx = fromImageDataToCanvas(skin.right_hand_front).getContext('2d')!
    const useSecond = skin.availableSecond && topLayers.includes(TopLayer.HANDS)

    for (let i = 0; i < skin_map.length; i++) {
      const [rect, size] = skin_map[i]
      const [sx, sy, ex, ey] = rect
      const w = ex - sx, h = ey - sy
      ctx.drawImage(handLine(lhCtx.getImageData(sx, sy, w, h), [0, 0, w, h], size), dest_left[i][0], dest_left[i][1])
      ctx.drawImage(handLine(rhCtx.getImageData(sx, sy, w, h), [0, 0, w, h], size), dest_right[i][0], dest_right[i][1])
      if (useSecond) {
        const lt = skin.left_hand_second_front; const rt = skin.right_hand_second_front
        if (lt && rt) {
          const ltCtx = fromImageDataToCanvas(lt).getContext('2d')!
          const rtCtx = fromImageDataToCanvas(rt).getContext('2d')!
          ctx.drawImage(handLine(ltCtx.getImageData(sx, sy, w, h), [0, 0, w, h], size), dest_left[i][0], dest_left[i][1])
          ctx.drawImage(handLine(rtCtx.getImageData(sx, sy, w, h), [0, 0, w, h], size), dest_right[i][0], dest_right[i][1])
        }
      }
    }
  }

  // TORSO
  {
    const tc = fromImageDataToCanvas(skin.body_front)
    const tr = document.createElement('canvas'); tr.width = 8; tr.height = 7
    const trctx = tr.getContext('2d')!; trctx.imageSmoothingEnabled = false
    trctx.drawImage(tc, 0, 0, tc.width, tc.height, 0, 0, 8, 7)
    ctx.drawImage(tr, 4, 9)
    if (skin.availableSecond && topLayers.includes(TopLayer.TORSO)) {
      const t2 = skin.body_second_front
      if (t2) {
        const t2c = fromImageDataToCanvas(t2)
        const t2r = document.createElement('canvas'); t2r.width = 8; t2r.height = 7
        const t2rctx = t2r.getContext('2d')!; t2rctx.imageSmoothingEnabled = false
        t2rctx.drawImage(t2c, 0, 0, t2c.width, t2c.height, 0, 0, 8, 7)
        ctx.drawImage(t2r, 4, 9)
      }
    }
    const empty: [number, number][] = [[4, 15], [5, 15], [4, 14], [4, 13], [10, 15], [11, 15], [11, 14], [11, 13]]
    empty.forEach(([ex, ey]) => ctx.clearRect(ex, ey, 1, 1))
  }

  // LEGS
  {
    function legBottom(leg: ImageData): HTMLCanvasElement {
      const fc = fromImageDataToCanvas(leg); const lctx = fc.getContext('2d')!
      const strip = lctx.getImageData(0, 11, 4, 1)
      const tmp = document.createElement('canvas'); tmp.width = 4; tmp.height = 1
      tmp.getContext('2d')!.putImageData(strip, 0, 0)
      const res = document.createElement('canvas'); res.width = 2; res.height = 1
      const rctx = res.getContext('2d')!; rctx.imageSmoothingEnabled = false
      rctx.drawImage(tmp, 0, 0, 4, 1, 0, 0, 2, 1)
      return res
    }
    ctx.drawImage(legBottom(skin.right_leg_front), 6, 15)
    ctx.drawImage(legBottom(skin.left_leg_front), 8, 15)
    if (skin.availableSecond && topLayers.includes(TopLayer.LEGS)) {
      const rl2 = skin.right_leg_second_front; const ll2 = skin.left_leg_second_front
      if (rl2 && ll2) {
        ctx.drawImage(legBottom(rl2), 8, 15)
        ctx.drawImage(legBottom(ll2), 6, 15)
      }
    }
  }

  return canvas
}

async function fetchSkinUrl(username: string): Promise<string> {
  const profileRes = await fetch(
    `https://cors-proxy-rouge.vercel.app/?url=https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`
  )
  if (!profileRes.ok) throw new Error('Player not found')
  const profile = await profileRes.json() as { id: string }
  const sessionRes = await fetch(
    `https://cors-proxy-rouge.vercel.app/?url=https://sessionserver.mojang.com/session/minecraft/profile/${profile.id}`
  )
  if (!sessionRes.ok) throw new Error('Failed to fetch profile')
  const session = await sessionRes.json() as { properties: { name: string; value: string }[] }
  const prop = session.properties.find((p) => p.name === 'textures')
  if (!prop) throw new Error('No textures found')
  const decoded = JSON.parse(atob(prop.value)) as { textures: { SKIN: { url: string } } }
  return decoded.textures.SKIN.url
}

async function skinFromUrl(url: string): Promise<Skin> {
  const httpsUrl = url.replace(/^http:\/\//, 'https://')
  const res = await fetch(httpsUrl)
  if (!res.ok) throw new Error('Failed to fetch skin')
  return Skin.fromBlob(await res.blob(), 'auto')
}

function buildTotem(style: TotemStyle, skin: Skin, topLayers: TopLayer[] = ALL_TOP_LAYERS, roundHead = false): HTMLCanvasElement {
  return style === 'stt' ? buildSTTTotem(skin, topLayers, roundHead) : buildWavyTotem(skin, topLayers, roundHead)
}

export async function generateTotemCanvas(skin: Skin): Promise<HTMLCanvasElement> {
  return buildWavyTotem(skin, ALL_TOP_LAYERS)
}

export async function generateTotemFromFile(file: File, style: TotemStyle = 'wavy', roundHead = false): Promise<{ canvas: HTMLCanvasElement; blob: Blob }> {
  const skin = await Skin.fromBlob(file, 'auto')
  const canvas = buildTotem(style, skin, ALL_TOP_LAYERS, roundHead)
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => b ? res(b) : rej(new Error('PNG encode failed')), 'image/png'))
  return { canvas, blob }
}

export async function generateTotemFromUsername(username: string, style: TotemStyle = 'wavy', roundHead = false): Promise<{ canvas: HTMLCanvasElement; blob: Blob }> {
  const url = await fetchSkinUrl(username)
  const skin = await skinFromUrl(url)
  const canvas = buildTotem(style, skin, ALL_TOP_LAYERS, roundHead)
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => b ? res(b) : rej(new Error('PNG encode failed')), 'image/png'))
  return { canvas, blob }
}

export async function generatePackFromFile(file: File, style: TotemStyle = 'wavy', packFormat = PACK_VERSIONS[0].packFormat, roundHead = false, name = 'Custom Totem'): Promise<Blob> {
  const { blob: totemBlob } = await generateTotemFromFile(file, style, roundHead)
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  zip.file('assets/minecraft/textures/item/totem_of_undying.png', totemBlob)
  zip.file('pack.png', totemBlob)
  zip.file('pack.mcmeta', JSON.stringify({ pack: { pack_format: packFormat, description: `${name} — Made with MCTools v3` } }, null, 2))
  return zip.generateAsync({ type: 'blob' })
}

export async function generatePackFromUsername(username: string, style: TotemStyle = 'wavy', packFormat = PACK_VERSIONS[0].packFormat, roundHead = false): Promise<Blob> {
  const { blob: totemBlob } = await generateTotemFromUsername(username, style, roundHead)
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  zip.file('assets/minecraft/textures/item/totem_of_undying.png', totemBlob)
  zip.file('pack.png', totemBlob)
  zip.file('pack.mcmeta', JSON.stringify({ pack: { pack_format: packFormat, description: `${username}'s Totem — Made with MCTools v3` } }, null, 2))
  return zip.generateAsync({ type: 'blob' })
}
