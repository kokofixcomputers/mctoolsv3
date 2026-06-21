import { useState, useRef, useEffect, useCallback, useId } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, Copy, Check, AlertTriangle } from 'lucide-react'
import { useVersion } from '../contexts/VersionContext'

// ── Types ──────────────────────────────────────────────────────────────────────
interface Layer { id: string; pattern: string; color: string }

// ── Minecraft Colors ──────────────────────────────────────────────────────────
const COLORS: Record<string, { hex: string; label: string; legacyId: number }> = {
  white:      { hex: '#F9FFFE', label: 'White',      legacyId: 0  },
  orange:     { hex: '#F9801D', label: 'Orange',     legacyId: 1  },
  magenta:    { hex: '#C74EBD', label: 'Magenta',    legacyId: 2  },
  light_blue: { hex: '#3AB3DA', label: 'Light Blue', legacyId: 3  },
  yellow:     { hex: '#FED83D', label: 'Yellow',     legacyId: 4  },
  lime:       { hex: '#80C71F', label: 'Lime',       legacyId: 5  },
  pink:       { hex: '#F38BAA', label: 'Pink',       legacyId: 6  },
  gray:       { hex: '#474F52', label: 'Gray',       legacyId: 7  },
  light_gray: { hex: '#9D9D97', label: 'Light Gray', legacyId: 8  },
  cyan:       { hex: '#169C9C', label: 'Cyan',       legacyId: 9  },
  purple:     { hex: '#8932B8', label: 'Purple',     legacyId: 10 },
  blue:       { hex: '#3C44AA', label: 'Blue',       legacyId: 11 },
  brown:      { hex: '#835432', label: 'Brown',      legacyId: 12 },
  green:      { hex: '#5E7C16', label: 'Green',      legacyId: 13 },
  red:        { hex: '#B02E26', label: 'Red',        legacyId: 14 },
  black:      { hex: '#1D1D21', label: 'Black',      legacyId: 15 },
}
const COLOR_KEYS = Object.keys(COLORS)

// ── Pattern drawing helpers ───────────────────────────────────────────────────
type Draw = (ctx: CanvasRenderingContext2D, color: string, w: number, h: number) => void

function poly(ctx: CanvasRenderingContext2D, pts: [number,number][], w: number, h: number) {
  ctx.beginPath()
  ctx.moveTo(pts[0][0]*w, pts[0][1]*h)
  for (const [x,y] of pts.slice(1)) ctx.lineTo(x*w, y*h)
  ctx.closePath(); ctx.fill()
}

function hexToRgba(hex: string, a: number) {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16)
  return `rgba(${r},${g},${b},${a})`
}

// clip draw to banner bounds, then run fn
function clipped(ctx: CanvasRenderingContext2D, w: number, h: number, fn: ()=>void) {
  ctx.save(); ctx.beginPath(); ctx.rect(0,0,w,h); ctx.clip(); fn(); ctx.restore()
}

// ── Patterns ──────────────────────────────────────────────────────────────────
interface PatternDef { id: string; label: string; short: string; special?: boolean; draw: Draw }

