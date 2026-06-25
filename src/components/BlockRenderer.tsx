/**
 * WebGL Minecraft block renderer.
 *
 * Exports:
 *  BlockRenderer  – live WebGL canvas component (for hero previews)
 *  BlockThumb     – renders via shared off-screen GL context → <img> (for grids)
 *  renderBlockThumb – imperative version of the above, returns a data-URL
 *  guessBlockTextures / guessBlockModel / blockRawUrl / itemRawUrl – URL/model helpers
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

// ── Geometry ──────────────────────────────────────────────────────────────────

interface Group { verts: Float32Array; idx: Uint16Array; texIdx: 0|1|2 }

/**
 * Generates 3 face-groups for an axis-aligned box.
 * Coordinates in -0.5..0.5 block space.
 * Group 0 (texIdx=0): top + bottom faces
 * Group 1 (texIdx=1): front (+z) + back (-z) faces
 * Group 2 (texIdx=2): right (+x) + left (-x) faces
 *
 * UV mapping mirrors the full-cube convention:
 *   top: u=x+0.5, v=z+0.5
 *   front/back: u=x+0.5, v=0.5-y
 *   right: u=z+0.5, v=0.5-y  /  left: u=0.5-z, v=0.5-y
 */
function boxFaces(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Group[] {
  const ux0 = x0+0.5, ux1 = x1+0.5  // x → u (for top and side faces)
  const uz0 = z0+0.5, uz1 = z1+0.5  // z → u (for right face)
  const fz0 = 0.5-z0, fz1 = 0.5-z1  // z → u (for left face, flipped)
  const vy0 = 0.5-y0, vy1 = 0.5-y1  // y → v (top of block = 0, bottom = 1)

  return [
    { texIdx: 0, verts: new Float32Array([
        // Top face (y=y1, normal +Y)
        x0,y1,z1, 0,1,0, ux0,uz1,  x1,y1,z1, 0,1,0, ux1,uz1,
        x1,y1,z0, 0,1,0, ux1,uz0,  x0,y1,z0, 0,1,0, ux0,uz0,
        // Bottom face (y=y0, normal -Y)
        x0,y0,z0, 0,-1,0, ux0,uz0,  x1,y0,z0, 0,-1,0, ux1,uz0,
        x1,y0,z1, 0,-1,0, ux1,uz1,  x0,y0,z1, 0,-1,0, ux0,uz1,
      ]), idx: new Uint16Array([0,1,2, 0,2,3, 4,5,6, 4,6,7]) },

    { texIdx: 1, verts: new Float32Array([
        // Front face (z=z1, normal +Z)
        x0,y0,z1, 0,0,1, ux0,vy0,  x1,y0,z1, 0,0,1, ux1,vy0,
        x1,y1,z1, 0,0,1, ux1,vy1,  x0,y1,z1, 0,0,1, ux0,vy1,
        // Back face (z=z0, normal -Z)
        x1,y0,z0, 0,0,-1, ux0,vy0,  x0,y0,z0, 0,0,-1, ux1,vy0,
        x0,y1,z0, 0,0,-1, ux1,vy1,  x1,y1,z0, 0,0,-1, ux0,vy1,
      ]), idx: new Uint16Array([0,1,2, 0,2,3, 4,5,6, 4,6,7]) },

    { texIdx: 2, verts: new Float32Array([
        // Right face (x=x1, normal +X)
        x1,y0,z1, 1,0,0, uz1,vy0,  x1,y0,z0, 1,0,0, uz0,vy0,
        x1,y1,z0, 1,0,0, uz0,vy1,  x1,y1,z1, 1,0,0, uz1,vy1,
        // Left face (x=x0, normal -X) — u is z-flipped
        x0,y0,z0, -1,0,0, fz0,vy0,  x0,y0,z1, -1,0,0, fz1,vy0,
        x0,y1,z1, -1,0,0, fz1,vy1,  x0,y1,z0, -1,0,0, fz0,vy1,
      ]), idx: new Uint16Array([0,1,2, 0,2,3, 4,5,6, 4,6,7]) },
  ]
}

function mergeGroups(...sets: Group[][]): Group[] {
  const out: Group[] = [
    { texIdx: 0, verts: new Float32Array(0), idx: new Uint16Array(0) },
    { texIdx: 1, verts: new Float32Array(0), idx: new Uint16Array(0) },
    { texIdx: 2, verts: new Float32Array(0), idx: new Uint16Array(0) },
  ]
  for (const set of sets) {
    for (const g of set) {
      const slot = out[g.texIdx]
      const base = slot.verts.length / 8  // 8 floats per vertex
      const offsetIdx = new Uint16Array(g.idx.length)
      for (let j = 0; j < g.idx.length; j++) offsetIdx[j] = g.idx[j] + base
      const verts = new Float32Array(slot.verts.length + g.verts.length)
      verts.set(slot.verts); verts.set(g.verts, slot.verts.length)
      const idx = new Uint16Array(slot.idx.length + offsetIdx.length)
      idx.set(slot.idx); idx.set(offsetIdx, slot.idx.length)
      out[g.texIdx] = { texIdx: g.texIdx as 0|1|2, verts, idx }
    }
  }
  return out
}

// ── Model geometry builders ───────────────────────────────────────────────────

function cubeGroups(): Group[] { return boxFaces(-0.5,-0.5,-0.5, 0.5,0.5,0.5) }

function slabGroups(): Group[] { return boxFaces(-0.5,-0.5,-0.5, 0.5,0,0.5) }

function stairsGroups(): Group[] {
  return mergeGroups(
    boxFaces(-0.5,-0.5,-0.5, 0.5, 0, 0.5),   // bottom full layer
    boxFaces(-0.5, 0, -0.5, 0.5, 0.5, 0),     // upper back step
  )
}

function waterLilyGroups(): Group[] {
  const y = -0.5 + 1/16
  return [{
    texIdx: 0,
    verts: new Float32Array([
      -0.5,y,-0.5, 0,1,0, 0,0,
       0.5,y,-0.5, 0,1,0, 1,0,
       0.5,y, 0.5, 0,1,0, 1,1,
      -0.5,y, 0.5, 0,1,0, 0,1,
    ]),
    idx: new Uint16Array([0,1,2, 0,2,3]),
  }]
}

function crossGroups(): Group[] {
  // Two diagonal planes forming an X (used for flowers, saplings, tall grass, etc.)
  const h = 0.5
  const s = 1 / Math.SQRT2  // normal component for 45° diagonal planes
  return [{
    texIdx: 1,
    verts: new Float32Array([
      // Plane A: NW→SE diagonal
      -h,-h,-h, -s,0,s, 0,1,   h,-h, h, -s,0,s, 1,1,
       h, h, h, -s,0,s, 1,0,  -h, h,-h, -s,0,s, 0,0,
      // Plane B: NE→SW diagonal
       h,-h,-h,  s,0,s, 0,1,  -h,-h, h,  s,0,s, 1,1,
      -h, h, h,  s,0,s, 1,0,   h, h,-h,  s,0,s, 0,0,
    ]),
    idx: new Uint16Array([0,1,2, 0,2,3, 4,5,6, 4,6,7]),
  }]
}

function cropGroups(): Group[] {
  // Four planes in # pattern (wheat, carrots, potatoes, etc.)
  const o = 0.25
  return [{
    texIdx: 1,
    verts: new Float32Array([
      // N-S plane at x=-0.25
      -o,-0.5,-0.5, 1,0,0, 0,1,  -o,-0.5, 0.5, 1,0,0, 1,1,
      -o, 0.5, 0.5, 1,0,0, 1,0,  -o, 0.5,-0.5, 1,0,0, 0,0,
      // N-S plane at x=+0.25
       o,-0.5,-0.5,-1,0,0, 0,1,   o,-0.5, 0.5,-1,0,0, 1,1,
       o, 0.5, 0.5,-1,0,0, 1,0,   o, 0.5,-0.5,-1,0,0, 0,0,
      // E-W plane at z=-0.25
      -0.5,-0.5,-o, 0,0,1, 0,1,   0.5,-0.5,-o, 0,0,1, 1,1,
       0.5, 0.5,-o, 0,0,1, 1,0,  -0.5, 0.5,-o, 0,0,1, 0,0,
      // E-W plane at z=+0.25
      -0.5,-0.5, o, 0,0,-1, 0,1,  0.5,-0.5, o, 0,0,-1, 1,1,
       0.5, 0.5, o, 0,0,-1, 1,0, -0.5, 0.5, o, 0,0,-1, 0,0,
    ]),
    idx: new Uint16Array([
       0, 1, 2,  0, 2, 3,
       4, 5, 6,  4, 6, 7,
       8, 9,10,  8,10,11,
      12,13,14, 12,14,15,
    ]),
  }]
}

function buttonGroups(): Group[] {
  // 6×6×2 pixels centered in x/z
  const bx = 3/16, bz = 3/16, hy = 1/16
  return boxFaces(-bx, -hy, -bz, bx, hy, bz)
}

function pressurePlateGroups(): Group[] {
  // 16×16, 1px tall, sitting at block base
  return boxFaces(-0.5, -0.5, -0.5, 0.5, -0.5 + 1/16, 0.5)
}

// Minecraft coord → our -0.5..0.5 space
const mc = (v: number) => v / 16 - 0.5

function fenceGroups(): Group[] {
  // fence_inventory model: two posts (z=0-4 and z=12-16) with two horizontal rails
  return mergeGroups(
    boxFaces(mc(6), mc(0),  mc(0),  mc(10), mc(16), mc(4)),   // left post
    boxFaces(mc(6), mc(0),  mc(12), mc(10), mc(16), mc(16)),  // right post
    boxFaces(mc(7), mc(12), mc(0),  mc(9),  mc(15), mc(16)),  // top rail
    boxFaces(mc(7), mc(6),  mc(0),  mc(9),  mc(9),  mc(16)),  // bottom rail
  )
}

function fenceGateGroups(): Group[] {
  // template_fence_gate: two side posts + inner bars + upper/lower horizontal bars
  return mergeGroups(
    boxFaces(mc(0),  mc(5),  mc(7), mc(2),  mc(16), mc(9)),  // left post
    boxFaces(mc(14), mc(5),  mc(7), mc(16), mc(16), mc(9)),  // right post
    boxFaces(mc(6),  mc(6),  mc(7), mc(8),  mc(15), mc(9)),  // inner left bar
    boxFaces(mc(8),  mc(6),  mc(7), mc(10), mc(15), mc(9)),  // inner right bar
    boxFaces(mc(2),  mc(6),  mc(7), mc(6),  mc(9),  mc(9)),  // lower left horiz
    boxFaces(mc(2),  mc(12), mc(7), mc(6),  mc(15), mc(9)),  // upper left horiz
    boxFaces(mc(10), mc(6),  mc(7), mc(14), mc(9),  mc(9)),  // lower right horiz
    boxFaces(mc(10), mc(12), mc(7), mc(14), mc(15), mc(9)),  // upper right horiz
  )
}

function chainGroups(): Group[] {
  // Two thin perpendicular planes (3px wide) at block center.
  // UV maps only to the first 3px of the texture to show chain links.
  const hw = 3 / 16  // half of 3px
  const h = 0.5
  const u1 = 3 / 16  // right edge of chain strip in texture
  return [{
    texIdx: 1,
    verts: new Float32Array([
      // XY plane (normal ±Z) — front
      -hw,-h, 0,  0,0,1, 0,1,   hw,-h, 0,  0,0,1, u1,1,
       hw, h, 0,  0,0,1, u1,0, -hw, h, 0,  0,0,1,  0,0,
      // XY plane — back
       hw,-h, 0,  0,0,-1, 0,1, -hw,-h, 0,  0,0,-1, u1,1,
      -hw, h, 0,  0,0,-1, u1,0,  hw, h, 0,  0,0,-1,  0,0,
      // ZY plane (normal ±X) — front
      0,-h,-hw,  1,0,0, 0,1,  0,-h, hw,  1,0,0, u1,1,
      0, h, hw,  1,0,0, u1,0, 0, h,-hw,  1,0,0,  0,0,
      // ZY plane — back
      0,-h, hw, -1,0,0, 0,1,  0,-h,-hw, -1,0,0, u1,1,
      0, h,-hw, -1,0,0, u1,0, 0, h, hw, -1,0,0,  0,0,
    ]),
    idx: new Uint16Array([
       0, 1, 2,  0, 2, 3,
       4, 5, 6,  4, 6, 7,
       8, 9,10,  8,10,11,
      12,13,14, 12,14,15,
    ]),
  }]
}

function trapdoorGroups(): Group[] {
  // template_orientable_trapdoor_bottom: [0,0,0]→[16,3,16]
  return boxFaces(-0.5, -0.5, -0.5, 0.5, mc(3), 0.5)
}

function wallGroups(): Group[] {
  // wall_inventory template: center post + two side rails
  return mergeGroups(
    boxFaces(mc(4), mc(0), mc(4), mc(12), mc(16), mc(12)),  // center post
    boxFaces(mc(5), mc(0), mc(0), mc(11), mc(13), mc(16)),  // side rails
  )
}

function chestGroups(): Group[] {
  // Standard chest: body + lid + small lock knob
  return mergeGroups(
    boxFaces(mc(1), mc(0),  mc(1), mc(15), mc(10), mc(15)),  // body
    boxFaces(mc(1), mc(10), mc(1), mc(15), mc(14), mc(15)),  // lid
    boxFaces(mc(7), mc(7),  mc(0), mc(9),  mc(11), mc(1)),   // lock
  )
}

interface ModelElementFace { uv?: number[]; texture: string }
interface ModelElement {
  from: [number, number, number]
  to: [number, number, number]
  rotation?: unknown
  faces?: Record<string, ModelElementFace>
}

function elementsToGroups(elements: ModelElement[]): Group[] {
  const sets: Group[][] = []
  for (const el of elements) {
    const x0 = el.from[0]/16 - 0.5, y0 = el.from[1]/16 - 0.5, z0 = el.from[2]/16 - 0.5
    const x1 = el.to[0]/16 - 0.5,   y1 = el.to[1]/16 - 0.5,   z1 = el.to[2]/16 - 0.5
    if (x0 >= x1 || y0 >= y1 || z0 >= z1) continue
    sets.push(boxFaces(x0, y0, z0, x1, y1, z1))
  }
  return sets.length ? mergeGroups(...sets) : cubeGroups()
}

function anvilGroups(): Group[] {
  // Convert from 0..1 reference space to our -0.5..0.5 block space
  const b = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
    boxFaces(x0-0.5, y0-0.5, z0-0.5, x1-0.5, y1-0.5, z1-0.5)
  return mergeGroups(
    b(0.125, 0,      0.125,  0.875, 0.25,   0.875),  // base plate
    b(3/16,  0.25,   4/16,   13/16, 5/16,   12/16),  // lower body
    b(4/16,  5/16,   6/16,   12/16, 10/16,  10/16),  // narrow middle
    b(0,     10/16,  3/16,   1,     1,      13/16),  // wide top
  )
}

function modelGroups(type: BlockModelType): Group[] {
  switch (type) {
    case 'slab':      return slabGroups()
    case 'stairs':    return stairsGroups()
    case 'waterLily': return waterLilyGroups()
    case 'cross':     return crossGroups()
    case 'crop':      return cropGroups()
    case 'anvil':     return anvilGroups()
    case 'button':         return buttonGroups()
    case 'pressure_plate': return pressurePlateGroups()
    case 'fence':          return fenceGroups()
    case 'fence_gate':     return fenceGateGroups()
    case 'chain':          return chainGroups()
    case 'chest':          return chestGroups()
    case 'trapdoor':       return trapdoorGroups()
    case 'wall':           return wallGroups()
    default:               return cubeGroups()
  }
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

function loadWithFallbackP(
  gl: WebGLRenderingContext,
  tex: WebGLTexture,
  urls: string[],
): Promise<void> {
  return new Promise(resolve => loadWithFallback(gl, tex, urls, resolve))
}

// ── GL state type + setup ─────────────────────────────────────────────────────

type GLGroup = { vbo: WebGLBuffer; ibo: WebGLBuffer; count: number; texIdx: 0|1|2 }

interface GLState {
  gl: WebGLRenderingContext
  prog: WebGLProgram
  a: { pos: number; norm: number; uv: number }
  u: { mv: WebGLUniformLocation; rt: WebGLUniformLocation; p: WebGLUniformLocation; tex: WebGLUniformLocation }
  groups: GLGroup[]
  textures: WebGLTexture[]
  mats: { mv: Float32Array; rt: Float32Array; p: Float32Array }
}

function uploadGroups(gl: WebGLRenderingContext, groups: Group[]): GLGroup[] {
  return groups.map(g => {
    const vbo = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.bufferData(gl.ARRAY_BUFFER, g.verts, gl.STATIC_DRAW)
    const ibo = gl.createBuffer()!
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.idx, gl.STATIC_DRAW)
    return { vbo, ibo, count: g.idx.length, texIdx: g.texIdx }
  })
}

function freeGroups(gl: WebGLRenderingContext, groups: GLGroup[]) {
  for (const g of groups) { gl.deleteBuffer(g.vbo); gl.deleteBuffer(g.ibo) }
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

  const mats = {
    mv: trans(0, 0, 0),
    rt: mul(rotX(30), rotY(45)),
    p:  ortho(-0.85, 0.85, -0.85, 0.85, -2.5, 2.5),
  }

  const groups = uploadGroups(gl, cubeGroups())
  const textures = [makeTex(gl), makeTex(gl), makeTex(gl)]

  return { gl, prog, a, u, groups, textures, mats }
}

function drawFrame(s: GLState) {
  const { gl, prog, a, u, groups, textures: tex, mats } = s
  if (!groups.length) return
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

export type BlockModelType = 'cube' | 'slab' | 'stairs' | 'cross' | 'crop' | 'waterLily' | 'anvil' | 'button' | 'pressure_plate' | 'fence' | 'fence_gate' | 'chain' | 'chest' | 'trapdoor' | 'wall'

/** Infers the best rendering model from a block name. */
export function guessBlockModel(name: string): BlockModelType {
  const n = name.replace(/^minecraft:/, '').toLowerCase()
  if (n === 'lily_pad') return 'waterLily'
  if (n.includes('_slab')) return 'slab'
  if (n.includes('_stair')) return 'stairs'
  if (n === 'anvil' || n === 'chipped_anvil' || n === 'damaged_anvil') return 'anvil'
  if (n.endsWith('_button')) return 'button'
  if (n.endsWith('_pressure_plate')) return 'pressure_plate'
  if (n.endsWith('_fence_gate') || n === 'fence_gate') return 'fence_gate'
  if (n.endsWith('_fence') || n === 'fence') return 'fence'
  if (n === 'chain') return 'chain'
  if (n === 'chest' || n === 'trapped_chest' || n === 'ender_chest' || n === 'christmas_chest') return 'chest'
  if (n.endsWith('_trapdoor')) return 'trapdoor'
  if (n.endsWith('_wall') || n === 'wall') return 'wall'

  // Cross / plant shapes
  if (
    n.endsWith('_sapling') || n.endsWith('_flower') || n.endsWith('_bush') ||
    n === 'dead_bush' || n === 'short_grass' || n === 'fern' || n === 'large_fern' ||
    n === 'dandelion' || n === 'poppy' || n === 'allium' || n === 'azure_bluet' ||
    n === 'oxeye_daisy' || n === 'cornflower' || n === 'lily_of_the_valley' ||
    n === 'wither_rose' || n === 'torchflower' || n === 'sunflower' ||
    n === 'lilac' || n === 'rose_bush' || n === 'peony' || n === 'pitcher_plant' ||
    n === 'brown_mushroom' || n === 'red_mushroom' ||
    n === 'nether_sprouts' || n === 'sugar_cane' || n === 'bamboo_sapling' ||
    n === 'hanging_roots' || n === 'twisting_vines' || n === 'weeping_vines' ||
    n === 'tall_grass' || n === 'seagrass' || n === 'tall_seagrass' ||
    n.includes('tulip') || n.includes('torch') || n.includes('vine')
  ) return 'cross'

  // Crop shapes
  if (
    n.startsWith('wheat') || n.startsWith('carrots') || n.startsWith('potatoes') ||
    n.startsWith('beetroots') || n.startsWith('nether_wart') ||
    n.startsWith('pitcher_crop') || n.startsWith('torchflower_crop') ||
    n.startsWith('sweet_berry_bush')
  ) return 'crop'

  return 'cube'
}

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
  model?: BlockModelType
  blockId?: string      // when set, auto-resolve element geometry from models JSON
  blockVersion?: string
  size?: number
  className?: string
  style?: React.CSSProperties
}

export function BlockRenderer({ textures, model = 'cube', blockId, blockVersion, size = 128, className, style }: RendererProps) {
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

  // Rebuild geometry: element-based when blockId is provided, otherwise use model prop
  useEffect(() => {
    const s = stateRef.current; if (!s) return
    if (blockId && blockVersion) {
      let alive = true
      fetchBlockModels(blockVersion).then(models => {
        if (!alive) return
        const entry = models[blockId] ?? models[blockId + '_inventory']
        const groups = (entry?.elements?.length)
          ? elementsToGroups(entry.elements)
          : modelGroups(model)
        freeGroups(s.gl, s.groups)
        s.groups = uploadGroups(s.gl, groups)
        render()
      })
      return () => { alive = false }
    }
    freeGroups(s.gl, s.groups)
    s.groups = uploadGroups(s.gl, modelGroups(model))
    render()
  }, [model, blockId, blockVersion, render])

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

async function _doThumb(textures: BlockTextures, model: BlockModelType, version?: string, blockName?: string): Promise<string> {
  let overrideGroups: Group[] | null = null
  if (version && blockName) {
    const models = await fetchBlockModels(version)
    const better = modelTextures(version, blockName, models)
    if (better) textures = better
    // Use element-based geometry when available (overrides model param)
    const entry = models[blockName] ?? models[blockName + '_inventory']
    if (entry?.elements && entry.elements.length > 0) {
      overrideGroups = elementsToGroups(entry.elements)
    }
  }

  let s: GLState
  try { s = getSharedGL() } catch { return '' }

  const { gl } = s
  const canvas = gl.canvas as HTMLCanvasElement

  if (canvas.width !== THUMB_CANVAS_SIZE || canvas.height !== THUMB_CANVAS_SIZE || gl.isContextLost()) {
    canvas.width = THUMB_CANVAS_SIZE
    canvas.height = THUMB_CANVAS_SIZE
    _sharedState = setupGL(gl)
    s = _sharedState
  }

  // Switch geometry: prefer element-based, then named model, then cube
  freeGroups(s.gl, s.groups)
  s.groups = uploadGroups(s.gl, overrideGroups ?? modelGroups(model))

  const urlSets = [
    toUrls(textures.top),
    toUrls(textures.side),
    toUrls(textures.right ?? textures.side),
  ]

  s.textures = [makeTex(s.gl), makeTex(s.gl), makeTex(s.gl)]
  await Promise.all(urlSets.map((urls, i) =>
    urls.length ? loadWithFallbackP(s.gl, s.textures[i], urls) : Promise.resolve()
  ))

  drawFrame(s)
  return canvas.toDataURL('image/png')
}

/** Renders a block to a data-URL using the shared off-screen WebGL context. Cached. */
export function renderBlockThumb(
  textures: BlockTextures,
  model: BlockModelType = 'cube',
  version?: string,
  blockName?: string,
): Promise<string> {
  const key = JSON.stringify({ textures, model, version, blockName })
  if (_thumbCache.has(key)) return Promise.resolve(_thumbCache.get(key)!)

  let resolve!: (url: string) => void
  const out = new Promise<string>(r => { resolve = r })

  _queue = _queue.then(async () => {
    if (_thumbCache.has(key)) { resolve(_thumbCache.get(key)!); return }
    const url = await _doThumb(textures, model, version, blockName)
    _thumbCache.set(key, url)
    resolve(url)
  }).catch(() => { resolve('') })

  return out
}

// ── BlockThumb component ──────────────────────────────────────────────────────

interface ThumbProps {
  name: string       // block/item name (without minecraft: prefix)
  version: string    // e.g. "1.21.5"
  model?: BlockModelType  // optional override; auto-detected from name if omitted
  size?: number      // display size in px (canvas renders at 2× for crispness)
  className?: string
  style?: React.CSSProperties
}

export function BlockThumb({ name, version, model, size = 40, className, style }: ThumbProps) {
  const resolvedModel = model ?? guessBlockModel(name)
  // null = loading, '' = item (show flat sprite), string = data-URL (show 3D)
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setSrc(null)
    ;(async () => {
      const models = await fetchBlockModels(version)
      const inModels = name in models || (name + '_inventory') in models
      // A non-cube named model type means we explicitly know how to render this shape
      const knownShape = guessBlockModel(name) !== 'cube'
      const unsupported = /(_wall)?_sign$|_hanging_sign$|_wall_hanging_sign$/.test(name)
      if ((!inModels && !knownShape) || unsupported) {
        if (alive) setSrc('')
        return
      }
      const url = await renderBlockThumb(guessBlockTextures(version, name), resolvedModel, version, name)
      if (alive) setSrc(url || '')
    })()
    return () => { alive = false }
  }, [name, version, resolvedModel])

  if (src === null) {
    // Still loading
    return (
      <div
        className={className}
        style={{ width: size, height: size, borderRadius: 2, background: 'rgba(128,128,128,0.15)', ...style }}
      />
    )
  }

  if (src === '') {
    // Item-only — show flat 2D sprite
    return (
      <img
        src={itemRawUrl(version, name)}
        alt={name}
        title={name}
        width={size}
        height={size}
        className={className}
        style={{ imageRendering: 'pixelated', display: 'block', ...style }}
        onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2' }}
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

// ── Block model JSON texture resolver ─────────────────────────────────────────

type BlockModels = Record<string, { textures?: Record<string, string>; elements?: ModelElement[] }>
const _modelsCache = new Map<string, BlockModels>()

async function fetchBlockModels(version: string): Promise<BlockModels> {
  if (_modelsCache.has(version)) return _modelsCache.get(version)!
  try {
    const r = await fetch(`/mc-assets/${version}/blocks_models.json`)
    if (!r.ok) return {}
    const d = await r.json() as BlockModels
    _modelsCache.set(version, d)
    return d
  } catch { return {} }
}

function mcTexToUrl(version: string, ref: string): string {
  // "minecraft:block/acacia_planks" or "block/acacia_planks" → blocks URL
  const name = ref.replace(/^(?:minecraft:)?block\//, '')
  return blockRawUrl(version, name)
}

/** Returns BlockTextures from blocks_models.json, or null if nothing useful found. */
function modelTextures(version: string, blockName: string, models: BlockModels): BlockTextures | null {
  // Fences, walls, etc. only have a direct entry under "{name}_inventory"
  const m = models[blockName] ?? models[blockName + '_inventory']
  if (!m?.textures) return null
  const t = m.textures
  const pick = (...keys: string[]) => {
    for (const k of keys) if (t[k]) return mcTexToUrl(version, t[k])
    return undefined
  }
  const top  = pick('top', 'end', 'all', 'texture', 'wall', 'wool', 'particle')
  const side = pick('side', 'all', 'texture', 'wall', 'top', 'end', 'wool', 'particle')
  if (!top && !side) return null
  return { top, side, right: side }
}

/**
 * Like guessBlockTextures but upgrades to model-JSON-resolved textures once
 * blocks_models.json has loaded. Starts with the heuristic fallback and
 * calls onUpdate when better data is available.
 */
export function resolveBlockTextures(
  version: string,
  blockId: string,
  onUpdate: (t: BlockTextures) => void,
): BlockTextures {
  const fallback = guessBlockTextures(version, blockId)
  const name = blockId.replace(/^minecraft:/, '')
  const cached = _modelsCache.get(version)
  if (cached) {
    return modelTextures(version, name, cached) ?? fallback
  }
  fetchBlockModels(version).then(models => {
    const better = modelTextures(version, name, models)
    if (better) onUpdate(better)
  })
  return fallback
}

/**
 * Returns the primary flat-sprite URL for a block using blocks_models.json,
 * or null if the block has no model entry. Used as a fallback for sidebar sprites.
 */
export async function resolveBlockSpriteUrl(version: string, name: string): Promise<string | null> {
  const models = await fetchBlockModels(version)
  const tex = modelTextures(version, name, models)
  const url = tex?.side ?? tex?.top
  return (typeof url === 'string' && url) ? url : null
}

/** React hook: true once blocks_models.json confirms this name is a Minecraft block. */
export function useIsBlock(version: string, name: string): boolean | null {
  const [result, setResult] = useState<boolean | null>(null)
  useEffect(() => {
    setResult(null)
    fetchBlockModels(version).then(models => {
      const inModels = name in models || (name + '_inventory') in models
      const knownShape = guessBlockModel(name) !== 'cube'
      const unsupported = /(_wall)?_sign$|_hanging_sign$|_wall_hanging_sign$/.test(name)
      setResult((inModels || knownShape) && !unsupported)
    })
  }, [version, name])
  return result
}

/**
 * React hook: resolves block textures from blocks_models.json, upgrading from
 * the heuristic fallback once the JSON is cached (instant on subsequent mounts).
 */
export function useBlockTextures(version: string, blockId: string): BlockTextures {
  const [textures, setTextures] = useState<BlockTextures>(() =>
    resolveBlockTextures(version, blockId, t => setTextures(t))
  )
  useEffect(() => {
    setTextures(resolveBlockTextures(version, blockId, t => setTextures(t)))
  }, [version, blockId])
  return textures
}
