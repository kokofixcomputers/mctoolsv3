// Minimal big-endian NBT (Named Binary Tag) reader/writer — enough to round-trip a
// Minecraft level.dat losslessly and tweak a few fields.

export type Tag =
  | { type: 'byte'; value: number }
  | { type: 'short'; value: number }
  | { type: 'int'; value: number }
  | { type: 'long'; value: bigint }
  | { type: 'float'; value: number }
  | { type: 'double'; value: number }
  | { type: 'byteArray'; value: Int8Array }
  | { type: 'string'; value: string }
  | { type: 'list'; value: { type: TagType; items: Tag[] } }
  | { type: 'compound'; value: Record<string, Tag> }
  | { type: 'intArray'; value: Int32Array }
  | { type: 'longArray'; value: BigInt64Array }

export type TagType = Tag['type'] | 'end'

const ID_TO_TYPE: TagType[] = ['end', 'byte', 'short', 'int', 'long', 'float', 'double', 'byteArray', 'string', 'list', 'compound', 'intArray', 'longArray']
const TYPE_TO_ID: Record<string, number> = Object.fromEntries(ID_TO_TYPE.map((t, i) => [t, i]))

export interface NbtFile { rootName: string; root: Extract<Tag, { type: 'compound' }> }

// ── reader ─────────────────────────────────────────────────────────────────────────
class Reader {
  dv: DataView; off = 0; dec = new TextDecoder('utf-8')
  constructor(buf: Uint8Array) { this.dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength) }
  u8() { return this.dv.getUint8(this.off++) }
  i8() { return this.dv.getInt8(this.off++) }
  i16() { const v = this.dv.getInt16(this.off); this.off += 2; return v }
  u16() { const v = this.dv.getUint16(this.off); this.off += 2; return v }
  i32() { const v = this.dv.getInt32(this.off); this.off += 4; return v }
  i64() { const v = this.dv.getBigInt64(this.off); this.off += 8; return v }
  f32() { const v = this.dv.getFloat32(this.off); this.off += 4; return v }
  f64() { const v = this.dv.getFloat64(this.off); this.off += 8; return v }
  str() { const n = this.u16(); const s = this.dec.decode(new Uint8Array(this.dv.buffer, this.dv.byteOffset + this.off, n)); this.off += n; return s }
}

function readPayload(r: Reader, type: TagType): Tag {
  switch (type) {
    case 'byte': return { type, value: r.i8() }
    case 'short': return { type, value: r.i16() }
    case 'int': return { type, value: r.i32() }
    case 'long': return { type, value: r.i64() }
    case 'float': return { type, value: r.f32() }
    case 'double': return { type, value: r.f64() }
    case 'string': return { type, value: r.str() }
    case 'byteArray': { const n = r.i32(); const a = new Int8Array(n); for (let i = 0; i < n; i++) a[i] = r.i8(); return { type, value: a } }
    case 'intArray': { const n = r.i32(); const a = new Int32Array(n); for (let i = 0; i < n; i++) a[i] = r.i32(); return { type, value: a } }
    case 'longArray': { const n = r.i32(); const a = new BigInt64Array(n); for (let i = 0; i < n; i++) a[i] = r.i64(); return { type, value: a } }
    case 'list': {
      const elem = ID_TO_TYPE[r.u8()]; const n = r.i32(); const items: Tag[] = []
      for (let i = 0; i < n; i++) items.push(readPayload(r, elem))
      return { type, value: { type: elem, items } }
    }
    case 'compound': {
      const value: Record<string, Tag> = {}
      for (;;) {
        const id = r.u8()
        if (id === 0) break
        const name = r.str()
        value[name] = readPayload(r, ID_TO_TYPE[id])
      }
      return { type, value }
    }
    default: throw new Error('Unsupported tag type: ' + type)
  }
}

export function parseNbt(buf: Uint8Array): NbtFile {
  const r = new Reader(buf)
  const id = r.u8()
  if (id !== TYPE_TO_ID.compound) throw new Error('Not a valid NBT root')
  const rootName = r.str()
  const root = readPayload(r, 'compound') as Extract<Tag, { type: 'compound' }>
  return { rootName, root }
}

// ── writer ─────────────────────────────────────────────────────────────────────────
class Writer {
  buf = new Uint8Array(4096); len = 0; enc = new TextEncoder(); tmp = new DataView(new ArrayBuffer(8))
  ensure(n: number) { if (this.len + n > this.buf.length) { const nb = new Uint8Array(Math.max(this.buf.length * 2, this.len + n)); nb.set(this.buf); this.buf = nb } }
  u8(v: number) { this.ensure(1); this.buf[this.len++] = v & 0xff }
  i16(v: number) { this.tmp.setInt16(0, v); this.push(2) }
  i32(v: number) { this.tmp.setInt32(0, v); this.push(4) }
  i64(v: bigint) { this.tmp.setBigInt64(0, v); this.push(8) }
  f32(v: number) { this.tmp.setFloat32(0, v); this.push(4) }
  f64(v: number) { this.tmp.setFloat64(0, v); this.push(8) }
  push(n: number) { this.ensure(n); for (let i = 0; i < n; i++) this.buf[this.len++] = this.tmp.getUint8(i) }
  str(s: string) { const b = this.enc.encode(s); this.i16(b.length); this.ensure(b.length); this.buf.set(b, this.len); this.len += b.length }
  out() { return this.buf.slice(0, this.len) }
}

function writePayload(w: Writer, tag: Tag) {
  switch (tag.type) {
    case 'byte': w.u8(tag.value); break
    case 'short': w.i16(tag.value); break
    case 'int': w.i32(tag.value); break
    case 'long': w.i64(tag.value); break
    case 'float': w.f32(tag.value); break
    case 'double': w.f64(tag.value); break
    case 'string': w.str(tag.value); break
    case 'byteArray': w.i32(tag.value.length); for (const v of tag.value) w.u8(v); break
    case 'intArray': w.i32(tag.value.length); for (const v of tag.value) w.i32(v); break
    case 'longArray': w.i32(tag.value.length); for (const v of tag.value) w.i64(v); break
    case 'list': w.u8(TYPE_TO_ID[tag.value.type]); w.i32(tag.value.items.length); for (const it of tag.value.items) writePayload(w, it); break
    case 'compound':
      for (const [name, child] of Object.entries(tag.value)) {
        w.u8(TYPE_TO_ID[child.type]); w.str(name); writePayload(w, child)
      }
      w.u8(0) // End
      break
  }
}

export function writeNbt(file: NbtFile): Uint8Array {
  const w = new Writer()
  w.u8(TYPE_TO_ID.compound); w.str(file.rootName); writePayload(w, file.root)
  return w.out()
}

// ── gzip helpers (browser-native) ────────────────────────────────────────────────────
export async function gunzip(buf: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([buf as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
export async function gzip(buf: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([buf as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
export const isGzip = (buf: Uint8Array) => buf[0] === 0x1f && buf[1] === 0x8b
