import type { NbtDocument, NbtNode } from './nbtTypes'

class Writer {
  buf: number[] = []
  u8(v: number) { this.buf.push(v & 0xff) }
  i8(v: number) { this.u8(v < 0 ? v + 256 : v) }
  i16(v: number) { this.u8((v >> 8) & 0xff); this.u8(v & 0xff) }
  i32(v: number) { this.u8((v >> 24) & 0xff); this.u8((v >> 16) & 0xff); this.u8((v >> 8) & 0xff); this.u8(v & 0xff) }
  i64(v: bigint) {
    const dv = new DataView(new ArrayBuffer(8))
    dv.setBigInt64(0, v, false)
    for (let i = 0; i < 8; i++) this.u8(dv.getUint8(i))
  }
  f32(v: number) { const dv = new DataView(new ArrayBuffer(4)); dv.setFloat32(0, v, false); for (let i = 0; i < 4; i++) this.u8(dv.getUint8(i)) }
  f64(v: number) { const dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, v, false); for (let i = 0; i < 8; i++) this.u8(dv.getUint8(i)) }
  str(s: string) {
    const enc = new TextEncoder().encode(s)
    this.i16(enc.length)
    for (const b of enc) this.u8(b)
  }
  payload(node: NbtNode) {
    switch (node.t) {
      case 1: this.i8(node.v); break
      case 2: this.i16(node.v); break
      case 3: this.i32(node.v); break
      case 4: this.i64(node.v); break
      case 5: this.f32(node.v); break
      case 6: this.f64(node.v); break
      case 7: this.i32(node.v.length); for (const b of node.v) this.i8(b); break
      case 8: this.str(node.v); break
      case 9:
        this.u8(node.et); this.i32(node.v.length)
        for (const c of node.v) this.payload(c); break
      case 10:
        for (const [k, c] of node.v) { this.u8(c.t); this.str(k); this.payload(c) }
        this.u8(0); break
      case 11: this.i32(node.v.length); for (const n of node.v) this.i32(n); break
      case 12: this.i32(node.v.length); for (const n of node.v) this.i64(n); break
    }
  }
  bytes() { return new Uint8Array(this.buf) }
}

export function serializeNbt(doc: NbtDocument): Uint8Array {
  const w = new Writer()
  w.u8(10); w.str(doc.name); w.payload(doc.root)
  return w.bytes()
}

export async function serializeNbtGzip(doc: NbtDocument): Promise<Uint8Array> {
  const raw = serializeNbt(doc)
  const cs = new CompressionStream('gzip')
  const writer = cs.writable.getWriter(); writer.write(raw.buffer as ArrayBuffer); writer.close()
  const chunks: Uint8Array[] = []
  const r = cs.readable.getReader()
  while (true) { const { done, value } = await r.read(); if (done) break; chunks.push(value) }
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total); let off = 0
  for (const c of chunks) { out.set(c, off); off += c.length }
  return out
}
