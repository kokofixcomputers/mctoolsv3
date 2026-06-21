/**
 * Achievement Generator
 *
 * Renders a pixel-perfect Minecraft advancement/achievement toast on a canvas
 * using the exact colors measured from the game's own texture files:
 *
 *   Toast background:
 *     outer 1px  #000000
 *     inner 2px  #555555  (highlight ring)
 *     fill       #212121
 *     corners    2px transparent cut
 *
 *   Icon frames (26×26 with transparent center/corners):
 *     task      / advancement: gold border  (#DBA213 / #AA7E0F / #493606)
 *     goal:     same but 1px wider cut
 *     challenge: same gold colors
 *
 * Font: Press Start 2P (Google Fonts) — closest free approximation of
 *       Minecraft's bitmap font; loaded via FontFace API before first render.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { Download, Copy, Check, Search } from 'lucide-react'
import { useVersion } from '../contexts/VersionContext'
import { itemRawUrl, blockRawUrl } from '../components/BlockRenderer'

// ── Font ──────────────────────────────────────────────────────────────────────

const FONT = 'MCToastFont'
let _fontP: Promise<void> | null = null
function loadFont() {
  if (!_fontP) {
    _fontP = (async () => {
      if (document.fonts.check(`8px "${FONT}"`)) return
      // Try woff2 first, fall back to Google Fonts CSS link
      try {
        const face = new FontFace(
          FONT,
          'url(https://fonts.gstatic.com/s/pressstart2p/v15/e3t4euO8T-267oIAQAu6jDQyK3nVivM.woff2)',
        )
        document.fonts.add(await face.load())
      } catch {
        // If the direct woff2 URL ever changes, load via CSS @import fallback
        const link = Object.assign(document.createElement('link'), {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=block',
        })
        document.head.appendChild(link)
        await document.fonts.ready
      }
    })()
  }
  return _fontP
}

// ── Toast geometry (game pixels) ─────────────────────────────────────────────

const TOAST_H  = 32   // toast is always 32 gp tall
const BORDER   = 3    // 1px black + 2px highlight on each side
const FRAME_SZ = 26   // advancement icon frame (26×26 gp)
const ICON_SZ  = 16   // icon is 16×16 gp, centered inside frame
const ICON_OFF = (FRAME_SZ - ICON_SZ) / 2  // 5gp offset
const TEXT_X   = BORDER + FRAME_SZ + 5     // text starts after frame + 5gp gap
const FONT_GP  = 8    // font height in game pixels
const LINE_GAP = 2    // gap between title and description lines
const SHADOW   = 1    // text shadow offset in game pixels

// ── Icon list ─────────────────────────────────────────────────────────────────

type IconSrc = 'item' | 'block'
interface Icon { id: string; label: string; src: IconSrc }

const ICONS: Icon[] = [
  { id: 'grass_block',           label: 'Grass Block',           src: 'block' },
  { id: 'crafting_table',        label: 'Crafting Table',         src: 'block' },
  { id: 'chest',                 label: 'Chest',                  src: 'block' },
  { id: 'furnace',               label: 'Furnace',                src: 'block' },
  { id: 'tnt',                   label: 'TNT',                    src: 'block' },
  { id: 'obsidian',              label: 'Obsidian',               src: 'block' },
  { id: 'bedrock',               label: 'Bedrock',                src: 'block' },
  { id: 'diamond_block',         label: 'Diamond Block',          src: 'block' },
  { id: 'diamond_ore',           label: 'Diamond Ore',            src: 'block' },
  { id: 'netherite_block',       label: 'Netherite Block',        src: 'block' },
  { id: 'beacon',                label: 'Beacon',                 src: 'block' },
  { id: 'cake',                  label: 'Cake',                   src: 'block' },
  { id: 'enchanting_table',      label: 'Enchanting Table',       src: 'block' },
  { id: 'end_portal_frame',      label: 'End Portal Frame',       src: 'block' },
  { id: 'diamond',               label: 'Diamond',                src: 'item'  },
  { id: 'diamond_sword',         label: 'Diamond Sword',          src: 'item'  },
  { id: 'diamond_pickaxe',       label: 'Diamond Pickaxe',        src: 'item'  },
  { id: 'diamond_axe',           label: 'Diamond Axe',            src: 'item'  },
  { id: 'netherite_sword',       label: 'Netherite Sword',        src: 'item'  },
  { id: 'netherite_pickaxe',     label: 'Netherite Pickaxe',      src: 'item'  },
  { id: 'iron_sword',            label: 'Iron Sword',             src: 'item'  },
  { id: 'iron_pickaxe',          label: 'Iron Pickaxe',           src: 'item'  },
  { id: 'wooden_pickaxe',        label: 'Wooden Pickaxe',         src: 'item'  },
  { id: 'bow',                   label: 'Bow',                    src: 'item'  },
  { id: 'crossbow',              label: 'Crossbow',               src: 'item'  },
  { id: 'fishing_rod',           label: 'Fishing Rod',            src: 'item'  },
  { id: 'flint_and_steel',       label: 'Flint & Steel',          src: 'item'  },
  { id: 'blaze_rod',             label: 'Blaze Rod',              src: 'item'  },
  { id: 'ender_pearl',           label: 'Ender Pearl',            src: 'item'  },
  { id: 'ender_eye',             label: 'Eye of Ender',           src: 'item'  },
  { id: 'nether_star',           label: 'Nether Star',            src: 'item'  },
  { id: 'elytra',                label: 'Elytra',                 src: 'item'  },
  { id: 'totem_of_undying',      label: 'Totem of Undying',       src: 'item'  },
  { id: 'apple',                 label: 'Apple',                  src: 'item'  },
  { id: 'golden_apple',          label: 'Golden Apple',           src: 'item'  },
  { id: 'book',                  label: 'Book',                   src: 'item'  },
  { id: 'map',                   label: 'Map',                    src: 'item'  },
  { id: 'shield',                label: 'Shield',                 src: 'item'  },
  { id: 'trident',               label: 'Trident',                src: 'item'  },
]

// ── Toast types ───────────────────────────────────────────────────────────────

interface ToastType {
  label: string
  defaultTitle: string
  titleColor: string
  titleShadow: string
  frameName: string   // sprite filename under gui/sprites/advancements/
}

const TOAST_TYPES: Record<string, ToastType> = {
  achievement: {
    label: 'Achievement Get!',
    defaultTitle: 'Achievement Get!',
    titleColor: '#FFFF55', titleShadow: '#3F3F00',
    frameName: 'task_frame_obtained',
  },
  advancement: {
    label: 'Advancement Made!',
    defaultTitle: 'Advancement Made!',
    titleColor: '#FFFF55', titleShadow: '#3F3F00',
    frameName: 'task_frame_obtained',
  },
  goal: {
    label: 'Goal Reached!',
    defaultTitle: 'Goal Reached!',
    titleColor: '#FFFF55', titleShadow: '#3F3F00',
    frameName: 'goal_frame_obtained',
  },
  challenge: {
    label: 'Challenge Complete!',
    defaultTitle: 'Challenge Complete!',
    titleColor: '#FF55FF', titleShadow: '#3F003F',
    frameName: 'challenge_frame_obtained',
  },
}

// ── Image loader ──────────────────────────────────────────────────────────────

async function loadImg(urls: string[]): Promise<HTMLImageElement | null> {
  for (const url of urls) {
    const img = await new Promise<HTMLImageElement | null>(res => {
      const i = new Image()
      i.crossOrigin = 'anonymous'
      i.onload  = () => res(i)
      i.onerror = () => res(null)
      i.src = url
    })
    if (img) return img
  }
  return null
}

// ── Canvas renderer ───────────────────────────────────────────────────────────

/**
 * Draw the classic Minecraft toast background at scale S.
 * Exact colors from game textures:
 *   outer 1px → #000000, corners 2×2 px transparent
 *   next 2px  → #555555 (highlight ring)
 *   fill      → #212121
 */
