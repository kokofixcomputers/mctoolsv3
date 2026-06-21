export interface TextSegment {
  text: string
  bold?: boolean
  italic?: boolean
  underlined?: boolean
  strikethrough?: boolean
  obfuscated?: boolean
  color?: string // #rrggbb
}

export type RichLine = TextSegment[]
export type RichLines = RichLine[]

type CharFmt = Omit<TextSegment, 'text'>

export function lerpColor(a: string, b: string, t: number): string {
  const p = (h: string) => ({
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  })
  const ca = p(a), cb = p(b)
  const r = Math.round(ca.r + (cb.r - ca.r) * t)
  const g = Math.round(ca.g + (cb.g - ca.g) * t)
  const bl = Math.round(ca.b + (cb.b - ca.b) * t)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`
}

export function toSegments(text: string, fmts: CharFmt[]): TextSegment[] {
  if (!text) return []
  const segs: TextSegment[] = []
  let i = 0
  while (i < text.length) {
    const f = fmts[i] ?? {}
    let j = i + 1
    while (j < text.length) {
      const g = fmts[j] ?? {}
      if (
        f.bold === g.bold && f.italic === g.italic && f.underlined === g.underlined &&
        f.strikethrough === g.strikethrough && f.obfuscated === g.obfuscated && f.color === g.color
      ) { j++ } else break
    }
    const seg: TextSegment = { text: text.slice(i, j) }
    if (f.bold) seg.bold = true
    if (f.italic) seg.italic = true
    if (f.underlined) seg.underlined = true
    if (f.strikethrough) seg.strikethrough = true
    if (f.obfuscated) seg.obfuscated = true
    if (f.color) seg.color = f.color
    segs.push(seg)
    i = j
  }
  return segs
}

export function fromSegments(segs: TextSegment[]): { text: string; fmts: CharFmt[] } {
  let text = ''
  const fmts: CharFmt[] = []
  for (const seg of segs) {
    text += seg.text
    const fmt: CharFmt = {}
    if (seg.bold) fmt.bold = true
    if (seg.italic) fmt.italic = true
    if (seg.underlined) fmt.underlined = true
    if (seg.strikethrough) fmt.strikethrough = true
    if (seg.obfuscated) fmt.obfuscated = true
    if (seg.color) fmt.color = seg.color
    for (let i = 0; i < seg.text.length; i++) fmts.push({ ...fmt })
  }
  return { text, fmts }
}

export function segmentStyle(seg: TextSegment): React.CSSProperties {
  const s: React.CSSProperties = {}
  if (seg.color) s.color = seg.color
  if (seg.bold) s.fontWeight = 'bold'
  if (seg.italic) s.fontStyle = 'italic'
  const dec: string[] = []
  if (seg.underlined) dec.push('underline')
  if (seg.strikethrough) dec.push('line-through')
  if (dec.length) s.textDecoration = dec.join(' ')
  return s
}

// Serialize segments to give command JSON (version-aware)
// defaultItalic: true  → Minecraft italicises by default (custom_name)
//   - italic=true on segment  → omit (it's already the MC default)
//   - italic=undefined/false  → emit "italic":false  (explicitly override)
// defaultItalic: false → Minecraft does not italicise (item_name)
//   - italic=true on segment  → emit "italic":true
//   - italic=undefined/false  → emit "italic":false  (be explicit/safe)
export function serializeNameSegs(
  segs: TextSegment[],
  fmt: 'modern-new' | 'modern-old',
  defaultItalic = false,
): string {
  const objs = segs.filter(s => s.text).map(seg => {
    const obj: Record<string, unknown> = { text: seg.text }
    if (defaultItalic) {
      // italic true = MC default, no need to emit; false/undefined = need to disable
      if (!seg.italic) obj.italic = false
    } else {
      // always emit italic; false unless user explicitly set it true
      obj.italic = seg.italic === true ? true : false
    }
    if (seg.color) obj.color = seg.color
    if (seg.bold) obj.bold = true
    if (seg.underlined) obj.underlined = true
    if (seg.strikethrough) obj.strikethrough = true
    if (seg.obfuscated) obj.obfuscated = true
    return obj
  })
  const json = JSON.stringify(objs)
  return fmt === 'modern-new' ? json : `'${json}'`
}

export function serializeLoreSegs(lines: TextSegment[][], fmt: 'modern-new' | 'modern-old'): string {
  const jsonLines = lines
    .map(segs => segs.filter(s => s.text).map(seg => {
      const obj: Record<string, unknown> = { text: seg.text, italic: false }
      if (seg.color) obj.color = seg.color
      if (seg.bold) obj.bold = true
      if (seg.italic) obj.italic = true
      if (seg.underlined) obj.underlined = true
      if (seg.strikethrough) obj.strikethrough = true
      if (seg.obfuscated) obj.obfuscated = true
      return obj
    }))
    .filter(l => l.length > 0)

  if (!jsonLines.length) return ''

  if (fmt === 'modern-new') {
    return `[${jsonLines.map(l => JSON.stringify(l)).join(',')}]`
  } else {
    return `[${jsonLines.map(l => `'${JSON.stringify(l)}'`).join(',')}]`
  }
}