const PATTERNS: PatternDef[] = [
  // ── Stripes ──
  // Base/Chief: thin band ~37.5% at bottom/top (not half)
  { id:'stripe_bottom', label:'Base',          short:'bs',
    draw:(ctx,c,w,h)=>{ ctx.fillStyle=c; ctx.fillRect(0,h*.625,w,h*.375) } },
  { id:'stripe_top',    label:'Chief',         short:'ts',
    draw:(ctx,c,w,h)=>{ ctx.fillStyle=c; ctx.fillRect(0,0,w,h*.375) } },
  // Pale Dexter/Sinister: thin vertical stripe ~20% width
  { id:'stripe_left',   label:'Pale Dexter',   short:'ls',
    draw:(ctx,c,w,h)=>{ ctx.fillStyle=c; ctx.fillRect(0,0,w*.2,h) } },
  { id:'stripe_right',  label:'Pale Sinister', short:'rs',
    draw:(ctx,c,w,h)=>{ ctx.fillStyle=c; ctx.fillRect(w*.8,0,w*.2,h) } },
  // Pale: center vertical ~20%
  { id:'stripe_center', label:'Pale',          short:'cs',
    draw:(ctx,c,w,h)=>{ ctx.fillStyle=c; ctx.fillRect(w*.4,0,w*.2,h) } },
  // Fess: center horizontal band ~25%
  { id:'stripe_middle', label:'Fess',          short:'ms',
    draw:(ctx,c,w,h)=>{ ctx.fillStyle=c; ctx.fillRect(0,h*.375,w,h*.25) } },
  // Per Bend: diagonal fills lower-left triangle
  { id:'stripe_downright', label:'Per Bend',          short:'drs',
    draw:(ctx,c,w,h)=>{ ctx.fillStyle=c; poly(ctx,[[0,0],[0,1],[1,1]],w,h) } },
  // Per Bend Sinister: diagonal fills lower-right triangle
  { id:'stripe_downleft',  label:'Per Bend Sinister', short:'dls',
    draw:(ctx,c,w,h)=>{ ctx.fillStyle=c; poly(ctx,[[1,0],[0,1],[1,1]],w,h) } },
  // Paly: 5 equal alternating vertical stripes, odd ones filled
  { id:'small_stripes', label:'Paly',          short:'ss',
    draw:(ctx,c,w,h)=>{
      ctx.fillStyle=c
      const n=5, sw=w/n
      for(let i=0;i<n;i+=2) ctx.fillRect(i*sw,0,sw,h)
    }
  },
  // ── Crosses ──
  // Saltire: X cross — two diagonal bars through center
  { id:'cross',         label:'Saltire',       short:'cr',
    draw:(ctx,c,w,h)=>{
      const t=w*.18
      clipped(ctx,w,h,()=>{
        ctx.fillStyle=c
        ctx.save(); ctx.translate(w/2,h/2)
        const d=Math.hypot(w,h)
        for(const a of[Math.atan2(h,w),-Math.atan2(h,w)]){
          ctx.save(); ctx.rotate(a); ctx.fillRect(-d/2,-t/2,d,t); ctx.restore()
        }
        ctx.restore()
      })
    }
  },
  // Cross: + shape — vertical + horizontal bars
  { id:'straight_cross', label:'Cross',        short:'sc',
    draw:(ctx,c,w,h)=>{ ctx.fillStyle=c; ctx.fillRect(w*.4,0,w*.2,h); ctx.fillRect(0,h*.4,w,h*.2) } },
  // ── Diagonals / Per Pale / Per Fess ──
  { id:'diagonal_left',       label:'Per Bend (field)',    short:'ld',
    draw:(ctx,c,w,h)=>{ ctx.fillStyle=c; poly(ctx,[[0,0],[1,0],[0,1]],w,h) } },
  { id:'diagonal_right',      label:'Per Bend Sin (field)',short:'rd',
    draw:(ctx,c,w,h)=>{ ctx.fillStyle=c; poly(ctx,[[1,0],[0,1],[1,1]],w,h) } },
  { id:'diagonal_up_left',    label:'Per Bend Inv',        short:'lud',
    draw:(ctx,c,w,h)=>{ ctx.fillStyle=c; poly(ctx,[[0,0],[0,1],[1,0]],w,h) } },
  { id:'diagonal_up_right',   label:'Per Bend Sin Inv',    short:'rud',
    draw:(ctx,c,w,h)=>{ ctx.fillStyle=c; poly(ctx,[[1,0],[0,0],[1,1]],w,h) } },
  // ── Halves ──
  { id:'half_vertical',       label:'Per Pale',          short:'vh',
    draw:(ctx,c,w,h)=>{ ctx.fillStyle=c; ctx.fillRect(0,0,w/2,h) } },
  { id:'half_vertical_right', label:'Per Pale Inv',      short:'vhr',
    draw:(ctx,c,w,h)=>{ ctx.fillStyle=c; ctx.fillRect(w/2,0,w/2,h) } },
  { id:'half_horizontal',     label:'Per Fess',          short:'hh',
    draw:(ctx,c,w,h)=>{ ctx.fillStyle=c; ctx.fillRect(0,0,w,h/2) } },
  { id:'half_horizontal_bottom',label:'Per Fess Inv',    short:'hhb',
    draw:(ctx,c,w,h)=>{ ctx.fillStyle=c; ctx.fillRect(0,h/2,w,h/2) } },
  // ── Corners (small quarter-squares) ──
  { id:'square_bottom_left',  label:'Base Dexter Canton',   short:'bl',
    draw:(ctx,c,w,h)=>{ ctx.fillStyle=c; ctx.fillRect(0,h*.75,w*.25,h*.25) } },
  { id:'square_bottom_right', label:'Base Sinister Canton', short:'br',
    draw:(ctx,c,w,h)=>{ ctx.fillStyle=c; ctx.fillRect(w*.75,h*.75,w*.25,h*.25) } },
  { id:'square_top_left',     label:'Chief Dexter Canton',  short:'tl',
    draw:(ctx,c,w,h)=>{ ctx.fillStyle=c; ctx.fillRect(0,0,w*.25,h*.25) } },
  { id:'square_top_right',    label:'Chief Sinister Canton',short:'tr',
    draw:(ctx,c,w,h)=>{ ctx.fillStyle=c; ctx.fillRect(w*.75,0,w*.25,h*.25) } },
  // ── Triangles ──
  // Chevron: filled triangle pointing up from bottom half
  { id:'triangle_bottom', label:'Chevron',         short:'bt',
    draw:(ctx,c,w,h)=>{ ctx.fillStyle=c; poly(ctx,[[0,1],[1,1],[.5,.42]],w,h) } },
  // Inverted Chevron: filled triangle pointing down from top half
  { id:'triangle_top',    label:'Inverted Chevron',short:'tt',
    draw:(ctx,c,w,h)=>{ ctx.fillStyle=c; poly(ctx,[[0,0],[1,0],[.5,.58]],w,h) } },
  // Indented Base: solid bottom with zigzag top edge
  { id:'triangles_bottom', label:'Indented Base',  short:'bts',
    draw:(ctx,c,w,h)=>{
      ctx.fillStyle=c
      const n=4
      ctx.beginPath()
      ctx.moveTo(0,h)
      for(let i=0;i<n;i++){
        ctx.lineTo(w*(i+.5)/n, h*.5)
        ctx.lineTo(w*(i+1)/n,  h)
      }
      ctx.closePath(); ctx.fill()
    }
  },
  // Indented Chief: solid top with zigzag bottom edge
  { id:'triangles_top',   label:'Indented Chief',  short:'tts',
    draw:(ctx,c,w,h)=>{
      ctx.fillStyle=c
      const n=4
      ctx.beginPath()
      ctx.moveTo(0,0)
      for(let i=0;i<n;i++){
        ctx.lineTo(w*(i+.5)/n, h*.5)
        ctx.lineTo(w*(i+1)/n,  0)
      }
      ctx.closePath(); ctx.fill()
    }
  },
  // ── Shapes ──
  // Roundel: solid circle centered
  { id:'circle',  label:'Roundel', short:'mc',
    draw:(ctx,c,w,h)=>{
      ctx.fillStyle=c; ctx.beginPath()
      ctx.arc(w/2,h/2,w*.3,0,Math.PI*2); ctx.fill()
    }
  },
  // Lozenge: diamond / rhombus
  { id:'rhombus', label:'Lozenge', short:'mr',
    draw:(ctx,c,w,h)=>{ ctx.fillStyle=c; poly(ctx,[[.5,.08],[.94,.5],[.5,.92],[.06,.5]],w,h) } },
  // Bordure: border frame
  { id:'border',  label:'Bordure', short:'bo',
    draw:(ctx,c,w,h)=>{
      const t=w*.16; ctx.fillStyle=c
      ctx.fillRect(0,0,w,t); ctx.fillRect(0,h-t,w,t)
      ctx.fillRect(0,t,t,h-t*2); ctx.fillRect(w-t,t,t,h-t*2)
    }
  },
  // Bordure Indented: border with notched/curly edges
  { id:'curly_border', label:'Bordure Indented', short:'cbo',
    draw:(ctx,c,w,h)=>{
      const t=w*.16; ctx.fillStyle=c
      // Straight borders
      ctx.fillRect(0,0,w,t); ctx.fillRect(0,h-t,w,t)
      ctx.fillRect(0,t,t,h-t*2); ctx.fillRect(w-t,t,t,h-t*2)
      // Vine bulges along each side
      const steps=5
      for(let i=0;i<steps;i++){
        const f=(i+.5)/steps
        ctx.beginPath(); ctx.arc(f*w,0,t*.9,0,Math.PI*2); ctx.fill()
        ctx.beginPath(); ctx.arc(f*w,h,t*.9,0,Math.PI*2); ctx.fill()
        ctx.beginPath(); ctx.arc(0,f*h,t*.9,0,Math.PI*2); ctx.fill()
        ctx.beginPath(); ctx.arc(w,f*h,t*.9,0,Math.PI*2); ctx.fill()
      }
    }
  },
  // Bricks: offset brick rows, clipped to banner bounds
  { id:'bricks', label:'Field Masoned', short:'bri',
    draw:(ctx,c,w,h)=>{
      clipped(ctx,w,h,()=>{
        ctx.fillStyle=c
        const rows=10
        const bh=h/rows
        const bw=w/2
        const gap=Math.max(0.8, bh*.12)
        for(let r=0;r<rows;r++){
          const y=r*bh
          const off=(r%2)*(-bw/2)
          for(let b=-1;b<4;b++){
            ctx.fillRect(off+b*bw+gap, y+gap, bw-gap*2, bh-gap*2)
          }
        }
      })
    }
  },
  // Gradient: solid at top fading to transparent at bottom
  { id:'gradient', label:'Gradient', short:'gra',
    draw:(ctx,c,w,h)=>{
      const g=ctx.createLinearGradient(0,0,0,h)
      g.addColorStop(0,hexToRgba(c,1)); g.addColorStop(1,hexToRgba(c,0))
      ctx.fillStyle=g; ctx.fillRect(0,0,w,h)
    }
  },
  // Gradient Up: solid at bottom fading to transparent at top
  { id:'gradient_up', label:'Gradient Up', short:'gru',
    draw:(ctx,c,w,h)=>{
      const g=ctx.createLinearGradient(0,0,0,h)
      g.addColorStop(0,hexToRgba(c,0)); g.addColorStop(1,hexToRgba(c,1))
      ctx.fillStyle=g; ctx.fillRect(0,0,w,h)
    }
  },
  // ── Special (require banner pattern item) ──
  { id:'creeper', label:'Creeper Charge', short:'cre', special:true,
    draw:(ctx,c,w,h)=>{
      ctx.fillStyle=c
      // Face block
      ctx.fillRect(w*.2,h*.2,w*.6,h*.5)
      // Eye holes (cleared)
      ctx.clearRect(w*.28,h*.28,w*.14,h*.1)
      ctx.clearRect(w*.58,h*.28,w*.14,h*.1)
      // Nose (cleared)
      ctx.clearRect(w*.38,h*.38,w*.24,h*.08)
      // Mouth shape
      ctx.clearRect(w*.28,h*.46,w*.14,h*.1)
      ctx.clearRect(w*.58,h*.46,w*.14,h*.1)
      ctx.clearRect(w*.38,h*.56,w*.24,h*.08)
      ctx.fillRect(w*.28,h*.56,w*.1,h*.08)
      ctx.fillRect(w*.62,h*.56,w*.1,h*.08)
    }
  },
  { id:'skull', label:'Skull Charge', short:'sku', special:true,
    draw:(ctx,c,w,h)=>{
      ctx.fillStyle=c
      // Skull head
      ctx.beginPath(); ctx.ellipse(w/2,h*.34,w*.3,h*.2,0,0,Math.PI*2); ctx.fill()
      // Jaw
      ctx.fillRect(w*.22,h*.5,w*.56,h*.12)
      // Clear eye sockets
      ctx.clearRect(w*.3,h*.26,w*.14,h*.1)
      ctx.clearRect(w*.56,h*.26,w*.14,h*.1)
      // Clear jaw gaps (teeth)
      ctx.clearRect(w*.32,h*.5,w*.1,h*.07)
      ctx.clearRect(w*.44,h*.5,w*.1,h*.07)
      ctx.clearRect(w*.56,h*.5,w*.1,h*.07)
      // Crossbones
      ctx.save(); ctx.translate(w/2,h*.74)
      const bl=w*.46
      ctx.rotate(Math.PI/4); ctx.fillRect(-bl/2,-h*.035,bl,h*.07)
      ctx.rotate(-Math.PI/2); ctx.fillRect(-bl/2,-h*.035,bl,h*.07)
      ctx.restore()
    }
  },
  { id:'flower', label:'Flower Charge', short:'flo', special:true,
    draw:(ctx,c,w,h)=>{
      ctx.fillStyle=c
      // 8 petals
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4
        ctx.save(); ctx.translate(w/2,h/2); ctx.rotate(a)
        ctx.beginPath(); ctx.ellipse(0,-h*.18,w*.07,h*.1,0,0,Math.PI*2); ctx.fill()
        ctx.restore()
      }
      // Center
      ctx.beginPath(); ctx.arc(w/2,h/2,w*.1,0,Math.PI*2); ctx.fill()
    }
  },
  { id:'thing', label:'Mojang Logo', short:'moj', special:true,
    draw:(ctx,c,w,h)=>{
      ctx.fillStyle=c
      ctx.fillRect(w*.1,h*.28,w*.14,h*.36)
      ctx.fillRect(w*.76,h*.28,w*.14,h*.36)
      poly(ctx,[[.1,.28],[.5,.5],[.9,.28],[.76,.28],[.5,.44],[.24,.28]],w,h)
    }
  },
  { id:'globe', label:'Globe', short:'glb', special:true,
    draw:(ctx,c,w,h)=>{
      ctx.fillStyle=c
      // Fill full circle
      ctx.beginPath(); ctx.ellipse(w/2,h/2,w*.34,h*.23,0,0,Math.PI*2); ctx.fill()
      // Carve horizontal equator gap
      ctx.clearRect(0,h*.46,w,h*.08)
      // Carve meridian (vertical center oval)
      ctx.save()
      ctx.globalCompositeOperation='destination-out'
      ctx.beginPath(); ctx.ellipse(w/2,h/2,w*.12,h*.23,0,0,Math.PI*2); ctx.fill()
      ctx.restore()
      // Re-fill the outer ring gap to make globe shape
      ctx.beginPath(); ctx.arc(w/2,h/2,w*.12,0,Math.PI*2); ctx.fill()
      ctx.fillRect(w*.17,h*.46,w*.66,h*.08)
    }
  },
  { id:'piglin', label:'Piglin Snout', short:'pig', special:true,
    draw:(ctx,c,w,h)=>{
      ctx.fillStyle=c
      // Head
      ctx.fillRect(w*.18,h*.2,w*.64,h*.44)
      // Ears
      ctx.fillRect(w*.04,h*.2,w*.14,h*.14)
      ctx.fillRect(w*.82,h*.2,w*.14,h*.14)
      // Snout
      ctx.fillRect(w*.26,h*.52,w*.48,h*.14)
      // Clear eyes
      ctx.clearRect(w*.3,h*.28,w*.12,h*.1)
      ctx.clearRect(w*.58,h*.28,w*.12,h*.1)
      // Clear nostrils
      ctx.clearRect(w*.34,h*.56,w*.1,h*.07)
      ctx.clearRect(w*.56,h*.56,w*.1,h*.07)
    }
  },
  { id:'flow', label:'Flow', short:'flw', special:true,
    draw:(ctx,c,w,h)=>{
      ctx.strokeStyle=c; ctx.lineWidth=w*.12; ctx.lineCap='round'; ctx.lineJoin='round'
      ctx.beginPath()
      ctx.moveTo(w*.5,h*.15)
      ctx.bezierCurveTo(w*.85,h*.25,w*.85,h*.5,w*.5,h*.6)
      ctx.bezierCurveTo(w*.15,h*.7,w*.18,h*.85,w*.5,h*.88)
      ctx.stroke()
      // Leaf detail
      ctx.lineWidth=w*.06
      ctx.beginPath(); ctx.moveTo(w*.5,h*.38); ctx.lineTo(w*.75,h*.32); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(w*.5,h*.52); ctx.lineTo(w*.28,h*.58); ctx.stroke()
    }
  },
  { id:'guster', label:'Guster', short:'gus', special:true,
    draw:(ctx,c,w,h)=>{
      ctx.strokeStyle=c; ctx.lineCap='round'
      // Face
      ctx.fillStyle=c
      ctx.beginPath(); ctx.ellipse(w/2,h*.38,w*.22,h*.14,0,0,Math.PI*2); ctx.fill()
      // Clear eyes
      ctx.clearRect(w*.34,h*.3,w*.1,h*.08)
      ctx.clearRect(w*.56,h*.3,w*.1,h*.08)
      // Wind lines
      for(let i=0;i<3;i++){
        ctx.lineWidth=Math.max(1,w*(.06-.015*i))
        ctx.beginPath(); ctx.arc(w/2,h*.38,w*(.28+i*.1),-Math.PI*.55,Math.PI*.55); ctx.stroke()
        ctx.beginPath(); ctx.arc(w/2,h*.38,w*(.28+i*.1),Math.PI*.45,Math.PI*1.55); ctx.stroke()
      }
    }
  },
]

