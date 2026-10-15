/**
 * A column of Superflat layers drawn in WebGL with the real block textures, that can be turned by dragging.
 *
 * Every layer is a box as wide as a block. Tall layers are drawn shorter than they are (see visualHeight) so a world of
 * 230 stone does not push everything else out of view, and each block of height gets its own slice of the texture.
 * Textures that are an animation strip (water, lava, magma) show their first frame.
 */
import { useEffect, useRef } from 'react'
import { resolveBlockTextures, type BlockTextures } from './BlockRenderer'
import { visualHeight, type Layer } from '../lib/superflat'

const VERT = `
attribute vec3 aPos;
attribute vec3 aNorm;
attribute vec2 aUV;
uniform mat4 uM;
uniform mat4 uP;
varying vec3 vNorm;
varying vec2 vUV;
void main(void) {
  gl_Position = uP * uM * vec4(aPos, 1.0);
  vNorm = normalize((uM * vec4(aNorm, 0.0)).xyz);
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
  vec3 light = normalize(vec3(-0.6, 1.0, 0.8));
  float lw = 0.55 + 0.45 * max(0.0, dot(normalize(vNorm), light));
  gl_FragColor = vec4(col.rgb * lw, col.a);
}
`

type Mat = Float32Array
const mul = (a: Mat, b: Mat): Mat => {
  const o = new Float32Array(16)
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += a[i + k * 4] * b[k + j * 4]
      o[i + j * 4] = s
    }
  return o
}
const rotY = (deg: number): Mat => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1])
}
const rotX = (deg: number): Mat => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1])
}
const trans = (x: number, y: number, z: number): Mat => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1])
const ortho = (l: number, r: number, b: number, t: number, n: number, f: number): Mat =>
  new Float32Array([2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1])

/** One textured quad per face, 8 floats per vertex (position, normal, uv). */
class Mesh {
  v: number[] = []
  i: number[] = []
  quad(p: number[][], n: number[], uv: number[][]) {
    const base = this.v.length / 8
    p.forEach((pt, k) => this.v.push(...pt, ...n, ...uv[k]))
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
}

/** The column is this many blocks wide and deep, so tall stacks still look like something. */
const CELLS = 2

/** A layer as a box from y0 to y1 with `slices` slices of side texture, a top face and a bottom face, one quad per block. */
function layerMeshes(y0: number, y1: number, slices: number) {
  const top = new Mesh()
  const side = new Mesh()
  const lo = -CELLS / 2
  const step = (y1 - y0) / slices
  const uv = [[0, 1], [1, 1], [1, 0], [0, 0]]
  for (let a = 0; a < CELLS; a++) {
    const x0 = lo + a, x1 = x0 + 1
    for (let c = 0; c < CELLS; c++) {
      const z0 = lo + c, z1 = z0 + 1
      top.quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], uv)
      top.quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], uv)
    }
    for (let sl = 0; sl < slices; sl++) {
      const ya = y0 + sl * step, yb = ya + step
      const e = CELLS / 2
      // v runs down the face, so the first slice of the texture is the top of the layer.
      side.quad([[x0, ya, e], [x1, ya, e], [x1, yb, e], [x0, yb, e]], [0, 0, 1], uv)
      side.quad([[x1, ya, -e], [x0, ya, -e], [x0, yb, -e], [x1, yb, -e]], [0, 0, -1], uv)
      side.quad([[e, ya, x1], [e, ya, x0], [e, yb, x0], [e, yb, x1]], [1, 0, 0], uv)
      side.quad([[-e, ya, x0], [-e, ya, x1], [-e, yb, x1], [-e, yb, x0]], [-1, 0, 0], uv)
    }
  }
  return { top, side }
}

interface Piece {
  vbo: WebGLBuffer
  ibo: WebGLBuffer
  count: number
  tex: WebGLTexture
}

const urlsOf = (u: BlockTextures['top']): string[] => (!u ? [] : Array.isArray(u) ? u.filter(Boolean) : [u])

/** Loads the first of the urls that exists. An animation strip is cut down to its first square frame. */
function loadTexture(gl: WebGLRenderingContext, tex: WebGLTexture, urls: string[], done: () => void) {
  const attempt = (n: number) => {
    if (n >= urls.length) return done()
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      let source: TexImageSource = img
      if (img.height > img.width) {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = img.width
        canvas.getContext('2d')!.drawImage(img, 0, 0, img.width, img.width, 0, 0, img.width, img.width)
        source = canvas
      }
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
      done()
    }
    img.onerror = () => attempt(n + 1)
    img.src = urls[n]
  }
  attempt(0)
}

function makeTexture(gl: WebGLRenderingContext): WebGLTexture {
  const t = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]))
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return t
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src.trim())
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader')
  return s
}

interface Props {
  layers: Layer[] // from the surface down
  version: string
  className?: string
  style?: React.CSSProperties
}

