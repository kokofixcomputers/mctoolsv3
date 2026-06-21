/**
 * WebGL Minecraft block renderer.
 *
 * Exports:
 *  BlockRenderer  – live WebGL canvas component (for hero previews)
 *  BlockThumb     – renders via shared off-screen GL context → <img> (for grids)
 *  renderBlockThumb – imperative version of the above, returns a data-URL
 *  guessBlockTextures / blockRawUrl / itemRawUrl – URL helpers
 *
 * BlockTextures.top/side/right accept a string URL *or* string[] of URLs tried
 * in order (first 200-OK wins, rest discarded). This powers the _top / _side /
 * plain fallback chain without making a HEAD request.
 */
import { useRef, useEffect, useCallback, useState } from 'react'

// ── GLSL ─────────────────────────────────────────────────────────────────────

const VERT = `
attribute vec3 aPos;
attribute vec3 aNorm;
attribute vec2 aUV;
uniform mat4 uMV;
uniform mat4 uRT;
uniform mat4 uP;
varying vec3 vNorm;
varying vec2 vUV;
void main(void) {
  gl_Position = uP * uMV * uRT * vec4(aPos, 1.0);
  vNorm = normalize((uRT * vec4(aNorm, 0.0)).xyz);
  vUV = aUV;
}
`

const FRAG = `
precision mediump float;
uniform sampler2D uTex;
varying vec3 vNorm;
varying vec2 vUV;
void main(void) {
  vec4 col = texture2D(uTex, vUV);
  if (col.a < 0.05) discard;
  vec3 light = normalize(vec3(-1.0, 1.732, 1.0));
  float lw = 0.5 + 0.5 * max(0.0, dot(normalize(vNorm), light));
  gl_FragColor = vec4(col.rgb * lw, col.a);
}
`

// ── Math ──────────────────────────────────────────────────────────────────────

function mul(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16)
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += a[i + k*4] * b[k + j*4]
      o[i + j*4] = s
    }
  return o
}

const rotY = (deg: number) => {
  const r = deg*Math.PI/180, c = Math.cos(r), s = Math.sin(r)
  return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1])
}
const rotX = (deg: number) => {
  const r = deg*Math.PI/180, c = Math.cos(r), s = Math.sin(r)
  return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1])
}
const trans = (x: number, y: number, z: number) =>
  new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1])
const ortho = (l: number, r: number, b: number, t: number, n: number, f: number) =>
  new Float32Array([
    2/(r-l), 0, 0, 0,
    0, 2/(t-b), 0, 0,
    0, 0, -2/(f-n), 0,
    -(r+l)/(r-l), -(t+b)/(t-b), -(f+n)/(f-n), 1,
  ])

// ── Cube geometry ─────────────────────────────────────────────────────────────

interface Group { verts: Float32Array; idx: Uint16Array; texIdx: 0|1|2 }

function cubeGroups(): Group[] {
  const h = 0.5
  return [
    { texIdx: 0, verts: new Float32Array([
        -h, h,  h,  0,1,0,  0,1,   h, h,  h,  0,1,0,  1,1,
         h, h, -h,  0,1,0,  1,0,  -h, h, -h,  0,1,0,  0,0,
        -h,-h, -h,  0,-1,0, 0,0,   h,-h, -h,  0,-1,0, 1,0,
         h,-h,  h,  0,-1,0, 1,1,  -h,-h,  h,  0,-1,0, 0,1,
      ]), idx: new Uint16Array([0,1,2, 0,2,3, 4,5,6, 4,6,7]) },
    { texIdx: 1, verts: new Float32Array([
        -h,-h, h,  0,0,1,  0,1,   h,-h, h,  0,0,1,  1,1,
         h, h, h,  0,0,1,  1,0,  -h, h, h,  0,0,1,  0,0,
         h,-h,-h,  0,0,-1, 0,1,  -h,-h,-h,  0,0,-1, 1,1,
        -h, h,-h,  0,0,-1, 1,0,   h, h,-h,  0,0,-1, 0,0,
      ]), idx: new Uint16Array([0,1,2, 0,2,3, 4,5,6, 4,6,7]) },
    { texIdx: 2, verts: new Float32Array([
         h,-h, h,  1,0,0,  1,1,   h,-h,-h,  1,0,0,  0,1,
         h, h,-h,  1,0,0,  0,0,   h, h, h,  1,0,0,  1,0,
        -h,-h,-h, -1,0,0,  1,1,  -h,-h, h, -1,0,0,  0,1,
        -h, h, h, -1,0,0,  0,0,  -h, h,-h, -1,0,0,  1,0,
      ]), idx: new Uint16Array([0,1,2, 0,2,3, 4,5,6, 4,6,7]) },
  ]
}