function drawToastBg(ctx: CanvasRenderingContext2D, W: number, H: number, S: number) {
  const b = S   // 1 game pixel
  const h = 2 * S  // 2 game pixels

  // Fill
  ctx.fillStyle = '#212121'
  ctx.fillRect(0, 0, W, H)

  // Top + bottom highlight strip (2px inside outer border)
  ctx.fillStyle = '#555555'
  ctx.fillRect(b, b, W - b * 2, h)       // top highlight
  ctx.fillRect(b, H - b - h, W - b * 2, h) // bottom highlight
  ctx.fillRect(b, b + h, h, H - (b + h) * 2) // left highlight
  ctx.fillRect(W - b - h, b + h, h, H - (b + h) * 2) // right highlight

  // Outer black border
  ctx.fillStyle = '#000000'
  ctx.fillRect(b * 2, 0, W - b * 4, b)       // top
  ctx.fillRect(b * 2, H - b, W - b * 4, b)   // bottom
  ctx.fillRect(0, b * 2, b, H - b * 4)       // left
  ctx.fillRect(W - b, b * 2, b, H - b * 4)   // right

  // Corner cuts — clear 2×2 pixels at each corner (rounded feel)
  ctx.clearRect(0, 0, b * 2, b * 2)               // top-left
  ctx.clearRect(W - b * 2, 0, b * 2, b * 2)       // top-right
  ctx.clearRect(0, H - b * 2, b * 2, b * 2)       // bottom-left
  ctx.clearRect(W - b * 2, H - b * 2, b * 2, b * 2) // bottom-right
}

