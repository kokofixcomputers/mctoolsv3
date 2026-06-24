// Stringified NBT parser / serializer

export type SnbtTag =
  | { type: 'byte'; value: number }
  | { type: 'short'; value: number }
  | { type: 'int'; value: number }
  | { type: 'long'; value: number }
  | { type: 'float'; value: number }
  | { type: 'double'; value: number }
  | { type: 'string'; value: string }
  | { type: 'compound'; value: Record<string, SnbtTag> }
  | { type: 'list'; value: SnbtTag[] }
  | { type: 'byte_array'; value: number[] }
  | { type: 'int_array'; value: number[] }
  | { type: 'long_array'; value: number[] }

class Parser {
  pos = 0
  constructor(public src: string) {}

  ws() { while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) this.pos++ }
  peek() { return this.src[this.pos] }
  consume() { return this.src[this.pos++] }
  expect(c: string) {
    this.ws()
    if (this.src[this.pos] !== c) throw new Error(`Expected '${c}' at pos ${this.pos}, got '${this.src[this.pos] ?? 'EOF'}'`)
    this.pos++
  }

  parseTag(): SnbtTag {
    this.ws()
    const c = this.peek()
    if (c === '{') return this.parseCompound()
    if (c === '[') return this.parseList()
    if (c === '"' || c === "'") return { type: 'string', value: this.parseStr() }
    return this.parsePrimitive()
  }

  parseStr(): string {
    const q = this.consume()
    let s = ''

    // If the value looks like an embedded JSON object/array (common in display.Name, Lore, etc.),
    // parse with depth tracking so unescaped inner quotes don't prematurely end the string.
    const first = this.src[this.pos]
    if (first === '{' || first === '[') {
      let depth = 0
      let inStr = false
      let strQ = ''
      while (this.pos < this.src.length) {
        const c = this.src[this.pos++]
        if (inStr) {
          if (c === '\\') { s += c; s += this.src[this.pos++]; continue }
          if (c === strQ) inStr = false
          s += c
        } else {
          if (c === q && depth === 0) return s
          if (c === '"' || c === "'") { inStr = true; strQ = c; s += c; continue }
          if (c === '{' || c === '[') depth++
          else if (c === '}' || c === ']') depth--
          s += c
        }
      }
      throw new Error('Unterminated string')
    }

    // Regular string
    while (this.pos < this.src.length) {
      const c = this.consume()
      if (c === '\\') { s += this.consume(); continue }
      if (c === q) return s
      s += c
    }
    throw new Error('Unterminated string')
  }

  parseUnquoted(): string {
    let s = ''
    while (this.pos < this.src.length && /[^,:{}\[\]\s]/.test(this.src[this.pos])) s += this.src[this.pos++]
    return s
  }

  parsePrimitive(): SnbtTag {
    const s = this.parseUnquoted()
    if (!s) throw new Error(`Unexpected char at pos ${this.pos}: '${this.src[this.pos]}'`)
    const m = s.match(/^(-?\d+(?:\.\d*)?)([bBsSlLfFdD]?)$/)
    if (m) {
      const n = parseFloat(m[1])
      switch (m[2].toLowerCase()) {
        case 'b': return { type: 'byte', value: n }
        case 's': return { type: 'short', value: n }
        case 'l': return { type: 'long', value: n }
        case 'f': return { type: 'float', value: n }
        case 'd': return { type: 'double', value: n }
        default: return m[1].includes('.') ? { type: 'double', value: n } : { type: 'int', value: n }
      }
    }
    return { type: 'string', value: s }
  }

  parseCompound(): Extract<SnbtTag, { type: 'compound' }> {
    this.expect('{')
    const value: Record<string, SnbtTag> = {}
    this.ws()
    if (this.peek() === '}') { this.consume(); return { type: 'compound', value } }
    while (this.pos < this.src.length) {
      this.ws()
      const key = (this.peek() === '"' || this.peek() === "'") ? this.parseStr() : this.parseUnquoted()
      this.ws(); this.expect(':')
      value[key] = this.parseTag()
      this.ws()
      if (this.peek() === '}') { this.consume(); break }
      this.expect(',')
    }
    return { type: 'compound', value }
  }

  parseList(): SnbtTag {
    this.expect('[')
    this.ws()
    if (/[BIL]/i.test(this.peek() ?? '') && this.src[this.pos + 1] === ';') {
      const t = this.consume().toUpperCase()
      this.consume()
      const nums: number[] = []
      this.ws()
      while (this.peek() !== ']') {
        const p = this.parsePrimitive(); nums.push((p as { value: number }).value)
        this.ws(); if (this.peek() === ',') { this.consume(); this.ws() }
      }
      this.expect(']')
      return { type: t === 'B' ? 'byte_array' : t === 'I' ? 'int_array' : 'long_array', value: nums }
    }
    const items: SnbtTag[] = []
    while (this.pos < this.src.length && this.peek() !== ']') {
      items.push(this.parseTag())
      this.ws(); if (this.peek() === ',') { this.consume(); this.ws() }
    }
    this.expect(']')
    return { type: 'list', value: items }
  }
}

export function parseSnbt(s: string): SnbtTag {
  const p = new Parser(s)
  const tag = p.parseTag()
  p.ws()
  if (p.pos < p.src.length) throw new Error(`Unexpected content after tag at pos ${p.pos}: '${p.src.slice(p.pos, p.pos + 10)}'`)
  return tag
}

export function serializeSnbt(tag: SnbtTag): string {
  switch (tag.type) {
    case 'byte': return `${tag.value}b`
    case 'short': return `${tag.value}s`
    case 'int': return String(tag.value)
    case 'long': return `${tag.value}l`
    case 'float': return `${tag.value}f`
    case 'double': return `${tag.value}d`
    case 'string': return qStr(tag.value)
    case 'compound': {
      const e = Object.entries(tag.value).map(([k, v]) => `${/^[a-zA-Z_][\w.]*$/.test(k) ? k : qStr(k)}:${serializeSnbt(v)}`)
      return `{${e.join(',')}}`
    }
    case 'list': return `[${tag.value.map(serializeSnbt).join(',')}]`
    case 'byte_array': return `[B;${tag.value.map(n => n + 'b').join(',')}]`
    case 'int_array': return `[I;${tag.value.join(',')}]`
    case 'long_array': return `[L;${tag.value.map(n => n + 'l').join(',')}]`
  }
}

function qStr(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}