// ── WebGL helpers ─────────────────────────────────────────────────────────────

function compileShader(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src.trim()); gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(`Shader: ${gl.getShaderInfoLog(s)}`)
  return s
}

function makeTex(gl: WebGLRenderingContext): WebGLTexture {
  const t = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([150,150,150,255]))
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return t
}

function uploadTex(gl: WebGLRenderingContext, tex: WebGLTexture, img: HTMLImageElement) {
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
}

// Try each URL in order; upload first one that loads. Returns true if any succeeded.
function loadWithFallback(
  gl: WebGLRenderingContext,
  tex: WebGLTexture,
  urls: string[],
  onDone?: () => void,
) {
  function tryNext(i: number) {
    if (i >= urls.length) { onDone?.(); return }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => { uploadTex(gl, tex, img); onDone?.() }
    img.onerror = () => tryNext(i + 1)
    img.src = urls[i]
  }
  tryNext(0)
}

// Promise version — resolves when first URL loads (or after all 404)
function loadWithFallbackP(
  gl: WebGLRenderingContext,
  tex: WebGLTexture,
  urls: string[],
): Promise<void> {
  return new Promise(resolve => loadWithFallback(gl, tex, urls, resolve))
}

// ── GL state type + setup ─────────────────────────────────────────────────────

interface GLState {
  gl: WebGLRenderingContext
  prog: WebGLProgram
  a: { pos: number; norm: number; uv: number }
  u: { mv: WebGLUniformLocation; rt: WebGLUniformLocation; p: WebGLUniformLocation; tex: WebGLUniformLocation }
  groups: Array<{ vbo: WebGLBuffer; ibo: WebGLBuffer; count: number; texIdx: 0|1|2 }>
  textures: WebGLTexture[]
  mats: { mv: Float32Array; rt: Float32Array; p: Float32Array }
}

function setupGL(gl: WebGLRenderingContext): GLState {
  const vert = compileShader(gl, gl.VERTEX_SHADER, VERT)
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG)
  const prog = gl.createProgram()!
  gl.attachShader(prog, vert); gl.attachShader(prog, frag)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
    throw new Error(`Link: ${gl.getProgramInfoLog(prog)}`)

  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS)
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  gl.disable(gl.CULL_FACE)

  const a = {
    pos:  gl.getAttribLocation(prog, 'aPos'),
    norm: gl.getAttribLocation(prog, 'aNorm'),
    uv:   gl.getAttribLocation(prog, 'aUV'),
  }
  const u = {
    mv:  gl.getUniformLocation(prog, 'uMV')!,
    rt:  gl.getUniformLocation(prog, 'uRT')!,
    p:   gl.getUniformLocation(prog, 'uP')!,
    tex: gl.getUniformLocation(prog, 'uTex')!,
  }

  const groups = cubeGroups().map(g => {
    const vbo = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.bufferData(gl.ARRAY_BUFFER, g.verts, gl.STATIC_DRAW)
    const ibo = gl.createBuffer()!
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.idx, gl.STATIC_DRAW)
    return { vbo, ibo, count: g.idx.length, texIdx: g.texIdx }
  })

  const mats = {
    mv: trans(0, -0.866, 0),
    rt: mul(rotX(30), rotY(45)),
    p:  ortho(-1.625, 1.625, -1.625, 1.625, -2.5, 2.5),
  }

  const textures = [makeTex(gl), makeTex(gl), makeTex(gl)]

  return { gl, prog, a, u, groups, textures, mats }
}

