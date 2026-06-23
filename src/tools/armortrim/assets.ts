const ASSET_BASE = '/mc-assets/1.21.11'

const glob = (pattern: Record<string, string>) => {
  const out: Record<string, string> = {}
  for (const [path, url] of Object.entries(pattern)) {
    const name = path.split('/').pop()!.replace('.png', '')
    out[name] = url
  }
  return out
}

const url = (p: string) => `${ASSET_BASE}${p}`

export const ARMOR = {
  leather: url('/entity/equipment/humanoid/leather.png'),
  chainmail: url('/entity/equipment/humanoid/chainmail.png'),
  iron: url('/entity/equipment/humanoid/iron.png'),
  gold: url('/entity/equipment/humanoid/gold.png'),
  diamond: url('/entity/equipment/humanoid/diamond.png'),
  netherite: url('/entity/equipment/humanoid/netherite.png'),
  turtle_scute: url('/entity/equipment/humanoid/turtle_scute.png'),
} as const

export const LEGGINGS = {
  leather: url('/entity/equipment/humanoid_leggings/leather.png'),
  chainmail: url('/entity/equipment/humanoid_leggings/chainmail.png'),
  iron: url('/entity/equipment/humanoid_leggings/iron.png'),
  gold: url('/entity/equipment/humanoid_leggings/gold.png'),
  diamond: url('/entity/equipment/humanoid_leggings/diamond.png'),
  netherite: url('/entity/equipment/humanoid_leggings/netherite.png'),
  turtle_scute: url('/entity/equipment/humanoid_leggings/turtle_scute.png'),
} as const

export const TRIM = {
  bolt: url('/trims/entity/humanoid/bolt.png'),
  coast: url('/trims/entity/humanoid/coast.png'),
  dune: url('/trims/entity/humanoid/dune.png'),
  eye: url('/trims/entity/humanoid/eye.png'),
  host: url('/trims/entity/humanoid/host.png'),
  raiser: url('/trims/entity/humanoid/raiser.png'),
  rib: url('/trims/entity/humanoid/rib.png'),
  sentry: url('/trims/entity/humanoid/sentry.png'),
  shaper: url('/trims/entity/humanoid/shaper.png'),
  silence: url('/trims/entity/humanoid/silence.png'),
  snout: url('/trims/entity/humanoid/snout.png'),
  flow: url('/trims/entity/humanoid/flow.png'),
  spire: url('/trims/entity/humanoid/spire.png'),
  tide: url('/trims/entity/humanoid/tide.png'),
  vex: url('/trims/entity/humanoid/vex.png'),
  ward: url('/trims/entity/humanoid/ward.png'),
  wayfinder: url('/trims/entity/humanoid/wayfinder.png'),
  wild: url('/trims/entity/humanoid/wild.png'),
} as const

export const TRIM_LEG = {
  bolt: url('/trims/entity/humanoid_leggings/bolt.png'),
  coast: url('/trims/entity/humanoid_leggings/coast.png'),
  dune: url('/trims/entity/humanoid_leggings/dune.png'),
  eye: url('/trims/entity/humanoid_leggings/eye.png'),
  host: url('/trims/entity/humanoid_leggings/host.png'),
  raiser: url('/trims/entity/humanoid_leggings/raiser.png'),
  rib: url('/trims/entity/humanoid_leggings/rib.png'),
  sentry: url('/trims/entity/humanoid_leggings/sentry.png'),
  shaper: url('/trims/entity/humanoid_leggings/shaper.png'),
  silence: url('/trims/entity/humanoid_leggings/silence.png'),
  snout: url('/trims/entity/humanoid_leggings/snout.png'),
  flow: url('/trims/entity/humanoid_leggings/flow.png'),
  spire: url('/trims/entity/humanoid_leggings/spire.png'),
  tide: url('/trims/entity/humanoid_leggings/tide.png'),
  vex: url('/trims/entity/humanoid_leggings/vex.png'),
  ward: url('/trims/entity/humanoid_leggings/ward.png'),
  wayfinder: url('/trims/entity/humanoid_leggings/wayfinder.png'),
  wild: url('/trims/entity/humanoid_leggings/wild.png'),
} as const