/**
 * Draw one line of Minecraft-style text with 1gp drop shadow.
 */
function drawPixelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number,
  color: string, shadow: string,
  S: number,
) {
  const sh = SHADOW * S
  ctx.textBaseline = 'top'
  ctx.fillStyle = shadow
  ctx.fillText(text, x + sh, y + sh)
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
}

async function renderToCanvas(
  canvas: HTMLCanvasElement,
  title: string,
  description: string,
  icon: Icon,
  version: string,
  typeKey: string,
  S: number,        // game pixels → canvas pixels scale
): Promise<void> {
  await loadFont()

  const toast = TOAST_TYPES[typeKey] ?? TOAST_TYPES.achievement
  const fontSize = FONT_GP * S

  const ctx = canvas.getContext('2d')!
  ctx.font = `${fontSize}px "${FONT}", monospace`

  // Measure text to set canvas width
  const titleW = ctx.measureText(title).width
  const descW  = ctx.measureText(description).width
  const textW  = Math.max(titleW, descW)

  // Toast always >= 160 gp wide (original texture width)
  const W = Math.max(160 * S, (TEXT_X + Math.ceil(textW / S) + BORDER + 4) * S)
  const H = TOAST_H * S

  canvas.width  = W
  canvas.height = H

  // ── Background ──
  drawToastBg(ctx, W, H, S)

  // ── Icon frame (actual game sprite, 26×26 gp) ──
  const frameUrl = `/mc-assets/${version}/gui/sprites/advancements/${toast.frameName}.png`
  const frameImg = await loadImg([frameUrl])
  const fSz = FRAME_SZ * S
  const fX  = BORDER * S
  const fY  = BORDER * S  // frame starts right inside the border (3gp in)

  if (frameImg) {
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(frameImg, fX, fY, fSz, fSz)
  }

  // ── Icon (16×16 gp, centered inside the 26×26 frame) ──
  const iconUrls = icon.src === 'item'
    ? [itemRawUrl(version, icon.id), blockRawUrl(version, icon.id)]
    : [blockRawUrl(version, icon.id), blockRawUrl(version, `${icon.id}_top`), itemRawUrl(version, icon.id)]
  const iconImg = await loadImg(iconUrls)

  const iSz = ICON_SZ * S
  const iX  = fX + ICON_OFF * S
  const iY  = fY + ICON_OFF * S

  ctx.imageSmoothingEnabled = false
  if (iconImg) {
    ctx.drawImage(iconImg, iX, iY, iSz, iSz)
  } else {
    ctx.fillStyle = '#555555'
    ctx.fillRect(iX, iY, iSz, iSz)
  }

  // ── Text ──
  const totalTH = (FONT_GP * 2 + LINE_GAP) * S
  const tX = TEXT_X * S
  const tY = Math.round((H - totalTH) / 2)

  ctx.font = `${fontSize}px "${FONT}", monospace`

  // Title line
  drawPixelText(ctx, title, tX, tY, toast.titleColor, toast.titleShadow, S)
  // Description line
  drawPixelText(ctx, description, tX, tY + (FONT_GP + LINE_GAP) * S, '#FFFFFF', '#3F3F3F', S)
}

