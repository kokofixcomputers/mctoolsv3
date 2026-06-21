import type { NbtDocument, NbtNode, TagId } from './nbtTypes'

class Reader {
  pos = 0
  dv: DataView
  constructor(buf: Uint8Array) {
    this.dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  }
  u8() { return this.dv.getUint8(this.pos++) }
  i8() { return this.dv.getInt8(this.pos++) }
  i16() { const v = this.dv.getInt16(this.pos, false); this.pos += 2; return v }
  i32() { const v = this.dv.getInt32(this.pos, false); this.pos += 4; return v }
  i64() { const v = this.dv.getBigInt64(this.pos, false); this.pos += 8; return v }
  f32() { const v = this.dv.getFloat32(this.pos, false); this.pos += 4; return v }
  f64() { const v = this.dv.getFloat64(this.pos, false); this.pos += 8; return v }
  str() {
    const len = this.dv.getUint16(this.pos, false); this.pos += 2
    const bytes = new Uint8Array(this.dv.buffer, this.dv.byteOffset + this.pos, len)
    this.pos += len
    return new TextDecoder().decode(bytes)
  }
  payload(type: TagId): NbtNode {
    switch (type) {
      case 1: return { t: 1, v: this.i8() }
      case 2: return { t: 2, v: this.i16() }
      case 3: return { t: 3, v: this.i32() }
      case 4: return { t: 4, v: this.i64() }
      case 5: return { t: 5, v: this.f32() }
      case 6: return { t: 6, v: this.f64() }
      case 7: { const len = this.i32(); const arr: number[] = []; for (let i = 0; i < len; i++) arr.push(this.i8()); return { t: 7, v: arr } }
      case 8: return { t: 8, v: this.str() }
      case 9: {
        const et = this.u8() as TagId
        const len = this.i32()
        const v: NbtNode[] = []
        for (let i = 0; i < len; i++) v.push(this.payload(et))
        return { t: 9, et, v }
      }
      case 10: {
        const v: [string, NbtNode][] = []
        while (true) {
          const ct = this.u8()
          if (ct === 0) break
          const name = this.str()
          v.push([name, this.payload(ct as TagId)])
        }
        return { t: 10, v }
      }
      case 11: { const len = this.i32(); const arr: number[] = []; for (let i = 0; i < len; i++) arr.push(this.i32()); return { t: 11, v: arr } }
      case 12: { const len = this.i32(); const arr: bigint[] = []; for (let i = 0; i < len; i++) arr.push(this.i64()); return { t: 12, v: arr } }
      default: throw new Error(`Unknown tag type ${type}`)
    }
  }
}

async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('gzip')
  const w = ds.writable.getWriter(); w.write(data as unknown as Uint8Array<ArrayBuffer>); w.close()
  const chunks: Uint8Array[] = []
  const r = ds.readable.getReader()
  while (true) { const { done, value } = await r.read(); if (done) break; chunks.push(value) }
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total); let off = 0
  for (const c of chunks) { out.set(c, off); off += c.length }
  return out
}

export async function parseNbt(data: Uint8Array): Promise<NbtDocument> {
  let buf = data
  if (data[0] === 0x1f && data[1] === 0x8b) buf = await gunzip(data)
  const r = new Reader(buf)
  const rootType = r.u8()
  if (rootType !== 10) throw new Error(`Root tag must be compound (type 10), got type ${rootType}`)
  const name = r.str()
  const root = r.payload(10) as Extract<NbtNode, { t: 10 }>
  return { name, root }
}
