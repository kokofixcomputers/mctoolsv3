import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Upload, RotateCcw, Shirt, Search, Loader2 } from 'lucide-react'
import {
  ARMOR, LEGGINGS, TRIM, TRIM_LEG, DEFAULT_SKIN,
  ARMOR_MATERIALS, TRIM_PATTERNS, TRIM_MATERIALS, PRETTY,
  textureCanvas, recolorTrim, fetchSkinUrl,
} from '../tools/armortrim/assets'
import { buildPlayer, buildArmorSlot } from '../tools/armortrim/model'

const SLOTS = ['helmet', 'chestplate', 'leggings', 'boots'] as const
type Slot = typeof SLOTS[number]
interface SlotState { material: string; trim: string; trimMaterial: string }

const initSlot = (): SlotState => ({ material: '', trim: '', trimMaterial: 'iron' })

export default function ArmorTrimPage() {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const playerRef = useRef<THREE.Group | null>(null)
  const armorRef = useRef<THREE.Group | null>(null)
  const skinRef = useRef<HTMLCanvasElement | null>(null)

  const [slots, setSlots] = useState<Record<Slot, SlotState>>({
    helmet: { material: 'diamond', trim: 'sentry', trimMaterial: 'gold' },
    chestplate: { material: 'diamond', trim: 'sentry', trimMaterial: 'gold' },
    leggings: { material: 'netherite', trim: 'silence', trimMaterial: 'amethyst' },
    boots: { material: 'netherite', trim: 'silence', trimMaterial: 'amethyst' },
  })
  const [ready, setReady] = useState(false)
  const [username, setUsername] = useState('')
  const [skinLoading, setSkinLoading] = useState(false)
  const [skinError, setSkinError] = useState<string | null>(null)

  // ── three.js scene setup ─────────────────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current!
    const scene = new THREE.Scene()
    sceneRef.current = scene
    const w = mount.clientWidth, h = mount.clientHeight
    const cam = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000)
    cam.position.set(0, 18, 48)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    mount.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 0.85))
    const key = new THREE.DirectionalLight(0xffffff, 0.7); key.position.set(20, 40, 30); scene.add(key)
    const fill = new THREE.DirectionalLight(0xffffff, 0.4); fill.position.set(-25, 20, -20); scene.add(fill)

    const controls = new OrbitControls(cam, renderer.domElement)
    controls.target.set(0, 16, 0)
    controls.enablePan = false
    controls.minDistance = 25
    controls.maxDistance = 90
    controls.update()

    let raf = 0
    const loop = () => { controls.update(); renderer.render(scene, cam); raf = requestAnimationFrame(loop) }
    loop()

    const onResize = () => {
      const W = mount.clientWidth, H = mount.clientHeight
      cam.aspect = W / H; cam.updateProjectionMatrix(); renderer.setSize(W, H)
    }
    const ro = new ResizeObserver(onResize); ro.observe(mount)

    // load default skin → player
    textureCanvas(DEFAULT_SKIN).then(skin => {
      skinRef.current = skin
      const player = buildPlayer(skin)
      playerRef.current = player
      scene.add(player)
      setReady(true)
    })

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose()
      renderer.dispose(); mount.removeChild(renderer.domElement)
    }
  }, [])

  // ── rebuild armor when slots change ───────────────────────────────────────────────
  const rebuildArmor = useCallback(async () => {
    const scene = sceneRef.current
    if (!scene) return
    const group = new THREE.Group()
    for (const slot of SLOTS) {
      const s = slots[slot]
      if (!s.material) continue
      const baseSet = (slot === 'leggings' ? LEGGINGS : ARMOR) as Record<string, string>
      const baseUrl = baseSet[s.material]
      if (!baseUrl) continue
      const baseCanvas = await textureCanvas(baseUrl)
      let trimCanvas: HTMLCanvasElement | null = null
      if (s.trim) {
        const trimUrl = (slot === 'leggings' ? TRIM_LEG : TRIM) as Record<string, string>
        const trimSrc = trimUrl[s.trim]
        if (trimSrc) trimCanvas = await recolorTrim(trimSrc, s.trimMaterial)
      }
      group.add(buildArmorSlot(slot, baseCanvas, trimCanvas))
    }
    if (armorRef.current) { scene.remove(armorRef.current) }
    armorRef.current = group
    scene.add(group)
  }, [slots])

  useEffect(() => { if (ready) rebuildArmor() }, [ready, rebuildArmor])

  // ── skin application (shared by file import + username fetch) ───────────────────────
  const applySkinImage = useCallback((img: HTMLImageElement) => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64
    const ctx = c.getContext('2d')!; ctx.imageSmoothingEnabled = false
    // legacy 64x32 skins: only the top half exists — draw at native height
    ctx.drawImage(img, 0, 0, img.width, Math.min(img.height, 64))
    skinRef.current = c
    const scene = sceneRef.current!
    if (playerRef.current) scene.remove(playerRef.current)
    const player = buildPlayer(c)
    playerRef.current = player
    scene.add(player)
  }, [])

  function onSkin(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSkinError(null)
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { applySkinImage(img); URL.revokeObjectURL(url) }
    img.src = url
  }

  function applyUsername() {
    const name = username.trim()
    if (!name) return
    setSkinLoading(true); setSkinError(null)
    fetchSkinUrl(name)
      .then(skinUrl => new Promise<HTMLImageElement>((res, rej) => {
        const img = new Image(); img.crossOrigin = 'anonymous'
        img.onload = () => res(img); img.onerror = () => rej(new Error('Failed to load skin'))
        img.src = skinUrl
      }))
      .then(img => applySkinImage(img))
      .catch(e => setSkinError(e instanceof Error ? e.message : 'Lookup failed'))
      .finally(() => setSkinLoading(false))
  }

  const setSlot = (slot: Slot, patch: Partial<SlotState>) => setSlots(s => ({ ...s, [slot]: { ...s[slot], ...patch } }))

  return (
    <div className="section container">
      <div className="mb-8">
        <span className="badge-accent"><Shirt className="w-3.5 h-3.5" /> 3D Designer</span>
        <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>Armor Trim Designer</h1>
        <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
          Kit out a 3D player with armor, apply trim patterns and materials per piece, and spin it around. Import your
          own skin to see how it looks on you.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
        {/* 3D viewport */}
        <div className="card !p-0 overflow-hidden relative" style={{ height: 540, background: 'linear-gradient(180deg, rgb(var(--panel)), rgb(var(--bg)))' }}>
          <div ref={mountRef} className="w-full h-full" style={{ cursor: 'grab' }} />
          <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg backdrop-blur overflow-hidden" style={{ background: 'rgb(var(--panel) / 0.85)', border: '1px solid rgb(var(--border))' }}>
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') applyUsername() }}
                placeholder="Minecraft username"
                className="bg-transparent text-sm px-3 py-2 outline-none w-44"
                style={{ color: 'rgb(var(--text))' }} />
              <button onClick={applyUsername} disabled={skinLoading || !username.trim()}
                className="px-3 py-2 text-sm font-medium disabled:opacity-40"
                style={{ background: 'rgb(var(--accent))', color: 'rgb(var(--accent-fg,#fff))' }}>
                {skinLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>
            <label className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer backdrop-blur"
              style={{ background: 'rgb(var(--panel) / 0.85)', border: '1px solid rgb(var(--border))', color: 'rgb(var(--text))' }}>
              <Upload className="w-4 h-4" /> Import skin
              <input type="file" accept="image/png" className="hidden" onChange={onSkin} />
            </label>
            {skinError && <span className="text-xs px-2 py-1 rounded backdrop-blur" style={{ background: 'rgb(var(--panel) / 0.85)', color: 'rgb(var(--danger))' }}>{skinError}</span>}
          </div>
          {!ready && <div className="absolute inset-0 grid place-items-center text-sm" style={{ color: 'rgb(var(--muted))' }}>Loading model…</div>}
        </div>

        {/* Controls */}
        <div className="space-y-3">
          {SLOTS.map(slot => {
            const s = slots[slot]
            return (
              <div key={slot} className="card !p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="capitalize" style={{ color: 'rgb(var(--text))' }}>{slot}</h3>
                  {s.material && (
                    <button onClick={() => setSlot(slot, { material: '' })} className="btn-ghost !p-1.5" title="Remove">
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="space-y-2.5">
                  <label className="block">
                    <span className="text-xs" style={{ color: 'rgb(var(--muted))' }}>Material</span>
                    <select className="form-input text-sm !py-2 mt-1" value={s.material} onChange={e => setSlot(slot, { material: e.target.value })}>
                      <option value="">— none —</option>
                      {ARMOR_MATERIALS.map(m => <option key={m} value={m}>{PRETTY[m] ?? m}</option>)}
                    </select>
                  </label>

                  {s.material && s.material !== 'leather' && s.material !== 'turtle_scute' && (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-xs" style={{ color: 'rgb(var(--muted))' }}>Trim</span>
                        <select className="form-input text-sm !py-2 mt-1" value={s.trim} onChange={e => setSlot(slot, { trim: e.target.value })}>
                          <option value="">— none —</option>
                          {TRIM_PATTERNS.map(p => <option key={p} value={p} className="capitalize">{p}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-xs" style={{ color: 'rgb(var(--muted))' }}>Trim material</span>
                        <select className="form-input text-sm !py-2 mt-1" value={s.trimMaterial} disabled={!s.trim} onChange={e => setSlot(slot, { trimMaterial: e.target.value })}>
                          {TRIM_MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
