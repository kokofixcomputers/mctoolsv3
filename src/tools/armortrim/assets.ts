// Loads Minecraft armor / trim / skin textures from the installed `minecraft-assets`
// package (referenced at runtime — not vendored) and recolours trims via palettes.

const glob = (pattern: Record<string, string>) => {
  const out: Record<string, string> = {}
  for (const [path, url] of Object.entries(pattern)) {
    const name = path.split('/').pop()!.replace('.png', '')
    out[name] = url
  }
  return out
}

const A = '/node_modules/minecraft-assets/minecraft-assets/data/1.21.8'

export const ARMOR = glob((import.meta as any).glob(
  '/node_modules/minecraft-assets/minecraft-assets/data/1.21.8/entity/equipment/humanoid/*.png',
  { eager: true, query: '?url', import: 'default' }) as Record<string, string>)
export const LEGGINGS = glob((import.meta as any).glob(
  '/node_modules/minecraft-assets/minecraft-assets/data/1.21.8/entity/equipment/humanoid_leggings/*.png',
  { eager: true, query: '?url', import: 'default' }) as Record<string, string>)
export const TRIM = glob((import.meta as any).glob(
  '/node_modules/minecraft-assets/minecraft-assets/data/1.21.8/trims/entity/humanoid/*.png',
  { eager: true, query: '?url', import: 'default' }) as Record<string, string>)
export const TRIM_LEG = glob((import.meta as any).glob(
  '/node_modules/minecraft-assets/minecraft-assets/data/1.21.8/trims/entity/humanoid_leggings/*.png',
  { eager: true, query: '?url', import: 'default' }) as Record<string, string>)
export const PALETTES = glob((import.meta as any).glob(
  '/node_modules/minecraft-assets/minecraft-assets/data/1.21.8/trims/color_palettes/*.png',
  { eager: true, query: '?url', import: 'default' }) as Record<string, string>)

export const DEFAULT_SKIN = `${A}/entity/player/wide/steve.png`

// ── lists for the UI ──────────────────────────────────────────────────────────────
export const ARMOR_MATERIALS = ['leather', 'chainmail', 'iron', 'gold', 'diamond', 'netherite', 'turtle_scute']
  .filter(m => ARMOR[m])
export const TRIM_PATTERNS = Object.keys(TRIM).sort()
export const TRIM_MATERIALS = ['quartz', 'iron', 'gold', 'netherite', 'redstone', 'copper', 'emerald', 'lapis', 'amethyst', 'diamond', 'resin']
  .filter(m => PALETTES[m])

export const PRETTY: Record<string, string> = {
  turtle_scute: 'turtle', leather: 'leather', chainmail: 'chainmail', iron: 'iron',
  gold: 'golden', diamond: 'diamond', netherite: 'netherite',
}

// ── username → skin URL (same Mojang + CORS-proxy path as the Totem tool) ───────────
export async function fetchSkinUrl(username: string): Promise<string> {
  const profileRes = await fetch(`https://cors-proxy-rouge.vercel.app/?url=https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`)
  if (!profileRes.ok) throw new Error('Player not found')
  const profile = await profileRes.json() as { id: string }
  const sessionRes = await fetch(`https://cors-proxy-rouge.vercel.app/?url=https://sessionserver.mojang.com/session/minecraft/profile/${profile.id}`)
  if (!sessionRes.ok) throw new Error('Failed to fetch profile')
  const session = await sessionRes.json() as { properties: { name: string; value: string }[] }
  const prop = session.properties.find(p => p.name === 'textures')
  if (!prop) throw new Error('No skin found')
  const decoded = JSON.parse(atob(prop.value)) as { textures: { SKIN?: { url: string } } }
  if (!decoded.textures.SKIN) throw new Error('Player has no custom skin')
  return decoded.textures.SKIN.url.replace(/^http:\/\//, 'https://')
}

// ── image helpers ─────────────────────────────────────────────────────────────────
function load(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => res(img)
    img.onerror = rej
    img.src = url
  })
}

function imageData(img: HTMLImageElement): ImageData {
  const c = document.createElement('canvas')
  c.width = img.width; c.height = img.height
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, 0, 0)
  return ctx.getImageData(0, 0, img.width, img.height)
}

const skinCache = new Map<string, Promise<HTMLCanvasElement>>()

/** A plain texture from a URL, rendered onto a canvas (so three can use it). */
export function textureCanvas(url: string): Promise<HTMLCanvasElement> {
  if (skinCache.has(url)) return skinCache.get(url)!
  const p = load(url).then(img => {
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, 0, 0)
    return c
  })
  skinCache.set(url, p)
  return p
}

const trimCache = new Map<string, Promise<HTMLCanvasElement>>()

/**
 * Recolour a grayscale trim texture using Minecraft's palette swap: each pixel's
 * gray value maps (by index) from the source `trim_palette` ramp to the target
 * material ramp.
 */
export function recolorTrim(trimUrl: string, materialKey: string): Promise<HTMLCanvasElement> {
  const cacheKey = trimUrl + '|' + materialKey
  if (trimCache.has(cacheKey)) return trimCache.get(cacheKey)!
  const p = (async () => {
    const [trimImg, srcImg, dstImg] = await Promise.all([
      load(trimUrl), load(PALETTES['trim_palette']), load(PALETTES[materialKey] || PALETTES['iron']),
    ])
    const trim = imageData(trimImg)
    const src = imageData(srcImg).data  // 8x1 grayscale ramp
    const dst = imageData(dstImg).data  // 8x1 rgb ramp
    const n = srcImg.width
    // map: source gray value -> palette index
    const grayToIdx = new Map<number, number>()
    for (let i = 0; i < n; i++) grayToIdx.set(src[i * 4], i)
    const srcGrays = [...grayToIdx.keys()]

    const d = trim.data
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue
      const g = d[i]
      let idx = grayToIdx.get(g)
      if (idx === undefined) {
        // nearest gray (textures occasionally have antialiased values)
        let best = 0, bestDiff = 1e9
        for (const sg of srcGrays) { const diff = Math.abs(sg - g); if (diff < bestDiff) { bestDiff = diff; best = sg } }
        idx = grayToIdx.get(best)!
      }
      d[i] = dst[idx * 4]; d[i + 1] = dst[idx * 4 + 1]; d[i + 2] = dst[idx * 4 + 2]
    }
    const c = document.createElement('canvas')
    c.width = trim.width; c.height = trim.height
    c.getContext('2d')!.putImageData(trim, 0, 0)
    return c
  })()
  trimCache.set(cacheKey, p)
  return p
}