const PATTERN_MAP = Object.fromEntries(PATTERNS.map(p => [p.id, p]))

// ── Command generation ────────────────────────────────────────────────────────
function isNewFormat(versionId: string) {
  const [, minor, patch] = versionId.split('.').map(Number)
  return minor > 20 || (minor === 20 && patch >= 5)
}

function generateCommand(baseColor: string, layers: Layer[], versionId: string): string {
  const base = `${baseColor}_banner`
  if (!layers.length) return `/give @p ${base} 1`

  if (isNewFormat(versionId)) {
    const pats = layers
      .map(l => `{pattern:"minecraft:${l.pattern}",color:"${l.color}"}`)
      .join(',')
    return `/give @p ${base}[banner_patterns=[${pats}]] 1`
  } else {
    const pats = layers.map(l => {
      const def = PATTERN_MAP[l.pattern]
      return `{Pattern:"${def?.short ?? l.pattern}",Color:${COLORS[l.color]?.legacyId ?? 0}}`
    }).join(',')
    return `/give @p ${base}{BlockEntityTag:{Patterns:[${pats}]}} 1`
  }
}

// ── Banner canvas renderer ────────────────────────────────────────────────────
function renderBanner(
  canvas: HTMLCanvasElement,
  baseColor: string,
  layers: Layer[],
  scale = 1,
) {
  const BW = 20 * scale, BH = 40 * scale
  canvas.width = BW; canvas.height = BH
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, BW, BH)

  // Base color fill
  ctx.fillStyle = COLORS[baseColor]?.hex ?? '#ffffff'
  ctx.fillRect(0, 0, BW, BH)

  // Each layer
  for (const layer of layers) {
    const def = PATTERN_MAP[layer.pattern]
    if (!def) continue
    const col = COLORS[layer.color]?.hex ?? '#000000'
    def.draw(ctx, col, BW, BH)
  }
}