export default function LayerStack({ layers, version, className, style }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const view = useRef({ yaw: 35, pitch: 22, zoom: 1 })
  const frameRequest = useRef(0)
  const scene = useRef<{ draw: () => void; rebuild: (l: Layer[], v: string) => void } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: true })
    if (!gl) return

    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    const loc = {
      pos: gl.getAttribLocation(prog, 'aPos'),
      norm: gl.getAttribLocation(prog, 'aNorm'),
      uv: gl.getAttribLocation(prog, 'aUV'),
      m: gl.getUniformLocation(prog, 'uM'),
      p: gl.getUniformLocation(prog, 'uP'),
      tex: gl.getUniformLocation(prog, 'uTex'),
    }
    gl.enable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    let pieces: Piece[] = []
    let height = 1
    let generation = 0

    const request = () => {
      if (!frameRequest.current) frameRequest.current = requestAnimationFrame(() => { frameRequest.current = 0; draw() })
    }

    const free = () => {
      pieces.forEach((p) => { gl.deleteBuffer(p.vbo); gl.deleteBuffer(p.ibo); gl.deleteTexture(p.tex) })
      pieces = []
    }

    const upload = (mesh: Mesh, tex: WebGLTexture) => {
      const vbo = gl.createBuffer()!
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.v), gl.STATIC_DRAW)
      const ibo = gl.createBuffer()!
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo)
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.i), gl.STATIC_DRAW)
      pieces.push({ vbo, ibo, count: mesh.i.length, tex })
    }

    const rebuild = (list: Layer[], ver: string) => {
      generation++
      const mine = generation
      free()
      const visible = list.filter((l) => l.block !== 'minecraft:air')
      const heights = visible.map((l) => visualHeight(l.count))
      height = Math.max(1, heights.reduce((a, b) => a + b, 0))
      // The column is centred around y = 0, the surface is the top.
      let y = height / 2
      visible.forEach((layer, n) => {
        const y1 = y
        const y0 = y - heights[n]
        y = y0
        const { top, side } = layerMeshes(y0, y1, Math.max(1, Math.ceil(heights[n] - 1e-6)))
        const textures = [makeTexture(gl), makeTexture(gl)]
        const apply = (t: BlockTextures) => {
          if (mine !== generation) return
          loadTexture(gl, textures[0], urlsOf(t.top), request)
          loadTexture(gl, textures[1], urlsOf(t.side), request)
        }
        apply(resolveBlockTextures(ver, layer.block, apply))
        upload(top, textures[0])
        upload(side, textures[1])
      })
      request()
    }

    const draw = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight
      const ratio = window.devicePixelRatio || 1
      if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
        canvas.width = Math.round(w * ratio)
        canvas.height = Math.round(h * ratio)
      }
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
      gl.useProgram(prog)

      // Fits the column (or at least the block's width) into view at every size and aspect ratio.
      const aspect = w / Math.max(1, h)
      const extent = Math.max(height * 0.55 + 1.6, 2.6) / view.current.zoom
      gl.uniformMatrix4fv(loc.p, false, ortho(-extent * aspect, extent * aspect, -extent, extent, -50, 50))
      gl.uniformMatrix4fv(loc.m, false, mul(rotX(view.current.pitch), mul(rotY(view.current.yaw), trans(0, 0, 0))))

      const stride = 32
      pieces.forEach((p) => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, p.tex)
        gl.uniform1i(loc.tex, 0)
        gl.bindBuffer(gl.ARRAY_BUFFER, p.vbo)
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, p.ibo)
        gl.enableVertexAttribArray(loc.pos); gl.vertexAttribPointer(loc.pos, 3, gl.FLOAT, false, stride, 0)
        gl.enableVertexAttribArray(loc.norm); gl.vertexAttribPointer(loc.norm, 3, gl.FLOAT, false, stride, 12)
        gl.enableVertexAttribArray(loc.uv); gl.vertexAttribPointer(loc.uv, 2, gl.FLOAT, false, stride, 24)
        gl.drawElements(gl.TRIANGLES, p.count, gl.UNSIGNED_SHORT, 0)
      })
    }

    scene.current = { draw: request, rebuild }
    const resize = new ResizeObserver(request)
    resize.observe(canvas)

    return () => {
      resize.disconnect()
      cancelAnimationFrame(frameRequest.current)
      frameRequest.current = 0
      generation++
      free()
      scene.current = null
    }
  }, [])

  // Only the blocks and heights decide the geometry, so typing in another field does not rebuild it.
  const signature = layers.map((l) => `${l.block}:${l.count}`).join(',')
  useEffect(() => {
    scene.current?.rebuild(layers, version)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, version])

  const drag = useRef<{ x: number; y: number; pointer: number } | null>(null)

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ touchAction: 'none', cursor: 'grab', imageRendering: 'pixelated', ...style }}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY, pointer: e.pointerId }
        e.currentTarget.setPointerCapture(e.pointerId)
        e.currentTarget.style.cursor = 'grabbing'
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d || d.pointer !== e.pointerId) return
        view.current.yaw += (e.clientX - d.x) * 0.6
        view.current.pitch = Math.max(-85, Math.min(85, view.current.pitch + (e.clientY - d.y) * 0.5))
        d.x = e.clientX
        d.y = e.clientY
        scene.current?.draw()
      }}
      onPointerUp={(e) => {
        drag.current = null
        e.currentTarget.style.cursor = 'grab'
      }}
      onWheel={(e) => {
        view.current.zoom = Math.max(0.5, Math.min(4, view.current.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)))
        scene.current?.draw()
      }}
    />
  )
}