export const PALETTES = {
  trim_palette: url('/trims/color_palettes/trim_palette.png'),
  quartz: url('/trims/color_palettes/quartz.png'),
  iron: url('/trims/color_palettes/iron.png'),
  gold: url('/trims/color_palettes/gold.png'),
  netherite: url('/trims/color_palettes/netherite.png'),
  redstone: url('/trims/color_palettes/redstone.png'),
  copper: url('/trims/color_palettes/copper.png'),
  emerald: url('/trims/color_palettes/emerald.png'),
  lapis: url('/trims/color_palettes/lapis.png'),
  amethyst: url('/trims/color_palettes/amethyst.png'),
  diamond: url('/trims/color_palettes/diamond.png'),
  resin: url('/trims/color_palettes/resin.png'),
} as const

export const DEFAULT_SKIN = `${ASSET_BASE}/entity/player/wide/steve.png`

export const ARMOR_MATERIALS = ['leather', 'chainmail', 'iron', 'gold', 'diamond', 'netherite', 'turtle_scute']
  .filter(m => ARMOR[m as keyof typeof ARMOR]) as (keyof typeof ARMOR)[]

export const TRIM_PATTERNS = Object.keys(TRIM).sort()

export const TRIM_MATERIALS = ['quartz', 'iron', 'gold', 'netherite', 'redstone', 'copper', 'emerald', 'lapis', 'amethyst', 'diamond', 'resin']
  .filter(m => PALETTES[m as keyof typeof PALETTES]) as (keyof typeof PALETTES)[]

export const PRETTY: Record<string, string> = {
  turtle_scute: 'turtle',
  leather: 'leather',
  chainmail: 'chainmail',
  iron: 'iron',
  gold: 'golden',
  diamond: 'diamond',
  netherite: 'netherite',
}

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

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => res(img)
    img.onerror = () => rej(new Error(`Failed to load image: ${url}`))
    img.src = url
  })
}

function imageData(img: HTMLImageElement): ImageData {
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, 0, 0)
  return ctx.getImageData(0, 0, img.width, img.height)
}

const skinCache = new Map<string, Promise<HTMLCanvasElement>>()

export function textureCanvas(url: string): Promise<HTMLCanvasElement> {
  if (skinCache.has(url)) return skinCache.get(url)!
  const p = load(url).then(img => {
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, 0, 0)
    return c
  })
  skinCache.set(url, p)
  return p
}

const trimCache = new Map<string, Promise<HTMLCanvasElement>>()

export function recolorTrim(trimUrl: string, materialKey: string): Promise<HTMLCanvasElement> {
  const cacheKey = trimUrl + '|' + materialKey
  if (trimCache.has(cacheKey)) return trimCache.get(cacheKey)!
  const p = (async () => {
    const [trimImg, srcImg, dstImg] = await Promise.all([
      load(trimUrl),
      load(PALETTES.trim_palette),
      load(PALETTES[materialKey as keyof typeof PALETTES] || PALETTES.iron),
    ])
    const trim = imageData(trimImg)
    const src = imageData(srcImg).data
    const dst = imageData(dstImg).data
    const n = srcImg.width
    const grayToIdx = new Map<number, number>()
    for (let i = 0; i < n; i++) grayToIdx.set(src[i * 4], i)
    const srcGrays = [...grayToIdx.keys()]

    const d = trim.data
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue
      const g = d[i]
      let idx = grayToIdx.get(g)
      if (idx === undefined) {
        let best = 0
        let bestDiff = 1e9
        for (const sg of srcGrays) {
          const diff = Math.abs(sg - g)
          if (diff < bestDiff) {
            bestDiff = diff
            best = sg
          }
        }
        idx = grayToIdx.get(best)!
      }
      d[i] = dst[idx * 4]
      d[i + 1] = dst[idx * 4 + 1]
      d[i + 2] = dst[idx * 4 + 2]
    }

    const c = document.createElement('canvas')
    c.width = trim.width
    c.height = trim.height
    c.getContext('2d')!.putImageData(trim, 0, 0)
    return c
  })()
  trimCache.set(cacheKey, p)
  return p
}