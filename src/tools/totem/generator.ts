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

function buildWavyTotem(skin: Skin, topLayers: TopLayer[] = ALL_TOP_LAYERS): HTMLCanvasElement {
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

export async function generateTotemCanvas(skin: Skin): Promise<HTMLCanvasElement> {
  return buildWavyTotem(skin, ALL_TOP_LAYERS)
}

export async function generateTotemFromFile(file: File): Promise<{ canvas: HTMLCanvasElement; blob: Blob }> {
  const skin = await Skin.fromBlob(file, 'auto')
  const canvas = buildWavyTotem(skin, ALL_TOP_LAYERS)
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => b ? res(b) : rej(new Error('PNG encode failed')), 'image/png'))
  return { canvas, blob }
}

export async function generateTotemFromUsername(username: string): Promise<{ canvas: HTMLCanvasElement; blob: Blob }> {
  const url = await fetchSkinUrl(username)
  const skin = await skinFromUrl(url)
  const canvas = buildWavyTotem(skin, ALL_TOP_LAYERS)
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => b ? res(b) : rej(new Error('PNG encode failed')), 'image/png'))
  return { canvas, blob }
}

export async function generatePackFromFile(file: File, name = 'Custom Totem'): Promise<Blob> {
  const { blob: totemBlob } = await generateTotemFromFile(file)
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  zip.file('assets/minecraft/textures/item/totem_of_undying.png', totemBlob)
  zip.file('pack.png', totemBlob)
  zip.file('pack.mcmeta', JSON.stringify({ pack: { pack_format: 34, description: `${name} — Made with MCTools v3` } }, null, 2))
  return zip.generateAsync({ type: 'blob' })
}

export async function generatePackFromUsername(username: string): Promise<Blob> {
  const { blob: totemBlob } = await generateTotemFromUsername(username)
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  zip.file('assets/minecraft/textures/item/totem_of_undying.png', totemBlob)
  zip.file('pack.png', totemBlob)
  zip.file('pack.mcmeta', JSON.stringify({ pack: { pack_format: 34, description: `${username}'s Totem — Made with MCTools v3` } }, null, 2))
  return zip.generateAsync({ type: 'blob' })
}