// ── Page component ────────────────────────────────────────────────────────────

export default function AchievementPage() {
  const { version } = useVersion()

  const [typeKey,    setTypeKey]    = useState('achievement')
  const [title,      setTitle]      = useState('Achievement Get!')
  const [desc,       setDesc]       = useState('Text goes here')
  const [iconId,     setIconId]     = useState('grass_block')
  const [scale,      setScale]      = useState(4)
  const [iconSearch, setIconSearch] = useState('')
  const [copied,     setCopied]     = useState(false)

  const previewRef = useRef<HTMLCanvasElement>(null)
  const icon = ICONS.find(i => i.id === iconId) ?? ICONS[0]

  const filteredIcons = iconSearch.trim()
    ? ICONS.filter(i =>
        i.label.toLowerCase().includes(iconSearch.toLowerCase()) ||
        i.id.includes(iconSearch.toLowerCase()))
    : ICONS

  // Always preview at 3× scale (compact but readable)
  const PREVIEW_SCALE = 3

  const redraw = useCallback((canvas: HTMLCanvasElement | null, s: number) => {
    if (!canvas) return
    renderToCanvas(canvas, title, desc, icon, version.id, typeKey, s)
  }, [title, desc, icon, version.id, typeKey])

  useEffect(() => {
    redraw(previewRef.current, PREVIEW_SCALE)
  }, [redraw])

  function handleTypeChange(key: string) {
    const t = TOAST_TYPES[key]
    if (t && title === TOAST_TYPES[typeKey]?.defaultTitle) setTitle(t.defaultTitle)
    setTypeKey(key)
  }

  async function download() {
    // Re-render at selected export scale on a temp canvas
    const tmp = document.createElement('canvas')
    await renderToCanvas(tmp, title, desc, icon, version.id, typeKey, scale)
    const a = document.createElement('a')
    a.href = tmp.toDataURL('image/png')
    a.download = 'achievement.png'
    a.click()
  }

  async function copyImg() {
    const tmp = document.createElement('canvas')
    await renderToCanvas(tmp, title, desc, icon, version.id, typeKey, scale)
    tmp.toBlob(async blob => {
      if (!blob) return
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      } catch {}
    })
  }

  function iconUrl(i: Icon) {
    return i.src === 'item' ? itemRawUrl(version.id, i.id) : blockRawUrl(version.id, i.id)
  }

  return (
    <div className="section py-10">
      <div className="container">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold mb-1">Achievement Generator</h1>
          <p className="text-sm" style={{ color: 'rgb(var(--muted))' }}>
            Pixel-perfect Minecraft achievement and advancement toasts. Uses the actual game textures.
          </p>
        </div>

        <div className="flex gap-6 items-start flex-wrap xl:flex-nowrap">

          {/* ── Controls ── */}
          <div className="flex flex-col gap-4" style={{ width: 300, flexShrink: 0 }}>

            {/* Type */}
            <div className="card p-4 space-y-3">
              <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'rgb(var(--muted))' }}>
                Type
              </p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(TOAST_TYPES).map(([key, t]) => (
                  <button key={key} onClick={() => handleTypeChange(key)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium text-left transition-all leading-snug ${
                      typeKey === key ? 'bg-violet-600 text-white' : 'btn btn-ghost'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Text */}
            <div className="card p-4 space-y-3">
              <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'rgb(var(--muted))' }}>
                Text
              </p>
              <div className="space-y-2">
                <div>
                  <label className="text-xs mb-1 block font-medium"
                    style={{ color: TOAST_TYPES[typeKey]?.titleColor ?? '#FFFF55' }}>
                    Title
                  </label>
                  <input value={title} onChange={e => setTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: 'rgb(var(--panel))', border: '1px solid rgb(var(--border))', color: 'rgb(var(--text))' }} />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'rgb(var(--muted))' }}>
                    Description (white)
                  </label>
                  <input value={desc} onChange={e => setDesc(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: 'rgb(var(--panel))', border: '1px solid rgb(var(--border))', color: 'rgb(var(--text))' }} />
                </div>
              </div>
            </div>

            {/* Icon */}
            <div className="card p-4 space-y-3">
              <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'rgb(var(--muted))' }}>
                Icon
              </p>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'rgb(var(--muted))' }} />
                <input value={iconSearch} onChange={e => setIconSearch(e.target.value)}
                  placeholder="Search…"
                  className="w-full pl-7 pr-3 py-1.5 rounded-lg text-sm outline-none"
                  style={{ background: 'rgb(var(--bg))', border: '1px solid rgb(var(--border))', color: 'rgb(var(--text))' }} />
              </div>
              <div className="overflow-y-auto rounded-lg" style={{ maxHeight: 180, border: '1px solid rgb(var(--border))' }}>
                {filteredIcons.map(i => (
                  <button key={i.id} onClick={() => setIconId(i.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left transition-colors ${
                      iconId === i.id ? 'bg-violet-600 text-white' : 'hover:bg-[rgba(var(--border),.5)]'}`}>
                    <img
                      src={iconUrl(i)} alt="" width={16} height={16}
                      style={{ imageRendering: 'pixelated', flexShrink: 0 }}
                      onError={e => { (e.currentTarget as HTMLImageElement).src = blockRawUrl(version.id, i.id) }}
                    />
                    {i.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Export scale */}
            <div className="card p-4 space-y-3">
              <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'rgb(var(--muted))' }}>
                Export Scale
              </p>
              <div className="flex gap-2">
                {[2, 3, 4, 6, 8].map(s => (
                  <button key={s} onClick={() => setScale(s)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      scale === s ? 'bg-violet-600 text-white' : 'btn btn-ghost'}`}>
                    {s}×
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button onClick={download} className="btn btn-primary flex-1 flex items-center justify-center gap-2 py-2.5">
                <Download size={15} /> Download PNG
              </button>
              <button onClick={copyImg} title="Copy image" className="btn btn-ghost px-3 py-2.5 rounded-lg">
                {copied ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
              </button>
            </div>
          </div>

          {/* ── Preview ── */}
          <div className="flex-1 card p-8 flex flex-col items-center justify-center gap-5" style={{ minHeight: 300 }}>
            {/* Checkerboard = transparent bg */}
            <div className="rounded-lg p-8 flex items-center justify-center w-full"
              style={{
                backgroundImage: 'repeating-conic-gradient(#555 0% 25%, #777 0% 50%)',
                backgroundSize: '16px 16px',
              }}>
              <canvas
                ref={previewRef}
                style={{ imageRendering: 'pixelated', maxWidth: '100%', display: 'block' }}
              />
            </div>
            <p className="text-xs" style={{ color: 'rgb(var(--muted))' }}>
              Preview at 3× · Export at {scale}×
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
