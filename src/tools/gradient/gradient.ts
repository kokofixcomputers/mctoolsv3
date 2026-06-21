export type ColorFormat = 'minimessage' | 'legacy' | 'hex'
export type GradientType = 'rgb' | 'hsv'

export interface GradientStop {
  id: string
  hex: string
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

function hexToHsv(hex: string): [number, number, number] {
  let [r, g, b] = hexToRgb(hex)
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  const s = max === 0 ? 0 : d / max
  const v = max
  if (max !== min) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h /= 6
  }
  return [h, s, v]
}

function hsvToHex(h: number, s: number, v: number): string {
  let r = 0, g = 0, b = 0
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break
    case 1: r = q; g = v; b = p; break
    case 2: r = p; g = v; b = t; break
    case 3: r = p; g = q; b = v; break
    case 4: r = t; g = p; b = v; break
    case 5: r = v; g = p; b = q; break
  }
  return rgbToHex(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255))
}

function lerpColor(c1: string, c2: string, t: number, mode: GradientType): string {
  if (mode === 'hsv') {
    const [h1, s1, v1] = hexToHsv(c1)
    const [h2, s2, v2] = hexToHsv(c2)
    let dh = h2 - h1
    if (dh > 0.5) dh -= 1
    if (dh < -0.5) dh += 1
    return hsvToHex(h1 + dh * t, s1 + (s2 - s1) * t, v1 + (v2 - v1) * t)
  }
  const [r1, g1, b1] = hexToRgb(c1)
  const [r2, g2, b2] = hexToRgb(c2)
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t)
}

export function interpolateColors(stops: string[], count: number, mode: GradientType): string[] {
  if (stops.length === 0 || count === 0) return []
  if (stops.length === 1) return Array(count).fill(stops[0])
  if (count === 1) return [stops[0]]

  const result: string[] = []
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1)
    const seg = t * (stops.length - 1)
    const idx = Math.min(Math.floor(seg), stops.length - 2)
    const local = seg - idx
    result.push(lerpColor(stops[idx], stops[idx + 1], local, mode))
  }
  return result
}

export type TextStyle = { bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean }

export function buildMiniMessage(text: string, stops: string[], gradType: GradientType, _style: TextStyle): string {
  if (!text) return ''
  const colors = stops.map((s) => s.replace('#', ''))
  const colorStr = colors.join(':')
  return `<gradient:${colorStr}>${text}</gradient>`
}

export function buildLegacy(text: string, stops: string[], gradType: GradientType, style: TextStyle): string {
  if (!text) return ''
  const chars = [...text]
  const colors = interpolateColors(stops, chars.length, gradType)
  let prefix = ''
  if (style.bold) prefix += '§l'
  if (style.italic) prefix += '§o'
  if (style.underline) prefix += '§n'
  if (style.strikethrough) prefix += '§m'
  return chars.map((ch, i) => {
    const hex = colors[i].replace('#', '')
    return `${prefix}§x§${hex[0]}§${hex[1]}§${hex[2]}§${hex[3]}§${hex[4]}§${hex[5]}${ch}`
  }).join('')
}

export function buildHex(text: string, stops: string[], gradType: GradientType, _style: TextStyle): string {
  if (!text) return ''
  const chars = [...text]
  const colors = interpolateColors(stops, chars.length, gradType)
  return chars.map((ch, i) => `${colors[i]}${ch}`).join('')
}

export function buildOutput(
  text: string,
  stops: string[],
  format: ColorFormat,
  gradType: GradientType,
  style: TextStyle,
): string {
  switch (format) {
    case 'minimessage': return buildMiniMessage(text, stops, gradType, style)
    case 'legacy': return buildLegacy(text, stops, gradType, style)
    case 'hex': return buildHex(text, stops, gradType, style)
  }
}

export function renderPreviewSegments(
  text: string,
  stops: string[],
  gradType: GradientType,
  style: TextStyle,
): Array<{ char: string; color: string }> {
  const chars = [...text]
  if (!chars.length) return []
  const colors = interpolateColors(stops, chars.length, gradType)
  return chars.map((char, i) => ({ char, color: colors[i] }))
}
