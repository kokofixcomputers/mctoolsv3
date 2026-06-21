// Minimal NBT writer — big-endian, uncompressed
// Enough to produce a valid WorldEdit sponge schematic v2

const T = {
  END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4,
  FLOAT: 5, DOUBLE: 6, BYTE_ARRAY: 7, STRING: 8,
  LIST: 9, COMPOUND: 10, INT_ARRAY: 11, LONG_ARRAY: 12,
}

export class NbtWriter {
  private buf: number[] = []

  private u8(v: number) { this.buf.push(v & 0xff) }
  private i16(v: number) { this.u8(v >> 8); this.u8(v) }
  private i32(v: number) {
    this.u8(v >> 24); this.u8(v >> 16); this.u8(v >> 8); this.u8(v)
  }
  private i64(hi: number, lo: number) { this.i32(hi); this.i32(lo) }

  private str(s: string) {
    const enc = new TextEncoder().encode(s)
    this.i16(enc.length)
    for (const b of enc) this.u8(b)
  }

  private tagHeader(type: number, name: string) {
    this.u8(type); this.str(name)
  }

  byte(name: string, v: number) { this.tagHeader(T.BYTE, name); this.u8(v) }
  short(name: string, v: number) { this.tagHeader(T.SHORT, name); this.i16(v) }
  int(name: string, v: number) { this.tagHeader(T.INT, name); this.i32(v) }
  long(name: string, hi: number, lo: number) { this.tagHeader(T.LONG, name); this.i64(hi, lo) }
  string(name: string, v: string) { this.tagHeader(T.STRING, name); this.str(v) }

  byteArray(name: string, data: number[]) {
    this.tagHeader(T.BYTE_ARRAY, name)
    this.i32(data.length)
    for (const b of data) this.u8(b)
  }

  intArray(name: string, data: number[]) {
    this.tagHeader(T.INT_ARRAY, name)
    this.i32(data.length)
    for (const v of data) this.i32(v)
  }

  compound(name: string, inner: () => void) {
    this.tagHeader(T.COMPOUND, name)
    inner()
    this.u8(T.END)
  }

  // Empty list (just for spec compliance)
  emptyList(name: string, elementType = T.COMPOUND) {
    this.tagHeader(T.LIST, name)
    this.u8(elementType)
    this.i32(0)
  }

  bytes(): Uint8Array { return new Uint8Array(this.buf) }
}

// Varint encode a non-negative integer (used in BlockData)
export function varint(value: number): number[] {
  const out: number[] = []
  while (true) {
    if ((value & ~0x7f) === 0) { out.push(value); break }
    out.push((value & 0x7f) | 0x80)
    value >>>= 7
  }
  return out
}

// Gzip compress using browser CompressionStream
export async function gzip(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('gzip')
  const w = cs.writable.getWriter()
  w.write(data.buffer as ArrayBuffer); w.close()
  const chunks: Uint8Array[] = []
  const r = cs.readable.getReader()
  while (true) {
    const { done, value } = await r.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) { out.set(c, off); off += c.length }
  return out
}
