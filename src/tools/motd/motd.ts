import { interpolateColors, type GradientType } from '../gradient/gradient'

export type MotdFormat = 'vanilla' | 'paper' | 'velocity' | 'simplemotd' | 'legacy'

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function legacyGradientLine(text: string, stops: string[], gradType: GradientType): string {
  if (!text.trim()) return text
  const chars = [...text]
  const colors = interpolateColors(stops, chars.length, gradType)
  return chars.map((ch, i) => {
    const hex = colors[i].replace('#', '')
    return `§x§${hex[0]}§${hex[1]}§${hex[2]}§${hex[3]}§${hex[4]}§${hex[5]}${ch}`
  }).join('')
}

function miniMessageGradientLine(text: string, stops: string[]): string {
  if (!text.trim()) return text
  const colorStr = stops.map((s) => s.replace('#', '')).join(':')
  return `<gradient:${colorStr}>${text}</gradient>`
}

function centerLine(text: string, lineWidth = 53): string {
  const visibleLen = text.replace(/§[0-9a-fklmnorx]/gi, '').replace(/§x(§[0-9a-f]){6}/gi, '').length
  const pad = Math.max(0, Math.floor((lineWidth - visibleLen) / 2))
  return ' '.repeat(pad) + text
}

export interface MotdLine {
  text: string
  useGradient: boolean
  center: boolean
}

export function buildMotd(
  lines: MotdLine[],
  stops: string[],
  gradType: GradientType,
  format: MotdFormat,
  center: boolean,
): string {
  const rendered = lines.map((line) => {
    let t = line.text
    if (line.useGradient && stops.length >= 1) {
      if (format === 'velocity' || format === 'paper' || format === 'simplemotd') {
        t = miniMessageGradientLine(t, stops)
      } else {
        t = legacyGradientLine(t, stops, gradType)
      }
    }
    if ((line.center || center) && (format === 'vanilla' || format === 'legacy')) {
      t = centerLine(t)
    }
    return t
  })

  const joined = rendered.join('\n')

  switch (format) {
    case 'vanilla':
      return `motd=${joined.replace(/\n/g, '\\n')}`
    case 'paper': {
      const yamlLines = rendered.map((l) => `  - "${l.replace(/"/g, '\\"')}"`)
      return `motd:\n${yamlLines.join('\n')}`
    }
    case 'velocity':
      return `motd: "${joined.replace(/\n/g, '\\n').replace(/"/g, '\\"')}"`
    case 'simplemotd':
      return rendered.map((l, i) => `line${i + 1}: "${l.replace(/"/g, '\\"')}"`).join('\n')
    case 'legacy':
      return joined
  }
}

export function renderMotdPreview(
  lines: MotdLine[],
  stops: string[],
  gradType: GradientType,
): Array<Array<{ char: string; color: string }>> {
  return lines.map((line) => {
    const chars = [...line.text]
    if (!chars.length) return []
    if (line.useGradient && stops.length >= 1) {
      const colors = interpolateColors(stops, chars.length, gradType)
      return chars.map((char, i) => ({ char, color: colors[i] }))
    }
    return chars.map((char) => ({ char, color: '#ffffff' }))
  })
}