function drawFrame(s: GLState) {
  const { gl, prog, a, u, groups, textures: tex, mats } = s
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
  gl.useProgram(prog)
  gl.uniformMatrix4fv(u.mv, false, mats.mv)
  gl.uniformMatrix4fv(u.rt, false, mats.rt)
  gl.uniformMatrix4fv(u.p,  false, mats.p)
  const bpv = 8 * 4
  for (const g of groups) {
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex[g.texIdx])
    gl.uniform1i(u.tex, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, g.vbo)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ibo)
    gl.enableVertexAttribArray(a.pos);  gl.vertexAttribPointer(a.pos,  3, gl.FLOAT, false, bpv, 0)
    gl.enableVertexAttribArray(a.norm); gl.vertexAttribPointer(a.norm, 3, gl.FLOAT, false, bpv, 12)
    gl.enableVertexAttribArray(a.uv);   gl.vertexAttribPointer(a.uv,   2, gl.FLOAT, false, bpv, 24)
    gl.drawElements(gl.TRIANGLES, g.count, gl.UNSIGNED_SHORT, 0)
  }
}

// ── Public types ──────────────────────────────────────────────────────────────

// Each slot: a single URL or a list tried in order (first 200-OK wins).
export type TexUrl = string | string[]

export interface BlockTextures {
  top?: TexUrl    // top & bottom faces
  side?: TexUrl   // front/back faces (left side in isometric view)
  right?: TexUrl  // right/left faces; defaults to side if omitted
}

function toUrls(u: TexUrl | undefined): string[] {
  if (!u) return []
  return Array.isArray(u) ? u.filter(Boolean) : [u]
}

// ── BlockRenderer (live WebGL canvas) ─────────────────────────────────────────

interface RendererProps {
  textures?: BlockTextures
  size?: number
  className?: string
  style?: React.CSSProperties
}

export function BlockRenderer({ textures, size = 128, className, style }: RendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<GLState | null>(null)
  const genRef = useRef(0)

  const render = useCallback(() => { if (stateRef.current) drawFrame(stateRef.current) }, [])

  // Init GL once on mount
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false })
    if (!gl) { console.warn('WebGL unavailable'); return }
    stateRef.current = setupGL(gl)
    render()
  }, [render])

  // Reload textures whenever URLs change
  useEffect(() => {
    const s = stateRef.current; if (!s) return
    const gen = ++genRef.current
    const { gl } = s

    const fresh = [makeTex(gl), makeTex(gl), makeTex(gl)]
    s.textures = fresh
    render()

    const urlSets = [
      toUrls(textures?.top),
      toUrls(textures?.side),
      toUrls(textures?.right ?? textures?.side),
    ]
    urlSets.forEach((urls, i) => {
      if (!urls.length) return
      loadWithFallback(gl, fresh[i], urls, () => {
        if (genRef.current === gen) render()
      })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(textures), render])

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={className}
      style={{ imageRendering: 'pixelated', ...style }}
    />
  )
}

// ── Shared off-screen renderer (for BlockThumb) ───────────────────────────────
// One hidden canvas at a fixed size. Never resized — resizing an HTML canvas
// resets its WebGL context (destroying shaders/buffers). All thumbs render at
// THUMB_CANVAS_SIZE and are displayed at whatever CSS size the caller wants.

const THUMB_CANVAS_SIZE = 128

let _sharedState: GLState | null = null
const _thumbCache = new Map<string, string>()
let _queue = Promise.resolve()

function getSharedGL(): GLState {
  if (_sharedState) return _sharedState
  const canvas = document.createElement('canvas')
  canvas.width = THUMB_CANVAS_SIZE
  canvas.height = THUMB_CANVAS_SIZE
  Object.assign(canvas.style, { position: 'fixed', left: '-9999px', top: '-9999px', pointerEvents: 'none' })
  document.body.appendChild(canvas)
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true })
  if (!gl) throw new Error('WebGL unavailable for thumbnails')
  _sharedState = setupGL(gl)
  return _sharedState
}