// ── PatternThumb component ────────────────────────────────────────────────────
function PatternThumb({
  pattern, selected, color, baseHex, onClick,
}: { pattern: PatternDef; selected: boolean; color: string; baseHex: string; onClick: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = canvasRef.current; if (!c) return
    const W = 30, H = 60
    c.width = W; c.height = H
    const ctx = c.getContext('2d')!
    ctx.fillStyle = baseHex
    ctx.fillRect(0, 0, W, H)
    pattern.draw(ctx, color, W, H)
  }, [pattern, color, baseHex])

  return (
    <button
      onClick={onClick}
      title={pattern.label}
      className={`
        relative flex flex-col items-center rounded-lg border-2 p-1.5 pb-1 transition-all
        ${selected
          ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30'
          : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600'}
      `}
      style={{ borderColor: selected ? undefined : 'rgb(var(--border))' }}
    >
      <canvas
        ref={canvasRef}
        style={{ imageRendering: 'pixelated', width: 24, height: 48 }}
      />
      {pattern.special && (
        <div className="absolute top-0.5 right-0.5 text-amber-500">
          <AlertTriangle size={8} />
        </div>
      )}
    </button>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BannerPage() {
  const { version } = useVersion()
  const uid = useId()

  const [baseColor, setBaseColor] = useState('white')
  const [layers, setLayers] = useState<Layer[]>([])
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null)
  // pendingColor is used when no layer is selected (for next added layer)
  const [pendingColor, setPendingColor] = useState('black')
  const [selectedPattern, setSelectedPattern] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const previewRef = useRef<HTMLCanvasElement>(null)

  // Derived: which color is "active" for the UI highlight
  const activeColor = selectedLayer
    ? (layers.find(l => l.id === selectedLayer)?.color ?? pendingColor)
    : pendingColor

  // Render banner whenever state changes
  useEffect(() => {
    const c = previewRef.current; if (!c) return
    renderBanner(c, baseColor, layers, 8)
  }, [baseColor, layers])

  function addLayer(patternId: string) {
    if (layers.length >= 7) return
    const id = `${uid}-${Date.now()}`
    const color = selectedLayer
      ? (layers.find(l => l.id === selectedLayer)?.color ?? pendingColor)
      : pendingColor
    setLayers(prev => [...prev, { id, pattern: patternId, color }])
    setSelectedPattern(patternId)
  }

  function handlePatternClick(patternId: string) {
    if (selectedLayer) {
      // Edit the selected layer's pattern
      setLayers(prev => prev.map(l => l.id === selectedLayer ? { ...l, pattern: patternId } : l))
      setSelectedPattern(patternId)
    } else {
      addLayer(patternId)
    }
  }

  function handleColorClick(colorKey: string) {
    if (selectedLayer) {
      setLayers(prev => prev.map(l => l.id === selectedLayer ? { ...l, color: colorKey } : l))
    } else {
      setPendingColor(colorKey)
    }
  }

  function moveLayer(id: string, dir: -1 | 1) {
    setLayers(prev => {
      const idx = prev.findIndex(l => l.id === id)
      const next = idx + dir
      if (next < 0 || next >= prev.length) return prev
      const arr = [...prev]
      ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
      return arr
    })
  }

  function deleteLayer(id: string) {
    setLayers(prev => prev.filter(l => l.id !== id))
    if (selectedLayer === id) setSelectedLayer(null)
  }

  const command = generateCommand(baseColor, layers, version.id)

  function copyCommand() {
    navigator.clipboard.writeText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const hasSpecial = layers.some(l => PATTERN_MAP[l.pattern]?.special)

  return (
    <div className="section py-10">
      <div className="container">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-1">Banner Maker</h1>
          <p className="text-sm" style={{ color: 'rgb(var(--muted))' }}>
            Design Minecraft banners with up to 7 pattern layers and export a{' '}
            <code className="font-mono text-xs px-1 py-0.5 rounded" style={{ background: 'rgb(var(--border))' }}>/give</code> command.
          </p>
        </div>

        <div className="flex gap-6 items-start">

          {/* ── Banner Preview ── */}
          <div className="flex-shrink-0 flex flex-col items-center gap-3">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgb(var(--muted))' }}>
              Preview
            </p>
            <div className="card p-4 flex items-center justify-center" style={{ minHeight: 360 }}>
              <canvas
                ref={previewRef}
                style={{ imageRendering: 'pixelated', width: 100, height: 200 }}
                className="rounded shadow-md"
              />
            </div>
            {/* Base color picker */}
            <div className="card p-3 w-full">
              <p className="text-xs font-semibold mb-2" style={{ color: 'rgb(var(--muted))' }}>BASE COLOR</p>
              <div className="grid grid-cols-8 gap-1">
                {COLOR_KEYS.map(key => (
                  <button
                    key={key}
                    title={COLORS[key].label}
                    onClick={() => setBaseColor(key)}
                    className="w-6 h-6 rounded transition-all hover:scale-110"
                    style={{
                      background: COLORS[key].hex,
                      outline: baseColor === key ? '2px solid rgb(var(--accent))' : '2px solid transparent',
                      outlineOffset: 2,
                      border: '1px solid rgba(0,0,0,0.15)',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ── Right panel ── */}
          <div className="flex-1 min-w-0 flex flex-col gap-5">

            {/* Select Colors */}
            <div className="card p-5">
              <div className="flex items-baseline gap-2 mb-1">
                <p className="font-semibold uppercase tracking-widest text-xs" style={{ color: 'rgb(var(--muted))' }}>
                  SELECT COLORS
                </p>
              </div>
              <p className="text-xs mb-3" style={{ color: 'rgb(var(--muted))' }}>
                {selectedLayer
                  ? 'Editing selected layer color'
                  : 'Select a color, then click a pattern to add a layer'}
              </p>
              <div className="grid grid-cols-8 gap-2">
                {COLOR_KEYS.map(key => (
                  <button
                    key={key}
                    title={COLORS[key].label}
                    onClick={() => handleColorClick(key)}
                    className="aspect-square rounded-xl transition-all hover:scale-110 active:scale-95"
                    style={{
                      background: COLORS[key].hex,
                      outline: activeColor === key ? '3px solid rgb(var(--accent))' : '3px solid transparent',
                      outlineOffset: 2,
                      border: '1px solid rgba(0,0,0,0.18)',
                      boxShadow: activeColor === key ? '0 0 0 2px white' : undefined,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Pattern picker */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold uppercase tracking-widest text-xs" style={{ color: 'rgb(var(--muted))' }}>
                  PATTERN TYPE
                </p>
                {hasSpecial && (
                  <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle size={12} />
                    Patterns marked ⚠ require a banner pattern item
                  </span>
                )}
              </div>
              <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(46px, 1fr))' }}>
                {PATTERNS.map(p => (
                  <PatternThumb
                    key={p.id}
                    pattern={p}
                    selected={selectedPattern === p.id}
                    color={COLORS[activeColor]?.hex ?? '#000000'}
                    baseHex={COLORS[baseColor]?.hex ?? '#ffffff'}
                    onClick={() => handlePatternClick(p.id)}
                  />
                ))}
              </div>
            </div>

            {/* Layer manager */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold uppercase tracking-widest text-xs" style={{ color: 'rgb(var(--muted))' }}>
                  LAYERS ({layers.length}/7)
                </p>
                {layers.length >= 7 && (
                  <span className="badge badge-warning text-xs">Max layers reached</span>
                )}
              </div>

              {layers.length === 0 ? (
                <p className="text-sm py-4 text-center" style={{ color: 'rgb(var(--muted))' }}>
                  Select a color and click a pattern above to add your first layer.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {[...layers].reverse().map((layer, revIdx) => {
                    const idx = layers.length - 1 - revIdx
                    const def = PATTERN_MAP[layer.pattern]
                    const isSelected = selectedLayer === layer.id
                    return (
                      <div
                        key={layer.id}
                        onClick={() => setSelectedLayer(isSelected ? null : layer.id)}
                        className={`
                          flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-all
                          ${isSelected
                            ? 'border-2 border-violet-500 bg-violet-50 dark:bg-violet-900/30'
                            : 'border-2 hover:border-gray-300 dark:hover:border-gray-600'}
                        `}
                        style={{ borderColor: isSelected ? undefined : 'rgb(var(--border))' }}
                      >
                        {/* Layer thumb */}
                        <div
                          className="w-4 h-4 rounded-sm flex-shrink-0 border"
                          style={{
                            background: COLORS[layer.color]?.hex,
                            borderColor: 'rgba(0,0,0,0.2)',
                          }}
                        />
                        <span className="text-sm font-medium flex-1 truncate">
                          {def?.label ?? layer.pattern}
                          {def?.special && <span className="ml-1 text-amber-500 text-xs">⚠</span>}
                        </span>
                        <span className="text-xs font-mono" style={{ color: 'rgb(var(--muted))' }}>
                          {COLORS[layer.color]?.label}
                        </span>
                        <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => moveLayer(layer.id, -1)}
                            disabled={idx === 0}
                            className="btn btn-ghost px-1 py-1 rounded-lg disabled:opacity-30"
                            title="Move down"
                          >
                            <ChevronDown size={14} />
                          </button>
                          <button
                            onClick={() => moveLayer(layer.id, 1)}
                            disabled={idx === layers.length - 1}
                            className="btn btn-ghost px-1 py-1 rounded-lg disabled:opacity-30"
                            title="Move up"
                          >
                            <ChevronUp size={14} />
                          </button>
                          <button
                            onClick={() => deleteLayer(layer.id)}
                            className="btn btn-ghost px-1 py-1 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                            title="Delete layer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Command output */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold uppercase tracking-widest text-xs" style={{ color: 'rgb(var(--muted))' }}>
                  COMMAND <span className="badge badge-accent ml-2">{version.label}</span>
                </p>
                <button onClick={copyCommand} className="btn btn-primary px-3 py-1.5 text-xs gap-1.5">
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre
                className="output-box text-xs break-all whitespace-pre-wrap"
                style={{ userSelect: 'all' }}
              >
                {command}
              </pre>
              {!isNewFormat(version.id) && (
                <p className="text-xs mt-2" style={{ color: 'rgb(var(--muted))' }}>
                  Using legacy NBT format for {version.label}
                </p>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