async function _doThumb(textures: BlockTextures): Promise<string> {
  let s: GLState
  try { s = getSharedGL() } catch { return '' }

  const { gl } = s
  const canvas = gl.canvas as HTMLCanvasElement

  // If canvas was resized externally (shouldn't happen) or context was lost, reinit
  if (canvas.width !== THUMB_CANVAS_SIZE || canvas.height !== THUMB_CANVAS_SIZE || gl.isContextLost()) {
    canvas.width = THUMB_CANVAS_SIZE
    canvas.height = THUMB_CANVAS_SIZE
    _sharedState = setupGL(gl)
    s = _sharedState
  }

  const urlSets = [
    toUrls(textures.top),
    toUrls(textures.side),
    toUrls(textures.right ?? textures.side),
  ]

  // Allocate fresh textures so stale GL objects don't bleed between renders
  s.textures = [makeTex(s.gl), makeTex(s.gl), makeTex(s.gl)]
  await Promise.all(urlSets.map((urls, i) =>
    urls.length ? loadWithFallbackP(s.gl, s.textures[i], urls) : Promise.resolve()
  ))

  drawFrame(s)
  return canvas.toDataURL('image/png')
}

/** Renders a block to a data-URL using the shared off-screen WebGL context. Cached. */
export function renderBlockThumb(textures: BlockTextures): Promise<string> {
  const key = JSON.stringify(textures)
  if (_thumbCache.has(key)) return Promise.resolve(_thumbCache.get(key)!)

  let resolve!: (url: string) => void
  const out = new Promise<string>(r => { resolve = r })

  _queue = _queue.then(async () => {
    if (_thumbCache.has(key)) { resolve(_thumbCache.get(key)!); return }
    const url = await _doThumb(textures)
    _thumbCache.set(key, url)
    resolve(url)
  }).catch(() => { resolve('') })

  return out
}

// ── BlockThumb component ──────────────────────────────────────────────────────

interface ThumbProps {
  name: string       // block/item name (without minecraft: prefix)
  version: string    // e.g. "1.21.5"
  size?: number      // display size in px (canvas renders at 2× for crispness)
  className?: string
  style?: React.CSSProperties
}

export function BlockThumb({ name, version, size = 40, className, style }: ThumbProps) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setSrc(null)
    renderBlockThumb(guessBlockTextures(version, name)).then(url => {
      if (alive && url) setSrc(url)
    })
    return () => { alive = false }
  }, [name, version])

  if (!src) {
    return (
      <div
        className={className}
        style={{ width: size, height: size, borderRadius: 2, background: 'rgba(128,128,128,0.15)', ...style }}
      />
    )
  }

  return (
    <img
      src={src}
      alt={name}
      title={name}
      width={size}
      height={size}
      className={className}
      style={{ imageRendering: 'pixelated', display: 'block', ...style }}
    />
  )
}

// ── URL helpers ───────────────────────────────────────────────────────────────

export function blockRawUrl(version: string, name: string) {
  return `/mc-assets/${version}/blocks/${name}.png`
}
export function itemRawUrl(version: string, name: string) {
  return `/mc-assets/${version}/items/${name}.png`
}

/**
 * Texture URL arrays for a block. Each slot tries the specific variant first
 * (e.g. stone_top.png), then falls back to the plain name (stone.png),
 * then the item texture. BlockRenderer / BlockThumb handle the fallback chain.
 */
export function guessBlockTextures(version: string, blockId: string): BlockTextures {
  const name = blockId.replace(/^minecraft:/, '')
  const b = (n: string) => blockRawUrl(version, n)
  const item = itemRawUrl(version, name)
  return {
    top:   [b(`${name}_top`),    b(name), item],
    side:  [b(`${name}_side`),   b(name), item],
    right: [b(`${name}_side`),   b(name), item],
  }
}
